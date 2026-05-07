/**
 * Kokoro TTS Server — Persistent HTTP server for the Kokoro ONNX TTS model.
 *
 * Endpoints:
 *   GET  /health             → { status, activeDtype, modelLoaded, loading }
 *   GET  /voices             → { voices: string[] }
 *   GET  /models             → { models: { [dtype]: { downloaded } } }
 *   POST /models/download    → { dtype } → downloads model, blocks until done
 *   POST /models/delete      → { dtype } → removes cached model files
 *   POST /models/activate    → { dtype } → loads model into memory
 *   POST /models/unload      → unloads active model, frees memory
 *   POST /tts                → { text, voice?, speed? } → WAV audio (binary)
 *   POST /shutdown           → { status: "shutting down" }
 *
 * Usage:
 *   node --import jiti extensions/server.ts [--port 8181] [--host 127.0.0.1]
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// ── Configuration ──────────────────────────────────────────────────
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DTYPES = ["q4", "q4f16", "q8", "fp16", "fp32"] as const;
type DType = (typeof DTYPES)[number];

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const HOST = getArg("host", "127.0.0.1");
const PORT = Number.parseInt(getArg("port", "8181"), 10);
const VOICE_DIR = resolve(homedir(), ".pi", "voice");
const MANIFEST_PATH = join(VOICE_DIR, "manifest.json");

// ── Cache ──────────────────────────────────────────────────────────
// Persistent cache outside node_modules — survives npm install cycles.
const CACHE_DIR = join(VOICE_DIR, "cache");

function getOnnxPath(dtype: DType): string {
  // transformers.js stores: cache/<org>/<repo>/onnx/model_<dtype>.onnx
  const parts = MODEL_ID.split("/");
  const org = parts[0] ?? "";
  const repo = parts[1] ?? "";
  return resolve(CACHE_DIR, org, repo, "onnx", `model_${dtype}.onnx`);
}

function isDtypeDownloaded(dtype: DType): boolean {
  return existsSync(getOnnxPath(dtype));
}

// ── Manifest (tracks downloads across server restarts) ─────────────
interface Manifest {
  downloaded: DType[];
}

function loadManifest(): Manifest {
  try {
    if (existsSync(MANIFEST_PATH)) {
      const raw = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
      return { downloaded: raw.downloaded ?? [] };
    }
  } catch {
    /* use defaults */
  }
  return { downloaded: [] };
}

