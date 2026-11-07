'use strict';
// Amendment A2.3 (docs/design-tool.md): the seed order. The table carries a seed per player; with
// nothing arranged the seeds are the tier order (top tier = seed 1, the table's own within-tier
// tie-break); a dragged order is saved per event and is the source of truth for the push; newcomers
// slot in by tier and removed players close the gap; "reset to tier order" forgets it.
// Noah, 2026-11-06 (relayed): rows stay draggable right up to the push; the push posts the order as it
// is when Post is clicked (a drag one second earlier included), never a debounced or stale copy; an
// open dry run never goes stale on Noah's own drags; a re-push after a push works.
// Build D pass 2 (Noah, 2026-11-07: "push should prepare the seed column and then send what was
// finalized"; auditor findings 5, 6, 7): the push posts the Seed column in tier order too; writes carry
// a rev, a page id and a write number. The page's own guarantees are checked by running app.js:
// test/seed-order-page.test.js.
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
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');
const { makePool } = require('../testlib/pool-fixture');
const { T_SLUG, E_SLUG, GAME } = require('../testlib/fake-api');
const { seedWorld, tierRow: worldRow } = require('../testlib/seed-world');

const ROOT = path.join(__dirname, '..');
const TOKEN = 'TOKEN-SENTINEL-c0ffee';
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
    // (Pass 1 claimed here that this was also the tier push's sequence; it was not: the push kept
    // start.gg's order within a tier. Auditor finding 7. Since pass 2 the push posts this column, which
    // the routes test below and test/seed-order-page.test.js check.) Over the starting players and their
    // tiers in pushPlan, with no start.gg order to lean on, it is the same sequence:
    const entries = M.orderPlayers(players, notes).reverse().map((p, i) => ({ id: `s${p.player_id}`, current: i + 1, mappable: true, player_id: p.player_id, tag: p.gamer_tag, sort_tag: p.gamer_tag, tier: notes[p.player_id] ? notes[p.player_id].tier : null, in_pool: true }));
    assert.deepStrictEqual(M.pushPlan(entries, { order: so.order, mode: so.mode }).rows.map((r) => r.player_id), so.order);
    // With no column given, pushPlan applies the column's rule to the seeds themselves (an exact tie of
    // tier and tag keeps start.gg's order: the only place that order still shows).
    assert.deepStrictEqual(M.pushPlan(entries).rows.map((r) => r.player_id), M.tierOrder(entries.map((e) => ({ id: e.player_id, tier: e.tier, tag: e.sort_tag }))));
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

test('the push plan: the Seed column is the proposed order in both modes; a seed not in it slots in by tier; a gone player closes the gap; unmappable last; every seed exactly once', () => {
  const s = (id, cur, pid, tier, tag) => ({ id, current: cur, mappable: pid != null, player_id: pid == null ? null : String(pid), tag: tag || `T${pid}`, sort_tag: tag || `T${pid}`, tier, in_pool: true });
  // start.gg has Zed above Abe (both 9). Noah's ruling (2026-11-07): tier order is the column's (by
  // tag), never start.gg's order within a tier.
  const entries = [s('z', 1, 21, 9, 'Zed'), s('a', 2, 22, 9, 'Abe'), s('c', 3, 13, 5), s('d', 4, null, null, '(no entrant)'), s('e', 5, 14, null), s('f', 6, 15, 7, 'Late')];
  const tiers = M.pushPlan(entries);
  assert.strictEqual(tiers.mode, 'tiers');
  assert.deepStrictEqual(tiers.rows.map((r) => r.seed_id), ['a', 'z', 'f', 'c', 'e', 'd'], 'no column given: the seeds in the column\'s tier order (Abe before Zed)');
  // The column in tier mode, as the page sends it, is posted as given.
  assert.deepStrictEqual(M.pushPlan(entries, { order: ['22', '21', '15', '13', '14'], mode: 'tiers' }).rows.map((r) => r.player_id), ['22', '21', '15', '13', '14', null]);
  // Noah's order: 13 first, 22 above 21; 99 has left start.gg; 15 (tier 7) is not in it.
  const plan = M.pushPlan(entries, { order: ['13', '99', '22', '21', '14'], mode: 'arranged' });
  assert.strictEqual(plan.mode, 'arranged');
  assert.deepStrictEqual(plan.rows.map((r) => [r.player_id, r.proposed]), [['13', 1], ['22', 2], ['21', 3], ['15', 4], ['14', 5], [null, 6]]);
  assert.deepStrictEqual(plan.rows.map((r) => r.seed_id).sort(), ['a', 'c', 'd', 'e', 'f', 'z']);
  // A player on two seeds (start.gg should never send it) still leaves no seed unnumbered.
  const twice = M.pushPlan([s('a', 1, 11, 9), s('b', 2, 11, 9), s('c', 3, 12, 1)], { order: ['12', '11'], mode: 'arranged' });
  assert.deepStrictEqual(twice.rows.map((r) => [r.seed_id, r.proposed]), [['c', 1], ['a', 2], ['b', 3]]);
  assert.deepStrictEqual(M.proposedPairs(twice.rows), [['c', 1], ['a', 2], ['b', 3]]);
});

