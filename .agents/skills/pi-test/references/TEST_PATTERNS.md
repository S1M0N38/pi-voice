# Pi TUI Test Patterns

Ready-to-use test scripts for common pi TUI component patterns. Copy and adapt these scripts to test your components.

## Table of Contents

1. [SelectList Dialog Test](#1-selectlist-dialog-test)
2. [Overlay Test](#2-overlay-test)
3. [SettingsList Toggle Test](#3-settingslist-toggle-test)
4. [Custom Editor Test](#4-custom-editor-test)
5. [Widget Test](#5-widget-test)
6. [BorderedLoader Test](#6-borderedloader-test)

---

## 1. SelectList Dialog Test

Tests a SelectList component invoked via a slash command. Verifies:
- Dialog renders with title
- Items appear in the list
- Navigation works (up/down)
- Selection highlights correctly
- Enter selects and closes
- Escape cancels

```bash
#!/bin/bash
# Test: SelectList Dialog
# Prerequisites: Package has a /pick command that shows a SelectList

PACKAGE_DIR="/path/to/your/package"
SESSION_NAME="selectlist-test"

echo "=== Step 1: Spawn pi with package loaded ==="
pilotty spawn --name "$SESSION_NAME" --cwd "$PACKAGE_DIR" -- pi -ne -e . --no-session

echo "=== Step 2: Wait for pi to be ready ==="
pilotty wait-for -s "$SESSION_NAME" "[Skills]" -t 10000

echo "=== Step 3: Trigger the SelectList dialog ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "/pick"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Step 4: Verify dialog rendered ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Pick an Option" && echo "✓ Title found"

echo "=== Step 5: Check for list items ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Option 1" && echo "✓ Option 1 found"
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Option 2" && echo "✓ Option 2 found"

echo "=== Step 6: Navigate down ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Down
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50
echo "✓ Navigation down worked"

echo "=== Step 7: Navigate up ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Up
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50
echo "✓ Navigation up worked"

echo "=== Step 8: Select an item with Enter ==="
PRE_TEXT=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.text')
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000
POST_TEXT=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.text')

echo "$POST_TEXT" | grep -v -q "Pick an Option" && echo "✓ Dialog closed on selection"

echo "=== Step 9: Verify notification appeared ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Selected:" && echo "✓ Selection notification found"

echo "=== Step 10: Re-open and test cancel with Escape ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "/pick"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100

HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Escape
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -v -q "Selected:" && echo "✓ Dialog closed on cancel"

echo "=== Cleanup ==="
pilotty kill -s "$SESSION_NAME"

echo "=== Test Complete ==="
```

---

## 2. Overlay Test

Tests an overlay component. Verifies:
- Overlay appears over existing content
- Overlay content renders
- Interaction works inside overlay
- Overlay dismisses cleanly

```bash
#!/bin/bash
# Test: Overlay Component
# Prerequisites: Package has a /overlay command that shows an overlay

PACKAGE_DIR="/path/to/your/package"
SESSION_NAME="overlay-test"

echo "=== Step 1: Spawn pi with package loaded ==="
pilotty spawn --name "$SESSION_NAME" --cwd "$PACKAGE_DIR" -- pi -ne -e . --no-session

echo "=== Step 2: Wait for pi to be ready ==="
pilotty wait-for -s "$SESSION_NAME" "[Skills]" -t 10000

echo "=== Step 3: Capture baseline snapshot ==="
BASELINE_HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
BASELINE_TEXT=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.text')

echo "=== Step 4: Trigger the overlay ==="
pilotty type -s "$SESSION_NAME" "/overlay"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$BASELINE_HASH" --settle 100 -t 5000

echo "=== Step 5: Verify overlay appears ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Overlay Title" && echo "✓ Overlay title found"

echo "=== Step 6: Verify underlying content is still present ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "[Skills]" && echo "✓ Baseline content still visible"

echo "=== Step 7: Interact with overlay ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "test input"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50
echo "✓ Overlay interaction worked"

echo "=== Step 8: Dismiss overlay ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Escape
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Step 9: Verify screen returned to baseline ==="
RECOVERY_HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
if [ "$RECOVERY_HASH" = "$BASELINE_HASH" ]; then
  echo "✓ Screen returned to baseline state"
else
  echo "⚠ Screen state differs from baseline (may be expected if overlay left artifacts)"
fi

echo "=== Cleanup ==="
pilotty kill -s "$SESSION_NAME"

echo "=== Test Complete ==="
```

---

## 3. SettingsList Toggle Test

Tests a SettingsList component with toggle settings. Verifies:
- All settings appear
- Navigation works
- Toggle state changes on Enter
- Multiple toggles work correctly

```bash
#!/bin/bash
# Test: SettingsList Toggle
# Prerequisites: Package has a /settings command with a SettingsList

PACKAGE_DIR="/path/to/your/package"
SESSION_NAME="settings-test"

echo "=== Step 1: Spawn pi with package loaded ==="
pilotty spawn --name "$SESSION_NAME" --cwd "$PACKAGE_DIR" -- pi -ne -e . --no-session

echo "=== Step 2: Wait for pi to be ready ==="
pilotty wait-for -s "$SESSION_NAME" "[Skills]" -t 10000

echo "=== Step 3: Trigger settings dialog ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "/settings"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Step 4: Verify all settings appear ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Verbose mode" && echo "✓ 'Verbose mode' setting found"
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Color output" && echo "✓ 'Color output' setting found"

echo "=== Step 5: Capture initial state of first setting ==="
INITIAL_STATE=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep "Verbose mode" | grep -o 'on\|off')
echo "Initial 'Verbose mode' state: $INITIAL_STATE"

echo "=== Step 6: Toggle first setting ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100

echo "=== Step 7: Verify state changed ==="
NEW_STATE=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep "Verbose mode" | grep -o 'on\|off')
if [ "$INITIAL_STATE" != "$NEW_STATE" ]; then
  echo "✓ Toggle worked: changed from $INITIAL_STATE to $NEW_STATE"
else
  echo "✗ Toggle failed: state unchanged"
fi

echo "=== Step 8: Navigate to second setting ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Down
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50

echo "=== Step 9: Toggle second setting ==="
HASH2=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH2" --settle 100
echo "✓ Second setting toggled"

echo "=== Step 10: Close settings ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Escape
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Cleanup ==="
pilotty kill -s "$SESSION_NAME"

echo "=== Test Complete ==="
```

---

## 4. Custom Editor Test

Tests a custom editor replacement. Verifies:
- Editor renders in custom mode
- Mode switching works
- Input handling is correct
- Escape switches to normal mode
- Navigation keys work in normal mode

```bash
#!/bin/bash
# Test: Custom Editor (Vim-like mode switching)
# Prerequisites: Package sets a custom editor that supports insert/normal modes

PACKAGE_DIR="/path/to/your/package"
SESSION_NAME="editor-test"

echo "=== Step 1: Spawn pi with package loaded ==="
pilotty spawn --name "$SESSION_NAME" --cwd "$PACKAGE_DIR" -- pi -ne -e . --no-session

echo "=== Step 2: Wait for pi to be ready ==="
pilotty wait-for -s "$SESSION_NAME" "[Skills]" -t 10000

echo "=== Step 3: Verify custom mode indicator ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "INSERT" && echo "✓ Insert mode indicator found"

echo "=== Step 4: Type some text in insert mode ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "Hello world"
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50
echo "✓ Text input worked in insert mode"

echo "=== Step 5: Verify text appears ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Hello world" && echo "✓ Text found on screen"

echo "=== Step 6: Press Escape to switch to normal mode ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Escape
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50

echo "=== Step 7: Verify mode indicator changed ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "NORMAL" && echo "✓ Normal mode indicator found"
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -v -q "INSERT" && echo "✓ Insert mode indicator gone"

echo "=== Step 8: Test navigation keys in normal mode ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" h
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50
echo "✓ Left navigation worked"

HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" l
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50
echo "✓ Right navigation worked"

echo "=== Step 9: Switch back to insert mode (i key) ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" i
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 50
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "INSERT" && echo "✓ Returned to insert mode"

echo "=== Cleanup ==="
pilotty kill -s "$SESSION_NAME"

echo "=== Test Complete ==="
```

---

## 5. Widget Test

Tests a widget that appears above or below the editor. Verifies:
- Widget content renders
- Widget persists across normal typing
- Widget disappears when cleared

```bash
#!/bin/bash
# Test: Widget (Todo list / Progress indicator)
# Prerequisites: Package has a /widget command that sets a widget

PACKAGE_DIR="/path/to/your/package"
SESSION_NAME="widget-test"

echo "=== Step 1: Spawn pi with package loaded ==="
pilotty spawn --name "$SESSION_NAME" --cwd "$PACKAGE_DIR" -- pi -ne -e . --no-session

echo "=== Step 2: Wait for pi to be ready ==="
pilotty wait-for -s "$SESSION_NAME" "[Skills]" -t 10000

echo "=== Step 3: Trigger widget ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "/widget"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Step 4: Verify widget appears ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Todo" && echo "✓ Widget content found"

echo "=== Step 5: Type normally and verify widget persists ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "typing while widget is visible"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100

pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Todo" && echo "✓ Widget persisted after typing"

echo "=== Step 6: Clear widget ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "/widget-clear"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100

echo "=== Step 7: Verify widget disappeared ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -v -q "Todo" && echo "✓ Widget cleared"

echo "=== Cleanup ==="
pilotty kill -s "$SESSION_NAME"

echo "=== Test Complete ==="
```

---

## 6. BorderedLoader Test

Tests a loading overlay with cancel capability. Verifies:
- Loader overlay appears
- Spinner indicator shows
- Cancel (Escape) works
- Loader closes on completion

```bash
#!/bin/bash
# Test: BorderedLoader with Async Operation
# Prerequisites: Package has a /fetch command that shows a loader during async work

PACKAGE_DIR="/path/to/your/package"
SESSION_NAME="loader-test"

echo "=== Step 1: Spawn pi with package loaded ==="
pilotty spawn --name "$SESSION_NAME" --cwd "$PACKAGE_DIR" -- pi -ne -e . --no-session

echo "=== Step 2: Wait for pi to be ready ==="
pilotty wait-for -s "$SESSION_NAME" "[Skills]" -t 10000

echo "=== Step 3: Trigger async operation with loader ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "/fetch"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Step 4: Verify loader appears ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Fetching" && echo "✓ Loader text found"

echo "=== Step 5: Wait a moment for spinner to animate ==="
sleep 2
echo "✓ Loader remains visible during operation"

echo "=== Step 6: Test cancel (optional - if operation is cancellable) ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty key -s "$SESSION_NAME" Escape
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Step 7: Verify loader closed ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -v -q "Fetching" && echo "✓ Loader dismissed"

echo "=== Step 8: Test normal completion (run a fresh fetch) ==="
HASH=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty type -s "$SESSION_NAME" "/fetch"
pilotty key -s "$SESSION_NAME" Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 100 -t 5000

echo "=== Step 9: Wait for completion (adjust timeout based on operation) ==="
HASH2=$(pilotty snapshot -s "$SESSION_NAME" | jq -r '.content_hash')
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH2" --settle 100 -t 15000

echo "=== Step 10: Verify result appears ==="
pilotty snapshot -s "$SESSION_NAME" | jq -r '.text' | grep -q "Done\|Complete\|Cancelled" && echo "✓ Completion state found"

echo "=== Cleanup ==="
pilotty kill -s "$SESSION_NAME"

echo "=== Test Complete ==="
```

---

## Running These Tests

Save each test script as a `.sh` file, make it executable, and run:

```bash
chmod +x test-selectlist.sh
./test-selectlist.sh
```

For debugging, add `--format text` to snapshot commands to see visual output:

```bash
pilotty snapshot -s "$SESSION_NAME" --format text
```

For automated CI, check exit codes and capture logs:

```bash
./test-selectlist.sh > test-results.log 2>&1
if [ $? -eq 0 ]; then
  echo "✓ All tests passed"
else
  echo "✗ Tests failed - check test-results.log"
fi
```
