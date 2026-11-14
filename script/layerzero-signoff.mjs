#!/usr/bin/env node
// Binds the LayerZero check thresholds to a signature.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const thresholdsPath = join(root, 'test-drive', 'layerzero', 'thresholds.json');
const signoffPath = join(root, 'test-drive', 'layerzero', 'signoff.json');

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
const verify = process.argv.includes('--verify');

if (verify) {
  if (!existsSync(signoffPath)) {
    console.error('MISSING signoff for LayerZero thresholds');
    process.exit(1);
  }
  const signed = JSON.parse(readFileSync(signoffPath, 'utf8'));
  if (signed.hash !== hash || signed.version !== thresholds.version) {
    console.error(`MISMATCH thresholds ${thresholds.version} hash ${hash}`);
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
  date: '2026-11-14',
  scope: 'LayerZero Route, Peer and Supply light thresholds',
};
writeFileSync(signoffPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`SIGNED thresholds ${record.version} hash ${hash}`);
