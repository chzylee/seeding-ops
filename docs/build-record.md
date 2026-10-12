# Build record: seeding-script v1

One section per pass, per `docs/dispatch-contract.md` §Build record.

---

## Pass 1: lead engineer

Seat: `lead-engineer` (personal-staff `personas/library/lead-engineer.md`, profile block v0.4.0), Opus.
Branch `build/v1`, local commits only. Date: 2026-10-12.

### Terms as understood

- **Directive:** reliably pull every registrant's results from the 2 years before execution time,
  for one event, into organized files. Token lives outside the code, pasted by Noah. Script now,
  structured so it can migrate into a tool later.
- **Binding spec:** `docs/design.md` as amended 2026-10-12 twice. That covers the standalone repo,
  the 730-day window from run time, all games with `is_event_game`, `user.events` as the primary
  source, and the **mid-pass-1 region amendment**: `user{location{state country}}` and never city,
  the `region_state`/`region_country` columns, and `meta.region_coverage`. The coordinator relayed
  the region amendment mid-pass and I re-read the amended design before building it.
- **Acceptance:** contract §Acceptance items 1–12. Region is part of items 3 and 4, plus a
  fixture test (coordinator's relay).
- **Surfaces:** read/write `seeding-script/`; read-only `startgg-results/`. Live calls only to
  `https://api.start.gg/gql/alpha`, at most 75 per 60 s.
- **Work types:** additive.
- **Prohibitions held:** I never wrote `.env`, never looked for a token anywhere, and never read
  `startgg-results/.secrets/`. The Q-1 probe script reads that path. I reproduced its text below as
  evidence and did not run it. No push, no remote. `docs/usage-log.md` was committed once,
  untracked as found (coordinator boundary), and not touched since. No `registry/` exists.
- **Pass posture:** Pass 1 builds. I don't audit myself. Passes 2–4 belong to other seats.
- **Design-doc provenance:** written by the office-hours session and amended by Noah. No persona
  was loaded as a resource in this pass.

### Assumptions I supplied that the contract did not state

Each is a reversible default, referred to below as A1–A7. Change cost is noted where it matters.

1. **`user.events` nodes with `userEntrant: null` are kept as rows with a blank placement.**
   Dropping them would be an uncounted skip ("nothing is dropped without being counted"). The
   alternative is to drop them and add a skip counter, a one-line change in
   `lib/history.js:rowsFromUserEvents`. *Live data should settle this:* if such rows turn out to
   be events the player never entered, drop and count them.
2. **An event with no `startAt` is counted as `out_of_window`.** The design has no third bucket.
3. **`team_entries_split` counts entrants with more than one participant**, not the rows those
   entrants produced.
4. **Folder timestamp is local time**, because Noah reads it. **`event_date` is the UTC date**,
   which is deterministic but can land a late-evening US event on the next day.
5. **Extra `meta.json` keys** beyond the design list: `registrant_anomalies` (API participant
   count, repeated players, participants with no player, which is what makes item 4's row-count
   equality checkable), `retries`, `failed_players` (the design asks for the failed list), `sessions`
   (1 + number of resumes), and `window.days`. All design keys are present, none renamed.
6. **Working state lives in `<run>/_work/`** (`run.json`, `checkpoint.jsonl`, `requests.jsonl`), so
   the run folder's top level is just the three files Noah hands to Claude.
7. **Exit codes:** `0` all fetched; `1` finished with failed players, or stopped partway; `2`
   could not start (no token, bad token, bad URL, unknown event). The design fixes only "exit 2"
   for a token problem and "non-zero" for failures.

### Engineer's-choice rulings (interpretation ledger)

| # | Choice | Options considered | Why this one |
|---|---|---|---|
| E1 | Six modules: `startgg.js` (client), `pacing.js` (pure arithmetic), `history.js`, `output.js`, `run.js` (orchestrator), `token.js`, plus thin `pull.js` | One file; client/history/output only | Design requires client, history and writer to be separate. Pacing is split out so its arithmetic is testable with no clock. `run.js` returns an exit code instead of calling `process.exit`, so a future tool can drive it. |
| E2 | Error classes for retry, using the GraphQL spec's `path` rule. An error without `path` (validation, schema, complexity) is fatal `query`. One with `path` (execution) is retryable `server`. 5xx is `server`, other non-auth 4xx is `query`. | Reuse `classifyError` as is (folds 5xx and schema errors into one `network` bucket); keyword-match error messages | The design needs "retry 5xx, stop on schema error", and the original can't tell them apart. GraphQL spec §7.1.2 puts `path` only on errors raised while executing a field, so validation errors lack it. That's a structural signal, not a guess from wording. *Live behavior unverified for start.gg's error bodies.* |
| E3 | Rate-limit message checked before the auth regex | Original order | start.gg's rate-limit text is believed to read "Rate limit exceeded - api-token" (**model knowledge, unverified**). The original order would misread it as a bad token and kill the run. Costs nothing if wrong. |
| E4 | Thrown requests (DNS, reset, the 30 s timeout) are retried like 5xx | Design names only rate-limit and 5xx | Reliability over speed. A dropped connection is the same class of transient fault. |
| E5 | Backoff 4, 8, 16, 32 s (5 tries, 60 s total), and `Retry-After` honored if larger | startgg-results' 1/2/4 s | 60 s spans one full rate-limit window. The design requires 5 tries. |
| E6 | Pacing counts every send, retries included, against a rolling 60 s window of 75. On resume it is seeded from the request log | Fixed-minute buckets; fresh limiter per process | A fixed minute can pass 80 across a boundary (test `maxInAnyWindow uses a rolling…`). Without seeding, an immediate resume could double up inside one window. |
| E7 | `user.events` perPage **120** (est. 843 complexity from the probe's 351/50) | 140 (the design's "~140", est. 983) | 140 leaves 2% headroom against a per-node estimate taken from a query with one more field. The live run records the real max in `meta.query_complexity_max`, so this can be raised then. Entrants perPage 100 is an estimate too (≈5 objects/node). |
| E8 | No-account fallback calls `recentStandings` for the **input event's game only**. The any-game call is built but gated off (`ALL_GAMES_FALLBACK = false`) | Call without `videogameId` now | The design says to call without one *if it's optional*. That's unverified, and if the argument is required the call would fail validation and stop the run at the first guest. `scripts/schema-check.js` answers it in one request. **Open item (PARKED).** |
| E9 | Output written as three temp files, then renamed with `meta.json` last as the completion marker | Rename a whole `.partial` folder | A directory rename on Windows can fail with EPERM while an indexer or AV holds a handle. **Residual:** a kill in the microseconds between the renames could leave 1–2 of the 3 files. A resume rewrites all three. README tells the reader that `meta.json` present means finished. |
| E10 | Tags beginning with `= + - @` are written verbatim, inside quotes | OWASP-style `'` prefix | The design says `gamer_tag` is "as on start.gg", and the data's main reader is Claude. **Cost:** a spreadsheet may evaluate such a tag as a formula. README warns. Listed under Needs attention. |
| E11 | Failed players are not checkpointed, so `--resume` retries them, including on a finished run that had failures | Resume refuses finished runs | Makes "failed" recoverable without refetching everyone. |
| E12 | A user whose `events` connection comes back null is `failed`, not `complete` with 0 rows | Treat as empty | Otherwise it's a quiet incomplete. |
| E13 | Node built-ins only: `util.parseEnv` for `.env`, `node:test`, global `fetch`, `AbortSignal.timeout`. CommonJS. | `dotenv` | Novelty check: Node 24 already parses `.env`. No dependency to justify. |
| E14 | `.gitattributes` `* text=auto eol=lf` | Leave global `autocrlf` in effect | Keeps clones byte-identical across machines. |

### Reuse review: `startgg-results` (acceptance 11)

Reviewed read-only: `core.js` (`parseEventSlug`, `classifyError`, `gqlFetch`, `paginate`),
`merge/startgg.js` (a later copy of the same two functions plus a retry policy),
`tests/merge-startgg.test.js` (SG-1..SG-7), `tests/increment1.test.js` 1.1–1.6,
`fixtures/error-badtoken-400.json`, and the dossier notes on `recentStandings`
(`docs/design/seeding-dossier.md:468`).

| Item | Verdict | Where / why |
|---|---|---|
| `parseEventSlug` (`core.js:33`) | **Copied verbatim**, credited in `lib/startgg.js` | Tested against seven URL shapes upstream. Holds up. |
| SG-1, SG-2 slug tests | **Ported** to `test/slug.test.js`, plus a `?query` case | Same function, same oracle. |
| `classifyError` (`core.js:52`) | **Adapted**, credited | The live-verified rules are kept exactly: bad token = HTTP 400 recognized by body, never by a 401 alone (D-8); a GraphQL auth message = bad token. Changed: 5xx → `server`, schema/validation → `query`, and the rate-limit check comes first (E2, E3). The original folds every non-auth failure into `network`, so it can't drive "retry 5xx, stop on schema error". |
| SG-3..SG-7 classify tests | **Ported** to `test/classify.test.js` | Same meaning. Two expectations change because the kinds were split, not weakened: `400 syntax error` was `network` and is now `query`; `500` was `network` and is now `server`. |
| `fixtures/error-badtoken-400.json` | **Copied**, credited in `test/fixtures/README.md` | The only *recorded* live response available offline. |
| `gqlFetch` | **Rejected** | No timeout, ignores `extensions.queryComplexity`, folds 5xx into `network`. Rewritten as `createClient` with pacing, retry and a request log. |
| `paginate` | **Rejected** | Hides per-page progress and complexity. Paging to `totalPages` is three lines inline. |
| `merge/startgg.js` retry policy (3 retries, 1/2/4 s, rate-limit only) | **Rejected** | The design requires 5 tries and 5xx retry. |
| Query strings, `tallyRecords`, `shortTag`, UMD wrapper | **Rejected** | Different data (standings/sets), and no browser target here. |

### Q-1 probe evidence (reproduced as the design asks)

Design §"Evidence this works" summarizes the probe. The script is
`<session scratchpad>/q1-probe.cjs` (session 7918820e-…, `scratchpad/q1-probe.cjs`), reproduced
verbatim below as evidence. **It is not part of the tool.** It reads the token from a hard-coded
path in `startgg-results/.secrets/`, which is exactly what this tool does not do. **Pass 1 did not
run it.** Its output is recorded only in the design's table. I hold no copy of the raw output, so the
table's numbers (418 lifetime events, 150/150 in window, cost 351 at perPage 50, 196 for nested
recentStandings, unsorted order) stand on the design doc. They are 7–8 for this pass, not 9–10.

