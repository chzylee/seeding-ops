'use strict';
// An uploaded list as its own page (docs/design-tool.md Amendment A1.3 and A1.4;
// dispatch-contract-tool-c.md, Acceptance 6–9), end to end through the app's handler and its one
// queue against the fake start.gg. Offline; every tiers file is a scratch file.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const out = require('../lib/output');
const pool = require('../lib/pool');
const data = require('../lib/view/data');
const R = require('../lib/view/render');
const pacing = require('../lib/pacing');
const { run } = require('../lib/run');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { addTournament } = require('../testlib/pool-fixture');
const { buildWorld, createFakeFetch, virtualClock, sink, T_SLUG, E_SLUG } = require('../testlib/fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const DAY = 86_400_000;
const H = { 'X-Seeding-App': '1' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-upload-'));
const post = (app, url, body) => inject(app.handler, { url, method: 'POST', headers: H, body: JSON.stringify(body || {}) });
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const GAME = { id: '22', name: 'Melty Blood: Actress Again Current Code' }; // the fake world's game id

// The list: P1 under another name and team, P2, P3 (a tiers row by tag), P5, P10 and P11 both listed as
// "Twin" (one tiers row "Twin": two players, one tag), a code start.gg does not know, a repeat of P2,
// and a malformed row.
const CSV = [
  'name,discriminator',
  'TEAM | Gen,https://www.start.gg/user/14364d39',
  'Kid,user/aaaa0002',
  'Quiet,aaaa0003',
  'TeamA,AAAA0005',
  'Twin,aaaa0010',
  'Twin,aaaa0011',
  'Ghost,deadbeef',
  'Kid again,aaaa0002',
  'Broken,not-a-code',
].join('\n') + '\n';
const tierRow = (o) => ({ game_id: GAME.id, game_name: GAME.name, player_id: '', discriminator: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'sheet import', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });

function setup({ now = START, fetchOpts } = {}) {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  const fake = createFakeFetch(world, fetchOpts);
  const clock = virtualClock(now);
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [
    tierRow({ player_id: '101', startgg_tag: 'GeneralMidwest', sheet_tag: 'GeneralMidwest', tier: '9', source: 'app' }),
    tierRow({ sheet_tag: 'Quiet', tier: '5' }),
    tierRow({ sheet_tag: 'Twin', tier: '4' }),
    tierRow({ game_id: '1', game_name: 'Other', player_id: '102', sheet_tag: 'Kid', tier: '2' }), // another game, linked by id
  ]));
  const app = createApp({ outRoot, getToken: () => TOKEN, fetchImpl: fake, now: clock.now, sleep: clock.sleep, tiersFile, maxPerMinute: 20 });
  return { outRoot, world, fake, clock, tiersFile, app };
}
const upload = (app, extra = {}) => post(app, '/api/uploads', { name: 'Mixfest 26 Test', game_id: GAME.id, game_name: GAME.name, date: '2026-11-07', csv: CSV, file_name: 'players.csv', ...extra });

