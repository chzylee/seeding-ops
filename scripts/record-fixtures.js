#!/usr/bin/env node
'use strict';
// scripts/record-fixtures.js — capture one real response per query into test/fixtures/recorded/
// so test/recorded-shape.test.js can check the parsers against what start.gg actually returns.
// LIVE: needs STARTGG_TOKEN. 4 requests. Writes response bodies only: no token, no headers.
//   node scripts/record-fixtures.js [event URL] [--user <user id>]
//
// Deterministic files (build B pass 3): each file keeps the response's `data`, the query's
// variables, the recording date (`_recorded_on`, which the test anchors its window to, so the
// test's result never depends on the day it runs) and only `queryComplexity` from `extensions`;
// anything else start.gg adds per response is dropped.

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('../lib/startgg');
const { loadToken } = require('../lib/token');

const DEFAULT_URL = 'https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code';
const DIR = path.join(__dirname, '..', 'test', 'fixtures', 'recorded');

// A fetch wrapper that keeps the last response body (the client still paces and classifies).
function capturing(fetchImpl = (u, i) => globalThis.fetch(u, i)) {
  const f = async (u, init) => {
    const res = await fetchImpl(u, init);
    const text = await res.text();
    f.lastBody = JSON.parse(text);
    return { status: res.status, ok: res.ok, headers: res.headers, text: async () => text };
  };
  f.lastBody = null;
  return f;
}

function stable(body, variables, recordedOn) {
  const out = { _source: 'recorded from start.gg by scripts/record-fixtures.js', _recorded_on: recordedOn, _variables: variables, data: body.data };
  if (body.extensions && typeof body.extensions.queryComplexity === 'number') out.extensions = { queryComplexity: body.extensions.queryComplexity };
  return out;
}

// client: a lib/startgg client whose fetch is `capture` (capturing()). Returns the files written.
async function recordFixtures({ client, capture, url = DEFAULT_URL, userId = null, dir = DIR, recordedOn = new Date().toISOString().slice(0, 10), log = console.log }) {
  const written = [];
  const save = (name, variables) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), JSON.stringify(stable(capture.lastBody, variables, recordedOn), null, 2) + '\n');
    written.push(name);
    log(`wrote ${name}`);
  };
  const { slug } = sgg.parseEventSlug(url);
  const ev = await sgg.resolveEvent(client, slug);
  save('event.json', { slug });
  await client.request('EventEntrants', sgg.Q_ENTRANTS, { eventId: ev.id, page: 1, perPage: 10 });
  save('entrants-page.json', { eventId: ev.id, page: 1, perPage: 10 });
  const entr = capture.lastBody.data.event.entrants.nodes;
  const players = entr.flatMap((e) => e.participants.map((p) => p.player));
  const withUser = players.find((p) => p.user);
  const uid = userId || (withUser && withUser.user.id);
  let userEventsTotal = null;
  if (uid) {
    await client.request('UserEvents', sgg.Q_USER_EVENTS, { userId: uid, page: 1, perPage: 10 });
    save('user-events-page.json', { userId: uid, page: 1, perPage: 10 });
    const conn = capture.lastBody.data && capture.lastBody.data.user && capture.lastBody.data.user.events;
    userEventsTotal = conn && conn.pageInfo ? conn.pageInfo.total : null;
  }
  const anyPlayer = players[0];
  await client.request('RecentStandings', sgg.Q_RECENT_STANDINGS,
    { playerId: anyPlayer.id, videogameId: ev.videogame.id, limit: 20 });
  save('recent-standings.json', { playerId: anyPlayer.id, videogameId: ev.videogame.id });
  return { written, event: ev, userEventsTotal };
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || DEFAULT_URL;
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) { console.error('No STARTGG_TOKEN. Paste it into .env first.'); return 2; }
  const capture = capturing();
  const client = sgg.createClient({ token, fetchImpl: capture });
  const userId = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;
  await recordFixtures({ client, capture, url, userId });
  console.log(`${client.stats.requests} requests`);
  return 0;
}

if (require.main === module) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
}

module.exports = { recordFixtures, capturing, stable, DIR };
