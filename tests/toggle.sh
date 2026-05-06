#!/bin/bash
# Test: alt+v toggle — session-only, status bar ♪.
#
# Prerequisites:
#   - TTS server running at 127.0.0.1:8181 with q4 model loaded
#   - pilotty installed
#   - pi installed

source "$(dirname "$0")/helpers.sh"

echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  pi-voice Toggle Test Suite  ${RESET}"
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

# ── Test 1: Status bar shows ♪ after startup ──────────────────────
log_step "1. Status bar shows ♪ after pi startup"

TEXT=$(snapshot_text)
assert_match "Music note (♪) visible in status bar" "♪" "$TEXT"

# ── Test 2: alt+v toggles TTS off ─────────────────────────────────
log_step "2. alt+v toggles TTS off — notification shows disabled"

HASH=$(snapshot_content_hash)
send_key Alt+v
TEXT=$(await_change_and_snapshot_text "$HASH" 200 5000)

assert_match "Notification shows disabled" "disabled" "$TEXT"

# ── Test 3: alt+v does NOT modify voice.json ──────────────────────
log_step "3. alt+v does NOT modify ~/.pi/voice/config.json"

FILE_ENABLED=$(cat "$HOME/.pi/voice/config.json" | jq -r '.enabled')
assert_equals "config.json still has enabled=true" "true" "$FILE_ENABLED"

# ── Test 4: alt+v toggles back on ─────────────────────────────────
log_step "4. alt+v toggles TTS back on — notification shows enabled"

HASH=$(snapshot_content_hash)
send_key Alt+v
TEXT=$(await_change_and_snapshot_text "$HASH" 200 5000)

assert_match "Notification shows enabled" "enabled" "$TEXT"

# ── Test 5: ♪ visible after toggling off and on ───────────────────
log_step "5. ♪ visible after toggling off and on"

assert_match "Music note still visible" "♪" "$TEXT"

# ── Cleanup ────────────────────────────────────────────────────────
log_step "Cleanup"
kill_session
restore_config

print_summary
