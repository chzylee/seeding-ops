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
  const url = `https://github.com/${REPO}/releases/download/v${version}/Seeding-Ops-${version}-windows-setup.exe`;
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
    spawned.push({ cmd, args, opts, file: ((/::Start\('((?:[^']|'')+)'/.exec(script) || [])[1] || '').replace(/''/g, "'") });
    const c = new EventEmitter(); c.unref = () => {};
    process.nextTick(() => (spawnOutcome === 'spawn' ? c.emit('spawn') : c.emit('error', Object.assign(new Error('x'), { code: spawnOutcome }))));
    return c;
  };
  const dataRoot = tmp('seeding-upd-data-');
  const app = createApp({
    outRoot: path.join(dataRoot, 'out'), dataRoot, getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); },
    update: { installed, current, platform: 'win32', config: { repo: REPO, endpoint: `https://github.com/${REPO}/releases/latest/download/latest.json`, pubkey: signer ? signer.pubkey : '', releasesPage: `https://github.com/${REPO}/releases/latest` },
      fetchImpl: g.fetchImpl, tmpDir, spawnImpl, exit: () => exits.push(1) },
  });
  return { app, spawned, exits, tmpDir, gh: g, dataRoot };
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
  assert.match(spawned[0].args[spawned[0].args.length - 1], /^Start-Sleep -Seconds \d+; \[Diagnostics\.Process\]::Start\('.*', '\/P \/UPDATE \/R'\) \| Out-Null$/);
  assert.ok(fs.readFileSync(spawned[0].file).equals(INSTALLER));
  assert.strictEqual(exits.length, 1, 'the app closes so the installer can replace it');
  const again = await post(app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(again.status, 409);
  assert.match(again.json().error, /already being installed/);
});

// Audit round 2, #2: an installer that never starts after the launcher's wait was never reported.
test('update routes: the app writes a pending-update marker before closing; the next launch turns "still the old version" into a notice with the release link, and clears the marker either way', async () => {
  const U = require('../lib/update');
  const D = require('../lib/data-dir');
  const { app, dataRoot } = makeApp();
  assert.strictEqual((await post(app, '/api/update/install', { version: '0.3.0' })).status, 202);
  const marker = JSON.parse(fs.readFileSync(path.join(dataRoot, U.PENDING_FILE), 'utf8'));
  assert.deepStrictEqual([marker.from, marker.to, marker.releases_page], ['0.2.0', '0.3.0', `https://github.com/${REPO}/releases/latest`]);

  // Next launch, still 0.2.0: the update did not start.
  assert.strictEqual(U.settlePending({ dataRoot, current: '0.2.0', addNotice: D.addNotice }), 'not-started');
  assert.ok(!fs.existsSync(path.join(dataRoot, U.PENDING_FILE)), 'cleared');
  const n = D.readNotices(dataRoot);
  assert.deepStrictEqual(n.map((x) => x.id), ['update-not-started']);
  assert.match(n[0].text, /The update to 0\.3\.0 did not start: this is still 0\.2\.0/);
  const again = createApp({ outRoot: path.join(dataRoot, 'out'), dataRoot, getToken: () => 't', fetchImpl: async () => { throw new Error('offline'); } });
  const html = (await inject(again.handler, { url: '/' })).text;
  assert.match(html, /did not start[^<]*<a href="https:\/\/github\.com\/someone\/seeding-ops\/releases\/latest" target="_blank" rel="noopener">Release page<\/a><\/span><button type="button" class="plain" data-dismiss="update-not-started">Dismiss/);
  assert.strictEqual(U.settlePending({ dataRoot, current: '0.2.0', addNotice: D.addNotice }), 'none', 'said once');

  // The update ran: the version changed, the marker goes, nothing is said.
  const ok = tmp('seeding-upd-ok-');
  U.writePending(ok, { from: '0.2.0', to: '0.3.0', releasesPage: 'https://github.com/x/y/releases/latest' });
  assert.strictEqual(U.settlePending({ dataRoot: ok, current: '0.3.0', addNotice: D.addNotice }), 'done');
  assert.ok(!fs.existsSync(path.join(ok, U.PENDING_FILE)));
  assert.deepStrictEqual(D.readNotices(ok), []);
  // A link that is not a GitHub page is never rendered.
  U.writePending(ok, { from: '0.2.0', to: '0.3.0', releasesPage: 'https://evil.example/' });
  U.settlePending({ dataRoot: ok, current: '0.2.0', addNotice: D.addNotice });
  assert.strictEqual(D.readNotices(ok)[0].link, undefined);
});

