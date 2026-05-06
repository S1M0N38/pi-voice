# Pi-voice E2E Test Patterns

Ready-to-use patterns for testing pi-voice components with pilotty.
Adapted from the generic pi-tui patterns to match pi-voice's actual test suite.

## Table of Contents

1. [Settings Toggle Test](#1-settings-toggle-test)
2. [Agent Tool Invocation Test](#2-agent-tool-invocation-test)
3. [Event Handler Request Counting Test](#3-event-handler-request-counting-test)
4. [Config Persistence Test](#4-config-persistence-test)
5. [Wrap-around Navigation Test](#5-wrap-around-navigation-test)

---

## 1. Settings Toggle Test

Tests the /voice TUI toggle (TTS on/off). Pattern used in `tests/tui.sh`.

```bash
#!/bin/bash
# Prerequisites: TTS server running with model loaded
source "$(dirname "$0")/helpers.sh"
require_server

spawn_pi
wait_for_pi

# Open /voice
HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
TEXT=$(await_change_and_snapshot_text "$HASH" 500 5000)

# Verify initial state
assert_match "TTS shows on" "on" "$TEXT"

# Toggle off with ←
HASH=$(snapshot_content_hash)
send_key Left
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "TTS now off" "off" "$TEXT"

# Toggle back on with →
HASH=$(snapshot_content_hash)
send_key Right
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "TTS back on" "on" "$TEXT"

send_key Escape
kill_session
print_summary
```

---

## 2. Agent Tool Invocation Test

Tests that the agent can invoke the `tts` tool. Pattern used in `tests/tts-tool.sh`.

```bash
#!/bin/bash
# Prerequisites: TTS server running with model loaded, pi has a working model
source "$(dirname "$0")/helpers.sh"
require_server

# Clean up old WAV files
rm -f "$HOME/.pi/voice"/voice-*.wav 2>/dev/null || true

spawn_pi
wait_for_pi

# Ask the agent to use the tts tool
HASH=$(snapshot_content_hash)
send_type "Use the tts tool to say 'hello world test'"
send_key Enter

# Wait for agent to complete (long settle for agent loop)
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 3000 -t 60000 > /dev/null 2>&1

TEXT=$(snapshot_text)
assert_match "Agent mentions speech" "Speaking\|tts\|audio\|speech" "$TEXT"

# Verify WAV file was created
WAV_FILE=$(find "$HOME/.pi/voice" -name 'voice-*.wav' -newer "$HOME/.pi/voice/config.json" 2>/dev/null | head -1)
if [ -n "$WAV_FILE" ]; then
  HEADER=$(xxd -l 4 "$WAV_FILE" | awk '{print $2 $3}')
  [ "$HEADER" = "52494646" ] && log_pass "Valid WAV (RIFF header)"
  FILE_SIZE=$(stat -f%z "$WAV_FILE" 2>/dev/null || stat -c%s "$WAV_FILE")
  [ "$FILE_SIZE" -gt 1000 ] && log_pass "WAV size reasonable ($FILE_SIZE bytes)"
else
  log_warn "No WAV found (speak() deletes after playback — expected)"
fi

kill_session
print_summary
```

---

## 3. Event Handler Request Counting Test

Tests that auto-TTS fires exactly once per event. Uses a counting HTTP proxy. Pattern from `tests/auto-tts.sh`.

```bash
#!/bin/bash
# Prerequisites: TTS server running with model loaded, pi has a working model
source "$(dirname "$0")/helpers.sh"
require_server

# Set up counting proxy
PROXY_PORT=18181
COUNT_FILE="/tmp/pi-voice-tts-count-$$"
echo "0" > "$COUNT_FILE"

# Spawn a tiny proxy that forwards to the real server and counts POST /tts
PROXY_SCRIPT='
import http from "node:http";
import { writeFileSync } from "node:fs";
let count = 0;
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  if (req.method === "POST" && req.url === "/tts") {
    count++;
    writeFileSync(process.env.COUNT_FILE, String(count));
  }
  const url = new URL(req.url, process.env.BACKEND);
  const resp = await fetch(url.toString(), {
    method: req.method, headers: { ...req.headers, host: url.host },
    body: req.method !== "GET" ? body : undefined,
  });
  const respBody = Buffer.from(await resp.arrayBuffer());
  const h = {}; resp.headers.forEach((v, k) => { h[k] = v; });
  delete h["transfer-encoding"]; delete h["content-encoding"];
  res.writeHead(resp.status, h); res.end(respBody);
});
server.listen(process.env.PROXY_PORT, "127.0.0.1");
'
PROXY_PORT=$PROXY_PORT COUNT_FILE="$COUNT_FILE" BACKEND="http://127.0.0.1:8181" \
  node --input-type=module --eval "$PROXY_SCRIPT" &
PROXY_PID=$!
sleep 2  # wait for proxy to start

# Configure pi-voice to use proxy
echo "{\"enabled\":true,\"voice\":\"af_heart\",\"speed\":1.0,\"host\":\"127.0.0.1\",\"port\":$PROXY_PORT,\"events\":{\"agent_end\":{\"prompt\":\"Summarize in one sentence.\"}}}" > "$HOME/.pi/voice/config.json"

spawn_pi
wait_for_pi

# Trigger agent
HASH=$(snapshot_content_hash)
send_type "What is 2+2? Reply in one short sentence."
send_key Enter
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 3000 -t 90000 > /dev/null 2>&1
sleep 10  # wait for async auto-TTS handler

TTS_COUNT=$(cat "$COUNT_FILE")
assert_equals "Exactly 1 TTS request" "1" "$TTS_COUNT"

kill_session
kill "$PROXY_PID" 2>/dev/null
rm -f "$COUNT_FILE"
print_summary
```

---

## 4. Config Persistence Test

Tests that settings survive closing and reopening /voice. Pattern from `tests/tui.sh` test #18.

```bash
#!/bin/bash
source "$(dirname "$0")/helpers.sh"
require_server

# Set known config
echo '{"enabled":true,"voice":"af_heart","speed":1.0,"host":"127.0.0.1","port":8181}' > "$HOME/.pi/voice/config.json"

spawn_pi
wait_for_pi

# Open /voice, change voice
HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
await_change_and_snapshot_text "$HASH" 500 5000 > /dev/null

send_key Down        # → Voice row
HASH=$(snapshot_content_hash)
send_key Right       # cycle to next voice
await_change_and_snapshot_text "$HASH" 50 > /dev/null

# Close
send_key Escape
sleep 0.3

# Re-open and verify change persisted
HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
TEXT=$(await_change_and_snapshot_text "$HASH" 500 5000)

assert_no_match "Voice not af_heart (was changed)" "af_heart" "$(echo "$TEXT" | grep '→ Voice')"

send_key Escape
kill_session
print_summary
```

---

## 5. Wrap-around Navigation Test

Tests that cursor wraps from last→first and first→last row. Pattern from `tests/tui.sh` tests #13-14.

```bash
#!/bin/bash
source "$(dirname "$0")/helpers.sh"
require_server

echo '{"enabled":true,"voice":"af_heart","speed":1.0,"host":"127.0.0.1","port":8181}' > "$HOME/.pi/voice/config.json"

spawn_pi
wait_for_pi

HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
await_change_and_snapshot_text "$HASH" 500 5000 > /dev/null

# Navigate to last row (Speed)
send_key Down && send_key Down
TEXT=$(snapshot_text)
assert_match "On Speed row" "→ Speed" "$TEXT"

# Down from last wraps to first (TTS)
HASH=$(snapshot_content_hash)
send_key Down
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Wrapped to TTS row" "→ TTS" "$TEXT"

# Up from first wraps to last (Speed)
HASH=$(snapshot_content_hash)
send_key Up
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Wrapped to Speed row" "→ Speed" "$TEXT"

send_key Escape
kill_session
print_summary
```

---

## Running Tests

```bash
# Individual suites
npm run test:tui           # /voice TUI interaction tests
npm run test:tts-tool      # tts tool invocation tests
npm run test:auto-tts      # auto-TTS event handler tests

# All E2E tests
npm run test:e2e

# Debug a specific test with visual output
pilotty snapshot -s "$SESSION_NAME" --format text
```
