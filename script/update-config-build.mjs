import fs from 'node:fs';

const p = 'reports/PRV-RINGS/config.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.buildVerification = {
  status: 'verified',
  release: 'shielded-pool-v1.0.0',
  asset: 'shielded_pool_program.so',
  assetBytes: 634120,
  assetSha256: 'dc68dd2793403f3aa23102cfbaba580eb612def73c05685a7ef99787d08030a2',
  publishedSha256Matches: true,
  deployedPrefixEqualsAsset: true,
  trailingZeroPadding: 7799,
  method:
    'The released binary was hashed, checked against the published SHA256SUMS, then compared byte by byte with the first bytes of the deployed ProgramData payload.',
  evidenceFile: 'results/PRV-RINGS-build.json'
};
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('config build verification updated');
