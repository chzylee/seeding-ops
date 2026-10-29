#!/usr/bin/env node
'use strict';
// scripts/reconcile.js — acceptance item 4, checked by script rather than by eye.
//   node scripts/reconcile.js <run folder>          offline checks on the three files
//   node scripts/reconcile.js <run folder> --live   also re-counts registrant participants
//                                                   from start.gg with a separate query
// Prints one PASS/FAIL line per check. Exit 0 only if every check passes.

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../lib/output');

function reconcile(runDir) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
  const file = (f) => path.join(runDir, f);
  for (const f of ['players.csv', 'results.csv', 'meta.json']) check(`${f} exists`, fs.existsSync(file(f)));
  if (checks.some((c) => !c.ok)) return { checks };

  const players = parseCsv(fs.readFileSync(file('players.csv'), 'utf8'));
  const results = parseCsv(fs.readFileSync(file('results.csv'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(file('meta.json'), 'utf8'));

  check('players.csv rows = meta.registrant_count', players.length === meta.registrant_count,
    `${players.length} vs ${meta.registrant_count}`);
  const a = meta.registrant_anomalies || {};
  // A pool (increment 3) sums participants across its seeded events; a player in two of them is
  // one row, counted in cross_event_repeats.
  const expectedRows = a.api_participants - (a.duplicate_player || 0) - (a.no_player || 0) - (a.cross_event_repeats || 0);
  check('players.csv rows = API participants - duplicates - no-player - cross-event repeats', players.length === expectedRows,
    `${players.length} vs ${a.api_participants} - ${a.duplicate_player} - ${a.no_player} - ${a.cross_event_repeats || 0}`);

  const ids = new Set(players.map((p) => p.player_id));
  check('player_id unique in players.csv', ids.size === players.length, `${ids.size} unique of ${players.length}`);

  const perPlayer = new Map();
  for (const r of results) perPlayer.set(r.player_id, (perPlayer.get(r.player_id) || 0) + 1);
  const mismatched = players.filter((p) => Number(p.result_count) !== (perPlayer.get(p.player_id) || 0));
  check('every player: result_count = their rows in results.csv', mismatched.length === 0,
    mismatched.slice(0, 5).map((p) => `${p.player_id}: ${p.result_count} vs ${perPlayer.get(p.player_id) || 0}`).join('; '));
  const orphans = results.filter((r) => !ids.has(r.player_id));
  check('every results.csv row joins to a player', orphans.length === 0, `${orphans.length} orphan rows`);

  const sumCounts = players.reduce((s, p) => s + Number(p.result_count), 0);
  check('sum(result_count) = results.csv rows = meta.result_count',
    sumCounts === results.length && results.length === meta.result_count,
    `${sumCounts} / ${results.length} / ${meta.result_count}`);

  const status = { complete: 0, limited: 0, failed: 0 };
  for (const p of players) status[p.history_status] = (status[p.history_status] || 0) + 1;
  check('history_status counts = meta.history_status', JSON.stringify(status) === JSON.stringify(meta.history_status),
    `${JSON.stringify(status)} vs ${JSON.stringify(meta.history_status)}`);
  check('meta.failed_players matches failed rows', (meta.failed_players || []).length === status.failed);
  check('limited players have no user_slug; complete players have one',
    players.every((p) => (p.history_status === 'limited' ? p.user_slug === '' : p.history_status !== 'complete' || p.user_slug !== '')));

  const region = { with_state: 0, with_country: 0, neither: 0 };
  for (const p of players) {
    if (p.region_state) region.with_state++;
    if (p.region_country) region.with_country++;
    if (!p.region_state && !p.region_country) region.neither++;
  }
  check('region coverage = meta.region_coverage', JSON.stringify(region) === JSON.stringify(meta.region_coverage),
    `${JSON.stringify(region)} vs ${JSON.stringify(meta.region_coverage)}`);
  check('no-account players have blank region',
    players.every((p) => p.user_slug !== '' || (p.region_state === '' && p.region_country === '')));

  const start = meta.window.start.slice(0, 10);
  const end = meta.window.end.slice(0, 10);
  const outside = results.filter((r) => !(r.event_date >= start && r.event_date <= end));
  check('every result date inside the window (by day)', outside.length === 0, `${outside.length} outside ${start}..${end}`);

  const dupes = results.length - new Set(results.map((r) => `${r.player_id}|${r.event_id}`)).size;
  check('no (player, event) appears twice', dupes === 0, `${dupes} repeats`);

  // T2: no is_event_game column; every player names the seeded events they entered.
  check('results.csv has no is_event_game column (T2)', !results.length || !('is_event_game' in results[0]));
  const seeded = new Set((meta.seeded_events || []).map((e) => e.slug));
  const badEvents = players.filter((p) => { const ev = String(p.events || '').split(';').filter(Boolean); return !ev.length || ev.some((e) => !seeded.has(e)); });
  check('every player names 1+ seeded events in `events`', badEvents.length === 0, `${badEvents.length} players`);

  return { checks, players, results, meta };
}

async function liveParticipantCount(eventId) {
  const sgg = require('../lib/startgg');
  const { loadToken } = require('../lib/token');
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) throw new Error('No STARTGG_TOKEN for --live.');
  const client = sgg.createClient({ token });
  // Deliberately not lib/history: a separate, minimal count of participants.
  const Q = `query ReconcileCount($id: ID!, $page: Int!) {
    event(id: $id) { entrants(query: { page: $page, perPage: 150 }) {
      pageInfo { totalPages } nodes { participants { id } } } } }`;
  let count = 0;
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const d = await client.request('ReconcileCount', Q, { id: eventId, page });
    const conn = d.event.entrants;
    totalPages = conn.pageInfo.totalPages;
    for (const n of conn.nodes) count += (n.participants || []).length;
  }
  return { count, requests: client.stats.requests };
}

async function main() {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('--'));
  if (!runDir) { console.error('Usage: node scripts/reconcile.js <run folder> [--live]'); return 2; }
  const res = reconcile(runDir);
  if (args.includes('--live') && res.meta) {
    const live = await liveParticipantCount(res.meta.event.id);
    res.checks.push({ name: 'API participant count (fresh query) = meta.registrant_anomalies.api_participants',
      ok: live.count === res.meta.registrant_anomalies.api_participants,
      detail: `${live.count} vs ${res.meta.registrant_anomalies.api_participants} (${live.requests} requests)` });
    res.checks.push({ name: 'players.csv rows = API participant count (fresh query)',
      ok: live.count === res.players.length, detail: `${res.players.length} vs ${live.count}` });
  }
  for (const c of res.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
  const failed = res.checks.filter((c) => !c.ok).length;
  console.log(failed ? `${failed} check(s) FAILED` : `all ${res.checks.length} checks passed`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
}

module.exports = { reconcile };
