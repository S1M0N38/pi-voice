---
name: pi-test
description: >
  Test pi-voice TUI, tts tool, and auto-TTS using pilotty for PTY-based terminal
  automation. Use when the user wants to test, verify, or validate the /voice command
  UI, the tts tool, auto-TTS event handling, or any pi-voice extension behavior.
  Also use when the user says "test the TUI", "run e2e tests", "test voice",
  "run pilotty", or asks about testing pi-voice. Do not use for server integration
  tests (npm test), linting, type checking, or server-only testing.
compatibility: Requires pilotty (npm install -g pilotty), a running TTS server with loaded model, and a working pi installation with a model.
allowed-tools: Bash read edit write
---

# Pi-voice E2E Testing with Pilotty

Test pi-voice's extension stack (TUI, tts tool, auto-TTS) via PTY-based terminal automation.

## Prerequisites

```bash
npm run server                              # start TTS server (default: 127.0.0.1:8181)
curl -sf http://127.0.0.1:8181/health      # verify model is loaded
which pilotty                               # verify pilotty is installed
```

All tests require the server running with a loaded model **before** spawning pi.

## Test Suites

| Script | What it tests | Run |
|--------|---------------|-----|
| `tests/tui.sh` | /voice command: navigate, toggle, cycle, reset, close | `npm run test:tui` |
| `tests/tts-tool.sh` | tts tool: agent invokes tool, WAV file created | `npm run test:tts-tool` |
| `tests/auto-tts.sh` | Auto-TTS: agent_end fires exactly 1 POST /tts | `npm run test:auto-tts` |
| `tests/run.sh` | All three suites | `npm run test:e2e` |

## Test Architecture

- `tests/helpers.sh` — shared utilities: assertions, pilotty wrappers, session lifecycle, server checks
- Each test: sources helpers → spawns pi → interacts → asserts → cleans up
- Config is backed up and restored around each test to avoid side effects
- `auto-tts.sh` uses a counting HTTP proxy to verify exact request counts

## Core Workflow

Every test follows this pattern:

```bash
source "$(dirname "$0")/helpers.sh"    # load utilities
require_server                         # verify server + model
# ... backup config ...
spawn_pi                               # pilotty spawn --name ... --cwd "$PACKAGE_DIR"
wait_for_pi                            # wait for [Skills] indicator

HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
TEXT=$(await_change_and_snapshot_text "$HASH" 500 5000)

assert_match "description" "pattern" "$TEXT"
# ... interact ...
kill_session
# ... restore config ...
print_summary
```

## Helper Functions (tests/helpers.sh)

### Assertions
- `assert_match DESC PATTERN TEXT` — grep for pattern in text
- `assert_no_match DESC PATTERN TEXT` — assert pattern absent
- `assert_equals DESC EXPECTED ACTUAL` — exact string equality
- `assert_not_empty DESC VALUE` — value is non-empty

### Pilotty wrappers
- `snapshot_text()` — snapshot as plain text (strips header)
- `snapshot_json()` — full JSON snapshot
- `snapshot_content_hash()` — hash for change detection
- `wait_for_change HASH [SETTLE] [TIMEOUT]` — block until screen changes
- `await_change_and_snapshot_text HASH [SETTLE] [TIMEOUT]` — wait + snapshot
- `send_key KEY` / `send_type TEXT` — keyboard input

### Session lifecycle
- `spawn_pi()` — spawn pi with extension loaded in pilotty session
- `wait_for_pi [TIMEOUT]` — wait for `[Skills]` indicator
- `kill_session()` — kill pilotty session
- `require_server()` — verify server is running with model loaded (exits if not)

### Server
- `require_server()` — checks `$SERVER_URL/health`, verifies `modelLoaded === true`

## /voice TUI Key Mapping

| Action | Key | pilotty command |
|--------|-----|-----------------|
| Navigate settings | ↑/↓ | `send_key Up` / `send_key Down` |
| Change value | ←/→ | `send_key Left` / `send_key Right` |
| Play sample | Enter | `send_key Enter` |
| Reset to defaults | r | `send_key r` |
| Close | Escape | `send_key Escape` |

## TUI Assertions

The /voice TUI renders these elements for assertion:
- `→ TTS` / `→ Voice` / `→ Speed` — cursor indicator on active row
- `on` / `off` — TTS toggle state
- `af_heart` / `af_alloy` — voice names with nationality/gender hints
- `Speed 1.0` — speed value
- `Server running` — status indicator
- `navigate` / `←→ change` / `r reset` — keybinding hints
- `Playing sample…` — temporary playback indicator

## Adding New Tests

Create `tests/new-feature.sh`:

```bash
#!/bin/bash
source "$(dirname "$0")/helpers.sh"

echo -e "${BOLD}  pi-voice New Feature Test  ${RESET}"

require_server
# ... backup config if needed ...

spawn_pi
wait_for_pi

# ... test logic using helpers ...

kill_session
# ... restore config ...
print_summary
```

Then add to `tests/run.sh`'s default `TESTS` array and add a script entry in `package.json`:
```json
"test:new-feature": "bash tests/new-feature.sh"
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server not running | `npm run server` in a separate terminal |
| Model not loaded | `curl -X POST http://127.0.0.1:8181/models/download -d '{"dtype":"q4"}'` |
| Pi won't start | Increase timeout: `wait_for_pi 30000` |
| TUI doesn't appear | Longer settle: `await_change_and_snapshot_text "$HASH" 1000 10000` |
| Session not found | `pilotty list-sessions` — sessions cleaned up on exit |
| WAV file missing | `speak()` deletes after playback — expected for tts-tool tests |
| Proxy port conflict | `lsof -ti:18181 \| xargs kill -9` (auto-tts test) |
