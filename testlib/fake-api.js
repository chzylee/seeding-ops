'use strict';
// testlib/fake-api.js — an offline stand-in for https://api.start.gg/gql/alpha.
// It answers by GraphQL operation name with responses shaped like the real ones (see
// test/fixtures/*.json, which hold one sample page of each). Kept outside test/ so
// `node --test` does not try to run it as a test file.

const fs = require('node:fs');
const path = require('node:path');

const FIX = path.join(__dirname, '..', 'test', 'fixtures');
const readFixture = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

const DAY = 86_400;
const GAME = { id: 22, name: 'Melty Blood: Actress Again Current Code' };
const OTHER_GAME = { id: 1, name: 'Super Smash Bros. Melee' };
const EVENT_SLUG = 'tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code';
const EVENT2_SLUG = 'tournament/combo-breaker-2026/event/melee-singles';
const T_SLUG = 'combo-breaker-2026';
const E_SLUG = 'melty-blood-actress-again-current-code';
const E2_SLUG = 'melee-singles';

// A deterministic little world. `runAtSec` anchors event dates relative to the run so the
// window cases (in, out, future, boundary) hold no matter when the tests run.
function buildWorld(runAtSec) {
  let evId = 5000;
  const mkEvent = (daysAgo, game = GAME, extra = {}) => ({
    id: ++evId,
    slug: `tournament/t-${evId}/event/e-${evId}`,
    name: `Event ${evId}`,
    startAt: daysAgo == null ? null : runAtSec - daysAgo * DAY,
    numEntrants: 8 + (evId % 50),
    isOnline: evId % 3 === 0,
    videogame: game,
    tournament: { name: `Tournament ${evId}` },
    ...extra,
  });

  const players = [];
  const addPlayer = (p) => { players.push(p); return p; };

  // P1: a big history over two pages, unsorted, with every window edge case.
  const big = [];
  for (let i = 0; i < 125; i++) big.push(mkEvent(i * 9, i % 4 === 0 ? OTHER_GAME : GAME));
  // 125 events at 0..1116 days ago: 82 in window (0..729), 43 out.
  big.push(mkEvent(-30));                 // future: out of window
  big.push(mkEvent(null));                // no date: out of window
  big.push(mkEvent(730));                 // exactly 730 days ago: in (inclusive)
  big.push(mkEvent(731));                 // out
  const p1Events = big.sort((a, b) => (a.id * 7919) % 131 - (b.id * 7919) % 131); // shuffled
  addPlayer({ id: 101, gamerTag: 'GeneralMidwest', prefix: 'CB', user: { id: 9001, slug: 'user/14364d39', location: { state: 'IL', country: 'United States' } }, events: p1Events });

  // P2: tag that needs CSV care, country only.
  addPlayer({ id: 102, gamerTag: '=SUM(1,2) "the" @Kid, -x', prefix: '+P', user: { id: 9002, slug: 'user/aaaa0002', location: { state: null, country: 'Japan' } }, events: [mkEvent(10), mkEvent(800)] });

  // P3: location hidden (null), zero events.
  addPlayer({ id: 103, gamerTag: 'Quiet', prefix: '', user: { id: 9003, slug: 'user/aaaa0003', location: null }, events: [] });

  // P4: no linked user -> recentStandings fallback.
  addPlayer({
    id: 104, gamerTag: 'GuestPlayer', prefix: null, user: null,
    standings: [
      { placement: 3, container: { __typename: 'Event', ...mkEvent(20) } },
      { placement: 9, container: { __typename: 'Event', ...mkEvent(900) } },
      { placement: 1, container: { __typename: 'Phase', id: 777 } },
    ],
  });

  // P5/P6: a two-person team entrant.
  addPlayer({ id: 105, gamerTag: 'TeamA', prefix: '', user: { id: 9005, slug: 'user/aaaa0005', location: { state: 'Ontario', country: 'Canada' } }, events: [mkEvent(5)], team: 'T1' });
  addPlayer({ id: 106, gamerTag: 'TeamB', prefix: '', user: { id: 9006, slug: 'user/aaaa0006', location: { state: 'CA', country: 'United States' } }, events: [mkEvent(5, GAME, { id: 99999, slug: 'tournament/x/event/y' })], team: 'T1' });

  // P7: an event with no standing yet, and one where userEntrant is null.
  addPlayer({ id: 107, gamerTag: 'Pending', prefix: '', user: { id: 9007, slug: 'user/aaaa0007', location: { state: 'TX', country: 'United States' } },
    events: [mkEvent(1, GAME, { _noStanding: true }), mkEvent(2, GAME, { _noEntrant: true })] });

  // P8..P15: ordinary players.
  for (let k = 8; k <= 15; k++) {
    addPlayer({ id: 100 + k, gamerTag: `Player${k}`, prefix: '', user: { id: 9000 + k, slug: `user/aaaa00${k}`, location: { state: 'NY', country: 'United States' } },
      events: [mkEvent(k), mkEvent(k + 400), mkEvent(k + 1000)] });
  }

  // Entrants: team T1 is one entrant with two participants.
  const entrants = [];
  let entId = 70000;
  const teams = new Map();
  for (const p of players) {
    if (p.team) {
      if (!teams.has(p.team)) { const e = { id: ++entId, participants: [] }; teams.set(p.team, e); entrants.push(e); }
      teams.get(p.team).participants.push(p);
    } else entrants.push({ id: ++entId, participants: [p] });
  }

  const event = {
    id: 1000, slug: EVENT_SLUG, name: 'Melty Blood: Actress Again Current Code',
    startAt: runAtSec - 140 * DAY, numEntrants: entrants.length, videogame: GAME,
    tournament: { name: 'Combo Breaker 2026' },
    type: 1, phases: [{ id: 5001, name: 'Bracket', phaseOrder: 1 }, { id: 5002, name: 'Top 8', phaseOrder: 2 }],
  };

  // Increment 3: the tournament pool. A second singles event in another game, shared by P1 (101)
  // and P8 (108), with one player only in it (P16, 116); and a teams event the picker must hide.
  const p16 = addPlayer({ id: 116, gamerTag: 'MeleeOnly', prefix: '', user: { id: 9016, slug: 'user/aaaa0016', location: { state: 'OH', country: 'United States' } },
    events: [mkEvent(3, OTHER_GAME), mkEvent(33, OTHER_GAME)] });
  const byPid = (id) => players.find((p) => p.id === id);
  const entrants2 = [byPid(101), byPid(108), p16].map((p) => ({ id: ++entId, participants: [p] }));
  const event2 = {
    id: 2000, slug: EVENT2_SLUG, name: 'Melee Singles', startAt: runAtSec - 139 * DAY, numEntrants: entrants2.length,
    videogame: OTHER_GAME, tournament: { name: 'Combo Breaker 2026' }, type: 1, phases: [{ id: 6001, name: 'Pools', phaseOrder: 1 }],
  };
  const teamsEvent = {
    id: 3000, slug: 'tournament/combo-breaker-2026/event/mbaacc-2v2', name: 'MBAACC 2v2', startAt: runAtSec - 139 * DAY, numEntrants: 4,
    videogame: GAME, tournament: { name: 'Combo Breaker 2026' }, type: 5, phases: [],
  };
  const tournament = {
    id: 77, slug: 'tournament/combo-breaker-2026', name: 'Combo Breaker 2026', startAt: runAtSec - 140 * DAY, timezone: 'America/Chicago',
    events: [event, event2, teamsEvent],
  };
  // A side tournament (T3's linked side games): one event, P1 in it.
  const sideTournament = { id: 78, slug: 'tournament/cb-side-games', name: 'CB Side Games', startAt: runAtSec - 140 * DAY, timezone: 'America/Chicago',
    events: [{ id: 7000, slug: 'tournament/cb-side-games/event/tekken-8', name: 'Tekken 8', startAt: runAtSec - 140 * DAY, numEntrants: 1,
      videogame: { id: 49783, name: 'TEKKEN 8' }, type: 1, phases: [] }] };
  const entrantsByEvent = { 1000: entrants, 2000: entrants2, 7000: [{ id: ++entId, participants: [byPid(101)] }] };
  // The main bracket's seeds in start.gg's current order: entrants in reverse registration order,
  // plus one placeholder seed with no entrant (unmappable).
  const seeds = { 5001: [...entrants].reverse().map((e, i) => ({ id: 400000 + i, seedNum: i + 1, entrant: e })) };
  seeds[5001].push({ id: 499999, seedNum: seeds[5001].length + 1, entrant: null });
  return { event, event2, teamsEvent, tournament, sideTournament, players, entrants, entrantsByEvent, seeds };
}

