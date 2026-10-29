#!/usr/bin/env node
'use strict';
// scripts/ground-truth.js — acceptance item 5. LIVE: needs STARTGG_TOKEN.
//   node scripts/ground-truth.js <run folder> [--user user/14364d39] [--samples 3] [--per-page 50]
//
// 1. For one user (default GeneralMidwest, user/14364d39): an INDEPENDENT count of in-window
//    user.events, using its own query and paging (perPage 50 by default, its own loop; it does not
//    use lib/history.js), compared to that player's rows in results.csv.
// 2. N random results.csv rows, each re-fetched by event id and compared on date, event, game and
//    placement. Rows come from N different complete players while the run has that many; a run
//    with fewer such players gives more than one row per player.
// The window is read from the run's meta.json, so both sides use the same bounds.

const fs = require('node:fs');
const path = require('node:path');
const sgg = require('../lib/startgg');
const { loadToken } = require('../lib/token');
const { parseCsv } = require('../lib/output');

const Q_USER = `query GTUser($slug: String!) { user(slug: $slug) { id player { id gamerTag } } }`;
const Q_EVENTS = `query GTUserEvents($id: ID!, $page: Int!, $perPage: Int!) {
  user(id: $id) { events(query: { page: $page, perPage: $perPage }) {
    pageInfo { totalPages } nodes { id startAt } } } }`;
const Q_EVENT = `query GTEvent($id: ID!, $uid: ID!) {
  event(id: $id) { id name startAt videogame { id }
    userEntrant(userId: $uid) { standing { placement } } } }`;

async function resolveUser(client, slug) {
  const u = (await client.request('GTUser', Q_USER, { slug })).user;
  return u ? { id: String(u.id), slug, player: { id: String(u.player.id), gamerTag: u.player.gamerTag } } : null;
}

// client: a lib/startgg client. user: resolveUser's result (resolved here when omitted).
async function groundTruth({ client, runDir, userSlug = 'user/14364d39', user = null, samples = 3, perPage = 50, log = console.log, random = Math.random }) {
  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
  const players = parseCsv(fs.readFileSync(path.join(runDir, 'players.csv'), 'utf8'));
  const results = parseCsv(fs.readFileSync(path.join(runDir, 'results.csv'), 'utf8'));
  const startSec = Date.parse(meta.window.start) / 1000;
  const endSec = Date.parse(meta.window.end) / 1000;
  let failures = 0;
  const lines = [];
  const say = (s) => { lines.push(s); log(s); };

  // ---- 1. Independent count ----
  const u = user || await resolveUser(client, userSlug);
  if (!u) { say(`FAIL  no user ${userSlug}`); return { failures: 1, lines }; }
  const ids = new Set();
  let totalPages = 1;
  let pages = 0;
  for (let page = 1; page <= totalPages; page++) {
    const conn = (await client.request('GTUserEvents', Q_EVENTS, { id: u.id, page, perPage })).user.events;
    totalPages = conn.pageInfo.totalPages;
    pages++;
    for (const n of conn.nodes) if (n.startAt != null && n.startAt >= startSec && n.startAt <= endSec) ids.add(String(n.id));
  }
  const pid = u.player.id;
  const theirRows = results.filter((r) => r.player_id === pid);
  const csvIds = new Set(theirRows.map((r) => r.event_id));
  const ok1 = ids.size === theirRows.length && [...ids].every((id) => csvIds.has(id));
  say(`${ok1 ? 'PASS' : 'FAIL'}  ${u.slug} (${u.player.gamerTag}, player ${pid}): independent in-window count ${ids.size} (perPage ${perPage}, ${pages} pages), results.csv rows ${theirRows.length}`);
  if (!ok1) {
    failures++;
    say(`      only in API: ${[...ids].filter((x) => !csvIds.has(x)).slice(0, 10).join(', ')}`);
    say(`      only in CSV: ${[...csvIds].filter((x) => !ids.has(x)).slice(0, 10).join(', ')}`);
  }

  // ---- 2. Random rows ----
  const eligible = players.filter((p) => p.history_status === 'complete' && Number(p.result_count) > 0);
  for (let i = eligible.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [eligible[i], eligible[j]] = [eligible[j], eligible[i]]; }
  const userIds = new Map([[u.slug, u.id]]);
  const usedRows = new Set();
  for (let k = 0; k < samples && eligible.length; k++) {
    const p = eligible[k % eligible.length];
    const rows = results.filter((r) => r.player_id === p.player_id && !usedRows.has(r.event_id + ':' + r.player_id));
    if (!rows.length) break;
    const row = rows[Math.floor(random() * rows.length)];
    usedRows.add(row.event_id + ':' + row.player_id);
    if (!userIds.has(p.user_slug)) userIds.set(p.user_slug, (await resolveUser(client, p.user_slug)).id);
    const ev = (await client.request('GTEvent', Q_EVENT, { id: row.event_id, uid: userIds.get(p.user_slug) })).event;
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
    say(`${ok ? 'PASS' : 'FAIL'}  ${p.gamer_tag} (player ${p.player_id}) event ${row.event_id}: csv ${JSON.stringify(want)} | api ${JSON.stringify(got)}`);
  }
  return { failures, lines, count: ids.size, rows: theirRows.length };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const runDir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!runDir) { console.error('Usage: node scripts/ground-truth.js <run folder> [--user user/<slug>] [--samples 3] [--per-page 50]'); return 2; }
  const { token } = loadToken({ envFile: path.join(__dirname, '..', '.env') });
  if (!token) { console.error('No STARTGG_TOKEN. Paste it into .env first.'); return 2; }
  const client = sgg.createClient({ token });
  const { failures } = await groundTruth({ client, runDir, userSlug: opt('--user') || 'user/14364d39',
    samples: opt('--samples') != null ? Number(opt('--samples')) : 3, perPage: opt('--per-page') != null ? Number(opt('--per-page')) : 50 });
  console.log(`${client.stats.requests} requests`);
  return failures ? 1 : 0;
}

if (require.main === module) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
}

module.exports = { groundTruth, resolveUser };
