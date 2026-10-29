# Build record — seeding-ops, increment 3, build A

Contract: [`dispatch-contract-tool.md`](dispatch-contract-tool.md). Spec: [`design-tool.md`](design-tool.md).
One section per pass. Increment 1's passes 2–4 remain open ([`build-record.md`](build-record.md)) and are
due with build B (spec §Next steps, step 4).

---

## Pre-pass — snapshot and rename (orchestrating session, 2026-10-29)

Recorded here as out-of-band work per the standing rule the spec assumes (A4-6 rule (a): record every
out-of-band change before the next pass). Done by the orchestrating session on Noah's instruction
*"going with 'seeding-ops'. go ahead and change names everywhere and start the whole build."*

**Rename.** `C:\Users\iknow\repos\seeding-script` → `C:\Users\iknow\repos\seeding-ops`. Live docs,
`package.json` (name, description) and the README title updated. Historical records (`design.md`,
`design-webapp.md`, `dispatch-contract*.md`, `build-record*.md` for increments 1 and 2) keep the old
name as written. `docs/usage-log.md` line 3 notes the rename (the orchestrator's one permitted edit
there; no seat edits that file).

**Snapshot commit on `build/webapp`** (everything that was uncommitted when the spec was approved):

| what | state before | note |
|---|---|---|
| `registry/tiers.csv` | 713 insertions / 654 deletions vs HEAD | Noah's tier edits from Eclipse (107 app-set tiers). Committed as is; the T1 migration in pass 1 starts from this. |
| `conflicts/` (`pull-schedule.js`, `lib/`, `public/`, `linked.json`), `test/conflicts-schedule.test.js`, `app/server.js` (+75), `package.json` (`npm run schedule`) | untracked / modified since 2026-10-16 | the schedule-conflicts feature, built outside the seeding session; becomes T3 in build B |
| `conflicts/out/` | 7.3 MB of schedule pulls | **not committed**; added to `.gitignore` |
| `.claude/launch.json` | untracked | the app's preview launcher |
| `docs/design-tool.md`, `docs/dispatch-contract-tool.md`, this file | new | spec, contract, record |

