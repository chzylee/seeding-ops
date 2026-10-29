'use strict';
// lib/schedule.js (T3; moved from conflicts/lib/schedule.js in build B): slug parsing and the pure
// entrants x timetable join. The app and pull tests below are retargeted to the tournament pool
// (docs/design-tool.md T3 and Pages): schedule.json lives at out/<t>/, the Schedule tab's routes are
// /api/t/<t>/schedule[/refresh], and conflicts/out/ is no longer read.
const { test } = require('node:test');
const assert = require('node:assert');
const sch = require('../lib/schedule');

const tournament = {
  id: 1, slug: 'tournament/t', name: 'T', timezone: 'America/New_York',
  events: [
    { id: 10, name: '[bloody fights.] MBAACC Singles', videogame: { name: 'MBAACC' }, phases: [
      { id: 100, name: 'Bracket', phaseOrder: 1, phaseGroups: { pageInfo: { total: 2 }, nodes: [
        { id: 1000, displayIdentifier: 'B1', startAt: 2000, wave: { identifier: 'B', startAt: 2000 } },
        { id: 1001, displayIdentifier: 'E1', startAt: null, wave: { identifier: 'E', startAt: 5000 } },
      ] } },
    ] },
    { id: 20, name: '[bright nights.] UNI2 Singles', videogame: { name: 'UNI2' }, phases: [
      { id: 200, name: 'Bracket', phaseOrder: 1, phaseGroups: { pageInfo: { total: 1 }, nodes: [
        { id: 2000, displayIdentifier: 'A1', startAt: 1000, wave: { identifier: 'A', startAt: 1000 } },
      ] } },
    ] },
  ],
};
const ent = (id, playerId, tag, poolId) => ({
  id, name: tag, participants: [{ player: { id: playerId, gamerTag: tag, prefix: '' }, user: { slug: 'user/' + tag } }],
  seeds: poolId == null ? [] : [{ seedNum: 1, phase: { id: 0 }, phaseGroup: { id: poolId } }],
});

test('schedule: parseTournamentSlug takes tournament URLs, event URLs and bare slugs', () => {
  assert.strictEqual(sch.parseTournamentSlug('https://www.start.gg/tournament/eclipse-1st-cour/details'), 'eclipse-1st-cour');
  assert.strictEqual(sch.parseTournamentSlug('start.gg/tournament/eclipse-1st-cour/event/x'), 'eclipse-1st-cour');
  assert.strictEqual(sch.parseTournamentSlug(' eclipse-1st-cour '), 'eclipse-1st-cour');
  assert.strictEqual(sch.parseTournamentSlug('not a slug'), null);
});

test('schedule: joins a player across events by player id, entries in time order', () => {
  const players = sch.buildSchedule(tournament, new Map([
    ['10', [ent(1, 7, 'Moai', 1000), ent(2, 8, 'zed', 1001)]],
    ['20', [ent(3, 7, 'Moai', 2000)]],
  ]));
  assert.deepStrictEqual(players.map((p) => p.tag), ['Moai', 'zed']);
  const moai = players[0];
  assert.deepStrictEqual(moai.entries.map((e) => [e.pool, e.wave, e.startAt]), [['A1', 'A', 1000], ['B1', 'B', 2000]]);
  // A pool with no start of its own falls back to its wave's start.
  assert.strictEqual(players[1].entries[0].startAt, 5000);
});

test('schedule: a registrant not yet in any pool still appears', () => {
  const players = sch.buildSchedule(tournament, new Map([['10', [ent(1, 7, 'Moai', null)]]]));
  assert.strictEqual(players.length, 1);
  assert.strictEqual(players[0].entries[0].pool, null);
  assert.match(sch.scheduleCsv(players, sch.timeFormatter('UTC')), /\(no pool\)/);
});

test('schedule: buildTimetable refuses a phase whose pools were cut off by paging', () => {
  const t = { events: [{ id: 1, name: 'E', phases: [{ id: 2, name: 'P', phaseGroups: { pageInfo: { total: 3 }, nodes: [] } }] }] };
  assert.throws(() => sch.buildTimetable(t), /3 pools; only 0 fetched/);
});

