'use strict';
// The page's Seed-column guarantees, RUN (auditor finding 7, build D pass 2): app/public/app.js boots
// with the real lib/view/model.js and render.js on a fake page (testlib/fake-dom.js), and every request
// it makes goes to the real server (app/server.js createApp through testlib/inject.js) over a pulled
// tournament on the fake start.gg (testlib/seed-world.js). A keyboard move on a row's ⠿ handle stands
// in for a drag (both end in the same applySeedMove; the pointer path needs layout a fake page lacks:
// see the build record's visual checks). What is checked is what reached start.gg and state.json.
//
// Noah, 2026-11-06/07: rows stay draggable right up to the push; Post sends the Seed column as it is at
// the click, in tier order too; an open dry run never goes stale; a re-push works; the page's last
// write wins; another window's arrangement is never erased silently.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../lib/pool');
const M = require('../lib/view/model');
const seeding = require('../lib/seeding');
const data = require('../lib/view/data');
const { parseCsv } = require('../lib/output');
const { loadPage, makeEl, anything } = require('../testlib/fake-dom');
const { inject } = require('../testlib/inject');
const { seedWorld, T_SLUG, E_SLUG, GAME } = require('../testlib/seed-world');

const ROOT = path.join(__dirname, '..');
const SRC = ['lib/view/model.js', 'lib/view/render.js', 'app/public/app.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

// The page, booted against the world's server. hold(url, init): return a promise to delay that request
// (the test releases it), or null to answer at once.
async function bootPage(w, { hold = () => null, confirm = () => true } = {}) {
  const summary = makeEl('table', { id: 'summary' });
  summary.tHead = anything('thead');
  summary.tBodies = [anything('pinned'), anything('main')];
  summary.rows = [];
  const push = makeEl('section', { id: 'push' });
  const pushBody = makeEl('div', { id: 'pushBody' });
  const pushPost = makeEl('button', { id: 'pushPost' });
  const pushStatus = makeEl('span', { id: 'pushStatus' });
  const exportCsv = makeEl('button', { id: 'exportCsv' });
  // "Needs tier only" off, as on a fresh page (a stand-in would read as checked and hide tiered rows).
  const needsOnly = makeEl('input', { id: 'needsOnly' });
  needsOnly.checked = false;
  const parts = [];
  const g = { SEED_TAB: { t: T_SLUG, game: { id: w.gid, name: GAME.name }, events: [E_SLUG], eventInfo: { [E_SLUG]: { name: 'Singles' } } },
    localStorage: anything('localStorage'), performance: { now: () => 0 }, PerformanceObserver: anything('PerformanceObserver'),
    IntersectionObserver: anything('IntersectionObserver'), ResizeObserver: anything('ResizeObserver'), requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    Blob: class { constructor(p) { parts.push(...p); } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }, setInterval: () => 0, clearInterval: () => {},
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type) { this.type = type; } },
    getComputedStyle: anything('getComputedStyle'), matchMedia: anything('matchMedia'), navigator: anything('navigator'), history: anything('history'),
    CSS: { escape: (s) => String(s) }, Buffer };
  const answer = async (url, init) => {
    const r = await inject(w.app.handler, { url, method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' });
    return /\.csv$/.test(url) && r.status === 200 ? { status: 200, body: r.text, raw: true } : { status: r.status, body: r.text ? r.json() : {} };
  };
  const page = loadPage(SRC, {
    stubMissing: true, globals: g, confirm, elements: { summary, push, pushBody, pushPost, pushStatus, exportCsv, needsOnly },
    fetch: (url, init = {}) => { const h = hold(url, init); return h ? h.then(() => answer(url, init)) : answer(url, init); },
  });
  await page.flush(20);
  const sent = (re) => page.requests.filter((r) => re.test(r.url)).map((r) => ({ url: r.url, body: r.body ? JSON.parse(r.body) : null }));
  // A row's ⠿ handle, focused, a key pressed (the page's keyboard reorder).
  const key = (pid, k) => {
    const tr = { dataset: { pid } };
    const btn = { closest: (sel) => (sel === 'button.drag' ? btn : sel === 'tr' ? tr : null) };
    summary.dispatch('keydown', { key: k, target: btn });
  };
  const click = (what) => push.dispatch('click', { target: { closest: (sel) => (what === 'post' ? (sel === '#pushPost' ? pushPost : null) : (sel === 'button.push-dry' ? { dataset: { e: E_SLUG } } : null)) } });
  const until = async (cond, n = 200) => { for (let i = 0; i < n && !cond(); i++) await page.flush(2); assert.ok(cond(), 'timed out waiting'); };
  return { page, summary, push, pushBody, pushPost, pushStatus, exportCsv, parts, sent, key, click, until };
}
// The column after pressing Home on a player (to the top), as the page computes it.
const toTop = (order, id) => M.moveSeed(order, id, order[0], 'before');
const deferred = () => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; };