test('POST /api/uploads: checks the list with no start.gg request, creates out/<slug>/ with state.json source "upload" and one synthetic event, then the job: one lookup per row, the pull, W-L', async () => {
  const w = setup();
  const r = await upload(w.app);
  assert.strictEqual(r.status, 202, r.text);
  const body = r.json();
  assert.deepStrictEqual([body.t, body.page, body.rows, body.header, body.started], ['mixfest-26-test', '/t/mixfest-26-test', 7, 'name,discriminator', true]);
  assert.deepStrictEqual(body.duplicates, [{ discriminator: 'aaaa0002', line: 9, kept_line: 3 }]);
  assert.deepStrictEqual(body.malformed.map((m) => m.line), [10]);
  await w.app.jobs.idle();
  const tDir = path.join(w.outRoot, 'mixfest-26-test');
  const st = pool.readState(tDir);
  assert.strictEqual(st.source, 'upload');
  assert.deepStrictEqual(st.events.map((e) => [e.slug, e.game.id, e.singles]), [['upload', GAME.id, true]]);
  assert.deepStrictEqual(st.ticked, ['upload']);
  assert.strictEqual(st.tournament.start_at, new Date(2026, 10, 7).toISOString(), 'done by the given date: the start of that day, local time');
  // The requests: one UserBySlug per unique row (7), then the per-player history, then W-L. Nothing
  // for the tournament or its entrants; nothing for the unknown code after its lookup.
  const ops = w.fake.calls.map((c) => c.op);
  assert.strictEqual(ops.filter((o) => o === 'UserBySlug').length, 7);
  assert.deepStrictEqual(ops.slice(0, 7), Array(7).fill('UserBySlug'), 'the lookups come first');
  assert.ok(!ops.some((o) => ['TournamentEvents', 'EventEntrants', 'ResolveEvent'].includes(o)));
  assert.ok(ops.includes('UserEvents') && ops.includes('SetsBatch'));
  assert.ok(!w.fake.calls.some((c) => JSON.stringify(c.variables).includes('unresolved-')), 'the unknown row costs no request after its lookup');
  assert.ok(w.fake.calls.every((c) => c.auth === `Bearer ${TOKEN}`));
  // The lookups' log, beside state.json, names codes only.
  const log = fs.readFileSync(path.join(tDir, 'upload-requests.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(log.length, 7);
  assert.ok(log.every((x) => x.op === 'UserBySlug' && /^[0-9a-f]{8}$/.test(x.discriminator)));
  assert.ok(!fs.readFileSync(path.join(tDir, 'upload-requests.jsonl'), 'utf8').includes(TOKEN));
  // Through the one queue, under the ceiling it was given.
  assert.ok(pacing.maxInAnyWindow(w.app.queue.sentAt) <= 20);
  assert.strictEqual(w.app.queue.stats.maxInFlight, 1);
});

test('the page: one tab for the chosen game; players with start.gg\'s current tag, the list prefix in Team, the list name on hover; an unknown code kept as a flagged row with no ✓; export and ✓ work', async () => {
  const w = setup();
  await upload(w.app);
  await w.app.jobs.idle();
  const info = (await inject(w.app.handler, { url: '/api/t/mixfest-26-test' })).json();
  assert.strictEqual(info.source, 'upload');
  assert.deepStrictEqual(info.tabs.map((t) => [t.game.id, t.events]), [[GAME.id, ['upload']]]);
  assert.strictEqual(info.status, 'live');
  assert.deepStrictEqual(info.controls, { markDone: true, unmarkDone: false, archive: false, delete: true }); // delete always offered (Noah, 2026-10-30)
  assert.deepStrictEqual([info.upload.rows, info.upload.found, info.upload.not_found, info.upload.errors, info.upload.pending], [7, 6, 1, 0, 0]);
  const vm = (await inject(w.app.handler, { url: `/api/t/mixfest-26-test/g/${GAME.id}/data` })).json();
  const by = Object.fromEntries(vm.players.map((p) => [p.player_id, p]));
  assert.deepStrictEqual(Object.keys(by).sort(), ['101', '102', '103', '105', '110', '111', 'unresolved-deadbeef']);
  assert.deepStrictEqual([by['101'].gamer_tag, by['101'].prefix, by['101'].alias], ['GeneralMidwest', 'TEAM', 'TEAM | Gen']);
  assert.deepStrictEqual([by['102'].prefix, by['102'].alias], ['+P', 'Kid'], 'no team in the list: start.gg\'s prefix');
  assert.deepStrictEqual([by['unresolved-deadbeef'].gamer_tag, by['unresolved-deadbeef'].history_status], ['Ghost', 'unresolved']);
  const ctx = R.contextFromViewModel(vm, { app: true });
  const row = (id) => R.summaryRow(by[id], ctx, { app: true });
  assert.match(row('101'), /<a href="#p101" class="aka" title="In the uploaded list as &quot;TEAM \| Gen&quot;"><b>GeneralMidwest<\/b><\/a>/);
  assert.ok(!row('103').includes('class="aka"'), 'same tag: no alias hover');
  assert.match(row('unresolved-deadbeef'), /class="flag-unresolved"[^>]*>not found on start\.gg \(deadbeef\)/);
  assert.ok(!row('unresolved-deadbeef').includes('seed-btn') && !row('unresolved-deadbeef').includes('data-edit'), 'no ✓, no edit');
  assert.ok(row('103').includes('seed-btn'));
  // Results came through the existing per-player code: P1's big history is there.
  assert.ok(vm.rows.filter((x) => x[vm.cols.indexOf('player_id')] === '101').length > 50);
  // Export and seeds export.
  const csv = await inject(w.app.handler, { url: `/api/t/mixfest-26-test/g/${GAME.id}/export.csv` });
  assert.strictEqual(csv.status, 200);
  assert.ok(csv.text.includes('GeneralMidwest') && csv.text.includes('Ghost'));
  assert.strictEqual((await inject(w.app.handler, { url: `/api/t/mixfest-26-test/g/${GAME.id}/seeds.csv` })).status, 200);
  // ✓ on an uploaded player writes the review with this page's slug; an unresolved row has no route.
  const rv = await post(w.app, `/api/t/mixfest-26-test/g/${GAME.id}/player/105/review`, { reviewed: true });
  assert.strictEqual(rv.status, 200, rv.text);
  const t105 = out.parseCsv(fs.readFileSync(w.tiersFile, 'utf8')).find((x) => x.player_id === '105');
  assert.deepStrictEqual([t105.last_reviewed_tournament, t105.discriminator, t105.source], ['mixfest-26-test', 'aaaa0005', 'app']);
  assert.strictEqual((await post(w.app, `/api/t/mixfest-26-test/g/${GAME.id}/player/unresolved-deadbeef/review`, { reviewed: true })).status, 404);
});

test('registry linking on upload: id matches get the discriminator, a tag-only match gets both ids and is listed for review, one row two players links neither; the summary is recorded in state.json uploads and shown once', async () => {
  const w = setup();
  await upload(w.app);
  await w.app.jobs.idle();
  const rows = out.parseCsv(fs.readFileSync(w.tiersFile, 'utf8'));
  const row = (pred) => rows.find(pred);
  assert.deepStrictEqual([row((x) => x.player_id === '101' && x.game_id === GAME.id).discriminator], ['14364d39'], 'linked by player_id: discriminator written');
  assert.deepStrictEqual([row((x) => x.sheet_tag === 'Quiet').player_id, row((x) => x.sheet_tag === 'Quiet').discriminator], ['103', 'aaaa0003'], 'linked by tag: both ids written');
  assert.deepStrictEqual([row((x) => x.sheet_tag === 'Twin').player_id, row((x) => x.sheet_tag === 'Twin').discriminator], ['', ''], 'two players, one tag: not linked');
  assert.strictEqual(row((x) => x.game_id === '1').discriminator, 'aaaa0002', 'another game\'s row linked by player_id gets the discriminator too');
  assert.deepStrictEqual(rows.map((x) => [x.tier, x.notes, x.source]), [['9', '', 'app'], ['5', '', 'sheet import'], ['4', '', 'sheet import'], ['2', '', 'sheet import']], 'tier, notes and source untouched');
  const st = pool.readState(path.join(w.outRoot, 'mixfest-26-test'));
  assert.strictEqual(st.uploads.length, 1);
  const s = st.uploads[0];
  assert.deepStrictEqual([s.rows, s.found, s.asked, s.shown_at], [7, 6, 7, null]);
  assert.deepStrictEqual(s.not_found.map((x) => [x.line, x.discriminator]), [[8, 'deadbeef']]);
  assert.deepStrictEqual([s.duplicates.length, s.malformed.length], [1, 1]);
  assert.deepStrictEqual(s.tiers.linked_by_tag.map((x) => [x.player_id, x.row_tag, x.tier]), [['103', 'Quiet', '5']]);
  assert.deepStrictEqual(s.tiers.ambiguous.map((x) => [x.row_tag, x.players.map((p) => p.player_id)]), [['Twin', ['110', '111']]]);
  assert.deepStrictEqual([s.tiers.matched_by_id, s.tiers.player_ids_written], [1, 0]);
  // On the page: the tag-linked row now reads by id; the Twin row is still tag-only for both.
  const vm = (await inject(w.app.handler, { url: `/api/t/mixfest-26-test/g/${GAME.id}/data` })).json();
  assert.deepStrictEqual([vm.notes['103'].tier, !!vm.notes['103'].tag_only, vm.notes['110'].tag_only, vm.notes['111'].tag_only], [5, false, true, true]);
  // Shown once: the page marks it seen.
  const seen = await post(w.app, '/api/t/mixfest-26-test/upload/seen');
  assert.strictEqual(seen.status, 200);
  assert.ok(pool.readState(path.join(w.outRoot, 'mixfest-26-test')).uploads[0].shown_at);
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'tournament.js'), 'utf8');
  assert.match(src, /const fresh = !last\.shown_at;[\s\S]*if \(fresh\) post\(tapi\('upload\/seen'\)\);/, 'the page opens the newest summary only while unseen, then marks it seen');
});

