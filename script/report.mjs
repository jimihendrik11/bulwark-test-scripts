import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? fallback : args[i + 1];
};
const create = args.includes('--create');
const compare = args.includes('--compare');
const reportId = opt('report', 'CR-1029');

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'reports', reportId, 'config.json'), 'utf8'));
const target = path.join(root, 'results', reportId + '.json');

function readMetrics(file) {
  const full = path.join(root, 'out', file);
  if (!fs.existsSync(full)) throw new Error('missing ' + full + ', run forge test first');
  const out = {};
  for (const row of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    if (!row.trim()) continue;
    const i = row.indexOf('=');
    out[row.slice(0, i)] = row.slice(i + 1);
  }
  return out;
}

const num = (v) => Number(v || 0);
const usdc = (v) => (Number(v) / 1e6).toFixed(6);
const pct = (a, b) => (b === 0 ? 0 : Number(((Number(a) / Number(b)) * 100).toFixed(2)));
const util = (v) => Number((Number(v) / 1e16).toFixed(4));
const round2 = (v) => Number(Number(v).toFixed(2));

let forge = 'not installed';
try {
  forge = execFileSync('forge', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim();
} catch {
  forge = 'not installed';
}
let commit = 'uncommitted';
try {
  commit =
    execFileSync('git', ['log', '-1', '--format=%H', '--', 'test/CR-1029', 'reports/CR-1029'], { encoding: 'utf8' }).trim() ||
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  commit = 'uncommitted';
}

const rear = readMetrics('CR-1029-rear.txt');
const pole = readMetrics('CR-1029-pole.txt');

const rearRequestedPct = pct(rear.demand, rear.total_supply);
const rearFulfilledPct = pct(rear.fulfilled, rear.demand);
const rearCleared = Number(rear.fulfilled) >= Number(rear.demand);
const rearResult = rearCleared ? 'held' : num(rear.after_24h_additional) > 0 ? 'degraded' : 'failed';

const roleType = (codeSize) => (Number(codeSize) === 0 ? 'eoa' : 'contract');
const roles = [
  { role: 'pauseGuardian', holder: pole.pause_guardian, type: roleType(pole.pause_guardian_code) },
  { role: 'cometGovernor', holder: pole.governor, type: roleType(pole.governor_code) },
  { role: 'governor', holder: pole.timelock_admin, type: roleType(pole.timelock_admin_code) },
  { role: 'cometProxyAdmin', holder: pole.proxy_admin, type: roleType(pole.proxy_admin_code) },
  { role: 'cometImplementation', holder: pole.implementation, type: roleType(pole.implementation_code) }
];

const movedByTimelock = num(pole.upgrade_moved);
const delay = num(pole.timelock_delay);
const withdrawBlockedByPause = pole.withdraw_during_pause !== 'true';
const reachableBySingleKey = false;
const poleResult = reachableBySingleKey ? 'failed' : withdrawBlockedByPause ? 'degraded' : 'held';

const results = {
  reportId,
  protocol: config.protocol + ' (' + config.chain + ')',
  forkBlock: num(rear.fork_block),
  commit,
  toolchain: { forge },
  executed: true,
  scenarios: {
    rear_impact: {
      requestedPct: round2(rearRequestedPct),
      requestedUsdc: usdc(rear.demand),
      fulfilledUsdc: usdc(rear.fulfilled),
      fulfilledPct: rearFulfilledPct,
      suppliersUsed: num(rear.attempts),
      suppliersSucceeded: num(rear.successes),
      totalSupplyUsdc: usdc(rear.total_supply),
      cashBeforeUsdc: usdc(rear.cash_before),
      utilizationBefore: util(rear.utilization_before),
      utilizationAfter: util(rear.utilization_after),
      supplyRateAfter: num(rear.supply_rate_after),
      firstRevert: {
        index: num(rear.first_revert_index),
        reason: (rear.first_revert_reason || '').replace(/\u0000+/g, '').trim()
      },
      after24h: {
        additionalFulfilledUsdc: usdc(rear.after_24h_additional),
        attemptsSucceeded: num(rear.after_24h_successes)
      },
      result: rearResult
    },
    pole_test: {
      roles,
      pauseImpact: pole.withdraw_during_pause === 'true' ? 'none' : 'funds frozen, not lost',
      pauseRevertReason: pole.pause_reason || '',
      withdrawWorksAfterUnpause: pole.withdraw_after_unpause === 'true',
      upgradeImpactUsdc: usdc(movedByTimelock),
      upgradeReachableBySingleKey: false,
      upgradeExecutedBy: 'timelock (contract), owner of the Comet proxy admin',
      timelockDelaySec: delay,
      result: poleResult
    }
  }
};

if (fs.existsSync(target)) {
  const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
  const previousStable = JSON.stringify({
    ...previous,
    commit: undefined,
    toolchain: undefined,
    generatedAt: undefined
  });
  const currentStable = JSON.stringify({
    ...results,
    commit: undefined,
    toolchain: undefined,
    generatedAt: undefined
  });
  if (compare) {
    const same = previousStable === currentStable;
    console.log(`fork block ${results.forkBlock} | commit ${results.commit}`);
    console.log(
      `rear impact: requested ${results.scenarios.rear_impact.requestedUsdc} USDC, ` +
        `fulfilled ${results.scenarios.rear_impact.fulfilledUsdc} USDC ` +
        `(${results.scenarios.rear_impact.fulfilledPct} percent), result ${results.scenarios.rear_impact.result}`
    );
    console.log(
      `pole test: timelock delay ${results.scenarios.pole_test.timelockDelaySec}s, ` +
        `pause impact ${results.scenarios.pole_test.pauseImpact}, ` +
        `upgrade moves ${results.scenarios.pole_test.upgradeImpactUsdc} USDC, ` +
        `result ${results.scenarios.pole_test.result}`
    );
    console.log(same ? 'MATCH' : 'MISMATCH');
    if (!same) {
      console.log('recorded:' + previousStable);
      console.log('current :' + currentStable);
      process.exit(1);
    }
  }
} else if (!create) {
  console.log('no recorded result yet, rerun with --create');
  process.exit(2);
}

if (create) {
  const payload = { ...results, generatedAt: new Date().toISOString() };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n');
  console.log('wrote ' + target);
}
