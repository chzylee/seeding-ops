'use strict';
// testlib/fake-global-fetch.js — preload that answers globalThis.fetch from the fake start.gg
// (testlib/fake-api.js), for driving a real command line (views/major-table.js, app/server.js)
// offline. FAKE_WORLD_AT=<ms> anchors the fake world's dates. Each request is appended to
// FAKE_CALLS_FILE (op + variables, never headers), if set. FAKE_DELAY_MS=<ms> delays every
// response, so a person can click while a pull or W-L fetch is running (the UI checklist).
//   NODE_OPTIONS="--require ./testlib/no-network.js --require ./testlib/fake-global-fetch.js"
const fs = require('node:fs');
const { buildWorld, createFakeFetch } = require('./fake-api');

const world = buildWorld(Number(process.env.FAKE_WORLD_AT || Date.now()) / 1000);
const fake = createFakeFetch(world);
const delay = Number(process.env.FAKE_DELAY_MS || 0);
globalThis.fetch = async (url, init) => {
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  const res = await fake(url, init);
  const last = fake.calls[fake.calls.length - 1];
  if (process.env.FAKE_CALLS_FILE) fs.appendFileSync(process.env.FAKE_CALLS_FILE, JSON.stringify({ op: last.op, variables: last.variables }) + '\n');
  return res;
};
