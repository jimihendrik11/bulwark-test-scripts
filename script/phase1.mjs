import fs from 'node:fs';
import path from 'node:path';

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const root = process.cwd();
const configPath = path.join(root, 'reports', 'PRV-RINGS', 'config.json');
const target = path.join(root, 'results', 'PRV-RINGS-phase1.json');
const args = process.argv.slice(2);
const create = args.includes('--create');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const PROGRAM = config.programs.privacyProgram;

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_INDEX = new Map([...ALPHABET].map((c, i) => [c, BigInt(i)]));
function b58decode(str) {
  let n = 0n;
  for (const c of str) {
    const v = ALPHABET_INDEX.get(c);
    if (v === undefined) throw new Error('invalid base58 character ' + c);
    n = n * 58n + v;
  }
  const out = [];
  while (n > 0n) {
    out.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of str) {
    if (c !== '1') break;
    out.unshift(0);
  }
  return Buffer.from(out);
}
function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

// An address can be a plain keypair only if its 32 bytes decompress to a point
// on ed25519. Program-derived addresses are created off-curve on purpose and
// cannot sign, so they must never be reported as a keypair.
const FIELD = (1n << 255n) - 19n;
const mod = (a) => ((a % FIELD) + FIELD) % FIELD;
function pow(base, exp) {
  let result = 1n;
  let b = mod(base);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % FIELD;
    b = (b * b) % FIELD;
    e >>= 1n;
  }
  return result;
}
const EDWARDS_D = mod(-121665n * pow(121666n, FIELD - 2n));
function isOnCurve(address) {
  const bytes = b58decode(address);
  if (bytes.length !== 32) return false;
  const y = bytes.reverse().reduce((acc, b) => (acc << 8n) | BigInt(b), 0n) & ((1n << 255n) - 1n);
  const y2 = (y * y) % FIELD;
  const v = mod(EDWARDS_D * y2 + 1n);
  if (v === 0n) return false;
  const x2 = (mod(y2 - 1n) * pow(v, FIELD - 2n)) % FIELD;
  if (x2 === 0n) return true;
  return pow(x2, (FIELD - 1n) / 2n) === 1n;
}

let id = 0;
async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
  });
  const body = await res.json();
  if (body.error) throw new Error(method + ': ' + body.error.message);
  return body.result;
}

const IMPACT = {
  protocol_authority:
    'updates the protocol config and can pause a tree, so deposits and withdrawals on that tree can be stopped; it cannot move user funds',
  tree_creation_authority: 'creates trees for the protocol; it has no path to user balances',
  forester_authority:
    'updates the nullifier tree, claims tree rent and closes nullifier accounts; it can stall the withdrawal path but cannot transfer user assets',
  ring_creation_authority: 'creates and activates ring configs; it has no path to user balances',
  fee_authority: 'sets tree fees, which changes what a user pays; it cannot move deposited funds'
};

