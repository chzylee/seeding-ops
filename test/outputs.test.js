'use strict';
// Outputs (docs/design-tool.md, Outputs; dispatch-contract-tool-b.md Acceptance 8, 9 and 13): the
// seeds CSV export, the push dry run and post (against the fake start.gg only: never live), the one
// numbering both use, and build A's small follow-ups B4-2, B4-3 and B4-5.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out = require('../lib/output');
const pool = require('../lib/pool');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const sgg = require('../lib/startgg');
const push = require('../lib/push');
const { run } = require('../lib/run');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { makePool, addTournament } = require('../testlib/pool-fixture');
const { buildWorld, createFakeFetch, virtualClock, sink, T_SLUG, E_SLUG, E2_SLUG, GAME } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const H = { 'X-Seeding-App': '1' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-outputs-'));
const ROOT = path.join(__dirname, '..');
const G = { id: '22407', name: 'MBAACC' };
const tierRow = (o) => ({ game_id: G.id, game_name: G.name, player_id: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'app', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });
const player = (id, tag) => ({ player_id: String(id), gamer_tag: tag, prefix: '', user_slug: `u${id}`, region_state: '', region_country: '', result_count: '0', history_status: 'complete', team_entry: 'false' });

// ---- The one numbering --------------------------------------------------------------------------

test('seedSequence: higher tier gets the lower seed, one contiguous 1..N, the given order within a tier, untiered then unmappable after', () => {
  const seq = M.seedSequence([
    { id: 'd', tier: null }, { id: 'c', tier: 9 }, { id: 'x', tier: 8, mappable: false }, { id: 'a', tier: 9 },
    { id: 'f', tier: null }, { id: 'b', tier: 7 }, { id: 'e', tier: 0 }, { id: 'y', tier: null, mappable: false },
  ]);
  assert.deepStrictEqual(seq.map((x) => [x.id, x.seed, x.group]), [
    ['c', 1, 'tiered'], ['a', 2, 'tiered'], ['b', 3, 'tiered'], ['e', 4, 'tiered'],
    ['d', 5, 'untiered'], ['f', 6, 'untiered'], ['x', 7, 'unmappable'], ['y', 8, 'unmappable']]);
  assert.deepStrictEqual(M.seedSequence([]), []);
});

test('the export and the push number with the same function (one source): both call M.seedSequence, and nothing else orders seeds', () => {
  const dataSrc = fs.readFileSync(path.join(ROOT, 'lib', 'view', 'data.js'), 'utf8');
  const pushSrc = fs.readFileSync(path.join(ROOT, 'lib', 'push.js'), 'utf8');
  assert.match(dataSrc, /M\.seedSequence\(/);
  assert.match(pushSrc, /M\.seedSequence\(/);
  // The same players, tiers and order give the same numbers through both paths.
  const outRoot = tmp();
  const ps = [player(1, 'A'), player(2, 'B'), player(3, 'C'), player(4, 'D')];
  makePool(outRoot, { t: 'tour', events: [{ slug: 'ev', game: G }], players: ps });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [tierRow({ player_id: '1', tier: '5' }), tierRow({ player_id: '3', tier: '8' }), tierRow({ player_id: '4', tier: '5' })]));
  const order = ['2', '4', '1', '3'];
  const exp = data.seedsExport(data.tabSource(outRoot, 'tour', G.id), { order, tiersFile }).sequence.map((x) => [x.id, x.seed]);
  const seeds = order.map((id, i) => ({ id: `s${id}`, seedNum: i + 1, entrant: { id: Number(id), participants: [{ player: { id: Number(id), gamerTag: ps[id - 1].gamer_tag } }] } }));
  const dry = push.buildDryRun({ phase: { id: '1' }, seeds, poolIds: new Set(['1', '2', '3', '4']), tierRows: data.readTiers(G.id, tiersFile) });
  assert.deepStrictEqual(dry.rows.map((r) => [r.player_id, r.proposed]), exp);
  assert.deepStrictEqual(exp, [['3', 1], ['4', 2], ['1', 3], ['2', 4]]);
});

// ---- Acceptance 8: Export CSV ---------------------------------------------------------------------

test('export seeds CSV: tier, tag, player_id, proposed seed in seed order (higher tier first, table order within a tier, untiered last); no start.gg request', async () => {
  const outRoot = tmp();
  const ps = [player(1, 'Alpha'), player(2, '=Bravo'), player(3, 'Charlie'), player(4, 'Delta'), player(5, 'Echo'), player(6, 'Foxtrot')];
  makePool(outRoot, { t: 'tour', events: [{ slug: 'ev', game: G }], players: ps });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [
    tierRow({ player_id: '1', tier: '9' }), tierRow({ player_id: '2', tier: '7' }), tierRow({ player_id: '3', tier: '9' }),
    tierRow({ sheet_tag: 'Echo', tier: '0', source: 'sheet import' })]));
  let calls = 0;
  const app = createApp({ outRoot, tiersFile, getToken: () => TOKEN, fetchImpl: async () => { calls++; throw new Error('no start.gg request expected'); } });
  const get = async (q) => {
    const r = await inject(app.handler, { url: `/api/t/tour/g/${G.id}/seeds.csv${q}` });
    assert.strictEqual(r.status, 200, r.text);
    return { r, rows: out.parseCsv(r.text) };
  };
  // The table's order as the page shows it (sorted by Noah): Delta, Charlie, Alpha, Foxtrot, Bravo, Echo.
  const { r, rows } = await get('?order=4,3,1,6,2,5');
  assert.match(r.headers['Content-Disposition'], /^attachment; filename="tour-mbaacc-seeds\.csv"$/);
  assert.deepStrictEqual(Object.keys(rows[0]), ['tier', 'tag', 'player_id', 'proposed_seed']);
  assert.deepStrictEqual(rows.map((x) => [x.proposed_seed, x.tier, x.tag, x.player_id]), [
    ['1', '9', 'Charlie', '3'], ['2', '9', 'Alpha', '1'], ['3', '7', "'=Bravo", '2'], ['4', '0', 'Echo', '5'],
    ['5', '', 'Delta', '4'], ['6', '', 'Foxtrot', '6']]);
  // Without an order: the page's default order (tier, then tag); ids not in the tab are ignored.
  const d = (await get('?order=999,abc')).rows;
  assert.deepStrictEqual(d.map((x) => x.player_id), ['1', '3', '2', '5', '4', '6']);
  assert.deepStrictEqual(d.map((x) => x.proposed_seed), ['1', '2', '3', '4', '5', '6']);
  assert.strictEqual(calls, 0, 'no start.gg request');
});