// ---- The store and the routes ----------------------------------------------------------------------

test('the seed order is saved per event, with a rev, and comes back on a reload; reset returns to tier order; bad orders are refused', async () => {
  const outRoot = tmp();
  makePool(outRoot, { t: 'tour', events: [{ slug: 'main', game: G }, { slug: 'side', game: G }],
    players: [player(1, 'A', ['main']), player(2, 'B', ['main', 'side']), player(3, 'C', ['main']), player(4, 'D', ['side'])] });
  const tiersFile = path.join(outRoot, 'tiers.csv');
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [tierRow({ player_id: '1', tier: '9' }), tierRow({ player_id: '3', tier: '5' })]));
  const app = createApp({ outRoot, tiersFile, getToken: () => TOKEN, fetchImpl: async () => { throw new Error('no start.gg request expected'); }, now: () => Date.UTC(2026, 10, 6, 12) });
  const seeds = (body) => inject(app.handler, { url: `/api/t/tour/g/${G.id}/seeds`, method: 'POST', headers: H, body: JSON.stringify(body) });
  const vm = async () => (await inject(app.handler, { url: `/api/t/tour/g/${G.id}/data` })).json();
  let v = await vm();
  assert.deepStrictEqual(v.seeding.events.map((e) => [e.slug, e.entrants, e.saved, e.rev]), [['main', ['1', '2', '3'], null, 0], ['side', ['2', '4'], null, 0]]);
  let r = await seeds({ event: 'main', mode: 'arranged', order: ['3', '1', '2'], base: 0, client: 'pA', seq: 1 });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(r.json(), { event: 'main', mode: 'arranged', saved: { order: ['3', '1', '2'], at: '2026-11-06T12:00:00.000Z', rev: 1 }, rev: 1, changed: true });
  v = await vm();
  assert.deepStrictEqual([v.seeding.events[0].saved.order, v.seeding.events[0].rev], [['3', '1', '2'], 1], 'a reload shows the arranged order and its rev');
  assert.strictEqual(v.seeding.events[1].saved, null, 'per event: the side event is untouched');
  for (const [body, re] of [[{ event: 'main', mode: 'arranged', order: ['4'] }, /not an entrant/], [{ event: 'main', mode: 'arranged', order: ['1', '1'] }, /twice/],
    [{ event: 'main', mode: 'sorted' }, /"mode"/], [{ event: 'main', mode: 'arranged', order: 'x' }, /list/], [{ event: 'nope', mode: 'tiers' }, /not seeded on this tab/]]) {
    r = await seeds(body);
    assert.ok(r.status === 400 || r.status === 404, `${JSON.stringify(body)} -> ${r.status}`);
    assert.match(r.json().error, re);
  }
  assert.strictEqual((await inject(app.handler, { url: `/api/t/tour/g/${G.id}/seeds`, method: 'POST', body: '{}' })).status, 403, 'X-Seeding-App required');
  r = await seeds({ event: 'main', mode: 'tiers', order: ['1', '3', '2'], base: 1, client: 'pA', seq: 2 });
  assert.deepStrictEqual(r.json(), { event: 'main', mode: 'tiers', saved: null, rev: 2, changed: true }, 'reset: the column in tier mode is not stored as an arrangement');
  assert.deepStrictEqual(seeding.entryFor(pool.readState(path.join(outRoot, 'tour')), 'main').order, null);
});