```js
// Q-1 probe for seed-pull (design doc iknow-master-design-20261011-001946.md).
// Answers: (1) does recentStandings resolve nested under entrants, (2) per-entrant object cost,
// (3) is there a back-fill path past 20 results. At most 4 requests, 1s apart. Never prints the token.
// Usage: node q1-probe.cjs <event-url>
const fs = require('fs');
const path = require('path');
const REPO = 'C:/Users/iknow/repos/startgg-results';
const { parseEventSlug } = require(path.join(REPO, 'core.js'));
const TOKEN = fs.readFileSync(path.join(REPO, '.secrets/startgg-token.txt'), 'utf8').trim();
const ENDPOINT = 'https://api.start.gg/gql/alpha';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(label, query, variables) {
  await sleep(1000);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`\n=== ${label}: HTTP ${res.status}`);
  if (body.errors) console.log('GraphQL errors:', JSON.stringify(body.errors, null, 2).slice(0, 1500));
  if (body.success === false) console.log('Rejected:', body.message);
  if (body.extensions) console.log('extensions:', JSON.stringify(body.extensions).slice(0, 500));
  return body;
}

// Rough object count: every non-null JSON object in the response.
function countObjects(v) {
  if (Array.isArray(v)) return v.reduce((n, x) => n + countObjects(x), 0);
  if (v && typeof v === 'object') return 1 + Object.values(v).reduce((n, x) => n + countObjects(x), 0);
  return 0;
}
const iso = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '—');

(async () => {
  const parsed = parseEventSlug(process.argv[2]);
  if (parsed.error) { console.error('Not an event URL. It must contain /event/.'); process.exit(2); }

  // 1. Resolve the event.
  const ev = await gql('resolve event', `query($slug:String!){ event(slug:$slug){
    id name startAt numEntrants videogame{ id name } } }`, { slug: parsed.slug });
  const e = ev.data && ev.data.event;
  if (!e) { console.error('Event not found or request failed.'); process.exit(1); }
  console.log(`${e.name} | ${e.videogame.name} (game ${e.videogame.id}) | starts ${iso(e.startAt)} | ${e.numEntrants} entrants`);
  const windowStart = e.startAt - 365 * 24 * 3600;

  // 2. Nested entrants -> recentStandings, perPage 5.
  const nested = await gql('entrants + recentStandings (perPage 5)', `query($slug:String!,$gid:ID!){
    event(slug:$slug){ entrants(query:{page:1, perPage:5}){ pageInfo{ total totalPages }
      nodes{ id participants{ player{ id gamerTag prefix user{ id slug }
        recentStandings(videogameId:$gid, limit:20){ placement
          container{ __typename ... on Event{ id slug name startAt numEntrants isOnline tournament{ name } } } } } } } } } }`,
    { slug: parsed.slug, gid: e.videogame.id });
  const nodes = nested.data && nested.data.event && nested.data.event.entrants && nested.data.event.entrants.nodes;
  if (!nodes) { console.log('\nQ-1(a) NESTING: FAILED — see errors above. Fallback: player-rooted aliased query.'); return; }
  const objs = countObjects(nested.data);
  console.log(`\nQ-1(a) NESTING: works. pageInfo=${JSON.stringify(nested.data.event.entrants.pageInfo)}`);
  console.log(`Q-1(b) COST: ~${objs} objects for ${nodes.length} entrants = ~${Math.round(objs / nodes.length)}/entrant -> perPage ≈ ${Math.floor(1000 / (objs / nodes.length))}`);

  let candidate = null;
  for (const n of nodes) for (const p of n.participants) {
    const pl = p.player; const rs = pl.recentStandings || [];
    const types = {}; rs.forEach((s) => { const t = s.container ? s.container.__typename : 'null'; types[t] = (types[t] || 0) + 1; });
    const dates = rs.filter((s) => s.container && s.container.startAt).map((s) => s.container.startAt);
    const inWin = dates.filter((d) => d >= windowStart && d < e.startAt).length;
    console.log(`  ${pl.gamerTag} (player ${pl.id}, user ${pl.user ? pl.user.slug : 'NONE'}): ${rs.length} standings, types ${JSON.stringify(types)}, ` +
      `newest ${iso(Math.max(...dates))}, oldest ${iso(Math.min(...dates))}, in-window ${inWin}, order ${dates.join(',') === [...dates].sort((a, b) => b - a).join(',') ? 'newest-first' : 'NOT sorted desc'}`);
    if (pl.user && (!candidate || rs.length > candidate.n)) candidate = { n: rs.length, player: pl };
  }

  // 3. Full-history path (now the PRIMARY source): user.events, ALL games, 2 years back from now.
  if (!candidate) { console.log('\nQ-1(c) FULL HISTORY: no participant with a linked user in this page; cannot test.'); return; }
  const now = Math.floor(Date.now() / 1000), twoYrs = now - 2 * 365 * 24 * 3600;
  console.log(`\nQ-1(c) FULL HISTORY test on ${candidate.player.gamerTag} (user ${candidate.player.user.id}), window ${iso(twoYrs)}..${iso(now)}`);
  let all = [], total = null;
  for (let page = 1; page <= 3; page++) {
    const bf = await gql(`user.events page ${page} (perPage 50, all games)`, `query($uid:ID!,$page:Int!){ user(id:$uid){
      events(query:{ page:$page, perPage:50 }){ pageInfo{ total totalPages }
        nodes{ id slug name startAt numEntrants isOnline videogame{ id name } tournament{ name }
          userEntrant(userId:$uid){ id standing{ placement } } } } } }`, { uid: candidate.player.user.id, page });
    const evs = bf.data && bf.data.user && bf.data.user.events;
    if (!evs) { console.log('Q-1(c) user.events: FAILED (see errors). Next candidate: player.sets.'); return; }
    if (page === 1) console.log(`  ~${countObjects(bf.data)} objects for ${evs.nodes.length} events on page 1; pageInfo=${JSON.stringify(evs.pageInfo)}`);
    total = evs.pageInfo.total; all = all.concat(evs.nodes);
    const oldest = Math.min(...evs.nodes.map((x) => x.startAt || now));
    if (page >= evs.pageInfo.totalPages || oldest < twoYrs) break;
  }
  const sorted = all.map((x) => x.startAt).join(',') === all.map((x) => x.startAt).sort((a, b) => b - a).join(',');
  const inWin = all.filter((x) => x.startAt >= twoYrs && x.startAt <= now);
  const withPl = inWin.filter((x) => x.userEntrant && x.userEntrant.standing && x.userEntrant.standing.placement != null);
  const games = {}; inWin.forEach((x) => { const g = x.videogame ? x.videogame.name : '?'; games[g] = (games[g] || 0) + 1; });
  console.log(`  fetched ${all.length} of ${total} lifetime events; order ${sorted ? 'newest-first' : 'NOT sorted desc'}`);
  console.log(`  last 2 yrs: ${inWin.length} events, ${withPl.length} with a placement; by game ${JSON.stringify(games)}`);
  console.log(`  vs recentStandings (this game only, cap 20): ${candidate.n}`);
  console.log(`  sample: ${JSON.stringify(withPl.slice(0, 3).map((x) => ({ d: iso(x.startAt), ev: x.name, t: x.tournament && x.tournament.name, g: x.videogame && x.videogame.name, n: x.numEntrants, p: x.userEntrant.standing.placement })))}`);
})().catch((err) => { console.error('Probe crashed:', err.message); process.exit(1); });
```