// ---- Acceptance 9: the push (fake start.gg only) ---------------------------------------------------

test('push: the target phase is the first by phaseOrder (unordered last)', () => {
  assert.deepStrictEqual(push.firstPhase({ phases: [{ id: '2', phase_order: 2 }, { id: '9', phase_order: null }, { id: '1', phase_order: 1 }] }).id, '1');
  assert.strictEqual(push.firstPhase({ phases: [] }), null);
});

test('push dry run (pure): one sequence over every seed, current -> proposed, cross-tier moves flagged, not-in-pool marked, pool players gone from start.gg ignored', () => {
  const s = (id, num, pid, tag) => ({ id, seedNum: num, entrant: pid == null ? null : { id: 1000 + num, name: tag, participants: [].concat(pid).map((p) => ({ player: { id: p, gamerTag: tag } })) } });
  const seeds = [s('a', 1, 11, 'Low7'), s('b', 2, 12, 'Hi9'), s('c', 3, 13, 'NoTier'), s('d', 4, [14, 15], 'Team'), s('e', 5, 16, 'Late9'), s('f', 6, null, 'TBD'), s('g', 7, 17, 'Mid7')];
  const tierRows = [tierRow({ player_id: '11', tier: '7' }), tierRow({ player_id: '12', tier: '9' }), tierRow({ player_id: '16', tier: '9' }), tierRow({ player_id: '17', tier: '7' })];
  const dry = push.buildDryRun({ phase: { id: 'P', name: 'Pools' }, seeds, poolIds: new Set(['11', '12', '13', '17', '99']), tierRows });
  assert.deepStrictEqual(dry.phase, { id: 'P', name: 'Pools' });
  assert.deepStrictEqual(dry.rows.map((r) => [r.tag, r.group, r.current, r.proposed]), [
    ['Hi9', 'tiered', 2, 1], ['Late9', 'tiered', 5, 2], ['Low7', 'tiered', 1, 3], ['Mid7', 'tiered', 7, 4],
    ['NoTier', 'untiered', 3, 5], ['Team', 'unmappable', 4, 6], ['(no entrant)', 'unmappable', 6, 7]]);
  const by = Object.fromEntries(dry.rows.map((r) => [r.tag, r]));
  assert.strictEqual(by.Late9.not_in_pool, true, 'a late registrant with a T1 tier is tiered, and marked not in the pool');
  assert.strictEqual(by.Late9.group, 'tiered');
  assert.strictEqual(by.Hi9.not_in_pool, false);
  assert.strictEqual(by.Team.not_in_pool, false, 'unmappable seeds are not "not in pool"');
  assert.ok(!dry.rows.some((r) => r.player_id === '99'), 'a pool player no longer in start.gg is ignored');
  // Every seed changes places with a seed of another group here (Mid7 passes even the empty seed).
  assert.deepStrictEqual(dry.rows.filter((r) => r.crosses_tier).map((r) => r.tag).sort(), ['(no entrant)', 'Hi9', 'Late9', 'Low7', 'Mid7', 'NoTier', 'Team']);
  // Already in tier order: nothing moves, nothing is flagged.
  const settled = push.buildDryRun({ phase: { id: 'P' }, seeds: dry.rows.map((r, i) => s(`z${i}`, r.proposed, r.player_id == null ? null : Number(r.player_id), r.tag)).filter((x) => x.entrant), poolIds: new Set(), tierRows });
  assert.ok(settled.rows.every((r) => !r.moved && !r.crosses_tier));
  assert.deepStrictEqual(dry.summary, { seeds: 7, tiered: 4, untiered: 1, unmappable: 2, moved: 7, crosses_tier: 7, not_in_pool: 1 });
  // The page renders the diff grouped (a)/(b)/(c), with the flags, from render.js.
  const html = R.pushDiffTable(dry);
  assert.ok(html.indexOf('Tiered') < html.indexOf('No tier') && html.indexOf('No tier') < html.indexOf('Unmappable'));
  assert.strictEqual((html.match(/crosses tier<\/span>/g) || []).length, 7);
  assert.match(html, /not in pool/);
});