test('page: a move, then Post at once (its save still on the way): start.gg gets the column as it was at the click', async () => {
  const w = await seedWorld();
  const save = deferred();
  const p = await bootPage(w, { hold: (url) => (/\/seeds$/.test(url) ? save.p : null) });
  p.click('dry');
  await p.until(() => p.sent(/dry-run$/).length === 1 && /push-diff/.test(p.pushBody.innerHTML));
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const mover = w.seeded(w.initial, dry).slice(-1)[0];
  p.key(mover, 'Home');                       // the move; its save is held on the wire
  const expected = toTop(w.initial, mover);
  p.click('post');                            // Post one instant later
  await p.page.flush(10);
  assert.strictEqual(p.sent(/\/post$/).length, 0, 'Post waits for the save in flight (one chain, in order)');
  save.release();
  await p.until(() => w.pushes().length === 1);
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(expected, dry), 'start.gg got the moved column, seed 1 first');
  const body = p.sent(/\/post$/)[0].body;
  assert.deepStrictEqual(body.seeding.order, expected, 'the post sent the column on screen');
  assert.deepStrictEqual(body.proposed, M.proposedPairs(M.pushPlan(dry.entries, { order: expected, mode: 'arranged' }).rows), 'and the dry run it drew from that column');
  assert.deepStrictEqual(seeding.savedFor(pool.readState(w.tDir), E_SLUG).order, expected, 'a reload shows it');
  assert.ok(p.sent(/\/seeds$/).length === 1 && p.page.requests.findIndex((r) => /\/seeds$/.test(r.url)) < p.page.requests.findIndex((r) => /\/post$/.test(r.url)));
});

test('page: nothing arranged, Post sends the tier-order column exactly as shown (Noah 2026-11-07); tier order stays tier order', async () => {
  const w = await seedWorld();
  const p = await bootPage(w);
  p.click('dry');
  await p.until(() => /push-diff/.test(p.pushBody.innerHTML));
  assert.match(p.pushBody.innerHTML, /the Seed column in tier order/);
  p.click('post');
  await p.until(() => w.pushes().length === 1);
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  assert.deepStrictEqual(p.sent(/\/post$/)[0].body.seeding.order, w.initial);
  assert.strictEqual(p.sent(/\/post$/)[0].body.seeding.mode, 'tiers');
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(w.initial, dry));
  assert.strictEqual(seeding.savedFor(pool.readState(w.tDir), E_SLUG), null);
});

test('page: an open dry run is redrawn after a move, with no new request; the confirm is the only pause and the order is read after it', async () => {
  const w = await seedWorld();
  let asked = null;
  const p = await bootPage(w, { confirm: (msg) => { asked = msg; return true; } });
  p.click('dry');
  await p.until(() => /push-diff/.test(p.pushBody.innerHTML));
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const mover = w.seeded(w.initial, dry).slice(-1)[0];
  const tag = dry.rows.find((r) => r.player_id === mover).tag;
  assert.doesNotMatch(p.pushBody.innerHTML, new RegExp(`<b>1</b></td><td>${tag}</td>`));
  const dryRuns = p.sent(/dry-run$/).length;
  p.key(mover, 'Home');
  assert.match(p.pushBody.innerHTML, new RegExp(`<b>1</b></td><td>${tag}</td>`), 'redrawn at once: the moved player is proposed seed 1');
  assert.match(p.pushBody.innerHTML, /your arranged seed order/);
  assert.strictEqual(p.sent(/dry-run$/).length, dryRuns, 'no new dry run was needed');
  p.click('post');
  await p.until(() => w.pushes().length === 1);
  assert.match(asked, /in your arranged seed order/);
});

