#!/bin/bash
# Test: Auto-TTS fires exactly once on agent_end.
#
# Strategy:
#   1. Start a fresh TTS server on a custom port (so we can count requests)
#   2. Configure pi-voice with auto-TTS enabled for agent_end
#   3. Spawn pi, send a simple prompt that triggers the agent
#   4. Wait for agent to finish
#   5. Count how many POST /tts requests hit the server — must be exactly 1
#
# We use a proxy/counting approach: spin up a tiny HTTP server that forwards
# requests to the real TTS server and counts them.
#
# Prerequisites:
#   - TTS server running at 127.0.0.1:8181 with q4 model loaded
#   - pilotty installed
#   - pi installed with a working model

source "$(dirname "$0")/helpers.sh"

echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  pi-voice Auto-TTS Test (agent_end fires once)  ${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"

require_server

# ── Save original config ───────────────────────────────────────────
CONFIG_BACKUP=""
if [ -f "$HOME/.pi/voice.json" ]; then
  CONFIG_BACKUP=$(cat "$HOME/.pi/voice.json")
fi
restore_config() {
  if [ -n "$CONFIG_BACKUP" ]; then
    echo "$CONFIG_BACKUP" > "$HOME/.pi/voice.json"
  else
    rm -f "$HOME/.pi/voice.json"
  fi
}

# ── Set up counting proxy ──────────────────────────────────────────
PROXY_PORT=18181
COUNT_FILE="/tmp/pi-voice-tts-count-$$"
echo "0" > "$COUNT_FILE"

# Clean up any stale processes on the proxy port
lsof -ti:$PROXY_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 0.5

# ── Save original config ───────────────────────────────────────────
CONFIG_BACKUP=""
if [ -f "$HOME/.pi/voice.json" ]; then
  CONFIG_BACKUP=$(cat "$HOME/.pi/voice.json")
fi
restore_config() {
  if [ -n "$CONFIG_BACKUP" ]; then
    echo "$CONFIG_BACKUP" > "$HOME/.pi/voice.json"
  else
    rm -f "$HOME/.pi/voice.json"
  fi
}

# Create a tiny Node.js HTTP proxy that counts POST /tts requests
PROXY_SCRIPT=$(cat <<'SCRIPT'
import http from "node:http";
import { writeFileSync, readFileSync } from "node:fs";

const PROXY_PORT = parseInt(process.env.PROXY_PORT || "18181");
const BACKEND = process.env.BACKEND || "http://127.0.0.1:8181";
const COUNT_FILE = process.env.COUNT_FILE || "/tmp/pi-voice-tts-count";
const REQUESTS_LOG = process.env.REQUESTS_LOG || "/tmp/pi-voice-tts-requests";

let ttsCount = 0;

const server = http.createServer(async (req, res) => {
  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();

  // Count POST /tts requests
  if (req.method === "POST" && req.url === "/tts") {
    ttsCount++;
    writeFileSync(COUNT_FILE, String(ttsCount));
    // Also log the request for debugging
    const logEntry = `${new Date().toISOString()} POST /tts body=${body.slice(0, 100)}\n`;
    try {
      const existing = readFileSync(REQUESTS_LOG, "utf-8");
      writeFileSync(REQUESTS_LOG, existing + logEntry);
    } catch {
      writeFileSync(REQUESTS_LOG, logEntry);
    }
  }

  // Forward to backend
  const backendUrl = new URL(req.url, BACKEND);
  const fwdInit = {
    method: req.method,
    headers: { ...req.headers, host: backendUrl.host },
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    fwdInit.body = body;
  }

  try {
    const upstream = await fetch(backendUrl.toString(), {
      ...fwdInit,
      signal: AbortSignal.timeout(120_000),
    });

    const respBody = Buffer.from(await upstream.arrayBuffer());

    const respHeaders = {};
    upstream.headers.forEach((v, k) => { respHeaders[k] = v; });
    delete respHeaders["transfer-encoding"];
    delete respHeaders["content-encoding"];

    res.writeHead(upstream.status, respHeaders);
    res.end(respBody);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "proxy error: " + err.message }));
  }
});

server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(`[proxy] Listening on http://127.0.0.1:${PROXY_PORT}`);
  console.log(`[proxy] Forwarding to ${BACKEND}`);
  console.log(`[proxy] Counting POST /tts → ${COUNT_FILE}`);
});
SCRIPT
)

REQUESTS_LOG="/tmp/pi-voice-tts-requests-$$"
echo "" > "$REQUESTS_LOG"

