#!/bin/bash
# Shared helpers for pi-voice pilotty tests.
# Source this file: source "$(dirname "$0")/helpers.sh"

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────
PACKAGE_DIR="/Users/simo/Developer/pi-voice"
SERVER_URL="http://127.0.0.1:8181"
SESSION_PREFIX="voice-test"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILURES=()

# ── Logging ────────────────────────────────────────────────────────
log_step() {
  echo -e "\n${BOLD}=== $* ===${RESET}"
}

log_info() {
  echo -e "  ${DIM}$*${RESET}"
}

log_pass() {
  echo -e "  ${GREEN}✓ $*${RESET}"
}

log_fail() {
  echo -e "  ${RED}✗ $*${RESET}"
}

log_warn() {
  echo -e "  ${YELLOW}⚠ $*${RESET}"
}

# ── Assertions ─────────────────────────────────────────────────────
assert_match() {
  local description="$1"
  local pattern="$2"
  local text="$3"
  TESTS_RUN=$((TESTS_RUN + 1))

  if echo "$text" | grep -q -- "$pattern"; then
    log_pass "$description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_fail "$description — pattern not found: '$pattern'"
    FAILURES+=("$description")
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

assert_no_match() {
  local description="$1"
  local pattern="$2"
  local text="$3"
  TESTS_RUN=$((TESTS_RUN + 1))

  if ! echo "$text" | grep -q -- "$pattern"; then
    log_pass "$description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_fail "$description — pattern should not be present: '$pattern'"
    FAILURES+=("$description")
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

assert_equals() {
  local description="$1"
  local expected="$2"
  local actual="$3"
  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$expected" = "$actual" ]; then
    log_pass "$description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_fail "$description — expected '$expected', got '$actual'"
    FAILURES+=("$description")
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

assert_not_empty() {
  local description="$1"
  local value="$2"
  TESTS_RUN=$((TESTS_RUN + 1))

  if [ -n "$value" ]; then
    log_pass "$description"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_fail "$description — value is empty"
    FAILURES+=("$description")
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ── Pilotty wrappers ───────────────────────────────────────────────
# All wrappers use the global $SESSION_NAME.

snapshot_text() {
  pilotty snapshot -s "$SESSION_NAME" --format text 2>&1 | tail -n +2
  # tail strips the "--- Terminal NxN | Cursor: (...) ---" header line
}

snapshot_json() {
  pilotty snapshot -s "$SESSION_NAME" 2>&1
}

snapshot_content_hash() {
  snapshot_json | jq -r '.content_hash'
}

wait_for_change() {
  local hash="$1"
  local settle="${2:-100}"
  local timeout="${3:-5000}"
  pilotty snapshot -s "$SESSION_NAME" --await-change "$hash" --settle "$settle" -t "$timeout" 2>&1 > /dev/null
}

send_key() {
  pilotty key -s "$SESSION_NAME" "$1" 2>&1 > /dev/null
}

send_type() {
  pilotty type -s "$SESSION_NAME" "$1" 2>&1 > /dev/null
}

await_change_and_snapshot_text() {
  local hash="$1"
  local settle="${2:-100}"
  local timeout="${3:-5000}"
  wait_for_change "$hash" "$settle" "$timeout"
  snapshot_text
}

# ── Session lifecycle ──────────────────────────────────────────────
spawn_pi() {
  SESSION_NAME="${SESSION_PREFIX}-$$"
  log_info "Spawning pi in session '$SESSION_NAME'..."
  pilotty spawn --name "$SESSION_NAME" --cwd "$PACKAGE_DIR" -- pi -ne -e . --no-session 2>&1 > /dev/null
}

wait_for_pi() {
  local timeout="${1:-15000}"
  log_info "Waiting for pi to be ready (timeout ${timeout}ms)..."
  pilotty wait-for -s "$SESSION_NAME" "[Skills]" -t "$timeout" 2>&1 > /dev/null
  log_info "Pi is ready"
}

kill_session() {
  if [ -n "${SESSION_NAME:-}" ]; then
    pilotty kill -s "$SESSION_NAME" 2>/dev/null || true
  fi
}

# ── Server checks ──────────────────────────────────────────────────
require_server() {
  local health
  health=$(curl -sf "$SERVER_URL/health" 2>/dev/null) || {
    echo -e "${RED}FATAL: TTS server not running at $SERVER_URL${RESET}"
    echo "Start it with: npm run server"
    exit 1
  }
  local model_loaded
  model_loaded=$(echo "$health" | jq -r '.modelLoaded')
  if [ "$model_loaded" != "true" ]; then
    echo -e "${RED}FATAL: TTS server running but no model loaded${RESET}"
    echo "Download a model: curl -X POST $SERVER_URL/models/download -d '{\"dtype\":\"q4\"}'"
    exit 1
  fi
  log_info "Server healthy, model loaded"
}

# ── Summary ────────────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "${BOLD}════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  Results: $TESTS_PASSED/$TESTS_RUN passed${RESET}"
  if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}  Failed:${RESET}"
    for f in "${FAILURES[@]}"; do
      echo -e "${RED}    - $f${RESET}"
    done
    echo -e "${BOLD}════════════════════════════════════════${RESET}"
    return 1
  else
    echo -e "${GREEN}  All tests passed!${RESET}"
    echo -e "${BOLD}════════════════════════════════════════${RESET}"
    return 0
  fi
}

# Cleanup on exit
on_exit() {
  kill_session
}
trap on_exit EXIT
