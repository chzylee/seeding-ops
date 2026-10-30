'use strict';
// scripts/import-legacy.js: increment 1/2 per-event run folders -> the tournament pool layout, offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const out = require('../lib/output');
const pool = require('../lib/pool');
const imp = require('../scripts/import-legacy');

const BOM = '﻿';
const csv = (cols, rows) => out.toCsv(cols, rows);
const LEGACY_PLAYER_COLS = ['player_id', 'gamer_tag', 'prefix', 'user_slug', 'region_state', 'region_country', 'result_count', 'history_status', 'team_entry'];
const LEGACY_RESULT_COLS = ['player_id', 'gamer_tag', 'event_date', 'game_id', 'game_name', 'is_event_game', 'tournament_name', 'event_name', 'event_slug', 'event_id', 'num_entrants', 'placement', 'is_online'];

function legacyRun(root, t, e, stamp, { eventId, game, players, results, runAt, wl }) {
  const dir = path.join(root, `${t}__${e}__${stamp}`);
  fs.mkdirSync(path.join(dir, 'views'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'players.csv'), csv(LEGACY_PLAYER_COLS, players));
  fs.writeFileSync(path.join(dir, 'results.csv'), csv(LEGACY_RESULT_COLS, results));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
    input_url: `https://www.start.gg/tournament/${t}/event/${e}`,
    event: { id: eventId, slug: `tournament/${t}/event/${e}`, name: e.toUpperCase(), tournament_name: 'Big Event', start_at: '2026-10-23T16:00:00.000Z', num_entrants: players.length },
    game, run_at: runAt, window: { start: '2024-10-15T00:00:00.000Z', end: runAt, days: 730 },
    registrant_count: players.length, result_count: results.length,
    history_status: { complete: players.length, limited: 0, failed: 0 }, team_entries_split: 0, registrant_anomalies: [],
    region_coverage: { with_state: 1, with_country: 1, neither: 0 }, request_count: 10, retries: 0, query_complexity_max: 500,
    skipped: { out_of_window: 2, no_event_container: 0 }, failed_players: [], sessions: 1,
  }, null, 2));
  if (wl) fs.writeFileSync(path.join(dir, 'views', 'set-records.json'), JSON.stringify(wl));
  return dir;
}

const player = (id, tag, extra = {}) => ({ player_id: id, gamer_tag: tag, prefix: '', user_slug: `user/${id}`, region_state: 'NY', region_country: 'United States', result_count: '1', history_status: 'complete', team_entry: 'false', ...extra });
const result = (pid, tag, eventId, gameId, gameName) => ({ player_id: pid, gamer_tag: tag, event_date: '2026-01-10', game_id: gameId, game_name: gameName, is_event_game: 'true', tournament_name: 'Old Major', event_name: 'Singles', event_slug: `tournament/old/event/e${eventId}`, event_id: eventId, num_entrants: '64', placement: '5', is_online: 'false' });