function saveManifest(manifest: Manifest) {
  mkdirSync(VOICE_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function markDownloaded(dtype: DType) {
  const manifest = loadManifest();
  if (!manifest.downloaded.includes(dtype)) {
    manifest.downloaded.push(dtype);
    saveManifest(manifest);
  }
}

function markDeleted(dtype: DType) {
  const manifest = loadManifest();
  manifest.downloaded = manifest.downloaded.filter((d) => d !== dtype);
  saveManifest(manifest);
}

// Sync manifest with actual files on disk.
// Handles both: files deleted externally, and files that exist but aren't tracked.
function syncManifest(): Manifest {
  const manifest = loadManifest();
  // Remove entries whose files are gone
  const stillExist = manifest.downloaded.filter((d) => isDtypeDownloaded(d));
  // Discover any untracked files on disk
  const tracked = new Set(stillExist);
  for (const dtype of DTYPES) {
    if (!tracked.has(dtype) && isDtypeDownloaded(dtype)) {
      stillExist.push(dtype);
    }
  }
  if (
    stillExist.length !== manifest.downloaded.length ||
    stillExist.some((d, i) => d !== manifest.downloaded[i])
  ) {
    saveManifest({ downloaded: stillExist });
  }
  return { downloaded: stillExist };
}

// ── State ──────────────────────────────────────────────────────────
let KokoroTTS: typeof import("kokoro-js").KokoroTTS = null as never;
let tts: import("kokoro-js").KokoroTTS | null = null;
let activeDtype: DType | null = null;
let loading = false;

async function importKokoro() {
  if (KokoroTTS) return;
  const mod = await import("kokoro-js");
  KokoroTTS = mod.KokoroTTS;
}

// ── Model lifecycle ────────────────────────────────────────────────
// Ensures only one model is ever in memory at a time.

async function unloadModel(): Promise<void> {
  if (!tts) return;
  const oldDtype = activeDtype;
  try {
    console.log(`[pi-voice] Disposing model (${oldDtype}) ...`);
    await tts.model.dispose();
  } catch (err) {
    console.warn(
      `[pi-voice] Error disposing model: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  tts = null;
  activeDtype = null;
  // Hint GC to reclaim ONNX/WASM memory
  if (typeof global.gc === "function") {
    global.gc();
  }
  console.log(`[pi-voice] Model unloaded (${oldDtype}).`);
}

async function loadModel(dtype: DType): Promise<import("kokoro-js").KokoroTTS> {
  await importKokoro();

  if (tts && activeDtype === dtype) return tts;
  if (loading) throw new Error("Model is currently loading, please retry");

  if (!isDtypeDownloaded(dtype)) {
    throw new Error(
      `Model dtype "${dtype}" is not downloaded. Download it first via /models/download.`,
    );
  }

  loading = true;
  try {
    // Unload current model first to free memory before loading the new one
    await unloadModel();

    console.log(`[pi-voice] Loading model: ${MODEL_ID} (dtype=${dtype}) ...`);
    const { env } = await import("@huggingface/transformers");
    env.cacheDir = CACHE_DIR;
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device: "cpu",
    });
    activeDtype = dtype;
    const voiceCount = Object.keys(tts.voices).length;
    console.log(`[pi-voice] Model loaded (${dtype}). ${voiceCount} voices available.`);
    return tts;
  } finally {
    loading = false;
  }
}

async function downloadModel(dtype: DType): Promise<void> {
  await importKokoro();

  console.log(`[pi-voice] Downloading model: ${MODEL_ID} (dtype=${dtype}) ...`);
  const { env } = await import("@huggingface/transformers");
  env.cacheDir = CACHE_DIR;
  const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype,
    device: "cpu",
  });
  console.log(`[pi-voice] Download complete (${dtype}).`);
  markDownloaded(dtype);

  // Unload the current model first, then activate the new one
  // (only one model in memory at a time)
  await unloadModel();
  tts = instance;
  activeDtype = dtype;
  console.log(`[pi-voice] Auto-activated ${dtype}.`);
}

async function downloadOnlyModel(dtype: DType): Promise<void> {
  await importKokoro();

  console.log(`[pi-voice] Downloading model (no activate): ${MODEL_ID} (dtype=${dtype}) ...`);
  const { env } = await import("@huggingface/transformers");
  env.cacheDir = CACHE_DIR;
  const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype,
    device: "cpu",
  });
  console.log(`[pi-voice] Download complete (${dtype}). Disposing temporary instance...`);
  markDownloaded(dtype);

  // Immediately dispose — kokoro-js always loads into memory,
  // so we release it right away to keep the single-model invariant.
  try {
    await instance.model.dispose();
  } catch (err) {
    console.warn(
      `[pi-voice] Error disposing download instance: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof global.gc === "function") {
    global.gc();
  }
  console.log(`[pi-voice] Model ${dtype} saved to disk (not activated).`);
}

// ── Helpers ────────────────────────────────────────────────────────
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function isValidDtype(value: string): value is DType {
  return DTYPES.includes(value as DType);
}

// ── Route handlers ─────────────────────────────────────────────────
function handleHealth(_req: IncomingMessage, res: ServerResponse) {
  json(res, {
    status: "ok",
    activeDtype,
    modelLoaded: tts !== null,
    loading,
  });
}

async function handleVoices(_req: IncomingMessage, res: ServerResponse) {
  if (!tts) {
    json(res, { error: "Model not loaded" }, 503);
    return;
  }
  json(res, { voices: Object.keys(tts.voices) });
}

function handleModels(_req: IncomingMessage, res: ServerResponse) {
  syncManifest();
  const models: Record<string, { downloaded: boolean }> = {};
  for (const dtype of DTYPES) {
    models[dtype] = { downloaded: isDtypeDownloaded(dtype) };
  }
  json(res, { models });
}

async function handleModelsDownload(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req));
    const dtype = body.dtype as string;
    const activate = body.activate !== false; // default: true

    if (!dtype || !isValidDtype(dtype)) {
      json(res, { error: `Invalid dtype. Must be one of: ${DTYPES.join(", ")}` }, 400);
      return;
    }

    if (isDtypeDownloaded(dtype)) {
      markDownloaded(dtype);
      if (activate) {
        try {
          await loadModel(dtype);
        } catch (err) {
          console.warn(
            `[pi-voice] Activate failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      json(res, { message: `Model ${dtype} already downloaded`, dtype });
      return;
    }

    if (activate) {
      await downloadModel(dtype);
    } else {
      await downloadOnlyModel(dtype);
    }
    json(res, { message: `Model ${dtype} downloaded successfully`, dtype });
  } catch (err) {
    console.error("[pi-voice] Download error:", err);
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleModelsDelete(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req));
    const dtype = body.dtype as string;

    if (!dtype || !isValidDtype(dtype)) {
      json(res, { error: `Invalid dtype. Must be one of: ${DTYPES.join(", ")}` }, 400);
      return;
    }

    if (!isDtypeDownloaded(dtype)) {
      json(res, { error: `Model ${dtype} is not downloaded` }, 404);
      return;
    }

    // Unload and dispose if it's the active model
    if (activeDtype === dtype) {
      await unloadModel();
    }

    // Delete the ONNX file
    const onnxPath = getOnnxPath(dtype);
    if (existsSync(onnxPath)) {
      rmSync(onnxPath, { force: true });
    }
    markDeleted(dtype);
    console.log(`[pi-voice] Deleted model: ${dtype}`);
    json(res, { message: `Model ${dtype} deleted`, dtype });
  } catch (err) {
    console.error("[pi-voice] Delete error:", err);
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleModelsActivate(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse(await readBody(req));
    const dtype = body.dtype as string;

    if (!dtype || !isValidDtype(dtype)) {
      json(res, { error: `Invalid dtype. Must be one of: ${DTYPES.join(", ")}` }, 400);
      return;
    }

    if (!isDtypeDownloaded(dtype)) {
      json(res, { error: `Model ${dtype} is not downloaded. Download it first.` }, 404);
      return;
    }

    await loadModel(dtype);
    json(res, { message: `Model ${dtype} activated`, dtype });
  } catch (err) {
    console.error("[pi-voice] Activate error:", err);
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleModelsUnload(_req: IncomingMessage, res: ServerResponse) {
  try {
    if (!tts) {
      json(res, { message: "No model loaded" });
      return;
    }
    await unloadModel();
    json(res, { message: "Model unloaded" });
  } catch (err) {
    console.error("[pi-voice] Unload error:", err);
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ── TTS request queue (serializes /tts calls — one synthesis at a time) ────
let ttsQueueTail: Promise<void> = Promise.resolve();
let ttsQueueDepth = 0;

function enqueueTTS<T>(
  label: string,
  _req: IncomingMessage,
  res: ServerResponse,
  fn: () => Promise<T>,
): Promise<T> {
  ttsQueueDepth++;
  const depth = ttsQueueDepth;
  console.log(`[pi-voice] Queue: enqueued "${label}" (depth=${depth})`);

  // Track real client disconnect via the response close event.
  // Note: req.destroyed is always true after readBody() consumes the stream,
  // so it cannot be used to detect actual disconnects.
  let disconnected = false;
  const onClose = () => {
    disconnected = true;
  };
  res.on("close", onClose);

  return new Promise<T>((resolve, reject) => {
    ttsQueueTail = ttsQueueTail.then(async () => {
      ttsQueueDepth--;
      res.removeListener("close", onClose);

      // Client disconnected while waiting — skip synthesis
      if (disconnected) {
        console.log(`[pi-voice] Queue: skipping "${label}" (client disconnected)`);
        reject(new Error("Client disconnected"));
        return;
      }

      console.log(`[pi-voice] Queue: processing "${label}"`);
      try {
        resolve(await fn());
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function handleTTS(req: IncomingMessage, res: ServerResponse) {
  try {
    // Read the body outside the queue so the request is fully consumed
    // before entering the queue (avoids hanging on slow clients).
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody);
    const text = (body.text as string | undefined)?.trim();
    const label = text ? `"${text.slice(0, 40)}${text.length > 40 ? "..." : ""}"` : "(empty)";

    const result = await enqueueTTS(label, req, res, async () => {
      if (!tts || !activeDtype) {
        return {
          error: "No model loaded. Download and activate a model first.",
          status: 503,
        } as const;
      }

      if (!text) {
        return { error: "Missing or empty 'text' field", status: 400 } as const;
      }

      const voice = (body.voice as string) || "af_heart";
      const speed = Number(body.speed ?? 1.0);

      console.log(
        `[pi-voice] Synthesizing: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}" (voice=${voice}, speed=${speed}, dtype=${activeDtype})`,
      );

      const audio = await tts.generate(text, {
        voice: voice as keyof typeof tts.voices,
        speed,
      });
      const samples = audio.audio as Float32Array;
      const sampleRate = audio.sampling_rate;
      return { wav: float32ToWav(samples, sampleRate) } as const;
    });

    if ("error" in result) {
      json(res, { error: result.error }, result.status);
    } else {
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": result.wav.length,
      });
      res.end(result.wav);
    }
  } catch (err) {
    // Don't log client disconnect as an error — it's expected behavior
    if (err instanceof Error && err.message === "Client disconnected") {
      return;
    }
    console.error("[pi-voice] TTS error:", err);
    if (!res.headersSent) {
      json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
}

function handleShutdown(req: IncomingMessage, res: ServerResponse) {
  json(res, { status: "shutting down" });
  console.log("[pi-voice] Shutdown requested");
  req.socket.destroy();
  process.exit(0);
}

// ── WAV encoder (Float32 → 16-bit PCM) ────────────────────────────
function float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(s * 0x7fff), offset);
    offset += 2;
  }

  return buffer;
}

