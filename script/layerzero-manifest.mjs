#!/usr/bin/env node
// Builds the published index for LayerZero checks.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const resultsDir = join(root, 'results');
const entries = [];

if (existsSync(resultsDir)) {
  for (const file of readdirSync(resultsDir)) {
    if (!file.startsWith('LZ-') || !file.endsWith('.json') || file === 'LZ-manifest.json') continue;
    const result = JSON.parse(readFileSync(join(resultsDir, file), 'utf8'));
    entries.push({
      address: result.oapp.address,
      eid: result.oapp.eid,
      chain: result.oapp.chain,
      ranAt: result.ranAt,
      route: result.routeLight,
      peer: result.peers.light,
      supply: result.supply.light,
      file: `results/${file}`,
    });
  }
}
entries.sort((a, b) => String(b.ranAt).localeCompare(String(a.ranAt)));
writeFileSync(join(resultsDir, 'LZ-manifest.json'), `${JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2)}\n`);
console.log(`LayerZero manifest entries: ${entries.length}`);
