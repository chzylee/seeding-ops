'use strict';
// Amendment A2.3 (docs/design-tool.md): the seed order. The table carries a seed per player; with
// nothing arranged the seeds are the tier order (top tier = seed 1, the table's own within-tier
// tie-break); a dragged order is saved per event and is the source of truth for the push; newcomers
// slot in by tier and removed players close the gap; "reset to tier order" forgets it.
// Noah, 2026-11-06 (relayed): rows stay draggable right up to the push; the push posts the order as it
// is when Post is clicked (a drag one second earlier included), never a debounced or stale copy; an
// open dry run never goes stale on Noah's own drags; a re-push after a push works.
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
const push = require('../lib/push');
const seeding = require('../lib/seeding');
const { run } = require('../lib/run');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { makePool, addTournament } = require('../testlib/pool-fixture');
const { buildWorld, createFakeFetch, virtualClock, sink, T_SLUG, E_SLUG, GAME } = require('../testlib/fake-api');

const ROOT = path.join(__dirname, '..');
const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const H = { 'X-Seeding-App': '1' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-seeds-'));
const G = { id: '22407', name: 'MBAACC' };
const tierRow = (o) => ({ game_id: G.id, game_name: G.name, player_id: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'app', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });
const player = (id, tag, events) => ({ player_id: String(id), gamer_tag: tag, prefix: '', user_slug: '', region_state: '', region_country: '', result_count: '0', history_status: 'complete', team_entry: 'false', ...(events ? { events } : {}) });
const E = (id, tier, tag) => ({ id: String(id), tier, tag: tag || `p${id}` });

// ---- The model (pure; the page runs the same functions) -------------------------------------------

test('tier order: top tier is seed 1, untiered last, and the within-tier tie-break is the table\'s own (orderPlayers), on random data', () => {
  let x = 7;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let k = 0; k < 50; k++) {
    const players = Array.from({ length: 30 }, (_, i) => player(i + 1, ['Ab', 'ab', 'Zed', 'mid', 'Échec', 'ZZ'][Math.floor(rnd() * 6)] + (rnd() < 0.5 ? '' : String(i % 3))));
    const notes = {};
    for (const p of players) if (rnd() < 0.8) notes[p.player_id] = { tier: Math.floor(rnd() * 4) };
    const entrants = players.map((p) => E(p.player_id, notes[p.player_id] ? notes[p.player_id].tier : null, p.gamer_tag));
    assert.deepStrictEqual(M.tierOrder(entrants), M.orderPlayers(players, notes).map((p) => p.player_id));
    const so = M.seedOrder(entrants, null);
    assert.strictEqual(so.mode, 'tiers');
    // Numbered 1..N it is exactly the export's and the tier push's sequence over the table order.
    assert.deepStrictEqual(so.order, M.seedSequence(M.orderPlayers(players, notes).map((p) => ({ id: p.player_id, tier: notes[p.player_id] ? notes[p.player_id].tier : null }))).map((s) => s.id));
  }
  assert.deepStrictEqual(M.tierOrder([E(1, null), E(2, 0), E(3, 9, 'b'), E(4, 9, 'A')]), ['4', '3', '2', '1'], 'tier 0 is a real tier, above untiered');
});

