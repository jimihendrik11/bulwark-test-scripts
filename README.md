<div align="center">

![BULWARK](./assets/readme-hero.png)

# BULWARK test scripts

**Re-runnable checks for a published Crash Report**

<br>

<a href="https://bulwarkproof.tech"><img src="https://img.shields.io/badge/OPEN_THE_SITE-7C1522?style=for-the-badge&labelColor=241B19" alt="Open the site"></a>
<a href="https://bulwarkproof.tech/ratings/debridge/"><img src="https://img.shields.io/badge/CR--1001-REPORT-E0A82E?style=for-the-badge&labelColor=241B19" alt="CR-1001 report"></a>
<a href="https://gitlab.com/razorxpredator/bulwark"><img src="https://img.shields.io/badge/PLATFORM-REPO-C94B4B?style=for-the-badge&labelColor=241B19" alt="Platform repository"></a>
<a href="https://x.com/BulwarkScore"><img src="https://img.shields.io/badge/X-@BulwarkScore-000000?style=for-the-badge&labelColor=241B19" alt="X"></a>

</div>

---

Every BULWARK Crash Report claims it can be re-run. This repository is the proof for the first published report, CR-1001.

One command reads the report configuration, connects to a public RPC for the reported chain, re-reads every value the report relies on, and compares the output with the recorded result.

| Item | Value |
|---|---|
| Report | CR-1001, deBridge, Bridges and cross-chain |
| Chain | Ethereum, chain ID 1 |
| Command | `RPC_URL=<endpoint> ./run.sh CR-1001` |
| Runtime | Node.js 18 or newer, no other dependency |

## Quick start

```bash
git clone https://gitlab.com/razorxpredator/bulwark-test-scripts.git
cd bulwark-test-scripts
RPC_URL=https://ethereum-rpc.publicnode.com ./run.sh CR-1001
```

The script prints one line per check, then the reference outcome, then PASS.

## What it checks

| Check | Source |
|---|---|
| Chain ID matches the report | `eth_chainId` on the RPC |
| Latest block is readable | `eth_blockNumber` on the RPC |
| Each recorded address still holds code | `eth_getCode` per address |

The output is written to `results/CR-1001.json` and compared against the file already in this repository.

## What it does not do

Scenario outcomes such as Frontal Drain or Rear Impact are carried as reference values from the published report. Re-executing a scenario needs the protocol fixture and a fork runner, which are not part of this snapshot. Nothing here claims a scenario was re-run.

The fork block recorded in the configuration is a placeholder inherited from the published report and is marked as such. It is replaced once a real fork run is recorded.

## Layout

```text
run.sh                     entry point
run.mjs                    checks, comparison and output
scenarios/                 one document per scenario
reports/CR-1001/           chain, addresses and reference outcome
results/CR-1001.json       output of the last run
assets/                    README artwork
LICENSE
```

## Adding a report

1. Create `reports/CR-XXXX/config.json` with the report id, chain, chain ID, contract addresses and the reference outcome.
2. Create `results/CR-XXXX.json` with an empty checks array.
3. Run `RPC_URL=<endpoint> ./run.sh CR-XXXX` and commit the produced result.

## Related

| Where | What |
|---|---|
| [bulwarkproof.tech](https://bulwarkproof.tech) | Ratings board and Crash Reports |
| [Contract register](https://bulwarkproof.tech/contracts/) | Every BULWARK address, checkable from the page |
| [Test Protocol](https://bulwarkproof.tech/test-protocol/) | Rules, weights and scenario definitions |

## License

MIT, see [LICENSE](./LICENSE).
