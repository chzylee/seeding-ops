#!/usr/bin/env node
'use strict';
// scripts/ground-truth.js — acceptance item 5. LIVE: needs STARTGG_TOKEN.
//   node scripts/ground-truth.js <run folder> [--user user/14364d39] [--samples 3]
//
// 1. For one user (default GeneralMidwest, user/14364d39): an INDEPENDENT count of in-window
//    user.events, using its own query and paging (perPage 50, its own loop; it does not use
//    lib/history.js), compared to that player's rows in results.csv.
// 2. N random results.csv rows from N different complete players, each re-fetched by event id
//    and compared on date, event, game and placement.
// The window is read from the run's meta.json, so both sides use the same bounds.

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('../lib/startgg');
const { loadToken } = require('../lib/token');
const { parseCsv } = require('../lib/output');

const Q_USER = `query GTUser($slug: String!) { user(slug: $slug) { id player { id gamerTag } } }`;
const Q_EVENTS = `query GTUserEvents($id: ID!, $page: Int!) {
  user(id: $id) { events(query: { page: $page, perPage: 50 }) {
    pageInfo { totalPages } nodes { id startAt } } } }`;
const Q_EVENT = `query GTEvent($id: ID!, $uid: ID!) {
  event(id: $id) { id name startAt videogame { id }
    userEntrant(userId: $uid) { standing { placement } } } }`;

async function main() {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('--') && !/^user\//.test(a) && !/^\d+$/.test(a));
  const userSlug = args.includes('--user') ? args[args.indexOf('--user') + 1] : 'user/14364d39';
  const samples = args.includes('--samples') ? Number(args[args.indexOf('--samples') + 1]) : 3;
  if (!runDir) { console.error('Usage: node scripts/ground-truth.js <run folder> [--user user/<slug>] [--samples 3]'); return 2; }
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) { console.error('No STARTGG_TOKEN. Paste it into .env first.'); return 2; }
  const client = sgg.createClient({ token });

  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
  const players = parseCsv(fs.readFileSync(path.join(runDir, 'players.csv'), 'utf8'));
  const results = parseCsv(fs.readFileSync(path.join(runDir, 'results.csv'), 'utf8'));
  const startSec = Date.parse(meta.window.start) / 1000;
  const endSec = Date.parse(meta.window.end) / 1000;
  let failures = 0;

  // ---- 1. Independent count ----
  const u = (await client.request('GTUser', Q_USER, { slug: userSlug })).user;
  if (!u) { console.error(`No user ${userSlug}`); return 1; }
  const ids = new Set();
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const conn = (await client.request('GTUserEvents', Q_EVENTS, { id: u.id, page })).user.events;
    totalPages = conn.pageInfo.totalPages;
    for (const n of conn.nodes) if (n.startAt != null && n.startAt >= startSec && n.startAt <= endSec) ids.add(String(n.id));
  }
  const pid = String(u.player.id);
  const theirRows = results.filter((r) => r.player_id === pid);
  const csvIds = new Set(theirRows.map((r) => r.event_id));
  const ok1 = ids.size === theirRows.length && [...ids].every((id) => csvIds.has(id));
  console.log(`${ok1 ? 'PASS' : 'FAIL'}  ${userSlug} (${u.player.gamerTag}, player ${pid}): independent in-window count ${ids.size}, results.csv rows ${theirRows.length}`);
  if (!ok1) {
    failures++;
    console.log(`      only in API: ${[...ids].filter((x) => !csvIds.has(x)).slice(0, 10).join(', ')}`);
    console.log(`      only in CSV: ${[...csvIds].filter((x) => !ids.has(x)).slice(0, 10).join(', ')}`);
  }

  // ---- 2. Random rows across different players ----
  const eligible = players.filter((p) => p.history_status === 'complete' && Number(p.result_count) > 0);
  const pick = [];
  const pool = [...eligible];
  while (pick.length < samples && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  for (const p of pick) {
    const rows = results.filter((r) => r.player_id === p.player_id);
    const row = rows[Math.floor(Math.random() * rows.length)];
    const pu = (await client.request('GTUser', Q_USER, { slug: p.user_slug })).user;
    const ev = (await client.request('GTEvent', Q_EVENT, { id: row.event_id, uid: pu.id })).event;
    const got = {
      date: new Date(ev.startAt * 1000).toISOString().slice(0, 10),
      event: ev.name,
      game: String(ev.videogame && ev.videogame.id),
      placement: ev.userEntrant && ev.userEntrant.standing && ev.userEntrant.standing.placement != null
        ? String(ev.userEntrant.standing.placement) : '',
    };
    const want = { date: row.event_date, event: row.event_name, game: row.game_id, placement: row.placement };
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${p.gamer_tag} (player ${p.player_id}) event ${row.event_id}: csv ${JSON.stringify(want)} | api ${JSON.stringify(got)}`);
  }
  console.log(`${client.stats.requests} requests`);
  return failures ? 1 : 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
