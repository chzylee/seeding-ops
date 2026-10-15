# Build record — seeding-script webapp (increment 2)

Contract: [`dispatch-contract-webapp.md`](dispatch-contract-webapp.md). Spec: [`design-webapp.md`](design-webapp.md)
(including Amendment A1). One section per pass.

**Increment 1's passes 2–4 are still open** ([`build-record.md`](build-record.md)). They are not this
build's to close.

---

## Pass 1 — lead engineer

Seat: lead-engineer persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`, Profile block,
loaded in-seat). Model: Opus. Branch `build/webapp` from `c2bc866`. Local commits only, no push.

### Terms as understood

- **Acceptance criteria:** the contract's list, items 1–12, plus A1 folded in as **6b** (freeze
  columns) and **11b** (Google Sheets export), per the coordinator's mid-pass message.
- **Ratified increment:** `docs/design-webapp.md` as approved 2026-10-15, plus Amendment A1 (freeze
  columns, export). Tiers are the next increment: not built. The data layer must not block a
  `registry/` tiers table keyed by `player_id`.
- **Binding display rules:** the four rows marked Ratified in `docs/usage-log.md` → Requirements surfaced.
- **Allowed work:** additive and repair inside `C:\Users\iknow\repos\seeding-script\`, except
  `docs/usage-log.md`, `registry/`, `.env`, increment 1's records, and existing `out/` run folders.
- **Live start.gg budget:** ≤ 20 requests per rolling 60 s, only against the 5-player Andante event.
  The orchestrator is fetching W-L for Noah's large event at the same time with the same token.
- **Outward actions:** none granted. No push.
- **Process:** the contract names it (4 passes). No Ship Pipeline skill was run; Noah's global rules
  require sign-off for skill runs and none was given. The design doc came from the orchestrator and
  Noah, ratified in chat; I did not author it.
- **Grounding not consulted:** the standards bank and the runbook (`personal-staff/personas/grounding/`).
  The runbook is known-stale by its own label, and the contract fixed the process. Rulings below are
  traced to the design doc, the contract, or existing code.

### Assumptions I supplied

1. **"Keep its behavior" covers the per-series `Events` column and the `(N)` counts on the collapsed
   "Every … result (N)" / "Other games (N results)" toggles.** Increment 1's view has both, and the
   same commit that applied the "no aggregate counts" ruling (`ef87262`) added the Events column. So I
   read rule 2 as banning performance tallies (wins, top-3s, result volume as a signal), not the size
   of a series. **This is open.** See Needs attention #1. Dropping them is a three-line change.
2. **A refresh carries `views/notes.json` (seeds and notes) forward** into the new run when the new run
   has none. Without that, seeds would disappear on every refresh. The design names only
   `set-records.json`.
3. **Events both entered are joined on `event_id`** (the bracket), across all games, with the other
   game shown as a tag. Two side brackets of one tournament don't match.
4. **The compare series table shows best placement, best W-L and average W-L per side, without the
   "Each event" list**, so both players fit on screen. The per-event detail is in the events-both-entered
   table and each player's own section.
5. **The export adds two columns the page doesn't show:** `Prefix`, split out of Player, and
   `start.gg player id`, the join key for the next increment's tiers sheet.
6. **The app's start.gg ceiling defaults to 75 per 60 s**, the pull's own pace. It can be lowered with
   `SEED_APP_MAX_PER_MIN`.

### Engineer's-choice rulings

| Ruling | Options considered | Picked, and why |
|---|---|---|
| **`views/major-table.js`** | keep as a thin CLI · retire | **Kept as a thin CLI over the shared modules.** Its output is **byte-identical** to the previous version on all four real run folders (rendered on copies with `--no-fetch`; sha256 `52a39c…dacc` for the largest). It gives a file Noah can keep or send, and it renders from the cache alone. The orchestrator may also be running it today. |
| **`views/serve.js`** | keep · delete | **Deleted.** The design says `app/server.js` replaces it. Note: the shared browser pane showed a tab on `localhost:8766` serving `views/major-table.html`. If that server came from this working tree's `serve.js`, it won't restart. `npm run app` replaces it. |
| **Where the logic lives** | server computes everything · browser computes everything · shared isomorphic modules | **Shared modules** `lib/view/model.js` (logic) and `lib/view/render.js` (HTML and export text), plain UMD files that run in Node and are served to the browser as `/static/model.js` and `/static/render.js`. One source for every cell, so the CLI, the app and the export can't drift. The server builds the run-wide series index once and sends each row's series key, so the browser never rebuilds it (it's the expensive part). |
| **Series index** | keep increment 1's pairwise loop · rewrite | **Rewrote `canonicalKeys` to walk each key's word prefixes**, which is linear instead of quadratic. A test checks it against the old loop, kept verbatim as an oracle, on handwritten cases and 300 random key sets. CLI output is unchanged byte for byte. |
| **Per-player detail** | render all · `<details>` per player · render near the viewport | **Render near the viewport** (IntersectionObserver, 800 px margin), **queued a few per frame** (~12 ms budget). The scroll-down experience Noah likes stays, and no long task builds many sections at once. The collapsed "every result" and "other games" tables render when opened. |
| **Pinned rows** | a separate table · sticky rows in the same table | **Same table:** pinned rows sit in their own `<tbody>` with sticky cells offset under the header. Alignment is automatic because the columns are the same columns. Offsets are floored per row so no sub-pixel gap shows the rows scrolling beneath (found and fixed in the browser). |
| **Freeze columns (A1)** | reorder frozen columns to the left · sticky in place | **Sticky in place.** A frozen column sticks at the left edge plus the widths of the frozen columns before it. Leading columns are fixed from the start; a column frozen further right sticks once it reaches its slot. The compare panel's summary rows get the same offsets and follow the table's sideways scroll. Seed is frozen with Player by default when seeds exist. |
| **Export formula guard (A1)** | leading apostrophe · `="…"` formula wrapper · tell Noah to turn off conversion in the import dialog | **Leading apostrophe** on cells starting with `= + - @`, tab or CR. This is the OWASP CSV-injection convention. The `="…"` wrapper is itself a formula and shows literally if conversion is off. **Unverified in Google Sheets itself.** Model knowledge says Sheets hides the apostrophe and keeps the cell as text, but it hasn't been tried; see the UI checklist. UTF-8 without a BOM (Sheets is the named consumer), CRLF, every field quoted. |
| **Test harness for the server** | real sockets · in-memory handler | **In-memory** (`testlib/inject.js`). `testlib/no-network.js` blocks every connect, loopback included, and acceptance 1 requires it. Binding to 127.0.0.1 is tested with a real listen (listening isn't blocked). |
| **Offline UI testing of Refresh** | spend live budget · fake start.gg in the server process | **`testlib/fake-global-fetch.js`**, a preload that answers `fetch` from the fake world. It lets the orchestrator (and pass 3) click Refresh with no start.gg calls. Command in the UI checklist. |
| **Request accounting** | trust the client logs · record actual sends | **Record actual sends** (`<new run>/views/refresh-sends.json`). The client logs the time it *decided* to send, before the app's limiter waits. Under throttling those logs can show more per 60 s than were really sent (seen offline: 23 logged in a 60 s window at a cap of 20). |
| **POST safety** | none · same-origin header + Host check | Refresh needs an `X-Seeding-App: 1` header (another site's page can't send it without a CORS preflight, which is never answered). A Host other than 127.0.0.1/localhost gets 403 (DNS rebinding). Cheap, and this is the only route that spends API budget. |

### Acceptance status

Commits are on `build/webapp`. "Level" is the persona's verification scale: 9–10 run, 7–8 strong
pattern match without a run, 5–6 caveated.

| # | Item | Status | Evidence | Level |
|---|---|---|---|---|
| 1 | `node --test` passes on a clean clone, offline, no regression | **PASS** | Fresh `git clone --branch build/webapp` into scratch, then `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` → `tests 106 · pass 103 · fail 0 · skipped 3` (final re-run at the closing commit, below). Baseline before the first edit (`c2bc866`): `tests 71 · pass 68 · skipped 3`. All 71 baseline test lines are present with the same status (`comm` of sorted names: no differences). The 3 skips are increment 1's "not recorded yet" fixtures. | 9 |
| 2 | Pure view logic in a module, with the named unit tests | **PASS** | `lib/view/model.js`; `test/view-model.test.js`: Blood Moon LX roman-numeral merge, `<…>`/`{…}`/`(…)` stripping, run-wide key consistency (one series, two players, same key), main bracket = largest field, DQ rule (−1 score counts for neither side, byes skipped), plus W-L tally, stats, column choice, fetch order, events-both-entered join, compare alignment, and canonicalKeys vs the old loop. Mutation check: breaking the DQ rule or the prefix walk fails the matching tests. Commit `e5d74f1`. | 9 |
| 3 | `npm run app` / `app.cmd` on 127.0.0.1:8765; `GET /` lists events; stable URL always shows the latest finished run | **PASS** (app.cmd by inspection only) | `npm run app` → `Seeding app: http://127.0.0.1:8765/`; `netstat` → `TCP 127.0.0.1:8765 … LISTENING`; `curl /` → 3 event links; `/e/…/allegro-mbtl-pc` 200; `/.env` 404. Test "two folders → the newer wins" (plus an unfinished, newer-named folder ignored, and a third pull taking over without a URL change). `app.cmd` was **not run**: it opens the default browser on Noah's desktop. Its body is `node app\server.js --open` (CRLF per `.gitattributes`); `--open` with a busy port opens the existing app instead of failing. Commits `7900f47`, `af2420f`. | 9 (`npm run app`) · 7 (`app.cmd`) |
| 4 | Refresh: new run, merges previous cache, W-L summary-first, returns immediately; status; 2nd → 409; fake test + one live refresh within budget | **PASS** | `test/app.test.js`: 202 before any start.gg answer (gated fake), 409 for a second refresh (same or another event), status `pulling`, the previous run shown while pulling, the new run after, the previous cache merged (a sentinel record carried and not refetched), notes carried, every W-L request in `fetchOrder` order, bad token → error with the old run still shown. **Live (once, Andante only, cap set to 18):** 202 then 409; done in ~12 s; **11 requests** (8 pull + 3 W-L), **max 11 in any 60 s**, all HTTP 200, no retries, token absent from both logs; previous cache 308/308 entries carried; 5 new W-L fetched; notes carried; the page's data switched to the new run `…__20261015-1052`. (The event now has 3 registrants.) | 9 |
| 5 | Data during a W-L fetch returns the partial W-L | **PASS** | Test "data endpoint during a W-L fetch": stall after 2 batches → `known` between 4 and total, the new run already shown; more after release. Real data: the Eclipse page showed W-L known 528, then 700 of 2,107 on later reloads while the orchestrator's fetch wrote the cache (read-only on our side). | 9 |
| 6 | Pin: frozen under the header, aligned, multiple, unpinnable, persisted per event | **PASS** (unpin by code path) | Browser pane, Allegro: pinned Crystal愛 and DubKun → after scrolling, pinned cells at 143/214 px under a header ending at 143.7 (no gap after the fix), same columns; `localStorage["seeding:pins:…/allegro-mbtl-pc"] = ["220599","4168230"]`, restored after a reload. Unpin is the same handler's other branch (row back to its original position by index). Not clicked in the browser: UI checklist. | 9 (pin, persist) · 7 (unpin) |
| 6b | Freeze columns (A1) | **PASS** | Browser pane, Andante: Freeze menu "Through Region" + ❄ on Boston Blue Beat → `seed@0 player@66.9 region@216.9 BBB@340.6`, menu shows "Custom"; scrolled 1000 px sideways, the four columns stay and the rest pass under; the compare panel's summary rows freeze the same columns at the same offsets and follow the scroll; `localStorage["seeding:freeze:…"] = ["seed","region","series:Boston Blue Beat"]`. A gutter that let columns show left of the frozen block was found and fixed (scrollers lost their side padding). Commit `6af434c`. | 9 |
| 7 | Compare split view | **PASS** | Browser pane, Allegro: ⇅ toggles the lower half; type-and-Enter pickers (`cryst` → Crystal愛, `kikoho` → Kikoho; exact tags pick as typed); summary rows aligned to the main columns (column widths copied, sideways scroll synced); events both entered, 46 rows, Event · A placement · W-L · B placement · W-L · Date, with the "not head-to-head sets" note in the bar and above the table; series side by side, 35 rows, 21 shared on one shaded row each. The pair and on/off persist per event (the panel reopened with the pair after a reload). Toggling off is the same handler. UI checklist. | 9 · 7 (toggle off) |
| 8 | All four ratified display rules in every table, compare included | **PASS, under assumption 1** | `test/render.test.js` renders every table (summary, series, every-result, other games, compare summary, events both entered, compare series) and checks: no list markup; no count-type headers or cells; every per-result row = event, `Nth / M`, W-L, date last; every series row = best placement · W-L, best W-L (placement), average only for 2+; compare shared series on one row; export text cells follow the same format. The Events column and toggle counts are kept per assumption 1. | 9 (rules as read) |
| 9 | Performance at 200 × 100: first paint, compare open, scrolling | **MEASURED** | `scripts/synth-run.js` → 200 players, 20,000 results, 11,524 W-L. Server: `/data` 3.58 MB, 196 ms cold / 30 ms warm; export 129 KB in 59 ms. Browser pane: **summary painted 196–217 ms after navigation start** (two loads), one 105 ms long task (hydrate + render). **Compare open (click to painted): 169–175 ms**, one outlier of 821 ms with 161 sections rendered; compare render 99–109 ms. **Scrolling** (page-driven, after the render queue): 300 px/frame through the details, median frame 17 ms, p95 42 ms, 1 long task (54 ms) in 150 frames. Deep in the page with 161 sections rendered, frames are ~48 ms even when nothing re-renders, but long-animation-frame entries show no script and ≤ 3 long tasks per 60 frames, which points to raster in this embedded browser, not a main-thread freeze. Before the queue, a fast scroll built sections in 50–234 ms tasks. Real data: Eclipse (182 players, 10,154 results) summary painted 115 ms after fetch start, `/data` 1.8 MB, 142 ms cold / 20–45 ms warm; Allegro 37–115 ms. | 9 (numbers as measured in the embedded pane; a desktop Chrome may differ) |
| 10 | `.env` never served; outside paths 404 | **PASS** | Test probes 23 paths (`/.env`, `/static/../.env`, `%2f`/`%2e` encodings, `/static/server.js`, `/package.json`, `/out/…`, `//.env`-style URLs, …) → all 404, no token text; foreign Host → 403. It found a real bug: a path starting `//` was parsed as a host (fixed in `af2420f`). | 9 |
| 11 | README "App" section at the top of Quick start | **PASS** | `README.md` → Quick start → "App: the seeding table in your browser" (start, stable URL, refresh, pin, freeze, compare, export, the request cap); code layout extended. Commit `db81827`. | 9 |
| 11b | Download for Google Sheets (A1) | **PASS** (Sheets import itself unverified) | `test/export.test.js`: guard cases (`=SUM(1,2)` → `'=SUM(1,2)`, `+P`, `-x`, `@Kid`, tab; `a=b` and `3` unchanged); round trip through the CSV parser; endpoint → `text/csv`, attachment filename, one row per player, the fake world's `=SUM(1,2) "the" @Kid, -x` tag guarded. Real data via curl: header `Seed, Player, Prefix, Region, CEO, …, Notes, start.gg player id`; first row `"9th / 196 · 4-2 ('26); 3rd / 152 · 6-2 ('25)"`, matching A1's example. Importing into Google Sheets was not done (Noah's account). | 9 (file) · 5 (how Sheets reads the apostrophe) |
| 12 | Closing approval by pass 4 | **QUEUED** | Not this pass's to give. | — |

### UI checklist (for the orchestrating session's browser check)

Start the app on real data with `npm run app` and open <http://127.0.0.1:8765/>. Use Refresh **only**
offline (below) unless the live budget allows it.

1. **Index:** one entry per event, each linking `/e/<t>/<e>`; Andante shows the 2026-10-15 pull.
2. **Stable URL:** open an event, reload. Same URL, latest run (the header shows "pulled …").
3. **Pin:** 📌 two rows. They move under the header, aligned to the columns, and stay while the table
   scrolls. No strip of scrolled rows shows between them. Click 📌 on a pinned row: it goes back to its
   alphabetical/seed position. Reload: pins are kept. Clear site data: page still works.
4. **Freeze:** Freeze menu → "Through Region", scroll sideways: Seed/Player/Region stay. ❄ on a series
   header: that column sticks once it reaches the frozen block. Nothing shows left of the frozen block.
   ❄ again unfreezes. Reload: kept.
5. **Compare:** ⇅ Compare. The lower half opens and the table keeps scrolling above. Type part of a tag
   + Enter in A and B. Check that the summary rows line up with the main columns (and with frozen
   columns while scrolled sideways), the events both entered with each player's placement · W-L, and
   the series side by side with shared ones on one shaded row. Look for "not head-to-head sets". ⇄ swaps.
   Close / ⇅ restores the full-height table. Reload: the pair and panel state are kept.
6. **Player detail:** click a player name. It scrolls to their section, which shows a series table;
   "Every … result" opens to a sortable table; header clicks sort.
7. **Smooth scrolling:** on Eclipse, scroll the summary and the details quickly, with no visible
   freezes. For a worst case: `node scripts/synth-run.js <scratch>` then
   `node app/server.js --port 8791 --out <scratch>`.
8. **Export:** "Download for Google Sheets" downloads `<tournament>-<event>-seeding-<stamp>.csv`. Import
   into Sheets (File → Import → Upload → Replace current sheet). Cells read on one line. **Check a cell
   that starts with `'=`/`'-`**: if the apostrophe shows as a visible character, the guard choice
   needs revisiting. In the synthetic run, player `=SUM(7)` is one; on real data, look for any tag
   starting with `-` or `@`.
9. **Refresh, offline (no start.gg calls):** in a scratch folder,
   `NODE_OPTIONS="--require ./testlib/no-network.js" node testlib/fake-pull.js <scratch> <ms> <ms>`
   (ms = now − 3 h), then
   `SEED_APP_MAX_PER_MIN=20 STARTGG_TOKEN=fake FAKE_WORLD_AT=<ms> NODE_OPTIONS="--require ./testlib/no-network.js --require ./testlib/fake-global-fetch.js" node app/server.js --port 8799 --out <scratch>`.
   Click Refresh. The status shows "Pulling…", then "W-L n / 82 (summary …)", and the page switches to
   the new run by itself. "Show W-L so far" appears during the fetch. A second Refresh while running
   says one is already running. On my run (background tab, so timers were throttled) it went
   Pulling → new run shown at 8 s → W-L 4, 12, 52, 60 / 82 → done and reloaded once at 126 s.
10. **app.cmd:** double-click. The console window starts the server and the default browser opens the
    index. Double-clicking again while it runs just opens the browser.

### Findings and queue

- **Q1 (needs a ruling):** the `Events` column and the toggle counts against "no aggregate counts".
  Assumption 1.
- **Q2:** a carried-forward W-L record never refreshes. If the previous pull happened while an event
  was still running, its W-L stays partial in every later run. Possible fix: don't carry records for
  events dated within a few days of the previous `run_at`. Not in the design.
- **Q3:** there's no way to fetch missing W-L for an existing run without a full re-pull, for example
  after the server stops mid-fetch or for a run made by `seed.cmd`. `views/major-table.js <run>` still
  does it. Not in the design.
- **Q4:** the client request logs (`_work/requests.jsonl`, `views/wl-requests.jsonl`) record decision
  times, not send times, when the app's limiter is throttling. Actual sends are in `refresh-sends.json`.
  `scripts/check-requests.js` reads the former.
- **Q5:** the coordinator's uncommitted edits to `docs/design-webapp.md`, `docs/dispatch-contract-webapp.md`
  and `docs/usage-log.md` are in the working tree. I left them uncommitted; they're not mine.
- **Q6:** the browser pane is shared with the orchestrating session. I stopped using it once its tab
  came to the front, so the last compare-open timings came from a hidden tab and are not recorded as
  evidence.

### REPORT

```
REPORT
- Overview: The local seeding app is built on build/webapp (9 commits, e5d74f1..5366faf). npm run app
  serves one stable page per event that always shows the latest finished pull, with pin, freeze
  columns (A1), a compare split view, Refresh (background re-pull + W-L, summary first, 409 while one
  runs) and a Google Sheets CSV export (A1). Logic and cells live in shared modules, and
  views/major-table.js stays as a thin CLI whose output is byte-identical to before on all four real
  runs. Offline suite on a clean clone: 106 tests, 103 pass, 3 skipped (increment 1's), 0 fail.
  One live refresh of Andante: 11 requests, max 11 in any 60 s.
- Found: 12 acceptance items + A1's 6b/11b. All built. Item 12 belongs to pass 4. One ruling needed
  (Q1). Two out-of-design gaps queued (Q2 stale carried W-L, Q3 no W-L-only fetch).
- Ran: lib/view/{model,render,data,export}.js, lib/wl.js, app/{server,jobs,limit-fetch}.js,
  app/public/{event.html,app.css,app.js}, app.cmd, npm run app, scripts/synth-run.js, tests
  (view-model, render, wl, app, export; testlib inject + fake-global-fetch + fake sets), README.
  views/serve.js deleted (replaced). Evidence: the acceptance table above; commits e5d74f1, 7900f47,
  af2420f, 71ab6ac, 6af434c, a75d2cb, db81827, 5366faf, and this record's commit.
- Attributed: core / seeding-script webapp increment. STATED (dispatch contract + design-webapp.md + A1).
- Queued: Q1 Events column / toggle counts vs "no aggregate counts" (uncertainty: rule wording vs
  kept behavior); Q2 carried W-L never refreshes for an event in progress at the previous pull
  (impact, out of scope); Q3 no W-L-only fetch for an existing run (out of scope); Sheets'
  handling of the leading apostrophe is unverified (needs an import in Noah's account); app.cmd not
  run (it opens the desktop browser); unpin and compare toggle-off checked by code path, not clicked.
- Spend: live start.gg 11 requests of the 20-per-60-s grant (one refresh, Andante only, cap set to
  18); every other run offline against fakes. 4 passes + 1 repair pair granted; this is pass 1.
- Parked: nothing half-done. The tree is clean apart from the coordinator's uncommitted doc edits
  (Q5). My servers (8765, 8790, 8791, 8799) are stopped.
- Needs attention: (1) Q1: keep or drop the per-series Events column and the "(N)" toggle counts.
  (2) Import one export into Google Sheets and check that a tag starting with = - + @ shows as text
  without a visible apostrophe. (3) If a :8766 server was views/serve.js from this tree, it is gone;
  npm run app replaces it.
```

---

## Pass 1b — UI polish (impeccable)

Seat: a fresh Opus agent with the `impeccable` skill, which Noah named: *"have a fresh opus subagent take
a light pass with impeccable skills to improve ui"*. Branch `build/webapp`, polish commit `9a7a756`, local only.

### Terms as understood

- **Scope:** a light presentation pass on `app/public/*`. Hierarchy, alignment, spacing, type, contrast,
  toolbar, compare layout, frozen/pinned affordances, multi-line cell readability. No new information,
  no new features. Server, routes, data, model logic and fetch code untouched.
- **Binding:** the four Ratified display rules; every pass-1 behavior (pin/unpin, freeze, compare
  split + pickers + swap + close, Refresh + status, Sheets download, sortable headers, player links,
  "How to read this"); the offline suite at 0 fail.
- **Live:** Noah is using the app on :8765, and that server reads `app/public/*` from this working tree
  on every request. So the edits were made and checked in a scratch git worktree served on :8793 (with
  `--out` pointed at the real, read-only `out/`). They were fast-forwarded into `build/webapp` only after
  verification. A reload on :8765 now shows the new UI.

### Assumptions I supplied

1. **I skipped impeccable's setup gate.** The skill stops for an `init` interview (writing `PRODUCT.md`)
   when a project has none. That needs Noah's answers, and the file is outside this seat's file scope.
   I used the dispatch brief as product context instead (register: product UI, a dense data tool; user:
   one TO seeding a 182-player event today). No `PRODUCT.md` was written. Amendable: run
   `impeccable init` later if the UI keeps growing.
2. **I left `lib/view/render.js` alone.** Its markup is shared with `views/major-table.js` (whose output
   pass 1 kept byte-identical), and `test/render.test.js` pins it (e.g. `Best placement: <b>1st / 20</b>`).
   Everything here is CSS plus three small presentation hooks in `app.js`.

### What the critique found

I walked the Eclipse page (182 players), the Allegro MBTL page (24 players) and the index in the browser
pane at about 800 px wide, then read the CSS. In the product register, the bar is a TO fluent in
spreadsheets who trusts the page and stops noticing it.

| # | Finding | Kind |
|---|---|---|
| 1 | Secondary text (`.dim`: years, "(5th / 29)", "1 event", dashes, dates) was `#888`: 3.5:1 on white, under WCAG AA's 4.5:1 | functional |
| 2 | The Freeze `<select>` sized itself to its longest option ("Through TNS Melty Blood Actress Again Current Code (85 of 182)"), about 410 px, crowding the toolbar | functional |
| 3 | Compare series table: the A/B name header scrolls away, so 35 rows down you can't tell which side is which | functional |
| 4 | The compare picker bar wrapped at about 800 px: the note squeezed into two lines and Close dropped to a second row (bar 89 px tall in a half-height panel) | functional |
| 5 | Detail and compare tables: the Series/Event column shrank to one word per line ("TNS / Melty / Blood / Actress / …"), making rows 5–6 lines tall | functional |
| 6 | Shared-series shading in compare (`#f3f7ff`) was nearly invisible on white | functional |
| 7 | Toolbar controls came in three heights and two button styles (`.bar` vs `.cmp-bar`); "How to read this" opened inline in the flex row | cosmetic |
| 8 | Proportional digits: placements and W-L don't line up down a column | cosmetic |
| 9 | Summary row hover (`#f7f9fd`) was barely visible, so tracking one row across a wide table was hard | cosmetic |
| 10 | The header subline was one run-on string; it wrapped mid-phrase and buried the W-L progress | cosmetic |
| 11 | Sorted headers showed no direction | cosmetic |
| 12 | The smooth jump to a player ignored `prefers-reduced-motion` | cosmetic |

### What changed, by file

**`app/public/app.css`** (rewritten in place on the selectors the JS relies on: `.frozen`, `.frozen-edge`,
`.last-pin`, `tbody.pinned`, `.cmp-sum-wrap`, …)
- **Tokens on `:root`:** `--dim #6b6b6b` (5.3:1 on white, 4.6:1 on the header gray), `--line-strong`,
  `--row-hover`, `--pin-hover`, `--accent-weak` / `--accent-ink`, `--both #e9f0fb`, `--ctl-h 30px`,
  `--radius 6px`. Fixes 1 and 6.
- **Tables:** `font-variant-numeric: tabular-nums`; cell padding 6/10 and line-height 1.38 (slightly
  denser multi-line cells); 13 px headers, bottom-aligned, with a stronger rule under the head row. Fixes 8.
- **Row hover:** `--row-hover` on summary rows, frozen and pinned cells included (pinned rows get their
  own darker yellow). Detail and compare result rows get hover too. Fixes 9.
- **Toolbar:** `.bar` and `.cmp-bar` now share one control height and one button style, with hover,
  active and disabled states. The pressed Compare button and the "Show new data" button use the accent.
  The Freeze select is capped at 17em. "How to read this" sits at the right and, when open, takes a full
  row capped at 75ch. `[hidden] { display: none !important }` is there because the new
  `display: inline-flex` on toolbar buttons would otherwise show the hidden "Show new data" button. I
  caught that in the browser and fixed it before committing. Fixes 2 and 7.
- **Name columns:** `table.res td:first-child { min-width: 11em }`, so series and event names wrap to two
  lines at most. Fixes 5.
- **Sort direction:** `th[data-dir]` shows ▲/▼, using the attribute `app.js` already sets. Fixes 11.
- **Compare:** the picker bar stays on one row at 800 px (inputs `clamp(150px, 18vw, 220px)`, the note
  flexes, Close is pinned right). Bar height went from 89 to 48 px. The A/B labels are bold and the panel
  has a top shadow. Table heads in the panel stick under the bar (`--cmp-top`, `--cmp-top2`). Fixes 3 and 4.
- **Frozen edge:** still a 2 px inset rule. I tried a soft drop shadow there and removed it. It would
  repaint 182+ sticky cells on every sideways scroll, and the scroll feel is what Noah said he likes.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` turns off transitions and smooth scrolling.

**`app/public/app.js`** (presentation only, +25/−5)
- **`renderHeader`:** the subline is now two spans (event facts, then W-L progress), so it wraps between
  them. The text is the same. Fixes 10.
- **`stickCompareHeads()`:** measures the picker bar (its height changes when it wraps) and the series
  table's first head row, then sets the two CSS variables. It runs after each compare render and on
  resize. Fixes 3.
- **`goToPlayer`:** uses `behavior: 'auto'` under reduced motion and smooth scrolling otherwise, as before. Fixes 12.

**Not touched:** `event.html`, `lib/view/render.js`, the server, routes, data, model, fetch and tests.

### Deliberately left alone

- **Counts in labels:** "Every … result (6)", "Other games (123 results…)", "(85 of 182)" in series
  headers, and the per-series Events column. These are pass 1's open Q1, which needs Noah's ruling. It
  isn't a styling decision.
- **Repeated labels in series cells** ("Best placement:" on every line). Dimming the labels would need
  render.js markup that `test/render.test.js` pins, and muting the whole line would also mute the W-L,
  which rule 1 makes primary.
- **Left-aligned headers over right-aligned number columns** in the result tables. Fixing that needs
  per-column classes from render.js. It's minor, so I skipped it.
- **Information, order, columns and copy:** unchanged, apart from the subline split.

### Evidence

- **Tests, before and after:** `NODE_OPTIONS="--require ./testlib/no-network.js" node --test
  --test-skip-pattern="server binds 127.0.0.1"`. Before (`6cf3bb2`): tests 105 · pass 102 · fail 0 ·
  skipped 3. After (`9a7a756`, in the worktree and again on `build/webapp`): tests 105 · pass 102 ·
  fail 0 · skipped 3. The set of test lines is identical (diff of the sorted ✔/✖ lines: no difference).
- **Why one test was excluded (pre-existing, environment-only):** `app: the server binds 127.0.0.1`
  calls `main(['--port', '0', …])`, and in `app/server.js`, `Number(arg('--port') || process.env.PORT) ||
  DEFAULT_PORT` turns `0` into `8765`. With Noah's server holding 8765, the listen fails with
  EADDRINUSE and `'listening'` never fires. That hangs all of `app.test.js` (over 10 min observed; under
  a 90 s timeout, 7 of 8 app tests pass and the file fails). The test passes whenever 8765 is free,
  which is how pass 1 ran it. This pass didn't cause it, and I'm not allowed to change the server or the
  tests. See Needs attention.
- **Browser** (embedded pane, a background tab on :8793, about 800 × 850):
  - **Eclipse before:** the Freeze select was about 410 px wide; the compare bar was 89 px tall with
    Close on row 2; series names stacked one word per line; the compare head scrolled out of view.
  - **Eclipse after:** the toolbar fits on one row. Pinning 2 rows put them under the header, aligned,
    with the gold rule under the block, and hover shows on frozen cells. Unpinning one took the pins from
    `["5043546","499202"]` to `["499202"]`. Freeze "Through Region" made Region stick with its ❄ pressed,
    and the compare summary followed. Compare with A = A Haru In A Dry Land and B = Arhkma MuddyKipz gave
    a 48 px bar, and the head offsets tracked the bar height: the A/B name heads stayed visible while the
    series table scrolled. ⇄ swapped the pickers. Close hid the panel. `#update` computed to
    `display: none`.
  - **Allegro after:** "How to read this" opens as a full-width block and closes again. Clicking Best
    placement sorted it ▲. Series names fit on 1–2 lines.
  - **Index:** same layout, with the new tokens. No console errors on any page.
- **Not verified in the browser:** the smooth jump when a player name is clicked. A hidden tab doesn't
  run smooth scrolling or `requestAnimationFrame` normally, and bringing my tab to the front would have
  taken the pane away from Noah's :8765 tab. Only that call's `behavior` changed. I didn't re-measure
  scroll-frame timing either, for the same reason. The only paint-cost addition is one panel shadow.
  I didn't press Refresh (no live calls). The Sheets download link is unchanged.

### REPORT

```
REPORT
- Overview: Light UI polish of the seeding app (impeccable, product register). Front end only:
  app/public/app.css rewritten on the same selectors, plus three presentation hooks in app.js.
  Commit 9a7a756 on build/webapp (local). The offline suite was 105 tests · 102 pass · 0 fail ·
  3 skipped both before and after, with the same test lines. One pre-existing test was excluded
  because Noah's :8765 server holds the port (see Needs attention).
- Ran: an impeccable critique found 12 issues (6 functional, 6 cosmetic) and all 12 were fixed:
  contrast (#888 -> #6b6b6b, 3.5 -> 5.3:1), tabular numerals, one toolbar control style with a
  width-capped Freeze select, visible row hover including frozen and pinned cells, a readable series
  column, sort arrows, the compare bar on one row, sticky A/B heads in compare, stronger
  shared-series shading, a two-part header line, and reduced motion. Verified in a background
  browser tab on :8793 against the real Eclipse (182) and Allegro (24) data. The edits were made in
  a scratch worktree and fast-forwarded only after checking, so Noah's live :8765 page never served
  a half-edited file.
- Queued: Q1 (counts in labels) still needs Noah's ruling; untouched. Aligning headers with number
  columns and dimming cell labels both need render.js markup and test changes; left for a later
  pass.
- Needs attention: (1) app/server.js treats --port 0 as 8765 (Number(x || env) || DEFAULT), so the
  test "server binds 127.0.0.1" hangs app.test.js whenever the app is running on 8765. For pass 2/3:
  parse 0 as a real port. Until then, run the suite with the app stopped, or skip that test as above.
  (2) The player-link smooth jump and scroll timing weren't re-checked in a foreground tab; worth a
  look in the orchestrator's browser check (UI checklist items 6-7). (3) docs/usage-log.md has
  someone else's uncommitted edit in the tree; I left it unstaged.
```

## Pass 1c — UI pass (Fable)

Seat: a Fable subagent, at Noah's request: *"have a fable subagent take a pass and make this all look nice,
following good ui standards and best practices … i dont need anything crazy. just a nicer looking view for all
this. the content is pretty good so far."* Branch `build/webapp`, commit `c948033`, local only.

### Terms as understood

- **Scope:** presentation only. Same content, same columns, same order, same behaviors. `app/public/*` edited
  freely; `lib/view/render.js` not touched (no class hooks turned out to be needed); server, routes, data,
  model, fetch and tests untouched.
- **Binding:** the Ratified / Built rows of `docs/usage-log.md` → Requirements surfaced (per result = event,
  placement / entrants, W-L; no aggregate counts; series = best placement + best W-L + average W-L; tables not
  bullets; Team | Player | Region | Tier ‖ majors | shared series | Other games | Notes, frozen through Tier;
  rows short). Every pass-1/1b behavior listed in the brief.
- **Register:** product UI (impeccable's `reference/product.md`): restrained color, one accent, system font,
  density is a feature, consistent control vocabulary, motion only for state.

### Assumptions I supplied

1. **impeccable's init interview skipped** (the brief says so; no `PRODUCT.md` written). The brief was the
   product context. Same call as pass 1b.
2. **Edited the working tree directly.** Noah's :8765 server serves `app/public/*` from this tree, so each
   file write was live on his next reload. Every write was a complete file (no half-states), and the three
   files were checked on :8794 before the commit. Pass 1b used a scratch worktree instead; that is the safer
   option if a later pass makes many incremental edits.
3. **Two small copy additions** in "How to read this" (sorting, compare, double-click editing with Enter /
   Esc). The page had no visible hint that Tier and Notes are editable. Content elsewhere is unchanged.

### What the walk-through found

Eclipse (182 players) on :8794 at 1440 × 900, 1000 × 640 and 760 × 640; the index page; compare with two
selected; a pinned row; sorted Tier; the Tier and Notes editors opened and Esc-cancelled.

| # | Finding | Kind |
|---|---|---|
| 1 | Toolbar was one flat wrap of seven controls in three visual styles (buttons, bare `<select>`, bare input, bare checkbox); on narrow windows single controls wrapped on their own | functional |
| 2 | ❄ sat inline after each header label, so a sorted header read "Tier ❄ ▼"; the ❄ was also a 12 px target with no hover state | cosmetic |
| 3 | A long tag (e.g. COPYKILLER4FUN) wrapped under the checkbox and pin inside the Player cell | functional |
| 4 | Editable cells (Tier, Notes) had no hover affordance; only `cursor: cell` | functional |
| 5 | The cell editor is anchored to the cell's left edge, so on the Notes column (far right) it ran off the viewport and the hint "Esc cancels" was clipped | functional |
| 6 | "How to read this" when open shared its row with the Download button at 1000 px (its `max-width: 78ch` shrank the flex item) | cosmetic |
| 7 | No spacing or z-index scale: ad-hoc 1/2/3/4/5/6/30/40 z-indexes and mixed px gaps | cosmetic |
| 8 | Dead rules for the removed A/B pickers (`#pickA[readonly]`, `.cmp-bar input`, `.cmp-bar label`) | cosmetic |
| 9 | `#msg` errors were bare red text with no surface; chips' ✕ had a 12 px hit area | cosmetic |
| 10 | The selected row had no distinct hover; the "needs tier" tag inherited a stray left margin | cosmetic |

### What changed, by file

**`app/public/app.css`** (rewritten on the same selectors; the JS-facing names are listed in the file header)
- **Tokens:** `--s-1…--s-6` (4/8/12/16/24 px) and `--z-cell … --z-popover` on `:root`; `--ink-2 #3f434a`,
  `--dim #656a73` (5.6:1 on white, 4.9:1 on the header gray), `--accent-weak-2`, `--ok-bg`, `--err`,
  `--err-bg`, one `--ease` (ease-out quint). Fixes 7.
- **Toolbar:** `.bar .group` (inline-flex, wraps as a unit) and `.group.right` (margin-left auto). The
  `<select>`, the jump input and the buttons share height, border, radius, hover and a focus ring;
  checkboxes use `accent-color`. `.status:empty` collapses. Fixes 1.
- **Headers:** 12.5 px / 600 / `--ink-2`, bottom-aligned; sortable headers get the hover tint; a sorted
  header's label turns accent-ink with a 9 px arrow. `button.freeze` is absolutely positioned at the
  header's right edge (headers are already `position: sticky`), 18 × 18 px, with hover and pressed
  backgrounds; headers get 26 px right padding for it. Fixes 2.
- **Player cell:** `td.who { white-space: nowrap }` with the link as an `inline-block` capped at 240 px that
  wraps internally, so the tag wraps beside the controls. Fixes 3.
- **Editable cells:** 1 px `--split` outline on hover inside `#summary`; the 2 px accent focus outline stays.
  `.editor.flip { left: auto; right: 0 }`. Fixes 4, 5.
- **Help panel:** `.about[open] { flex: 1 0 100% }` with the text in `.about-body { max-width: 78ch }`, on a
  bordered `--bg` surface. Fixes 6.
- **Smaller:** `#msg` as an error banner; `.chip-x` is a 20 px round target; `tr.selected:hover` darker;
  `.tag.needs` without the left margin; `td b { font-weight: 650 }`; `.tag` as inline-block with 4 px radius;
  `summary:hover` underline; the player-detail `h2` gets 36 px above. Reduced-motion block merged into one.
  Dead picker rules removed. Fixes 8, 9, 10.
- **Kept on purpose:** the 2 px inset frozen-edge rule (no shadow; see pass 1b on repaint cost); pinned-row
  yellow and gold rule; row heights, cell padding and line-height (density is what Noah likes).

**`app/public/event.html`**
- Toolbar controls in three `div.group`s (`role="group"` with labels): Refresh / Compare / status / Show new
  data; Freeze / Jump to / Needs tier only; Download. Same ids, so `app.js` is unchanged there.
- "How to read this" text wrapped in `div.about-body`; two sentences added (sort / freeze / pin / compare,
  and double-click editing with `<kbd>Enter</kbd>` / `<kbd>Esc</kbd>`).

**`app/public/app.js`** (+3 lines, presentation only)
- `openEditor`: after the popover is appended, if `td.left + box.offsetWidth` would pass the window's right
  edge minus 8 px, the box gets `.flip`.

### Deliberately left alone

- **`lib/view/render.js`:** no change. Everything above was reachable from CSS and the HTML shell.
- **Counts in labels, repeated "Best placement:" labels, left-aligned headers over number columns:** pass
  1b's open items; still need either Noah's ruling or render.js markup.
- **Colors and the light-only theme**, the font stack, row density, the pinned-row yellow.
- **One thing I saw but did not touch:** with the compare panel open, a sideways scroll of the main table
  from the compare panel's summary strip (the two are synced both ways) once left the header and body a
  frame apart in a screenshot. It settled on its own and may be a screenshot artifact; noting it, not a fix.

### Evidence

- **Tests, before and after:** `NODE_OPTIONS="--require ./testlib/no-network.js" node --test
  --test-skip-pattern="binds 127.0.0.1"` → tests 106 · pass 103 · fail 0 · skipped 3, both before (at
  `bc93955`) and after (at `c948033`).
- **Browser** (embedded pane, my own server on :8794 against the real `out/`; Noah's :8765 never touched):
  - Eclipse at 1440 × 900: the toolbar is one row with Download at the right; sorted "Tier ▼" reads with the
    ❄ at the header edge; row hover and the frozen edge as before.
  - Eclipse at 1000 × 640 and 760 × 640: groups wrap as units (Download + help on the second row, then
    Freeze/Jump/Needs on its own row at 760); nothing overflows.
  - Compare: ticked Skeleton and Moai → panel opened with chips A/B, Clear, Close; the series table's A/B
    heads stuck under the bar while scrolling; Clear and Close worked.
  - Pin: pinned Moai → row moved under the header with the gold rule; persisted across a reload.
  - "How to read this": opens on its own full row, text at 78ch, closes again.
  - Editors: Tier editor opened by double-click (Tier 11, Reason empty, hint line) and Esc-cancelled; Notes
    editor opened on the far-right column, got `.flip`, right edge at 968 px of a 1000 px viewport, and
    Esc-cancelled. Network log shows only `GET …/data`; no `POST …/player/<id>` was sent.
  - Player detail (clicked Skeleton): series table with tags and sortable heads; index page renders.
  - No console errors on any page.
- **Not verified:** Refresh data (never pressed; it calls start.gg). The Sheets download link is unchanged.
  Jump-to was exercised only by code in pass 1 and is unchanged here.

### REPORT

```
REPORT
- Overview: A restrained UI pass on the seeding app's front end, same content and behavior. app.css
  rewritten on the same selectors (spacing + z-index tokens, one control vocabulary, header ❄ at the
  edge, player tag beside its controls, editable-cell hover, help panel on its own row, dead rules
  gone); event.html toolbar in three groups + two help sentences; app.js +3 lines so the cell editor
  flips left near the window edge. Commit c948033 on build/webapp, local. Tests 106 / 103 pass / 0
  fail / 3 skipped before and after. Checked in the browser pane on :8794 at 1440, 1000 and 760 px.
- Ran: impeccable loaded (polish + product register, init interview skipped per the brief); the
  walk-through found 10 items (5 functional, 5 cosmetic), all 10 fixed; every listed behavior
  exercised except Refresh data (never pressed) and the download (link unchanged). No save request
  was sent; registry/ and out/ untouched; Noah's :8765 server never stopped.
- Queued: pass 1b's render.js items (counts in labels, dimmed repeated labels, number-column header
  alignment) still need Noah's ruling or markup hooks + test updates. A scratch worktree for the
  next pass that touches app/public/* incrementally, since :8765 serves the working tree live.
- Needs attention: (1) Noah's page picks up the new CSS on his next reload; pins, selection and
  freeze choices survive (localStorage, unchanged keys). (2) The one-frame header/body offset seen
  once during synced sideways scroll with compare open: unconfirmed, pre-existing, not changed.
```
