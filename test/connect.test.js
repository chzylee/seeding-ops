'use strict';
// Connect to start.gg (Noah, 2026-11-05): on launch, with no token or a rejected one, the home page
// shows a screen to paste a personal API token; the app checks it with one request and saves it to
// .env; it takes effect at once. The token value never reaches the page.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { buildWorld, createFakeFetch } = require('../testlib/fake-api');

const H = { 'X-Seeding-App': '1', 'Content-Type': 'application/json' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-connect-'));
const post = (app, url, body) => inject(app.handler, { url, method: 'POST', headers: H, body: JSON.stringify(body || {}) });

test('connect: no token -> status says missing and the home page carries the connect card; a bad token is refused and not saved; a good one is saved to .env and used at once', async () => {
  const outRoot = tmp();
  const envFile = path.join(tmp(), '.env');
  const world = buildWorld(Math.floor(Date.UTC(2026, 9, 12) / 1000));
  const fake = createFakeFetch(world);
  // No getToken option: the app reads the env file (and the environment variable, cleared here).
  const saved = process.env.STARTGG_TOKEN; delete process.env.STARTGG_TOKEN;
  try {
    const app = createApp({ outRoot, envFile, fetchImpl: fake, sleep: async () => {} });
    let st = (await inject(app.handler, { url: '/api/token' })).json();
    assert.deepStrictEqual(st, { configured: false, source: null, ok: false, as: null, prefix: null, image: null, slug: null, kind: 'missing', message: 'No start.gg token yet.', env_wins: false });
    assert.strictEqual(fake.calls.length, 0, 'nothing is asked of start.gg without a token');
    const home = (await inject(app.handler, { url: '/' })).text;
    assert.match(home, /<section id="connect" class="connect"[^>]*hidden>/);
    assert.match(home, /start\.gg\/admin\/profile\/developer/);
    assert.match(home, /<input id="connectToken" type="password"/);
    // Adding a tournament without a token is refused with a pointer to the connect screen.
    const add = await post(app, '/api/tournaments', { url: 'https://www.start.gg/tournament/x/event/y' });
    assert.strictEqual(add.status, 400);
    assert.match(add.json().error, /Connect to start\.gg/);
    // A bad token: checked (one request), refused, nothing written.
    assert.strictEqual((await inject(app.handler, { url: '/api/token', method: 'POST', body: '{}' })).status, 403, 'the app header is required');
    const bad = await post(app, '/api/token', { token: 'bad-token' });
    assert.strictEqual(bad.status, 400);
    assert.match(bad.json().error, /rejected/);
    assert.ok(!fs.existsSync(envFile), 'a rejected token is not saved');
    assert.strictEqual((await post(app, '/api/token', { token: 'has space' })).status, 400);
    assert.strictEqual((await post(app, '/api/token', { token: '' })).status, 400);
    // A good one: saved, reported as whose it is, and in use without a restart.
    const good = await post(app, '/api/token', { token: 'good-token-abc' });
    assert.strictEqual(good.status, 200, good.text);
    assert.deepStrictEqual(good.json(), { ok: true, as: 'TestTO', saved: '.env', env_wins: false });
    assert.strictEqual(fs.readFileSync(envFile, 'utf8'), 'STARTGG_TOKEN=good-token-abc\n');
    st = (await inject(app.handler, { url: '/api/token' })).json();
    assert.deepStrictEqual(st, { configured: true, source: '.env', ok: true, as: 'TestTO', prefix: 'FAKE', image: 'https://images.start.gg/fake/testto-profile.png', slug: 'user/testto00', kind: null, message: null, env_wins: false }, 'the account bar gets the tag, prefix and profile picture');
    const calls = fake.calls.length;
    assert.strictEqual((await inject(app.handler, { url: '/api/token' })).status, 200);
    assert.strictEqual(fake.calls.length, calls, 'the check is cached; no request per page load');
    assert.strictEqual((await inject(app.handler, { url: '/api/token?check=1' })).status, 200);
    assert.strictEqual(fake.calls.length, calls + 1, '?check=1 asks again');
    // The token never comes back in any status body.
    for (const r of [st, good.json()]) assert.ok(!JSON.stringify(r).includes('good-token-abc'));
    // And a start.gg request now works with it (the catalog request carries the saved token).
    const ok = await post(app, '/api/tournaments', { url: `https://www.start.gg/tournament/${world.tournament.slug.replace(/^tournament\//, '')}` });
    assert.strictEqual(ok.status, 200, ok.text);
    assert.strictEqual(fake.calls[fake.calls.length - 1].auth, 'Bearer good-token-abc');
    await app.jobs.idle();
  } finally { if (saved != null) process.env.STARTGG_TOKEN = saved; }
});

test('connect: a saved token that start.gg later rejects reads as rejected (kind bad-token), so the page shows the connect screen again', async () => {
  const outRoot = tmp();
  const envFile = path.join(tmp(), '.env');
  fs.writeFileSync(envFile, 'STARTGG_TOKEN=bad-token\n');
  const world = buildWorld(Math.floor(Date.UTC(2026, 9, 12) / 1000));
  const saved = process.env.STARTGG_TOKEN; delete process.env.STARTGG_TOKEN;
  try {
    const app = createApp({ outRoot, envFile, fetchImpl: createFakeFetch(world), sleep: async () => {} });
    const st = (await inject(app.handler, { url: '/api/token' })).json();
    assert.strictEqual(st.configured, true);
    assert.strictEqual(st.ok, false);
    assert.strictEqual(st.kind, 'bad-token');
    assert.ok(!JSON.stringify(st).includes('bad-token\n'));
  } finally { if (saved != null) process.env.STARTGG_TOKEN = saved; }
});
