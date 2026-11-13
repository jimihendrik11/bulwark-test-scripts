#!/usr/bin/env node
// Builds the published Test Drive index used by the site.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const resultsDir = join(root, 'results');

const entries = [];
if (existsSync(resultsDir)) {
  for (const file of readdirSync(resultsDir)) {
    if (!file.startsWith('TD-') || !file.endsWith('.json')) continue;
    const result = JSON.parse(readFileSync(join(resultsDir, file), 'utf8'));
    entries.push({
      address: result.token.address,
      symbol: result.token.symbol,
      name: result.token.name,
      block: result.block,
      ranAt: result.ranAt,
      brake: result.checks.brake.light,
      keys: result.checks.keys.light,
      file: `results/${file}`,
    });
  }
}
entries.sort((a, b) => String(b.ranAt).localeCompare(String(a.ranAt)));

writeFileSync(join(resultsDir, 'manifest.json'), `${JSON.stringify({ updatedAt: new Date().toISOString(), entries }, null, 2)}\n`);
console.log(`manifest entries: ${entries.length}`);
