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

---

## Out-of-band addition — seeding views (orchestrating session, 2026-10-13)

**Ask (Noah, chat), while seeding Crescendo of Night 3 Ep. 0:** a browser table with columns for
CEO, Evo, Combo Breaker, Frosty Faustings and Climax of Night, plus Boston Blue Beat best placement
and best and average W-L, plus other results.

**Scope: view logic, outside the pull.** `pull.js`, `lib/` and the tests are unchanged.

| Added | What |
|---|---|
| `views/major-table.js` | Reads one finished run folder → `<run>/views/major-table.html`. Major columns use this game only, with main bracket = largest field. **Fetches sets** for Boston Blue Beat W-L through `lib/startgg.createClient` (paced, retried), cached in `<run>/views/bbb-records.json`. The DQ rule is copied from `startgg-results/core.js` `tallyRecords`. Uses `Event.userEntrant(userId).paginatedSets`, verified live on this run: 33 lookups, every one returned sets. |
| `views/serve.js` | A read-only static server for `out/` on 127.0.0.1:8765, with an index of run folders that have views. |

**Not tested in the suite.** These are Claude-side views and change per request. Correctness was
checked by hand on the live run: every rendered cell was compared with `results.csv`, and the W-L
totals are consistent with the placements (e.g. 0-2 at 17th-25th finishes; 5-0 at a 1st place).
Pass 2 may rule on whether views need tests.

---

## Pass 2 — engineering auditor (increment 1's audit, run with build B)

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block). Model: Opus. Date 2026-10-29. Report-only. Increment 1's passes 2–4 never ran; this pass
is its pass 2, run inside increment 3 build B's pass 2 as `docs/dispatch-contract-tool-b.md` Acceptance
14 requires. Build B's pass 3 repairs these findings along with build B's own, and build B's pass 4
re-reviews them. Repo `seeding-ops` (renamed from `seeding-script`), branch `build/tool-b` at `ff56191`.
No start.gg calls; the token was never read; `out/` was read only. The shared re-runs (suite, hashes,
probes) are listed in `docs/build-record-tool.md` § "Build B — Pass 2 — engineering auditor" and are not
repeated here.

### Terms as understood

- **Comparand:** `docs/dispatch-contract.md` Acceptance 1–12 and `docs/design.md` with its Amendment log,
  **as amended by `docs/design-tool.md` §T2**: one pull per tournament into `out/<t>/pull-<stamp>/`, the
  `current` pointer, `is_event_game` dropped, an `events` column, the union of registrants, the W-L
  cache outside the pull folder, Refresh carrying it. Where the amendment makes an increment 1 item
  meaningless (the per-event folder), I say so and do not fail it.
- **Code reviewed:** `lib/run.js`, `lib/output.js`, `lib/history.js`, `lib/startgg.js`, `lib/pacing.js`,
  `lib/token.js`, `lib/pool.js`, `pull.js`, `seed.js`, `scripts/reconcile.js`,
  `scripts/check-requests.js`, `scripts/ground-truth.js`, `testlib/fake-api.js`,
  `testlib/no-network.js`, as they stand at `8773dd1`, after increment 2's changes and build B's.
- **Not mine to rule:** A4-3 (time-budget error fails one player vs stops the pull), which is Noah's
  open ruling; the code keeps the default, pinned by `test/run.test.js`. A2-6 (formula characters in
  Sheets), Noah's.
- **Pass 1's questions for pass 2:** A1, E2, E8 and E10, the launcher (`seed.js`) and the views. Each is
  answered below.

### Acceptance (increment 1's list, under the amendment)

