'use strict';
// The update button end to end (Noah, 2026-11-06): the routes in app/server.js and the page script
// app/public/update.js, against a fake GitHub (latest.json + a signed installer) with the installer
// launch and the app's exit captured. The one leg no test runs: a real NSIS installer replacing a
// real install.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { loadPage } = require('../testlib/fake-dom');
const { makeSigner } = require('../testlib/minisign');

const REPO = 'someone/seeding-ops';
const H = { 'X-Seeding-App': '1', 'Content-Type': 'application/json' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const INSTALLER = Buffer.from('MZ the 0.3.0 installer');

function github({ version = '0.3.0', signer, signature, installer = INSTALLER } = {}) {
  const calls = [];
  const url = `https://github.com/${REPO}/releases/download/v${version}/Seeding-Ops-windows-setup.exe`;
  const fetchImpl = async (u) => {
    calls.push(u);
    if (u === `https://github.com/${REPO}/releases/latest/download/latest.json`) {
      return new Response(JSON.stringify({ version, notes: 'n', pub_date: '2026-11-06T00:00:00Z', platforms: { 'windows-x86_64': { url, signature: signature ?? (signer ? signer.sign(installer) : '') } } }), { status: 200 });
    }
    if (u === url) return new Response(installer, { status: 200 });
    return new Response('Not Found', { status: 404 });
  };
  return { fetchImpl, calls };
}

const { EventEmitter } = require('node:events');
function makeApp({ installed = true, signer = makeSigner(), gh, current = '0.2.0', spawnOutcome = 'spawn' } = {}) {
  const spawned = [], exits = [];
  const tmpDir = tmp('seeding-upd-dl-');
  const g = gh || github({ signer });
  // The launcher: a fake child that emits 'spawn', or 'error' with the given code.
  const spawnImpl = (cmd, args, opts) => {
    const script = args[args.length - 1];
    spawned.push({ cmd, args, opts, file: (/-FilePath '((?:[^']|'')+)'/.exec(script) || [])[1] });
    const c = new EventEmitter(); c.unref = () => {};
    process.nextTick(() => (spawnOutcome === 'spawn' ? c.emit('spawn') : c.emit('error', Object.assign(new Error('x'), { code: spawnOutcome }))));
    return c;
  };
  const app = createApp({
    outRoot: tmp('seeding-upd-'), getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); },
    update: { installed, current, platform: 'win32', config: { repo: REPO, endpoint: `https://github.com/${REPO}/releases/latest/download/latest.json`, pubkey: signer ? signer.pubkey : '', releasesPage: `https://github.com/${REPO}/releases/latest` },
      fetchImpl: g.fetchImpl, tmpDir, spawnImpl, exit: () => exits.push(1) },
  });
  return { app, spawned, exits, tmpDir, gh: g };
}
const post = (app, url, body, headers = H) => inject(app.handler, { url, method: 'POST', headers, body: JSON.stringify(body || {}) });

test('update routes: check needs the app header and reports current, latest and whether it can install here', async () => {
  const { app, gh } = makeApp();
  assert.strictEqual((await post(app, '/api/update/check', {}, { 'Content-Type': 'application/json' })).status, 403);
  assert.strictEqual(gh.calls.length, 0);
  const r = (await post(app, '/api/update/check')).json();
  assert.deepStrictEqual([r.ok, r.current, r.latest, r.available, r.installed, r.can_install], [true, '0.2.0', '0.3.0', true, true, true]);
  const up = (await post(makeApp({ current: '0.3.0' }).app, '/api/update/check')).json();
  assert.deepStrictEqual([up.ok, up.available], [true, false]);
  const offline = makeApp({ gh: { fetchImpl: async () => { throw new Error('ENOTFOUND github.com'); }, calls: [] } });
  const off = (await post(offline.app, '/api/update/check')).json();
  assert.deepStrictEqual([off.ok, off.kind], [false, 'unreachable']);
});

