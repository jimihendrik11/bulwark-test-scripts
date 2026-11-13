import fs from 'node:fs';
import crypto from 'node:crypto';

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const PROGRAM = 'ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW';
const rel = 'https://api.github.com/repos/helius-labs/privacy-rings/releases/tags/shielded-pool-v1.0.0';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const relJson = await (await fetch(rel, { headers: { 'user-agent': 'qa-arena' } })).json();
const assets = relJson.assets || [];
const so = assets.find((a) => a.name.endsWith('.so'));
const sums = assets.find((a) => a.name === 'SHA256SUMS');
console.log('release', relJson.tag_name, 'assets', assets.map((a) => a.name).join(','));
if (!so) {
  console.error('no .so asset');
  process.exit(2);
}

const soBytes = Buffer.from(await (await fetch(so.browser_download_url)).arrayBuffer());
const soHash = sha(soBytes);
console.log('so', so.name, soBytes.length, 'bytes sha256', soHash);

let published = null;
if (sums) {
  const text = await (await fetch(sums.browser_download_url)).text();
  const line = text.split(/\r?\n/).find((l) => l.includes(so.name));
  published = line ? line.split(/\s+/)[0] : null;
  console.log('published sha256', published);
}

let id = 0;
async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
  });
  const b = await res.json();
  if (b.error) throw new Error(b.error.message);
  return b.result;
}

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const map = new Map([...A].map((c, i) => [c, BigInt(i)]));
function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = A[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out;
}

const acc = await rpc('getAccountInfo', [PROGRAM, { encoding: 'base64', commitment: 'confirmed' }]);
const prog = Buffer.from(acc.value.data[0], 'base64');
const dataAddr = b58encode(prog.subarray(4, 36));
const pd = await rpc('getAccountInfo', [dataAddr, { encoding: 'base64', commitment: 'confirmed' }]);
const data = Buffer.from(pd.value.data[0], 'base64');
const body = data.subarray(45);

const prefixMatch = body.subarray(0, soBytes.length).equals(soBytes);
let padding = 0;
for (let i = body.length - 1; i >= 0 && body[i] === 0; i -= 1) padding += 1;

const out = {
  checkedAt: new Date().toISOString().slice(0, 10),
  release: relJson.tag_name,
  asset: so.name,
  assetBytes: soBytes.length,
  assetSha256: soHash,
  publishedSha256: published,
  publishedMatchesAsset: published ? published === soHash : null,
  programDataLength: data.length,
  payloadLength: body.length,
  deployedPrefixEqualsAsset: prefixMatch,
  trailingZeroPadding: padding,
  slotRead: await rpc('getSlot', [{ commitment: 'confirmed' }]),
  method:
    'The released program binary was hashed, then compared byte by byte with the first bytes of the deployed ProgramData payload.'
};
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/PRV-RINGS-build.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