// Final audit, #2: the "did not start" notice outlived a later successful update.
test('update routes: a "did not start" notice is dropped on the first launch that has reached its version, and kept before then', () => {
  const U = require('../lib/update');
  const D = require('../lib/data-dir');
  const root = tmp('seeding-upd-stale-');
  const N = { addNotice: D.addNotice, readNotices: D.readNotices, dismissNotice: D.dismissNotice };
  U.writePending(root, { from: '0.2.0', to: '0.3.0', releasesPage: 'https://github.com/x/y/releases/latest' });
  assert.strictEqual(U.settlePending({ dataRoot: root, current: '0.2.0', ...N }), 'not-started');
  assert.deepStrictEqual(D.readNotices(root).map((n) => [n.id, n.to]), [['update-not-started', '0.3.0']]);
  // Still behind: the notice stays.
  assert.strictEqual(U.settlePending({ dataRoot: root, current: '0.2.0', ...N }), 'none');
  assert.strictEqual(D.readNotices(root).length, 1);
  // Installed by hand from the release page: the next launch is 0.3.0 and the notice goes.
  assert.strictEqual(U.settlePending({ dataRoot: root, current: '0.3.0', ...N }), 'none');
  assert.deepStrictEqual(D.readNotices(root), []);
});

test('update routes: a failed launch writes no pending marker', async () => {
  const U = require('../lib/update');
  const { app, dataRoot } = makeApp({ spawnOutcome: 'ENOENT' });
  assert.strictEqual((await post(app, '/api/update/install', { version: '0.3.0' })).status, 409);
  assert.ok(!fs.existsSync(path.join(dataRoot, U.PENDING_FILE)));
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


// ---- Once per launch (Noah, 2026-11-08: "on open, auto check for updates") ----
const latestCalls = (gh) => gh.calls.filter((u) => /latest\.json$/.test(u)).length;

test('update routes: GitHub is asked once per process; every later page reads the cached answer; force asks again', async () => {
  const { app, gh } = makeApp();
  const [a, b] = await Promise.all([post(app, '/api/update/check'), post(app, '/api/update/check')]);
  const c = await post(app, '/api/update/check');
  for (const r of [a, b, c]) assert.deepStrictEqual([r.json().ok, r.json().latest, r.json().available], [true, '0.3.0', true]);
  assert.strictEqual(latestCalls(gh), 1, 'three page loads, one check');
  await post(app, '/api/update/check', { force: true });
  assert.strictEqual(latestCalls(gh), 2, 'a click on "You\'re up to date" asks again');
  // A failed check is cached too: no re-check while the app is open.
  let n = 0;
  const off = makeApp({ gh: { fetchImpl: async () => { n++; throw new Error('ENOTFOUND github.com'); }, calls: [] } });
  await post(off.app, '/api/update/check'); await post(off.app, '/api/update/check');
  assert.strictEqual(n, 1);
});

test('update routes: busy (a pull, schedule pull, archive or queued job) is reported fresh on the cached answer and refuses install with 409', async () => {
  const { app, spawned, exits } = makeApp();
  assert.strictEqual((await post(app, '/api/update/check')).json().busy, false);
  app.jobs.current = { t: 'x' };
  assert.strictEqual((await inject(app.handler, { url: '/api/update' })).json().busy, true);
  assert.strictEqual((await post(app, '/api/update/check')).json().busy, true, 'the cached check carries the busy state of now');
  const r = await post(app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(r.status, 409);
  assert.match(r.json().error, /running or queued/);
  app.jobs.current = null;
  assert.strictEqual((await inject(app.handler, { url: '/api/update' })).json().busy, false);
  assert.deepStrictEqual([spawned.length, exits.length], [0, 0]);
});

test('update routes: a push to start.gg in flight counts as busy; install is refused until it is done', async () => {
  const { seedWorld } = require('../testlib/seed-world');
  const { E_SLUG, T_SLUG, virtualClock } = require('../testlib/fake-api');
  const clock = virtualClock(Date.UTC(2026, 10, 2));
  const w = await seedWorld();
  let release;
  const gate = new Promise((r) => { release = r; });
  const slowPost = async (url, init) => { if (/UpdatePhaseSeeding/.test(String(init && init.body))) await gate; return w.fake(url, init); };
  const signer = makeSigner();
  const g = github({ signer });
  const app = createApp({ outRoot: w.outRoot, dataRoot: tmp('seeding-upd-push-'), tiersFile: w.tiersFile, getToken: () => 'tok', fetchImpl: slowPost, now: clock.now, sleep: clock.sleep,
    update: { installed: true, current: '0.2.0', platform: 'win32', config: { repo: REPO, endpoint: `https://github.com/${REPO}/releases/latest/download/latest.json`, pubkey: signer.pubkey, releasesPage: `https://github.com/${REPO}/releases/latest` },
      fetchImpl: g.fetchImpl, tmpDir: tmp('seeding-upd-dl-'), spawnImpl: () => { throw new Error('no install expected'); }, exit: () => { throw new Error('no exit expected'); } } });
  const req = (u, body) => inject(app.handler, { url: `/api/t/${T_SLUG}/${u}`, method: 'POST', headers: H, body: JSON.stringify(body || {}) });
  const dry = (await req(`push/${E_SLUG}/dry-run`)).json();
  const posting = req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true });
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 20 && !(await inject(app.handler, { url: '/api/update' })).json().busy; i++) await new Promise((r) => setImmediate(r));
  assert.strictEqual((await inject(app.handler, { url: '/api/update' })).json().busy, true, 'busy while the post is in flight');
  const r = await post(app, '/api/update/install', { version: '0.3.0' });
  assert.strictEqual(r.status, 409);
  assert.match(r.json().error, /push to start\.gg/);
  release();
  assert.strictEqual((await posting).status, 200);
  assert.strictEqual((await inject(app.handler, { url: '/api/update' })).json().busy, false, 'not busy once the push is done');
});