function jsonResponse(status, body, headers = {}) {
  const text = JSON.stringify(body);
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => text,
  };
}

function participantNode(p, i) {
  return {
    id: 80000 + i,
    player: {
      id: p.id, gamerTag: p.gamerTag, prefix: p.prefix,
      user: p.user ? { id: p.user.id, slug: p.user.slug, location: p.user.location } : null,
    },
  };
}

function eventNode(ev, userId) {
  const { _noStanding, _noEntrant, ...pub } = ev;
  const userEntrant = _noEntrant ? null : { standing: _noStanding ? null : { placement: (ev.id % 17) + 1 } };
  return { ...pub, userEntrant: userId != null ? userEntrant : null };
}

// createFakeFetch(world, opts) -> fetch-compatible function plus a `calls` array.
// opts.badToken           every call returns the recorded bad-token 400
// opts.rateLimitFirst     the first N UserEvents calls return 429
// opts.serverErrorPlayer  user id whose UserEvents calls always return 503
// opts.timeBudgetPlayer   user id whose UserEvents calls always return start.gg's server-time-
//                         budget error (A4-3, build-record-webapp.md pass 4/5): the literal live
//                         message, as a pre-execution GraphQL error (no `path`) -- the same shape
//                         lib/startgg.js's classifyError (BUDGET_RE) recognizes as 'time-budget'.
// opts.schemaErrorOn      operation name that returns a validation error (no `path`)
// opts.onUserEvents(n)    hook called with the running count of UserEvents calls
function createFakeFetch(world, opts = {}) {
  const calls = [];
  const badTokenFixture = readFixture('error-badtoken-400.json');
  let userEventsCalls = 0;
  let rateLimited = 0;

  async function fakeFetch(url, init) {
    const req = JSON.parse(init.body);
    const op = (/(?:query|mutation)\s+(\w+)/.exec(req.query) || [])[1];
    const v = req.variables || {};
    calls.push({ op, variables: v, auth: init.headers.Authorization });
    if (opts.badToken) return jsonResponse(badTokenFixture.httpStatus, badTokenFixture.body);
    if (opts.schemaErrorOn === op) {
      return jsonResponse(200, { errors: [{ message: `Cannot query field "nope" on type "Query".`, locations: [{ line: 1, column: 2 }] }] });
    }
    const ext = (n) => ({ queryComplexity: n });

    if (op === 'ResolveEvent') {
      const ev = v.slug === world.event.slug ? world.event : null;
      return jsonResponse(200, { data: { event: ev }, extensions: ext(4) });
    }
    if (op === 'TournamentEvents') {
      const t = world.tournament && v.slug === world.tournament.slug.replace(/^tournament\//, '') ? world.tournament : null;
      return jsonResponse(200, { data: { tournament: t }, extensions: ext(30) });
    }
    // T3's schedule queries (lib/schedule.js): the timetable, and entrants with their pools.
    if (op === 'TournamentSchedule') {
      const t = [world.tournament, world.sideTournament].find((x) => x && v.slug === x.slug.replace(/^tournament\//, '')) || null;
      const shaped = t && { id: t.id, slug: t.slug, name: t.name, startAt: t.startAt, timezone: t.timezone,
        events: t.events.map((e) => ({ id: e.id, slug: e.slug, name: e.name, startAt: e.startAt, numEntrants: e.numEntrants, videogame: e.videogame,
          phases: (e.phases || []).map((ph) => ({ id: ph.id, name: ph.name, phaseOrder: ph.phaseOrder, groupCount: 1, numSeeds: null,
            phaseGroups: { pageInfo: { total: 1 }, nodes: [{ id: Number(ph.id) * 10, displayIdentifier: 'A1', startAt: e.startAt, wave: { id: 1, identifier: 'A', startAt: e.startAt } }] } })) })) };
      return jsonResponse(200, { data: { tournament: shaped }, extensions: ext(60) });
    }
    if (op === 'EventEntrantSeeds') {
      const all = (world.entrantsByEvent || {})[String(v.eventId)] || [];
      const ev = [world.event, world.event2, world.sideTournament && world.sideTournament.events[0]].find((e) => e && String(e.id) === String(v.eventId));
      const ph = ev && ev.phases && ev.phases[0];
      const per = v.perPage;
      const nodes = all.slice((v.page - 1) * per, v.page * per).map((e, k) => ({ id: e.id, name: e.participants.map((p) => p.gamerTag).join(' / '),
        participants: e.participants.map((p) => ({ player: { id: p.id, gamerTag: p.gamerTag, prefix: p.prefix }, user: p.user ? { id: p.user.id, slug: p.user.slug } : null })),
        seeds: ph ? [{ seedNum: k + 1, groupSeedNum: k + 1, phase: { id: ph.id }, phaseGroup: { id: Number(ph.id) * 10 } }] : [] }));
      return jsonResponse(200, { data: { event: { entrants: { pageInfo: { total: all.length, totalPages: Math.max(1, Math.ceil(all.length / per)) }, nodes } } }, extensions: ext(per * 6) });
    }
    if (op === 'PhaseSeeds') {
      if (opts.seedsError) return jsonResponse(200, { errors: [{ message: opts.seedsError, path: ['phase'] }] });
      const all = (world.seeds || {})[String(v.phaseId)];
      if (!all) return jsonResponse(200, { data: { phase: null }, extensions: ext(1) });
      const per = v.perPage;
      let i = 0;
      const nodes = all.slice((v.page - 1) * per, v.page * per).map((sd) => ({ id: sd.id, seedNum: sd.seedNum,
        entrant: sd.entrant ? { id: sd.entrant.id, name: sd.entrant.participants.map((p) => p.gamerTag).join(' / '),
          participants: sd.entrant.participants.map((p) => ({ player: participantNode(p, i++).player })) } : null }));
      return jsonResponse(200, { data: { phase: { id: v.phaseId, name: 'Bracket', seeds: { pageInfo: { total: all.length, totalPages: Math.ceil(all.length / per) }, nodes } } }, extensions: ext(per * 4) });
    }
    if (op === 'UpdatePhaseSeeding') {
      if (opts.onPush) opts.onPush(v);
      if (opts.pushError) return jsonResponse(200, { errors: [{ message: opts.pushError, path: ['updatePhaseSeeding'] }] });
      const all = (world.seeds || {})[String(v.phaseId)] || [];
      for (const m of v.seedMapping) { const sd = all.find((x) => String(x.id) === String(m.seedId)); if (sd) sd.seedNum = m.seedNum; }
      all.sort((a, b) => a.seedNum - b.seedNum);
      return jsonResponse(200, { data: { updatePhaseSeeding: { id: v.phaseId } }, extensions: ext(10) });
    }
    if (op === 'EventStandings') {
      const all = (world.entrantsByEvent || {})[String(v.eventId)] || [];
      const per = v.perPage;
      const nodes = all.slice((v.page - 1) * per, v.page * per).map((e, k) => ({ placement: (v.page - 1) * per + k + 1,
        entrant: { id: e.id, name: e.participants.map((p) => p.gamerTag).join(' / '), participants: e.participants.map((p) => ({ player: { id: p.id, gamerTag: p.gamerTag } })) } }));
      return jsonResponse(200, { data: { event: { id: v.eventId, slug: '', standings: { pageInfo: { total: all.length, totalPages: Math.max(1, Math.ceil(all.length / per)) }, nodes } } }, extensions: ext(per * 4) });
    }
    if (op === 'EventEntrants') {
      const per = v.perPage;
      const all = (world.entrantsByEvent && world.entrantsByEvent[String(v.eventId)]) || world.entrants;
      const slice = all.slice((v.page - 1) * per, v.page * per);
      let i = 0;
      const nodes = slice.map((e) => ({ id: e.id, participants: e.participants.map((p) => participantNode(p, i++)) }));
      return jsonResponse(200, {
        data: { event: { entrants: { pageInfo: { total: all.length, totalPages: Math.ceil(all.length / per) }, nodes } } },
        extensions: ext(per * 5),
      });
    }
    if (op === 'UserEvents') {
      userEventsCalls++;
      if (opts.onUserEvents) opts.onUserEvents(userEventsCalls);
      if (opts.rateLimitFirst && rateLimited < opts.rateLimitFirst) {
        rateLimited++;
        return jsonResponse(429, { success: false, message: 'Rate limit exceeded - api-token' });
      }
      if (opts.serverErrorPlayer != null && String(v.userId) === String(opts.serverErrorPlayer)) {
        return jsonResponse(503, { message: 'Service Unavailable' });
      }
      if (opts.timeBudgetPlayer != null && String(v.userId) === String(opts.timeBudgetPlayer)) {
        return jsonResponse(200, { errors: [{ message: 'You have gone over the threshold for recent request time. Please wait before sending another request.' }] });
      }
      const p = world.players.find((x) => x.user && String(x.user.id) === String(v.userId));
      if (!p) return jsonResponse(200, { data: { user: null }, extensions: ext(1) });
      const per = v.perPage;
      const slice = p.events.slice((v.page - 1) * per, v.page * per);
      return jsonResponse(200, {
        data: { user: { events: {
          pageInfo: { total: p.events.length, totalPages: Math.ceil(p.events.length / per) },
          nodes: slice.map((ev) => eventNode(ev, v.userId)),
        } } },
        extensions: ext(Math.round(per * 7.02)),
      });
    }
    if (op === 'RecentStandings' || op === 'RecentStandingsAnyGame') {
      const p = world.players.find((x) => String(x.id) === String(v.playerId));
      if (!p) return jsonResponse(200, { data: { player: null }, extensions: ext(1) });
      const list = (p.standings || []).filter((s) => op === 'RecentStandingsAnyGame' ||
        !s.container.videogame || String(s.container.videogame.id) === String(v.videogameId));
      return jsonResponse(200, { data: { player: { recentStandings: list } }, extensions: ext(196) });
    }
    // ---- Build C (Amendment A1.3): a user by discriminator, for a CSV upload ----
    // Any world player with a linked user answers to user/<code>; world.extraUsers adds users with
    // no player profile ({ slug, id }). opts.userBySlugFail: a code whose lookup returns 503.
    // Who the token belongs to (lib/token.js validateToken). A token of "bad-token" is rejected the
    // way start.gg rejects one; anything else belongs to the fake's test TO.
    if (op === 'CurrentUser') {
      if (init.headers.Authorization === 'Bearer bad-token') return jsonResponse(badTokenFixture.httpStatus, badTokenFixture.body);
      return jsonResponse(200, { data: { currentUser: { id: 424242, player: { id: 777, gamerTag: 'TestTO' } } }, extensions: ext(2) });
    }
    if (op === 'UserBySlug') {
      if (opts.onUserBySlug) opts.onUserBySlug(v.slug);
      if (opts.userBySlugFail && v.slug === `user/${opts.userBySlugFail}`) return jsonResponse(503, { message: 'Service Unavailable' });
      const p = world.players.find((x) => x.user && x.user.slug.toLowerCase() === String(v.slug).toLowerCase());
      const extra = !p && (world.extraUsers || []).find((u) => u.slug === v.slug);
      const user = p ? { id: p.user.id, discriminator: p.user.slug.replace(/^user\//, ''), location: p.user.location, player: { id: p.id, gamerTag: p.gamerTag, prefix: p.prefix } }
        : extra ? { id: extra.id, discriminator: extra.slug.replace(/^user\//, ''), location: null, player: null } : null;
      return jsonResponse(200, { data: { user }, extensions: ext(6) });
    }
    // ---- The live-check instruments (scripts/ground-truth.js, scripts/reconcile.js --live) ----
    if (op === 'GTUser') {
      const p = world.players.find((x) => x.user && x.user.slug === v.slug);
      return jsonResponse(200, { data: { user: p ? { id: p.user.id, player: { id: p.id, gamerTag: p.gamerTag } } : null }, extensions: ext(3) });
    }
    if (op === 'GTUserEvents') {
      const p = world.players.find((x) => x.user && String(x.user.id) === String(v.id));
      if (!p) return jsonResponse(200, { data: { user: null }, extensions: ext(1) });
      const per = v.perPage;
      const nodes = p.events.slice((v.page - 1) * per, v.page * per).map((ev) => ({ id: ev.id, startAt: ev.startAt }));
      return jsonResponse(200, { data: { user: { events: { pageInfo: { totalPages: Math.ceil(p.events.length / per) }, nodes } } }, extensions: ext(per * 2) });
    }
    if (op === 'GTEvent') {
      const p = world.players.find((x) => x.user && String(x.user.id) === String(v.uid));
      const ev = p && p.events.find((e) => String(e.id) === String(v.id));
      return jsonResponse(200, { data: { event: ev ? { id: ev.id, name: ev.name, startAt: ev.startAt, videogame: { id: ev.videogame.id }, userEntrant: eventNode(ev, v.uid).userEntrant } : null }, extensions: ext(5) });
    }
    if (op === 'ReconcileCount') {
      const all = (world.entrantsByEvent && world.entrantsByEvent[String(v.id)]) || world.entrants;
      const nodes = all.slice((v.page - 1) * 150, v.page * 150).map((e) => ({ participants: e.participants.map((p, i) => ({ id: 80000 + i })) }));
      return jsonResponse(200, { data: { event: { entrants: { pageInfo: { totalPages: Math.max(1, Math.ceil(all.length / 150)) }, nodes } } }, extensions: ext(150) });
    }
    // ---- W-L (lib/wl.js): user ids by slug, then sets per (event, user) ----
    if (op === 'UserIds') {
      const data = {};
      for (const [k, slug] of Object.entries(v)) {
        const p = world.players.find((x) => x.user && x.user.slug === slug);
        data[k.replace(/^s/, 'u')] = p ? { id: p.user.id } : null;
      }
      return jsonResponse(200, { data, extensions: ext(Object.keys(v).length) });
    }
    if (op === 'SetsBatch' || op === 'Sets') {
      if (opts.onSets) opts.onSets(op, v);
      const perPage = Number((/perPage:\s*(\d+)/.exec(req.query) || [])[1]);
      const entrantFor = (eid, uid) => {
        const p = world.players.find((x) => x.user && String(x.user.id) === String(uid));
        const ev = p && (p.events || []).find((e) => String(e.id) === String(eid));
        if (!ev || ev._noEntrant) return null;
        const all = fakeSets(eid, uid).sets;
        const page = op === 'Sets' ? v.page : 1;
        return { id: fakeEntrantId(eid, uid), paginatedSets: {
          pageInfo: { totalPages: Math.max(1, Math.ceil(all.length / perPage)) },
          nodes: all.slice((page - 1) * perPage, page * perPage) } };
      };
      if (op === 'Sets') return jsonResponse(200, { data: { event: { userEntrant: entrantFor(v.eid, v.uid) } }, extensions: ext(300) });
      const data = {};
      for (let j = 0; `e${j}` in v; j++) data[`x${j}`] = { userEntrant: entrantFor(v[`e${j}`], v[`u${j}`]) };
      return jsonResponse(200, { data, extensions: ext(700) });
    }
    return jsonResponse(400, { errors: [{ message: `Unknown operation ${op}` }] });
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

// Sets for one (event, user), generated from the ids, with the record they should tally to,
// counted while generating (not by running lib/view/model.recordFor over them).
// Every 5th event has a DQ, every event has a bye, every 7th has 15 sets (more than one small
// page, so lib/wl.js must refetch it alone).
const fakeEntrantId = (eid, uid) => Number(uid) * 100_000 + (Number(eid) % 100_000);
function fakeSets(eid, uid) {
  const me = fakeEntrantId(eid, uid);
  const n = Number(eid) % 7 === 0 ? 15 : 2 + (Number(eid) % 4);
  const sets = [];
  let w = 0, l = 0, dq = 0;
  for (let i = 0; i < n; i++) {
    const opp = 1 + i;
    const won = (Number(eid) + i) % 3 !== 0;
    sets.push({ winnerId: won ? me : opp, slots: [{ entrant: { id: me }, standing: { stats: { score: { value: won ? 2 : 0 } } } }, { entrant: { id: opp }, standing: { stats: { score: { value: won ? 0 : 2 } } } }] });
    if (won) w++; else l++;
  }
  if (Number(eid) % 5 === 0) {
    sets.push({ winnerId: me, slots: [{ entrant: { id: me }, standing: { stats: { score: { value: 0 } } } }, { entrant: { id: 999 }, standing: { stats: { score: { value: -1 } } } }] });
    dq++;
  }
  sets.push({ winnerId: me, slots: [{ entrant: { id: me } }, { entrant: null }] }); // bye
  return { sets, record: { w, l, dq } };
}

// A virtual clock: sleep advances time instantly, so pacing is real arithmetic with no waiting.
function virtualClock(startMs) {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    advance: (ms) => { t += ms; },
  };
}

function sink() {
  const chunks = [];
  return { write: (s) => { chunks.push(String(s)); return true; }, text: () => chunks.join('') };
}

module.exports = { buildWorld, createFakeFetch, virtualClock, sink, GAME, OTHER_GAME, EVENT_SLUG, EVENT2_SLUG, T_SLUG, E_SLUG, E2_SLUG, readFixture, fakeSets };
