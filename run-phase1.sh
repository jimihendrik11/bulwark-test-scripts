#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. Install Node.js 18 or newer." >&2
  exit 1
fi

echo "report PRV-RINGS phase 1 | rpc ${SOLANA_RPC:-https://api.mainnet-beta.solana.com}"
node script/build-verify.mjs
node script/phase1.mjs "$@"
