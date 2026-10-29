'use strict';
// lib/push.js — the optional push of tiers into start.gg's seeding (docs/design-tool.md, Outputs 2
// and "Push mechanics"). Node only.
//
//   1. Target phase: the event's first phase by phaseOrder, named in the dry run.
//   2. Read the phase's seeds (start.gg's current order) and map each seed's player to T1
//      (registry/tiers.csv, this game, through the same row matcher the page uses) and to the pool.
//   3. The sequence: lib/view/model.js seedSequence, the same function the CSV export numbers with:
//      (a) seeds with a T1 tier, tier descending, start.gg's order within a tier, pool or not;
//      (b) seeds without a tier; (c) unmappable seeds (no entrant, or not exactly one player);
//      numbered 1..N. Pool players no longer in start.gg are ignored. (a)/(b) seeds not in the pool
//      are marked, which suggests a Refresh.
//   4. The dry run is a diff, current -> proposed. A move that passes a seed of another tier group
//      (relative to start.gg's current order) is flagged, so a conflict fix made by hand in start.gg
//      shows before a re-push reverts it.
//   5. The post (updatePhaseSeeding) happens only on a click on the dry run, after the server has
//      re-read the seeds and found them unchanged (the fingerprint). Never exercised live in build B.

const crypto = require('node:crypto');
const sgg = require('./startgg');
const M = require('./view/model');
const data = require('./view/data');

// The event's first phase by phaseOrder (a phase with no order sorts last; then by id).
function firstPhase(event) {
  const ps = [...((event && event.phases) || [])];
  if (!ps.length) return null;
  const ord = (p) => (p.phase_order == null ? Infinity : Number(p.phase_order));
  ps.sort((a, b) => ord(a) - ord(b) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  return ps[0];
}

// One seed -> { player } when it has exactly one participant with a player, else null.
function playerOfSeed(seed) {
  const parts = (seed.entrant && seed.entrant.participants) || [];
  if (parts.length !== 1 || !parts[0].player || parts[0].player.id == null) return null;
  const pl = parts[0].player;
  return { player_id: String(pl.id), gamer_tag: pl.gamerTag || '', prefix: pl.prefix || '' };
}

const groupKey = (x) => (x.group === 'tiered' ? `tier:${x.tier}` : x.group);

// Pure: the dry run from the seeds, the pool's players (ids) and this game's T1 rows.
function buildDryRun({ phase, seeds, poolIds, tierRows }) {
  const index = data.indexTierRows(tierRows);
  const ordered = [...seeds].sort((a, b) => Number(a.seedNum) - Number(b.seedNum));
  const entries = ordered.map((sd) => {
    const pl = playerOfSeed(sd);
    const row = pl ? data.matchTierRow(index, pl) : null;
    const t = row && String(row.tier ?? '').trim() !== '' ? Number(row.tier) : null;
    return {
      id: String(sd.id), current: Number(sd.seedNum), mappable: !!pl,
      player_id: pl ? pl.player_id : null,
      tag: pl ? (pl.prefix ? `${pl.prefix} | ${pl.gamer_tag}` : pl.gamer_tag) : ((sd.entrant && sd.entrant.name) || '(no entrant)'),
      tier: Number.isFinite(t) ? t : null,
      in_pool: pl ? poolIds.has(pl.player_id) : false,
    };
  });
  const seq = M.seedSequence(entries);
  // A move crosses a tier boundary when the seed changes places with a seed of another group.
  const pos = new Map(seq.map((x) => [x.id, x.seed]));
  const rows = seq.map((x) => {
    const crosses = seq.some((y) => y.id !== x.id && groupKey(y) !== groupKey(x)
      && Math.sign(y.current - x.current) !== Math.sign(pos.get(y.id) - pos.get(x.id)));
    return {
      seed_id: x.id, player_id: x.player_id, tag: x.tag, tier: x.tier, group: x.group,
      current: x.current, proposed: x.seed, moved: x.current !== x.seed, crosses_tier: crosses,
      not_in_pool: x.mappable && !x.in_pool,
    };
  });
  const count = (f) => rows.filter(f).length;
  const summary = {
    seeds: rows.length,
    tiered: count((r) => r.group === 'tiered'), untiered: count((r) => r.group === 'untiered'), unmappable: count((r) => r.group === 'unmappable'),
    moved: count((r) => r.moved), crosses_tier: count((r) => r.crosses_tier), not_in_pool: count((r) => r.not_in_pool),
  };
  const fingerprint = crypto.createHash('sha1').update(JSON.stringify({ phase: String(phase.id),
    rows: rows.map((r) => [r.seed_id, r.current, r.proposed]) })).digest('hex');
  return { phase: { id: String(phase.id), name: phase.name || null }, rows, summary, fingerprint };
}

// The dry run against start.gg (read-only: the phase's seeds, 1 request per 100 seeds).
// event: a seeded event (slug, name, game, phases); poolIds: Set of the pool's player ids.
async function dryRun({ client, event, poolIds, tiersFile }) {
  const phase = firstPhase(event);
  if (!phase) throw Object.assign(new Error(`${event.name} has no phases on start.gg yet.`), { status: 409 });
  const { seeds, name } = await sgg.fetchPhaseSeeds(client, phase.id);
  const tierRows = data.readTiers(event.game && event.game.id, tiersFile);
  const dry = buildDryRun({ phase: { id: phase.id, name: name || phase.name }, seeds, poolIds, tierRows });
  return { event: { slug: event.slug, name: event.name }, ...dry };
}

// The post: every seed of the phase with its proposed number. The caller has already compared a
// fresh dry run's fingerprint with the one the page showed.
async function post({ client, dry }) {
  const mapping = dry.rows.map((r) => ({ seedId: r.seed_id, seedNum: r.proposed }));
  await sgg.updatePhaseSeeding(client, dry.phase.id, mapping);
  return { seed_count: mapping.length };
}

module.exports = { firstPhase, playerOfSeed, buildDryRun, dryRun, post };