test('page: after a push the rows stay draggable and Post works again with no new dry run (a re-push)', async () => {
  const w = await seedWorld();
  const p = await bootPage(w);
  p.click('dry');
  await p.until(() => /push-diff/.test(p.pushBody.innerHTML));
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const s = w.seeded(w.initial, dry);
  p.key(s[s.length - 1], 'Home');
  p.click('post');
  await p.until(() => w.pushes().length === 1);
  await p.until(() => /Posted:/.test(p.pushStatus.textContent));
  assert.strictEqual(p.pushPost.disabled, false, 'Post is enabled again');
  const first = toTop(w.initial, s[s.length - 1]);
  const s2 = w.seeded(first, dry);
  p.key(s2[s2.length - 1], 'Home');
  const second = toTop(first, s2[s2.length - 1]);
  p.click('post');
  await p.until(() => w.pushes().length === 2);
  assert.strictEqual(p.sent(/dry-run$/).length, 1, 'one dry run for both posts');
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(second, dry));
});

test('page (finding 6): a move made while the post is on its way is saved after it, so a reload shows the newest order; the post sent the order at the click', async () => {
  const w = await seedWorld();
  const postWire = deferred();
  const p = await bootPage(w, { hold: (url) => (/\/post$/.test(url) ? postWire.p : null) });
  p.click('dry');
  await p.until(() => /push-diff/.test(p.pushBody.innerHTML));
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const s = w.seeded(w.initial, dry);
  p.click('post');
  await p.until(() => p.sent(/\/post$/).length === 1);   // the post is on the wire, held
  p.key(s[s.length - 1], 'Home');                     // a move while it travels
  await p.page.flush(10);
  assert.strictEqual(p.sent(/\/seeds$/).length, 0, 'the move\'s save waits behind the post');
  postWire.release();
  await p.until(() => p.sent(/\/seeds$/).length === 1 && w.pushes().length === 1);
  await p.page.flush(10);
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(w.initial, dry), 'the post sent the column at the click');
  assert.deepStrictEqual(seeding.savedFor(pool.readState(w.tDir), E_SLUG).order, toTop(w.initial, s[s.length - 1]), 'the later move is what is saved');
});

test('page (finding 5): another window arranged the event; this page\'s next change is refused, it shows that order, and Post then sends it', async () => {
  const w = await seedWorld();
  const p = await bootPage(w);
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const s = w.seeded(w.initial, dry);
  // Window B (loaded at rev 0) puts its own order in.
  const theirs = toTop(w.initial, s[2]);
  seeding.setOrder(data.tabSource(w.outRoot, T_SLUG, w.gid), E_SLUG, { mode: 'arranged', order: theirs, base: 0, client: 'pB', seq: 1 });
  p.key(s[s.length - 1], 'Home');   // this page, still at rev 0
  await p.until(() => p.sent(/\/seeds$/).length === 1);
  await p.page.flush(10);
  assert.deepStrictEqual(seeding.savedFor(pool.readState(w.tDir), E_SLUG).order, theirs, 'window B\'s order is not erased');
  p.click('dry');
  await p.until(() => /push-diff/.test(p.pushBody.innerHTML));
  p.click('post');
  await p.until(() => w.pushes().length === 1);
  const body = p.sent(/\/post$/)[0].body;
  assert.deepStrictEqual(body.seeding.order, theirs, 'the page adopted window B\'s order');
  assert.strictEqual(body.seeding.base, 1);
});

test('page: Export sends the event shown and its Seed column; the CSV\'s Seed numbers are that column', async () => {
  const w = await seedWorld();
  const p = await bootPage(w);
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const s = w.seeded(w.initial, dry);
  p.key(s[s.length - 1], 'Home');
  const ev = p.exportCsv.dispatch('click');
  await Promise.all(ev.results);
  const req = p.sent(/export\.csv$/)[0];
  const column = toTop(w.initial, s[s.length - 1]);
  assert.strictEqual(req.body.event, E_SLUG);
  assert.deepStrictEqual(req.body.seeding, { mode: 'arranged', order: column });
  const rows = parseCsv(Buffer.concat(p.parts.map((x) => Buffer.from(x))).toString('utf8'));
  assert.deepStrictEqual(rows.filter((r) => r.Seed).map((r) => r['start.gg player id']), column);
});
