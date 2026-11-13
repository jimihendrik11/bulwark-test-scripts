# BULWARK test scripts

Re-runnable checks for a published BULWARK Crash Report.

## What this repository does

- Reads the report configuration in `reports/CR-XXXX/config.json`.
- Connects to a JSON-RPC endpoint for the chain in that configuration.
- Verifies the chain ID, the recorded addresses and the token values that the report relies on.
- Compares the live values with `results/CR-XXXX.json` and prints a pass or fail line per check.

## What this repository does not do

Scenario outcomes, such as Frontal Drain or Rear Impact, are copied from the published report as reference values. Re-executing a scenario needs the protocol fixture and a fork runner, which are not part of this snapshot. The script never claims a scenario was re-run.

## Run

```bash
git clone <repository-url> && cd bulwark-test-scripts
RPC_URL=https://ethereum-rpc.publicnode.com ./run.sh CR-1001
```

Node.js 18 or newer is required.

## Layout

```text
run.sh                     entry point
run.mjs                    checks and comparison
scenarios/                 one document per scenario
reports/CR-XXXX/           chain, addresses and reference outcome
results/CR-XXXX.json       output of the last run
LICENSE
```

## Status

The published fork block for this report is a placeholder and is marked as such in the configuration. It must be replaced with the real block before the folder is cited as evidence.
