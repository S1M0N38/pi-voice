/**
 * pi-voice extension — /voice command and tts tool.
 *
 * TUI settings (via /voice):
 *   - TTS enabled/disabled (toggle)
 *   - Voice selector (fetched from server when model is loaded)
 *   - Speed selector (0.5 – 3.0)
 *
 * Persistence:
 *   - Global defaults: ~/.pi/voice.json
 *   - Session overrides: pi.appendEntry("voice-session", ...)
 *
 * Auto-TTS events:
 *   - Configured via events: Record<string, { prompt: string }> in ~/.pi/voice.json
 *   - Default: agent_end with last_message context
 *   - Any event name can be used; presence in config = enabled
 *   - Context is always last_message from the event data
 *   - Uses summaryModel if configured, otherwise falls back to active session model
 *
 * Agent tool:
 *   - tts: converts text → WAV via the TTS server, plays it.
 *     Uses session overrides > global defaults.
 */

import { exec as execCb } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";
import { Type } from "typebox";

// ── Types ──────────────────────────────────────────────────────────

interface SummaryModelConfig {
  provider: string;
  id: string;
}

interface EventConfig {
  prompt: string;
}

interface FullVoiceConfig {
  enabled: boolean;
  voice: string;
  speed: number;
  host: string;
  port: number;
  summaryModel?: SummaryModelConfig;
  events?: Record<string, EventConfig>;
}

interface VoiceSessionState {
  enabled?: boolean;
  voice?: string;
  speed?: number;
}

// ── Event Types (exported) ──────────────────────────────────────

export type VoiceSpeakSource = "tool" | "auto" | "sample";

export interface VoiceConfigEvent {
  enabled: boolean;
  voice: string;
  speed: number;
}

export interface VoiceSpeakStartEvent {
  text: string;
  voice: string;
  speed: number;
  source: VoiceSpeakSource;
}

export interface VoiceSpeakEndEvent {
  text: string;
  source: VoiceSpeakSource;
  error?: string;
}

export interface VoiceEventMap {
  "voice:config": VoiceConfigEvent;
  "voice:speak_start": VoiceSpeakStartEvent;
  "voice:speak_end": VoiceSpeakEndEvent;
}

// ── Configuration Schema (TypeBox) ───────────────────────────────

const SummaryModelSchema = Type.Object({
  provider: Type.String({ minLength: 1 }),
  id: Type.String({ minLength: 1 }),
});

const EventConfigSchema = Type.Object({
  prompt: Type.String({ minLength: 1 }),
});

const _VoiceConfigSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: true })),
  voice: Type.Optional(Type.String({ default: "af_heart" })),
  speed: Type.Optional(Type.Number({ minimum: 0.5, maximum: 3.0, default: 1.0 })),
  host: Type.Optional(Type.String({ default: "127.0.0.1" })),
  port: Type.Optional(Type.Number({ minimum: 1, maximum: 65535, default: 8181 })),
  summaryModel: Type.Optional(SummaryModelSchema),
  events: Type.Optional(Type.Record(Type.String(), EventConfigSchema)),
});

// ── Constants ──────────────────────────────────────────────────────

const CONFIG_PATH = resolve(homedir(), ".pi", "voice.json");
const SPEED_VALUES = [
  "0.5",
  "0.75",
  "1.0",
  "1.25",
  "1.5",
  "1.75",
  "2.0",
  "2.25",
  "2.5",
  "2.75",
  "3.0",
];

const DEFAULT_SUMMARY_PROMPT =
  "You are preparing text for a text-to-speech system. " +
  "You will receive a message from a conversation enclosed in quadruple backticks. " +
  "Summarize it in one single very short sentence, two at most. " +
  "Use a dry, matter-of-fact tone. " +
  "Do not use any markdown formatting, just plain text. " +
  "Prefer words over symbols or abbreviations, as this will be read aloud. " +
  "Output only the sentence, nothing else.";

function speedToIndex(speed: number): number {
  const idx = SPEED_VALUES.findIndex((s) => Number.parseFloat(s) === speed);
  return idx >= 0 ? idx : 0;
}