test('the home page: an upload badge for the uploaded list, a start.gg badge for a tournament with no source (read as startgg, its state.json not rewritten); both themes carry the badge colors', async () => {
  const w = setup();
  // A start.gg tournament written before build C: state.json has no `source`.
  const world = buildWorld(START / 1000);
  addTournament(w.outRoot, world, [E_SLUG]);
  assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG], token: TOKEN, outRoot: w.outRoot, fetchImpl: createFakeFetch(world), now: w.clock.now, sleep: w.clock.sleep, stderr: sink(), stdout: sink() }), 0);
  const legacy = path.join(w.outRoot, T_SLUG, 'state.json');
  const raw = JSON.parse(fs.readFileSync(legacy, 'utf8'));
  delete raw.source;
  fs.writeFileSync(legacy, JSON.stringify(raw, null, 2) + '\n');
  const before = sha(legacy);
  await upload(w.app);
  await w.app.jobs.idle();
  const html = (await inject(w.app.handler, { url: '/' })).text;
  const li = (t) => new RegExp(`<li class="st-\\w+ src-(\\w+)" data-t="${t}"[^>]*><a href="/t/${t}">[^<]*</a> <span class="src src-(\\w+)"[^>]*>([^<]+)</span>`).exec(html);
  assert.deepStrictEqual(li(T_SLUG).slice(1), ['startgg', 'startgg', 'start.gg']);
  assert.deepStrictEqual(li('mixfest-26-test').slice(1), ['upload', 'upload', 'upload']);
  assert.strictEqual(sha(legacy), before, 'reading never rewrote the old state.json');
  assert.strictEqual(pool.readState(path.join(w.outRoot, T_SLUG)).source, 'startgg');
  // The upload form sits beside "Add a tournament": the games from config/majors.json, then a free id.
  assert.match(html, /<form id="add"[\s\S]*<button type="button" id="uploadOpen">Import from CSV…<\/button>[\s\S]*<dialog id="uploadModal"[\s\S]*<form id="upload"/); // the form lives in a modal (Noah, 2026-10-30)
  // The game picker (Noah, 2026-10-30): a grid of logos from config/games.json, MBAACC selected by
  // default, plus the free "other" id; the chosen id travels in the hidden #upGame input.
  assert.match(html, /<input type="hidden" id="upGame" name="game" value="22407">/);
  assert.match(html, /<input id="upGameSearch" [^>]*role="combobox"/);
  assert.match(html, /<li role="option" data-id="22407" data-name="Melty Blood Actress Again Current Code" data-short="MBAACC" data-img="\/static\/games\/mbaacc-logo\.png" aria-selected="true"><img src="\/static\/games\/mbaacc-logo\.png" alt="">/);
  assert.match(html, /<li role="option" data-id="36865" data-name="Melty Blood: Type Lumina" data-short="MBTL" data-img="\/static\/games\/mbtl-logo\.png" aria-selected="false">/);
  assert.match(html, /<li role="option" class="other" data-id="other"/);
  assert.strictEqual((await inject(w.app.handler, { url: '/static/games/mbaacc-logo.png' })).status, 200, 'a listed logo is served');
  assert.strictEqual((await inject(w.app.handler, { url: '/static/games/nope.png' })).status, 404, 'only listed logos are served');
  assert.match(html, /<input id="upDate" name="date" type="date" title="Optional/); // the date is optional (Noah, 2026-10-30)
  assert.doesNotMatch(html, /<input id="upDate" name="date" type="date" required/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.css'), 'utf8');
  assert.match(css, /\.src\.src-startgg \{ background: var\(--src-startgg-bg\); color: var\(--src-startgg-fg\); \}/);
  assert.match(css, /--src-startgg-bg: #3f80ff;/);
});

test('an uploaded list refuses what needs a start.gg event (push, schedule, side tournaments, ticking, Archive) and is never overwritten by adding a start.gg tournament of the same slug', async () => {
  const w = setup();
  await upload(w.app, { name: 'Combo Breaker 2026' }); // the fake tournament's slug
  await w.app.jobs.idle();
  const T = 'combo-breaker-2026';
  const before = sha(path.join(w.outRoot, T, 'state.json'));
  for (const [url, body] of [[`/api/t/${T}/push/upload/dry-run`, {}], [`/api/t/${T}/schedule/refresh`, {}], [`/api/t/${T}/linked`, { linked: [] }], [`/api/t/${T}/events`, { ticked: ['upload'] }]]) {
    const r = await post(w.app, url, body);
    assert.strictEqual(r.status, 409, `${url}: ${r.text}`);
    assert.match(r.json().error, /uploaded list/);
  }
  const add = await post(w.app, '/api/tournaments', { url: `https://www.start.gg/tournament/${T}` });
  assert.strictEqual(add.status, 409);
  assert.strictEqual(sha(path.join(w.outRoot, T, 'state.json')), before);
  // A second upload with the same name never touches the first.
  assert.strictEqual((await upload(w.app, { name: 'Combo Breaker 2026' })).status, 409);
  // Done once its date has started; then Delete is offered, never Archive.
  const later = createApp({ outRoot: w.outRoot, getToken: () => TOKEN, fetchImpl: w.fake, now: () => Date.parse('2026-11-08T12:00:00Z'), tiersFile: w.tiersFile });
  const info = (await inject(later.handler, { url: `/api/t/${T}` })).json();
  assert.strictEqual(info.status, 'done');
  assert.deepStrictEqual(info.controls, { markDone: false, unmarkDone: false, archive: false, delete: true });
  assert.strictEqual((await post(later, `/api/t/${T}/lifecycle`, { action: 'archive' })).status, 409);
  const html = (await inject(later.handler, { url: '/' })).text;
  assert.ok(html.indexOf(`/t/${T}`) > 0);
});

// E2-5 (build C pass 2): the push guard's own refusal, on both push routes. The synthetic event's name
// contains "uploaded list" and push.dryRun refuses a phase-less event with its own 409, so asserting
// only the status and /uploaded list/ passed with the guard removed; this asserts the guard's words.
test('E2-5: the push routes on an uploaded page are refused by the upload guard itself (its own message), before any start.gg request', async () => {
  const w = setup();
  await upload(w.app);
  await w.app.jobs.idle();
  const T = 'mixfest-26-test';
  const calls = w.fake.calls.length;
  for (const url of [`/api/t/${T}/push/upload/dry-run`, `/api/t/${T}/push/upload/post`]) {
    const r = await post(w.app, url, {});
    assert.strictEqual(r.status, 409, `${url}: ${r.text}`);
    assert.strictEqual(r.json().error, 'This page is an uploaded list: it has no start.gg event, so there is nothing to push to.', url);
  }
  assert.strictEqual(w.fake.calls.length, calls, 'no start.gg request');
});

test('POST /api/uploads refuses, writing nothing, a missing name, game or date, an empty file, or a file with no readable row (with the lines); it needs the app header', async () => {
  const w = setup();
  const cases = [
    [{ name: '' }, /name/], [{ name: '!!!' }, /letter or digit/], [{ game_id: '' }, /game/], [{ game_id: 'abc' }, /game/],
    [{ date: '2026-13-01' }, /YYYY-MM-DD/], [{ date: 'soon' }, /YYYY-MM-DD/], [{ csv: '' }, /empty/],
    [{ csv: 'name,discriminator\nA,nope\nB,\n' }, /No player rows.*line 2.*line 3/],
  ];
  for (const [extra, re] of cases) {
    const r = await upload(w.app, extra);
    assert.strictEqual(r.status, 400, JSON.stringify(extra));
    assert.match(r.json().error, re);
  }
  assert.strictEqual((await inject(w.app.handler, { url: '/api/uploads', method: 'POST', body: '{}' })).status, 403);
  assert.strictEqual((await inject(w.app.handler, { url: '/api/uploads' })).status, 405);
  assert.deepStrictEqual(fs.readdirSync(w.outRoot).filter((f) => f !== 'tiers.csv'), []);
  assert.strictEqual(w.fake.calls.length, 0);
});

test('a stopped upload resumes: rows looked up are saved as they come; a failed lookup is asked again by Refresh (only that row), then linked and pulled', async () => {
  const w = setup({ fetchOpts: { userBySlugFail: 'aaaa0005' } });
  await upload(w.app);
  await w.app.jobs.idle();
  const tDir = path.join(w.outRoot, 'mixfest-26-test');
  let st = pool.readState(tDir);
  assert.deepStrictEqual(st.upload.rows.map((r) => r.resolved.status), ['found', 'found', 'found', 'error', 'found', 'found', 'not-found']);
  assert.deepStrictEqual(st.uploads[0].errors.map((e) => e.discriminator), ['aaaa0005']);
  // Refresh with start.gg answering again: only the failed row is looked up; it is linked and pulled.
  const calls = [];
  const fake2 = createFakeFetch(w.world, { onUserBySlug: (s) => calls.push(s) });
  const app3 = createApp({ outRoot: w.outRoot, getToken: () => TOKEN, fetchImpl: fake2, now: () => START + DAY, sleep: async () => {}, tiersFile: w.tiersFile });
  const r = await post(app3, '/api/t/mixfest-26-test/refresh');
  assert.strictEqual(r.status, 202);
  await app3.jobs.idle();
  assert.deepStrictEqual(calls, ['user/aaaa0005']);
  st = pool.readState(tDir);
  assert.ok(st.upload.rows.every((x) => x.resolved.status !== 'error'));
  assert.strictEqual(st.uploads.length, 2);
  const vm = data.viewModel(data.tabSource(w.outRoot, 'mixfest-26-test', GAME.id), { tiersFile: w.tiersFile });
  assert.ok(vm.players.some((p) => p.player_id === '105'));
});

test('a start.gg pull writes the discriminator into tiers rows already linked to its players by player_id (any game), and links nothing by tag', async () => {
  const w = setup();
  addTournament(w.outRoot, w.world, [E_SLUG]);
  const r = await post(w.app, `/api/t/${T_SLUG}/refresh`);
  assert.strictEqual(r.status, 202);
  await w.app.jobs.idle();
  const rows = out.parseCsv(fs.readFileSync(w.tiersFile, 'utf8'));
  assert.deepStrictEqual(rows.map((x) => [x.player_id, x.discriminator]), [['101', '14364d39'], ['', ''], ['', ''], ['102', 'aaaa0002']]);
  assert.strictEqual(w.app.jobs.status(T_SLUG).phase, 'done');
});

test('home page layout (Noah, mid-pass 2026-10-30; A3 2026-11-12): "Add a tournament" header, the link field and Add on one row, then "Import from CSV" with its description; no block for live ones, and no "marked done automatically" paragraph', async () => {
  const w = setup({ now: Date.parse('2026-11-08T12:00:00Z') });
  const { makePool } = require('../testlib/pool-fixture');
  makePool(w.outRoot, { t: 'a-live', events: [{ slug: 'e', game: { id: '1', name: 'G' }, start_at: '2026-12-01T00:00:00.000Z' }], players: [], startAt: '2026-12-01T00:00:00.000Z' });
  makePool(w.outRoot, { t: 'b-done', events: [{ slug: 'e', game: { id: '1', name: 'G' }, start_at: '2026-10-01T00:00:00.000Z' }], players: [], startAt: '2026-10-01T00:00:00.000Z' });
  makePool(w.outRoot, { t: 'c-done', events: [{ slug: 'e', game: { id: '1', name: 'G' }, start_at: '2026-09-01T00:00:00.000Z' }], players: [], startAt: '2026-09-01T00:00:00.000Z' });
  const html = (await inject(w.app.handler, { url: '/' })).text;
  const at = (s) => { const i = html.indexOf(s); assert.ok(i >= 0, `has ${s}`); return i; };
  const order = [at('<h2 id="addHead">Add a tournament</h2>'), at('<form id="add"'), at('<input id="addUrl"'), at('<button type="submit">Add</button>'), html.indexOf('</form>', at('<button type="submit">Add</button>')),
    at('<button type="button" id="uploadOpen">Import from CSV…</button>'), at('Two columns: name, start.gg discriminator.'), at('<ul class="events">')]; // the modal button and its one line (cut to the format, A3)
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'top to bottom in that order');
  // The link field and Add share the one form (one row); the CSV import's description shows while folded.
  assert.match(html, /<form id="add" class="add-t"><label[^>]*class="sr-only"[^>]*>[^<]*<\/label>\s*<input id="addUrl"[^>]*>\s*<button type="submit">Add<\/button>/);
  assert.match(html, /<button type="button" id="uploadOpen">Import from CSV…<\/button><span class="dim import-desc">Two columns: name, start\.gg discriminator\.<\/span>/); // A3: the format only
  assert.ok(!/Live tournaments first/.test(html), 'no explanatory block for live ones');
  // A3 (Noah, 2026-11-12): the paragraph explaining that tournaments are marked done automatically is gone.
  assert.ok(at('href="/t/a-live"') < at('href="/t/b-done"'), 'live first, then done');
  assert.doesNotMatch(html, /done-note|marked done automatically|once their last seeded event/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.css'), 'utf8');
  assert.match(css, /\.add-section \.add-t input \{ flex: 1 1 auto; min-width: 0; \}/);
});

// The page's summary renderer, taken from app/public/tournament.js as served (it runs in the browser).
function summaryHtmlFromPage() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'tournament.js'), 'utf8');
  const esc = /\n  const esc = [^\n]+\n/.exec(src)[0];
  const fn = /\n  function summaryHtml\(x\) \{[\s\S]*?\n  \}\n/.exec(src)[0];
  return new Function(`${esc}${fn}return summaryHtml;`)();
}

