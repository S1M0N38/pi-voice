#!/bin/bash
# Test: Status bar indicator — ♪ icon visible, updates on toggle.
#
# Prerequisites:
#   - TTS server running at 127.0.0.1:8181 with q4 model loaded
#   - pilotty installed
#   - pi installed

source "$(dirname "$0")/helpers.sh"

echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  pi-voice Status Bar Test Suite  ${RESET}"
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

# ── Test 1: ♪ icon visible after startup ──────────────────────────
log_step "1. Status bar shows ♪ after pi startup"

spawn_pi
wait_for_pi 15000

TEXT=$(snapshot_text)
assert_match "Music note (♪) visible in status bar" "♪" "$TEXT"

# ── Test 2: alt+v toggles TTS off — notification + ♪ still present ─
log_step "2. alt+v toggles TTS off"

HASH=$(snapshot_content_hash)
send_key Alt+v
TEXT=$(await_change_and_snapshot_text "$HASH" 200 5000)

assert_match "Notification shows disabled" "disabled" "$TEXT"
assert_match "Music note still visible after disable" "♪" "$TEXT"

# ── Test 3: alt+v toggles TTS back on ─────────────────────────────
log_step "3. alt+v toggles TTS back on"

HASH=$(snapshot_content_hash)
send_key Alt+v
TEXT=$(await_change_and_snapshot_text "$HASH" 200 5000)

assert_match "Notification shows enabled" "enabled" "$TEXT"
assert_match "Music note visible after re-enable" "♪" "$TEXT"

# ── Test 4: ♪ visible in /voice TUI ───────────────────────────────
log_step "4. ♪ persists when /voice TUI is open"

HASH=$(snapshot_content_hash)
send_type "/voice"
send_key Enter
TEXT=$(await_change_and_snapshot_text "$HASH" 500 5000)

assert_match "/voice TUI opened" "Voice" "$TEXT"
assert_match "Music note visible inside /voice" "♪" "$TEXT"

# ── Test 5: Toggling TTS inside /voice updates status bar ─────────
log_step "5. Toggle TTS off inside /voice, ♪ still visible"

# TTS row is selected by default — press left to toggle off
HASH=$(snapshot_content_hash)
send_key Left
TEXT=$(await_change_and_snapshot_text "$HASH" 50)

assert_match "TTS shows off" "off" "$TEXT"
assert_match "Music note visible after TUI toggle" "♪" "$TEXT"

# ── Test 6: Reset restores ♪ to enabled state ─────────────────────
log_step "6. Reset to defaults restores enabled state"

HASH=$(snapshot_content_hash)
send_key r
TEXT=$(await_change_and_snapshot_text "$HASH" 100)

assert_match "TTS restored to on" "on" "$TEXT"
assert_match "Music note visible after reset" "♪" "$TEXT"

# ── Test 7: Close /voice — ♪ still in status bar ──────────────────
log_step "7. Close /voice, ♪ still in status bar"

HASH=$(snapshot_content_hash)
send_key Escape
sleep 0.3

TEXT=$(snapshot_text)
assert_no_match "Voice TUI closed" "navigate" "$TEXT"
assert_match "Music note persists after closing /voice" "♪" "$TEXT"

# ── Cleanup ────────────────────────────────────────────────────────
log_step "Cleanup"
send_key Escape
sleep 0.2
kill_session
restore_config

print_summary