test('finding 5: a stale window (or a second one) cannot erase an arrangement made elsewhere: its write on an old rev is refused with the current one', async () => {
  const outRoot = tmp();
  makePool(outRoot, { t: 'tour', events: [{ slug: 'main', game: G }], players: [player(1, 'A'), player(2, 'B'), player(3, 'C')] });
  const src = data.tabSource(outRoot, 'tour', G.id);
  // Both windows loaded at rev 0. Window B arranges.
  assert.strictEqual(seeding.setOrder(src, 'main', { mode: 'arranged', order: ['3', '2', '1'], base: 0, client: 'pB', seq: 1 }).rev, 1);
  // Window A, still showing tier order, resets (or posts tier order): refused, B's order kept.
  assert.throws(() => seeding.setOrder(src, 'main', { mode: 'tiers', base: 0, client: 'pA', seq: 1 }), (e) => e.status === 409 && e.failure === 'seed-conflict'
    && e.current.mode === 'arranged' && e.current.saved.order.join() === '3,2,1' && e.current.rev === 1);
  assert.throws(() => seeding.setOrder(src, 'main', { mode: 'arranged', order: ['1', '2', '3'], base: 0, client: 'pA', seq: 2 }), (e) => e.failure === 'seed-conflict');
  assert.deepStrictEqual(seeding.savedFor(pool.readState(src.tDir), 'main').order, ['3', '2', '1']);
  // Having adopted rev 1, window A can change it.
  assert.strictEqual(seeding.setOrder(src, 'main', { mode: 'arranged', order: ['1', '2', '3'], base: 1, client: 'pA', seq: 3 }).rev, 2);
});

test('finding 6: the page\'s last write wins even if its writes arrive out of order (an older write number from the same page is ignored)', () => {
  const outRoot = tmp();
  makePool(outRoot, { t: 'tour', events: [{ slug: 'main', game: G }], players: [player(1, 'A'), player(2, 'B'), player(3, 'C')] });
  const src = data.tabSource(outRoot, 'tour', G.id);
  // The page sent write 5 (the post's save, order O1) and then write 6 (a drag, O2); 6 lands first.
  assert.strictEqual(seeding.setOrder(src, 'main', { mode: 'arranged', order: ['2', '1', '3'], base: 0, client: 'pA', seq: 6 }).changed, true);
  const late = seeding.setOrder(src, 'main', { mode: 'arranged', order: ['3', '1', '2'], base: 0, client: 'pA', seq: 5 });
  assert.deepStrictEqual([late.ignored, late.changed], [true, false]);
  assert.deepStrictEqual(seeding.savedFor(pool.readState(src.tDir), 'main').order, ['2', '1', '3'], 'a reload shows the newer order');
});

// ---- The push posts the Seed column, as it is on screen at the click --------------------------------