async function pushSetup(fetchOpts) {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  addTournament(outRoot, world, [E_SLUG]);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG], token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  const tiersFile = path.join(outRoot, 'tiers.csv');
  const gid = String(GAME.id);
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [
    tierRow({ game_id: gid, player_id: '101', tier: '9' }), tierRow({ game_id: gid, player_id: '115', tier: '9' }), tierRow({ game_id: gid, player_id: '103', tier: '4' })]));
  const fake = createFakeFetch(world, fetchOpts);
  const app = createApp({ outRoot, tiersFile, getToken: () => TOKEN, fetchImpl: fake, now: () => Date.UTC(2026, 10, 2), sleep: clock.sleep });
  const post = (url, body) => inject(app.handler, { url: `/api/t/${T_SLUG}/push/${url}`, method: 'POST', headers: H, body: JSON.stringify(body || {}) });
  return { outRoot, world, fake, app, post, tDir: path.join(outRoot, T_SLUG) };
}

test('push dry run against the fake: the first phase by phaseOrder, read-only (the seeds query only), mapped to T1 and the pool', async () => {
  const { fake, post } = await pushSetup();
  const r = await post(`${E_SLUG}/dry-run`);
  assert.strictEqual(r.status, 200, r.text);
  const dry = r.json();
  assert.deepStrictEqual(dry.phase, { id: '5001', name: 'Bracket' });
  assert.deepStrictEqual(fake.calls.map((c) => [c.op, String(c.variables.phaseId)]), [['PhaseSeeds', '5001']]);
  assert.deepStrictEqual(dry.summary, { seeds: 15, tiered: 3, untiered: 10, unmappable: 2, moved: dry.summary.moved, crosses_tier: dry.summary.crosses_tier, not_in_pool: 0 });
  assert.deepStrictEqual(dry.rows.slice(0, 3).map((r) => [r.player_id, r.tier, r.proposed]), [['115', 9, 1], ['101', 9, 2], ['103', 4, 3]], 'tier desc, start.gg\'s current order within a tier');
  assert.ok(dry.rows.slice(-2).every((r) => r.group === 'unmappable'), 'the team entrant and the empty seed last');
  assert.ok(!fake.calls.some((c) => c.op === 'UpdatePhaseSeeding'), 'a dry run never posts');
  assert.strictEqual((await post('melee-singles/dry-run')).status, 404, 'only a seeded event');
});