// ---- The page script: account.js + update.js, run against the pages the server renders ----
const ACCOUNT_SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'account.js'), 'utf8');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'update.js'), 'utf8');
const ST = (o) => ({ ok: true, current: '0.2.0', latest: '0.3.0', available: true, installed: true, dev: false, can_install: true, busy: false, updating: null, releases_page: 'https://github.com/x/y/releases/latest', ...o });

// answers: url -> { status, body } or a function (init) -> that.
function barPage(answers, html = '') {
  const page = loadPage(ACCOUNT_SRC + '\n' + SRC, { html, fetch: async (url, init) => {
    if (url.startsWith('/api/token')) return { body: { ok: true, state: 'ok', as: 'TestTO', image: null } };
    const a = answers[url];
    return typeof a === 'function' ? a(init) : a || { status: 404, body: {} };
  } });
  const byId = (id) => page.created.find((e) => e.id === id);
  return { page, byId, bar: byId('accountBar'), area: byId('updateArea'), text: byId('updateStatus'), btn: byId('updateBtn'), retry: byId('updateRetry'), link: byId('updateLink'), dlg: byId('updateDialog'),
    checks: () => page.requests.filter((r) => r.url === '/api/update/check') };
}

test('update bar: the home page, a tournament page and the not-added page load it after account.js; the status sits in the account bar, in a polite atomic live region', async () => {
  const { makePool } = require('../testlib/pool-fixture');
  const { app, dataRoot } = makeApp();
  makePool(path.join(dataRoot, 'out'), { t: 'tour', events: [{ slug: 'ev', game: { id: '1', name: 'MBTL' } }], players: [] });
  const pages = { home: await inject(app.handler, { url: '/' }), tournament: await inject(app.handler, { url: '/t/tour' }), notAdded: await inject(app.handler, { url: '/t/nope' }) };
  assert.match(pages.tournament.text, /id="tabs"/, 'the real tournament page');
  for (const [name, r] of Object.entries(pages)) {
    assert.match(r.text, /<script src="\/static\/account\.js" defer><\/script>\s*<script src="\/static\/update\.js" defer><\/script>/, name);
    const p = barPage({ '/api/update/check': { body: ST({ available: false, latest: '0.2.0' }) } }, r.text);
    await p.page.flush();
    assert.ok(p.bar.children.includes(p.area), `${name}: the update status is inside #accountBar`);
    assert.ok(p.area.children.includes(p.text) && p.area.children.includes(p.btn));
    assert.deepStrictEqual([p.text.getAttribute('role'), p.text.getAttribute('aria-live'), p.text.getAttribute('aria-atomic')], ['status', 'polite', 'true']);
    assert.strictEqual(p.text.textContent, "v0.2.0 · You're up to date", name);
  }
  // The home page's old Check for updates footer is gone; the plain version label stays.
  assert.doesNotMatch(pages.home.text, /updateCheck|updateInstall|Check for updates/);
  assert.match(pages.home.text, /<span id="appVersion" class="dim">Seeding Ops \d+\.\d+\.\d+<\/span>/);
  assert.strictEqual((await inject(app.handler, { url: '/static/update.js' })).status, 200);
});

