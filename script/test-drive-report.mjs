#!/usr/bin/env node
// Converts raw fork output into a Test Drive result with dashboard lights.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const rawPath = process.env.TEST_DRIVE_RAW || join(root, 'test-drive', 'results', 'td-raw.json');
const thresholdsPath = join(root, 'test-drive', 'thresholds.json');
const signoffPath = join(root, 'test-drive', 'signoff.json');
const outDir = join(root, 'results');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

if (!existsSync(rawPath)) {
  console.error(`missing raw result at ${rawPath}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const thresholds = JSON.parse(readFileSync(thresholdsPath, 'utf8'));
const signed = existsSync(signoffPath) ? JSON.parse(readFileSync(signoffPath, 'utf8')) : null;
const hash = createHash('sha256').update(canonical(thresholds)).digest('hex');

if (!signed || signed.hash !== hash) {
  console.error('thresholds are not signed; run node script/test-drive-signoff.mjs first');
  process.exit(2);
}

const brakeThresholds = thresholds.brake;
const dangerous = new Set(thresholds.keys.dangerousPowers);
const sizeRuns = raw.brake?.sizes || [];
const delayedRun = raw.brake?.delayed;
const allRuns = delayedRun ? [...sizeRuns, delayedRun] : sizeRuns;
const maxExtra = allRuns.reduce((acc, run) => Math.max(acc, Number(run.extraLossBps || 0)), 0);
const poolFeeBps = Number(raw.pool?.fee || 0) / 100;

let brakeLight;
if (!raw.pool?.found) brakeLight = 'grey';
else if (raw.brake?.sellReverted) brakeLight = 'red';
else if (maxExtra > brakeThresholds.redAboveBps) brakeLight = 'red';
else if (maxExtra > brakeThresholds.amberAboveBps) brakeLight = 'amber';
else brakeLight = 'green';

const powers = raw.keys?.powers || [];
const dangerousPowers = powers.filter((power) => dangerous.has(power));
let keysLight;
if (raw.keys?.ownerType === 'none' || !raw.keys?.owner) keysLight = 'grey';
else if (raw.keys.ownerType === 'eoa' && dangerousPowers.length > 0) keysLight = 'red';
else if (powers.length > 0) keysLight = 'amber';
else keysLight = 'green';

const canStillChange = [];
if (raw.keys?.ownerType === 'eoa') canStillChange.push('Owner is a single wallet and can change token behaviour');
if (raw.keys?.ownerType === 'multisig') canStillChange.push('Owner is a multisig and can change token behaviour');
if (raw.keys?.ownerType === 'timelock') canStillChange.push('Owner is a timelock and can change token behaviour after a delay');
if (powers.includes('mint')) canStillChange.push('Owner can mint new supply');
if (powers.includes('blacklist')) canStillChange.push('Owner can blacklist a wallet');
if (powers.includes('pause')) canStillChange.push('Owner can pause transfers');
if (powers.includes('setFee')) canStillChange.push('Owner can change the transfer fee');
if (powers.includes('upgradeTo')) canStillChange.push('Owner can upgrade the token contract');
if (canStillChange.length === 0) {
  canStillChange.push('No owner entry point is exposed, so privileges could not be resolved by this check');
}

const ranAt = raw.timestamp ? new Date(Number(raw.timestamp) * 1000).toISOString() : new Date().toISOString();
const address = raw.token.address.toLowerCase();

const result = {
  kind: 'test_drive',
  notARating: true,
  label: 'Automated Test Drive. Not a BULWARK rating.',
  chain: 'robinhood',
  chainId: Number(raw.chainId),
  block: raw.block,
  evmBlockNumber: raw.evmBlockNumber || null,
  ranAt,
  token: {
    address,
    name: raw.token.name,
    symbol: raw.token.symbol,
    decimals: raw.token.decimals,
    totalSupply: raw.token.totalSupply,
    verifiedSource: null,
    notes: ['Source verification is not part of this run; the explorer blocks scripted checks.'],
  },
  pool: {
    address: raw.pool.address,
    feeBps: poolFeeBps,
    liquidity: raw.pool.liquidity,
    kind: 'uniswap-v3',
  },
  checks: {
    brake: {
      light: brakeLight,
      sellOk: !(raw.brake?.sellReverted),
      poolFeeBps,
      extraLossBps: maxExtra,
      firstRevert: raw.brake?.firstSellRevert || '',
      runs: sizeRuns,
      delayedRun: delayedRun || null,
      notes: raw.brake?.sellReverted
        ? [`A sell reverted: ${raw.brake.firstSellRevert}`]
        : ['Round trips ran at three sizes plus one after a one hour warp.'],
    },
    keys: {
      light: keysLight,
      owner: raw.keys?.owner || '0x0000000000000000000000000000000000000000',
      ownerType: raw.keys?.ownerType || 'none',
      paused: raw.keys?.paused,
      powers,
      attempts: raw.keys?.attempts || [],
      notes:
        raw.keys?.ownerType === 'none'
          ? ['owner(), getOwner() and admin() are not exposed, so privileged access could not be resolved.']
          : [`Owner type read as ${raw.keys.ownerType}.`],
    },
  },
  canStillChange,
  thresholdsVersion: thresholds.version,
  thresholdsHash: hash,
  signedBy: `${signed.signer}, ${signed.role}`,
  rerun: `RPC_URL=<your rpc> ./test-drive.sh ${address}`,
};

mkdirSync(outDir, { recursive: true });
const outPath = process.env.TEST_DRIVE_RESULT || join(outDir, `TD-${address}.json`);
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(`Test Drive ${result.token.symbol} block ${result.block}`);
console.log(`Brake   ${result.checks.brake.light}  sellOk=${result.checks.brake.sellOk} extraLossBps=${result.checks.brake.extraLossBps}`);
console.log(`Keys    ${result.checks.keys.light}  ownerType=${result.checks.keys.ownerType} powers=${powers.join(',') || 'none'}`);
console.log(`Wrote ${outPath}`);