test('schedule: conflictOf — red for two main pools at once, orange when only a side game clashes', () => {
  const m = (startAt) => ({ startAt, side: false });
  const sd = (startAt) => ({ startAt, side: true });
  assert.strictEqual(sch.conflictOf([m(1), m(2)]), null);
  assert.strictEqual(sch.conflictOf([m(1), m(1)]), 'main');
  assert.strictEqual(sch.conflictOf([m(1), sd(1)]), 'side');
  assert.strictEqual(sch.conflictOf([m(1), sd(1), m(2), m(2)]), 'main');
  assert.strictEqual(sch.conflictOf([m(1), sd(null), sd(null)]), null); // untimed side games never clash
});

test('schedule: mergeSide adds side entries to main players by player id and drops side-only players', () => {
  const main = sch.buildSchedule(tournament, new Map([['10', [ent(1, 7, 'Moai', 1000)]]]));
  const sideT = { events: [{ id: 30, name: 'Tekken 8', videogame: { name: 'T8' }, phases: [] }] };
  const side = sch.buildSchedule(sideT, new Map([['30', [ent(5, 7, 'Moai', null), ent(6, 99, 'onlyside', null)]]]), { side: true });
  const out = sch.mergeSide(main, side);
  assert.deepStrictEqual(out.map((p) => p.tag), ['Moai']);
  assert.deepStrictEqual(out[0].entries.map((e) => [e.eventName, e.side]), [['[bloody fights.] MBAACC Singles', false], ['Tekken 8', true]]);
  assert.strictEqual(out[0].conflict, null);
});

// ---- The app's schedule page (app/server.js) -------------------------------------------------
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../app/server');
const { inject } = require('../testlib/inject');

test('schedule app: the Schedule tab\'s data (out/<t>/schedule.json), refresh runs one schedule pull at a time', async () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-out-'));
  makePool(outRoot, { t: 'eclipse', events: [{ slug: 'mbaacc', game: { id: '22407', name: 'MBAACC' } }], players: [] });
  // conflicts/out/-style folders beside it are never read.
  fs.mkdirSync(path.join(outRoot, 'eclipse__20261016-104700'));
  fs.writeFileSync(path.join(outRoot, 'eclipse__20261016-104700', 'schedule.json'), JSON.stringify({ tournament: { name: 'T' }, players: [{ tag: 'old-layout' }] }));

  let release;
  const calls = [];
  const seedsFlags = [];
  const app = createApp({ outRoot, getToken: () => 'TOKEN',
    pullSchedule: (o) => { calls.push(o.slug); seedsFlags.push(!!o.seedsOnly); return new Promise((r) => { release = r; }); } });

  assert.strictEqual((await inject(app.handler, { url: '/t/eclipse?tab=schedule' })).status, 200);
  assert.strictEqual((await inject(app.handler, { url: '/api/t/eclipse/schedule' })).status, 404, 'no schedule pull yet; the old layout is not read');
  fs.writeFileSync(path.join(outRoot, 'eclipse', 'schedule.json'), JSON.stringify({ tournament: { name: 'T' }, pulled_at: 'x', events: [], blocks: [], players: [{ tag: 'new' }] }));
  assert.deepStrictEqual((await inject(app.handler, { url: '/api/t/eclipse/schedule' })).json().players, [{ tag: 'new' }]);
  assert.strictEqual((await inject(app.handler, { url: '/api/t/nope/schedule' })).status, 404);

  assert.strictEqual((await inject(app.handler, { method: 'POST', url: '/api/t/eclipse/schedule/refresh' })).status, 403);
  const post = () => inject(app.handler, { method: 'POST', url: '/api/t/eclipse/schedule/refresh', headers: { 'X-Seeding-App': '1' } });
  assert.strictEqual((await post()).status, 202);
  assert.strictEqual((await post()).status, 409);
  assert.strictEqual((await inject(app.handler, { url: '/api/t/eclipse/status' })).json().schedule.running, true);
  release();
  await app.jobs.schedules.get('eclipse').promise;
  assert.strictEqual((await inject(app.handler, { url: '/api/t/eclipse/status' })).json().schedule.running, false);
  assert.deepStrictEqual(calls, ['eclipse']);
  // ?only=seeds reaches the pull as seedsOnly.
  assert.strictEqual((await inject(app.handler, { method: 'POST', url: '/api/t/eclipse/schedule/refresh?only=seeds', headers: { 'X-Seeding-App': '1' } })).status, 202);
  assert.strictEqual((await inject(app.handler, { url: '/api/t/eclipse/status' })).json().schedule.kind, 'seeds');
  assert.deepStrictEqual(seedsFlags, [false, true]);
  release();
  await app.jobs.schedules.get('eclipse').promise;
});

