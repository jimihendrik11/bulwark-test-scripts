#!/usr/bin/env bash
set -euo pipefail
if [ -z "${1:-}" ]; then echo "usage: RPC_URL=<endpoint> ./run.sh CR-1001"; exit 2; fi
exec node run.mjs "$1"