log_info "Starting counting proxy on port $PROXY_PORT..."
PROXY_PID=""
PROXY_PORT=$PROXY_PORT COUNT_FILE="$COUNT_FILE" REQUESTS_LOG="$REQUESTS_LOG" \
  node --input-type=module --eval "$PROXY_SCRIPT" &
PROXY_PID=$!

# Wait for proxy to be ready
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PROXY_PORT/health" > /dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

if ! curl -sf "http://127.0.0.1:$PROXY_PORT/health" > /dev/null 2>&1; then
  log_fail "Counting proxy did not start"
  kill "$PROXY_PID" 2>/dev/null || true
  # Check if port is in use
  if lsof -i:$PROXY_PORT > /dev/null 2>&1; then
    log_info "Port $PROXY_PORT is in use — killing stale process"
    lsof -ti:$PROXY_PORT | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
  # Retry
  PROXY_PORT=$PROXY_PORT COUNT_FILE="$COUNT_FILE" REQUESTS_LOG="$REQUESTS_LOG" \
    node --input-type=module --eval "$PROXY_SCRIPT" &
  PROXY_PID=$!
  sleep 2
  if ! curl -sf "http://127.0.0.1:$PROXY_PORT/health" > /dev/null 2>&1; then
    log_fail "Counting proxy failed to start on retry"
    exit 1
  fi
fi
log_pass "Counting proxy started"

# ── Configure pi-voice to use proxy ────────────────────────────────
log_step "1. Configure pi-voice with auto-TTS enabled via proxy"

# Create config pointing at our counting proxy with agent_end event
cat > "$HOME/.pi/voice.json" <<EOF
{
  "enabled": true,
  "voice": "af_heart",
  "speed": 1.0,
  "host": "127.0.0.1",
  "port": $PROXY_PORT,
  "events": {
    "agent_end": {
      "prompt": "You are preparing text for a text-to-speech system. Summarize in one short sentence. Output only the sentence."
    }
  }
}
EOF
log_info "Config written to ~/.pi/voice.json with port=$PROXY_PORT"

# ── Spawn pi ───────────────────────────────────────────────────────
log_step "2. Spawn pi"

spawn_pi
wait_for_pi 15000

# ── Trigger the agent ──────────────────────────────────────────────
log_step "3. Send a simple prompt to trigger the agent"

HASH=$(snapshot_content_hash)
send_type "What is 2+2? Reply in one short sentence."
send_key Enter

# Wait for agent to fully complete and screen to stabilize
# agent_end fires after the agent loop completes, then auto-TTS
# runs a summary model → TTS request. We need a long settle time.
log_info "Waiting for agent to complete (up to 90s)..."
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 3000 -t 90000 2>&1 > /dev/null

# Now wait extra time for the async auto-TTS handler to complete
# The handleAutoTTS is fire-and-forget (.catch) so it runs in background
log_info "Agent completed. Waiting 10s for auto-TTS handler to fire..."
sleep 10

TEXT=$(snapshot_text)
log_info "Agent finished. Checking TTS request count..."

# ── Verify exactly 1 TTS request ──────────────────────────────────
log_step "4. Verify exactly 1 POST /tts request was made"

# Give a moment for any async handlers to complete
sleep 2

TTS_COUNT=$(cat "$COUNT_FILE")
log_info "TTS request count: $TTS_COUNT"

# Show what requests were made
if [ -s "$REQUESTS_LOG" ]; then
  log_info "TTS requests logged:"
  while IFS= read -r line; do
    log_info "  $line"
  done < "$REQUESTS_LOG"
else
  log_info "No TTS requests were logged"
  log_info "This could mean:"
  log_info "  - The summary model failed to resolve (check ctx.model)"
  log_info "  - The agent_end event didn't fire"
  log_info "  - extractLastMessage returned empty"
fi

assert_equals "Exactly 1 TTS request on agent_end" "1" "$TTS_COUNT"

# ── Also verify the agent response was rendered ────────────────────
log_step "5. Verify agent response was rendered"

# The agent should have answered "4" or "2+2=4"
assert_match "Agent response is visible" "4" "$TEXT"

# ── Cleanup ────────────────────────────────────────────────────────
log_step "Cleanup"
kill_session
kill "$PROXY_PID" 2>/dev/null || true
rm -f "$COUNT_FILE" "$REQUESTS_LOG"
rm -f "$HOME/.pi"/voice-*.wav 2>/dev/null || true
restore_config

print_summary
