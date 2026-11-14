<div align="center">

![BULWARK](./assets/readme-hero.png)

# BULWARK test scripts

**First live fork execution: Compound V3 USDC, two scenarios, real numbers**

<br>

<a href="https://bulwarkproof.tech"><img src="https://img.shields.io/badge/OPEN_THE_SITE-7C1522?style=for-the-badge&labelColor=241B19" alt="Open the site"></a>
<a href="https://bulwarkproof.tech/ratings/compound-v3/"><img src="https://img.shields.io/badge/CR--1029-REPORT-E0A82E?style=for-the-badge&labelColor=241B19" alt="CR-1029 report"></a>
<a href="https://gitlab.com/razorxpredator/bulwark"><img src="https://img.shields.io/badge/PLATFORM-REPO-C94B4B?style=for-the-badge&labelColor=241B19" alt="Platform repository"></a>
<a href="https://x.com/BulwarkScore"><img src="https://img.shields.io/badge/X-@BulwarkScore-000000?style=for-the-badge&labelColor=241B19" alt="X"></a>

</div>

---

This repository runs two of the five BULWARK scenarios against Compound V3 USDC on an Ethereum mainnet fork. Every step is a contract call. The numbers below come from `results/CR-1029.json`, not from a written report.

This is not a complete Crash Report. Two of five scenarios were executed, for one protocol.

| Item | Value |
|---|---|
| Report | CR-1029, Compound V3, USDC market |
| Chain | Ethereum, chain ID 1 |
| Fork block | 26404380 |
| Command | `RPC_URL=<endpoint> ./run.sh CR-1029` |
| Runtime | Foundry, Node.js 18 or newer |

## Results at the fork block

Rear Impact, 30 percent of supplied USDC withdrawn at once:

| Measure | Value |
|---|---|
| Total supply | 357,646,821.51 USDC |
| Cash in the market before the run | 47,923,257.93 USDC |
| Withdrawal demand, 30 percent | 107,294,046.45 USDC |
| Actually withdrawn by three suppliers | 37,801,885.24 USDC, 35.23 percent of demand |
| Utilisation before and after | 89.01 percent to 99.53 percent |
| First revert, supplier 1 | `ERC20: transfer amount exceeds balance` for 69,492,161.21 USDC |
| Additional amount after 24 hours | 0.00 USDC |

Pole Test, one privileged key assumed misused:

| Measure | Value |
|---|---|
| Pause guardian | 0xbbf3f1421D886E9b2c5D716B5192aC998af2012c |
| Effect of a pause | withdrawals revert, funds frozen, not lost |
| Effect of an unpause | withdrawals work again |
| Upgrade path | governor proposal, then timelock, then proxy admin upgrade |
| Timelock delay | 172800 seconds, 48 hours |
| Amount a timelock upgrade can move | 47,923,256.93 USDC |

## How to re-run

```bash
git clone https://gitlab.com/razorxpredator/bulwark-test-scripts
cd bulwark-test-scripts
curl -L https://foundry.paradigm.xyz | bash && foundryup
export RPC_URL=<your own Ethereum archive endpoint>
./run.sh CR-1029
```

The last line is `MATCH` when the numbers equal `results/CR-1029.json`, and `MISMATCH` with both sets printed when they do not. On Windows, `run.ps1 CR-1029` does the same after `$env:RPC_URL` is set.

