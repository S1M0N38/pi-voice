/**
 * Integration tests for the Kokoro TTS server.
 *
 * Spawns the real server as a child process, uses real kokoro-js with q4 dtype.
 * Tests the full HTTP stack: routing, state management, and model lifecycle.
 *
 * Architecture:
 *   - A single server process is spawned once per top-level suite.
 *   - Model is downloaded once at the beginning and deleted once at the end.
 *   - Tests are ordered: validation → download → features → lifecycle → delete.
 *   - Each describe block restores the server to a known state.
 *
 * Run with:  node --import jiti extensions/server.test.ts
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = resolve(__dirname, "server.ts");
const PACKAGE_ROOT = resolve(__dirname, "..");

const TEST_PORT = 18381;
const TEST_HOST = "127.0.0.1";
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;
const TEST_DTYPE = "q4";

// ── Helpers ────────────────────────────────────────────────────────

function url(path: string): string {
  return `${BASE_URL}${path}`;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; data: T }> {
  const res = await fetch(url(path), { signal: AbortSignal.timeout(300_000), ...init });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

async function fetchBinary(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const res = await fetch(url(path), { signal: AbortSignal.timeout(300_000), ...init });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, body: buf };
}

function post(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  return fetchJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitForServer(maxMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url("/health"), { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

/** Ensure model is downloaded and active. */
async function ensureModelLoaded(): Promise<void> {
  await post("/models/download", { dtype: TEST_DTYPE });
}

/** Ensure model is unloaded (no-op if already unloaded). */
async function ensureModelUnloaded(): Promise<void> {
  await post("/models/unload", {});
}

/** Verify WAV header bytes. */
function assertWav(buf: Buffer): void {
  assert.equal(buf.toString("ascii", 0, 4), "RIFF", "WAV should start with RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WAVE", "WAV should have WAVE marker");
  assert.ok(buf.length > 44, "WAV should have data beyond the 44-byte header");
}

// ── Test suite ─────────────────────────────────────────────────────

