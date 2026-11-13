#!/usr/bin/env bash
set -euo pipefail

REPORT="${1:-CR-1029}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -z "${RPC_URL:-}" ]; then
  echo "RPC_URL is not set. Point it at an Ethereum archive endpoint." >&2
  exit 1
fi

if ! command -v forge >/dev/null 2>&1; then
  echo "forge not found. Install Foundry from https://getfoundry.sh" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Install Node.js 18 or newer." >&2
  exit 1
fi

FORK_BLOCK="$(node -p "require('./reports/${REPORT}/config.json').forkBlock")"

echo "report ${REPORT} | fork block ${FORK_BLOCK} | rpc ${RPC_URL%%\?*}"
mkdir -p out
forge test --fork-url "$RPC_URL" --fork-block-number "$FORK_BLOCK" -vv
node script/report.mjs --report "$REPORT" --compare