Pipelines run the same command with `RPC_URL_ARCHIVE` stored as a masked CI variable and keep the result file, the full log and the raw test output as artifacts. The public run for this report lives at [GitHub Actions](https://github.com/jimihendrik11/bulwark-test-scripts/actions). The same job is kept at `ci/gitlab.yml`; copy it to `.gitlab-ci.yml` to run the pipeline on GitLab as well.

## How to verify

1. Read `reports/CR-1029/config.json` for the fork block and every contract address.
2. Open the Comet proxy at `0xc3d688B66703497DAA19211EEdff47f25384cdc3` on Etherscan and confirm the implementation matches `0x0B07565A8ef48170e15918b251EbD95109B23255` in the Read as Proxy tab.
3. Call `governor()` and `pauseGuardian()` on the proxy and compare them with the values in the result file.
4. Call `totalSupply()` and check the USDC balance of the proxy at block 26404380 with a block-specific query.
5. Compare `results/CR-1029.json` with the run output printed by `./run.sh`.

What the numbers mean: `requestedUsdc` is 30 percent of supply at the fork block, `fulfilledUsdc` is what actually left the market, `fulfilledPct` is the ratio of the two, `utilizationBefore` and `utilizationAfter` come from `getUtilization()`, and `firstRevert` records the first supplier whose withdrawal reverted along with the revert string.

## Layout

```text
foundry.toml               Solidity 0.8.24, via-ir
run.sh, run.ps1            one command: test, build the result, compare
reports/CR-1029/           fork block, addresses, parameters, thresholds
test/CR-1029/              RearImpact.t.sol, PoleTest.t.sol, shared helpers
script/report.mjs          turns test output into results/CR-1029.json
script/classify.mjs        the band rules shared by the report and the preview
script/preview.mjs         prints the band per scenario, no RPC needed
script/signoff.mjs         writes or verifies the threshold signature
reports/CR-1029/signoff.json  signer, date and the threshold hash
results/CR-1029.json       the recorded numbers
scenarios/                 one document per scenario
reports/CR-1001/           earlier report configuration, not executed on a fork
assets/                    README artwork
```

## Test Drive

Automated fork checks for a single ERC-20 on Robinhood Chain, published as dashboard lights instead of a rating.

```bash
./test-drive.sh 0x39dBED3a2bd333467115dE45665cC57F813C4571
RPC_URL=<your archive rpc> BLOCK_NUMBER=113441500 ./test-drive.sh 0x39...
```

What runs:

- Brake Check buys the token at three sizes on a fresh address, sells the whole balance back, then repeats one buy after a one hour warp. It reports whether a sell reverted, with the reason, and the round trip cost above the pool fee.
- Key Check reads `owner()`, `getOwner()` and `admin()`, classifies the holder as a wallet, multisig, timelock or none, then tries mint, pause, blacklist, fee, upgrade and ownership transfer calls from that key.

Lights come from `test-drive/thresholds.json`, which is bound to `test-drive/signoff.json` by a SHA-256 hash. The report script refuses to write a result when the thresholds changed without a new signature.

Structure:

```text
test-drive.sh                    one command, resolves the head block, runs the fork, writes the report
test-drive/foundry.toml          separate workspace so the CR-1029 run is untouched
test-drive/test/TestDrive.t.sol  Brake and Key checks, writes raw JSON
test-drive/thresholds.json       light bands
test-drive/signoff.json          signer, date and threshold hash
script/test-drive-signoff.mjs    writes or verifies the threshold signature
script/test-drive-report.mjs     turns raw output into results/TD-<address>.json
```

Limits worth reading before quoting a light: the result holds for the recorded block, a token can behave differently on mainnet, the public RPC keeps only recent state so a re-run needs the same block while it is still served, and Fuel Check plus Traffic Check are not part of this release.

### Requesting a run without a paid server

The fork runs on GitHub Actions, so no Render worker is needed.

```bash
node script/test-drive-dispatch.mjs 0x39dBED3a2bd333467115dE45665cC57F813C4571          # dry run
GH_TOKEN=<token> node script/test-drive-dispatch.mjs 0x39dBED3a2bd333467115dE45665cC57F813C4571 --send
```

The same run can be started from Actions, workflow `Test Drive request`, without any token on your side. The workflow runs the fork, commits `results/TD-<address>.json` back to the repository and uploads the artifact.

RPC: any endpoint that serves Robinhood Chain works. If Alchemy lists this chain, store the URL as the repository secret `ALCHEMY_RPC_URL` and the workflow uses it; otherwise the public RPC is the default. Redis is not used by this path. For a future always-on request API, Redis Cloud's 30 MB free plan gives the standard TCP endpoint that BullMQ needs; Upstash's free plan is built around its REST API, so confirm its TCP/TLS endpoint is available before depending on it.

## Status of the other reports

`reports/CR-1001` and `results/CR-1001.json` came from the first published script set. They read the chain ID, the block number and the contract bytecode of deBridge, and they did not execute a scenario. That folder stays for reference and is not evidence of an execution.

The three scenarios not run for CR-1029 are Frontal Drain, Side Impact and Rollover. Their status on the site stays Review.

## Thresholds

The held, degraded and failed bands were written into `reports/CR-1029/config.json` before the first run and are unchanged:

| Scenario | Held | Degraded | Failed |
|---|---|---|---|
| Rear Impact | every withdrawal clears with slippage under 1 percent | up to 5 percent cost, or a queue of up to 72 hours | beyond that, or a withdrawal that never clears |
| Pole Test | a single key cannot move funds and cannot block them | a single key can pause or freeze without loss | a single key can drain funds |

Both definitions are copied from `scenarios/rear-impact.md` and `scenarios/pole-test.md` and were written into the config before the first run. Against them, Rear Impact records a failed result and Pole Test records a degraded one, because the pause guardian can freeze withdrawals even though no single key can move funds.

## Thresholds and signature

The bands are signed before a result can be recorded. The signature binds to the exact threshold text by hash, so editing a band invalidates it until it is signed again.

```bash
node script/signoff.mjs --report CR-1029 --verify   # check the signature against the current bands
node script/preview.mjs                             # print the band each scenario lands in
node script/preview.mjs --singleKey=true            # same check with a different assumption
```

`script/preview.mjs` reads the recorded result and needs no RPC and no fork, so the band logic can be inspected at any time. It writes nothing. Its flags change one assumption at a time to show which band would follow.

## Privacy Rings, independent on-chain verification

This is an independent on-chain verification, not a Crash Report. It carries no score and no stars, and it is published so that anyone can check the same facts with one command.

The check reads the program, the upgrade authority, the authorities held by the protocol config account and the permission flags, then compares the deployed program bytes with the released build. No transaction is sent and no proof is involved. Phases 2 to 4 in the test plan need a localnet with the prover and are out of scope for this publication.

```bash
bash run-phase1.sh          # read the chain and compare with the recorded result
bash run-phase1.sh --create # write a fresh result
```

The output is `results/PRV-RINGS-phase1.json`, and the run prints MATCH when the on-chain facts equal the recorded ones. The slot changes on every run, so it is printed but not compared.

Build verification runs inside the same command and writes `results/PRV-RINGS-build.json`. The released `shielded_pool_program.so` from `shielded-pool-v1.0.0` was hashed, checked against the published `SHA256SUMS`, then compared byte by byte with the first bytes of the deployed ProgramData payload. The two match: 634,120 bytes, SHA-256 `dc68dd27...8030a2`, followed only by zero padding on chain.

## Related

| Where | What |
|---|---|
| [bulwarkproof.tech](https://bulwarkproof.tech) | Ratings board and Crash Reports |
| [Contract register](https://bulwarkproof.tech/contracts/) | Every BULWARK address, checkable from the page |
| [Test Protocol](https://bulwarkproof.tech/test-protocol/) | Rules, weights and scenario definitions |

## License

MIT, see [LICENSE](./LICENSE).

The site reads results/ and results/manifest.json from this repository at runtime, so a published run appears on bulwarkproof.tech without rebuilding the site.

