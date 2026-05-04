/**
 * pi-voice extension — /voice command and tts tool.
 *
 * TUI settings (via /voice):
 *   - TTS enabled/disabled (toggle)
 *   - Voice selector (fetched from server when model is loaded)
 *   - Speed selector (0.5 – 2.0)
 *
 * Persistence:
 *   - Global defaults: ~/.pi/voice.json
 *   - Session overrides: pi.appendEntry("voice-session", ...)
 *
 * Agent tool:
 *   - tts: converts text → WAV via the TTS server, plays it.
 *     Uses session overrides > global defaults.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";

// ── Types ──────────────────────────────────────────────────────────

interface VoiceConfig {
  enabled: boolean;
  voice: string;
  speed: number;
  host: string;
  port: number;
}

interface VoiceSessionState {
  enabled?: boolean;
  voice?: string;
  speed?: number;
}

// ── Constants ──────────────────────────────────────────────────────

const CONFIG_PATH = resolve(homedir(), ".pi", "voice.json");
const SPEED_VALUES = ["0.5", "0.75", "1.0", "1.25", "1.5", "1.75", "2.0"];

const DEFAULT_CONFIG: VoiceConfig = {
  enabled: true,
  voice: "af_heart",
  speed: 1.0,
  host: "127.0.0.1",
  port: 8181,
};

// ── Config file persistence (~/.pi/voice.json) ────────────────────

function loadConfig(): VoiceConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch {
    /* use defaults */
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: VoiceConfig) {
  const dir = resolve(homedir(), ".pi");
  mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

// ── Extension ──────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Global defaults from ~/.pi/voice.json
  let defaults = loadConfig();

  // Session-level overrides (restored from branch entries)
  let session: VoiceSessionState = {};

  // Resolve effective settings: session override > global default
  function getEffective(): VoiceConfig {
    return {
      enabled: session.enabled ?? defaults.enabled,
      voice: session.voice ?? defaults.voice,
      speed: session.speed ?? defaults.speed,
      host: defaults.host,
      port: defaults.port,
    };
  }

  function serverUrl(): string {
    return `http://${defaults.host}:${defaults.port}`;
  }

  // Persist session state to session file
  function persistSession() {
    pi.appendEntry<VoiceSessionState>("voice-session", { ...session });
  }

  // Restore session state from the current branch
  function restoreSession(ctx: ExtensionContext) {
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      if (entry.type === "custom" && entry.customType === "voice-session") {
        const data = entry.data as VoiceSessionState | undefined;
        if (data) session = { ...data };
      }
    }
    // Also reload defaults in case the user edited ~/.pi/voice.json
    defaults = loadConfig();
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
    description: "Configure TTS voice, speed, and on/off toggle",
    handler: async (_args, ctx) => {
      const effective = getEffective();

      // Probe server status
      const health = await fetchHealth();
      let voices: string[] = [];
      if (health?.modelLoaded) {
        try {
          voices = await fetchVoices();
        } catch {
          voices = [];
        }
      }

      // Build settings items
      const items: SettingItem[] = [
        {
          id: "enabled",
          label: "TTS",
          currentValue: effective.enabled ? "on" : "off",
          values: ["on", "off"],
        },
      ];

      // Voice selector — only if server has model loaded and voices available
      if (voices.length > 0) {
        const currentVoice = voices.includes(effective.voice) ? effective.voice : voices[0];
        items.push({
          id: "voice",
          label: "Voice",
          currentValue: currentVoice,
          values: voices,
        });
      }

      items.push({
        id: "speed",
        label: "Speed",
        currentValue: String(effective.speed),
        values: SPEED_VALUES,
      });

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const container = new Container();

        // Title
        container.addChild(new Text(theme.fg("accent", theme.bold("Voice")), 1, 0));

        // Server status label
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

        container.addChild(new Text(`  ${theme.fg(statusColor, statusText)}`, 1, 0));

        container.addChild(new Text("", 0, 0));

        const settingsList = new SettingsList(
          items,
          Math.min(items.length + 2, 15),
          getSettingsListTheme(),
          (id: string, newValue: string) => {
            if (id === "enabled") {
              session.enabled = newValue === "on";
            } else if (id === "voice") {
              session.voice = newValue;
              defaults.voice = newValue;
              saveConfig(defaults);
            } else if (id === "speed") {
              const speed = Number.parseFloat(newValue);
              session.speed = speed;
              defaults.speed = speed;
              saveConfig(defaults);
            }
            persistSession();
          },
          () => done(undefined),
        );

        container.addChild(settingsList);
        container.addChild(
          new Text(theme.fg("dim", "↑↓ navigate • enter toggle • esc close"), 1, 0),
        );

        return {
          render(width: number) {
            return container.render(width);
          },
          invalidate() {
            container.invalidate();
          },
          handleInput(data: string) {
            settingsList.handleInput?.(data);
            _tui.requestRender();
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
          description: "Speech speed 0.5-2.0 (defaults to configured speed)",
          minimum: 0.5,
          maximum: 2.0,
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

      try {
        const body: Record<string, unknown> = {
          text: params.text,
          voice: params.voice ?? effective.voice,
          speed: params.speed ?? effective.speed,
        };

        const res = await fetch(`${serverUrl()}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = (await res.json()) as { error: string };
          return {
            content: [{ type: "text" as const, text: `TTS error: ${errData.error}` }],
            isError: true,
            details: {},
          };
        }

        // Save WAV to ~/.pi/voice-output.wav
        const wavBuffer = Buffer.from(await res.arrayBuffer());
        const outPath = join(homedir(), ".pi", "voice-output.wav");
        mkdirSync(resolve(homedir(), ".pi"), { recursive: true });
        writeFileSync(outPath, wavBuffer);

        // Play audio
        try {
          const cmd = process.platform === "darwin" ? "afplay" : "aplay";
          execSync(`${cmd} "${outPath}"`, { timeout: 30_000 });
        } catch (playErr) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Audio saved to ${outPath} (playback: ${playErr instanceof Error ? playErr.message : String(playErr)})`,
              },
            ],
            details: {},
          };
        }

        const preview = params.text.length > 80 ? `${params.text.slice(0, 80)}…` : params.text;
        return {
          content: [{ type: "text" as const, text: `Spoke: "${preview}"` }],
          details: {},
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `TTS error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // ── Session lifecycle ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    restoreSession(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreSession(ctx);
  });
}