test('push post: only on a confirmed click with the dry run\'s fingerprint; re-checked against start.gg; recorded in state.json.pushes (fake start.gg only, never live)', async () => {
  const { fake, post, tDir } = await pushSetup();
  const dry = (await post(`${E_SLUG}/dry-run`)).json();
  let r = await post(`${E_SLUG}/post`, { fingerprint: dry.fingerprint });
  assert.strictEqual(r.status, 400, 'no confirm, no post');
  r = await post(`${E_SLUG}/post`, { fingerprint: 'stale', confirm: true });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json().failure, 'stale');
  assert.ok(!fake.calls.some((c) => c.op === 'UpdatePhaseSeeding'));
  const mutated = [];
  fake.calls.length = 0;
  r = await post(`${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(fake.calls.map((c) => c.op), ['PhaseSeeds', 'UpdatePhaseSeeding'], 'a fresh seeds read, then the one post');
  const m = fake.calls[1].variables;
  assert.strictEqual(m.phaseId, '5001');
  assert.deepStrictEqual(m.seedMapping, dry.rows.map((x) => ({ seedId: x.seed_id, seedNum: x.proposed })));
  assert.deepStrictEqual(r.json(), { posted: true, event: E_SLUG, phase_id: '5001', phase_name: 'Bracket', at: '2026-11-02T00:00:00.000Z', seed_count: 15 });
  assert.deepStrictEqual(pool.readState(tDir).pushes, [{ event: E_SLUG, phase_id: '5001', phase_name: 'Bracket', at: '2026-11-02T00:00:00.000Z', seed_count: 15 }]);
  // After the post start.gg's order is the proposed one: a new dry run moves nothing.
  const again = (await post(`${E_SLUG}/dry-run`)).json();
  assert.strictEqual(again.summary.moved, 0);
  assert.strictEqual(again.summary.crosses_tier, 0);
  void mutated;
});

test('push failure modes are one status line, no retry: bracket started / phase locked, token not an admin, rate limit', async () => {
  for (const [msg, kind] of [['Phase has already started', 'locked'], ['This phase is locked', 'locked'], ['You are not authorized to edit this tournament', 'not-admin']]) {
    const { fake, post } = await pushSetup({ pushError: msg });
    const dry = (await post(`${E_SLUG}/dry-run`)).json();
    const r = await post(`${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true });
    assert.strictEqual(r.status, 502, msg);
    assert.strictEqual(r.json().failure, kind, msg);
    assert.ok(!r.json().error.includes('\n'), 'one line');
    assert.ok(r.json().error.includes(msg));
    assert.strictEqual(fake.calls.filter((c) => c.op === 'UpdatePhaseSeeding').length, 1, `${msg}: no retry`);
  }
  assert.strictEqual(sgg.pushFailure(new sgg.StartggError('rate-limited', 'UpdatePhaseSeeding: gave up after 5 tries')).kind, 'rate-limit');
  assert.strictEqual(sgg.pushFailure(new sgg.StartggError('bad-token', 'x')).kind, 'not-admin');
  assert.strictEqual(sgg.pushFailure(new sgg.StartggError('query', 'something else')).kind, 'other');
  // A dry run that fails is a status line too.
  const { post } = await pushSetup({ seedsError: 'You are not authorized to view seeds' });
  const r = await post(`${E_SLUG}/dry-run`);
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.json().failure, 'not-admin');
});

test('the page: posting needs a click on a dry run and a confirm, sends the fingerprint, and shows outcomes in the push status line; the export uses the table\'s order', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', 'public', 'app.js'), 'utf8');
  const fn = (name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n  }\n', i)); };
  const postFn = fn('postSeeding');
  assert.match(postFn, /if \(!dry\) return;/, 'no post without a dry run on the page');
  assert.match(postFn, /window\.confirm\(/);
  assert.match(postFn, /\{ fingerprint: dry\.fingerprint, confirm: true \}/);
  assert.match(postFn, /pushLine\(r\.body\.error \|\| 'Not posted\.', true\)/);
  assert.match(fn('runDry'), /R\.pushDiffTable\(dry\)/);
  // Noah, 2026-10-30: one export; it carries the table's order to export.csv (the Seed column uses it).
  // 2026-11-06: in the POST body, not the URL (2000+ ids overflowed the header limit; test/export-post.test.js).
  assert.match(src, /const order = tableOrder\(\);[\s\S]*?fetchCsvWithProgress\(url, exportUi\.progress, order\)/);
  assert.doesNotMatch(src, /seeds\.csv/, 'the seeds.csv button is gone from the page');
});

