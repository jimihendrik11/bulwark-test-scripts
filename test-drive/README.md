# Test Drive harness

Runs Brake Check and Key Check for one ERC-20 on a fork of Robinhood Chain.

- `test-drive.sh` in the repository root is the entry point.
- `thresholds.json` holds the light bands and is bound to `signoff.json` by a SHA-256 hash.
- Results land in `results/TD-<address>.json` in the repository root.
- The GitHub workflow runs the same script, then publishes the result file and `results/manifest.json` back to this repository, which is what the site reads.

Fork from a recent block: the public RPC keeps only recent state, so a block that is too old cannot be replayed.