test('import-legacy: two per-event runs of one tournament become one pool with both events ticked, W-L merged, old folders untouched', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-import-'));
  const mb = { id: '22407', name: 'Melty Blood Actress Again Current Code' };
  const uni = { id: '50203', name: 'Under Night In-Birth II Sys:Celes' };
  const d1 = legacyRun(root, 'big-event', 'mbaacc-singles', '20261015-0925', {
    eventId: '100', game: mb, runAt: '2026-10-15T14:25:07.889Z',
    players: [player('1', 'Alpha'), player('2', 'Beta')],
    results: [result('1', 'Alpha', '900', '22407', mb.name), result('2', 'Beta', '901', '22407', mb.name)],
    wl: { '1:900': { w: 3, l: 1, dq: 0 } },
  });
  const d2 = legacyRun(root, 'big-event', 'uni2-singles', '20261015-1052', {
    eventId: '101', game: uni, runAt: '2026-10-15T15:52:46.211Z',
    players: [player('2', 'Beta'), player('3', 'Gamma')],
    results: [result('2', 'Beta', '901', '22407', mb.name), result('3', 'Gamma', '902', '50203', uni.name)],
    wl: { '2:901': { w: 2, l: 2, dq: 0 }, '1:900': { w: 9, l: 9, dq: 9 } },
  });
  // an older run of the same event must lose to the newer one
  legacyRun(root, 'big-event', 'mbaacc-singles', '20261010-0900', { eventId: '100', game: mb, runAt: '2026-10-10T09:00:00.000Z', players: [player('9', 'Old')], results: [] });
  const before = [d1, d2].map((d) => fs.readdirSync(d).sort().join(','));

  const res = imp.importAll(root, { conflictsOut: path.join(root, 'none'), log: () => {} });
  assert.equal(res.length, 1);
  const tDir = path.join(root, 'big-event');
  const cur = pool.currentPull(tDir);
  assert.ok(cur, 'current names a finished pull');
  assert.match(cur.name, /^pull-\d{8}-\d{6}$/);

  const players = out.parseCsv(fs.readFileSync(path.join(cur.dir, 'players.csv'), 'utf8'));
  assert.deepEqual(players.map((p) => [p.player_id, p.events]).sort(), [['1', 'mbaacc-singles'], ['2', 'mbaacc-singles;uni2-singles'], ['3', 'uni2-singles']]);
  assert.ok(!players.some((p) => p.player_id === '9'), 'the older run of an event is not used');
  const results = out.parseCsv(fs.readFileSync(path.join(cur.dir, 'results.csv'), 'utf8'));
  assert.equal(results.length, 3, 'result rows are unioned per player+event');
  assert.ok(!('is_event_game' in results[0]), 'is_event_game dropped (T2)');
  assert.ok(fs.readFileSync(path.join(cur.dir, 'players.csv'), 'utf8').startsWith(BOM));

  assert.equal(cur.meta.tournament.slug, 'big-event');
  assert.equal(cur.meta.tournament.name, 'Big Event');
  assert.deepEqual(cur.meta.seeded_events.map((e) => e.slug), ['mbaacc-singles', 'uni2-singles']);
  assert.equal(cur.meta.registrant_count, 3);
  assert.equal(cur.meta.result_count, 3);
  assert.deepEqual(cur.meta.history_status, { complete: 4, limited: 0, failed: 0 });
  assert.deepEqual(cur.meta.skipped, { out_of_window: 4, no_event_container: 0 });

  const state = pool.readState(tDir);
  assert.deepEqual(state.ticked, ['mbaacc-singles', 'uni2-singles']);
  assert.equal(state.marked_done, null);
  assert.deepEqual(pool.tabsOf(state, cur.meta).map((t) => t.game.id), ['22407', '50203']);

  const wl = JSON.parse(fs.readFileSync(path.join(tDir, 'set-records.json'), 'utf8'));
  assert.deepEqual(wl, { '1:900': { w: 3, l: 1, dq: 0 }, '2:901': { w: 2, l: 2, dq: 0 } }, 'first run wins on a duplicate key');

  assert.deepEqual([d1, d2].map((d) => fs.readdirSync(d).sort().join(',')), before, 'old folders untouched');
  // a second import is a no-op
  const again = imp.importAll(root, { conflictsOut: path.join(root, 'none'), log: () => {} });
  assert.equal(again[0].skipped, true);
  assert.equal(pool.currentPull(tDir).name, cur.name);
});

test('import-legacy: the newest conflicts schedule pull is copied in and a dry run writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seeding-import-'));
  const conflicts = path.join(root, 'conflicts-out');
  for (const stamp of ['20261016-1046', '20261017-1327']) {
    fs.mkdirSync(path.join(conflicts, `big-event__${stamp}`), { recursive: true });
    fs.writeFileSync(path.join(conflicts, `big-event__${stamp}`, 'schedule.json'), JSON.stringify({ tournament: { id: '916836', slug: 'tournament/big-event', name: 'Big Event (sched)', timezone: 'America/New_York' }, pulled_at: stamp, events: [], blocks: [], players: [] }));
  }
  legacyRun(root, 'big-event', 'mbaacc-singles', '20261015-0925', { eventId: '100', game: { id: '22407', name: 'MBAACC' }, runAt: '2026-10-15T14:25:07.889Z', players: [player('1', 'Alpha')], results: [] });

  const dry = imp.importAll(root, { conflictsOut: conflicts, dryRun: true, log: () => {} });
  assert.equal(dry[0].dryRun, true);
  assert.ok(!fs.existsSync(path.join(root, 'big-event')), 'dry run writes nothing');

  imp.importAll(root, { conflictsOut: conflicts, log: () => {} });
  const sched = JSON.parse(fs.readFileSync(path.join(root, 'big-event', 'schedule.json'), 'utf8'));
  assert.equal(sched.pulled_at, '20261017-1327', 'the newest schedule pull');
  const meta = pool.currentPull(path.join(root, 'big-event')).meta;
  assert.equal(meta.tournament.id, '916836', 'tournament id and timezone come from the schedule pull');
  assert.equal(meta.tournament.timezone, 'America/New_York');
});
