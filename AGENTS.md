# pi-voice — Agent Context

## Quick Reference

| What | Command |
|------|---------|
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Server tests | `npm test` (~50s, real kokoro-js q4) |
| E2E tests | `npm run test:e2e` (needs running server + pilotty) |
| Start server | `npm run server` |
| Verify before commit | `npm run typecheck && npm run lint` |

## Constraints

- **No build step** — pi loads `.ts` via jiti
- **2-space indent** — enforced by biome
- **Single model in memory** — every model-swap path calls `unloadModel()` first, which disposes ONNX sessions
- **Peer deps use `*` range** — pi packages list `@mariozechner/pi-*` and `typebox` as `peerDependencies: "*"`

## Project Layout

```
extensions/
  index.ts             # Extension: /voice command, tts tool, auto-TTS events
  server.ts            # HTTP server: Kokoro ONNX TTS model lifecycle + REST API
  server.test.ts       # Server integration tests (node:test, 28 tests)
src/
  cli.ts               # CLI: pi-voice server/model management
tests/
  helpers.sh           # Shared pilotty test utilities
  run.sh               # E2E test runner (tui, tts-tool, auto-tts)
  tui.sh               # /voice TUI interaction tests
  tts-tool.sh          # tts tool invocation tests
  auto-tts.sh          # Auto-TTS event handler tests
.agents/skills/        # pi-test, pi-init, pi-package skills
```

---

## Architecture

### Server (`extensions/server.ts`)

HTTP server managing the Kokoro ONNX TTS model lifecycle. Binds to `127.0.0.1:8181` by default.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status, active dtype, model loaded |
| GET | `/voices` | Available voice names (model must be loaded) |
| GET | `/models` | All dtypes with download status |
| POST | `/models/download` | Download + auto-activate a dtype |
| POST | `/models/delete` | Delete cached files (unloads if active) |
| POST | `/models/activate` | Load a downloaded model |
| POST | `/models/unload` | Unload model, free memory |
| POST | `/tts` | Synthesize text → WAV audio |
| POST | `/shutdown` | Graceful shutdown |

**Model lifecycle** — `loadModel()` → `unloadModel()` → `downloadModel()` all enforce the single-model invariant. Config persisted at `~/.pi/voice/manifest.json`.

### Extension (`extensions/index.ts`)

- `/voice` command — custom TUI (↑↓ navigate, ←→ cycle values, Enter test, r reset, Esc close)
- `tts` tool — LLM-initiated speech synthesis
- Auto-TTS — listens to `agent_end` events, speaks the last response
- Settings: on/off toggle, voice selector, speed (0.5–3.0)
- Persistence: `~/.pi/voice/config.json` for defaults, session overrides via `pi.appendEntry()`

---

## Testing

### Server Integration Tests

`extensions/server.test.ts` uses `node:test` with the real kokoro-js q4 model. Spawns one server process for the entire suite.

```
Validation (11) → Download (3) → Voices (1) → TTS (5) → Unload (2) → Activate (2) → Lifecycle (4)
```

### E2E Tests (`tests/`)

Pilotty-based PTY automation testing the full extension stack. Requires a running server with a loaded model and a working pi installation.

```bash
npm run server                # start server in one terminal
npm run test:e2e              # run all E2E tests in another
npm run test:tui              # run individual suites
```

---

## Git Conventions

- **Conventional commits** — `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`
- **Rebase merges only** — `gh pr merge <number> --rebase`
- **Release flow** — push to main → release-please opens Release PR → merge → auto publish

---

## Common Pitfalls

- **Memory leaks** — Always `unloadModel()` (→ `tts.model.dispose()`) before loading a new model. Never null without disposing.
- **No build step** — pi loads `.ts` via jiti. Never add a compile step.
- **Runtime deps go in `dependencies`** — not `devDependencies`.
- **`kokoro-js` has no download-only mode** — `from_pretrained()` always loads into memory, so `downloadModel()` must unload first.

---

## Pi Package Docs

When implementing extension features, read the official docs:
- Extensions: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- Skills: `…/docs/skills.md` · Themes: `…/docs/themes.md` · Packages: `…/docs/packages.md`