| # | item | status | evidence |
|---|---|---|---|
| 1 | tests on a clean clone, offline, recorded fixtures; pure logic covered | **met offline; recorded-fixture leg open** | 207/204/0/3 offline at `ff56191`. Window, status rule, team split, CSV (BOM, quoting, `= + - @`), slug, pacing, classification all have tests (`history`, `output`, `slug`, `pacing`, `client`, `classify`). The 3 `recorded:` tests are still skipped since 2026-10-12 (C2-1) |
| 2 | token from env/`.env`; `.env.example`; missing/bad → exit 2, no folder, no retry; no token in history or outputs | **met, value check not done** | `lib/token.js`; `.env.example` tracked; `.env` ignored and never committed; tests in `token`, `cli`, `run`. History scanned by pattern only (I did not read the token) |
| 3 | live unattended run of Combo Breaker 2026 MBAACC into a per-event folder | **no longer meaningful as written** | the per-event folder is retired (§T2). The equivalent is build B's live pool pull of CoN3 Ep0: exit 0, 47 requests, 24 players, 2,192 rows, files per §T2; I re-ran `reconcile.js` on it (18/18). Combo Breaker 2026 itself was never pulled |
| 4 | reconciliation by a committed script | **met offline; live leg open** | `scripts/reconcile.js`, 18 checks, retargeted to the pool; 18/18 on the live pool. `--live` never run (C2-2); its retargeted check leans on the pull's own counts (C2-4) |
| 5 | ground truth: GeneralMidwest independent count + 3 rows | **open** | `scripts/ground-truth.js` still fits the layout (it reads `meta.window`), never run (C2-2) |
| 6 | request log: no 60 s window over 80; backoff exercised | **met** | backoff test in `run.test.js`. `scripts/check-requests.js`, run read-only on the six old runs' pull logs, peaks at 52 per 60 s (Eclipse, 278 sends). The live pool peaks at 21 by its log and 20 by actual sends. The W-L logs are outside this script. The log's stamps are taken before an outer limiter's wait (C2-5) |
| 7 | resume after a live kill, no refetch, matches a clean run | **met offline; live leg open** | `test/pool.test.js` "a crash mid-pull …" (real SIGKILL, `refetched = []`, swap after resume); `test/run.test.js` "kill + resume". Live kill never run (C2-2) |
| 8 | a killed run leaves no final files | **met, and stronger now** | the crash test asserts `outputsPresent = []`. E9's residual (a kill between the three renames) no longer reaches a reader: `current` moves only to a pull with `meta.json`, and an unfinished pull is resumed and rewrites all three |
| 9 | no-account players → `limited` | **met (fixture); live never observed** | `run.test.js` and the fake world's guest (`RecentStandings` per entered game, in build B for every game the player's events have). 0 limited players in all six old runs and the live pool. `ALL_GAMES_FALLBACK` still off (C2-3) |
| 10 | README | **met** | rewritten in build B: setup, token, run, resume, outputs, check scripts, "Hand this to Claude" |
| 11 | reuse review | **met** | pass 1's section; credits present in `lib/startgg.js` (`parseEventSlug` copied verbatim, `classifyError` adapted) |
| 12 | closing approval | — | build B's pass 4 |

Region (the 2026-10-12 amendment): pass 1 left open whether start.gg returns other users' locations on
a personal token. The live pool answers it: of 24 players, 17 have a state, 22 have a country and 2 have
neither (`meta.region_coverage`, reconciled). `city` is never requested (`Q_ENTRANTS`).

### Findings

**C2-1 — FINDING, routed (needs a live allowance) — the recorded fixtures were never recorded.**
Acceptance 1 says "using recorded fixtures". `scripts/record-fixtures.js` was parked on 2026-10-12 waiting
for the token. The token has been in use since the 2026-10-13 live runs, but the script was never run, so
the three `recorded:` tests have been skipped through three increments. The suite's picture of start.gg
is the hand-built fake (C2-8). **Resolves:** run `node scripts/record-fixtures.js` (a few read-only
requests) and commit `test/fixtures/recorded/`. This needs a live allowance, which build B's contract
gave only to pass 1, so it goes to the caller.

**C2-2 — FINDING, routed (needs a live allowance) — increment 1's live acceptance legs were never
closed.** Pass 1 parked them with exact commands, and nobody resumed them: Acceptance 5 (ground truth),
4's `--live` leg, 7's live kill-and-resume, and 2's value grep of the outputs. They are cheap: about 15
read-only requests against a past tournament and GeneralMidwest's history. **Resolves:** a live
allowance for build B's pass 3 or the orchestrator, then record the results here.

**C2-3 — NOTE, part of C2-2's allowance — the design's two "to check" items are still open (E8).** Is
`recentStandings`' `videogameId` optional, and does `user.events` take a date filter? Until
`scripts/schema-check.js` runs, a no-account player gets only the seeded games' last 20 results, never
other games, and every user is paged to the end. The impact so far is nil (0 guests in any live data),
and paging everything is the design's stated default.

**C2-4 — NOTE — the reconcile script's live check is no longer fully independent.** For a pool,
`--live` now expects `fresh participants − duplicate_player − no_player − cross_event_repeats`, with the
three subtractions taken from the pull's own `meta.json`. With a union of events, the literal "row count
equals the participant count" cannot hold, so some change was needed. As written, though, the check
trusts the pull for the very counts it should test. **Resolves:** have `--live` count distinct player
ids across the fresh entrant pages itself.

