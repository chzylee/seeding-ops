'use strict';
// lib/wl.js — W-L (sets won and lost) for result rows, fetched through lib/startgg's paced,
// retrying client. The pull doesn't fetch sets; the seeding view needs them per result.
// Moved from views/major-table.js (increment 1's view) with its batching kept:
//   - start.gg user ids, 20 aliased lookups per request;
//   - sets for BATCH events per request (aliases), first SMALL_PAGE sets each — enough for nearly
//     every bracket and well under the 1000-complexity cap. An event with more sets than that is
//     refetched on its own at perPage 40, from page 1, so page boundaries never mix;
//   - WORKERS requests in flight: start.gg answers a batch in ~3 s, so one at a time uses only
//     ~20 of the 75/min the client allows. The client still paces every send.
// The cache is keyed "<player_id>:<event_id>" -> { w, l, dq } | { missing: true } and lives in
// <run>/views/set-records.json (the legacy bbb-records.json is read too).

const fs = require('node:fs');
const path = require('node:path');
const { recordFor, key } = require('./view/model');

const BATCH = 4;
const SMALL_PAGE = 12;
const WORKERS = 3;
const USER_CHUNK = 20;
const SET_FIELDS = 'nodes{ winnerId slots{ entrant{ id } standing{ stats{ score{ value } } } } }';
const Q_SETS = `query Sets($eid:ID!,$uid:ID!,$page:Int!){ event(id:$eid){ userEntrant(userId:$uid){ id
  paginatedSets(page:$page, perPage:40){ pageInfo{ totalPages }
    ${SET_FIELDS} } } } }`;

const cacheFile = (runDir) => path.join(runDir, 'views', 'set-records.json');

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}
function loadCache(runDir) {
  return { ...readJson(path.join(runDir, 'views', 'bbb-records.json')), ...readJson(cacheFile(runDir)) };
}
// Temp file then rename, so a reader (the app's data endpoint) never sees half a file.
function saveCache(runDir, cache) {
  fs.mkdirSync(path.join(runDir, 'views'), { recursive: true });
  const f = cacheFile(runDir);
  fs.writeFileSync(f + '.tmp', JSON.stringify(cache, null, 1));
  fs.renameSync(f + '.tmp', f);
}

// Fetches W-L for every row in `rows` (in that order) that `cache` lacks, writing into `cache`.
//   client      lib/startgg createClient(...) result
//   players     players.csv rows (player_id -> user_slug)
//   onChunk({ done, total, rows })   after each batch is stored (save the cache here)
//   isSummary(row)                   counted separately in progress (summaryDone / summaryTotal)
// Returns { done, total, summaryDone, summaryTotal, noUser } — noUser: rows whose player has no
// start.gg user id (never fetchable; they show as "—").
async function fetchSetRecords({ client, players, rows, cache, onChunk = () => {}, isSummary = () => false, workers = WORKERS }) {
  const todo = rows.filter((r) => !cache[key(r)]);
  const progress = { done: 0, total: todo.length, summaryDone: 0, summaryTotal: todo.filter(isSummary).length, noUser: 0 };
  if (!todo.length) return progress;
  const slugOf = Object.fromEntries(players.map((p) => [p.player_id, p.user_slug]));

  const userIds = {};
  const slugs = [...new Set(todo.map((r) => slugOf[r.player_id]).filter(Boolean))];
  for (let i = 0; i < slugs.length; i += USER_CHUNK) {
    const chunk = slugs.slice(i, i + USER_CHUNK);
    const q = `query UserIds(${chunk.map((_, j) => `$s${j}:String!`).join(',')}){ ${chunk.map((_, j) => `u${j}: user(slug:$s${j}){ id }`).join(' ')} }`;
    const d = await client.request('UserIds', q, Object.fromEntries(chunk.map((s, j) => [`s${j}`, s])));
    chunk.forEach((s, j) => { if (d && d[`u${j}`]) userIds[s] = d[`u${j}`].id; });
  }

  const uid = (r) => userIds[slugOf[r.player_id]];
  const work = todo.filter((r) => uid(r) != null);
  progress.noUser = todo.length - work.length;
  progress.total = work.length;
  progress.summaryTotal = work.filter(isSummary).length;

  const fetchAlone = async (r) => {
    let sets = [], entrantId = null;
    for (let page = 1, total = 1; page <= total; page++) {
      const d = await client.request('Sets', Q_SETS, { eid: r.event_id, uid: uid(r), page });
      const ue = d && d.event && d.event.userEntrant;
      if (!ue) break;
      entrantId = ue.id; total = ue.paginatedSets.pageInfo.totalPages || 1;
      sets = sets.concat(ue.paginatedSets.nodes || []);
    }
    return entrantId ? recordFor(entrantId, sets) : { missing: true };
  };
  const runChunk = async (chunk) => {
    const q = `query SetsBatch(${chunk.map((_, j) => `$e${j}:ID!,$u${j}:ID!`).join(',')}){ ${chunk.map((_, j) =>
      `x${j}: event(id:$e${j}){ userEntrant(userId:$u${j}){ id paginatedSets(page:1, perPage:${SMALL_PAGE}){ pageInfo{ totalPages }
        ${SET_FIELDS} } } }`).join(' ')} }`;
    const vars = {};
    chunk.forEach((r, j) => { vars[`e${j}`] = r.event_id; vars[`u${j}`] = uid(r); });
    const d = await client.request('SetsBatch', q, vars);
    for (const [j, r] of chunk.entries()) {
      const ue = d && d[`x${j}`] && d[`x${j}`].userEntrant;
      if (!ue) cache[key(r)] = { missing: true };
      else if ((ue.paginatedSets.pageInfo.totalPages || 1) > 1) cache[key(r)] = await fetchAlone(r);
      else cache[key(r)] = recordFor(ue.id, ue.paginatedSets.nodes || []);
    }
    progress.done += chunk.length;
    progress.summaryDone += chunk.filter(isSummary).length;
    onChunk({ ...progress, rows: chunk });
  };
  const queue = [];
  for (let i = 0; i < work.length; i += BATCH) queue.push(work.slice(i, i + BATCH));
  await Promise.all(Array.from({ length: workers }, async () => { while (queue.length) await runChunk(queue.shift()); }));
  return progress;
}

module.exports = { BATCH, SMALL_PAGE, WORKERS, Q_SETS, cacheFile, loadCache, saveCache, fetchSetRecords };
