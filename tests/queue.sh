#!/bin/bash
# Test: TTS queue behaviour — verifies that tts tool audio and agent_end auto-TTS
# audio do NOT overlap. Currently demonstrates the bug (two afplay processes
# running simultaneously). After the queue fix, this test should PASS.
#
# Strategy:
#   1. Use a minimal summary prompt so auto-TTS generates fast
#   2. Monitor afplay PIDs at 50ms intervals
#   3. Detect concurrent afplay processes (the bug)
#   4. Assert NO overlap (currently FAILS — demonstrates the bug)
#
# Prerequisites:
#   - TTS server running at 127.0.0.1:8181 with q4 model loaded
#   - pilotty installed
#   - pi installed with a working model

source "$(dirname "$0")/helpers.sh"

echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  pi-voice Queue Test Suite  ${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"

require_server

# ── Config lifecycle ───────────────────────────────────────────────
CONFIG_BACKUP=""
if [ -f "$HOME/.pi/voice/config.json" ]; then
  CONFIG_BACKUP=$(cat "$HOME/.pi/voice/config.json")
fi

restore_config() {
  if [ -n "$CONFIG_BACKUP" ]; then
    echo "$CONFIG_BACKUP" > "$HOME/.pi/voice/config.json"
  else
    rm -f "$HOME/.pi/voice/config.json"
  fi
}

# Mirror the DEFAULT_CONFIG from extensions/index.ts (full summarization prompt)
write_test_config() {
  cat > "$HOME/.pi/voice/config.json" <<'EOF'
{
  "enabled": true,
  "voice": "af_heart",
  "speed": 1.0,
  "host": "127.0.0.1",
  "port": 8181,
  "events": {
    "agent_end": {
      "prompt": "You are preparing text for a text-to-speech system. You will receive a message from a conversation enclosed in quadruple backticks. Summarize it in one single very short sentence, two at most. Use a dry, matter-of-fact tone. Do not use any markdown formatting, just plain text. Prefer words over symbols or abbreviations, as this will be read aloud. Output only the sentence, nothing else."
    }
  }
}
EOF
}

write_test_config

# ── afplay process monitor ─────────────────────────────────────────
MONITOR_LOG=$(mktemp)
MONITOR_PID=""

start_monitor() {
  (
    while true; do
      pids=$(pgrep -x afplay 2>/dev/null || true)
      if [ -n "$pids" ]; then
        count=$(echo "$pids" | grep -c '^')
        now_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
        echo "${now_ms} ${count} $(echo "$pids" | tr '\n' ',')" >> "$MONITOR_LOG"
      fi
      sleep 0.05
    done
  ) &
  MONITOR_PID=$!
}

stop_monitor() {
  if [ -n "$MONITOR_PID" ]; then
    kill "$MONITOR_PID" 2>/dev/null || true
    wait "$MONITOR_PID" 2>/dev/null || true
    MONITOR_PID=""
  fi
}

pkill -x afplay 2>/dev/null || true
sleep 0.2

# ── Spawn pi ───────────────────────────────────────────────────────
spawn_pi
wait_for_pi 15000

# ── Start monitoring ───────────────────────────────────────────────
start_monitor

# ── Test 1: Trigger tts tool + auto-TTS ────────────────────────────
log_step "1. 'sing a song using tts tool' — triggers tts tool + auto-TTS"

send_type "sing a song using tts tool"
send_key Enter

# Wait for tts tool invocation
log_info "Waiting for tts tool (10s timeout)..."
pilotty wait-for -s "$SESSION_NAME" "Speaking:" -t 10000 2>&1 > /dev/null
log_info "TTS tool invoked"

# Wait for first afplay (tool audio)
log_info "Waiting for tool audio..."
for i in $(seq 1 20); do
  pgrep -x afplay > /dev/null 2>&1 && break
  sleep 0.5
done

# Wait for agent to finish + all audio to stop
# The ♪ in the status bar indicates agent is idle
log_info "Waiting for agent + audio to finish (30s timeout)..."
for i in $(seq 1 30); do
  TEXT=$(snapshot_text)
  TEXT_LAST=$(echo "$TEXT" | tail -4)
  echo "$TEXT_LAST" | grep -qF '♪' && ! pgrep -x afplay > /dev/null 2>&1 && break
  sleep 1
done

# Wait for any late auto-TTS audio (poll instead of fixed sleep)
log_info "Waiting for auto-TTS audio to finish (30s timeout)..."
for i in $(seq 1 30); do
  if ! pgrep -x afplay > /dev/null 2>&1; then
    log_info "All audio done at ${i}s"
    break
  fi
  sleep 1
done

sleep 0.5
stop_monitor

# ── Analyze ────────────────────────────────────────────────────────
log_step "2. Analyze afplay process log for overlaps"

OVERLAP_COUNT=0
UNIQUE_PIDS=0
if [ -s "$MONITOR_LOG" ]; then
  OVERLAP_COUNT=$(awk '$2 >= 2 { count++ } END { print count+0 }' "$MONITOR_LOG")
  UNIQUE_PIDS=$(awk '{split($3,a,","); for(i in a) if(a[i]!="") print a[i]}' "$MONITOR_LOG" | sort -u | grep -c '^' || echo 0)
fi
log_info "Overlap samples (2+ concurrent): $OVERLAP_COUNT"
log_info "Unique afplay PIDs: $UNIQUE_PIDS"

# ── Assertions ─────────────────────────────────────────────────────

# Sanity: afplay activity captured
TESTS_RUN=$((TESTS_RUN + 1))
if [ -s "$MONITOR_LOG" ]; then
  log_pass "Monitor captured afplay activity"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_fail "No afplay processes detected"
  FAILURES+=("No afplay processes detected")
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Sanity: both tool and auto-TTS fired
TESTS_RUN=$((TESTS_RUN + 1))
if [ "$UNIQUE_PIDS" -ge 2 ]; then
  log_pass "2 unique afplay PIDs detected (tool + auto-TTS)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_fail "Expected 2+ PIDs, got $UNIQUE_PIDS"
  FAILURES+=("Only $UNIQUE_PIDS PID(s) — auto-TTS may not have triggered")
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Core assertion: no overlap. Currently FAILS — demonstrates the bug.
TESTS_RUN=$((TESTS_RUN + 1))
if [ "$OVERLAP_COUNT" -eq 0 ]; then
  log_pass "No overlap between tts tool and auto-TTS"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_fail "Queue not enforced: $OVERLAP_COUNT samples with 2+ concurrent afplay"
  FAILURES+=("Queue not enforced: $OVERLAP_COUNT overlapping samples")
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# ── Cleanup ────────────────────────────────────────────────────────
log_step "Cleanup"
kill_session
restore_config
rm -f "$MONITOR_LOG"
pkill -x afplay 2>/dev/null || true

print_summary