Two observations about the probe that bear on this build, labelled *(Interpretation)*. The probe
stopped at 3 pages (150 of 418 events), so "150/150 in window" says nothing about events past
page 3. That's why this build pages every user to the last page. And its "2 years" was
`2 × 365` days, where the design's window is 730 days, which is the same span.

### Acceptance status

Verification scale (persona directive 13): **9–10** verified by running it, with the command
below · **7–8** strong pattern match, unrun · **PARKED** needs the token.

| # | Item | Status | Level | Evidence |
|---|---|---|---|---|
| 1 | Tests pass on a clean clone, offline, fixtures; pure logic covered | **PASS (offline)**. Recorded-fixture leg PARKED | 9 | `git clone -b build/v1 <repo> <scratch>/clean-clone` then `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` → `tests 66 · pass 63 · fail 0 · skipped 3` (commit `83db824`). The blocker was confirmed to block before use (fetch and `net.connect` both throw "NETWORK BLOCKED"). Coverage: window `history.test.js`; status rule `history.test.js`; team split `history.test.js`; CSV BOM/quoting/`= + - @` `output.test.js` and `run.test.js`; slug `slug.test.js`; pacing `pacing.test.js` and `client.test.js`; retry classification `classify.test.js`. **Caveat:** 3 of the fixtures are synthetic (shaped from the queries and the probe). The 3 skipped tests run over *recorded* responses once `node scripts/record-fixtures.js` runs with a token. They are not skipped to make anything pass. They have no data yet. **Mutation check:** 7 load-bearing lines broken one at a time, and each made the suite fail (pacing cap 75→90: 5 fails; BOM removed: 2; window edge `>=`→`>`: 2; resume skip removed: 2; rate-limit check removed: 4; region dropped: 2; schema error made non-fatal: 1). |
| 2 | Token from env or `.env`; `.env.example` committed; missing/bad → message, exit 2, no folder, no retry; no token in history or outputs | **PASS** offline + live bad-token. Live-output grep PARKED | 9 | Offline: `test/token.test.js`, `test/cli.test.js` (missing and blank → exit 2, no `out/`), `test/run.test.js` (recorded 400 body → exit 2, no folder, **1 request**). Live: `STARTGG_TOKEN=deliberately-bogus-… node --require <scratch>/count-fetch.cjs pull.js <CB URL>` → "start.gg rejected the token…", `[count-fetch] requests=1 statuses=400`, `exit=2`, "no out/ folder". History: `git log -p --all` has no `Bearer <literal>` and no `STARTGG_TOKEN=<value>` except test literals (`from-file`, `abc123`, blank). `.env` untracked (`git ls-files .env` → 0), still 0 chars, mtime unchanged. Outputs: a sentinel token is absent from every file a fake run writes (`run.test.js`). **PARKED:** `grep -rlF "$STARTGG_TOKEN" out/` on the live run folder. |
| 3 | Live unattended run on Combo Breaker 2026 MBAACC, three files per design (incl. region) | **PARKED: waiting on Noah's token paste** | — | Command: `node pull.js https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code`. Offline equivalent passes (`run.test.js` "full fake run…"; column order asserted against design). |
| 4 | Reconciliation by committed script (incl. region coverage) | Script built and passing offline. **Live PARKED** | 9 offline | `scripts/reconcile.js <run>`: 17 checks (row counts, per-player `result_count`, totals vs meta, status counts, region coverage vs meta, blank region for no-account players, window, duplicates, `is_event_game`). `--live` re-counts participants with its own query. Every fake run in `run.test.js` asserts zero failed checks. Fake run output inspected by eye as well: `node testlib/fake-pull.js <dir> 1791817200000 1791817200000` then `node scripts/reconcile.js <run>` → "all 17 checks passed", `query_complexity_max 842`. Live command: `node scripts/reconcile.js out/<run> --live`. |
| 5 | Ground truth: independent GeneralMidwest count + 3 random rows | Script built. **PARKED** | 7 (unrun) | `scripts/ground-truth.js out/<run>` uses its own `user.events` loop at perPage 50, its own window read from `meta.json`, and `event(id){userEntrant(userId)}` re-fetches. Never run. |
| 6 | Request log: no 60 s window > 80; backoff exercised | Backoff **PASS** (test). Live log **PARKED** | 9 / — | `run.test.js` "backoff is exercised…": 2 × 429 → `checkRequests.backoffs = 2`, `meta.retries = 2`, max window ≤ 75. `client.test.js`: 200 bursty sends with retries → `maxInAnyWindow ≤ 75`. Live: `node scripts/check-requests.js out/<run>`. |
| 7 | Resume after a kill with ≥ 10 checkpointed; no refetch; matches clean run | **PASS (fake API, real SIGKILL)**. Live **PARKED** | 9 offline | `run.test.js` "kill + resume": child process SIGKILLs itself on the 14th `UserEvents` call → 13 players checkpointed → `--resume` → stderr "Resuming: 13 of 15…", `checkRequests.refetched = []`, session 2 fetched exactly 2 players, player set and per-player counts equal to a clean run. Live recipe: start the live run, Ctrl+C after the stderr shows player ≥ 11, then `node pull.js --resume out/<run>` and `node scripts/check-requests.js out/<run>`. |
| 8 | Killed run leaves no `players.csv`/`results.csv`/`meta.json` | **PASS (real SIGKILL)** | 9 | Same test: `outputsPresent(runDir)` → `[]` after the kill. Also a schema error mid-run → no outputs (`run.test.js`). Residual risk: E9. |
| 9 | No-account players → `limited` | **PASS (fixture)**. Whether the live event has any: **PARKED** | 9 offline | `run.test.js` "a no-account registrant is limited…": `history_status = limited`, blank `user_slug`/region, one `RecentStandings` call with the event's game id, non-Event container counted. **Gap:** the any-game call is gated off pending the schema check (E8). |
| 10 | README | **Written** | 8 | `README.md`: Node version, pasting the token into `.env`, run, resume, each output file, exit codes, check scripts, "hand this to Claude" block. A cold-reader test is for Pass 2/4. |
| 11 | Reuse review | **Done** | 9 | Section above. Credits in `lib/startgg.js`, `test/slug.test.js`, `test/classify.test.js`, `test/fixtures/README.md`. |
| 12 | Closing approval by Pass 4 | Not this seat's | — | — |

