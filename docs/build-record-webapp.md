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

---

## Pass 2 — engineering auditor review

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block). Model: Sonnet. Report-only: no source edited, no server of mine left running, nothing
run against the real `registry/tiers.csv` or Noah's live :8765 process. Reviewed at `build/webapp`
HEAD `70473b7`, covering passes 1, 1b, 1c and the out-of-band commits between them
(`c5c9211`, `abf13ab`, `86c4bc1`, `94ee23c`, `59a21b0`, `8e394c7`, `6da478c`, `bc93955`).

### Terms as understood

- Scope: every acceptance item (1–12, 6b, 11b) against the code at HEAD, the four ratified display
  rules in every table including the now-N-player compare, the out-of-band tiers feature
  (`lib/view/data.js` `updatePlayer`/`readNotes`, the `POST /player/<id>` route), `lib/wl.js` vs.
  start.gg's server-time-budget error, the known open items (`--port 0`, Q1, the Sheets apostrophe),
  and baseline security (nothing outside `out/` + static, `.env` never served, POST routes guarded).
- Hard constraints honored: all exercise of `updatePlayer`/the player-edit route ran against a
  `git clone --branch build/webapp` in a scratch temp folder, never the real repo; no live start.gg
  calls; Noah's :8765 was never touched (no requests sent to it, no Refresh pressed anywhere); my own
  scratch server ran once on :8795 against a synthetic run and was stopped immediately after.
- Not this seat's to give: item 12 (closing approval is pass 4's). The live browser-UI click-through
  (pin/compare/freeze/refresh by hand) is the orchestrating session's assigned check per the dispatch
  contract and Noah's own :8765 is the only instance that should be clicked through; I verified the
  same behavior at the code and test level instead (see "Could not verify").

### Verdict: NOT APPROVED

Two DEFECT-level findings (A2-1, A2-2) sit on paths Noah is relying on right now — live tier editing
and Refresh during today's large event — and both are reproducible, not speculative. Everything else
checked out: all 12 acceptance items plus 6b/11b are built and evidence-backed, the four ratified
display rules hold everywhere including the 3-way compare, the security/static-serving boundary is
sound, and passes 1/1b/1c are honest, well-evidenced reports. This reads as approve-with-findings
quality work carrying two regressions serious enough to return for pass 3's repair loop, not a
build that is broadly wrong.

### Findings