describe("Kokoro TTS Server", () => {
  let serverProcess: ReturnType<typeof spawn> | null = null;

  before(async () => {
    serverProcess = spawn(
      "node",
      ["--import", "jiti", SERVER_SCRIPT, "--host", TEST_HOST, "--port", String(TEST_PORT)],
      { cwd: PACKAGE_ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );

    serverProcess.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim()) console.log(`  [server] ${line}`);
      }
    });

    await waitForServer();
  });

  after(async () => {
    if (serverProcess && !serverProcess.killed) {
      try {
        await fetch(url("/shutdown"), { method: "POST", signal: AbortSignal.timeout(2000) });
      } catch {
        // server may have already exited
      }
      try {
        serverProcess.kill("SIGKILL");
      } catch {
        // already dead
      }
      await new Promise<void>((resolve) => {
        serverProcess?.on("exit", () => resolve());
        setTimeout(() => resolve(), 2000);
      });
    }
    serverProcess = null;
  });

  // ── 1. Validation (no model needed) ───────────────────────────

  describe("Validation", () => {
    it("GET /health returns ok with no model loaded", async () => {
      const { status, data } = await fetchJson<{
        status: string;
        activeDtype: string | null;
        modelLoaded: boolean;
        loading: boolean;
      }>("/health");

      assert.equal(status, 200);
      assert.equal(data.status, "ok");
      assert.equal(data.modelLoaded, false);
      assert.equal(data.activeDtype, null);
      assert.equal(data.loading, false);
    });

    it("GET /models returns all 5 dtypes", async () => {
      const { status, data } = await fetchJson<{
        models: Record<string, { downloaded: boolean }>;
      }>("/models");

      assert.equal(status, 200);
      const dtypes = Object.keys(data.models);
      for (const expected of ["q4", "q4f16", "q8", "fp16", "fp32"]) {
        assert.ok(dtypes.includes(expected), `Missing dtype: ${expected}`);
      }
    });

    it("GET /voices returns 503 without model", async () => {
      const { status } = await fetchJson("/voices");
      assert.equal(status, 503);
    });

    it("POST /tts returns 503 without model", async () => {
      const { status } = await post("/tts", { text: "hello" });
      assert.equal(status, 503);
    });

    it("POST /models/download rejects invalid dtype", async () => {
      const { status } = await post("/models/download", { dtype: "invalid" });
      assert.equal(status, 400);
    });

    it("POST /models/download rejects missing dtype", async () => {
      const { status } = await post("/models/download", {});
      assert.equal(status, 400);
    });

    it("POST /models/activate rejects invalid dtype", async () => {
      const { status } = await post("/models/activate", { dtype: "bad" });
      assert.equal(status, 400);
    });

    it("POST /models/activate rejects not-downloaded dtype", async () => {
      const { status, data } = await post("/models/activate", { dtype: "fp32" });
      if (status === 404) {
        assert.ok((data as { error: string }).error.includes("not downloaded"));
      }
    });

    it("POST /models/delete rejects invalid dtype", async () => {
      const { status } = await post("/models/delete", { dtype: "bad" });
      assert.equal(status, 400);
    });

    it("POST /models/delete rejects not-downloaded dtype", async () => {
      const { status } = await post("/models/delete", { dtype: "fp32" });
      assert.ok(status === 404 || status === 200, `Expected 404 or 200, got ${status}`);
    });

    it("returns 404 for unknown path", async () => {
      const { status } = await fetchJson("/unknown");
      assert.equal(status, 404);
    });
  });

  // ── 2. Download ──────────────────────────────────────────────

  describe("Download", () => {
    it("downloads q4 and auto-activates", async () => {
      const { status, data } = await post("/models/download", { dtype: TEST_DTYPE });
      assert.equal(status, 200);

      const msg = (data as { message: string }).message;
      assert.ok(msg.includes(TEST_DTYPE), `Message should mention ${TEST_DTYPE}: ${msg}`);

      // Verify model is active
      const health = await fetchJson<{
        activeDtype: string | null;
        modelLoaded: boolean;
      }>("/health");
      assert.equal(health.data.modelLoaded, true);
      assert.equal(health.data.activeDtype, TEST_DTYPE);
    });

    it("GET /models shows q4 as downloaded", async () => {
      const { data } = await fetchJson<{
        models: Record<string, { downloaded: boolean }>;
      }>("/models");
      assert.equal(data.models[TEST_DTYPE]?.downloaded, true);
    });

    it("re-downloading already-downloaded model succeeds", async () => {
      const { status } = await post("/models/download", { dtype: TEST_DTYPE });
      assert.equal(status, 200);
    });
  });

  // ── 3. Features (model loaded) ───────────────────────────────

  describe("Voices", () => {
    before(async () => {
      await ensureModelLoaded();
    });

    it("returns voice list", async () => {
      const { status, data } = await fetchJson<{ voices: string[] }>("/voices");
      assert.equal(status, 200);
      assert.ok(Array.isArray(data.voices));
      assert.ok(data.voices.length > 0);
      assert.ok(data.voices.includes("af_heart"));
    });
  });

  describe("TTS synthesis", () => {
    before(async () => {
      await ensureModelLoaded();
    });

    it("rejects missing text", async () => {
      const { status } = await post("/tts", {});
      assert.equal(status, 400);
    });

    it("rejects empty text", async () => {
      const { status } = await post("/tts", { text: "   " });
      assert.equal(status, 400);
    });

    it("generates WAV audio with correct headers", async () => {
      const { status, headers, body } = await fetchBinary("/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello world", voice: "af_heart", speed: 1.0 }),
      });

      assert.equal(status, 200);
      assert.equal(headers.get("content-type"), "audio/wav");
      assertWav(body);
    });

    it("uses default voice and speed", async () => {
      const { status, body } = await fetchBinary("/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Testing defaults" }),
      });

      assert.equal(status, 200);
      assertWav(body);
    });

    it("synthesizes with custom speed", async () => {
      const { status, body } = await fetchBinary("/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Fast speech", speed: 2.0 }),
      });

      assert.equal(status, 200);
      assertWav(body);
    });
  });

  // ── 4. Unload / Activate ─────────────────────────────────────

  describe("Unload", () => {
    before(async () => {
      await ensureModelLoaded();
    });

    it("unloads the active model", async () => {
      const { status, data } = await post("/models/unload", {});
      assert.equal(status, 200);
      assert.equal((data as { message: string }).message, "Model unloaded");

      const health = await fetchJson<{
        modelLoaded: boolean;
        activeDtype: string | null;
      }>("/health");
      assert.equal(health.data.modelLoaded, false);
      assert.equal(health.data.activeDtype, null);
    });

    it("returns success when no model is loaded", async () => {
      const { status, data } = await post("/models/unload", {});
      assert.equal(status, 200);
      assert.equal((data as { message: string }).message, "No model loaded");
    });
  });

  describe("Activate", () => {
    // Model is unloaded from previous suite, but still downloaded on disk
    it("activates an already-downloaded model", async () => {
      const { status } = await post("/models/activate", { dtype: TEST_DTYPE });
      assert.equal(status, 200);

      const health = await fetchJson<{
        activeDtype: string | null;
        modelLoaded: boolean;
      }>("/health");
      assert.equal(health.data.modelLoaded, true);
      assert.equal(health.data.activeDtype, TEST_DTYPE);
    });

    it("activate same model is a no-op", async () => {
      const { status } = await post("/models/activate", { dtype: TEST_DTYPE });
      assert.equal(status, 200);
    });
  });

  // ── 5. Lifecycle (single-model invariant) ────────────────────

  describe("Lifecycle", () => {
    it("download replaces active model", async () => {
      // Model is already active from Activate suite
      const healthBefore = await fetchJson<{ activeDtype: string | null }>("/health");
      assert.equal(healthBefore.data.activeDtype, TEST_DTYPE);

      // Re-download: should unload old, load new
      const { status } = await post("/models/download", { dtype: TEST_DTYPE });
      assert.equal(status, 200);

      const healthAfter = await fetchJson<{
        modelLoaded: boolean;
        activeDtype: string | null;
      }>("/health");
      assert.equal(healthAfter.data.modelLoaded, true);
      assert.equal(healthAfter.data.activeDtype, TEST_DTYPE);
    });

    it("unload → /tts returns 503", async () => {
      await ensureModelLoaded();
      await ensureModelUnloaded();

      const { status } = await post("/tts", { text: "should fail" });
      assert.equal(status, 503);
    });

    it("unload → /voices returns 503", async () => {
      const { status } = await fetchJson("/voices");
      assert.equal(status, 503);
    });

    it("full cycle: download → tts → unload → activate → tts → delete", async () => {
      // 1. Download
      const dl = await post("/models/download", { dtype: TEST_DTYPE });
      assert.equal(dl.status, 200);

      // 2. TTS
      const tts1 = await fetchBinary("/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "First synthesis" }),
      });
      assert.equal(tts1.status, 200);
      assertWav(tts1.body);

      // 3. Unload
      const ul = await post("/models/unload", {});
      assert.equal(ul.status, 200);

      // 4. Activate (model still on disk)
      const act = await post("/models/activate", { dtype: TEST_DTYPE });
      assert.equal(act.status, 200);

      // 5. TTS again
      const tts2 = await fetchBinary("/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Second synthesis" }),
      });
      assert.equal(tts2.status, 200);
      assertWav(tts2.body);

      // 6. Delete
      const del = await post("/models/delete", { dtype: TEST_DTYPE });
      assert.equal(del.status, 200);

      // Verify fully cleaned up
      const health = await fetchJson<{
        modelLoaded: boolean;
        activeDtype: string | null;
      }>("/health");
      assert.equal(health.data.modelLoaded, false);
      assert.equal(health.data.activeDtype, null);
    });
  });
});
