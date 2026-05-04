---
name: pi-test
description: >
  Test pi package TUI components using pilotty for PTY-based terminal automation.
  Use when the user wants to test, verify, or validate TUI components built with
  pi-tui in their pi package — interactive selectors, overlays, dialogs, custom
  editors, status indicators, or any ctx.ui.custom() output. Also use when the user
  says "test the TUI", "verify the UI renders", "check my component", "run pilotty",
  "test my extension's UI", or asks about TUI testing strategies for pi packages.
  Do not use for unit testing non-TUI code, linting, type checking, server tests,
  or testing tools that only return text without rendering a TUI.
compatibility: Requires pilotty (npm install -g pilotty). macOS or Linux. No Windows support.
allowed-tools: Bash read edit write
---

# Pi Package TUI Testing with Pilotty

Test TUI components built with `@mariozechner/pi-tui` inside a pi package. Pilotty provides PTY-based terminal automation — it spawns terminal applications in background sessions, captures screen state as structured data, and sends keyboard/mouse input programmatically.

## Prerequisites

```bash
which pilotty    # verify pilotty is installed
npm run typecheck && npm run lint   # verify package loads without errors
```

## Core Workflow

Every TUI test follows the same pattern:

1. **Spawn pi** with the package loaded in a pilotty PTY session
2. **Wait for readiness** — pi shows a prompt or status line when loaded
3. **Trigger the TUI** — invoke a slash command or tool that renders your component
4. **Capture a snapshot** — verify the rendered output
5. **Interact** — send keyboard input to exercise the component
6. **Verify again** — snapshot after interaction to confirm state changed correctly
7. **Clean up** — kill the session

### Spawn pi

```bash
pilotty spawn --name tui-test --cwd /path/to/package -- pi -ne -e . --no-session
```

Key flags:
- `--name tui-test` — named session for targeting with `-s tui-test`
- `--cwd /path/to/package` — run in the package directory so `-e .` works
- `-ne` — no globally installed extensions (avoids interference)
- `-e .` — load only this package's extensions
- `--no-session` — fresh session, no session file

### Wait for pi to be ready

```bash
pilotty wait-for -s tui-test "[Skills]" -t 10000
```

Pi shows a startup info screen with `[Skills]`, `[Prompts]`, `[Extensions]`, `[Themes]` sections when ready.

### Trigger the TUI component

For slash commands:

```bash
HASH=$(pilotty snapshot -s tui-test | jq -r '.content_hash')
pilotty type -s tui-test "/pick"
pilotty key -s tui-test Enter
pilotty snapshot -s tui-test --await-change "$HASH" --settle 100
```

For tool-triggered TUIs:

```bash
HASH=$(pilotty snapshot -s tui-test | jq -r '.content_hash')
pilotty type -s tui-test "Call the settings tool"
pilotty key -s tui-test Enter
pilotty snapshot -s tui-test --await-change "$HASH" --settle 500
```

### Capture and verify snapshot

```bash
pilotty snapshot -s tui-test           # structured JSON
pilotty snapshot -s tui-test --format text  # human-readable
```

JSON snapshot structure:

```json
{
  "snapshot_id": 42,
  "size": { "cols": 80, "rows": 24 },
  "cursor": { "row": 5, "col": 10, "visible": true },
  "text": "full screen text content",
  "elements": [
    { "kind": "button", "row": 1, "col": 9, "width": 4, "text": "[OK]", "confidence": 0.8 }
  ],
  "content_hash": 12345678901234567890
}
```

### Interact with the component

```bash
pilotty key -s tui-test Down       # navigate
pilotty key -s tui-test Up
pilotty key -s tui-test Enter      # select
pilotty key -s tui-test Escape     # cancel/close
pilotty key -s tui-test Tab        # tab between elements
pilotty type -s tui-test "query"   # type text
```

Always capture a hash before interaction and use `--await-change` after:

```bash
HASH=$(pilotty snapshot -s tui-test | jq -r '.content_hash')
pilotty key -s tui-test Down
pilotty snapshot -s tui-test --await-change "$HASH" --settle 50
```

### Clean up

```bash
pilotty kill -s tui-test    # kill session
pilotty stop                # stop the entire daemon
```

## Snapshot Verification Strategies

### Text content verification

```bash
pilotty snapshot -s tui-test | jq -r '.text' | grep -q "Pick an Option"
```

### Element verification

```bash
pilotty snapshot -s tui-test | jq '.elements[] | select(.kind == "button")'
```

### Content hash for change detection

```bash
HASH1=$(pilotty snapshot -s tui-test | jq -r '.content_hash')
pilotty key -s tui-test Down
pilotty snapshot -s tui-test --await-change "$HASH1" --settle 50
HASH2=$(pilotty snapshot -s tui-test | jq -r '.content_hash')
# If HASH1 != HASH2, the screen changed
```

## Key Mapping for Pi TUI

| Action | Key | pilotty command |
|--------|-----|-----------------|
| Navigate list | ↑/↓ | `pilotty key Up` / `pilotty key Down` |
| Select item | Enter | `pilotty key Enter` |
| Cancel/close | Escape | `pilotty key Escape` |
| Tab between items | Tab | `pilotty key Tab` |
| Search in SelectList | Type text | `pilotty type "query"` |
| Scroll | Page Up/Down | `pilotty key PageUp` / `pilotty key PageDown` |
| Toggle setting | Enter | `pilotty key Enter` |
| Abort pi | Ctrl+C | `pilotty key Ctrl+C` |

## Important: Don't Send Enter Without a TUI Open

Pi treats Enter as "submit prompt" when the editor is focused. If you send `pilotty key Enter` before a TUI component is displayed, pi will process whatever is in the editor as a prompt — which can trigger the agent and disrupt your test session.

Only send Enter after confirming a TUI is visible via snapshot:

```bash
# Good: type command + Enter (pi processes the slash command)
pilotty type -s tui-test "/my-command"
pilotty key -s tui-test Enter

# Bad: sending random Enter keys before the TUI appears
pilotty key -s tui-test Enter  # This submits an empty prompt!
```

If you accidentally trigger the agent, wait for it to finish:

```bash
HASH=$(pilotty snapshot -s tui-test | jq -r '.content_hash')
pilotty snapshot -s tui-test --await-change "$HASH" --settle 3000 -t 60000
```

## Snapshot Text vs Styled Elements

The snapshot `text` field strips ANSI escape codes. Styled UI elements (like pi's `[ ]` prompt) may show as empty space. For verifying styled elements:

- **Cursor position** — Check `.cursor` in the JSON snapshot
- **Element detection** — Check `.elements` array for detected buttons, inputs, toggles
- **Text format** — Use `--format text` for visual debugging with cursor indicator `▌`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Pi doesn't start | Increase timeout: `pilotty wait-for -s tui-test "[Skills]" -t 20000` |
| TUI doesn't appear | Longer settle: `--await-change "$HASH" --settle 500 -t 10000` |
| Wrong screen | Wait for hash change, check with `--format text` |
| Session not found | `pilotty list-sessions` — sessions are cleaned up on process exit |

## Reference Files

- `references/TEST_PATTERNS.md` — Ready-to-use test scripts for common pi TUI component patterns