// ---- Acceptance 13: build A follow-ups ---------------------------------------------------------------

test('B4-2: a failed ✓ or edit shows "Not saved" in the status line (error style), not only in #msg, and flashes the cell', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', 'public', 'app.js'), 'utf8');
  const fn = (name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n  }\n', i)); };
  assert.match(fn('toggleReviewed'), /if \(!res\.ok\) \{ notSaved\(body, table\.querySelectorAll\(`tbody tr\[data-pid="\$\{CSS\.escape\(pid\)\}"\] > td\.seeded`\)\); return; \}/);
  assert.match(fn('closeEditor'), /if \(!res\.ok\) \{ notSaved\(body, \[td\]\); return; \}/);
  const ns = fn('notSaved');
  assert.match(ns, /showNote\(`Not saved: \$\{\(body && body\.error\) \|\| 'error'\}`, \{ err: true \}\)/);
  assert.match(ns, /classList\.add\('save-failed'\)/);
  assert.match(fn('showNote'), /el\.classList\.toggle\('err', noteErr/);
  assert.ok(!/showMsg\(`Not saved/.test(src), '#msg no longer carries "Not saved"');
});

test('B4-3: the grey hover says "never reviewed" and names the sheet import only when the tier came from it', () => {
  const ctx = { tournament: 't', today: '2026-11-03' };
  assert.strictEqual(R.recencyTitle({ tier: 5, source: 'app' }, ctx), 'Never reviewed');
  assert.strictEqual(R.recencyTitle({ tier: 5, source: 'sheet import' }, ctx), 'Never reviewed (tier from the sheet import)');
  // readNotes carries the row's source to the page.
  const outRoot = tmp();
  makePool(outRoot, { t: 'tour', events: [{ slug: 'ev', game: G }], players: [player(1, 'App'), player(2, 'Sheet')] });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [tierRow({ player_id: '1', tier: '6', source: 'app' }), tierRow({ sheet_tag: 'Sheet', tier: '6', source: 'sheet import' })]));
  const vm = data.viewModel(data.tabSource(outRoot, 'tour', G.id), { tiersFile, today: '2026-11-03' });
  const c = R.contextFromViewModel(vm, { app: true });
  const title = (pid, cls) => new RegExp(`<td class="tier ${cls}"[^>]*title="([^"]*)"`).exec(R.summaryRow(vm.players.find((p) => p.player_id === pid), c))[1];
  assert.strictEqual(title('1', 'rec-never'), 'Never reviewed');
  // Build C (A1.2): the sheet row has no id, so it is matched by tag only: light blue instead of
  // grey, and the hover leads with that before the same "never reviewed" text.
  assert.strictEqual(title('2', 'match-tag'), `${R.TAG_ONLY_TITLE} · Never reviewed (tier from the sheet import)`);
});

test('B4-5: the CLI view\'s header comment matches what it renders (tiers, notes and reviews from registry/tiers.csv, not views/notes.json)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'views', 'major-table.js'), 'utf8');
  const header = src.slice(0, src.indexOf("const fs = require('node:fs');"));
  assert.ok(!/views\/notes\.json/.test(header), 'no stale notes.json claim');
  assert.match(header, /Tier \(registry\/tiers\.csv/);
  assert.match(header, /Notes \(registry\/tiers\.csv\)/);
  assert.match(header, /node views\/major-table\.js out\/<tournament>/);
});

test('B4-1 wording: the README and reviewPlayer\'s comment say the undo restores the earlier review only within one page load', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /within one page\s+load/);
  assert.match(readme, /the earlier\s+review's date and tournament are lost/);
  const dataSrc = fs.readFileSync(path.join(ROOT, 'lib', 'view', 'data.js'), 'utf8');
  assert.match(dataSrc, /lost on that path \(B4-1/);
  assert.ok(!/never destroyed by a click, including by a ✓ at a new\s+\/\/ tournament followed by its undo/.test(dataSrc));
});