// E2-4 (build C pass 2): whenever a row is skipped as the header, the upload's summary says so with its
// two values; a header-less list says nothing of the kind.
test('E2-4: the upload summary names the row skipped as the header (line and both values) and the page shows it; a list with no header has no such note', async () => {
  const w = setup();
  const r = await upload(w.app, { name: 'With Header', csv: 'Player,Code\nKid,aaaa0002\n' });
  assert.strictEqual(r.status, 202, r.text);
  assert.deepStrictEqual(r.json().header_row, { line: 1, values: ['Player', 'Code'] });
  const r2 = await upload(w.app, { name: 'No Header', csv: 'Kid,aaaa0002\nQuiet,aaaa0003\n' });
  assert.strictEqual(r2.status, 202, r2.text);
  await w.app.jobs.idle();
  const a = pool.readState(path.join(w.outRoot, 'with-header')).uploads[0];
  const b = pool.readState(path.join(w.outRoot, 'no-header')).uploads[0];
  assert.deepStrictEqual(a.header, { line: 1, values: ['Player', 'Code'] });
  assert.strictEqual(b.header, null);
  const html = summaryHtmlFromPage();
  assert.match(html(a), /Line 1 was read as the column header and skipped: <code>Player<\/code>, <code>Code<\/code>/);
  assert.ok(!html(b).includes('column header'));
  // A mistyped first code in a header-less list is a malformed row at line 1, listed in the summary.
  const r3 = await upload(w.app, { name: 'Typo First', csv: 'Kid,aaaa002\nQuiet,aaaa0003\n' });
  assert.strictEqual(r3.status, 202, r3.text);
  assert.deepStrictEqual([r3.json().header_row, r3.json().malformed.map((m) => m.line)], [null, [1]]);
  await w.app.jobs.idle();
  const c = pool.readState(path.join(w.outRoot, 'typo-first')).uploads[0];
  assert.match(html(c), /<h4>Rows not read<\/h4><ul><li>line 1: <code>Kid,aaaa002<\/code>/);
  // A summary recorded before this field existed (the live Mixfest one) still renders.
  assert.ok(!html({ ...b, header: undefined }).includes('column header'));
});