test('update bar: each state\'s exact words', async () => {
  const shown = async (body) => { const p = barPage({ '/api/update/check': { body } }); await p.page.flush(); return p; };
  // Checking: nothing new.
  const pending = barPage({ '/api/update/check': () => new Promise(() => {}) });
  await pending.page.flush();
  assert.strictEqual(pending.area.hidden, true);
  assert.strictEqual(pending.text.textContent, '');

  let p = await shown(ST({ available: false, latest: '0.2.0' }));
  assert.strictEqual(p.text.textContent, "v0.2.0 · You're up to date");
  assert.ok(!p.area.classList.contains('available'));
  assert.deepStrictEqual([p.btn.hidden, p.link.hidden], [true, true]);

  p = await shown(ST());
  assert.strictEqual(p.text.textContent, 'Update available: v0.3.0');
  assert.ok(p.area.classList.contains('available'), 'accent colour');
  assert.deepStrictEqual([p.btn.hidden, p.btn.textContent, p.btn.disabled], [false, 'Update', false]);
  assert.deepStrictEqual([p.link.hidden, p.link.textContent, p.link.href], [false, "What's new", 'https://github.com/x/y/releases/latest']);

  p = await shown(ST({ installed: false, can_install: false, reason: 'This copy is not the installed app.' }));
  assert.strictEqual(p.text.textContent, 'Update available: v0.3.0');
  assert.strictEqual(p.btn.hidden, true, 'no Update where it cannot install');
  assert.deepStrictEqual([p.link.hidden, p.link.textContent, p.link.href], [false, 'Download', 'https://github.com/x/y/releases/latest']);

  p = await shown(ST({ installed: false, dev: true, can_install: false, available: false, latest: '0.2.0' }));
  assert.strictEqual(p.text.textContent, 'v0.2.0 (dev)');

  p = await shown(ST({ updating: '0.3.0' }));
  assert.strictEqual(p.text.textContent, 'Installing update… Seeding Ops will reopen in a moment.');
});

test('update bar: a failed check shows only the version, titled, never an error or a pop-up', async () => {
  for (const body of [
    { ok: false, kind: 'unreachable', error: 'Could not reach GitHub to check for updates (offline).', current: '0.2.0', installed: true, can_install: true },
    { ok: false, kind: 'no-release', error: 'no latest.json', current: '0.2.0', installed: true, can_install: true },
  ]) {
    const p = barPage({ '/api/update/check': { body } });
    await p.page.flush();
    assert.strictEqual(p.text.textContent, 'v0.2.0');
    assert.strictEqual(p.text.title, "Couldn't check for updates");
    assert.ok(!p.area.classList.contains('available') && !p.text.classList.contains('err') && !p.bar.classList.contains('off') && !p.bar.classList.contains('warn'));
    assert.deepStrictEqual([p.btn.hidden, p.retry.hidden, p.link.hidden, p.dlg.showModalCalls], [true, true, true, 0]);
  }
});

test('update bar: one check request per page load, and none from moving around; a click on "You\'re up to date" asks again with force', async () => {
  const p = barPage({ '/api/update/check': { body: ST({ available: false, latest: '0.2.0' }) } });
  await p.page.flush();
  assert.strictEqual(p.page.timers.length, 0, 'no polling while up to date');
  assert.strictEqual(p.checks().length, 1);
  assert.deepStrictEqual(JSON.parse(p.checks()[0].body), {}, 'the page asks for the cached answer');
  assert.strictEqual(p.checks()[0].headers['X-Seeding-App'], '1');
  await p.text.querySelector('.update-recheck').click().results[0];
  assert.strictEqual(p.checks().length, 2);
  assert.deepStrictEqual(JSON.parse(p.checks()[1].body), { force: true });
});