function voiceHint(name: string): string {
  const langMap: Record<string, string> = {
    a: "American",
    b: "British",
    j: "Japanese",
    z: "Mandarin",
    e: "Spanish",
    f: "French",
    h: "Hindi",
    i: "Italian",
    p: "Brazilian",
  };
  const genderMap: Record<string, string> = { f: "female", m: "male" };
  const lang = langMap[name[0]] ?? "";
  const gender = genderMap[name[1]] ?? "";
  if (lang && gender) return `${lang} ${gender}`;
  if (gender) return gender;
  return lang;
}

const DEFAULT_CONFIG: FullVoiceConfig = {
  enabled: true,
  voice: "af_heart",
  speed: 1.0,
  host: "127.0.0.1",
  port: 8181,
  events: {
    agent_end: {
      prompt: DEFAULT_SUMMARY_PROMPT,
    },
  },
};

// ── Config file persistence (~/.pi/voice.json) ────────────────────

function loadConfig(): FullVoiceConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      // Do NOT merge with DEFAULT_CONFIG — only what the user has written runs.
      // If events is missing from user config, no auto-TTS events fire.
      return {
        enabled: raw.enabled ?? DEFAULT_CONFIG.enabled,
        voice: raw.voice ?? DEFAULT_CONFIG.voice,
        speed: raw.speed ?? DEFAULT_CONFIG.speed,
        host: raw.host ?? DEFAULT_CONFIG.host,
        port: raw.port ?? DEFAULT_CONFIG.port,
        summaryModel: raw.summaryModel,
        events: raw.events,
      };
    }
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: FullVoiceConfig) {
  const dir = resolve(homedir(), ".pi");
  mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

// ── Context Extraction ────────────────────────────────────────────

/**
 * Extract last_message text from event data.
 * Handles both single-message events (turn_end, message_end)
 * and multi-message events (agent_end).
 */
function extractLastMessage(event: any): string {
  // agent_end has event.messages (array)
  if (event.messages && Array.isArray(event.messages) && event.messages.length > 0) {
    const lastMsg = event.messages[event.messages.length - 1];
    return extractTextContent(lastMsg?.content);
  }
  // turn_end, message_end have event.message
  return extractTextContent(event.message?.content);
}

function extractTextContent(content: any[] | undefined): string {
  if (!content) return "";
  return content
    .filter((c: any): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

// ── Event Processing ───────────────────────────────────────────────

async function generateSpeechText(
  prompt: string,
  context: string,
  ctx: ExtensionContext,
  summaryModel?: SummaryModelConfig,
): Promise<string | null> {
  try {
    // Resolve model: explicit summaryModel > active session model
    const model = summaryModel
      ? ctx.modelRegistry.find(summaryModel.provider, summaryModel.id)
      : ctx.model;
    if (!model) {
      if (summaryModel) {
        console.warn(
          `[pi-voice] Summary model not found: ${summaryModel.provider}/${summaryModel.id}`,
        );
      } else {
        console.warn("[pi-voice] No active model available for speech generation.");
      }
      return null;
    }

    const userMessage = context
      ? `The following is a message from a conversation that you need to summarize:\n\n""""\n${context}\n""""`
      : "Generate speech text.";

    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: resolve(homedir(), ".pi"),
      systemPromptOverride: () => prompt,
    });
    await loader.reload();

    const { session } = await createAgentSession({
      model,
      tools: [],
      sessionManager: SessionManager.inMemory(),
      authStorage: AuthStorage.create(),
      modelRegistry: ctx.modelRegistry,
      resourceLoader: loader,
    });

    try {
      let responseText = "";

      const unsub = session.subscribe((event) => {
        if (event.type === "message_end" && event.message.role === "assistant") {
          for (const part of event.message.content) {
            if (part.type === "text" && part.text) {
              responseText += part.text;
            }
          }
        }
      });

      await session.prompt(userMessage);
      unsub();

      return responseText || null;
    } finally {
      session.dispose();
    }
  } catch (error) {
    console.warn("[pi-voice] Error generating speech text:", error);
    return null;
  }
}

// ── Extension ──────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let defaults = loadConfig();
  let session: VoiceSessionState = {};
  let currentCtx: ExtensionContext | undefined;

  function getEffective(): FullVoiceConfig {
    return {
      enabled: session.enabled ?? defaults.enabled,
      voice: session.voice ?? defaults.voice,
      speed: session.speed ?? defaults.speed,
      host: defaults.host,
      port: defaults.port,
      summaryModel: defaults.summaryModel,
      events: defaults.events,
    };
  }

  function serverUrl(): string {
    return `http://${defaults.host}:${defaults.port}`;
  }

  function persistSession() {
    pi.appendEntry<VoiceSessionState>("voice-session", { ...session });
  }

  function restoreSession(ctx: ExtensionContext) {
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      if (entry.type === "custom" && entry.customType === "voice-session") {
        const data = entry.data as VoiceSessionState | undefined;
        if (data) session = { ...data };
      }
    }
    defaults = loadConfig();
  }

  // ── Audio playback queue ────────────────────────────────────────

  // Serializes audio playback so tts tool and auto-TTS never overlap.
  type QueueItem = {
    play: () => Promise<void>;
  };

  let audioQueue: QueueItem[] = [];
  let audioPlaying = false;

  function drainAudioQueue(): void {
    if (audioPlaying) return;
    const item = audioQueue.shift();
    if (!item) return;
    audioPlaying = true;
    item
      .play()
      .catch(() => {})
      .finally(() => {
        audioPlaying = false;
        drainAudioQueue();
      });
  }

  function enqueueAudio(item: QueueItem): void {
    audioQueue.push(item);
    drainAudioQueue();
  }

  // ── Speak + Auto-TTS (closured over pi) ─────────────────────

  // Queued speak — fetches TTS audio and enqueues it for sequential playback.
  async function speak(
    text: string,
    config: FullVoiceConfig,
    source: VoiceSpeakSource,
  ): Promise<void> {
    const startEvent: VoiceSpeakStartEvent = {
      text,
      voice: config.voice,
      speed: config.speed,
      source,
    };
    pi.events.emit("voice:speak_start", startEvent);

    try {
      const body = {
        text,
        voice: config.voice,
        speed: config.speed,
      };

      const res = await fetch(`http://${config.host}:${config.port}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error: string };
        throw new Error(errData.error);
      }

      const wavBuffer = Buffer.from(await res.arrayBuffer());
      const outPath = join(homedir(), ".pi", `voice-${Date.now()}.wav`);
      mkdirSync(resolve(homedir(), ".pi"), { recursive: true });
      writeFileSync(outPath, wavBuffer);

      enqueueAudio({
        play: () =>
          new Promise<void>((resolve) => {
            const cmd = process.platform === "darwin" ? "afplay" : "aplay";
            execCb(`${cmd} "${outPath}"`, { timeout: 30_000 }, (err) => {
              if (err) console.warn("[pi-voice] Playback error:", err);
              const endEvent: VoiceSpeakEndEvent = {
                text,
                source,
                ...(err ? { error: err.message } : {}),
              };
              pi.events.emit("voice:speak_end", endEvent);
              try {
                unlinkSync(outPath);
              } catch {
                /* ignore */
              }
              resolve();
            });
          }),
      });
    } catch (error) {
      console.warn("[pi-voice] TTS error:", error);
      const endEvent: VoiceSpeakEndEvent = {
        text,
        source,
        error: error instanceof Error ? error.message : String(error),
      };
      pi.events.emit("voice:speak_end", endEvent);
    }
  }

  async function handleAutoTTS(
    eventName: string,
    event: any,
    ctx: ExtensionContext,
    config: FullVoiceConfig,
  ): Promise<void> {
    try {
      if (!config.enabled) return;
      if (!config.events?.[eventName]) return;
      // summaryModel is optional — falls back to ctx.model

      const eventConfig = config.events[eventName];
      const context = extractLastMessage(event);
      if (!context) return;

      const text = await generateSpeechText(eventConfig.prompt, context, ctx, config.summaryModel);
      if (!text) return;

      await speak(text, config, "auto");
    } catch (error) {
      console.warn("[pi-voice] Auto-TTS error:", error);
    }
  }

  // ── Server API helpers ─────────────────────────────────────────

  async function fetchHealth() {
    try {
      const res = await fetch(`${serverUrl()}/health`);
      if (!res.ok) return null;
      return (await res.json()) as {
        status: string;
        activeDtype: string | null;
        modelLoaded: boolean;
        loading: boolean;
      };
    } catch {
      return null;
    }
  }

  async function fetchVoices(): Promise<string[]> {
    const res = await fetch(`${serverUrl()}/voices`);
    if (!res.ok) return [];
    const data = (await res.json()) as { voices: string[] };
    return data.voices;
  }

  // ── /voice command ─────────────────────────────────────────────

  pi.registerCommand("voice", {
    description: "Configure TTS voice and speed",
    handler: async (_args, ctx) => {
      const effective = getEffective();

      const health = await fetchHealth();
      let voices: string[] = [];
      if (health?.modelLoaded) {
        try {
          voices = await fetchVoices();
        } catch {
          voices = [];
        }
      }

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        let enabled = effective.enabled;
        let voiceIdx = voices.length > 0 ? Math.max(0, voices.indexOf(effective.voice)) : -1;
        let speedIdx = speedToIndex(effective.speed);
        let selectedRow = 0;
        let playing = false;
        let playError: string | null = null;
        let feedback: string | null = null;

        const rowDefs: Array<{ id: string }> = [
          { id: "enabled" },
          ...(voices.length > 0 ? [{ id: "voice" }] : []),
          { id: "speed" },
        ];

        const sampleText = "The quick brown fox jumps over the lazy dog.";

        function emitConfig() {
          pi.events.emit("voice:config", {
            enabled,
            voice: voices.length > 0 ? voices[voiceIdx] : defaults.voice,
            speed: Number.parseFloat(SPEED_VALUES[speedIdx]),
          });
        }

        async function playSampleTts() {
          const voice = voices.length > 0 ? voices[voiceIdx] : defaults.voice;
          const speed = Number.parseFloat(SPEED_VALUES[speedIdx]);
          pi.events.emit("voice:speak_start", {
            text: sampleText,
            voice,
            speed,
            source: "sample",
          });
          try {
            const res = await fetch(`${serverUrl()}/tts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: sampleText,
                voice,
                speed,
              }),
            });
            if (!res.ok) {
              const errData = (await res.json()) as { error: string };
              throw new Error(errData.error || "Server error");
            }
            const wavBuffer = Buffer.from(await res.arrayBuffer());
            const outPath = join(homedir(), ".pi", "voice-sample.wav");
            mkdirSync(resolve(homedir(), ".pi"), { recursive: true });
            writeFileSync(outPath, wavBuffer);
            const cmd = process.platform === "darwin" ? "afplay" : "aplay";
            await new Promise<void>((resolve, reject) => {
              execCb(`${cmd} "${outPath}"`, { timeout: 30_000 }, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            pi.events.emit("voice:speak_end", { text: sampleText, source: "sample" });
          } catch (error) {
            pi.events.emit("voice:speak_end", {
              text: sampleText,
              source: "sample",
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }

        return {
          render(_width: number) {
            const lines: string[] = [];

            // Title
            lines.push(theme.fg("accent", theme.bold("Voice")));

            // Server status
            const statusText = health
              ? health.modelLoaded
                ? `● Server running (${health.activeDtype})`
                : health.loading
                  ? "◐ Server loading…"
                  : "○ Server up (no model)"
              : "✗ Server not detected";
            const statusColor = health?.modelLoaded
              ? "success"
              : health?.loading
                ? "warning"
                : health
                  ? "dim"
                  : "dim";
            lines.push(`  ${theme.fg(statusColor, statusText)}`);
            const serverHint = health?.modelLoaded
              ? theme.fg("dim", "  pi-voice server stop to stop")
              : health
                ? theme.fg("dim", "  pi-voice server start to start")
                : theme.fg("dim", "  pi-voice server start to start");
            lines.push(serverHint);

            // Active events
            const activeEvents = effective.events ? Object.keys(effective.events) : [];
            if (activeEvents.length > 0) {
              lines.push(`  ${theme.fg("dim", `Events: ${activeEvents.join(", ")}`)}`);
            }

            // Setting rows
            for (let i = 0; i < rowDefs.length; i++) {
              const row = rowDefs[i];
              const selected = i === selectedRow;
              const cursor = selected ? "→" : " ";

              if (row.id === "enabled") {
                const val = enabled ? "on" : "off";
                const left = selected ? "◂ " : "  ";
                const right = selected ? " ▸" : "";
                lines.push(`${cursor} TTS    ${left}${val}${right}`);
              } else if (row.id === "voice") {
                const val = voices[voiceIdx] ?? "";
                const hint = voiceHint(val);
                const left = selected ? "◂ " : "  ";
                const right = selected ? " ▸" : "";
                lines.push(
                  `${cursor} Voice  ${left}${val}${right} ${theme.fg("dim", `(${hint})`)}`,
                );
              } else if (row.id === "speed") {
                const val = SPEED_VALUES[speedIdx];
                const left = selected ? "◂ " : "  ";
                const right = selected ? " ▸" : "";
                lines.push(`${cursor} Speed  ${left}${val}${right}`);
              }
            }

            lines.push("");

            if (playing) {
              lines.push(`  ${theme.fg("warning", "▶ Playing sample…")}`);
            } else if (playError) {
              lines.push(`  ${theme.fg("error", `✗ ${playError}`)}`);
            } else if (feedback) {
              lines.push(`  ${theme.fg("success", feedback)}`);
            }

            lines.push(
              theme.fg("dim", " ↑↓ navigate • ←→ change • s save default • r reset • esc close"),
            );

            return lines;
          },
          invalidate() {},
          handleInput(data: string) {
            if (matchesKey(data, "escape")) {
              persistSession();
              done(undefined);
              return;
            }

            if (playError) playError = null;
            if (feedback) feedback = null;

            if (playing) return;

            if (matchesKey(data, "s")) {
              const voice = voices.length > 0 ? voices[voiceIdx] : defaults.voice;
              const speed = Number.parseFloat(SPEED_VALUES[speedIdx]);
              defaults = { ...defaults, enabled, voice, speed };
              saveConfig(defaults);
              feedback = "✓ Saved as default";
              _tui.requestRender();
              return;
            }

            if (matchesKey(data, "r")) {
              session = {};
              // Write full defaults (including agent_end event) back to disk
              saveConfig({ ...DEFAULT_CONFIG });
              defaults = loadConfig();
              persistSession();
              enabled = defaults.enabled;
              voiceIdx = voices.length > 0 ? Math.max(0, voices.indexOf(defaults.voice)) : -1;
              speedIdx = speedToIndex(defaults.speed);
              emitConfig();
              feedback = "✓ Reset to defaults";
              _tui.requestRender();
              return;
            }

            if (matchesKey(data, "up")) {
              selectedRow = (selectedRow - 1 + rowDefs.length) % rowDefs.length;
              _tui.requestRender();
              return;
            }
            if (matchesKey(data, "down")) {
              selectedRow = (selectedRow + 1) % rowDefs.length;
              _tui.requestRender();
              return;
            }

            const rowId = rowDefs[selectedRow]?.id;

            if (matchesKey(data, "left") || matchesKey(data, "right")) {
              const dir = matchesKey(data, "right") ? 1 : -1;
              if (rowId === "enabled") {
                enabled = !enabled;
                session.enabled = enabled;
              } else if (rowId === "voice" && voices.length > 0) {
                voiceIdx = (voiceIdx + dir + voices.length) % voices.length;
                session.voice = voices[voiceIdx];
              } else if (rowId === "speed") {
                speedIdx = (speedIdx + dir + SPEED_VALUES.length) % SPEED_VALUES.length;
                const speed = Number.parseFloat(SPEED_VALUES[speedIdx]);
                session.speed = speed;
              }
              persistSession();
              emitConfig();
              _tui.requestRender();
              return;
            }

            if (matchesKey(data, "enter")) {
              playing = true;
              playError = null;
              _tui.requestRender();
              playSampleTts()
                .then(() => {
                  playing = false;
                  _tui.requestRender();
                })
                .catch((err: unknown) => {
                  playing = false;
                  playError = err instanceof Error ? err.message : String(err);
                  _tui.requestRender();
                });
              return;
            }
          },
        };
      });
    },
  });

  // ── tts tool ─────────────────────────────────────────────────

  pi.registerTool({
    name: "tts",
    label: "Text to Speech",
    description:
      "Convert text to speech audio using the Kokoro TTS server. Saves a WAV file and plays it.",
    promptSnippet: "Convert text to speech and play audio",
    promptGuidelines: [
      "Use tts when the user wants to hear text spoken aloud or convert text to audio.",
    ],
    parameters: Type.Object({
      text: Type.String({ description: "Text to convert to speech" }),
      voice: Type.Optional(
        Type.String({ description: "Voice name (defaults to configured voice)" }),
      ),
      speed: Type.Optional(
        Type.Number({
          description: "Speech speed 0.5-3.0 (defaults to configured speed)",
          minimum: 0.5,
          maximum: 3.0,
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const effective = getEffective();

      if (!effective.enabled) {
        return {
          content: [
            {
              type: "text" as const,
              text: "TTS is currently disabled. Use /voice to enable it.",
            },
          ],
          details: {},
        };
      }

      const voice = params.voice ?? effective.voice;
      const speed = params.speed ?? effective.speed;

      speak(params.text, { ...effective, voice, speed }, "tool").catch(() => {
        /* errors already logged inside speak */
      });

      const preview = params.text.length > 80 ? `${params.text.slice(0, 80)}…` : params.text;
      return {
        content: [{ type: "text" as const, text: `Speaking: "${preview}"` }],
        details: {},
      };
    },
  });

  // ── Status bar ────────────────────────────────────────────────

  function updateStatusBar() {
    if (!currentCtx) return;
    const effective = getEffective();
    const theme = currentCtx.ui.theme;
    const icon = effective.enabled ? theme.fg("success", "\u266A") : theme.fg("dim", "\u266A");
    currentCtx.ui.setStatus("pi-voice", icon);
  }

  // ── Session lifecycle ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    restoreSession(ctx);
    updateStatusBar();
  });

  pi.on("session_tree", async (_event, ctx) => {
    currentCtx = ctx;
    restoreSession(ctx);
    updateStatusBar();
  });

  // Update status bar on voice:config events (from TUI, alt+v, etc.)
  pi.events.on("voice:config", () => {
    updateStatusBar();
  });

  // ── Global toggle shortcut (alt+v) ────────────────────────────

  pi.registerShortcut("alt+v", {
    description: "Toggle TTS on/off",
    handler: async (ctx) => {
      const effective = getEffective();
      const next = !effective.enabled;
      session.enabled = next;
      persistSession();
      ctx.ui.notify(`TTS ${next ? "enabled" : "disabled"}`, "info");
      pi.events.emit("voice:config", {
        enabled: next,
        voice: effective.voice,
        speed: effective.speed,
      });
    },
  });

  // ── Auto-TTS event handlers ─────────────────────────────────────

  // Register handlers for events that carry message data.
  // Each handler checks at runtime if the event is configured.

  pi.on("agent_end", async (event, ctx) => {
    const effective = getEffective();
    handleAutoTTS("agent_end", event, ctx, effective).catch((err) =>
      console.warn("[pi-voice] Auto-TTS error:", err),
    );
  });

  pi.on("turn_end", async (event, ctx) => {
    const effective = getEffective();
    handleAutoTTS("turn_end", event, ctx, effective).catch((err) =>
      console.warn("[pi-voice] Auto-TTS error:", err),
    );
  });

  pi.on("message_end", async (event, ctx) => {
    const effective = getEffective();
    handleAutoTTS("message_end", event, ctx, effective).catch((err) =>
      console.warn("[pi-voice] Auto-TTS error:", err),
    );
  });
}
