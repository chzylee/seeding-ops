#!/usr/bin/env node
'use strict';
// scripts/record-fixtures.js — capture one real response per query into test/fixtures/recorded/
// so test/recorded-shape.test.js can check the parsers against what start.gg actually returns.
// LIVE: needs STARTGG_TOKEN. 4 requests. Writes response bodies only: no token, no headers.
//   node scripts/record-fixtures.js [event URL] [--user <user id>]

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('../lib/startgg');
const { loadToken } = require('../lib/token');

const DEFAULT_URL = 'https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code';
const DIR = path.join(__dirname, '..', 'test', 'fixtures', 'recorded');

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || DEFAULT_URL;
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) { console.error('No STARTGG_TOKEN. Paste it into .env first.'); return 2; }

  // Capture the raw body by wrapping fetch: the client still paces and classifies.
  let lastBody = null;
  const fetchImpl = async (u, init) => {
    const res = await fetch(u, init);
    const text = await res.text();
    lastBody = JSON.parse(text);
    return { status: res.status, ok: res.ok, headers: res.headers, text: async () => text };
  };
  const client = sgg.createClient({ token, fetchImpl });
  const save = (name, variables) => {
    fs.mkdirSync(DIR, { recursive: true });
    const body = { _source: `recorded ${new Date().toISOString()} from start.gg`, _variables: variables, ...lastBody };
    fs.writeFileSync(path.join(DIR, name), JSON.stringify(body, null, 2) + '\n');
    console.log(`wrote ${name}`);
  };

  const { slug } = sgg.parseEventSlug(url);
  const ev = await sgg.resolveEvent(client, slug);
  save('event.json', { slug });
  await client.request('EventEntrants', sgg.Q_ENTRANTS, { eventId: ev.id, page: 1, perPage: 10 });
  save('entrants-page.json', { eventId: ev.id, page: 1, perPage: 10 });
  const entr = lastBody.data.event.entrants.nodes;
  const players = entr.flatMap((e) => e.participants.map((p) => p.player));
  const withUser = players.find((p) => p.user);
  const userId = args.includes('--user') ? args[args.indexOf('--user') + 1] : withUser && withUser.user.id;
  if (userId) {
    await client.request('UserEvents', sgg.Q_USER_EVENTS, { userId, page: 1, perPage: 10 });
    save('user-events-page.json', { userId, page: 1, perPage: 10 });
  }
  const anyPlayer = players[0];
  await client.request('RecentStandings', sgg.Q_RECENT_STANDINGS,
    { playerId: anyPlayer.id, videogameId: ev.videogame.id, limit: 20 });
  save('recent-standings.json', { playerId: anyPlayer.id, videogameId: ev.videogame.id });
  console.log(`${client.stats.requests} requests`);
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
