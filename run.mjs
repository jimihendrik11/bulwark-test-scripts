import fs from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (!id) { console.error('usage: RPC_URL=<endpoint> node run.mjs CR-1001'); process.exit(2); }
const rpc = process.env.RPC_URL;
if (!rpc) { console.error('RPC_URL is not set'); process.exit(2); }

const configPath = path.join('reports', id, 'config.json');
if (!fs.existsSync(configPath)) { console.error('no configuration for ' + id); process.exit(2); }
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const resultPath = path.join('results', id + '.json');
const previous = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : { checks: [] };

async function call(method, params) {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error(method + ' returned HTTP ' + res.status);
  const body = await res.json();
  if (body.error) throw new Error(method + ': ' + body.error.message);
  return body.result;
}

const checks = [];
const ok = (name, value) => checks.push({ name, value, status: 'pass' });
const bad = (name, value) => checks.push({ name, value, status: 'fail' });

const chainId = parseInt(await call('eth_chainId', []), 16);
if (config.chainId === null) ok('chainId', chainId);
else if (chainId === config.chainId) ok('chainId', chainId);
else bad('chainId', chainId + ' expected ' + config.chainId);

const blockNumber = parseInt(await call('eth_blockNumber', []), 16);
ok('blockNumber', blockNumber);

for (const address of config.contracts || []) {
  const code = await call('eth_getCode', [address, 'latest']);
  if (code && code !== '0x') ok('code ' + address, code.length + ' hex characters');
  else bad('code ' + address, 'no code');
}

const out = {
  reportId: config.reportId,
  protocol: config.protocol,
  chain: config.chain,
  generatedAt: new Date().toISOString(),
  rpc: { chainId, blockNumber },
  checks,
  reference: config.reference,
  note: 'Scenario outcomes are reference values from the published report, not re-executed.'
};
fs.writeFileSync(resultPath, JSON.stringify(out, null, 2) + '\n');

for (const c of checks) console.log(c.status.toUpperCase() + ' ' + c.name + ' = ' + c.value);
console.log('reference outcome: ' + JSON.stringify(config.reference));
console.log('forkBlock note: ' + config.forkBlockNote);
if (checks.some((c) => c.status === 'fail')) process.exit(1);
console.log('PASS ' + id);
