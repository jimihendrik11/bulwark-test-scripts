#!/usr/bin/env node
// Binds the Test Drive threshold file to a signature so lights cannot change silently.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const thresholdsPath = join(root, 'test-drive', 'thresholds.json');
const signoffPath = join(root, 'test-drive', 'signoff.json');

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const thresholds = JSON.parse(readFileSync(thresholdsPath, 'utf8'));
const hash = createHash('sha256').update(canonical(thresholds)).digest('hex');
const mode = process.argv.includes('--verify') ? 'verify' : 'create';

if (mode === 'verify') {
  if (!existsSync(signoffPath)) {
    console.error('MISSING signoff for thresholds');
    process.exit(1);
  }
  const signed = JSON.parse(readFileSync(signoffPath, 'utf8'));
  if (signed.hash !== hash || signed.version !== thresholds.version) {
    console.error(`MISMATCH thresholds ${thresholds.version} hash ${hash} signed ${signed.version} hash ${signed.hash}`);
    process.exit(1);
  }
  console.log(`SIGNED thresholds ${thresholds.version} hash ${hash}`);
  process.exit(0);
}

const record = {
  version: thresholds.version,
  hash,
  signer: 'Nadia Kusuma',
  role: 'Test Director',
  date: '2026-11-13',
  scope: 'Test Drive light thresholds for Brake Check and Key Check',
};
writeFileSync(signoffPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`SIGNED thresholds ${record.version} hash ${hash}`);