// ── Server ─────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const path = url.pathname;

    if (path === "/health" && req.method === "GET") {
      return handleHealth(req, res);
    }
    if (path === "/voices" && req.method === "GET") {
      return await handleVoices(req, res);
    }
    if (path === "/models" && req.method === "GET") {
      return handleModels(req, res);
    }
    if (path === "/models/download" && req.method === "POST") {
      return await handleModelsDownload(req, res);
    }
    if (path === "/models/delete" && req.method === "POST") {
      return await handleModelsDelete(req, res);
    }
    if (path === "/models/activate" && req.method === "POST") {
      return await handleModelsActivate(req, res);
    }
    if (path === "/models/unload" && req.method === "POST") {
      return await handleModelsUnload(req, res);
    }
    if (path === "/tts" && req.method === "POST") {
      return await handleTTS(req, res);
    }
    if (path === "/shutdown" && req.method === "POST") {
      return handleShutdown(req, res);
    }

    json(res, { error: "Not found" }, 404);
  } catch (err) {
    console.error("[pi-voice] Unhandled error:", err);
    if (!res.headersSent) {
      json(res, { error: "Internal server error" }, 500);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[pi-voice] Server listening on http://${HOST}:${PORT}`);
  console.log(`[pi-voice] Cache dir: ${CACHE_DIR}`);
  console.log("[pi-voice] Use /models to see available models");
});