test('update routes: install downloads, checks the signature, starts the installer with the update flags, then closes the app', async () => {
  const { app, spawned, exits, tmpDir } = makeApp();
  const r = await post(app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(r.status, 202, r.text);
  assert.deepStrictEqual(r.json(), { ok: true, installing: '0.3.0', file: 'Seeding-Ops-0.3.0-setup.exe' });
  assert.strictEqual(spawned.length, 1);
  assert.strictEqual(spawned[0].cmd, 'powershell.exe', 'started through the delayed launcher');
  assert.strictEqual(spawned[0].file, path.join(tmpDir, 'Seeding-Ops-0.3.0-setup.exe'));
  assert.match(spawned[0].args[spawned[0].args.length - 1], /^Start-Sleep -Seconds \d+; Start-Process .* -ArgumentList '\/P','\/UPDATE','\/R'$/);
  assert.ok(fs.readFileSync(spawned[0].file).equals(INSTALLER));
  assert.strictEqual(exits.length, 1, 'the app closes so the installer can replace it');
  const again = await post(app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(again.status, 409);
  assert.match(again.json().error, /already being installed/);
});

// Audit #3: a failed launch crashed the server (an unhandled 'error' event on the child). Now the
// page is told why, the server stays up, nothing closes, and Install can be pressed again.
test('update routes: when the installer cannot be started the server stays up, says why, closes nothing, and allows a retry', async () => {
  const { app, spawned, exits } = makeApp({ spawnOutcome: 'ENOENT' });
  const r = await post(app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(r.status, 409, r.text);
  assert.strictEqual(r.json().kind, 'launch-failed');
  assert.match(r.json().error, /could not be started: ENOENT/);
  assert.strictEqual(exits.length, 0, 'the app does not close');
  assert.strictEqual((await inject(app.handler, { url: '/api/update' })).status, 200, 'the server still answers');
  const again = await post(app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(again.json().kind, 'launch-failed', 'not "already being installed": a retry is allowed');
  assert.strictEqual(spawned.length, 2);
});

test('update routes: a bad signature, a missing key, a checkout, a running job or a stale version installs nothing and closes nothing', async () => {
  const signer = makeSigner();
  const tampered = makeApp({ signer, gh: github({ signer, installer: Buffer.from('MZ not what was signed'), signature: signer.sign(INSTALLER) }) });
  const bad = await post(tampered.app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(bad.status, 409);
  assert.match(bad.json().error, /signature does not match/);
  assert.deepStrictEqual([tampered.spawned.length, tampered.exits.length, fs.readdirSync(tampered.tmpDir).length], [0, 0, 0]);
  // ...and it can be tried again (the in-progress flag is cleared).
  assert.match((await post(tampered.app, '/api/update/install', { version: '0.3.0' })).json().error, /signature/);

  const noKey = makeApp({ signer: null, gh: github({ signer }) });
  const nk = (await post(noKey.app, '/api/update/check')).json();
  assert.deepStrictEqual([nk.available, nk.can_install], [true, false]);
  assert.match(nk.reason, /no update signing key/);
  assert.strictEqual((await post(noKey.app, '/api/update/install', { version: '0.3.0' })).status, 409);

  const checkout = makeApp({ installed: false });
  assert.match((await inject(checkout.app.handler, { url: '/api/update' })).json().reason, /not the installed app/);
  assert.strictEqual((await post(checkout.app, '/api/update/install', { version: '0.3.0' })).status, 409);

  const busy = makeApp();
  busy.app.jobs.current = { t: 'x' };
  const b = await post(busy.app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(b.status, 409);
  assert.match(b.json().error, /running or queued/);

  const stale = makeApp();
  assert.match((await post(stale.app, '/api/update/install', { version: '0.2.5' })).json().error, /latest version is now 0\.3\.0/);
  for (const x of [noKey, checkout, busy, stale]) assert.deepStrictEqual([x.spawned.length, x.exits.length], [0, 0]);
});

test('update routes: the home page shows the version and the Check for updates button', async () => {
  const { app } = makeApp();
  const html = (await inject(app.handler, { url: '/' })).text;
  assert.match(html, /<span id="appVersion" class="dim">Seeding Ops \d+\.\d+\.\d+<\/span>/);
  assert.match(html, /<button type="button" id="updateCheck">Check for updates<\/button>/);
  assert.match(html, /<script src="\/static\/update\.js"><\/script>/);
  assert.strictEqual((await inject(app.handler, { url: '/static/update.js' })).status, 200);
});

// ---- The page script, run against the rendered home page ----
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'update.js'), 'utf8');
async function page(answers, { confirm = () => true } = {}) {
  const { app } = makeApp();
  const html = (await inject(app.handler, { url: '/' })).text;
  const p = loadPage(SRC, { html, confirm, fetch: async (url) => answers[url] || { status: 404, body: {} } });
  return { p, $: (id) => p.document.getElementById(id) };
}

test('update button: a newer version offers Install; Install asks first, then posts that version and says the app will restart', async () => {
  const asked = [];
  const { p, $ } = await page({
    '/api/update/check': { body: { ok: true, current: '0.2.0', latest: '0.3.0', available: true, can_install: true } },
    '/api/update/install': { status: 202, body: { ok: true, installing: '0.3.0' } },
  }, { confirm: (m) => { asked.push(m); return true; } });
  assert.strictEqual($('updateInstall').hidden, true);
  await $('updateCheck').dispatch('click').results[0];
  assert.match($('updateMsg').textContent, /Version 0\.3\.0 is available \(you have 0\.2\.0\)/);
  assert.strictEqual($('updateInstall').hidden, false);
  assert.strictEqual($('updateInstall').textContent, 'Install 0.3.0');
  await $('updateInstall').dispatch('click').results[0];
  assert.match(asked[0], /Install version 0\.3\.0 now\?[\s\S]*kept/);
  const req = p.requests.find((r) => r.url === '/api/update/install');
  assert.deepStrictEqual(JSON.parse(req.body), { version: '0.3.0' });
  assert.strictEqual(req.headers['X-Seeding-App'], '1');
  assert.match($('updateMsg').textContent, /close and open again/);
});

test('update button: declining the question installs nothing; up to date says so; not installable says why and links the release page', async () => {
  let r = await page({ '/api/update/check': { body: { ok: true, current: '0.2.0', latest: '0.3.0', available: true, can_install: true } } }, { confirm: () => false });
  await r.$('updateCheck').dispatch('click').results[0];
  r.$('updateInstall').dispatch('click');
  assert.ok(!r.p.requests.some((x) => x.url === '/api/update/install'));

  r = await page({ '/api/update/check': { body: { ok: true, current: '0.3.0', latest: '0.3.0', available: false } } });
  await r.$('updateCheck').dispatch('click').results[0];
  assert.strictEqual(r.$('updateMsg').textContent, 'You have the latest version (0.3.0).');
  assert.strictEqual(r.$('updateInstall').hidden, true);

  r = await page({ '/api/update/check': { body: { ok: true, current: '0.2.0', latest: '0.3.0', available: true, can_install: false, reason: 'This copy is not the installed app.', releases_page: 'https://github.com/x/y/releases/latest' } } });
  await r.$('updateCheck').dispatch('click').results[0];
  assert.match(r.$('updateMsg').textContent, /not the installed app/);
  assert.strictEqual(r.$('updateInstall').hidden, true);
  assert.strictEqual(r.$('updateLink').hidden, false);
  assert.strictEqual(r.$('updateLink').href, 'https://github.com/x/y/releases/latest');

  r = await page({ '/api/update/check': { body: { ok: false, kind: 'unreachable', error: 'Could not reach GitHub to check for updates (offline).' } } });
  await r.$('updateCheck').dispatch('click').results[0];
  assert.match(r.$('updateMsg').textContent, /Could not reach GitHub/);
  assert.ok(r.$('updateMsg').classList.contains('err'));
});
