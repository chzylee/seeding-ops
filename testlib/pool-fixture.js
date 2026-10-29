'use strict';
// testlib/pool-fixture.js — a minimal tournament pool on disk (docs/design-tool.md, T2), for route
// tests that need the app to find a tab without running a pull: out/<t>/state.json (catalog and
// ticked events), out/<t>/pull-<stamp>/ (players.csv with `events`, results.csv, meta.json) and
// out/<t>/current. The files are written with the same writers the pull uses (lib/output.js).

const fs = require('node:fs');
const path = require('node:path');
const out = require('../lib/output');
const pool = require('../lib/pool');

// events: [{ slug, name, game: { id, name }, start_at? }] (all ticked unless `ticked` is given)
// players: rows with player_id, gamer_tag, ... and `events` (a list of event slugs, or a ;-string)
// results: result rows (any extra columns, e.g. an increment 1 is_event_game, are dropped)
function makePool(outRoot, { t, name = 'Tour', events, ticked, players, results = [], runAt = '2026-10-15T00:00:00.000Z', pull = 'pull-20261015-000000', startAt = '2099-01-01T00:00:00.000Z' }) {
  const tDir = path.join(outRoot, t);
  const evs = events.map((e) => ({ id: e.id || String(1000 + events.indexOf(e)), name: e.name || e.slug, num_entrants: null, singles: true,
    start_at: e.start_at || startAt, phases: e.phases || [{ id: String(9000 + events.indexOf(e)), name: 'Bracket', phase_order: 1 }], ...e }));
  pool.writeState(tDir, { version: 1, tournament: { id: '1', slug: t, name, start_at: startAt, timezone: 'UTC' }, events: evs,
    ticked: ticked || evs.map((e) => e.slug), linked: [], marked_done: null, archived: null, pushes: [] });
  const dir = path.join(tDir, pull);
  fs.mkdirSync(path.join(dir, out.WORK_DIR), { recursive: true });
  const ps = players.map((p) => ({ ...p, events: Array.isArray(p.events) ? p.events.join(';') : (p.events ?? evs.map((e) => e.slug).join(';')) }));
  fs.writeFileSync(path.join(dir, 'players.csv'), out.toCsv(out.PLAYER_COLUMNS, ps));
  fs.writeFileSync(path.join(dir, 'results.csv'), out.toCsv(out.RESULT_COLUMNS, results));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    tournament: { id: '1', slug: t, name, start_at: startAt, timezone: 'UTC' }, seeded_events: evs, mode: 'full', run_at: runAt,
    window: { start: '2024-10-15T00:00:00.000Z', end: runAt, days: 730 },
    registrant_count: ps.length, history_status: { complete: ps.length, limited: 0, failed: 0 },
  }, null, 2));
  out.writeCurrent(tDir, pull);
  return { tDir, dir };
}

// state.json for the fake start.gg's tournament (testlib/fake-api.js world.tournament), with the
// given events ticked: what "add a tournament" and the picker leave on disk before a pull.
function addTournament(outRoot, world, ticked = []) {
  const state = pool.newState(pool.catalogOf(world.tournament), { linkedFile: path.join(outRoot, 'no-legacy-linked.json') });
  state.ticked = ticked;
  const tDir = path.join(outRoot, state.tournament.slug);
  pool.writeState(tDir, state);
  return tDir;
}

module.exports = { makePool, addTournament };
