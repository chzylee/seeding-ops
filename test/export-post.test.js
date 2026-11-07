'use strict';
// Export CSV sends the table order in a POST body. It used to be ?order=<every player id> in the URL;
// with ~2000 registrants that request line alone passes Node's 16 KB header limit (http.maxHeaderSize
// 16384; 2000 seven-digit ids make a 16,059-byte request line) and the server answers 431, which the
// page shows as "Export failed".
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseCsv } = require('../lib/output');
const { run } = require('../lib/run');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { buildWorld, createFakeFetch, virtualClock, sink, EVENT_SLUG, T_SLUG, E_SLUG, GAME } = require('../testlib/fake-api');
const { addTournament } = require('../testlib/pool-fixture');

const H = { 'X-Seeding-App': '1', 'Content-Type': 'application/json' };

test('export: POST { order } gives the same CSV as ?order=, takes thousands of ids, and needs the app header', async () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-export-post-'));
  const START = Date.UTC(2026, 9, 12, 15, 0, 0);
  const world = buildWorld(START / 1000);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ url: 'https://www.start.gg/' + EVENT_SLUG, token: 'T', outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  addTournament(outRoot, world, [E_SLUG]);
  const app = createApp({ outRoot, getToken: () => '' });
  const url = `/api/t/${T_SLUG}/g/${GAME.id}/export.csv`;
  const ids = parseCsv((await inject(app.handler, { url })).text).map((x) => x['start.gg player id']);
  const rev = [...ids].reverse();
  const viaGet = await inject(app.handler, { url: `${url}?order=${rev.join(',')}` });
  const viaPost = await inject(app.handler, { url, method: 'POST', headers: H, body: JSON.stringify({ order: rev }) });
  assert.strictEqual(viaPost.status, 200, viaPost.text);
  assert.strictEqual(viaPost.text, viaGet.text);
  assert.match(viaPost.headers['Content-Disposition'], /attachment; filename=/);
  // 3000 ids (more than any URL would carry), unknown ones ignored as before. Build D pass 2 (Noah,
  // 2026-11-07): a tab's Seed numbers are the Seed column, so the table order no longer reorders the
  // export; the page's column travels in the same body as `seeding`, and that is what numbers it.
  const many = [...rev, ...Array.from({ length: 3000 }, (_, i) => String(9000000 + i))];
  const big = await inject(app.handler, { url, method: 'POST', headers: H, body: JSON.stringify({ order: many }) });
  assert.strictEqual(big.status, 200);
  assert.deepStrictEqual(parseCsv(big.text).map((x) => x['start.gg player id']), ids, 'the table order alone does not renumber');
  const col = await inject(app.handler, { url, method: 'POST', headers: H, body: JSON.stringify({ order: many, event: E_SLUG, seeding: { mode: 'arranged', order: rev } }) });
  assert.strictEqual(col.status, 200, col.text);
  assert.deepStrictEqual(parseCsv(col.text).map((x) => x['start.gg player id']), rev, 'the page\'s Seed column does');
  assert.strictEqual((await inject(app.handler, { url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.strictEqual((await inject(app.handler, { url, method: 'POST', headers: H, body: JSON.stringify({ order: 'x' }) })).status, 400);
  // seeds.csv takes the same body; data stays GET only.
  assert.strictEqual((await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${GAME.id}/seeds.csv`, method: 'POST', headers: H, body: JSON.stringify({ order: rev }) })).status, 200);
  assert.strictEqual((await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${GAME.id}/data`, method: 'POST', headers: H, body: '{}' })).status, 405);
});