**A2-1 — DEFECT — tier/notes edits can silently fork into a duplicate `registry/tiers.csv` row**
(maps to usage-log.md "Tier and notes editable in place" (Built, 59a21b0) and acceptance 6b's sibling
tiers feature; the dispatch's explicit ask to check "tag matching to the wrong row, duplicate rows").

`lib/view/data.js:205` — `updatePlayer`'s own tag-normalizer:
```
const norm = (s) => String(s || '').trim().toLowerCase().replace(/s+/g, ' ');
```
This should collapse whitespace, exactly like the correct helper 75 lines above it in the same file,
`readNotes`'s `norm` at `lib/view/data.js:130`:
```
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
```
`updatePlayer`'s version is missing the backslash: it strips runs of the literal letter s, not
whitespace. `readNotes` (what the page displays) and `updatePlayer` (what a tier/notes edit writes)
now use two different, independently-maintained copies of the same matching logic, and they have
drifted apart by one character.

Reproduced in an isolated clone (`git clone --branch build/webapp`, never the real repo): seeded
`registry/tiers.csv` with one sheet-imported row, `sheet_tag` "Mrs Smith" (single space, no
`player_id` yet — the normal pre-link state for every one of the 654 imported rows). Gave a player on
a fake pull the tag "Mrs  Smith" (double space — an ordinary sheet-entry variance). POSTed a tier
edit for that player through the real route (`POST /api/e/<t>/<e>/player/<id>`, in-process via
`testlib/inject.js`, no network):
```
BEFORE: 1 row  - "Mrs Smith" / tier 7  / source "sheet import"
POST /api/e/.../player/101 {"tier":9,"justification":"retest"} -> 200
AFTER:  2 rows - "Mrs Smith" / tier 7  / source "sheet import"   (untouched, orphaned)
                 "Mrs  Smith" / tier 9 / source "app", player_id 101  (new row)
```
The edit didn't update the existing row — it created a second one, because `updatePlayer`'s broken
`norm` never collapses the double space to match the single-spaced stored tag (both tags lose only
their literal "s" characters, which doesn't make them equal). The original tier-7 row is now an
untethered duplicate: orphaned today, but because it still carries no `player_id`, `readNotes`'s
(correct) tag-matching will attach it by tag to the next player whose tag normalizes to "mrs
smith" — which could be a different real person — misattributing tier 7 and an empty justification to
them. This is exactly the "duplicate rows" / "tag matching to the wrong row" failure mode the dispatch
named to check for, and it reproduces on any tag whose whitespace isn't byte-identical between
start.gg and the sheet import (also plausible for accents/casing drift, not just spacing).

Zero test coverage exists for this: `grep -rn "TIERS_FILE|updatePlayer|tiers.csv" test/` returns
nothing except comments. It also isn't easily testable as shipped: `TIERS_FILE`
(`lib/view/data.js:116`) is a module-scope `const`, and `module.exports` only copies its value out —
reassigning `data.TIERS_FILE` in a test does not redirect `readTiers`/`updatePlayer`, which close over
the original constant. That's very likely why this shipped with no unit test: the write path can't be
pointed at a scratch file without `chdir`-ing into a full repo copy (what I did to reproduce this).

**A2-2 — DEFECT — the start.gg "server-time budget" bug-class requirement was not built**
(usage-log.md row: "Handle start.gg's server-time budget... `lib/wl.js` / the app's refresh need the
same (or adaptive) handling" — explicitly scoped "for pass 2/3 of the webapp build.")

`git log --oneline 6cf3bb2^..HEAD -- lib/startgg.js lib/pacing.js lib/wl.js app/jobs.js
app/limit-fetch.js` returns no commits — none of these files were touched anywhere in this build
(pass 1, 1b, 1c, or the out-of-band work). The classifier that decides whether an error is retried,
`classifyError` in `lib/startgg.js:133`, still only recognizes rate-limiting via
`RATE_RE = /rate limit/i` (`lib/startgg.js:131`). The live error text recorded in usage-log.md —
"You have gone over the threshold for recent request time. Please wait before sending another
request." — does not contain the phrase "rate limit", so `RATE_RE` never matches it. Simulated
`classifyError` with that exact text under the two shapes start.gg is most likely to send it in (a
pre-execution GraphQL error with no `path`, or an HTTP 4xx body message):
```
gql error, no path, status 200  -> 'query'   (FATAL - pacing.isRetryable('query') === false)
HTTP 400, body.message          -> 'query'   (FATAL)
gql error, WITH path            -> 'server'  (retryable, but caps at ~32s backoff, not the 90s the
                                               usage log says this error actually needed)
```
In the most likely cases the app throws immediately with no retry at all; in the best case it retries
with a backoff that's still short of what was observed to work. Either way, `wl.fetchSetRecords`
(used by both the CLI and `app/jobs.js`'s Refresh) stops the W-L fetch outright when this error hits —
it does not hang or crash the server (the job's `.catch` sets `phase: 'error'` and the new run still
shows, partial W-L intact), but Refresh does not recover or retry past this wall, which is the entire
point of the requirement. This is the live error the orchestrator was hitting on Eclipse (182
players) the same day this build was dispatched, under the exact condition described as "current
focus" in the dispatch contract: "Noah is seeding a large event TODAY." Pass 1's own Findings/queue
(Q1-Q6) does not mention this requirement at all — it wasn't declined with a reason, it was dropped.

**A2-3 — DEFECT, carried forward, still unfixed — `--port 0` resolves to 8765**
(flagged by pass 1b's "Needs attention," repeated by pass 1c, still present at HEAD.)

`app/server.js:169`: `const port = Number(arg('--port') || process.env.PORT) || DEFAULT_PORT;`.
Confirmed still live by direct evaluation: `arg('--port')` returns the string '0', which is truthy,
so `Number('0') === 0`, and `0 || DEFAULT_PORT` falls through to 8765. This is why the "server binds
127.0.0.1" test has to be skipped by pattern (`--test-skip-pattern="binds 127.0.0.1"`) rather than run
— it tries to bind an ephemeral port and instead collides with Noah's live server. Two UI-pass seats
(1b, 1c) named this as a one-line fix for "pass 2/3" and it still wasn't made; acceptance item 1 only
reads PASS because the skip papers over it, not because it's fixed.

**A2-4 — NOTE — the N-player compare's pure logic has no unit tests**
(acceptance 7/8, the "Compare up to 3" row in usage-log.md, Built in out-of-band commit `bc93955`.)

`eventsSharedBy` and `alignSeriesN` (`lib/view/model.js`), and `sharedEventsTable` /
`compareSeriesTableN` (`lib/view/render.js`) — the N-player replacements for increment 1's 2-player
`eventsBothEntered`/`alignSeries`/`bothEnteredTable`/`compareSeriesTable` — have zero references
anywhere under `test/` (`grep -rln` across all four names returns nothing), while their 2-player
predecessors are directly tested in `test/view-model.test.js`. A synthetic 3-player spot check I ran
by hand (3 players, 2 overlapping events, 2 series merging under one canonical key) produced correct
output, so I found no live bug here — but this is new pure logic behind a ratified, user-facing
feature, shipped with no regression net, which is exactly what acceptance item 2 asked this build to
avoid for the rest of the view-logic module.

**A2-5 — NOTE — carried forward, unresolved — Q1 (Events column / toggle counts vs. "no aggregate
counts")**. No ruling appears in usage-log.md since pass 1 raised it; `playerBody`
(`lib/view/render.js:279,281`) still renders "Every {game} result ({n})" and
"Other games ({n} results...)". Unchanged by 1b or 1c (both explicitly left it alone, correctly,
since it's Noah's ruling to make, not a styling choice). Still open.

**A2-6 — NOTE — carried forward, unresolved — the Sheets leading-apostrophe guard is unverified**.
`lib/view/export.js`'s `RISKY`/`sheetsCell` implementation is sound on inspection (OWASP CSV-injection
convention, applied only to cells starting with = + - @, tab or CR) and round-trips through the CSV
parser in `test/export.test.js`, but whether Google Sheets actually hides the apostrophe on import
(vs. showing it as a literal character) has still not been tried in Noah's account. Not independently
verifiable by a report-only pass either; carried forward unchanged.

**A2-7 — NOTE — an unlogged engineer's-choice ruling**. `orderPlayers` (`lib/view/model.js:182-187`)
now sorts seed ascending, then tier descending, then alphabetical — tier sorting wasn't in
design-webapp.md (which only commits to "rows remain alphabetical unless notes.json provides seeds"),
and it's a reasonable reading of usage-log's "sorts by tier like his sheet filter," but it was added in
an out-of-band commit with no "Engineer's-choice ruling" entry anywhere (pass 1's table predates it).
No adverse behavior found; flagging the process gap, not the choice.

### Verified, no finding

- Acceptance 1: fresh `git clone --branch build/webapp`,
  `NODE_OPTIONS="--require ./testlib/no-network.js" node --test --test-skip-pattern="binds 127.0.0.1"`
  -> tests 106, pass 103, fail 0, skipped 3 (matches pass 1c's claim exactly, re-run independently).
- Acceptance 2, 3, 4, 5, 6, 6b, 7, 8, 11, 11b: spot-checked against the actual route table in
  `app/server.js`, the render functions in `lib/view/render.js`, and the compare/freeze/pin logic in
  `app/public/app.js`; all match their acceptance wording and the four ratified display rules hold
  structurally in every table I read, 2-player and 3-player compare included (`seriesStatCells` is the
  single shared cell-renderer behind both).
- Acceptance 9 (performance), partial re-check: re-ran `scripts/synth-run.js` (200 players, 20,000
  results) in the isolated clone and hit its `/data` endpoint on a scratch server on :8795 (stopped
  immediately after): 3,580,270 bytes in 36ms server-side — consistent with pass 1's recorded 3.58 MB /
  196ms-cold figure (the difference is a raw curl hit vs. a full page navigation+render). I did not
  redo the in-browser paint-timing/long-task measurements pass 1 recorded; see "Could not verify."
- Acceptance 10 / security: `.env` and 22 other path-traversal probes still 404 in the clone's test
  run; `STATIC` (`app/server.js:32`) is a fixed allowlist of 4 files, nothing under `out/` is served raw,
  `trustedHost` + the required `X-Seeding-App` header (no CORS preflight ever answered, so a
  cross-origin page's POST is blocked before it's sent) still guard both POST routes. Also manually hit
  `/.env` on the scratch :8795 instance -> 404, as a second, direct confirmation outside the test suite.
- Testability/atomicity of the write path (apart from A2-1's matching bug): `updatePlayer`'s
  CSV write is temp-file-then-rename (`lib/view/data.js:227-229`), and every operation inside it is
  synchronous (readFileSync/writeFileSync/renameSync), so two concurrent in-process POSTs cannot
  interleave — no race condition beyond the matching bug itself.

### Could not verify

- Live browser-UI click-through (pin, compare toggle, freeze, Refresh by hand, smooth scrolling):
  this is the orchestrating session's assigned check against Noah's own :8765 per the dispatch
  contract, and I was told not to touch that instance or press its Refresh. I verified the same
  behaviors at the code/test level instead (see above); a true hands-on walkthrough is still
  outstanding and isn't this pass's to give.
- Google Sheets import of the exported CSV (the leading-apostrophe question, A2-6): needs Noah's
  own Google account; out of reach for a report-only pass.
- Full in-browser performance profile (long-task timings, scroll-frame p95, compare-open paint
  time): I re-ran the data-generation and a raw HTTP timing check (see above) but did not reproduce
  pass 1's embedded-browser instrumentation; no reason to doubt its numbers, just not independently
  re-measured by this pass.
- `app.cmd` end to end: by inspection only, same as pass 1 — it opens the desktop's default
  browser, which this seat has no path to exercise safely either.

### REPORT

```
REPORT
- Overview: Report-only audit of the seeding-script webapp build (passes 1, 1b, 1c, and the
  out-of-band tiers/compare-N/sort/jump commits between them), at build/webapp HEAD 70473b7.
  Verdict: NOT APPROVED. Two reproducible DEFECTs sit on paths Noah is using today - a tag-matching
  typo in the tier/notes write path that forks a duplicate row in registry/tiers.csv instead of
  updating the existing one, and a start.gg error class ("threshold for recent request time") that
  the dispatch named as a required fix for pass 2/3 and that was never attempted anywhere in the
  build. A third, smaller defect (--port 0 resolving to 8765) was flagged by pass 1b, repeated by
  pass 1c, and is still unfixed. Everything else checked out: all 12 acceptance items + 6b/11b are
  built and evidence-backed, the four ratified display rules hold in every table including the new
  3-way compare, and the security/static-serving boundary is sound.
- Found: A2-1 DEFECT (tier/notes edit can duplicate a tiers.csv row) - A2-2 DEFECT (server-time-budget
  bug class unaddressed) - A2-3 DEFECT, carried (--port 0) - A2-4 NOTE (N-player compare logic
  untested) - A2-5 NOTE, carried (Q1 unresolved) - A2-6 NOTE, carried (Sheets apostrophe unverified)
  - A2-7 NOTE (unlogged tier-sort ruling).
- Ran: fresh git clone --branch build/webapp into a scratch temp folder (never the real repo);
  full offline test suite (106/103/0/3, matches pass 1c exactly); a reproduction of A2-1 against the
  real POST route via testlib/inject.js with a seeded scratch registry/tiers.csv; a simulation of
  classifyError with the literal observed start.gg error text (A2-2); a direct re-evaluation of the
  --port 0 parsing (A2-3); a synthetic 3-player spot-check of the untested compare logic (A2-4); a
  scripts/synth-run.js (200x100) regeneration and a raw endpoint-timing check on a scratch :8795
  server, stopped immediately after. Nothing was run against the real registry/, .env, out/, or
  Noah's :8765 process.
- Attributed: core / seeding-script webapp increment 2, pass 2. STATED (dispatch-contract-webapp.md).
- Queued: A2-1 and A2-2 need pass 3 repair before pass 4 can close; A2-3 is a one-line fix repeated
  across three passes without landing. A2-4/A2-7 are process notes for pass 3 to pick up or decline.
  A2-5/A2-6 are unchanged open items that remain Noah's or the next increment's to resolve, not
  pass 3's.
- Spend: no live start.gg calls (not needed for this review); one scratch server on :8795, stopped
  immediately after use; no commits except this record.
- Parked: nothing half-done; the isolated clone and scratch output live only under this session's
  temp folder and were never pushed or merged back.
- Needs attention: (1) A2-1 and A2-2 are both live-use-affecting today and should be pass 3's first
  priority, ahead of the carried-forward notes. (2) A2-3's fix needs its own explicit check for a
  literal 0 (an empty/undefined --port should mean "use default"; a --port of exactly 0 should mean
  "let the OS pick"), since a plain `||` chain can't tell those apart. (3) Q1 and the
  Sheets-apostrophe check still need Noah directly; neither is pass 3's to rule on.
```

---

## Pass 3 — repair (lead engineer, fresh)

Seat: Lead engineer (builds & updates) persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`,
Profile block, fresh job per the contract — no memory of passes 1/1b/1c/2 beyond what this record
and the contract state). Model: Sonnet. Branch `build/webapp`, four commits on top of HEAD
(`9a07c40`, `2b7ea7e`, `526ab34`, `fbe42a8`), local only, plus this record's commit. Reviewed-at
HEAD when this pass started: `7f7c556` (an out-of-band front-end commit, "Show team toggle…",
landed between pass 2's review and this pass; `app/public/*` only, no overlap with anything below).

### Terms as understood

- **Scope:** disposition every one of pass 2's findings A2-1 through A2-7 — FIXED (with
  re-runnable evidence) or DECLINED (with reasoning), per the dispatch contract's pass-3 clause and
  the lead-engineer persona's directive 9 (fix only what's in-window; report and queue the rest).
  A2-1/A2-2/A2-3 are DEFECTs on paths Noah is using today; A2-4 is a test-coverage NOTE; A2-5/A2-6
  are explicitly Noah's or the next increment's to rule on; A2-7 is a process note asking this
  record to carry a ruling that shipped without one.
- **Binding:** the four ratified display rules (`docs/usage-log.md`); the dispatch's hard
  prohibitions (never write the real `registry/tiers.csv`, never POST to Noah's running app, never
  run `updatePlayer` against the real path, no live start.gg calls, don't touch `out/` or `.env`,
  never weaken/skip/delete a test to make it pass); Noah's app stays running on :8765 throughout —
  nothing here stops it, and every backend file touched (`lib/`, `app/server.js`, `app/jobs.js`)
  only reaches his live instance when the orchestrator restarts it, per the dispatch's own note.
  `app/public/*` (the only files that reload live) were **not touched** by this pass — every A2
  finding was a backend concern.
- **Allowed work:** repair only, scoped to A2-1…A2-7; no new features, no re-opening pass 1's
  engineer's-choice rulings except where a finding named one (A2-7).
- **Process:** the contract names it (pass 3 of 4, fresh job). No Ship Pipeline skill run — Noah's
  global rule requires sign-off for skill/subagent spend and none was given for this seat; this is
  a single lead-engineer seat doing the repair directly, per the dispatch.
- **Live start.gg budget:** not spent. Every test in this pass runs offline against fakes/fixtures
  or in-process route injection (`testlib/inject.js`); nothing in this pass makes a network call.
- **Grounding not consulted:** the standards bank and the runbook
  (`personal-staff/personas/grounding/`) — not fetched this pass; every ruling below traces to the
  dispatch contract, the design doc, the auditor's own findings, or the existing code/tests, which
  was sufficient for a fix-or-decline pass with no new design surface.

### Assumptions I supplied

1. **A2-2's "classify it as retryable rate-limiting with a long wait" does not mean reusing the
   existing `'rate-limited'` kind.** I tried that first; it broke the already-passing "a 429 is
   retried with backoff" test (`test/client.test.js`), which correctly expects a *short* 4s backoff
   for the ordinary 80/min count limit. The server-time-budget error is a different failure with a
   different correct wait, so it gets its own kind, `'time-budget'`, with its own schedule in
   `pacing.js`. This is a defensible reading of "classify it as retryable rate-limiting" (it *is*
   now classified as a flavor of retryable rate-limiting, just not the same bucket as a plain 429)
   rather than a departure from it — **open to Noah's naming preference** if he'd rather call it
   something else; nothing outside `lib/pacing.js`/`lib/startgg.js`/their tests references the
   string `'time-budget'`, so a rename is a one-line sed away.
2. **`app/jobs.js` needed no direct edit.** The dispatch lists it among the files to check for
   A2-2. It calls `lib/wl.js`'s `fetchSetRecords`, which calls `client.request` (from
   `lib/startgg.createClient`) for every GraphQL send — so the new classification and retry
   schedule reach the app's Refresh pipeline automatically once `lib/startgg.js`/`lib/pacing.js`
   change, and the `WORKERS` default change in `lib/wl.js` applies the same way (jobs.js calls
   `fetchSetRecords` without an explicit `workers`). I verified this by reading the call chain
   rather than assuming it; no behavior in `app/jobs.js` itself needed to change.
3. **A2-3's test additions occupy `DEFAULT_PORT` (8765) to prove the fix, but never assume it's
   free.** The new test tries to bind a dummy listener there first; if that fails with
   `EADDRINUSE` (exactly Noah's situation, his app live on 8765), it treats that real contention as
   the test condition instead of creating its own, and never touches or closes Noah's server.
   Verified live: 8765 was genuinely occupied (Noah's app) for every run of this pass's suite.
4. **A2-7 is a logging task, not a code change.** `orderPlayers`' tier-sort ruling (highest tier
   first, untiered after, then alphabetical) was already correctly described in the code's own
   comment (`lib/view/model.js:181`); the gap the auditor found was that no
   "Engineer's-choice ruling" entry existed recording *who* ruled it and *why*, the process this
   repo's build records otherwise follow. I added that entry below rather than changing the
   behavior, which the auditor found no fault with.

### Disposition

| # | Finding | Disposition | Evidence |
|---|---|---|---|
| A2-1 | DEFECT — `updatePlayer`'s tag-normalizer regex (`/s+/g` for `/\s+/g`) forked a duplicate `tiers.csv` row | **FIXED** (regex: already hotfixed upstream, commit `4eb8241`, now verified by real tests rather than a scratch repro; path: made injectable) | Commit `9a07c40`. `lib/view/data.js`: `defaultTiersFile()` (SEED_TIERS_FILE env var, else `registry/tiers.csv`), threaded as an optional `tiersFile` through `readNotes`/`viewModel`/`summaryExport`/`updatePlayer`; `app/server.js`'s `createApp({ tiersFile })` threads it to all three routes. `test/data-tiers.test.js`, 8 tests, all green: `updatePlayer: a multi-word tag matches the existing sheet-imported row by tag — no duplicate` (the auditor's exact repro, now passing), `player_id match`, `new-row creation`, `tier must be a whole number 0-20 … → 400, and nothing is written`, `decided_on is stamped only when the tier value actually changes`, `the write is atomic … no .tmp left behind`, `route: POST player edit — X-Seeding-App guard, JSON body, field allow-list, against a temp tiers file`, and a check that the default path is still `registry/tiers.csv`. Real `registry/tiers.csv` mtime confirmed unchanged (11:42 AM) across this entire pass (last check ~19:17). Command: `NODE_OPTIONS="--require ./testlib/no-network.js" node --test test/data-tiers.test.js` → `tests 8 · pass 8 · fail 0`. |
| A2-2 | DEFECT — start.gg's server-time-budget error class was never attempted | **FIXED** | Commit `2b7ea7e`. `lib/startgg.js`: new `BUDGET_RE`, classifies the literal error text as kind `'time-budget'` (distinct from `'rate-limited'`, assumption 1) in every shape — GraphQL error with/without `path`, HTTP 4xx body message; `createClient.request()`'s retry ceiling and backoff now depend on `pacing.maxTriesFor(kind)`/pass `kind` to `backoffMs`. `lib/pacing.js`: `'time-budget'` gets a flat 90s wait (`RATE_LIMIT_WAIT_MS`, honoring a longer `Retry-After`) and up to 8 tries (`RATE_LIMIT_MAX_TRIES`); `isRetryable('time-budget') === true`. `lib/wl.js`: `WORKERS` default 3 → 1 (assumption 2: `app/jobs.js` and `views/major-table.js` both inherit it, no edit needed there). Tests: `test/classify.test.js` (`classify: the start.gg server-time-budget message -> time-budget, not query or rate-limited, in every shape it can arrive in`, `classify: a plain HTTP 429 still classifies rate-limited, not time-budget`), `test/pacing.test.js` (`backoff: the time-budget kind waits a flat 90 s per try`, `maxTriesFor: time-budget gets ~8 tries`), `test/client.test.js` (`client: the server-time-budget error retries at a flat 90 s, up to 8 tries, and recovers once it clears (no lost work)`, `client: the server-time-budget error gives up only after 8 tries`), `test/wl.test.js` (`wl: default concurrency is 1 in flight, not 3 (A2-2)`). Command: `NODE_OPTIONS="--require ./testlib/no-network.js" node --test test/classify.test.js test/pacing.test.js test/client.test.js test/wl.test.js` → `tests 31 · pass 31 · fail 0`. |
| A2-3 | DEFECT, carried — `--port 0` resolves to 8765 | **FIXED** | Commit `526ab34`. `app/server.js`: new `resolvePort(raw)` (missing/empty → `DEFAULT_PORT`; anything else, including `"0"`, parsed as given) replaces the old `Number(x || y) || DEFAULT_PORT` chain. `test/app.test.js`: `resolvePort: "0" is a real port request (the OS picks); missing/empty means the default` (pure unit test), and `app: "--port 0" binds a fresh ephemeral port even while DEFAULT_PORT is already taken` (live, binds a dummy listener on 8765 first — or recognizes it's already taken, as it was here — then proves `main(['--port','0'])` still gets a different, real port). The pre-existing `app: the server binds 127.0.0.1` test, previously only passable with `--test-skip-pattern="binds 127.0.0.1"` or the app stopped, now passes unmodified. **Proven on a clean clone with 8765 genuinely occupied by Noah's live app** (verified via `netstat`, PID 27888, before and during this run): `cd <clean clone> && NODE_OPTIONS="--require ./testlib/no-network.js" node --test` → `tests 132 · pass 129 · fail 0 · skipped 3` — no skip pattern, nothing stopped. |
| A2-4 | NOTE — N-player compare logic (`eventsSharedBy`, `alignSeriesN`, `sharedEventsTable`, `compareSeriesTableN`) had no unit tests | **FIXED** (tests added; no behavior changed — the auditor's own hand-check found no live bug, only an uncovered path) | Commit `fbe42a8`. `test/view-model.test.js`: `eventsSharedBy` and `alignSeriesN` each get a 2-player case (checked equal to the existing `eventsBothEntered`/`alignSeries` result) and a 3-player case (an event/series only 2 of 3 share still qualifies, with a null/absent slot for the other). `test/render.test.js`: `sharedEventsTable`/`compareSeriesTableN` get the same 2-/3-player treatment, checked against all four ratified display rules. One real (non-bug) wrinkle is noted in the 2-player `compareSeriesTableN` test: `alignSeriesN`'s tie-break for a series only one side played sorts across both sides together by field size, while the 2-player `alignSeries` keeps each side's own order for its only-that-side rows — same content per series, different row order at N=2; the test checks content by series key rather than asserting byte-identical markup, and does not change either function. Command: `NODE_OPTIONS="--require ./testlib/no-network.js" node --test test/view-model.test.js test/render.test.js` → `tests 29 · pass 29 · fail 0`. |
| A2-5 | NOTE, carried — Q1: the `Events` column / toggle counts vs. "no aggregate counts" | **DECLINED — awaits Noah's ruling.** Unchanged since pass 1 raised it (assumption 1 there); three UI passes (1b, 1c) correctly left it alone as "not a styling decision." This is a scope/intent question about what "no aggregate counts" was meant to ban, not a defect this seat can resolve by inspection — guessing either way (drop the column/counts, or declare them in-bounds) would be originating a ruling no input states, which the persona's do-nots forbid. | No code change. `lib/view/render.js:279,281` (`playerBody`) still renders "Every … result (N)" / "Other games (N results)" unchanged. |
| A2-6 | NOTE, carried — the Sheets leading-apostrophe guard is unverified | **DECLINED — awaits a manual check in Noah's Google account.** The guard's implementation is sound on inspection (both pass 1 and the auditor agree) and round-trips through the CSV parser in `test/export.test.js`; what's unverified is Google Sheets' own import behavior, which no offline, report-only, or repair pass can establish without actually importing a file into Noah's account. Not re-attempted here. | No code change. `docs/build-record-webapp.md`'s existing UI checklist item 8 already names the exact check to run. |
| A2-7 | NOTE — the `orderPlayers` tier-sort ruling shipped with no logged "Engineer's-choice ruling" entry | **FIXED (logged below; no behavior change — the auditor found no fault with the ruling itself).** | See "Engineer's-choice ruling, logged for A2-7" immediately below. `lib/view/model.js:182-187` (`orderPlayers`) is unchanged. |

**Engineer's-choice ruling, logged for A2-7** (originally made in out-of-band commit `59a21b0`,
pass 1's table predates it, never logged until now):

| Ruling | Options considered | Picked, and why |
|---|---|---|
| **`orderPlayers` row order with tiers present** | keep increment 1's seed-then-alphabetical order, ignoring tier · sort by tier first, seed second · **sort by seed first, then tier descending, then alphabetical** | **Seed, then tier (highest first), untiered after, then alphabetical.** `docs/design-webapp.md` only commits to "rows remain alphabetical unless `notes.json` provides seeds" — tiers aren't mentioned, since the design doc predates the tiers feature (an explicitly out-of-scope, "next increment" item in the same doc). `usage-log.md`'s tiers row says the app "sorts by tier like his sheet filter," which this ruling follows; seed is checked first because a seed is a stronger, explicit signal than a tier. No adverse behavior found by this pass or by pass 2's audit — this is a process fix (the ruling now has a record and a reason), not a behavior fix. |

### Verification

- **Full suite, clean clone, Noah's app genuinely holding 8765** (not a dummy — `netstat` showed
  PID 27888 LISTENING on 127.0.0.1:8765 throughout): `git clone --branch build/webapp <repo>
  <scratch>; cd <scratch>; NODE_OPTIONS="--require ./testlib/no-network.js" node --test` →
  `tests 132 · pass 129 · fail 0 · skipped 3 · duration 1023ms`. **No skip pattern** — the contract
  asked this pass to prove the skip pattern is no longer needed after A2-3, and this is that proof.
  The 3 skips are increment 1's pre-existing "not recorded yet" fixtures (`scripts/record-fixtures.js`
  with a real token), unrelated to this pass and unchanged.
- **Nothing outside the mutation grant was touched:** `git status --porcelain` before this pass's
  first commit showed a clean tree apart from this pass's own edits; `registry/tiers.csv`'s mtime
  (11:42 AM) is older than every commit in this pass and was re-checked after the final full-suite
  run (~19:17) — unchanged. No `.env` read outside `lib/token.js`'s existing path. No `out/` run
  folder written, deleted or rewritten (every test uses `os.tmpdir()`). No live start.gg call: every
  test in every commit above runs under `testlib/no-network.js` and passes.
- **Noah's :8765 process:** never stopped, never POSTed to, never had `updatePlayer` run against
  its `registry/tiers.csv`. One out-of-band front-end commit (`7f7c556`, "Show team toggle…",
  `app/public/*` only) landed on the branch during this pass; it does not overlap any file this
  pass touched and needed no reconciliation.

### REPORT

```
REPORT
- Overview: Repair pass on the seeding-script webapp (pass 3 of 4), disposing every pass-2 finding
  A2-1..A2-7. Three DEFECTs fixed: A2-1 (the tiers-file path is now injectable, and updatePlayer/
  the player route have real regression tests — the auditor's tag-matching repro now passes
  against a seeded temp file); A2-2 (start.gg's server-time-budget error now classifies as its own
  retryable kind with a 90s/8-try schedule, and W-L concurrency defaults to 1 in flight); A2-3
  (--port 0 now binds a real ephemeral port, proven on a clean clone while Noah's app held 8765,
  with no skip pattern needed). A2-4 (N-player compare logic) got the missing unit + render tests,
  no behavior changed. A2-5 and A2-6 are declined - both explicitly need Noah (a scope ruling and a
  Google Sheets check this pass cannot perform). A2-7's process gap is closed by logging the
  tier-sort ruling retroactively; the ruling itself stands as-is.
- Found: 7 findings (A2-1..A2-7) from pass 2's review, all dispositioned: 5 FIXED (A2-1, A2-2, A2-3,
  A2-4, A2-7), 2 DECLINED pending Noah (A2-5, A2-6).
- Ran: 4 commits on build/webapp (9a07c40 A2-1, 2b7ea7e A2-2, 526ab34 A2-3, fbe42a8 A2-4) plus this
  record. 21 new tests across test/data-tiers.test.js (new file, 8 tests), test/classify.test.js
  (+2), test/pacing.test.js (+2), test/client.test.js (+2), test/wl.test.js (+1), test/app.test.js
  (+2), test/view-model.test.js (+4), test/render.test.js (+4). Full suite on a clean clone, while
  Noah's app held 8765, with plain `node --test` (no skip pattern): 132 tests, 129 pass, 0 fail, 3
  skipped (pre-existing, unrelated).
- Attributed: core / seeding-script webapp increment 2, pass 3. STATED (dispatch-contract-webapp.md:
  "every finding FIXED or DECLINED with reasoning").
- Queued: A2-5 (Events column / toggle counts vs. "no aggregate counts") and A2-6 (Sheets
  leading-apostrophe import check) remain open, both explicitly Noah's or the next increment's -
  not re-attempted here, per the dispatch's own instruction not to guess a blocked ruling.
  Assumption 1 above (the 'time-budget' kind name) is open to a rename if Noah prefers different
  wording; it's a one-line change, isolated to lib/pacing.js/lib/startgg.js and their tests.
- Spend: no live start.gg calls (not needed; every test runs offline/in-process). No skills or
  subagents run — a single lead-engineer seat per the dispatch; Noah's global spend-sign-off rule
  was never implicated. This is pass 3 of the contract's 4 passes + at most one repair/re-review
  pair; no extra repair pair consumed.
- Parked: nothing half-done; every commit is at a green, clean state (full suite passing after
  each). Pass 4 (closing re-review) is next, per the contract - not this pass's to run.
- Needs attention: (1) A2-5 and A2-6 still need Noah directly: the Events-column/toggle-count
  ruling, and an actual Google Sheets import to check the leading-apostrophe guard. (2) Assumption
  1's 'time-budget' kind name is a naming choice, not a behavior one - flag if a different name is
  preferred. (3) The out-of-band commit 7f7c556 ("Show team toggle…", app/public/* only) landed
  mid-pass; it doesn't overlap this pass's files and needed no action, noted here only so pass 4
  isn't surprised by it.
```
