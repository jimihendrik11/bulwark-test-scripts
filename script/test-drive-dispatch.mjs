#!/usr/bin/env node
// Requests a Test Drive run through GitHub Actions, which keeps the compute free.
// Dry run by default. Pass --send with GH_TOKEN set to dispatch the workflow.
const args = process.argv.slice(2);
const address = (args.find((a) => !a.startsWith('--')) || '').toLowerCase();
const send = args.includes('--send');

if (!/^0x[0-9a-f]{40}$/.test(address)) {
  console.error('usage: node script/test-drive-dispatch.mjs 0x<40 hex> [--send]');
  process.exit(1);
}

const repo = process.env.GH_REPO || 'jimihendrik11/bulwark-test-scripts';
const token = process.env.GH_TOKEN || '';

const payload = {
  event_type: 'test-drive',
  client_payload: { address },
};

console.log(`repo     ${repo}`);
console.log(`event    ${payload.event_type}`);
console.log(`address  ${address}`);

if (!send) {
  console.log('dry run: set GH_TOKEN and pass --send to dispatch this run');
  process.exit(0);
}

if (!token) {
  console.error('GH_TOKEN is required for --send');
  process.exit(2);
}

const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
  method: 'POST',
  headers: {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'bulwark-test-drive',
  },
  body: JSON.stringify(payload),
});

if (response.status !== 204) {
  console.error(`dispatch failed: HTTP ${response.status} ${await response.text()}`);
  process.exit(3);
}

console.log('dispatched: the run appears under Actions, workflow Test Drive request');