test('update bar: Update opens the confirm dialog; Cancel installs nothing and puts focus back on Update', async () => {
  const p = barPage({ '/api/update/check': { body: ST() } });
  await p.page.flush();
  p.btn.click();
  assert.strictEqual(p.dlg.showModalCalls, 1);
  assert.strictEqual(p.dlg.querySelector('h2').textContent, 'Update to v0.3.0?');
  assert.match(p.dlg.innerHTML, /<p class="dim">Seeding Ops will close, install the update, and reopen\. Your tiers, tournaments and start\.gg connection are kept\.<\/p>/);
  assert.match(p.dlg.innerHTML, /<button type="button" class="go">Update<\/button><button type="button" class="plain cancel">Cancel<\/button>/);
  assert.strictEqual(p.dlg.querySelector('.go').focusCalls, 1, 'focus moves into the dialog');
  const before = p.btn.focusCalls;
  p.dlg.querySelector('.cancel').click();
  p.dlg.dispatch('close');
  assert.strictEqual(p.dlg.open, false);
  assert.strictEqual(p.btn.focusCalls, before + 1, 'focus returns to Update');
  assert.ok(!p.page.requests.some((r) => r.url === '/api/update/install'));
});

test('update bar: confirming posts the install with that version, says Downloading, then Installing', async () => {
  let finish;
  const p = barPage({
    '/api/update/check': { body: ST() },
    '/api/update/install': () => new Promise((r) => { finish = r; }),
  });
  await p.page.flush();
  p.btn.click();
  const done = p.dlg.querySelector('.go').click().results[0];
  await p.page.flush();
  assert.strictEqual(p.dlg.open, false);
  const req = p.page.requests.find((r) => r.url === '/api/update/install');
  assert.deepStrictEqual(JSON.parse(req.body), { version: '0.3.0' });
  assert.strictEqual(req.headers['X-Seeding-App'], '1');
  assert.strictEqual(p.text.textContent, 'Downloading update…');
  assert.strictEqual(p.btn.hidden, true);
  finish({ status: 202, body: { ok: true, installing: '0.3.0' } });
  await done;
  assert.strictEqual(p.text.textContent, 'Installing update… Seeding Ops will reopen in a moment.');
});

test('update bar: a failed install says so with Retry and the server\'s reason in the title; Retry posts again', async () => {
  let n = 0;
  const p = barPage({
    '/api/update/check': { body: ST() },
    '/api/update/install': () => (++n === 1 ? { status: 409, body: { error: 'The update\'s signature does not match the file.' } } : { status: 202, body: { ok: true, installing: '0.3.0' } }),
  });
  await p.page.flush();
  p.btn.click();
  await p.dlg.querySelector('.go').click().results[0];
  assert.strictEqual(p.text.textContent, 'Update failed. Try again later.');
  assert.strictEqual(p.text.title, 'The update\'s signature does not match the file.');
  assert.deepStrictEqual([p.retry.hidden, p.retry.textContent], [false, 'Retry']);
  await p.retry.click().results[0];
  assert.strictEqual(n, 2);
  assert.strictEqual(p.text.textContent, 'Installing update… Seeding Ops will reopen in a moment.');
  assert.strictEqual(p.retry.hidden, true);
});

test('update bar: while a pull or push runs Update is disabled with a reason, and comes back when it is done', async () => {
  let busy = true;
  const p = barPage({
    '/api/update/check': { body: ST({ busy: true }) },
    '/api/update': () => ({ body: { busy, updating: null } }),
  });
  await p.page.flush();
  assert.deepStrictEqual([p.btn.hidden, p.btn.disabled, p.btn.title], [false, true, 'Finish the current pull or push first']);
  p.btn.click();
  assert.strictEqual(p.dlg.showModalCalls, 0, 'no dialog while busy');
  // The busy state is read again every few seconds while Update is on offer (local, not GitHub).
  busy = false;
  p.page.runTimers();
  await p.page.flush();
  assert.deepStrictEqual([p.btn.disabled, p.btn.title], [false, 'Update to v0.3.0']);
  const polls = p.page.requests.filter((r) => r.url === '/api/update');
  assert.strictEqual(polls.length, 1);
  assert.strictEqual(p.checks().length, 1, 'the poll never re-checks GitHub');
});
