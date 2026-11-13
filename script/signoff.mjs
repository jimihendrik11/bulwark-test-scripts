import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? fallback : args[i + 1];
};
const reportId = opt('report', 'CR-1029');
const root = process.cwd();
const configPath = path.join(root, 'reports', reportId, 'config.json');
const signoffPath = path.join(root, 'reports', reportId, 'signoff.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const thresholdsHash = () =>
  crypto.createHash('sha256').update(JSON.stringify(config.thresholds)).digest('hex');

const hash = thresholdsHash();
const write = args.includes('--write');
const verify = args.includes('--verify');

if (write) {
  const record = {
    reportId,
    signer: opt('signer', 'Nadia Kusuma'),
    role: opt('role', 'Test Director'),
    signedAt: opt('date', new Date().toISOString().slice(0, 10)),
    basis: 'thresholds taken from scenarios/rear-impact.md and scenarios/pole-test.md before the run',
    thresholdsHash: hash
  };
  fs.writeFileSync(signoffPath, JSON.stringify(record, null, 2) + '\n');
  console.log('signed by ' + record.signer + ' on ' + record.signedAt);
  console.log('thresholds hash ' + hash);
  process.exit(0);
}

let record = null;
if (fs.existsSync(signoffPath)) record = JSON.parse(fs.readFileSync(signoffPath, 'utf8'));
const matches = record && record.thresholdsHash === hash;

if (record) {
  console.log('signer ' + record.signer + ' (' + record.role + ') on ' + record.signedAt);
  console.log('thresholds ' + (matches ? 'match the signature' : 'changed since the signature'));
} else {
  console.log('no signoff recorded for ' + reportId);
}

if (verify && !matches) {
  console.log('VERIFY FAILED');
  process.exit(1);
}
if (verify) console.log('VERIFY OK');
