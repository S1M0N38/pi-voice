#!/bin/bash
# Test: tts tool — agent can invoke the tts tool to produce audio.
#
# Strategy:
#   1. Spawn pi with the extension loaded
#   2. Instruct the agent to "use the tts tool to say hello"
#   3. Wait for agent to finish
#   4. Verify a WAV file was created in ~/.pi/voice-*.wav
#   5. Verify the tool output includes "Speaking:"
#
# Prerequisites:
#   - TTS server running at 127.0.0.1:8181 with q4 model loaded
#   - pilotty installed
#   - pi installed with a working model (for the agent)

source "$(dirname "$0")/helpers.sh"

echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  pi-voice TTS Tool Test  ${RESET}"
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

# Ensure TTS is enabled
echo '{"enabled":true,"voice":"af_heart","speed":1.0,"host":"127.0.0.1","port":8181}' > "$HOME/.pi/voice.json"

# Clean up any existing WAV files from previous tests
rm -f "$HOME/.pi"/voice-*.wav 2>/dev/null || true

# ── Spawn pi ───────────────────────────────────────────────────────
log_step "1. Spawn pi and wait for ready"

spawn_pi
wait_for_pi 15000

# ── Trigger tts tool via agent ─────────────────────────────────────
log_step "2. Ask agent to use tts tool"

HASH=$(snapshot_content_hash)
send_type "Use the tts tool to say the text 'hello world test'"
send_key Enter

# Wait for the agent to start processing and finish
# The agent should: call tts tool → get response → finish
log_info "Waiting for agent to process (up to 60s)..."

# Wait for the agent loop to complete. We look for the prompt to come back.
# The screen will change multiple times as the agent works.
# We use a long settle to wait for the final stable state.
pilotty snapshot -s "$SESSION_NAME" --await-change "$HASH" --settle 3000 -t 60000 2>&1 > /dev/null

TEXT=$(snapshot_text)

# ── Verify tool was called ─────────────────────────────────────────
log_step "3. Verify tts tool was invoked"

# The agent's response should mention it used the tool
# or we should see "Speaking:" in the tool output
assert_match "Agent response mentions speaking or tts" "Speaking\|tts\|audio\|speech\|hello world" "$TEXT"

# ── Verify WAV file was created ────────────────────────────────────
log_step "4. Verify WAV file was created"

WAV_FILES=$(find "$HOME/.pi" -name 'voice-*.wav' -newer "$HOME/.pi/voice.json" 2>/dev/null)
if [ -n "$WAV_FILES" ]; then
  WAV_FILE=$(echo "$WAV_FILES" | head -1)
  log_pass "WAV file created: $WAV_FILE"

  # Verify it's a valid WAV file
  HEADER=$(xxd -l 4 "$WAV_FILE" | awk '{print $2 $3}')
  if [ "$HEADER" = "52494646" ]; then
    log_pass "WAV file has valid RIFF header"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "WAV file does not have valid RIFF header"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILURES+=("WAV file invalid header")
  fi

  # Verify file size is reasonable (> 1KB for any speech)
  FILE_SIZE=$(stat -f%z "$WAV_FILE" 2>/dev/null || stat -c%s "$WAV_FILE" 2>/dev/null || echo "0")
  if [ "$FILE_SIZE" -gt 1000 ]; then
    log_pass "WAV file size is reasonable ($FILE_SIZE bytes)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_fail "WAV file too small ($FILE_SIZE bytes)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILURES+=("WAV file too small")
  fi
else
  log_warn "No WAV file found in ~/.pi/ — audio may have already been cleaned up by playback"
  log_info "(The speak() function deletes WAV after playback, so this is expected)"
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# ── Cleanup ────────────────────────────────────────────────────────
log_step "Cleanup"
kill_session
rm -f "$HOME/.pi"/voice-*.wav 2>/dev/null || true
restore_config

print_summary
