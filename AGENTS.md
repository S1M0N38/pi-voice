# pi-voice — Agent Context

## Project Overview

**pi-voice** — Give a voice to your Pi agent.

pi-voice is an HTTP server for Kokoro ONNX TTS inference. It manages model downloads, loading, and audio synthesis through a REST API. Eventually it will ship as a pi package with a `/voice` TUI command for interactive control.

### Current State: Server + Extension + CLI

The codebase includes the core TTS server, the pi extension (TUI `/voice` command + `tts` tool), and a CLI for server management.

```
extensions/
  index.ts             # Extension entry point (/voice command, tts tool)
  server.ts            # Persistent HTTP server for Kokoro ONNX TTS model
  server.test.ts       # Integration tests (node:test, real kokoro-js q4)
src/
  cli.ts               # CLI for server/model management (pi-voice)
package.json           # Dependencies, scripts
biome.json             # Linter/formatter config
tsconfig.json          # Type checking only (noEmit)
```

### Future: Full Pi Package

Remaining items to add:

```
skills/voice/SKILL.md  # On-demand skill instructions
prompts/voice.md       # Slash-command prompt template
themes/voice.json      # Theme with all 51 color tokens
```

### Key Constraints

- **No build step** — pi loads `.ts` via jiti. Never add a build/compile step.
- **Peer dependencies** — When adding the pi extension back, list `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-agent-core`, `typebox` as `peerDependencies` with `"*"` range. Do not bundle them.
- **2-space indentation** — Enforced by biome.
- **Single model in memory** — The server enforces a strict invariant: at most one model is loaded at any time. Every code path that replaces the active model calls `unloadModel()` first, which disposes ONNX sessions and hints GC.

---

## Architecture

### Server (`extensions/server.ts`)

Persistent HTTP server that manages the Kokoro ONNX TTS model lifecycle.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status, active dtype, model loaded, loading state |
| GET | `/voices` | Available voice names (requires model loaded) |
| GET | `/models` | All dtypes with downloaded status |
| POST | `/models/download` | Download + auto-activate a model dtype |
| POST | `/models/delete` | Delete cached model files (unloads if active) |
| POST | `/models/activate` | Load a downloaded model into memory |
| POST | `/models/unload` | Unload active model, free memory |
| POST | `/tts` | Synthesize text → WAV audio |
| POST | `/shutdown` | Graceful shutdown |

**Model lifecycle (single-model invariant):**
- `loadModel()` — calls `unloadModel()` before loading, ensures only one model in memory
- `downloadModel()` — calls `unloadModel()` first, then activates the new model
- `unloadModel()` — disposes ONNX sessions via `tts.model.dispose()`, nulls state, hints GC
- `handleModelsDelete()` — calls `unloadModel()` if deleting the active model

**Configuration:** `~/.pi/manifest.json` tracks downloaded dtypes across restarts.

**Usage:**
```bash
npm run server                              # default: 127.0.0.1:8181
npm run server -- --host 0.0.0.0 --port 9090  # custom host/port
```

---

## Git and PR Conventions

- **Conventional commits** — `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:` prefixes. Releases are automated via release-please.
- **Rebase merges only** — The repo does not allow squash or merge commits. Always use:
  ```bash
  gh pr merge <number> --rebase
  ```

---

## Development Commands

```bash
npm run typecheck      # TypeScript type checking (tsc --noEmit)
npm run lint           # Check lint + formatting (biome check)
npm run lint:fix       # Auto-fix lint + formatting issues (biome check --write)
npm run format         # Format code only (biome format --write)
npm test               # Integration tests (spawns real server, real kokoro-js q4 model)
npm run server         # Start the server locally
```

---

## Server Integration Tests

The test suite (`extensions/server.test.ts`) uses `node:test` with the **real kokoro-js** library and **q4** model dtype. It spawns the server as a child process and hits all HTTP endpoints via `fetch`.

```bash
npm test               # ~50s, downloads q4 model on first run
```

**Test architecture:**
- A single server process is spawned once for the entire suite (not per-test).
- Model is downloaded once at the start and deleted in the final lifecycle test.
- Tests are ordered: validation → download → features → lifecycle → cleanup.

**Test suites (28 tests):**

| Suite | Tests | What it covers |
|-------|-------|----------------|
| Validation | 11 | Input validation, 400/404/503 on invalid or missing state |
| Download | 3 | Download + auto-activate, idempotent re-download |
| Voices | 1 | Voice list when model is loaded |
| TTS synthesis | 5 | Missing/empty text, WAV generation, defaults, custom speed |
| Unload | 2 | Unload active model, unload when already unloaded |
| Activate | 2 | Activate downloaded model, activate already-active model |
| Lifecycle | 4 | Download-replaces-model, unload→503, full cycle (download→tts→unload→activate→tts→delete) |

---

## Agentic Development Loop

### Step 1: Understand the Requirement

Clarify what the user needs. Read relevant pi docs before implementing extension features:
- Extensions: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- Skills: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
- Themes: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/themes.md`
- Packages: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`

### Step 2: Implement

**Server** (`extensions/server.ts`):
- Pure Node.js HTTP server, no pi dependencies
- Model lifecycle via `loadModel()`, `unloadModel()`, `downloadModel()`
- WAV encoding inline (Float32 → 16-bit PCM)

**Extension** (`extensions/index.ts`):
- `/voice` command with custom TUI (↑↓ navigate, ←→ cycle values, Enter test, r reset, Esc close)
- `tts` tool for LLM-initiated speech synthesis
- Settings: TTS on/off, voice selector with nationality/gender hints, speed (0.5–3.0)
- Persistence: `~/.pi/voice.json` for defaults, session overrides via `pi.appendEntry()`

### Step 3: Verify

```bash
npm run typecheck && npm run lint
```

### Step 4: Test

```bash
npm test                # Server integration tests
```

For TUI testing, use the **pi-test** skill:
```bash
pilotty spawn --name voice-test --cwd . -- pi -ne -e . --no-session
pilotty wait-for -s voice-test "[Skills]" -t 10000
pilotty type -s voice-test "/voice" && pilotty key -s voice-test Enter
pilotty snapshot -s voice-test --format text  # verify rendered TUI
```

### Step 5: Commit

Conventional commit format: `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`

---

## Release Flow

1. Push conventional commits to `main`
2. release-please opens a Release PR with updated `CHANGELOG.md` + version bump
3. Merge the Release PR → GitHub Release + `npm publish` happen automatically

---

## Common Pitfalls

- **Memory leaks** — Always call `unloadModel()` (which calls `tts.model.dispose()`) before loading a new model. Never set `tts = null` without disposing ONNX sessions first.
- **No build step** — pi loads `.ts` via jiti. Never add a build/compile step.
- **Peer deps use `*` range** — When adding pi extension back, peer dependencies must use `"*"`, not `"^0.70.0"` etc.
- **Adding runtime deps as devDependencies** — Runtime npm packages go in `dependencies`, not `devDependencies`.
- **`kokoro-js` has no download-only mode** — `KokoroTTS.from_pretrained()` always loads the model into memory. That's why `downloadModel()` activates the model and must unload the previous one first.
