#!/bin/bash
# Run all pi-voice pilotty tests.
#
# Prerequisites:
#   - TTS server running: npm run server
#   - q4 model downloaded and activated
#   - pilotty installed
#   - pi installed with a working model
#
# Usage:
#   bash tests/run.sh              # run all tests
#   bash tests/run.sh tui          # run only TUI test
#   bash tests/run.sh toggle       # run only toggle test

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

# Select tests
TESTS=( "$@" )
if [ ${#TESTS[@]} -eq 0 ]; then
  TESTS=(tui toggle queue)
fi

TOTAL_PASSED=0
TOTAL_FAILED=0
RESULTS=()

for test_name in "${TESTS[@]}"; do
  test_file="$SCRIPT_DIR/${test_name}.sh"
  if [ ! -f "$test_file" ]; then
    echo -e "${RED}Unknown test: $test_name${RESET}"
    echo "Available: tui, toggle"
    exit 1
  fi

  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  Running: $test_name${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

  if bash "$test_file"; then
    RESULTS+=("$test_name: ${GREEN}PASSED${RESET}")
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
  else
    RESULTS+=("$test_name: ${RED}FAILED${RESET}")
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi
done

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Overall Results${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${RESET}"
for result in "${RESULTS[@]}"; do
  echo -e "  $result"
done
echo ""
if [ $TOTAL_FAILED -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  All test suites passed! ($TOTAL_PASSED/$((TOTAL_PASSED + TOTAL_FAILED)))${RESET}"
else
  echo -e "${RED}${BOLD}  $TOTAL_FAILED suite(s) failed ($TOTAL_PASSED/$((TOTAL_PASSED + TOTAL_FAILED)) passed)${RESET}"
fi
echo -e "${BOLD}════════════════════════════════════════════════════════════════════${RESET}"

[ $TOTAL_FAILED -eq 0 ]
