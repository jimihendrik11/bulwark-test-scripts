#!/usr/bin/env bash
# Test Drive: Brake Check and Key Check for one ERC-20 on a Robinhood Chain fork.
set -euo pipefail

ADDRESS="${1:-0x39dBED3a2bd333467115dE45665cC57F813C4571}"
RPC="${RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
BLOCK="${BLOCK_NUMBER:-0}"

if [ "$BLOCK" = "0" ] && command -v cast >/dev/null 2>&1; then
  BLOCK="$(cast block-number --rpc-url "$RPC")"
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

node script/test-drive-signoff.mjs --verify

cd "$ROOT/test-drive"
TEST_DRIVE_RPC="$RPC" \
TEST_DRIVE_TOKEN="$ADDRESS" \
TEST_DRIVE_BLOCK="$BLOCK" \
forge test --match-contract TestDriveTest --match-test testDrive -vv

cd "$ROOT"
node script/test-drive-report.mjs