// E2-6 (build C pass 2): a failed lookup is not a code start.gg does not know.
test('E2-6: a row whose lookup failed is flagged "lookup failed (<reason>)", distinct from "not found on start.gg"; both in the page and the export', async () => {
  const w = setup({ fetchOpts: { userBySlugFail: 'aaaa0005' } });
  await upload(w.app);
  await w.app.jobs.idle();
  const st = pool.readState(path.join(w.outRoot, 'mixfest-26-test'));
  const reason = st.upload.rows.find((r) => r.discriminator === 'aaaa0005').resolved.reason;
  assert.ok(reason, 'the failed lookup kept its reason');
  const vm = (await inject(w.app.handler, { url: `/api/t/mixfest-26-test/g/${GAME.id}/data` })).json();
  const by = Object.fromEntries(vm.players.map((p) => [p.player_id, p]));
  assert.strictEqual(by['unresolved-aaaa0005'].lookup_error, reason);
  assert.strictEqual(by['unresolved-deadbeef'].lookup_error, undefined);
  const ctx = R.contextFromViewModel(vm, { app: true });
  const failed = R.summaryRow(by['unresolved-aaaa0005'], ctx, { app: true });
  const unknown = R.summaryRow(by['unresolved-deadbeef'], ctx, { app: true });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  assert.ok(failed.includes(`>lookup failed (${esc(reason)})</div>`), failed);
  assert.match(failed, /title="The start\.gg lookup for aaaa0005 failed[^"]*Refresh asks again\."/);
  assert.ok(!failed.includes('not found on start.gg'));
  assert.match(unknown, />not found on start\.gg \(deadbeef\)<\/div>/);
  assert.ok(!unknown.includes('lookup failed'));
  // The pool's players.csv keeps the reason (and nothing for a found or not-found row).
  const ps = out.parseCsv(fs.readFileSync(path.join(pool.currentPull(path.join(w.outRoot, 'mixfest-26-test')).dir, 'players.csv'), 'utf8'));
  assert.deepStrictEqual(ps.filter((p) => p.lookup_error).map((p) => [p.player_id, p.lookup_error]), [['unresolved-aaaa0005', reason]]);
});

