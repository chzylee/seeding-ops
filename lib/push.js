'use strict';
// lib/push.js — the optional push of tiers into start.gg's seeding (docs/design-tool.md, Outputs 2
// and "Push mechanics"; Amendment A2.3 for the seed order). Node only.
//
//   1. Target phase: the event's first phase by phaseOrder, named in the dry run.
//   2. Read the phase's seeds (start.gg's current order) and map each seed's player to T1
//      (registry/tiers.csv, this game, through the same row matcher the page uses) and to the pool.
//   3. The sequence (lib/view/model.js pushPlan). With no seed order arranged for the event:
//      seedSequence, the same function the CSV export numbers with: (a) seeds with a T1 tier, tier
//      descending, start.gg's order within a tier, pool or not; (b) seeds without a tier;
//      (c) unmappable seeds (no entrant, or not exactly one player). With an arranged order (A2.3):
//      that order, a seed not in it slotted in by tier, then (c). Numbered 1..N. Pool players no longer
//      in start.gg are ignored. Seeds not in the pool are marked, which suggests a Refresh.
//   4. The dry run is a diff, current -> proposed. A move that passes a seed of another tier group
//      (relative to start.gg's current order) is flagged, so a conflict fix made by hand in start.gg
//      shows before a re-push reverts it.
//   5. The post (updatePhaseSeeding) happens only on a click on the dry run, after the server has
//      re-read the seeds and found start.gg's side unchanged (the fingerprint), with the seed order and
//      the tiers as they are at that moment (A2.3). Never exercised live in build B.

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

// The fingerprint of start.gg's side of a dry run: the phase and its seeds (id, current number,
// player). Noah's own inputs, the seed order and the tiers, are NOT in it: they are read again when
// he posts, so a drag or a tier edit one second before Post is what is posted (A2.3; Noah,
// 2026-11-06: rows stay draggable right up to the push, and nothing before it goes stale). A change
// on start.gg since the dry run (seeds moved there) still stops the post.
const fingerprintOf = (phaseId, entries) => crypto.createHash('sha1').update(JSON.stringify({ phase: String(phaseId),
  seeds: entries.map((e) => [e.id, e.current, e.player_id]) })).digest('hex');

// Pure: the dry run from the seeds, the pool's players (ids), this game's T1 rows and the event's
// arranged seed order (lib/seeding.js; null when nothing is arranged). `entries` travels to the page,
// which recomputes the diff with M.pushPlan after a drag, so an open dry run never shows a stale order.
function buildDryRun({ phase, seeds, poolIds, tierRows, arrangement = null }) {
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
      sort_tag: pl ? pl.gamer_tag : '',
      tier: Number.isFinite(t) ? t : null,
      in_pool: pl ? poolIds.has(pl.player_id) : false,
    };
  });
  const plan = M.pushPlan(entries, { arrangement });
  return { phase: { id: String(phase.id), name: phase.name || null }, mode: plan.mode, rows: plan.rows, summary: plan.summary, entries, fingerprint: fingerprintOf(phase.id, entries) };
}

// The dry run against start.gg (read-only: the phase's seeds, 1 request per 100 seeds).
// event: a seeded event (slug, name, game, phases); poolIds: Set of the pool's player ids;
// arrangement: the event's arranged order of player ids (A2.3), or null for tier order.
async function dryRun({ client, event, poolIds, tiersFile, arrangement = null }) {
  // A2.1: tiers are per (player, game); an event start.gg gives no videogame has no tiers to push.
  if (!event.game || !data.hasGame(event.game.id)) throw Object.assign(new Error(`${event.name} has no game on start.gg, so no tiers apply to it.`), { status: 409 });
  const phase = firstPhase(event);
  if (!phase) throw Object.assign(new Error(`${event.name} has no phases on start.gg yet.`), { status: 409 });
  const { seeds, name } = await sgg.fetchPhaseSeeds(client, phase.id);
  const tierRows = data.readTiers(event.game && event.game.id, tiersFile);
  const dry = buildDryRun({ phase: { id: phase.id, name: name || phase.name }, seeds, poolIds, tierRows, arrangement });
  return { event: { slug: event.slug, name: event.name }, ...dry };
}

// The post: every seed of the phase with its proposed number. The caller has already compared a
// fresh dry run's fingerprint with the one the page showed. Returns what was posted and the
// fingerprint start.gg's side has once the post lands (every seed at its proposed number), so the
// page can post again without a new dry run (A2.3: a re-push works).
async function post({ client, dry }) {
  const mapping = dry.rows.map((r) => ({ seedId: r.seed_id, seedNum: r.proposed }));
  await sgg.updatePhaseSeeding(client, dry.phase.id, mapping);
  const proposed = new Map(dry.rows.map((r) => [r.seed_id, r.proposed]));
  const after = dry.entries.map((e) => ({ ...e, current: proposed.get(e.id) })).sort((a, b) => a.current - b.current);
  return { seed_count: mapping.length, mapping, fingerprint_after: fingerprintOf(dry.phase.id, after), entries_after: after };
}

module.exports = { firstPhase, playerOfSeed, buildDryRun, dryRun, post, fingerprintOf };