**Region (amendment):** the query requests `location{state country}` and never `city` (asserted
in `client.test.js`). Columns and `region_coverage` are tested with a hidden location, a
country-only location, and no account (`run.test.js`, `history.test.js`). **Whether start.gg
returns other users' locations on a personal token: PARKED.** The live run's
`meta.region_coverage` is the observation. Record it here when it runs.

**Design "to check" items: both PARKED.** These are `recentStandings(videogameId)` optionality and
the `UserEventsPaginationQuery.filter` date options. `node scripts/schema-check.js --user <id>`
answers both and measures real `UserEvents` complexity at perPage 120. Until then, the build pages
everything (the design's stated default) and calls the event game only for guests.

### REPORT

```
REPORT
- Overview: Built seeding-script v1 to docs/design.md, including Noah's mid-pass region
  amendment. Every offline acceptance leg passes on a clean clone with the network blocked:
  63 tests pass, 0 fail, 3 wait on recorded fixtures. A live bad-token check confirmed
  exit 2, one request, no folder. .env is still blank, so the live run and its checks
  (items 3-7, the live legs of 2/4/9, region coverage, the two schema to-checks) are
  PARKED with exact commands ready.
- Found: (1) The design needs "retry 5xx, stop on schema error"; startgg-results'
  classifyError can't tell them apart, so it was adapted (GraphQL path rule). (2) The
  recentStandings any-game call is unsafe until videogameId optionality is confirmed, so
  it's gated off. (3) Writing three files can't be fully atomic on Windows; meta.json is
  renamed last and serves as the marker. (4) The probe paged only 3 of 418 events for
  its user, so its 150/150 says nothing past page 3; this build pages to the end.
- Ran: commits 8164bd4 (scaffold), 7c2e18a (modules + unit tests), 83db824 (integration,
  kill/resume, scripts, README), plus this record's commit. Clean-clone offline suite;
  7-line mutation check; 2 live requests with a bogus token.
- Attributed: core / seeding-script v1 (STATED: dispatch contract).
- Queued: nothing beyond the parked live work. Pass 2 should look first at A1 (userEntrant
  null kept), E2 (error classes), E8 (fallback gated) and E10 (formula characters).
- Spend: Term = Acceptance list, pass 1 of 4. Consumed: 1 pass, 2 live start.gg requests
  (bogus token), no subagents, no dependencies. Ceiling not reached.
- Parked: Live checks, waiting on Noah's token paste in .env. Resume in this order:
    node scripts/schema-check.js                 (to-checks; then set ALL_GAMES_FALLBACK)
    node scripts/record-fixtures.js              (un-skips 3 tests; commit test/fixtures/recorded/)
    node pull.js https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code
    node scripts/reconcile.js out/<run> --live
    node scripts/check-requests.js out/<run>
    node scripts/ground-truth.js out/<run>
    grep -rlF "$STARTGG_TOKEN" out/ ; git log -p | grep -cF "$STARTGG_TOKEN"   (expect nothing / 0)
    kill-and-resume: rerun pull.js, Ctrl+C after player 11+, node pull.js --resume out/<run>,
    then check-requests.js on that folder and compare reconcile output to the clean run.
  Then record region_coverage, query_complexity_max and the guest count in this file.
- Needs attention: (1) Paste the token into .env (only Noah). (2) E10: tags starting with
  = + - @ are written verbatim per "as on start.gg". If Noah opens the CSVs in a
  spreadsheet, does he want a ' prefix instead? (3) A1: if the live data shows
  userEntrant:null events are ones the player never entered, drop and count them.
```

---

## Out-of-band addition — launcher (orchestrating session, 2026-10-12, between passes 1 and 2)

**Ask (Noah, chat):** "make an easy handle to run the script. and create readme for this. smooth ux
for me still so i can reuse for 3 brackets this week."

**Not a pass seat.** Written by the session that issued the contract, outside the pass table, so
**pass 2 must audit it like pass-1 code**. Scope kept to UX. No fetch logic was added and `pull.js`
is unchanged.

| Added | What |
|---|---|
| `seed.js` | Launcher. Takes event links as arguments, or prompts for several, one per line. Runs `pull.js` once per link in sequence. **Auto-resumes** the newest unfinished run (has `_work/run.json`, no `meta.json`) of the same event if any `_work/` file changed in the last 24 h. Writes `claude-prompt.txt` from `meta.json` into each finished run folder. Opens the run folder in Explorer, or `out/` if there were several. On a blank token, opens `.env` in Notepad and exits 2. `SEED_NO_OPEN=1` turns off the opening. |
| `seed.cmd` | The double-click wrapper (`cd` to the repo, `node seed.js`, `pause`). `.gitattributes` gains `*.cmd text eol=crlf`. |
| `package.json` | `npm run seed`. |
| `test/seed.test.js` | 5 tests: the folder prefix matches `runFolderName`; the resume pick (newest unfinished; never a finished, stale, non-resumable or other-event run); the prompt file is written only for finished runs; no token → exit 2 with no `out/`. |
| `README.md` | A "Quick start (seeding a bracket)" section at the top. The pass-1 content is kept under "Reference", plus a `seed.js` line in "Code layout". |

**Evidence:** `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` → 71 tests, 68 pass,
0 fail, 3 skipped (the same 3 parked fixture tests). Offline smoke test: piping two non-event links
into the prompt → both skipped with a reason, "Nothing to pull.", exit 2, no `out/`.

**Assumptions supplied (amendable):** a 24 h auto-resume window, after which a fresh run starts.
An unfinished run is resumed silently, with the folder named in the header line, rather than asking
first.

**Not verified:** the launcher end to end against live start.gg. That's parked with the other live
checks until the token is pasted. Double-click behavior was not exercised; only `node seed.js` was.