test('README (build B pass 3): the Output table lists every file the tool writes in out/<t>/ (D2-12), the CLI never overwrites the app state (D2-5) and must not run beside the app (D2-9), and an incremental pull keeps the window (D2-6)', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const table = readme.slice(readme.indexOf('## Output'), readme.indexOf('In a pull folder:'));
  for (const f of ['`current`', '`pull-<YYYYMMDD-HHMMSS>/`', '`state.json`', '`set-records.json`', '`schedule.json`', '`standings.json`', '`major-table-<game id>.html`', '`claude-prompt.txt`']) {
    assert.ok(table.includes(`| ${f} |`), `${f} listed in the out/<t>/ table`);
  }
  assert.match(table, /The pull never writes it\. `pull\.js <event link>` ticks events in it .*without overwriting the app's fields/);
  assert.match(readme, /Don't run a command-line pull while the app is pulling or\s+fetching W-L/);
  assert.match(readme, /keeps the pool's two-year window where it is/);
  assert.match(readme, /`requests_this_pull`/);
});

test('D2-10: the post\'s retry rule, every case: refused, bracket started, not an admin, a server error, a network error and a timeout are sent ONCE; a rate limit and the time budget are retried, then posted', async () => {
  const ok = { status: 200, body: { data: { updatePhaseSeeding: { id: 5001 } } } };
  const gql = (message, withPath = true) => ({ status: 200, body: { errors: [{ message, ...(withPath ? { path: ['updatePhaseSeeding'] } : {}) }] } });
  const scripted = (responses) => {
    const calls = [];
    const f = async (u, init) => {
      calls.push(JSON.parse(init.body).query);
      const r = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (r === 'throw') throw new Error('socket hang up');
      if (r === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      const text = JSON.stringify(r.body);
      return { status: r.status, ok: r.status < 300, headers: { get: () => null }, text: async () => text };
    };
    f.calls = calls;
    return f;
  };
  const mapping = [{ seedId: 400000, seedNum: 1 }];
  const once = [
    ['refused (a GraphQL error while resolving)', gql('Seeding could not be updated'), 'other'],
    ['bracket started', gql('Phase has already started'), 'locked'],
    ['phase locked', gql('This phase is locked'), 'locked'],
    ['not an admin (GraphQL auth message)', gql('You are not authorized to edit this tournament'), 'not-admin'],
    ['not an admin (HTTP 400 auth body)', { status: 400, body: { success: false, message: 'Invalid authentication token' } }, 'not-admin'],
    ['server error 5xx', { status: 503, body: { message: 'Service Unavailable' } }, 'other'],
    ['network error', 'throw', 'other'],
    ['timeout', 'timeout', 'other'],
  ];
  for (const [name, response, kind] of once) {
    const clock = virtualClock(START);
    const f = scripted([response, ok]);
    const c = sgg.createClient({ token: 'T', fetchImpl: f, now: clock.now, sleep: clock.sleep });
    let err = null;
    try { await sgg.updatePhaseSeeding(c, '5001', mapping); } catch (e) { err = e; }
    assert.ok(err, `${name}: refused`);
    assert.strictEqual(f.calls.length, 1, `${name}: sent once, never retried`);
    assert.strictEqual(sgg.pushFailure(err).kind, kind, `${name}: status line kind`);
  }
  const retried = [
    ['rate limit (HTTP 429)', { status: 429, body: { message: 'Rate limit exceeded - api-token' } }],
    ['time budget', gql('You have gone over the threshold for recent request time. Please wait before sending another request.', false)],
  ];
  for (const [name, response] of retried) {
    const clock = virtualClock(START);
    const f = scripted([response, ok]);
    const c = sgg.createClient({ token: 'T', fetchImpl: f, now: clock.now, sleep: clock.sleep });
    assert.deepStrictEqual(await sgg.updatePhaseSeeding(c, '5001', mapping), { id: 5001 }, `${name}: posted after the retry`);
    assert.strictEqual(f.calls.length, 2, `${name}: retried once, then posted`);
    assert.ok(f.calls.every((q) => /mutation UpdatePhaseSeeding/.test(q)));
  }
});