// E2-7 (build C pass 2; orchestrator ruling): a row ceiling of 1,000, refused with the count before any
// start.gg request and before anything is written. The byte caps were the only limit before.
test('E2-7: an upload over 1,000 player rows is refused with the count, writing nothing and asking start.gg nothing; 1,000 is taken', async () => {
  const w = setup();
  const list = (n) => 'name,discriminator\n' + Array.from({ length: n }, (_, i) => `P${i},${(0xa0000000 + i).toString(16)}`).join('\n') + '\n';
  const r = await upload(w.app, { name: 'Too Big', csv: list(1001) });
  assert.strictEqual(r.status, 400, r.text);
  assert.match(r.json().error, /The list has 1001 player rows; an upload takes at most 1000/);
  assert.ok(!fs.existsSync(path.join(w.outRoot, 'too-big')));
  assert.strictEqual(w.fake.calls.length, 0);
  // Repeats are collapsed first: 1,001 lines with one repeat is 1,000 rows, under the ceiling.
  const repeat = list(1000) + 'Again,a0000000\n';
  const ok = await upload(w.app, { name: 'Just Fits', csv: repeat });
  assert.strictEqual(ok.status, 202, ok.text);
  assert.deepStrictEqual([ok.json().rows, ok.json().duplicates.length], [1000, 1]);
  await w.app.jobs.idle();
});
