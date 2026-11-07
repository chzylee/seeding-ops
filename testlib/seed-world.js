'use strict';
// testlib/seed-world.js — a pulled tournament on the fake start.gg, a tiers file and the app, for the
// Seed-column and push tests (test/seed-order.test.js, test/seed-order-page.test.js). Nothing touches
// the network or the real registry/tiers.csv.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out = require('../lib/output');
const data = require('../lib/view/data');
const M = require('../lib/view/model');
const { run } = require('../lib/run');
const { createApp } = require('../app/server');
const { inject } = require('./inject');
const { addTournament } = require('./pool-fixture');
const { buildWorld, createFakeFetch, virtualClock, sink, T_SLUG, E_SLUG, GAME } = require('./fake-api');

const TOKEN = 'TOKEN-SENTINEL-c0ffee';
const START = Date.UTC(2026, 9, 12, 15, 0, 0);
const H = { 'X-Seeding-App': '1' };
const tierRow = (o) => ({ game_id: String(GAME.id), game_name: GAME.name, player_id: '', startgg_tag: '', sheet_tag: '', tier: '', notes: '', decided_on: '', last_reviewed_on: '', last_reviewed_tournament: '', source: 'app', sheet_region: '', sheet_placements: '', sheet_notes: '', ...o });

async function seedWorld(fetchOpts) {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-seedworld-'));
  const world = buildWorld(START / 1000);
  addTournament(outRoot, world, [E_SLUG]);
  const clock = virtualClock(START);
  assert.strictEqual(await run({ tournament: T_SLUG, events: [E_SLUG], token: TOKEN, outRoot, fetchImpl: createFakeFetch(world), now: clock.now, sleep: clock.sleep, stderr: sink(), stdout: sink() }), 0);
  const tiersFile = path.join(outRoot, 'tiers.csv');
  const gid = String(GAME.id);
  fs.writeFileSync(tiersFile, out.toCsv(data.TIER_COLS, [tierRow({ player_id: '101', tier: '9' }), tierRow({ player_id: '115', tier: '9' }), tierRow({ player_id: '103', tier: '4' })]));
  const fake = createFakeFetch(world, fetchOpts);
  const app = createApp({ outRoot, tiersFile, getToken: () => TOKEN, fetchImpl: fake, now: () => Date.UTC(2026, 10, 2), sleep: clock.sleep });
  const req = (url, body) => inject(app.handler, { url: `/api/t/${T_SLUG}/${url}`, method: 'POST', headers: H, body: JSON.stringify(body || {}) });
  const vm = (await inject(app.handler, { url: `/api/t/${T_SLUG}/g/${gid}/data` })).json();
  const entrants = vm.seeding.events.find((e) => e.slug === E_SLUG).entrants;
  const tag = new Map(vm.players.map((p) => [p.player_id, p.gamer_tag]));
  const tierOf = (id) => (vm.notes[id] && Number.isFinite(vm.notes[id].tier) ? vm.notes[id].tier : null);
  // The Seed column as the page draws it on first load (tier order).
  const initial = M.seedOrder(entrants.map((id) => ({ id, tier: tierOf(id), tag: tag.get(id) })), null).order;
  const pushes = () => fake.calls.filter((x) => x.op === 'UpdatePhaseSeeding');
  const pushed = () => { const c = pushes().pop(); return c && c.variables.seedMapping; };
  // The posted mapping as player ids in seed order (the unmappable seeds dropped).
  const playersOf = (dry, mapping) => {
    const pidOf = new Map(dry.rows.map((r) => [r.seed_id, r.player_id]));
    return [...mapping].sort((a, b) => a.seedNum - b.seedNum).map((m) => pidOf.get(String(m.seedId))).filter(Boolean);
  };
  // The fake's phase seeds fewer players than the pool has (a column player start.gg does not seed is
  // skipped: the gap closes), so an order is compared over the players start.gg seeds.
  const seeded = (order, dry) => { const inPhase = new Set(dry.rows.map((r) => r.player_id).filter(Boolean)); return order.filter((id) => inPhase.has(id)); };
  // A drag that matters: the last player start.gg seeds, moved to the very top.
  const dragLastSeeded = (order, dry) => { const s2 = seeded(order, dry); return M.moveSeed(order, s2[s2.length - 1], order[0], 'before'); };
  // What the page sends with Post for a column: the dry run it draws from that column (M.pushPlan over
  // the dry run's start.gg seeds), as [seed id, number] pairs.
  const proposedFor = (dry, order, mode = 'arranged') => M.proposedPairs(M.pushPlan(dry.entries, { order, mode }).rows);
  return { outRoot, world, fake, app, req, gid, vm, entrants, initial, pushes, pushed, playersOf, seeded, dragLastSeeded, proposedFor, tiersFile, tDir: path.join(outRoot, T_SLUG) };
}

module.exports = { seedWorld, tierRow, TOKEN, H, T_SLUG, E_SLUG, GAME };
