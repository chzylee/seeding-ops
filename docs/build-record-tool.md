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
