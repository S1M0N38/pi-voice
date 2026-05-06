#!/bin/bash
# Test: /voice TUI — session-only config, s save default, r reset, ESC close.
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

write_clean_config() {
  cat > "$HOME/.pi/voice/config.json" <<'EOF'
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
}

write_clean_config
spawn_pi
wait_for_pi 15000

# Helper: open /voice and wait for it
open_voice() {
  HASH=$(snapshot_content_hash)
  send_type "/voice"
  send_key Enter
  await_change_and_snapshot_text "$HASH" 500 5000
}

# ── Test 1: Open /voice — verify initial state ────────────────────
log_step "1. Open /voice — title, server, defaults, help line"

TEXT=$(open_voice)

assert_match "Voice title rendered" "Voice" "$TEXT"
assert_match "Server running" "Server running" "$TEXT"
assert_match "TTS shows on" "on" "$TEXT"
assert_match "Voice shows af_heart" "af_heart" "$TEXT"
assert_match "Speed shows 1.0" "1.0" "$TEXT"
assert_match "Help line has 's save default'" "s save default" "$TEXT"
assert_match "Help line has 'r reset'" "r reset" "$TEXT"
assert_match "Cursor on TTS row" "→ TTS" "$TEXT"

# ── Test 2: Navigate with ↑↓ ──────────────────────────────────────
log_step "2. Navigate between TTS → Voice → Speed rows"

HASH=$(snapshot_content_hash)
send_key Down
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Cursor on Voice row" "→ Voice" "$TEXT"

HASH=$(snapshot_content_hash)
send_key Down
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Cursor on Speed row" "→ Speed" "$TEXT"

HASH=$(snapshot_content_hash)
send_key Up
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Cursor back on Voice row" "→ Voice" "$TEXT"

HASH=$(snapshot_content_hash)
send_key Up
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Cursor back on TTS row" "→ TTS" "$TEXT"

# ── Test 3: ←→ changes session only ───────────────────────────────
log_step "3. ←→ changes session only — toggle off, close, reopen"

# Cursor is on TTS row — toggle off
HASH=$(snapshot_content_hash)
send_key Left
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "TTS shows off" "off" "$TEXT"

# Close TUI (ESC saves session)
HASH=$(snapshot_content_hash)
send_key Escape
sleep 0.3

# Re-open /voice
TEXT=$(open_voice)
assert_match "TTS still off (session persisted)" "off" "$TEXT"

# ── Test 4: ←→ does NOT modify voice.json ─────────────────────────
log_step "4. ←→ does NOT modify ~/.pi/voice/config.json"

FILE_ENABLED=$(cat "$HOME/.pi/voice/config.json" | jq -r '.enabled')
assert_equals "config.json still has enabled=true" "true" "$FILE_ENABLED"

# ── Test 5: s saves as default ─────────────────────────────────────
log_step "5. s saves current values as default"

# TTS is still off from test 3 — press s to save
HASH=$(snapshot_content_hash)
send_key s
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Feedback shows 'Saved as default'" "Saved as default" "$TEXT"

FILE_ENABLED=$(cat "$HOME/.pi/voice/config.json" | jq -r '.enabled')
assert_equals "config.json now has enabled=false" "false" "$FILE_ENABLED"

# ── Test 6: r resets to config ─────────────────────────────────────
log_step "6. r resets to config defaults"

# First: change voice and speed
send_key Down  # → Voice row
HASH=$(snapshot_content_hash)
send_key Right
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Voice changed from af_heart" "af_alloy" "$TEXT"

send_key Down  # → Speed row
HASH=$(snapshot_content_hash)
send_key Right
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

# Now reset — should go back to config.json values (enabled=false, voice=af_heart, speed=1.0)
HASH=$(snapshot_content_hash)
send_key r
TEXT=$(await_change_and_snapshot_text "$HASH" 100)
assert_match "TTS restored to config (off)" "off" "$TEXT"
assert_match "Voice restored to af_heart" "af_heart" "$TEXT"
assert_match "Speed restored to 1.0" "1.0" "$TEXT"

# ── Test 7: ESC saves session ──────────────────────────────────────
log_step "7. ESC persists session config across reopen"

# Go to Voice row, change voice
send_key Up  # → Voice row (cursor was on Speed after test 6, up goes to Voice)
HASH=$(snapshot_content_hash)
send_key Right
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

# Close with ESC (saves session)
HASH=$(snapshot_content_hash)
send_key Escape
sleep 0.3

# Re-open and verify voice change persisted in session
TEXT=$(open_voice)
# After reset in test 6 + one right press on voice, voice should be af_alloy
assert_match "Voice change persisted across ESC close/reopen" "af_alloy" "$TEXT"

# ── Test 8: Wrap-around navigation ─────────────────────────────────
log_step "8. Wrap-around: ↓ from last wraps to first, ↑ from first wraps to last"

# Navigate to Speed (last row): cursor starts on TTS after open_voice, press Down twice
send_key Down
send_key Down
HASH=$(snapshot_content_hash)
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "On Speed row" "→ Speed" "$TEXT"

# Down from Speed wraps to TTS
HASH=$(snapshot_content_hash)
send_key Down
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Wrapped to TTS row" "→ TTS" "$TEXT"

# Up from TTS wraps to Speed
HASH=$(snapshot_content_hash)
send_key Up
TEXT=$(await_change_and_snapshot_text "$HASH" 50)
assert_match "Wrapped to Speed row" "→ Speed" "$TEXT"

# ── Cleanup ────────────────────────────────────────────────────────
log_step "Cleanup"
send_key Escape
sleep 0.2
kill_session
restore_config

print_summary
