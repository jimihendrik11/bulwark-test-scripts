import fs from 'node:fs';
import path from 'node:path';
import { rearBand, poleBand, REAR_REASON, POLE_REASON } from './classify.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? fallback : args[i + 1];
};
const reportId = opt('report', 'CR-1029');
const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'reports', reportId, 'config.json'), 'utf8'));
const resultsPath = path.join(root, 'results', reportId + '.json');
if (!fs.existsSync(resultsPath)) {
  console.error('no recorded result, run ./run.sh ' + reportId + ' first');
  process.exit(2);
}
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const signoffPath = path.join(root, 'reports', reportId, 'signoff.json');
const signoff = fs.existsSync(signoffPath) ? JSON.parse(fs.readFileSync(signoffPath, 'utf8')) : null;

const rear = results.scenarios.rear_impact;
const pole = results.scenarios.pole_test;

const fulfilled = Number(opt('fulfilled', rear.fulfilledUsdc));
const after24h = Number(opt('after24h', rear.after24h.additionalFulfilledUsdc));
const demand = Number(rear.requestedUsdc);
const freeze = opt('freeze', pole.pauseImpact === 'funds frozen, not lost' ? 'true' : 'false') === 'true';
const singleKey = opt('singleKey', 'false') === 'true';

const rearResult = rearBand({ fulfilled, demand, after24hAdditional: after24h });
const poleResult = poleBand({ withdrawBlockedByPause: freeze, reachableBySingleKey: singleKey });

const usdc = (v) => (Number(v) / 1e6).toFixed(6);

console.log('report ' + reportId + ' | fork block ' + results.forkBlock + ' | recorded run');
console.log('thresholds from ' + config.thresholds.source);
console.log(
  signoff
    ? 'signed by ' + signoff.signer + ' (' + signoff.role + ') on ' + signoff.signedAt
    : 'signature not recorded'
);
console.log('');
console.log('rear impact');
console.log('  demand            ' + usdc(demand) + ' USDC');
console.log('  cleared           ' + usdc(fulfilled) + ' USDC');
console.log('  cleared after 24h ' + usdc(after24h) + ' USDC');
console.log('  band              ' + rearResult + ' | ' + REAR_REASON[rearResult]);
console.log('');
console.log('pole test');
console.log('  pause blocks withdrawals ' + freeze);
console.log('  single key moves funds   ' + singleKey);
console.log('  band              ' + poleResult + ' | ' + POLE_REASON[poleResult]);
console.log('');
console.log('try other inputs, nothing is written:');
console.log('  node script/preview.mjs --fulfilled=' + demand + '          full clear');
console.log('  node script/preview.mjs --after24h=1000000000               partial clear after the wait');
console.log('  node script/preview.mjs --freeze=false                      no pause power');
console.log('  node script/preview.mjs --singleKey=true                    one key can move funds');
