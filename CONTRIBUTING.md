# Contributing to pi-voice

## Development Setup

```bash
git clone git@github.com:S1M0N38/pi-voice.git
cd pi-voice
npm install
```

Verify everything works:

```bash
npm run typecheck   # TypeScript (tsc --noEmit)
npm run lint        # Biome check
npm test            # Server integration tests (~50s, downloads q4 model on first run)
```

### E2E tests (optional)

E2E tests exercise the full extension stack via PTY automation. They require:

- A running TTS server with a loaded model
- [pilotty](https://github.com/mariozechner/pilotty) installed globally
- A working pi installation with a model

```bash
npm run server       # terminal 1: start server
npm run test:e2e     # terminal 2: run all E2E suites
```

Individual suites: `npm run test:tui`, `npm run test:tts-tool`, `npm run test:auto-tts`.

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript type checking (no emit) |
| `npm run lint` | Check lint + formatting (biome) |
| `npm run lint:fix` | Auto-fix lint + formatting |
| `npm run format` | Format code only (biome) |
| `npm test` | Server integration tests |
| `npm run test:e2e` | Full E2E test suite |
| `npm run server` | Start the TTS server locally |
| `npm run cli` | Run the pi-voice CLI directly |

Before every commit, run:

```bash
npm run typecheck && npm run lint
```

---

## Project Structure

```
extensions/
  index.ts             # pi extension: /voice command, tts tool, auto-TTS events
  server.ts            # HTTP server: Kokoro ONNX model lifecycle + REST API
  server.test.ts       # Server integration tests (node:test, 28 tests)
src/
  cli.ts               # CLI: pi-voice server/model management
  prepare.js           # npm prepare script (writes default config)
tests/
  helpers.sh           # Shared test utilities (assertions, pilotty wrappers)
  run.sh               # E2E test runner
  tui.sh               # /voice TUI tests (18 tests)
  tts-tool.sh          # tts tool invocation tests
  auto-tts.sh          # auto-TTS event handler tests
.agents/skills/
  pi-init/             # Environment health check
  pi-package/          # Extension development patterns
  pi-test/             # E2E testing with pilotty
```

---

## Development Practices

### Conventional commits

All commits use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new voice selector
fix: handle server connection timeout
docs: update CLI reference
chore: bump dependencies
refactor: extract WAV encoding helper
test: add speed validation tests
ci: add node 22 to matrix
```

Scopes are optional: `fix(server): handle port conflict`.

### Rebase-only merge policy

The repo enforces **rebase merges** to maintain a clean linear history. No squash or merge commits.

```bash
gh pr merge <number> --rebase
```

### Automated releases

[release-please](https://github.com/googleapis/release-please) automates versioning and publishing:

1. Push conventional commits to `main`
2. release-please opens a **Release PR** with updated `CHANGELOG.md` + version bump
3. Review and merge the Release PR
4. GitHub Release + `npm publish` happen automatically via CI

The `CHANGELOG.md` is **generated** — never edit it manually. Change descriptions come from conventional commit messages.

### CI

Every push and PR runs type checking + linting via `.github/workflows/ci.yml`. Merges to `main` trigger the release workflow.

---

## Coding Conventions

- **No build step** — pi loads `.ts` via jiti. Never add a compile/bundle step.
- **2-space indentation** — enforced by biome (`biome.json`).
- **Runtime deps in `dependencies`** — `kokoro-js` and `jiti` are runtime. `biome`, `typescript`, `typebox` are dev.
- **Peer deps use `*` range** — pi SDK packages (`@mariozechner/pi-*`, `typebox`) are `peerDependencies: "*"` when the extension is active.
- **Single model in memory** — the server enforces one active model. Every model-swap path calls `unloadModel()` first to dispose ONNX sessions and hint GC.

---

## Agent Skills

pi-voice ships three agent skills in `.agents/skills/` that help coding agents work effectively on this project:

| Skill | When it triggers | What it does |
|-------|------------------|--------------|
| `pi-init` | "init", "setup", "check environment" | Quick health check of dev environment (node, npm, TS, biome, pi, pilotty) |
| `pi-package` | Implementing, reviewing, or planning extension changes | Architecture overview, pi SDK patterns, tool/command/event examples |
| `pi-test` | "test the TUI", "run e2e tests", "test voice" | Pilotty testing workflow, helper function reference, test patterns |

When working with a coding agent, these skills are loaded automatically based on the task. The `AGENTS.md` file in the project root provides the agent with project-specific context and constraints.

---

## PR Checklist

Before submitting a PR:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (or `npm run lint:fix` applied)
- [ ] Conventional commit messages used
- [ ] No secrets, tokens, or `.env` files committed
- [ ] Server tests pass (`npm test`) if server code changed
- [ ] Extension code follows the single-model invariant
