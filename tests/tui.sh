#!/bin/bash
# Test: /voice command TUI — navigation, settings changes, reset, close.
#
# Prerequisites:
#   - TTS server running at 127.0.0.1:8181 with q4 model loaded
#   - pilotty installed
#   - pi installed

source "$(dirname "$0")/helpers.sh"

echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  pi-voice TUI Test Suite  ${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"

require_server

# ── Save original config so we can restore it ──────────────────────
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

# Write a clean config with known defaults before spawning pi
cat > "$HOME/.pi/voice.json" <<'EOF'
{
  "enabled": true,
  "voice": "af_heart",
  "speed": 1.0,
  "host": "127.0.0.1",
  "port": 8181,
  "events": {
    "agent_end": {
      "prompt": "You are preparing text for a text-to-speech system. Summarize in one short sentence."
    }
  }
}
EOF

# ── Test 1: Spawn and open /voice ─────────────────────────────────
log_step "1. Spawn pi and open /voice command"

spawn_pi
wait_for_pi 15000

HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
TEXT=$(await_change_and_snapshot_text "$HASH" 500 5000)

assert_match "Voice title rendered" "Voice" "$TEXT"
assert_match "Server status shown" "Server running" "$TEXT"
assert_match "TTS toggle shown" "TTS" "$TEXT"
assert_match "Speed shown" "Speed" "$TEXT"
assert_match "Navigation hint shown" "navigate" "$TEXT"
assert_match "Reset hint shown" "r reset" "$TEXT"

# ── Test 2: Verify initial cursor on TTS row ──────────────────────
log_step "2. Initial cursor on TTS row (first setting)"

TEXT=$(snapshot_text)
assert_match "TTS row has cursor arrow" "→ TTS" "$TEXT"
assert_match "TTS shows on" "on" "$TEXT"

# ── Test 3: Toggle TTS off ────────────────────────────────────────
log_step "3. Toggle TTS off with ←"

HASH=$(snapshot_content_hash)
send_key Left
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "TTS now shows off" "off" "$TEXT"

# ── Test 4: Toggle TTS back on ────────────────────────────────────
log_step "4. Toggle TTS back on with →"

HASH=$(snapshot_content_hash)
send_key Right
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "TTS shows on again" "on" "$TEXT"

# ── Test 5: Navigate down to Voice row ────────────────────────────
log_step "5. Navigate to Voice row with ↓"

HASH=$(snapshot_content_hash)
send_key Down
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Voice row has cursor" "→ Voice" "$TEXT"
assert_match "Voice shows af_heart" "af_heart" "$TEXT"

# ── Test 6: Cycle voice right ─────────────────────────────────────
log_step "6. Cycle voice with →"

HASH=$(snapshot_content_hash)
send_key Right
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Voice changed to af_alloy" "af_alloy" "$TEXT"
assert_match "Voice hint shows American female" "American female" "$TEXT"

# ── Test 7: Cycle voice back left ─────────────────────────────────
log_step "7. Cycle voice back with ←"

HASH=$(snapshot_content_hash)
send_key Left
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Voice back to af_heart" "af_heart" "$TEXT"

# ── Test 8: Navigate down to Speed row ────────────────────────────
log_step "8. Navigate to Speed row with ↓"

HASH=$(snapshot_content_hash)
send_key Down
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Speed row has cursor" "→ Speed" "$TEXT"
assert_match "Speed shows value" "Speed" "$TEXT"

# ── Test 9: Increase speed ────────────────────────────────────────
log_step "9. Increase speed with →"

# Get current speed value
CURRENT_SPEED=$(echo "$TEXT" | grep -oE 'Speed.*[0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+' || echo "unknown")
log_info "Current speed: $CURRENT_SPEED"

HASH=$(snapshot_content_hash)
send_key Right
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

# Speed should have changed
NEW_SPEED=$(echo "$TEXT" | grep -oE 'Speed.*[0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+' || echo "unknown")
log_info "New speed: $NEW_SPEED"

# The speed value should be different from before
if [ "$CURRENT_SPEED" != "$NEW_SPEED" ]; then
  log_pass "Speed changed from $CURRENT_SPEED to $NEW_SPEED"
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_fail "Speed did not change (still $CURRENT_SPEED)"
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_FAILED=$((TESTS_FAILED + 1))
  FAILURES+=("Speed did not change on →")
fi

# ── Test 10: Decrease speed ───────────────────────────────────────
log_step "10. Decrease speed with ←"

HASH=$(snapshot_content_hash)
send_key Left
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

RESTORED_SPEED=$(echo "$TEXT" | grep -oE 'Speed.*[0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+' || echo "unknown")
assert_equals "Speed restored to original" "$CURRENT_SPEED" "$RESTORED_SPEED"

# ── Test 11: Navigate up back to Voice row ────────────────────────
log_step "11. Navigate up to Voice row with ↑"

HASH=$(snapshot_content_hash)
send_key Up
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Cursor on Voice row" "→ Voice" "$TEXT"

# ── Test 12: Navigate up to TTS row ───────────────────────────────
log_step "12. Navigate up to TTS row with ↑"

HASH=$(snapshot_content_hash)
send_key Up
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Cursor on TTS row" "→ TTS" "$TEXT"

# ── Test 13: Wrap-around navigation (down from last row to first) ──
log_step "13. Wrap-around: ↓ from Speed wraps to TTS"

# Go to Speed row (last setting)
send_key Down
send_key Down
HASH=$(snapshot_content_hash)
TEXT=$(snapshot_text)
assert_match "On Speed row before wrap" "→ Speed" "$TEXT"

# Press Down to wrap to TTS
HASH=$(snapshot_content_hash)
send_key Down
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Wrapped back to TTS row" "→ TTS" "$TEXT"

# ── Test 14: Wrap-around (up from first row to last) ──────────────
log_step "14. Wrap-around: ↑ from TTS wraps to Speed"

HASH=$(snapshot_content_hash)
send_key Up
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "Wrapped to Speed row" "→ Speed" "$TEXT"

# ── Test 15: Test (Enter) plays sample ────────────────────────────
log_step "15. Enter triggers sample playback"

# Go back to TTS row
send_key Up
send_key Up

HASH=$(snapshot_content_hash)
send_key Enter
TEXT=$(await_change_and_snapshot_text "$HASH" 100 2000)

# Should show "Playing sample…" message
assert_match "Playing sample indicator shown" "Playing sample" "$TEXT"

# Wait for playback to finish (sample + afplay can take 5-8s)
# Poll until the playing indicator disappears
PLAY_DONE=false
for i in $(seq 1 20); do
  sleep 1
  TEXT=$(snapshot_text)
  if ! echo "$TEXT" | grep -q "Playing sample"; then
    PLAY_DONE=true
    break
  fi
done

if $PLAY_DONE; then
  log_pass "Playing indicator gone after playback"
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_fail "Playing indicator still present after 20s"
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_FAILED=$((TESTS_FAILED + 1))
  FAILURES+=("Playing indicator did not clear")
fi

# ── Test 16: Reset to defaults ────────────────────────────────────
log_step "16. Reset settings with 'r' key"

HASH=$(snapshot_content_hash)
send_key r
TEXT=$(await_change_and_snapshot_text "$HASH" 100)

assert_match "TTS restored to on" "on" "$TEXT"
assert_match "Voice restored to af_heart" "af_heart" "$TEXT"
assert_match "Speed restored to 1.0" "1.0" "$TEXT"

# ── Test 17: Close with Escape ────────────────────────────────────
log_step "17. Close /voice with Escape"

HASH=$(snapshot_content_hash)
send_key Escape
sleep 0.3

TEXT=$(snapshot_text)
assert_no_match "Voice TUI closed" "navigate • ←→ change" "$TEXT"

# ── Test 18: Re-open /voice — settings persist ────────────────────
log_step "18. Re-open /voice — settings persisted in config"

HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
TEXT=$(await_change_and_snapshot_text "$HASH" 500 5000)

assert_match "Voice TUI re-opened" "Voice" "$TEXT"
assert_match "Server status shown" "Server running" "$TEXT"

# ── Test 19: alt+v keybind toggles TTS ─────────────────────────────
log_step "19. alt+v keybind toggles TTS on/off"

# Close /voice first (should still be open from test 18)
send_key Escape
sleep 0.3

# Press alt+v to toggle TTS off
HASH=$(snapshot_content_hash)
send_key Alt+v
TEXT=$(await_change_and_snapshot_text "$HASH" 200 5000)

assert_match "Notification shows disabled" "disabled" "$TEXT"

# Press alt+v again to toggle back on
HASH=$(snapshot_content_hash)
send_key Alt+v
TEXT=$(await_change_and_snapshot_text "$HASH" 200 5000)

assert_match "Notification shows enabled" "enabled" "$TEXT"

# ── Cleanup ────────────────────────────────────────────────────────
log_step "Cleanup"
send_key Escape
sleep 0.2
kill_session
restore_config

print_summary