// ---- lib/schedule-pull.js (moved from conflicts/lib/pull.js) against a fake start.gg ---------
const { pullSchedule } = require('../lib/schedule-pull');
const { makePool } = require('../testlib/pool-fixture');

function fakeStartgg({ mainSeed }) {
  const sent = [];
  const tour = (slug, events) => ({ id: slug.length, slug: 'tournament/' + slug, name: slug, timezone: 'UTC', events });
  const tournaments = {
    main: tour('main', [{ id: 10, slug: 's', name: '[x.] MBAACC Singles', numEntrants: 1, videogame: { name: 'CC' }, phases: [
      { id: 100, name: 'Bracket', phaseOrder: 1, phaseGroups: { pageInfo: { total: 1 }, nodes: [{ id: 1000, displayIdentifier: 'B1', startAt: 2000, wave: { identifier: 'B', startAt: 2000 } }] } }] }]),
    side: tour('side', [{ id: 30, slug: 's2', name: 'Tekken 8', numEntrants: 1, videogame: { name: 'T8' }, phases: [] }]),
  };
  const entrants = () => ({
    10: [{ id: 1, name: 'Moai', participants: [{ player: { id: 7, gamerTag: 'Moai' }, user: { slug: 'user/m' } }], seeds: [{ seedNum: mainSeed(), groupSeedNum: 1, phaseGroup: { id: 1000 } }] }],
    30: [{ id: 2, name: 'Moai', participants: [{ player: { id: 7, gamerTag: 'Moai' }, user: { slug: 'user/m' } }], seeds: [] }],
  });
  const fetchImpl = async (_u, init) => {
    const { query, variables } = JSON.parse(init.body);
    const op = /query\s+(\w+)/.exec(query)[1];
    sent.push(op + ':' + (variables.slug || variables.eventId));
    const data = op === 'TournamentSchedule' ? { tournament: tournaments[variables.slug] }
      : { event: { entrants: { pageInfo: { total: 1, totalPages: 1 }, nodes: entrants()[variables.eventId] } } };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ data }) };
  };
  return { fetchImpl, sent };
}

test('schedule pull: seedsOnly re-pulls the main tournament only and carries the side games over', async () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-pull-'));
  let seed = 5;
  const fake = fakeStartgg({ mainSeed: () => seed });
  let t = Date.UTC(2026, 9, 16, 12, 0, 0);
  const base = { slug: 'main', sides: ['side'], token: 'T', outRoot, fetchImpl: fake.fetchImpl, now: () => t, sleep: async () => {} };

  const full = await pullSchedule(base);
  assert.deepStrictEqual(full.players[0].entries.map((e) => [e.eventName, e.seedNum, e.poolSeedNum ?? null]), [['[x.] MBAACC Singles', 5, 1], ['Tekken 8', null, null]]);

  fake.sent.length = 0;
  seed = 2; t += 60_000;
  const again = await pullSchedule({ ...base, seedsOnly: true });
  assert.deepStrictEqual(fake.sent, ['TournamentSchedule:main', 'EventEntrantSeeds:10']);
  assert.deepStrictEqual(again.players[0].entries.map((e) => [e.eventName, e.seedNum]), [['[x.] MBAACC Singles', 2], ['Tekken 8', null]]);
  assert.strictEqual(again.file, path.join(outRoot, 'main', 'schedule.json'), 'T3: next to the pool, outside any pull folder');
  const j = JSON.parse(fs.readFileSync(again.file, 'utf8'));
  assert.strictEqual(j.sides_pulled_at, new Date(Date.UTC(2026, 9, 16, 12, 0, 0)).toISOString());
  assert.deepStrictEqual(j.events.map((e) => [e.name, e.side]), [['[x.] MBAACC Singles', false], ['Tekken 8', true]]);
});
