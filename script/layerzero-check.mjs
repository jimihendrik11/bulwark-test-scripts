#!/usr/bin/env node
// Route, Peer and Supply checks for a LayerZero V2 OApp/OFT. Read-only, no keys.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const chains = JSON.parse(readFileSync(join(root, 'test-drive', 'layerzero', 'chains.json'), 'utf8'));
const thresholds = JSON.parse(readFileSync(join(root, 'test-drive', 'layerzero', 'thresholds.json'), 'utf8'));
const signed = JSON.parse(readFileSync(join(root, 'test-drive', 'layerzero', 'signoff.json'), 'utf8'));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const hash = createHash('sha256').update(canonical(thresholds)).digest('hex');
if (signed.hash !== hash) {
  console.error('thresholds are not signed; run node script/layerzero-signoff.mjs first');
  process.exit(2);
}

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const srcEid = getArg('eid', '30101');
const oapp = getArg('address', '').toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(oapp)) {
  console.error('usage: node script/layerzero-check.mjs --eid=30101 --address=0x<40 hex>');
  process.exit(1);
}
const source = chains.eids[srcEid];
if (!source) {
  console.error(`unknown source eid ${srcEid}; add it to test-drive/layerzero/chains.json`);
  process.exit(1);
}

const rpc = async (chain, method, params) => {
  const res = await fetch(chain.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
};
const call = (chain, to, data) => rpc(chain, 'eth_call', [{ to, data }, 'latest']);
const word = (hex) => BigInt(hex === '0x' ? '0x0' : hex);
const addressFromWord = (hex) => `0x${hex.slice(-40)}`.toLowerCase();
const pad = (value) => value.replace(/^0x/, '').padStart(64, '0');
const u32 = (value) => Number(value).toString(16).padStart(64, '0');
const readOptional = async (chain, to, data) => {
  try {
    return await call(chain, to, data);
  } catch {
    return null;
  }
};

async function scanMessages() {
  const url = `https://scan.layerzero-api.com/v1/messages/oapp/${srcEid}/${oapp}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`LayerZero Scan HTTP ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

function pickPaths(messages) {
  const byDst = new Map();
  for (const message of messages) {
    const dst = String(message.pathway?.dstEid);
    if (!byDst.has(dst)) byDst.set(dst, message);
  }
  return [...byDst.values()];
}

function routeLight(config) {
  const required = Number(config.requiredDVNCount || 0);
  const optional = Number(config.optionalDVNCount || 0);
  const threshold = Number(config.optionalDVNThreshold || 0);
  const confirmations = Number(config.confirmations || 0);
  if (required <= thresholds.route.redWhenRequiredDvnAtMost && optional === 0) return 'red';
  const names = config.requiredDVNNames || [];
  const singleOperator = thresholds.route.amberWhenSingleOperator && names.length > 1 && new Set(names).size === 1;
  if (singleOperator) return 'amber';
  if (confirmations > 0 && confirmations < thresholds.route.amberWhenConfirmationsBelow) return 'amber';
  if (optional > 0 && threshold > optional) return 'red';
  return 'green';
}

async function ownerInfo(chain) {
  const ownerHex = await readOptional(chain, oapp, '0x8da5cb5b');
  if (!ownerHex || word(ownerHex) === 0n) return { owner: null, ownerType: 'none', codeSize: 0 };
  const owner = addressFromWord(ownerHex);
  const code = await rpc(chain, 'eth_getCode', [owner, 'latest']);
  const codeSize = code === '0x' ? 0 : (code.length - 2) / 2;
  let ownerType = codeSize === 0 ? 'eoa' : 'contract';
  if (codeSize > 0) {
    const threshold = await readOptional(chain, owner, '0xe75235b8');
    const delay = await readOptional(chain, owner, '0x6a42b8f8');
    if (threshold && word(threshold) > 0n) ownerType = 'multisig';
    else if (delay && word(delay) > 0n) ownerType = 'timelock';
  }
  return { owner, ownerType, codeSize };
}

function peerLight(ownerType) {
  if (ownerType === 'none') return 'green';
  if (ownerType === 'eoa') return thresholds.peer.redWhenOwnerIsEoa ? 'red' : 'amber';
  return thresholds.peer.amberWhenOwnerIsContract ? 'amber' : 'green';
}

async function supplyCheck() {
  const tokenHex = await readOptional(source, oapp, '0xfc0c546a');
  if (!tokenHex || word(tokenHex) === 0n) {
    return { kind: 'mint-burn', light: 'grey', note: 'No adapter token() getter, supply is not locked in this contract.' };
  }
  const token = addressFromWord(tokenHex);
  const decimalsHex = await readOptional(source, token, '0x313ce567');
  const decimals = decimalsHex ? Number(word(decimalsHex)) : 6;
  const balanceHex = await readOptional(source, token, `0x70a08231${pad(oapp)}`);
  const locked = Number(word(balanceHex)) / 10 ** decimals;
  const remotes = [];
  for (const path of paths) {
    const dstEid = String(path.pathway.dstEid);
    const chain = chains.eids[dstEid];
    if (!chain) continue;
    const peer = path.pathway.receiver.address.toLowerCase();
    const peerTokenHex = await readOptional(chain, peer, '0xfc0c546a');
    if (peerTokenHex && word(peerTokenHex) !== 0n) {
      const peerToken = addressFromWord(peerTokenHex);
      const peerBalanceHex = await readOptional(chain, peerToken, `0x70a08231${pad(peer)}`);
      remotes.push({
        eid: dstEid,
        chain: chain.name,
        peer,
        kind: 'adapter',
        token: peerToken,
        locked: peerBalanceHex ? Number(word(peerBalanceHex)) / 10 ** decimals : null,
      });
      continue;
    }
    const supplyHex = await readOptional(chain, peer, '0x18160ddd');
    const peerDecimalsHex = await readOptional(chain, peer, '0x313ce567');
    const peerDecimals = peerDecimalsHex ? Number(word(peerDecimalsHex)) : decimals;
    remotes.push({
      eid: dstEid,
      chain: chain.name,
      peer,
      kind: 'token',
      totalSupply: supplyHex ? Number(word(supplyHex)) / 10 ** peerDecimals : null,
    });
  }
  const adapters = remotes.filter((r) => r.kind === 'adapter');
  if (adapters.length) {
    return {
      kind: 'adapter',
      token,
      decimals,
      locked,
      remotes,
      light: 'grey',
      note: 'Adapter peers hold the underlying token instead of exposing totalSupply; a like-for-like supply total needs the per-chain design documented by the issuer.',
    };
  }
  const known = remotes.filter((r) => r.totalSupply != null);
  const sumRemote = known.reduce((acc, r) => acc + r.totalSupply, 0);
  const diffPct = locked > 0 ? Math.abs(sumRemote - locked) / locked * 100 : null;
  let light = 'grey';
  if (known.length === remotes.length && diffPct != null) {
    if (diffPct > thresholds.supply.redAbovePct) light = 'red';
    else if (diffPct > thresholds.supply.amberAbovePct) light = 'amber';
    else light = 'green';
  }
  return { kind: 'adapter', token, decimals, locked, remotes, sumRemote, diffPct, light };
}

const messages = await scanMessages();
if (!messages.length) {
  console.error('no messages found for this OApp; Route Check needs at least one recent message');
  process.exit(3);
}
const paths = pickPaths(messages);

const routes = paths.map((message) => {
  const dstEid = String(message.pathway.dstEid);
  const config = message.config?.outboundConfig || {};
  const chain = chains.eids[dstEid];
  return {
    dstEid,
    dstChain: chain?.name || message.pathway.receiver.chain || null,
    receiver: message.pathway.receiver.address.toLowerCase(),
    confirmations: Number(config.confirmations || 0),
    requiredDVNCount: Number(config.requiredDVNCount || 0),
    optionalDVNCount: Number(config.optionalDVNCount || 0),
    optionalDVNThreshold: Number(config.optionalDVNThreshold || 0),
    requiredDVNs: (config.requiredDVNs || []).map((address, index) => ({
      address,
      operator: (config.requiredDVNNames || [])[index] || null,
    })),
    optionalDVNs: config.optionalDVNs || [],
    light: routeLight(config),
  };
});

const owner = await ownerInfo(source);
const peerChecks = [];
for (const route of routes) {
  const chain = chains.eids[route.dstEid];
  if (!chain) {
    peerChecks.push({ dstEid: route.dstEid, peer: route.receiver, peerCode: null, note: 'No chain endpoint configured.' });
    continue;
  }
  const code = await rpc(chain, 'eth_getCode', [route.receiver, 'latest']);
  peerChecks.push({
    dstEid: route.dstEid,
    chain: chain.name,
    peer: route.receiver,
    peerCode: code !== '0x',
    codeSize: code === '0x' ? 0 : (code.length - 2) / 2,
  });
}
const supply = await supplyCheck();

const worstRoute = routes.some((r) => r.light === 'red') ? 'red'
  : routes.some((r) => r.light === 'amber') ? 'amber'
  : routes.some((r) => r.light === 'green') ? 'green' : 'grey';

const canStillChange = [];
if (owner.ownerType === 'eoa') canStillChange.push('A single wallet owns the OApp and can change peers and DVN configuration');
if (owner.ownerType === 'multisig') canStillChange.push('Ownership sits behind a multisig; the configuration can change when signers agree');
if (owner.ownerType === 'timelock') canStillChange.push('Ownership sits behind a timelock; configuration changes are delayed');
for (const route of routes.filter((r) => r.requiredDVNCount <= 1)) {
  canStillChange.push(`Path to eid ${route.dstEid} can be verified by one DVN`);
}

const ranAt = new Date().toISOString();
const result = {
  kind: 'layerzero_check',
  notARating: true,
  label: 'Automated Test Drive. Not a BULWARK rating.',
  oapp: { address: oapp, eid: Number(srcEid), chain: source.name },
  ranAt,
  routes,
  routeLight: worstRoute,
  peers: {
    owner: owner.owner,
    ownerType: owner.ownerType,
    ownerCodeSize: owner.codeSize,
    paths: peerChecks,
    light: peerLight(owner.ownerType),
  },
  supply,
  canStillChange,
  thresholdsVersion: thresholds.version,
  thresholdsHash: hash,
  signedBy: `${signed.signer}, ${signed.role}`,
  rerun: `node script/layerzero-check.mjs --eid=${srcEid} --address=${oapp}`,
};

const outDir = join(root, 'results');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `LZ-${srcEid}-${oapp}.json`);
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(`LayerZero ${oapp} (eid ${srcEid})`);
console.log(`Route   ${result.routeLight}  paths=${routes.length} worstRequired=${Math.min(...routes.map((r) => r.requiredDVNCount))}`);
console.log(`Peer    ${result.peers.light}  ownerType=${owner.ownerType}`);
console.log(`Supply  ${supply.light}  ${supply.light === 'grey' ? supply.note : `locked=${supply.locked} remote=${supply.sumRemote} diff=${supply.diffPct?.toFixed(3)}%`}`);
console.log(`Wrote ${outPath}`);