test('reconcile: removed players close the gap; newcomers slot in by tier (after the last player at or above their tier; untiered at the end; several in tier order)', () => {
  const ents = [E(1, 9), E(2, 9), E(3, 7), E(4, 5), E(5, null)];
  // Noah dragged 4 (tier 5) to the top and 3 below 1.
  assert.deepStrictEqual(M.reconcileOrder(['4', '1', '3', '2', '5'], ents), ['4', '1', '3', '2', '5']);
  // 2 withdrew: the gap closes, everyone below moves up one.
  assert.deepStrictEqual(M.reconcileOrder(['4', '1', '3', '2', '5'], ents.filter((e) => e.id !== '2')), ['4', '1', '3', '5']);
  // Newcomers, in tier order: a 10 goes to the top (nobody is at or above 10); the 9s (a9, b9) go after
  // the last entry at or above 9 (2), in tag order; the 8 after them; the untiered one at the end.
  const more = [...ents, E(6, 8, 'new8'), E(7, null, 'newU'), E(8, 9, 'b9'), E(9, 9, 'a9'), E(10, 10, 'top')];
  assert.deepStrictEqual(M.reconcileOrder(['4', '1', '3', '2', '5'], more), ['10', '4', '1', '3', '2', '9', '8', '6', '5', '7']);
  // Unknown and repeated ids in a saved order are ignored.
  assert.deepStrictEqual(M.reconcileOrder(['x', '2', '2', '1'], [E(1, 9), E(2, 9)]), ['2', '1']);
  // An arranged order that leaves entrants out slots them in by tier: nobody arranged is at or above 9
  // or 7, so 1, 2 (9s, by tag) and 3 (7) go above the untiered 5 and the tier-5 4 Noah put first.
  assert.deepStrictEqual(M.seedOrder(ents, { order: ['5', '4'], at: 'T' }), { mode: 'arranged', order: ['1', '2', '3', '5', '4'], at: 'T' });
});

test('a move: before / after a target; moving onto itself or with an unknown id changes nothing', () => {
  const o = ['a', 'b', 'c', 'd'];
  assert.deepStrictEqual(M.moveSeed(o, 'd', 'a', 'before'), ['d', 'a', 'b', 'c']);
  assert.deepStrictEqual(M.moveSeed(o, 'a', 'c', 'after'), ['b', 'c', 'a', 'd']);
  assert.deepStrictEqual(M.moveSeed(o, 'b', 'c', 'after'), ['a', 'c', 'b', 'd']);
  assert.deepStrictEqual(M.moveSeed(o, 'c', 'b', 'before'), ['a', 'c', 'b', 'd']);
  assert.deepStrictEqual(M.moveSeed(o, 'b', 'b', 'after'), o);
  assert.deepStrictEqual(M.moveSeed(o, 'z', 'a', 'before'), o);
  assert.deepStrictEqual(o, ['a', 'b', 'c', 'd'], 'the given order is not changed');
});