test('PIN (Noah, 2026-11-06/07): drag, then push at once: the pushed seed order is the column, even with the dry run taken before the drag', async () => {
  const w = await seedWorld();
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  assert.strictEqual(dry.mode, 'tiers');
  const dragged = w.dragLastSeeded(w.initial, dry);
  assert.notDeepStrictEqual(w.seeded(dragged, dry), w.seeded(w.initial, dry), 'a drag that changes the seeding');
  // The drag's save (one POST per drop, no debounce), then Post at once with the dry run redrawn.
  assert.strictEqual((await w.req(`g/${w.gid}/seeds`, { event: E_SLUG, mode: 'arranged', order: dragged, base: 0, client: 'pA', seq: 1 })).status, 200);
  const r = await w.req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'arranged', order: dragged, base: 1, client: 'pA', seq: 2 }, proposed: w.proposedFor(dry, dragged) });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(dragged, dry), 'start.gg received the dragged column, seed 1 first');
  assert.deepStrictEqual(r.json().order, w.seeded(dragged, dry), 'and the push record keeps it');
  assert.strictEqual(r.json().seed_order, 'arranged');
});

test('ruling (a), (d): in tier order the push sends the column too, exactly as on screen; nothing is reordered on a first drag', async () => {
  const w = await seedWorld();
  const dry = (await w.req(`push/${E_SLUG}/dry-run`, { seeding: { mode: 'tiers', order: w.initial } })).json();
  assert.deepStrictEqual(dry.rows.filter((x) => x.player_id).map((x) => x.player_id), w.seeded(w.initial, dry), 'the dry run is the column');
  const r = await w.req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'tiers', order: w.initial, base: 0, client: 'pA', seq: 1 }, proposed: w.proposedFor(dry, w.initial, 'tiers') });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(w.initial, dry));
  assert.strictEqual(r.json().seed_order, 'tiers');
  assert.strictEqual(seeding.savedFor(pool.readState(w.tDir), E_SLUG), null, 'tier order stays tier order (not stored as an arrangement)');
  // A first drag moves one player; every other player keeps the place it had in the posted column.
  const one = M.moveSeed(w.initial, w.seeded(w.initial, dry)[3], w.initial[0], 'before');
  const others = (o) => o.filter((id) => id !== w.seeded(w.initial, dry)[3]);
  assert.deepStrictEqual(others(one), others(w.initial));
});

test('ruling (b): the export\'s proposed_seed, the Seed column, the dry run and the post agree, in tier order and arranged', async () => {
  const w = await seedWorld();
  const exportSeeds = async (seedingBody) => {
    const r = await inject(w.app.handler, { url: `/api/t/${T_SLUG}/g/${w.gid}/seeds.csv`, method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ order: [], event: E_SLUG, seeding: seedingBody }) });
    assert.strictEqual(r.status, 200, r.text);
    return out.parseCsv(r.text).filter((x) => x.proposed_seed).sort((a, b) => a.proposed_seed - b.proposed_seed).map((x) => x.player_id);
  };
  let seq = 0;
  let base = 0;
  for (const mode of ['tiers', 'arranged']) {
    const column = mode === 'tiers' ? w.initial : w.dragLastSeeded(M.moveSeed(w.initial, w.initial[1], w.initial[0], 'before'), (await w.req(`push/${E_SLUG}/dry-run`)).json());
    const body = { mode, order: column };
    assert.deepStrictEqual(await exportSeeds(body), column, `${mode}: the export numbers the column`);
    const dry = (await w.req(`push/${E_SLUG}/dry-run`, { seeding: body })).json();
    assert.deepStrictEqual(dry.rows.filter((x) => x.player_id).map((x) => x.player_id), w.seeded(column, dry), `${mode}: the dry run is the column`);
    const r = await w.req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { ...body, base, client: 'pA', seq: ++seq }, proposed: w.proposedFor(dry, column, mode) });
    assert.strictEqual(r.status, 200, r.text);
    base = r.json().seeding.rev;
    assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(column, dry), `${mode}: the post is the column`);
    // Saved state (no page body): the server's own column is the same one.
    assert.deepStrictEqual(await exportSeeds(undefined), column, `${mode}: and the export without a page body (the saved state)`);
  }
});