Branch for build A: `build/tool-a` from that commit. Models: Opus for every seat (Noah's ruling).

---

## Pass 1 — lead engineer

Seat: lead-engineer persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`, Profile block,
loaded in-seat). Model: Opus. Branch `build/tool-a` from `e388fcc`. Local commits only, no push, no remote.
The two commits already on the branch were not amended.

### Terms as understood

- **Acceptance criteria:** the contract's list, items 1–11 (item 12 is pass 4's). Scope = spec steps 2
  (T1 changes) and 3 (majors per game). Nothing from build B (pool layout, `state.json`, tabs,
  lifecycle, outputs) was touched.
- **Binding sources:** `docs/design-tool.md` §T1 (table, Rules), §Display rules 5–9, the defaults in
  §Open questions; the four Ratified rows in `docs/usage-log.md` → Requirements surfaced (read only).
  Where the spec and older docs differ, the spec won.
- **Allowed work:** additive and repair inside `seeding-ops`, except the protected docs, `.env`,
  `conflicts/`, and existing `out/` folders (read only). `registry/tiers.csv` changed only through the
  migration, run once after its tests passed on copies; `registry/tiers.csv.bak` is beside it,
  uncommitted (`.gitignore` now lists `registry/*.bak`).
- **Spend/process:** no skills, no subagents, no workflows, no Ship Pipeline (contract prohibition and
  Noah's spend rule). The design doc came from the orchestrator and Noah; I did not author it.
  No start.gg calls were made; the token was never read.
- **Grounding not consulted:** the standards bank and the runbook. The contract fixes the process,
  and the runbook is known-stale by its own label. Rulings below trace to the spec, the contract or
  existing code.
- **Increment 1's passes 2–4 remain open** and are due with build B (spec §Next steps, step 4).

### Assumptions I supplied

Open-questions defaults used (spec §Open questions):

1. **Main event (rule 5):** the seeded game's largest bracket at the tournament, excluding names
   matching side / community / 2v2 / teams / "Pre-". The exclusion list is in `config/majors.json`.
2. **Recency bands:** reviewed at this tournament green; within 6 months no color; older amber; never
   reviewed grey. "6 months" is calendar months back from today, clamped to the month's last day
   (`monthsBefore('2026-08-31', 6) = '2026-02-28'`); exactly 6 months ago counts as within.
3. **Tier 0** is a real tier and sorts below 1 (already true in `orderPlayers`; now pinned by
   `test/parity.test.js` "the Sheets export …").
4. A4-6's two standing rules (record out-of-band changes; things that must agree come from one
   source or are pinned by a test): adopted. See ruling 6.

Interpretations I made where the spec is silent or loose:

5. **Exclusions are tested against both the tournament name and the event name.** The spec says
   "event names", but on the real Eclipse run the side markers are mostly in tournament names
   (`CEO 2025 Community Tournaments`, `MBAACC 2v2 @ Frosty Faustings XVII`,
   `RTM! Presents: B-Side #21 (Pre-Combo Breaker Event)`). Matching event names alone would let those
   through.
6. **"Main event at that tournament" is judged across the whole run**, not per player: the largest
   non-excluded bracket among every registrant's results. A player who only entered a smaller bracket
   at that tournament gets no major cell there.
7. **Major patterns are anchored to the start of the tournament name** (`^frosty faustings\b`, etc.),
   so a side tournament that is a separate start.gg tournament ("Vortex Gallery at Frosty Faustings
   XVIII 2026") is not that major. Before this build, Combo Breaker, Frosty and Climax were unanchored.
8. **One result per year per column:** if two tournaments of one major fall in the same calendar year,
   the one with the larger main event is the column's result for that year, the same event for every
   player. The other stays a series. It doesn't happen on the real data (see Acceptance 7).
9. **A game without its own list gets a `default` list:** the four known majors. Without one, the
   MBTL and UNI2 runs would have no major columns at all. Side effect: **Climax of Night is no longer
   a major column for MBTL or UNI2.** It is MBAACC-specific in the spec, and it was a column for every
   game before. See Needs attention 1.
10. **"Today" is the UTC date**, the calendar `decided_on` has always used (`now.toISOString()`). One
    helper (`data.todayOf`) feeds `decided_on`, `last_reviewed_on`, the same-day undo and the recency
    bands. See Needs attention 2.
11. **The page's tournament** is the run folder's `<tournament>` part (the `t` in `/e/<t>/<e>`), with
    the event slug as a fallback. A review records that slug; the route never takes it from the body.
12. **✓ on a player with no `tiers.csv` row creates one** (source `app`, no tier). ✓ never changes
    `tier`, `decided_on` or the source of an existing row. A ✓ from this tournament replaces a review
    from another tournament (that's a new review, not an erased one). Only un-✓ is restricted.
13. **Browser-storage seeded state: removed, not read.** The old `seeding:seeded:<slug>` key is
    deleted once on page load and never read. Nothing is lost: the backfill covers Eclipse's marks.
14. **The CLI view (`views/major-table.js`) now reads tiers.** It renders through the app's view
    model and context builder, so it shows the Tier column, recency and review marks the app shows.
    Before, it read `views/notes.json` only.
15. **A writer keeps columns it doesn't know.** `updatePlayer`/`reviewPlayer` write `TIER_COLS` and
    then any other column the file already has, so nothing is silently dropped. That includes an
    un-migrated file's `justification`.
16. **The Sheets export carries no recency.** Rule 9 is a color plus hover. The CSV has the tier as
    before, with no review columns. The contract doesn't ask for them, so I didn't add any.

### Engineer's-choice rulings

| ruling | options considered | picked, and why |
|---|---|---|
| Where the majors lists live | (a) a constant in `lib/view/model.js`; (b) a JSON file read by Node | (b) `config/majors.json` + `lib/view/majors.js`. Premise 9 says don't hard-code MBAACC, and the README has to say "where it lives, how to add a game" without editing code. `model.js` holds the *logic* (Acceptance 6's "in lib/view/model.js"): `mainEventMajors`, the index. A malformed file throws with the reason. A silent empty list would hide every major. |
| How the browser knows a row is a major | (a) ship patterns to the browser; (b) the server keys main-event rows to the major label in each row's existing series key `s` | (b). The browser already gets `s` per row. A major is now a series *key* the index gives only to the selected rows, so the app, CLI, compare panel and export all ask the same question (`index.keyOf(r) === label`) and no regex runs in the browser. |
| A larger excluded bracket at the same tournament (e.g. a 2v2 bigger than the main) | (a) keep `mainBrackets` = largest per tournament per player; (b) prefer the selected major row | (b) `mainBrackets(rows, prefer)`. Otherwise the 2v2 would displace the main event in the player's series grouping. Pinned by `test/majors.test.js` "the main event is judged across the run …" (a mutation removing the preference fails it). |
| ✓ route shape | (a) a `reviewed` field on `POST …/player/<id>`; (b) `POST …/player/<id>/review` | (b). The edit route's allow-list stays tier/notes. The review route takes only `{ reviewed: boolean }` and the URL's tournament. |
| Migration method | (a) parse + re-serialize with `toCsv`; (b) rewrite raw field text | (b) `lib/tiers-migrate.js`. "Byte-identical" then holds by construction: untouched fields are copied as raw text, with their quoting and each record's line ending. It also preserves the LF endings a clean clone checks out (`.gitattributes eol=lf`). It refuses if any justification has a value, or if the shape is partial. |
| One context builder | (a) app and CLI each build their own context; (b) one `R.contextFromViewModel` | (b). The owner's note on header/row drift. `app/public/app.js` and `views/major-table.js` both call it. `test/parity.test.js` shows the CLI rows equal the app rows minus the app's controls, byte for byte. |
| Tests whose expected behavior the spec redefined | weaken vs correct the oracle | Corrected, and named in-file: `test/view-model.test.js` "configured majors are keyed by label through the run index …" (was: any tournament name matching a major is keyed by label); `test/data-tiers.test.js` multi-word-tag test and route test (were: justification stored/returned; now: not stored). The render/model fixtures now get the majors list from `testlib/majors-fixture.js`; their assertions are unchanged. |

### Acceptance

Suite: `node --test` → **tests 168, pass 165, fail 0, skipped 3** (before: 144 / 141 / 0 / 3 at
`e388fcc`). The 3 skips are the same pre-existing `recorded:` fixtures ("not recorded yet: run node
scripts/record-fixtures.js with a token").

| # | item | met | evidence |
|---|---|---|---|
| 1 | `node --test` on a clean clone, offline, no regression | yes | `git clone --branch build/tool-a` into scratch, then `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` → 168 / 165 / 0 / 3. Every increment-1/2 test that passed before still passes. 4 existing tests were corrected (see rulings), none skipped or deleted. |
| 2 | T1 migration | yes | `test/tiers-migrate.test.js` (6 tests): real-file shape (712 rows, 107 app) with field-by-field raw identity, LF files, idempotence, refusals, the script on a copy (`.bak`, atomic, "already migrated"), the real file read-only. Run once on the real file: `node scripts/migrate-tiers.js` → "712 rows, 107 with source=app, 107 backfilled; columns 13 -> 14"; second run "already migrated". Parsed comparison `.bak` vs migrated: 0 value differences outside justification, 107 rows with `last_reviewed_on = decided_on` and `eclipse-1st-cour`. Commit `e23581b`. |
| 3 | ✓ semantics | yes | `test/review.test.js`: "✓ sets … through the shared tier-row matcher", "un-✓ is a same-day undo only …" (earlier day, other tournament, same day, next day), "✓ for a player with no tiers row …", "route: POST …/review …". Browser storage: removed (assumption 13); pinned by "the editor: … the ✓ no longer reads browser storage". |
| 4 | Reviewed row display | yes | `test/review.test.js` "recency bands …" (all four bands, hover text, month clamping), "the ✓ column sorts reviewed and unreviewed apart …", route test (green row, `rec-here`, hover after a second app instance reads it). Live run (below): 107 green rows, `rec-here` background `rgb(191, 227, 201)`. |
| 5 | Editor, no reason prompt; `decided_on` on tier change | yes | `test/review.test.js` "the editor: tier and notes only …" (source pin) and "a tier edit still stamps decided_on …"; existing `test/data-tiers.test.js` "decided_on is stamped only when the tier value actually changes". Live: the tier popover has one input (`ed-tier`). |
| 6 | Majors per game | yes | `test/majors.test.js` (8 tests): shipped config (MBAACC's six, kinds, exclusion list, default), loader errors, **"a Frosty Faustings with a Guilty Gear main and an MBAACC side bracket gives no MBAACC Frosty cell"**, **"a Climax of Night field gets its own column for MBAACC …"**, **"one result per year per column …"**, main event across the run, the Eclipse side events, the ratified rules on major cells in summary / compare / export. Existing `test/render.test.js` rule 1–4 tests and "A4-1 — summary header and row cell counts always agree" pass with per-game majors. |
| 7 | Real data (Eclipse, read-only) | yes | Table below; script `scratchpad/realcheck.js` (summaryExport + viewModel on `out/eclipse-1st-cour__…`). `out/` sha1 list before = after (56 files); the Eclipse folder matches the hash taken before the first edit. |
| 8 | `GET /`, event pages, CLI parity | yes | Real `out/` through `createApp` (read-only): `GET /` 200 with 3 event links; each event's page, data and export 200. All 6 finished run folders render through `viewModel` + `summaryRow` + `summaryExport`. `test/parity.test.js` "the CLI view prints exactly the app's summary cells …" and "the Sheets export has the CLI's columns …"; `test/wl.test.js` CLI end to end. |
| 9 | `.env` never served; 404s | yes | `test/app.test.js` ".env is never served; paths outside … are 404" passes, unchanged. |
| 10 | README | yes | Commit `7bf7b9d`: App section (✓ as review, recency colors, no reason field, majors config: where, how to add a game or a major); Code layout lines for `majors.js` and the migration script. |
| 11 | `docs/usage-log.md` not edited | yes | `git diff e388fcc -- docs/usage-log.md` is empty. |

**Acceptance 7 counts** (Eclipse summary, Sheets export of the same table; "dup" = players with two or
more results in one year in that column):

| column | before (e388fcc): players / lines / dup | after: players / lines / dup |
|---|---|---|
| CEO | 10 / 14 / 0 (every one a "CEO 20xx Community Tournaments" side event) | column gone: MBAACC had no main event at CEO in the window |
| Combo Breaker | 80 / 95 / 2 | 77 / 77 / 0 (COMBO BREAKER 2026 only; 2025's MBAACC was in the "Community Tournaments" event) |
| Frosty Faustings | 61 / 103 / **20** | 61 / 79 / **0** (XVII 2025, 145 entrants; XVIII 2026, 133) |
| Climax of Night | 85 / 143 / 17 | 83 / 124 / 0 (Season 6, 192; Final Season, 245) |

Selected main events: 5, all game 22407 (`major rows from a game other than 22407: 0`). Recency on the
Eclipse page: 107 `here` (green), 75 `never` (grey); players with an app-set tier: 107, without the
Eclipse color: **0**.

**Live run** (directive 12, not a substitute for the orchestrator's check): `node app/server.js --port
8799` with `SEED_TIERS_FILE` pointing to a scratch copy, so no click touched `registry/tiers.csv`
(its sha1 `ffb8898…` is unchanged). In the preview browser: ✓ on an unreviewed row turned it green,
`aria-pressed=true`, `rec-here`, the hover read "Last reviewed 2026-10-29 at eclipse-1st-cour (this
tournament)", and the server's data agreed. ✓ again the same day cleared it (`rec-never`). ✓ on a row
reviewed 2026-10-16 left it green, with the message "… was reviewed here on 2026-10-16; a click only
undoes a review made today, so that review stays." No console errors.

### Could not verify

- **Two real browser profiles.** Cross-browser persistence is shown with two app instances over one
  file (`test/review.test.js` route test) and by the mark being server data. Two profiles: the
  orchestrator's checklist.
- **Visual judgment of the colors** (contrast and how the green tier cell reads inside a green row)
  beyond the computed background. A 0.6-scale screenshot was taken; not reviewed for design.
- **The A2-6 Sheets import** of `= + - @` tags is still unverified in Sheets itself, as before.
- **Midnight behavior** in Noah's timezone (assumption 10). Reasoned from the code, not observed.

### UI checklist for the orchestrator

Start the app (`npm start`), open `/e/eclipse-1st-cour/bloody-fights-mbaacc-singles`.

1. **Majors per game:** the major columns are **Combo Breaker, Frosty Faustings, Climax of Night**
   (no CEO). A player with both Frosty years shows two lines, '26 and '25, never two of one year.
   Expand a player who played "MBAACC 2v2 @ Frosty Faustings XVII": it is under Other series, not
   in the Frosty column.
2. **Recency color:** 107 Tier cells green (reviewed at Eclipse), 75 grey (sheet-only, never reviewed).
   No amber yet; nothing is older than 6 months.
3. **Hover** a green tier: "Last reviewed 2026-10-16 at eclipse-1st-cour (this tournament)" (dates vary
   by player). Hover a grey one: "Never reviewed (tier from the sheet import)".
4. **✓ persistence across two browser profiles:** in profile A, click ✓ on an unreviewed (grey) row.
   It turns green. In profile B (a different browser profile, fresh load), the same row is green with
   today's date on hover. Click ✓ again in A the same day: the row clears; reload B: cleared.
   **This writes `registry/tiers.csv`.** Do it on a throwaway row and undo it the same day, or
   point `SEED_TIERS_FILE` at a copy.
5. **Earlier review is kept:** click ✓ on a row green from 2026-10-16. It stays green, and the message
   line explains why.
6. **Sort:** click the Seeded header. Reviewed and unreviewed rows group together; click again to
   reverse.
7. **Editor:** double-click a Tier cell. One field, "Tier", with no Reason. Change it, press Enter, and
   the hover/`decided_on` updates. Notes: double-click, edit, Enter.
8. **Other runs:** open `/` and both Crescendo events. They load. MBTL shows Combo Breaker + Frosty;
   UNI2 shows CEO, Evo, Combo Breaker, Frosty; Climax of Night is a series there (Needs attention 1).
9. **Compare panel:** tick two players. The compare summary rows show the same major cells and tier
   colors as the table.

### REPORT

```
REPORT
- Overview: Build A pass 1 is built and committed on build/tool-a (code head 7bf7b9d).
  config/majors.json now holds the majors lists, one per game, and a major column shows only the
  seeded game's main event, one result per year. The ✓ writes last_reviewed_on/_tournament to
  registry/tiers.csv, the Tier cell shows recency with hover, and the editor has no reason prompt.
  The T1 migration ran once on the real file (712 rows, 107 backfilled). node --test: 168 tests,
  165 pass, 0 fail, 3 skipped, on the working tree and a clean clone.
- Found: Acceptance 1–11, all doable in-window and done. Acceptance 12 is pass 4's.
- Ran: commits 1aeb72b (code), 90b8d31 (migration script + tests), e23581b (tiers.csv migrated),
  7bf7b9d (README), plus this record. Evidence: the test names in the Acceptance table; real-data
  counts from scratchpad/realcheck.js (Frosty two-in-one-year players 20 -> 0, app-tier players
  without the Eclipse color 0); a live browser run against a scratch tiers copy.
- Attributed: core / seeding-ops increment 3 build A. STATED: dispatch-contract-tool.md,
  design-tool.md.
- Queued: nothing parked. Out of the Acceptance list, so reported and not built: A2-5's count
  labels; recency columns in the Sheets export.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 1 of 4. No skills, subagents or
  workflows. start.gg requests 0 of the 20/60 s budget. Token never read.
- Parked: none. Tree clean at the record commit. registry/tiers.csv.bak is beside the real file,
  uncommitted, until pass 4 approves; delete it then.
- Needs attention:
  1. Climax of Night is no longer a major column for MBTL (36865) or UNI2 (50203). Only MBAACC's list
     has it; other games get the default four. If you want it there, add those games to
     config/majors.json. (Their Crescendo runs show it as a series now.)
  2. "Today" is the UTC date, as decided_on always was. A review after 8 pm EDT / 7 pm EST is
     stamped tomorrow's date, and the same-day undo follows the UTC day. The alternative is the
     machine's local date for every T1 date (one helper, data.todayOf).
  3. Interpretations to confirm: exclusions match tournament OR event names (the spec says event
     names; the real side markers are in tournament names); major patterns anchored to the start of
     the tournament name; the main event is judged across all registrants; the CLI view now shows
     tiers and review marks like the app.
  4. CEO disappears from the Eclipse table. All 10 players' CEO results were "Community Tournaments"
     side events, which is right under rule 5, but it is a visible change.
  5. A2-5 ("(N results)" labels, the series Events column) is untouched; it was not in this
     contract's list.
  6. Increment 1's passes 2–4 remain open, due with build B.
```

---

## Pass 2 — engineering auditor

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block). Model: Opus. Report-only: no source, test, config or data file edited; this section is
the only change. Reviewed the handoff at `3e67359` (code head `7bf7b9d`), pass 1's commits `1aeb72b`,
`90b8d31`, `e23581b`, `7bf7b9d`, `3e67359` on `e388fcc`. No skills, subagents or workflows. No start.gg
calls; the token was never read (every script I ran used `testlib/no-network.js` or touched no client,
and the app was built with a `getToken` that throws). All exercise of write paths ran on copies in a
scratch folder; `out/` and `registry/` were read only.

### Terms as understood

- **Comparand:** `docs/dispatch-contract-tool.md` Acceptance 1–11 (12 is pass 4's), the spec
  `docs/design-tool.md` §T1, §Display rules 5–9, §Open questions defaults, and the Ratified rows in
  `docs/usage-log.md` → Requirements surfaced. The handoff's "Terms as understood" and "Assumptions I
  supplied" are the drift comparand.
- **Drift check, builder's terms vs the contract:** the builder's terms match the contract (scope,
  grants, prohibitions, `.bak`, no build-B work). Four assumptions go past the literal ask; I judged
  each by user impact:
  - **9 (a `default` majors list):** not asked for, but without it the MBTL and UNI2 runs lose every
    major column, which Acceptance 8 ("the event page still works for every existing run folder")
    would not tolerate, and its four entries are exactly rule 5's named known majors. In scope as
    built. Its side effect is B2-2.
  - **14 (the CLI view reads tiers):** required by Acceptance 8's "the CLI view renders the same
    cells as the app (parity test)"; the app has a Tier column, so the CLI must too. In scope. Side
    effect: B2-5.
  - **15 (the writer keeps unknown columns):** small and defensive; changes nothing on the migrated
    file. Fine.
  - **5 (exclusions match the tournament name or the event name):** the contract says "excluding
    names matching", the spec says "event names". On the real data the tournament-name match is what
    keeps "CEO 2025/2026 Community Tournaments" out of a CEO column, which is the point of rule 5.
    Fine; Noah to confirm (handoff Needs attention 3).
- **Rulings on the handoff's Needs attention 1–6:** 1 is a finding routed to Noah (B2-2, with
  evidence). 2 is Noah's call; the default is defensible (B2-6). 3 is fine as built (see above and
  B2-5). 4 is correct under rule 5 and needs no change; Noah should expect it. 5 is out of this
  contract, correctly left alone. 6 is correctly recorded.

### What I re-ran

| what | command / method | result |
|---|---|---|
| suite, working tree | `node --test` (Node v24.14.1) | tests 168, pass 165, fail 0, skipped 3 |
| suite, clean clone, offline | `git clone --branch build/tool-a` into scratch (HEAD `3e67359`), `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` | 168 / 165 / 0 / 3, matches the claim |
| before-state | clone checked out at `e388fcc`, same offline command | 144 / 141 / 0 / 3, matches the claim |
| test names, before vs after | sorted pass/skip lines of both runs, `comm` | 24 new tests; one renamed (`model: configured majors and Boston Blue Beat are keyed by label, not name` → `… keyed by label through the run index …`); none removed; the same 3 `recorded:` skips |
| changed existing tests | `git diff e388fcc 3e67359 -- test/data-tiers.test.js test/render.test.js test/view-model.test.js` | see Acceptance 1 and B2-4 |
| migration, column by column | my own raw CSV splitter (not `lib/tiers-migrate.js`) on `registry/tiers.csv.bak` vs `registry/tiers.csv` | BOM on both; 713 records each; header 13 → 14 columns (`justification` gone, `last_reviewed_on`, `last_reviewed_tournament` after `decided_on`); **0 raw-field differences** in any carried column; 0 line-ending differences; 0 unquoted fields; 0 non-empty justifications in the `.bak`; 107 `source=app` rows, all with `decided_on`; those 107 and only those backfilled, with `last_reviewed_on = decided_on` (all `2026-10-16`) and `eclipse-1st-cour` |
| migration reproduces the real file | copy of the `.bak` → `node scripts/migrate-tiers.js <copy>` | "712 rows, 107 with source=app, 107 backfilled; columns 13 -> 14"; result sha1 `ffb8898…` = the real `registry/tiers.csv` |
| idempotence | the script again on that output, and on a copy of the real file | "already migrated … Nothing written"; sha1 unchanged |
| `.bak` = pre-pass file | line-ending-normalized sha1 of `.bak` vs `git show e388fcc:registry/tiers.csv` | equal (`b8f2d3b…`) |
| committed file | `git ls-files --eol registry/tiers.csv` | index LF, working tree CRLF (`core.autocrlf=true`), clean clone LF; normalized content equal |
| app writer on the migrated file | `parseCsv` → `toCsv` round trip | byte-identical on the working-tree file, so a first ✓ does not reformat it |
| ✓ / un-✓ semantics | `data.reviewPlayer` on a scratch copy of the Eclipse run and a scratch tiers copy, plus a second run folder named `next-event__…` | as specified for single clicks; the two-click case is B2-1; the leftover row is B2-3 |
| real data, Acceptance 6/7 | my script: `data.loadRun` + the index on a scratch copy of `out/eclipse-1st-cour__bloody-fights-mbaacc-singles__20261015-0925`, before (the `e388fcc` clone's code and the `.bak`) and after | table under Acceptance 7; matches the builder's counts exactly |
| every run folder | `data.loadRun` on all 6 folders, before and after | major columns listed under Acceptance 8 |
| routes | `createApp` over a scratch copy of all of `out/`, via `testlib/inject.js`, offline | `GET /` 200 with 3 event links; each event's page, `data` and `export.csv` 200; `/.env`, `/static/../.env`, `/%2e%2e/.env`, `/static/.env`, `/registry/tiers.csv`, `/out/x`, `/config/majors.json` all 404 |
| `out/` untouched | sha1 of all 56 files before my work vs after; `find out -newermt 2026-10-28` | identical; no file newer than 2026-10-28 |
| protected files | `git diff --stat e388fcc HEAD --` usage-log, the three designs, the contracts, increment 1/2 records, `.env`, `conflicts/`, `lib/run.js`, `lib/output.js`, `lib/startgg.js`, `pull.js`, `seed.js` | empty |
| commits | `git show --stat` of each pass-1 commit; `git reflog` | contents as the record says; tests (`90b8d31`, 09:23:47) committed before the migration commit (`e23581b`, 09:24:03) |

### Findings

**B2-1 — FINDING, routed to Noah (needs a ruling) — a misclick ✓ followed by its undo erases the
earlier review.** Spec §T1 Rules: un-✓ "is an undo for a misclick only … A review recorded earlier is
never destroyed by a click." Contract 3: "a review from another tournament is never cleared." The
README added in `7bf7b9d` promises "an earlier review is never erased by a click." Each single click
behaves as specified, but ✓ overwrites the earlier review and un-✓ then clears both fields instead of
putting the earlier one back. Reproduced on scratch copies (`data.reviewPlayer`), player 10482,
reviewed `2026-10-16` at `eclipse-1st-cour`:

```
✓ at next-event, 2026-11-02   -> last_reviewed_on 2026-11-02, last_reviewed_tournament next-event
un-✓ same day                 -> last_reviewed_on "",         last_reviewed_tournament ""
after: the Eclipse review is gone; the tier cell turns grey with the hover
"Never reviewed (tier from the sheet import)", which is also wrong for an app-set tier.
```

User impact: this happens at the next event, the first one after Eclipse, where every one of the 107
backfilled reviews is one misclick and one undo from being lost. That is the success criterion the
backfill exists for. The contract's single-click wording is met, so this is not a contract miss. But
the fix is a choice the builder may not make: where the earlier review lives during the undo. Options:
(a) the page sends back the pair it showed before the click, and the route restores it, which means
the route accepts review values from the body for this one case; (b) the server keeps the replaced
pair in memory for the same-day undo, which is lost on restart; (c) a stored "previous review" pair,
which changes the T1 table; (d) accept the behavior and correct the README sentence and the hover
text. Resolves when Noah picks one and pass 3 builds it with a test for the two-click sequence.

**B2-2 — FINDING, Noah's call — Climax of Night is no longer a major column for MBTL, and by Noah's
own rule 6 it would qualify.** This is the builder's Needs attention 1, with the evidence it lacked.
Real MBTL data (`out/crescendo-of-night-3-episode-0__allegro-mbtl-pc__20261014-1909/results.csv`,
read only): Climax of Night MBTL Singles had 142 and 158 entrants; Frosty Faustings MBTL had 85 and
73; Combo Breaker 96 and 157. Rule 6 adds a series of the game "whose field is at least as large as a
known major's field for that game". Before this build the MBTL page had a Climax of Night column; now
it does not (all three MBTL folders: `["Combo Breaker","Frosty Faustings"]`). The usage log's
candidate row ("CEO/Evo/CB/FF/Climax of Night") also lists it with the other majors. Resolves with no
code change: if Noah agrees, add a `36865` list to `config/majors.json` (the README already explains
how). UNI2 (`50203`) is his call the same way.

**B2-3 — NOTE — ✓ then un-✓ on a player with no tiers row leaves an empty row.** On a scratch copy,
player 530924 had no row: ✓ created one, un-✓ cleared the review, and the file kept
`"22407",…,"530924","HARD_BREAD","HARD_BREAD","","","","","","app","","",""` (713 → 714 records). No
display effect, since `readNotes` skips such rows. But the undo does not put the file back the way it
was, and the empty rows end up in Noah's tiers table and any Sheets import of it. Resolves by having
un-✓ remove a row that holds nothing but this review (undo restores the earlier state; no product
choice involved), with a test.

**B2-4 — NOTE — the record names four corrected tests; a fifth existing test changed too.**
`test/view-model.test.js` "model: column choice — majors only if someone played them …" had its CEO
rows' `event_date` changed to 2024/2025/2026. This is justified by rule 5: with one shared date, the
three CEO tournaments would fall in one year and collapse to one. It is not a weakening, but the
handoff's list of changed tests should include it (A4-6's rule: record every change). Also, the
route test no longer sends `justification` through the route. The "sent anyway, not stored" case is
now covered only at `updatePlayer` level. That is acceptable because the route's allow-list drops it.
Resolves with one line in pass 3's record.

**B2-5 — NOTE, Noah's call — the CLI's HTML file now carries Noah's tiers, notes and review marks.**
`views/major-table.js` describes its output as "a file you can keep or send". Since this build it
renders from `data.viewModel`, so `views/major-table.html` includes the Tier column, recency, and the
notes from `registry/tiers.csv`. Acceptance 8 requires this, and I judge it correct. Noah should know
before he sends that file to anyone. Resolves by Noah acknowledging it; no change asked.

**B2-6 — NOTE, Noah's call — "today" is the UTC date** (handoff Needs attention 2). Confirmed: a ✓ at
23:30 EST on 2026-11-02 (`2026-11-03T04:30Z`) is stamped `2026-11-03`. The same-day undo and the
hover follow the UTC day. This is the calendar `decided_on` has always used, so the default is
defensible. Changing it later is one helper (`data.todayOf`), but dates already written stay UTC.

**B2-7 — NOTE — out-of-band change during this pass, not yet in the record.** Commit `73a085a`
("launch.json: the app listens on 8765, not 3000", co-authored by Claude Fable 5.1, 09:30:42) landed
on `build/tool-a` during pass 2, after the handoff commit. It changes one line in
`.claude/launch.json` and is harmless. A4-6 rule (a) asks the orchestrating session to record it
before pass 3. Related: `registry/tiers.csv`'s mtime is 09:29:36, later than the migration commit
(09:24:03) and the record commit (09:27:24). Its content is byte-identical to the migration's output
and git sees no change, so no data changed. I could not tell what touched it. The app writer's round
trip is byte-identical, so a ✓ and its undo through the real file would look exactly like this. If
the orchestrator's UI check clicked against the real file, the record should say so.

**B2-8 — NOTE — README layout slip.** In the Code layout list, the existing continuation line
"`lib/view/export.js`: the Google Sheets CSV." (`README.md:233`) now sits under the new
`scripts/migrate-tiers.js` bullet, so it reads as part of the migration's entry. Resolves by moving
it under `lib/view/data.js` or giving it its own bullet.

No RETURN-level finding. Comprehension: the code diff is about 1,400 lines across 22 files (plus the
migrated CSV) and reads in one sitting. Majors live in one config file and one function
(`mainEventMajors`). The app, the CLI and the export share one context builder
(`contextFromViewModel`). I could follow every acceptance path from the code.

### Acceptance

| # | item | met | my evidence |
|---|---|---|---|
| 1 | `node --test` on a clean clone, offline, no regression | yes | 168 / 165 / 0 / 3 on a clean clone with `no-network.js` (before: 144 / 141 / 0 / 3). Every pre-existing test name still passes except the one renamed in place. Changed existing tests: data-tiers multi-word and route tests (justification dropped from T1), view-model majors test (oracle moved to the index, same cases plus a per-game case), view-model column-choice fixture dates (rule 5's one-per-year, B2-4), render fixtures (majors list passed in, assertions unchanged). Each traces to a spec change; none skipped or deleted. |
| 2 | T1 migration | yes | My column-by-column raw diff: 0 differences outside the dropped and added columns; BOM, quoting and CRLF kept; exactly the 107 `app`+`decided_on` rows backfilled. Re-running the script on a `.bak` copy reproduces the real file byte for byte; a second run writes nothing. `test/tiers-migrate.test.js` covers the 712/107 shape, LF, idempotence and refusals. |
| 3 | ✓ semantics | yes, with B2-1 | `data.reviewPlayer`: ✓ writes today plus the URL's tournament through `matchTierRow`; un-✓ on another day or at another tournament is a no-op (`"changed": false`, on the real Eclipse data). Route test and unit tests pass. Browser storage: removed, never read (`localStorage.removeItem` once in `app.js`). The two-click sequence breaks the spec's "never destroyed" promise (B2-1). |
| 4 | reviewed row display | yes | `summaryRow`: `reviewed-row` only when `last_reviewed_tournament` equals the page's tournament; `rec-here` / `rec-old` / `rec-never` on the Tier cell; hover "Last reviewed <date> at <slug>". On Eclipse: 107 `here`, 75 `never`, 0 others (today 2026-10-29). ✓ column `data-v` 1/0 for the sort. Not checked in a browser (orchestrator's checklist). |
| 5 | editor, no reason prompt; `decided_on` | yes | `app.js` diff: the Reason input and its field are gone; the route's allow-list is `tier`, `notes`; `updatePlayer` stamps `decided_on` on a tier change (existing test plus `review.test.js`). |
| 6 | majors per game | yes | `config/majors.json` holds the MBAACC six with the right kinds, the exclusion list in the same file, and `default`. The logic is in `lib/view/model.js` `mainEventMajors`. The required tests exist and pass: Frosty GG main / MBAACC side gives no cell; Climax column for MBAACC; one per year; the four ratified rules on summary, compare panel (the same `summaryRow` the panel uses, `app.js` `renderCompare`) and export; header/row parity A4-1. |
| 7 | real-data check | yes | Eclipse, my recount. Before → after (players / lines / players with two in one year): CEO 10/14/0 → column gone (only "Community Tournaments" brackets); Combo Breaker 80/95/2 → 77/77/0; Frosty Faustings 61/103/20 → 61/79/0; Climax of Night 85/143/17 → 83/124/0. Every major cell is game 22407; selected main events: 5. The 20 duplicate Frosty players came from MBAACC 2v2s, not other games: before, the column already held only game 22407 rows. Players with a non-major series labelled like a major column: 0. Players with an app-set tier: 107; without the Eclipse color: 0. |
| 8 | `GET /`, event pages, CLI parity | yes | All 3 event pages, data and export 200 over a copy of `out/`. Major columns after: Eclipse `Combo Breaker, Frosty Faustings, Climax of Night`; MBTL ×3 `Combo Breaker, Frosty Faustings` (was + CEO, Climax of Night); UNI2 ×2 `CEO, Evo, Combo Breaker, Frosty Faustings` (was + Climax of Night). `test/parity.test.js` compares the CLI's rows with the app's rows minus its controls, byte for byte, and the export's columns and major cells. |
| 9 | `.env` never served; 404s | yes | 7 probe paths 404 (table above); `test/app.test.js` unchanged and passing. |
| 10 | README | yes, with B2-8 | `7bf7b9d` covers ✓ as review, recency colors, no reason field, and `config/majors.json` (where, how to add a game or a major). The sentence "an earlier review is never erased by a click" depends on B2-1. |
| 11 | `docs/usage-log.md` not edited | yes | `git diff e388fcc HEAD -- docs/usage-log.md` empty. |
| 12 | closing approval | pass 4's | — |

### Could not verify

- **Browser behavior:** two profiles, colors as rendered, hover, the editor, sort clicks. These are
  the orchestrator's checklist items 1–9. I verified the same paths in code and tests only.
- **The builder's live run and its scratch script** (`scratchpad/realcheck.js` is not in the repo).
  I recomputed its counts myself and they match. Its screenshots I could not see.
- **The exact order "tests passed on a copy, then the real file was migrated."** The commit order
  supports it (`90b8d31` 09:23:47, `e23581b` 09:24:03). The `.bak`'s mtime (09:23:53) falls between
  them, so whether the suite was green at the moment of migration rests on the record.
- **What touched `registry/tiers.csv` at 09:29:36** (B2-7). Content unchanged.
- **The A2-6 Sheets import**, still untried, as before.

### Verdict: APPROVE WITH FINDINGS

Covers Acceptance 1–11 against the artifact at `3e67359` (code `7bf7b9d`), checked by re-running the
suite on a clean offline clone, diffing the migrated file column by column against its `.bak`,
re-running the migration for idempotence, exercising the ✓ routes on copies, and recounting the
Eclipse majors myself. Every item is met. The build reads clearly, and it stays inside build A: no
pool layout, no `state.json`, no changes to the pull.

Two findings need Noah before pass 4 can close cleanly. **B2-1** (misclick + undo erases the earlier
review) needs a ruling on what undo restores; the loop continues on the rest while it waits. **B2-2**
(Climax of Night for MBTL) is a config line if he says yes. Pass 3 can fix B2-3, B2-4 and B2-8
without a ruling. B2-5 and B2-6 need only his acknowledgment. B2-7 is the orchestrator's to record.

Not judged: anything only a browser shows (see Could not verify), and visual design. Increment 1's
passes 2–4 remain open and are due with build B.

### REPORT

```
REPORT
- Overview: Pass 2 (engineering auditor, report-only) reviewed build A at 3e67359. Acceptance 1–11
  all hold on the artifact: 168/165/0/3 on a clean offline clone (before 144/141/0/3), the
  migration is byte-identical outside its three columns and idempotent, and the Eclipse majors
  recount matches pass 1 (Frosty two-in-a-year players 20 -> 0). Verdict: APPROVE WITH FINDINGS. One
  finding needs Noah's ruling before pass 4 can close cleanly: a misclick ✓ plus its undo erases the
  earlier review.
- Found: B2-1 FINDING (needs Noah: ✓ then un-✓ at a new tournament erases the earlier review; spec
  and README promise it never does); B2-2 FINDING (Noah's call: Climax of Night dropped for MBTL,
  and its MBTL fields of 142/158 beat Frosty's 85/73 under his rule 6); B2-3 NOTE (✓ + un-✓ leaves
  an empty tiers row; pass 3 can fix); B2-4 NOTE (a fifth changed test, justified, not listed);
  B2-5 NOTE (CLI HTML now carries tiers and notes; acknowledge); B2-6 NOTE (UTC "today";
  acknowledge); B2-7 NOTE (out-of-band commit 73a085a during pass 2; orchestrator to record);
  B2-8 NOTE (README list slip). No RETURN.
- Ran: node --test on the working tree, on a clean clone offline, and at e388fcc; test-name diff;
  my own raw CSV column diff of tiers.csv.bak vs tiers.csv; migration replay on copies; ✓ and
  un-✓ scenarios on scratch copies; Eclipse and all-run majors recount, before and after; route
  probes over a copy of out/. Evidence: this section in docs/build-record-tool.md, one commit.
- Attributed: core / seeding-ops increment 3 build A. STATED: dispatch-contract-tool.md,
  design-tool.md.
- Queued: B2-1's repair, waiting on Noah's ruling (options a–d in the record). The fix needs a
  choice the builder may not make, so it goes to the caller instead of the repair loop.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 2 of 4. No skills, subagents or
  workflows. start.gg requests 0. Token never read. out/ and registry/ read only; all writes on
  scratch copies.
- Parked: none. registry/tiers.csv.bak stays until pass 4 approves.
- Needs attention:
  1. B2-1: pick what un-✓ restores after a misclick replaced an earlier review: (a) the page sends
     the prior pair back, (b) the server remembers it for the day, (c) a stored previous-review
     pair, (d) accept it and fix the README and hover text.
  2. B2-2: add a Climax of Night list for MBTL (36865), and UNI2 (50203) if wanted? One config edit.
  3. B2-5 / B2-6: acknowledge that the CLI's HTML file now holds your tiers and notes, and that
     review dates are UTC days.
  4. B2-7: the orchestrator records commit 73a085a, and whether its UI check wrote the real
     registry/tiers.csv (mtime 09:29:36, content unchanged).
```

---

## Orchestrator verification after pass 1, and rulings for pass 3 (2026-10-29)

Recorded per A4-6 rule (a) before pass 3 starts. Written by the orchestrating session.

### UI checklist (pass 1's list, run in the session's browser pane against the live app on 8765)

| item | result |
|---|---|
| 1 Majors per game | Eclipse page columns: Combo Breaker, Frosty Faustings, Climax of Night. No CEO. Frosty shows one line per year ('26 and '25). |
| 2 Recency color | 107 Tier cells `rec-here`, 75 `rec-never`, counted in the DOM. |
| 3 Hover | 107 × "Last reviewed <date> at eclipse-1st-cour (this tournament)", 75 × "Never reviewed (tier from the sheet import)". |
| 4 ✓ persistence | **Done against the real `registry/tiers.csv`** (this is what touched it at 09:29:36, B2-7): ✓ on Skeleton (sheet-only row) wrote `2026-10-29` / `eclipse-1st-cour` to disk; ✓ again the same day cleared both; the file came back byte-identical (git saw no change). A second browser profile reads the server, so the disk write is the persistence. |
| 5 Earlier review kept | ✓ on Aster Laker (reviewed 2026-10-16) left the review unchanged. **The status line stayed empty**; the "message line explains why" the record describes did not show within 1.2 s. Minor; pass 3 may check. |
| 6 Sort | Seeded header click groups 75 unreviewed then 107 reviewed; second click reverses. (A first attempt hit the header's ❄ button instead; the column is always frozen, so no effect.) |
| 7 Editor | Double-click on a Tier cell: one field labeled Tier, no Reason. |
| 8 Other runs | Via the data API: MBTL majors = Combo Breaker, Frosty Faustings; UNI2 = CEO, Evo, Combo Breaker, Frosty Faustings; Eclipse as above. Index lists all three events. |
| 9 Compare | Panel headers match the table's columns; its Tier cells carry the same recency classes. |

### Out-of-band change (B2-7)

Commit `73a085a` (`.claude/launch.json`: port 3000 → 8765) was the orchestrator's, made so the app
could be previewed; it landed during pass 2 and is harmless. Recorded here.

### Rulings for pass 3

Noah authorized the whole build to run ("start the whole build … use subagents"). Where a finding
needs his ruling, the orchestrator proceeds on a stated default, marked **amendable**, and flags it
at the top of the final report.

| finding | ruling | basis |
|---|---|---|
| B2-1 | **Option (a), amendable.** On un-✓ the page sends the pair it displayed before the ✓ (date and tournament, possibly blank); the route restores that pair only when the row's current review equals this tournament and today, else it is a no-op. The route accepts review values from the body for this one case only. Add the two-click test (✓ at a new tournament, un-✓ same day, earlier review back). | Spec §T1 Rules: "A review recorded earlier is never destroyed by a click." (a) keeps T1's columns as specified and survives restarts; (b) does not survive a restart; (c) changes the table. Noah may pick (c) or (d) later. |
| B2-2 | **Add Climax of Night (`game`) to a `36865` (MBTL) list, amendable.** Leave UNI2 (`50203`) on the default list. | Rule 6's own test on the real MBTL data (142/158 vs Frosty 85/73). UNI2's data is 5 players; no basis. |
| B2-3 | Fix: un-✓ removes a row that holds nothing but this review. | Undo restores the prior state; no product choice. |
| B2-4 | Record the fifth changed test in pass 3's section. | A4-6 rule (a). |
| B2-5 | Acknowledged as the orchestrator's default: the CLI HTML carries tiers and notes. Flagged to Noah. | Acceptance 8 requires parity. |
| B2-6 | Acknowledged: UTC "today", as `decided_on` always was. Flagged to Noah. | Consistency with existing dates. |
| B2-8 | Fix the README list slip. | Record accuracy. |
| item 5 above | Check whether the no-op un-✓ shows its explanation in the status line; fix if the message is never rendered. | Pass 1's own checklist promised it. |