function authorityType(info, address) {
  if (!address) return 'immutable';
  if (!isOnCurve(address)) return 'program-derived address';
  if (!info) return 'keypair';
  if (info.owner === '11111111111111111111111111111111') return 'wallet';
  if (info.owner === 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf') return 'squads multisig';
  return 'program ' + info.owner;
}

const slot = await rpc('getSlot', [{ commitment: 'confirmed' }]);
const programInfo = await rpc('getAccountInfo', [PROGRAM, { encoding: 'base64', commitment: 'confirmed' }]);
if (!programInfo.value) {
  console.error('program not found on ' + RPC);
  process.exit(2);
}
const programBytes = Buffer.from(programInfo.value.data[0], 'base64');
const programDataAddress = b58encode(programBytes.subarray(4, 36));
const dataInfo = await rpc('getAccountInfo', [programDataAddress, { encoding: 'base64', commitment: 'confirmed' }]);
const dataBytes = Buffer.from(dataInfo.value.data[0], 'base64');
const lastDeployedSlot = Number(dataBytes.readBigUInt64LE(4));
const hasAuthority = dataBytes[12] === 1;
const authorityAddress = hasAuthority ? b58encode(dataBytes.subarray(13, 45)) : null;
let authorityAccount = null;
if (authorityAddress) {
  const a = await rpc('getAccountInfo', [authorityAddress, { encoding: 'base64', commitment: 'confirmed' }]);
  authorityAccount = a.value;
}

const configs = await rpc('getProgramAccounts', [
  PROGRAM,
  {
    encoding: 'base64',
    commitment: 'confirmed',
    filters: [{ dataSize: 166 }, { memcmp: { offset: 0, bytes: '4' } }]
  }
]);
if (configs.length !== 1) {
  console.error('expected one protocol config account, found ' + configs.length);
  process.exit(3);
}
const cfg = configs[0];
const cfgBytes = Buffer.from(cfg.account.data[0], 'base64');
const labels = [
  'protocol_authority',
  'tree_creation_authority',
  'forester_authority',
  'ring_creation_authority',
  'fee_authority'
];
const authorities = [];
for (let i = 0; i < labels.length; i += 1) {
  const address = b58encode(cfgBytes.subarray(1 + i * 32, 1 + (i + 1) * 32));
  const info = await rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
  authorities.push({
    role: labels[i],
    holder: address,
    type: authorityType(info.value, address),
    onCurve: isOnCurve(address),
    impact: IMPACT[labels[i]]
  });
}
const permissions = {
  tree_creation_is_permissionless: cfgBytes[161] === 1,
  ring_activation_is_permissionless: cfgBytes[162] === 1,
  spl_interface_creation_is_permissionless: cfgBytes[163] === 1,
  next_tree_id: cfgBytes.readUInt16LE(164)
};

const results = {
  reportId: config.reportId,
  protocol: config.protocol,
  framing: config.framing,
  statusNote: config.statusNote,
  network: config.network,
  programId: PROGRAM,
  slot,
  executed: true,
  program: {
    executable: programInfo.value.executable,
    owner: programInfo.value.owner,
    programDataAddress,
    dataLength: dataBytes.length,
    lastDeployedSlot
  },
  upgradeAuthority: {
    holder: authorityAddress,
    type: authorityAddress ? authorityType(authorityAccount, authorityAddress) : 'immutable',
    onCurve: authorityAddress ? isOnCurve(authorityAddress) : null,
    accountOwner: authorityAccount ? authorityAccount.owner : null,
    impact: authorityAddress
      ? 'can replace the whole program; because the holder is a program-derived address, a replacement needs the controlling program to approve it and no single key can sign for it'
      : 'program is immutable'
  },
  authorityHistory: config.authorityHistory || [],
  authorityController: config.authorityController || null,
  protocolConfig: {
    address: cfg.pubkey,
    authorities,
    permissions
  },
  buildVerification: config.buildVerification,
  reportedInputs: config.reportedInputs,
  source: config.source,
  sdk: config.sdk
};

const stable = (o) => {
  const copy = JSON.parse(JSON.stringify(o));
  delete copy.slot;
  return JSON.stringify(copy);
};

if (fs.existsSync(target) && !create) {
  const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
  const same = stable(previous) === stable(results);
  console.log('program ' + PROGRAM + ' on ' + RPC);
  console.log('slot ' + slot + ' | last deployed ' + lastDeployedSlot + ' | data ' + dataBytes.length + ' bytes');
  console.log('upgrade authority ' + authorityAddress + ' (' + results.upgradeAuthority.type + ', on-curve: ' + results.upgradeAuthority.onCurve + ')');
  for (const a of authorities) console.log(a.role + ' ' + a.holder + ' (' + a.type + ', on-curve: ' + a.onCurve + ')');
  console.log(same ? 'MATCH' : 'MISMATCH');
  if (!same) process.exit(1);
} else if (!create) {
  console.error('no recorded result yet, run with --create');
  process.exit(2);
}

if (create) {
  fs.writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
  console.log('wrote ' + target);
  console.log('upgrade authority ' + authorityAddress + ' (' + results.upgradeAuthority.type + ', on-curve: ' + results.upgradeAuthority.onCurve + ')');
  for (const a of authorities) console.log(a.role + ' ' + a.holder + ' (' + a.type + ', on-curve: ' + a.onCurve + ')');
}