test('the push plan: an arrangement is the proposed order; a seed not in it slots in by tier; a gone player closes the gap; unmappable last; every seed exactly once', () => {
  const s = (id, cur, pid, tier, tag) => ({ id, current: cur, mappable: pid != null, player_id: pid == null ? null : String(pid), tag: tag || `T${pid}`, sort_tag: tag || `T${pid}`, tier, in_pool: true });
  const entries = [s('a', 1, 11, 9), s('b', 2, 12, 9), s('c', 3, 13, 5), s('d', 4, null, null, '(no entrant)'), s('e', 5, 14, null), s('f', 6, 15, 7, 'Late')];
  const tiers = M.pushPlan(entries);
  assert.strictEqual(tiers.mode, 'tiers');
  assert.deepStrictEqual(tiers.rows.map((r) => r.seed_id), ['a', 'b', 'f', 'c', 'e', 'd'], 'no arrangement: as before A2.3 (tiers, start.gg order within a tier)');
  // Noah's order: 13 first, 12 above 11; 99 has left start.gg; 15 (tier 7) is not in it.
  const plan = M.pushPlan(entries, { arrangement: ['13', '99', '12', '11', '14'] });
  assert.strictEqual(plan.mode, 'arranged');
  assert.deepStrictEqual(plan.rows.map((r) => [r.player_id, r.proposed]), [['13', 1], ['12', 2], ['11', 3], ['15', 4], ['14', 5], [null, 6]]);
  assert.deepStrictEqual(plan.rows.map((r) => r.seed_id).sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.strictEqual(plan.summary.seeds, 6);
  // A player on two seeds (start.gg should never send it) still leaves no seed unnumbered.
  const twice = M.pushPlan([s('a', 1, 11, 9), s('b', 2, 11, 9), s('c', 3, 12, 1)], { arrangement: ['12', '11'] });
  assert.deepStrictEqual(twice.rows.map((r) => [r.seed_id, r.proposed]), [['c', 1], ['a', 2], ['b', 3]]);
});

// ---- The store and the routes ----------------------------------------------------------------------

test('the seed order is saved per event in state.json and comes back on a reload; reset returns to tier order; bad orders are refused', async () => {
  const outRoot = tmp();
  makePool(outRoot, { t: 'tour', events: [{ slug: 'main', game: G }, { slug: 'side', game: G }],
    players: [player(1, 'A', ['main']), player(2, 'B', ['main', 'side']), player(3, 'C', ['main']), player(4, 'D', ['side'])] });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [tierRow({ player_id: '1', tier: '9' }), tierRow({ player_id: '3', tier: '5' })]));
  const app = createApp({ outRoot, tiersFile, getToken: () => TOKEN, fetchImpl: async () => { throw new Error('no start.gg request expected'); }, now: () => Date.UTC(2026, 10, 6, 12) });
  const seeds = (body) => inject(app.handler, { url: `/api/t/tour/g/${G.id}/seeds`, method: 'POST', headers: H, body: JSON.stringify(body) });
  const vm = async () => (await inject(app.handler, { url: `/api/t/tour/g/${G.id}/data` })).json();
  let v = await vm();
  assert.deepStrictEqual(v.seeding.events.map((e) => [e.slug, e.entrants, e.saved]), [['main', ['1', '2', '3'], null], ['side', ['2', '4'], null]]);
  let r = await seeds({ event: 'main', mode: 'arranged', order: ['3', '1', '2'] });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(r.json(), { event: 'main', mode: 'arranged', saved: { order: ['3', '1', '2'], at: '2026-11-06T12:00:00.000Z' } });
  v = await vm();
  assert.deepStrictEqual(v.seeding.events[0].saved.order, ['3', '1', '2'], 'a reload shows the arranged order');
  assert.strictEqual(v.seeding.events[1].saved, null, 'per event: the side event is untouched');
  assert.deepStrictEqual(pool.readState(path.join(outRoot, 'tour')).seeding, { main: { order: ['3', '1', '2'], at: '2026-11-06T12:00:00.000Z' } });
  for (const [body, re] of [[{ event: 'main', mode: 'arranged', order: ['4'] }, /not an entrant/], [{ event: 'main', mode: 'arranged', order: ['1', '1'] }, /twice/],
    [{ event: 'main', mode: 'sorted' }, /"mode"/], [{ event: 'main', mode: 'arranged', order: 'x' }, /list/], [{ event: 'nope', mode: 'tiers' }, /not seeded on this tab/]]) {
    r = await seeds(body);
    assert.ok(r.status === 400 || r.status === 404, `${JSON.stringify(body)} -> ${r.status}`);
    assert.match(r.json().error, re);
  }
  assert.strictEqual((await inject(app.handler, { url: `/api/t/tour/g/${G.id}/seeds`, method: 'POST', body: '{}' })).status, 403, 'X-Seeding-App required');
  r = await seeds({ event: 'main', mode: 'tiers' });
  assert.deepStrictEqual(r.json(), { event: 'main', mode: 'tiers', saved: null });
  assert.deepStrictEqual(pool.readState(path.join(outRoot, 'tour')).seeding, {});
});

test('the CSV export\'s Seed column follows an arranged order (the push\'s source of truth); in tier order it is as before', () => {
  const outRoot = tmp();
  makePool(outRoot, { t: 'tour', events: [{ slug: 'main', game: G }], players: [player(1, 'A'), player(2, 'B'), player(3, 'C')] });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [tierRow({ player_id: '1', tier: '9' }), tierRow({ player_id: '2', tier: '5' })]));
  const src = data.tabSource(outRoot, 'tour', G.id);
  const seq = (opts) => data.summaryExport(src, { tiersFile, today: '2026-11-06', ...opts }).sequence.map((x) => [x.id, x.seed]);
  assert.deepStrictEqual(seq({ seeds: seeding.forTab(src).events[0] }), [['1', 1], ['2', 2], ['3', 3]]);
  seeding.setOrder(src, 'main', { mode: 'arranged', order: ['3', '2', '1'] });
  assert.deepStrictEqual(seq({ seeds: seeding.forTab(src).events[0] }), [['3', 1], ['2', 2], ['1', 3]]);
  const csv = data.summaryExport(src, { tiersFile, today: '2026-11-06', seeds: seeding.forTab(src).events[0] }).csv;
  assert.deepStrictEqual(out.parseCsv(csv).map((r) => [r.Seed, r.Player]), [['1', 'C'], ['2', 'B'], ['3', 'A']]);
});