**C2-5 — NOTE — the request log stamps a send before an outer limiter's wait.** `lib/startgg.js` stamps
`ms` when the client decides to send. Under the app's queue (or a script's limiter) the real send can be
later. In the live pool's log, 21 stamps fall in one 60 s window, while the actual sends in that window
were 20. `scripts/check-requests.js`, the Acceptance 6 instrument, therefore overstates. That direction
is safe, but the instrument is inexact. **Resolves:** log the dispatch time the queue reports, or say in
the script that the count is an upper bound.

**C2-6 — NOTE — pass 1's open questions, settled where evidence now exists.**
- **A1** (`userEntrant: null` kept as a blank-placement row): keep. Live data shows 8 such rows of
  2,192 in the CoN3 pool and 38 of 10,154 in the Eclipse run, all on past events, mostly ladders. Nothing
  suggests they are events the player never entered.
- **E7** (`user.events` perPage 120): the live complexity maximum is 841 (CoN3 pool), under 1,000.
  Holds.
- **E2/E3** (error classes; rate-limit text checked first): the structure holds. Increment 2 added the
  time-budget kind from a live observation (A2-2). The rate-limit message text itself is still model
  knowledge.
- **E9:** closed for readers by the `current` pointer (Acceptance 8 above).
- **E10:** Noah's open A2-6. The pull's CSVs stay verbatim, as the design says; the Sheets export guards
  them.

**C2-7 — FINDING (cross-reference D2-2) — an incremental or retry pull's `meta.json` drops the skip
counts of carried players.** The rule broken is this design's ("Nothing is dropped without being
counted"), so it is listed here as well. Evidence and resolution are under D2-2 in
`docs/build-record-tool.md`.

**C2-8 — NOTE — the offline harness has limits worth knowing.** `testlib/no-network.js` blocks
`fetch`, `net` and `tls` (it holds). The fake start.gg (`testlib/fake-api.js`) is hand-shaped from the
queries and ignores `AbortSignal`, so it cannot show timing faults such as D2-3. Until C2-1 lands, the
fake's fidelity limits what the suite can prove. Pass 1's other questions: the launcher was rewritten in
build B (pull folders, grouping links by tournament, the 24 h resume kept, tests retargeted), and the
views now have tests (`test/wl.test.js` runs `views/major-table.js` end to end; the parity test pins its
cells). `views/serve.js` no longer exists.

### Verdict

**APPROVE WITH FINDINGS for the pull's code against `design.md` as amended. The increment's live
acceptance legs are not closed.** The pull is reliable on every point the suite and the files can show:
the token handling, pacing and retries, resume without refetching, no fake-complete output (now with the
`current` swap), region, reconciliation, and the per-event layout's replacement by the pool. What it
cannot claim yet is the independent live evidence increment 1's contract asked for (C2-1, C2-2). That
needs a small live allowance, which is the caller's to grant. C2-7 is the one code defect, shared with
build B as D2-2. It covers the code, tests, scripts and the live artifacts on disk. It could not judge
start.gg's live behavior for the parked checks.

---

## Pass 3 — lead engineer (increment 1's live legs, run with build B)

Seat: lead-engineer persona v0.4.0, run inside increment 3 build B's pass 3 (repair). That pass's full
record, with the dispositions of C2-1..C2-8 next to D2-1..D2-13, is `docs/build-record-tool.md` §"Build B
— Pass 3 — lead engineer (repair)". Date 2026-10-29. Branch `build/tool-b`.