test('ruling (c): a tier changed elsewhere cannot change what is posted (the page sends its column); a dry run on screen that differs from the plan is refused, nothing posted', async () => {
  const w = await seedWorld();
  const dry = (await w.req(`push/${E_SLUG}/dry-run`, { seeding: { mode: 'tiers', order: w.initial } })).json();
  // Another window raises a low player to tier 10 after this page drew its column.
  const rows = out.parseCsv(fs.readFileSync(w.tiersFile, 'utf8'));
  const low = w.seeded(w.initial, dry).slice(-1)[0];
  rows.push(worldRow({ player_id: low, tier: '10' }));
  fs.writeFileSync(w.tiersFile, out.toCsv(data.TIER_COLS, rows));
  assert.strictEqual(data.readTiers(String(GAME.id), w.tiersFile).find((x) => x.player_id === low).tier, '10', 'the other window\'s change is in this game\'s tiers');
  const serverNow = seeding.columnOrder(data.tabSource(w.outRoot, T_SLUG, w.gid), E_SLUG, { tiersFile: w.tiersFile }).order;
  assert.notDeepStrictEqual(w.seeded(serverNow, dry), w.seeded(w.initial, dry), 'the server\'s own tier order has moved: posting it would differ from the screen');
  let r = await w.req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'tiers', order: w.initial, base: 0, client: 'pA', seq: 1 }, proposed: w.proposedFor(dry, w.initial, 'tiers') });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(w.initial, dry), 'what was on screen, not the other window\'s tier order');
  // A page whose drawn dry run is not the plan for the column it sends (stale on screen): refused.
  const before = w.pushes().length;
  const shownStale = M.proposedPairs(dry.rows).reverse();
  r = await w.req(`push/${E_SLUG}/post`, { fingerprint: r.json().fingerprint, confirm: true, seeding: { mode: 'tiers', order: w.initial, base: 0, client: 'pA', seq: 2 }, proposed: shownStale });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json().failure, 'not-as-shown');
  assert.ok(r.json().dry && Array.isArray(r.json().dry.entries), 'with the server\'s dry run, for the page to redraw from');
  assert.strictEqual(w.pushes().length, before, 'nothing posted');
  assert.strictEqual((await w.req(`push/${E_SLUG}/post`, { fingerprint: 'x', confirm: true, proposed: 'nope' })).status, 400);
});

test('finding 5 at the push: a post from a stale window that would erase an arrangement made elsewhere is refused; nothing is posted', async () => {
  const w = await seedWorld();
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const other = w.dragLastSeeded(w.initial, dry);
  assert.strictEqual((await w.req(`g/${w.gid}/seeds`, { event: E_SLUG, mode: 'arranged', order: other, base: 0, client: 'pB', seq: 1 })).status, 200);
  const r = await w.req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'tiers', order: w.initial, base: 0, client: 'pA', seq: 1 }, proposed: w.proposedFor(dry, w.initial, 'tiers') });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json().failure, 'seed-conflict');
  assert.deepStrictEqual(r.json().current.saved.order, other, 'the page is told the order it would have erased');
  assert.strictEqual(w.pushes().length, 0, 'nothing posted');
  assert.deepStrictEqual(seeding.savedFor(pool.readState(w.tDir), E_SLUG).order, other, 'and it is still saved');
});

test('PIN: after a push the rows are still draggable and a re-push works: drag again, post again with the fingerprint the post returned (no new dry run)', async () => {
  const w = await seedWorld();
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const first = w.dragLastSeeded(w.initial, dry);
  let r = await w.req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'arranged', order: first, base: 0, client: 'pA', seq: 1 }, proposed: w.proposedFor(dry, first) });
  assert.strictEqual(r.status, 200, r.text);
  const after = { ...dry, entries: r.json().entries };
  const second = w.dragLastSeeded(first, dry);
  assert.notDeepStrictEqual(w.seeded(second, dry), w.seeded(first, dry));
  assert.strictEqual((await w.req(`g/${w.gid}/seeds`, { event: E_SLUG, mode: 'arranged', order: second, base: r.json().seeding.rev, client: 'pA', seq: 2 })).status, 200);
  const before = w.fake.calls.length;
  r = await w.req(`push/${E_SLUG}/post`, { fingerprint: r.json().fingerprint, confirm: true, seeding: { mode: 'arranged', order: second, base: r.json().seeding.rev + 1, client: 'pA', seq: 3 }, proposed: w.proposedFor(after, second) });
  assert.strictEqual(r.status, 200, r.text);
  assert.deepStrictEqual(w.fake.calls.slice(before).map((c) => c.op), ['PhaseSeeds', 'UpdatePhaseSeeding'], 'one fresh seeds read and the post');
  assert.deepStrictEqual(w.playersOf(dry, w.pushed()), w.seeded(second, dry));
});