// ---- The push reads the order at the click --------------------------------------------------------

async function pushWorld() {
  const outRoot = tmp();
  const world = buildWorld(START / 1000);
  addTournament(outRoot, world, [E_SLUG]);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG], token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  const tiersFile = path.join(outRoot, 'tiers.csv');
  const gid = String(GAME.id);
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [tierRow({ game_id: gid, player_id: '101', tier: '9' }), tierRow({ game_id: gid, player_id: '115', tier: '9' }), tierRow({ game_id: gid, player_id: '103', tier: '4' })]));
  const fake = createFakeFetch(world);
  const app = createApp({ outRoot, tiersFile, getToken: () => TOKEN, fetchImpl: fake, now: () => Date.UTC(2026, 10, 2), sleep: clock.sleep });
  const req = (url, body) => inject(app.handler, { url: `/api/t/${T_SLUG}/${url}`, method: 'POST', headers: H, body: JSON.stringify(body || {}) });
  const vm = (await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${gid}/data` })).json();
  const entrants = vm.seeding.events.find((e) => e.slug === E_SLUG).entrants;
  const tag = new Map(vm.players.map((p) => [p.player_id, p.gamer_tag]));
  const tierOf = (id) => (vm.notes[id] && Number.isFinite(vm.notes[id].tier) ? vm.notes[id].tier : null);
  const initial = M.seedOrder(entrants.map((id) => ({ id, tier: tierOf(id), tag: tag.get(id) })), null).order;
  const pushed = () => { const c = fake.calls.filter((x) => x.op === 'UpdatePhaseSeeding').pop(); return c && c.variables.seedMapping; };
  // The posted mapping as player ids in seed order (the unmappable seeds dropped).
  const playersOf = (dry, mapping) => {
    const pidOf = new Map(dry.rows.map((r) => [r.seed_id, r.player_id]));
    return [...mapping].sort((a, b) => a.seedNum - b.seedNum).map((m) => pidOf.get(String(m.seedId))).filter(Boolean);
  };
  // The fake's phase has fewer players than the pool (pool players no longer in start.gg are ignored:
  // the gap closes), so an order is compared over the players start.gg seeds. `seeded(order, dry)`.
  const seeded = (order, dry) => { const inPhase = new Set(dry.rows.map((r) => r.player_id).filter(Boolean)); return order.filter((id) => inPhase.has(id)); };
  // A drag that matters: the last player start.gg seeds, moved to the very top.
  const dragLastSeeded = (order, dry) => { const s2 = seeded(order, dry); return M.moveSeed(order, s2[s2.length - 1], order[0], 'before'); };
  return { world, fake, app, req, gid, entrants, initial, pushed, playersOf, seeded, dragLastSeeded, tDir: path.join(outRoot, T_SLUG) };
}

test('PIN (Noah, 2026-11-06): drag, then push at once: the pushed seed order is the new order, even with the dry run taken before the drag', async () => {
  const { req, gid, initial, pushed, playersOf, seeded, dragLastSeeded, fake } = await pushWorld();
  const dry = (await req(`push/${E_SLUG}/dry-run`)).json();
  assert.strictEqual(dry.mode, 'tiers');
  // The drag: the last seeded player to the top, the way app.js saves it (one POST per drop, no debounce).
  const dragged = dragLastSeeded(initial, dry);
  assert.notDeepStrictEqual(seeded(dragged, dry), seeded(initial, dry), 'a drag that changes the seeding');
  assert.notDeepStrictEqual(playersOf(dry, dry.rows.map((r) => ({ seedId: r.seed_id, seedNum: r.proposed }))), seeded(dragged, dry), 'and differs from the dry run shown');
  assert.strictEqual((await req(`g/${gid}/seeds`, { event: E_SLUG, mode: 'arranged', order: dragged })).status, 200);
  // Push immediately, with the fingerprint of the dry run taken BEFORE the drag: not stale.
  const r = await req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(playersOf(dry, pushed()), seeded(dragged, dry), 'start.gg received the dragged order, seed 1 first');
  assert.strictEqual(r.json().seed_order, 'arranged');
  assert.deepStrictEqual(fake.calls.slice(-2).map((c) => c.op), ['PhaseSeeds', 'UpdatePhaseSeeding']);
});

test('PIN: a drag whose save has not landed yet is still what is posted: the page sends the order on screen with Post, and it is saved', async () => {
  const { req, initial, pushed, playersOf, seeded, dragLastSeeded, tDir } = await pushWorld();
  const dry = (await req(`push/${E_SLUG}/dry-run`)).json();
  const onScreen = dragLastSeeded(initial, dry);
  const r = await req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'arranged', order: onScreen } });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(playersOf(dry, pushed()), seeded(onScreen, dry));
  assert.notDeepStrictEqual(seeded(onScreen, dry), seeded(initial, dry));
  assert.deepStrictEqual(seeding.savedFor(pool.readState(tDir), E_SLUG).order, onScreen, 'and a reload shows the order that was posted');
});

test('PIN: after a push the rows are still draggable and a re-push works: drag again, post again with the fingerprint the post returned (no new dry run)', async () => {
  const { req, gid, initial, pushed, playersOf, seeded, dragLastSeeded, fake } = await pushWorld();
  const dry = (await req(`push/${E_SLUG}/dry-run`)).json();
  const first = dragLastSeeded(initial, dry);
  let r = await req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'arranged', order: first } });
  assert.strictEqual(r.status, 200, r.text);
  const fp = r.json().fingerprint;
  const second = dragLastSeeded(first, dry);
  assert.notDeepStrictEqual(seeded(second, dry), seeded(first, dry));
  assert.strictEqual((await req(`g/${gid}/seeds`, { event: E_SLUG, mode: 'arranged', order: second })).status, 200);
  const before = fake.calls.length;
  r = await req(`push/${E_SLUG}/post`, { fingerprint: fp, confirm: true });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(fake.calls.slice(before).map((c) => c.op), ['PhaseSeeds', 'UpdatePhaseSeeding'], 'one fresh seeds read and the post; no dry-run round trip from the page');
  assert.deepStrictEqual(playersOf(dry, pushed()), seeded(second, dry));
  // And back to tier order (reset), pushed the same way.
  r = await req(`push/${E_SLUG}/post`, { fingerprint: r.json().fingerprint, confirm: true, seeding: { mode: 'tiers' } });
  assert.strictEqual(r.status, 200, r.text);
  assert.strictEqual(r.json().seed_order, 'tiers');
});

test('a change on start.gg\'s side since the dry run still stops the post (stale); Noah\'s own drags never do', async () => {
  const { world, req, initial } = await pushWorld();
  const dry = (await req(`push/${E_SLUG}/dry-run`)).json();
  // Someone swaps two seeds on start.gg.
  const all = world.seeds[5001];
  [all[0].seedNum, all[1].seedNum] = [all[1].seedNum, all[0].seedNum];
  all.sort((a, b) => a.seedNum - b.seedNum);
  const r = await req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'arranged', order: initial } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json().failure, 'stale');
  assert.match(r.json().error, /start\.gg's seeding changed/);
});

test('the dry run numbers from the order the page sends (not saved), else the saved order; the page can redraw it with M.pushPlan from the dry run\'s entries', async () => {
  const { req, initial, seeded, dragLastSeeded, tDir } = await pushWorld();
  const plain = (await req(`push/${E_SLUG}/dry-run`)).json();
  const shown = dragLastSeeded(initial, plain);
  const dry = (await req(`push/${E_SLUG}/dry-run`, { seeding: { mode: 'arranged', order: shown } })).json();
  assert.strictEqual(dry.mode, 'arranged');
  assert.deepStrictEqual(dry.rows.filter((r) => r.player_id).map((r) => r.player_id), seeded(shown, dry));
  assert.strictEqual(seeding.savedFor(pool.readState(tDir), E_SLUG), null, 'a dry run saves nothing');
  // Redrawn in the page after another drag: the same function, the dry run's entries, the new order.
  const again = M.moveSeed(shown, seeded(shown, dry)[3], shown[0], 'before');
  const redrawn = M.pushPlan(dry.entries, { arrangement: again });
  assert.deepStrictEqual(redrawn.rows.filter((r) => r.player_id).map((r) => r.player_id), seeded(again, dry));
  assert.notDeepStrictEqual(seeded(again, dry), seeded(shown, dry));
  // Bad orders are refused here too.
  assert.strictEqual((await req(`push/${E_SLUG}/dry-run`, { seeding: { mode: 'arranged', order: ['nope'] } })).status, 400);
  // The diff says which order it uses.
  assert.match(R.pushDiffTable(dry), /your arranged seed order/i);
  assert.match(R.pushDiffTable(M.pushPlan(dry.entries)), /tier order/i);
});

// ---- The page (source pins: what a browser test would check, without launching one) ---------------

test('the page: every drop saves at once (no debounce), Post awaits pending saves and sends the order on screen, and dragging is never disabled by the push panel', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', 'public', 'app.js'), 'utf8');
  const fn = (name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n  }\n', i)); };
  const save = fn('saveSeeds');
  assert.doesNotMatch(save, /setTimeout|debounce/i, 'no debounce in the save');
  assert.match(save, /seedWrites = seedWrites\.then\(/, 'saves are serialized, in order');
  const postFn = fn('postSeeding');
  assert.match(postFn, /await seedWrites;/, 'Post waits for every save in flight');
  assert.match(postFn, /\{ fingerprint: dry\.fingerprint, confirm: true, seeding: currentSeeding\(dry\.event\.slug\) \}/, 'and sends the order on screen');
  assert.ok(postFn.indexOf('window.confirm(') < postFn.indexOf('seeding: currentSeeding('), 'the order is read after the confirm, at the click');
  assert.match(fn('runDry'), /seeding: currentSeeding\(e\)/);
  // A move updates the order the push reads (ev.saved) before its save is even sent.
  const move = fn('applySeedMove');
  assert.ok(move.indexOf('ev.saved = {') < move.indexOf('saveSeeds('), 'the page\'s order changes first, then the save is queued');
  // After a post the panel stays with a Post button: a re-push needs no new dry run.
  assert.match(postFn, /dry = \{ \.\.\.dry, entries: r\.body\.entries, fingerprint: r\.body\.fingerprint \};/);
  assert.doesNotMatch(postFn, /btn\.remove\(\)|dry = null/);
  assert.match(fn('applySeedMove'), /redrawPush\(\)/, 'an open dry run is redrawn after every move');
  assert.match(fn('redrawPush'), /M\.pushPlan\(/);
  assert.doesNotMatch(src, /seedsLocked|lockSeeds|disableDrag/);
  // Keyboard reordering on the handle.
  assert.match(fn('onHandleKey'), /ev\.key in MOVE_KEYS/);
  const keys = /const MOVE_KEYS = \{[^}]*\}/.exec(src)[0];
  for (const k of ['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) assert.ok(keys.includes(`'${k}'`), k);
  assert.match(src, /table\.addEventListener\('keydown', onHandleKey\)/);
  // The handle and the indicator exist in the page.
  const html = fs.readFileSync(path.join(ROOT, 'app', 'public', 'tournament.html'), 'utf8');
  for (const id of ['seedMode', 'seedSort', 'seedReset', 'seedEvent', 'seedLive']) assert.match(html, new RegExp(`id="${id}"`));
  const c = { app: true, notes: {}, seeds: new Map([['7', 3]]), seedMode: 'arranged' };
  assert.match(R.seedCell({ player_id: '7', gamer_tag: 'X' }, c, { app: true }), /<td class="seed arranged" data-v="3"><button class="drag" type="button"[^>]*aria-label="Seed 3: X\. Arrow keys move it\."/);
  assert.doesNotMatch(R.seedCell({ player_id: '7', gamer_tag: 'X' }, c, {}), /button/, 'the compare panel shows the number only');
});