**Allowance used** (the orchestrator's ruling for build B pass 3): at most 20 read-only start.gg requests,
never more than 10 in any rolling 60 s, one client in one process, against
`crescendo-of-night-3-episode-0` and GeneralMidwest (`user/14364d39`). **Used: 16 requests, all HTTP 200,
max 10 in any rolling 60 s**, 2026-10-29 16:19:27Z–16:20:29Z. Every send is logged (time, operation,
variables, status) in the session scratchpad's `p3/live-sends-pass3.jsonl`. The harness
(`p3/live-pass3.js`) refused any mutation, stopped at 20 and was dry-run first against the fake. The token
was loaded by `lib/token` inside the process and never printed.

**Instruments** (commit `0bbe247`): `scripts/record-fixtures.js`, `scripts/ground-truth.js` and
`scripts/reconcile.js`'s `--live` checks now take one client, so one process runs them all.
`scripts/token-absent.js` (new) is the by-value token check. Each is tested offline in
`test/live-instruments.test.js`, against the fake start.gg answering their own queries.

| id | leg (increment 1's acceptance) | result | evidence |
|---|---|---|---|
| **C3-1** | 1, the recorded fixtures (C2-1) | **Met.** 4 requests: `event.json`, `entrants-page.json` (CoN3 Ep0 `allegro-mbtl-pc`, 10 of 21 entrants), `user-events-page.json` (GeneralMidwest, 10 of 428 events), `recent-standings.json` (CoN3 entrant player 2282067, MBTL). `test/recorded-shape.test.js`: **3 run, 3 pass, 0 skipped** (they had been skipped since 2026-10-12). | commit `a8c1422`; files in `test/fixtures/recorded/` |
| **C3-2** | determinism of C3-1 | **Met.** Each file keeps only `data`, the query variables, `_recorded_on` and `extensions.queryComplexity`. The test anchors its two-year window to `_recorded_on`, so its result does not depend on the day the suite runs. Re-recording changes the files (the players' histories move), which is expected. | `0bbe247` (writer and test), `a8c1422` |
| **C3-3** | 5, ground truth: the independent count (C2-2) | **PASS.** GeneralMidwest (user 302490, player 433798): 428 lifetime events. The pull's own per-player code (`lib/history.collectUserHistory`, perPage 120, 4 pages) kept **334** in the window 2024-10-29..2026-10-29 and skipped 94 out of it. The independent loop (`scripts/ground-truth.js`, its own query, perPage 100, 5 pages) counted **334**, the same event ids. GeneralMidwest is in no pool, so the comparison ran on a one-player run folder written from the pull's per-player code, not on a `lib/run.js` pool. | `p3/live-pass3-result.json`; 5 + 4 requests |
| **C3-4** | 5, ground truth: 3 random rows re-fetched | **Not run.** Each re-fetch is rooted at `event(id:)` of another tournament, outside the allowance's two targets, and the ruling names only "the ground-truth count". The instrument is tested offline: it catches a changed placement and a missing row. | `test/live-instruments.test.js` |
| **C3-5** | 4, the live reconcile `--live` (C2-2) | **PASS, 20 of 20** on build B pass 1's live CoN3 Ep0 pool (`pull-20261029-103426`, a scratch copy). A fresh participant count of both seeded events gives 24 = `api_participants` 24, and players.csv's 24 rows = 24 − 0 − 0 − 0. C2-4 still applies: the subtractions come from the pull's own meta.json (here all 0). | 2 requests |
| **C3-6** | 2, no token in outputs or history, by value (C2-2) | **Met.** `node scripts/token-absent.js` over `out/` (the six old run folders), `test/fixtures/recorded/`, the session scratchpad (the live pool, the live logs, this pass's work) and `git log -p --all`: **987 files, 0 contain the token; 0 hits in history.** | 0 requests |
| **C3-7** | 7, resume after a live kill | **Fake only, as ruled.** "a crash mid-pull leaves the old pull live …" (`test/pool.test.js`, real SIGKILL, `refetched = []`) and "kill + resume" (`test/run.test.js`) pass in the offline suite. | `node --test` 223/223/0/0 |
| **C3-8** | C2-7 (= D2-2): skips of carried players | **Fixed** in build B pass 3 (`b107de8`). An incremental or retry pull's `meta.json` counts every carried player's skips: "Nothing is dropped without being counted" holds again. | tests "D2-2 / D2-13 …", "D2-2: a retry pull …" |

**Not run, still open:** `scripts/schema-check.js` (C2-3, E8). It is not in the allowance's purpose, so
`ALL_GAMES_FALLBACK` stays off and every user is still paged to the end (the design's default). The C2-5
note (request-log stamps before an outer limiter's wait) is unchanged. C2-4, C2-6 and C2-8 are recorded,
with no action, per the ruling.

**Increment 1's acceptance after this pass:** 1 met (offline, and the recorded leg now runs); 2 met
(including the by-value check); 3 superseded by the pool (build B pass 1's live pull); 4 met, live
included; 5 count met, rows not run (C3-4); 6 met; 7 met offline, live leg fake-only by ruling; 8–11 met;
12 is build B's pass 4.