test('a change on start.gg\'s side since the dry run still stops the post (stale); Noah\'s own drags never do', async () => {
  const w = await seedWorld();
  const dry = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  const all = w.world.seeds[5001];
  [all[0].seedNum, all[1].seedNum] = [all[1].seedNum, all[0].seedNum];
  all.sort((a, b) => a.seedNum - b.seedNum);
  const r = await w.req(`push/${E_SLUG}/post`, { fingerprint: dry.fingerprint, confirm: true, seeding: { mode: 'tiers', order: w.initial } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json().failure, 'stale');
  assert.match(r.json().error, /start\.gg's seeding changed/);
});

test('the dry run numbers from the column the page sends (not saved), else the server\'s own column; the page can redraw it with M.pushPlan from the dry run\'s entries', async () => {
  const w = await seedWorld();
  const plain = (await w.req(`push/${E_SLUG}/dry-run`)).json();
  assert.deepStrictEqual(plain.rows.filter((r) => r.player_id).map((r) => r.player_id), w.seeded(w.initial, plain), 'no body: the server computes the column the page would show');
  const shown = w.dragLastSeeded(w.initial, plain);
  const dry = (await w.req(`push/${E_SLUG}/dry-run`, { seeding: { mode: 'arranged', order: shown } })).json();
  assert.strictEqual(dry.mode, 'arranged');
  assert.deepStrictEqual(dry.rows.filter((r) => r.player_id).map((r) => r.player_id), w.seeded(shown, dry));
  assert.strictEqual(seeding.savedFor(pool.readState(w.tDir), E_SLUG), null, 'a dry run saves nothing');
  const again = M.moveSeed(shown, w.seeded(shown, dry)[3], shown[0], 'before');
  const redrawn = M.pushPlan(dry.entries, { order: again, mode: 'arranged' });
  assert.deepStrictEqual(redrawn.rows.filter((r) => r.player_id).map((r) => r.player_id), w.seeded(again, dry));
  assert.strictEqual((await w.req(`push/${E_SLUG}/dry-run`, { seeding: { mode: 'arranged', order: ['nope'] } })).status, 400);
  assert.match(R.pushDiffTable(dry), /your arranged seed order/i);
  assert.match(R.pushDiffTable(M.pushPlan(dry.entries)), /the Seed column in tier order/i);
});

test('the Seed cell: a drag handle in the app, the number only in the compare panel', () => {
  const c = { app: true, notes: {}, seeds: new Map([['7', 3]]), seedMode: 'arranged' };
  assert.match(R.seedCell({ player_id: '7', gamer_tag: 'X' }, c, { app: true }), /<td class="seed arranged" data-v="3"><button class="drag" type="button"[^>]*aria-label="Seed 3: X\. Arrow keys move it\."/);
  assert.doesNotMatch(R.seedCell({ player_id: '7', gamer_tag: 'X' }, c, {}), /button/);
  const html = fs.readFileSync(path.join(ROOT, 'app', 'public', 'tournament.html'), 'utf8');
  for (const id of ['seedMode', 'seedSort', 'seedReset', 'seedEvent', 'seedLive']) assert.match(html, new RegExp(`id="${id}"`));
});
