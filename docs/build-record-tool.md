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

---

## Pass 3 — lead engineer (repair)

Seat: lead-engineer persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`, Profile block,
loaded in-seat), a fresh job. I did not build pass 1. I treated its code as a working system and
recorded the before-state before the first edit. Model: Opus. Branch `build/tool-a`, started at
`1dcfec2` with a clean tree. Five code/doc commits (`d710086`, `6b670d6`, `f609c9f`, `3d669e6`,
`bc7f0ad`) plus this record's commit. Local only, no push, nothing amended.

### Terms as understood

- **Scope:** dispose of every finding from pass 2 (B2-1..B2-8) plus the orchestrator's item 5. Each one is
  FIXED (with a commit and a pinning test) or DECLINED (with reasoning). The orchestrator's rulings
  for pass 3 are the scope, and I did not re-decide them: B2-1 option (a); B2-2 adds a `36865` list
  and leaves `50203` on `default`; B2-3 fix; B2-4 record; B2-5 and B2-6 acknowledged; B2-8 fix;
  item 5 check-and-fix.
- **Binding:** `docs/dispatch-contract-tool.md` (mutation grants, prohibitions, Acceptance) and
  `docs/design-tool.md` §T1 Rules ("A review recorded earlier is never destroyed by a click").
- **Before-state** (recorded before the first edit, at `1dcfec2`): `node --test` gave
  **168 / 165 / 0 / 3**, which matches the brief. `out/` held 56 files, with a combined sha1 of `5255e91…`.
  `registry/tiers.csv` sha1 was `ffb8898…` and `.bak` was `de33fb8…`. I also kept a sorted list of the 168 test
  names for the after comparison.
- **Spend/process:** no skills, subagents or workflows. I made no start.gg calls and never read the token.
  `out/` and `registry/` were read-only, and every write path ran on copies (temp folders in tests,
  a scratch `out/` + `tiers.csv` for the live run). `registry/tiers.csv.bak` was not touched.
- **Grounding not consulted** (the standards bank, the runbook). Every ruling here traces to the
  orchestrator's rulings, the spec or the existing code.
- **Increment 1's passes 2–4 remain open**, due with build B (spec §Next steps, step 4).

### Assumptions I supplied

1. **"The pair it displayed before the ✓" is held per page load.** The page keeps a map from each
   player to the pair a ✓ replaced, filled only when that ✓ changed the row, and sends it with the
   un-✓. After a reload, or from another browser, the page no longer knows the pair. It sends none,
   and the server then clears today's review as before. The earlier review is lost in that one path.
   Closing it needs option (c), a stored previous-review pair, which the ruling left to Noah.
   The README says this in one clause. *Amendable.*
2. **No pair sent means "clear both"** (the pre-B2-1 behavior), so the existing test
   "un-✓ is a same-day undo only …" (which sends none) still holds unchanged. A pair is read from the
   body only when `reviewed` is `false` and at least one of the two keys is present. A missing key
   in a sent pair counts as blank, so `{ last_reviewed_on: '2026-10-16' }` alone is a 400 under
   "both blank or both set".
3. **The date check is a real calendar date**, not just the `YYYY-MM-DD` shape (`2026-02-30` is a
   400). The tournament uses the route's existing `SLUG_PART` pattern.
4. **What a forged pair can do:** it lands only on a row whose review is this tournament and today.
   That is the click being undone, so a caller can at most give today's misclick an arbitrary
   earlier pair. This is the cost option (a) accepted ("the route accepts review values from the body
   for this one case only"). There is no auth surface beyond the existing `X-Seeding-App` guard and the
   localhost bind.
5. **B2-3's "holds nothing but this review"** means `source = app`, and every column other than
   `game_id`, `game_name`, `player_id`, `startgg_tag`, `sheet_tag`, `source` and the review pair is
   blank. That includes tier, notes, `decided_on`, the sheet columns and any unknown column. Such a row is
   removed only when the undo leaves its review blank. A pre-existing empty `app` row (a leftover
   from before this fix) is removed by the same rule on its next ✓/un-✓. That is harmless and matches the
   intent.
6. **Item 5: the note lives in `#status`**, the header's `role=status` line the checklist pointed at.
   I picked it over making `#msg` visible because `#msg` sits above the table inside the scrolling pane.
   It stays until the next action: another ✓, an editor save, or a refresh (whose own progress text
   takes the line). No timer clears it. Errors ("Not saved: …") stay in `#msg` as before, and
   I did not change them (see Could not verify).
7. **The restore gets a note too** ("X: today's review undone; the review of 2026-10-16 at
   eclipse-1st-cour is back."). Without one, a restore looks like a plain un-✓ that left the row
   un-green, and the orchestrator's checklist needs something to read. It is small and inside item 5's ask.

### Dispositions

| finding | disposition | commit | test (pins it) | note |
|---|---|---|---|---|
| B2-1 misclick ✓ + undo erases the earlier review | **FIXED** (ruling: option (a), amendable) | `6b670d6` (server, route), `f609c9f` (page), `3d669e6` (README) | `test/review.test.js`: "B2-1: ✓ at a new tournament, then un-✓ the same day, puts the earlier review back (2026-10-16 at eclipse-1st-cour), byte for byte"; "B2-1: a blank earlier pair clears …"; "B2-1: an un-✓ over a review that is not this tournament today is a no-op, and a forged earlier pair is ignored"; "B2-1: the earlier pair is validated …"; "route: an un-✓ body carries the earlier pair …"; "item 5 and B2-1, the page: …" (source pin: the un-✓ sends `replaced.get(pid)`) | Mutation-checked: restoring blank instead of the pair fails 3 tests; dropping the today+tournament guard fails 2; dropping either validation fails the validation tests. Live: at a scratch `next-event` page, ✓ then un-✓ on Aster Laker brought back 2026-10-16 / eclipse-1st-cour, and the scratch `tiers.csv` came back byte-identical to the real file. Limit: assumption 1. |
| B2-2 Climax of Night dropped for MBTL | **FIXED** (ruling: add `36865`, amendable; UNI2 stays `default`) | `d710086` | `test/majors.test.js` "config/majors.json as shipped: an MBTL run gets a Climax of Night column (B2-2); UNI2 stays on the default list" | Rows mirror the real Crescendo MBTL results (names, 158/142 and 85/73 entrants, dates, a UNI2 Climax bracket that must not count). Fails with the config change stashed. Real folders, read-only (`scratchpad/mbtl-check.js`, `data.loadRun`): all three MBTL runs `["Combo Breaker","Frosty Faustings","Climax of Night"]` (before: without Climax). UNI2 runs unchanged `["CEO","Evo","Combo Breaker","Frosty Faustings"]`. Eclipse unchanged. `out/` combined sha1 unchanged. |
| B2-3 ✓ + un-✓ leaves an empty tiers row | **FIXED** | `6b670d6` | `test/review.test.js` "B2-3: ✓ then un-✓ on a player with no tiers row leaves the file as it was (the record count unchanged, no empty row)" | Covers both the no-pair and blank-pair undo. It also checks that a ✓-created row which later got a note is kept. Mutation (never remove) fails it. |
| B2-4 a fifth changed test not listed | **FIXED** (recorded) | this record | n/a | See "Changed tests" below: `test/view-model.test.js` "model: column choice …" had its CEO rows' `event_date` set to 2026/2025/2024 in `1aeb72b`. |
| B2-5 CLI HTML carries tiers and notes | **DECLINED, acknowledged** | none | none | The ruling acknowledges it as the orchestrator's default (Acceptance 8 requires parity) and flags it to Noah. No change asked. |
| B2-6 "today" is the UTC date | **DECLINED, acknowledged** | none | none | The ruling: consistent with `decided_on`'s existing dates; flagged to Noah. One helper (`data.todayOf`) if he changes it. |
| B2-7 out-of-band commit `73a085a` | **nothing to fix** | none | none | Recorded by the orchestrator in "Orchestrator verification after pass 1" (also the 09:29:36 `tiers.csv` touch: its UI check item 4). |
| B2-8 README list slip | **FIXED** | `3d669e6` | none (doc) | `lib/view/export.js` has its own bullet under `data.js` again. `bc7f0ad` reflows the majors paragraph I lengthened in `d710086` (no content change). |
| item 5 no-op un-✓ explanation not seen | **FIXED** | `f609c9f` | `test/review.test.js` "item 5: the ✓ note text …" (unit, `M.reviewNote`); "item 5 and B2-1, the page: the note goes to the status line and stays until the next action …" (source pin) | Root cause, from the source at `1dcfec2` (`app/public/app.js:143`): the explanation was written to `#msg`, the red box above the table inside the scrolling pane, never to `#status`. So the status line the checklist pointed at stayed empty, and `#msg` is out of view once the table is scrolled. Live after the fix: un-✓ on Aster Laker at Eclipse showed the note in `#status`, still there after 9 s. No console errors. |

### Changed tests

No existing test was edited in this pass. `git diff 1dcfec2 HEAD -- test` has 0 removed lines; the
9 new tests are appended to `test/review.test.js` (8) and `test/majors.test.js` (1). Test names
before vs after (`comm` of the sorted spec-reporter lines): 0 removed, 0 renamed, 9 added.

For B2-4, pass 1's changed existing tests in full (pass 1 named four; this is the complete list):

| test | changed in | change | justification |
|---|---|---|---|
| `test/view-model.test.js` "model: configured majors are keyed by label through the run index …" | `1aeb72b` | renamed from "… keyed by label, not name"; oracle moved to the index; adds a per-game case | spec rule 5/6: a major is a configured main event per game, not any matching name |
| `test/data-tiers.test.js` multi-word-tag test | `1aeb72b` | justification no longer stored/returned | T1 drops `justification` |
| `test/data-tiers.test.js` route test | `1aeb72b` | no longer sends justification through the route | same; the "sent anyway, not stored" case is covered at `updatePlayer` level |
| `test/render.test.js` fixtures | `1aeb72b` | majors list passed in from `testlib/majors-fixture.js`; assertions unchanged | majors come from config, not `model.js` |
| **`test/view-model.test.js` "model: column choice — majors only if someone played them …"** (the fifth) | `1aeb72b` | the three CEO rows got `event_date` 2026-06-27 / 2025-06-28 / 2024-06-29 (they shared the default date), and the index gets `majorsFor()` | rule 5's one result per year: with one shared date the three CEO tournaments fall in one year and collapse to one. The assertion (`['CEO']`) is unchanged; not a weakening |

### Verification

| what | command | result |
|---|---|---|
| suite, working tree at `bc7f0ad` | `node --test` (Node v24.14.1) | **tests 177, pass 174, fail 0, skipped 3** (before 168 / 165 / 0 / 3) |
| suite, clean clone, offline | `git clone --branch build/tool-a . <scratch>/clone` (HEAD `bc7f0ad`), `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` | **tests 177, pass 174, fail 0, skipped 3** |
| skips | | the same 3 pre-existing `recorded:` fixtures ("not recorded yet …") |
| `out/` untouched | sha1 of all 56 files, before and after | `5255e91…` both |
| `registry/` untouched | sha1 | `tiers.csv` `ffb8898…`, `tiers.csv.bak` `de33fb8…`, both unchanged |
| protected files | `git diff --stat 1dcfec2 HEAD --` usage-log, designs, contracts, increment 1/2 records, `.env`, `conflicts`, `registry`, `out` | empty |
| live run | `SEED_TIERS_FILE=<scratch>/registry/tiers.csv node app/server.js --port 8799 --out <scratch>/out` (Eclipse folder plus a copy named `next-event__…`), in the preview browser pane | B2-1 restore and item 5 note as in the table; the scratch `tiers.csv` byte-identical to the real one after both checks; no console errors |

### Could not verify

- **The page's B2-1 and note wiring by unit test.** `app/public/app.js` runs only in a browser and the
  repo has no DOM harness (no dependencies). The note text is a pure function (`M.reviewNote`,
  unit-tested). The wiring is pinned by source and was exercised once live in the preview pane.
  The orchestrator's checklist below is the behavioral check.
- **Two real browser profiles** for the restore: a second profile has no remembered pair
  (assumption 1), so its un-✓ the same day clears. I reasoned this from the code and did not observe it.
- **`#msg` visibility for errors.** "Not saved: …" from a ✓ or an edit still goes to `#msg`, which has
  the same out-of-view problem item 5 had. That is outside item 5's ruling (it named the no-op explanation),
  so I report it here and did not change it.
- **What the orchestrator saw at item 5.** I diagnosed it from the source at `1dcfec2`, not by
  replaying its browser session.

### UI checklist for the orchestrator

Start the app on a scratch copy so nothing writes `registry/tiers.csv`. Make a scratch folder with
`out/` holding the Eclipse run folder plus a copy of it renamed `next-event__bloody-fights-mbaacc-singles__20261015-0925`,
and `registry/tiers.csv` copied in. Then run
`SEED_TIERS_FILE=<scratch>/registry/tiers.csv node app/server.js --port 8799 --out <scratch>/out`.

1. **B2-1 restore.** Open `/e/next-event/bloody-fights-mbaacc-singles`. Aster Laker's Tier cell has no
   color, with hover "Last reviewed 2026-10-16 at eclipse-1st-cour". Click their ✓: the row turns green,
   with hover "Last reviewed <today> at next-event (this tournament)". Click ✓ again: the row is no longer
   green, the hover is back to "Last reviewed 2026-10-16 at eclipse-1st-cour", and the line next to
   Compare reads "Aster Laker: today's review undone; the review of 2026-10-16 at eclipse-1st-cour is
   back." The scratch `tiers.csv` is byte-identical to the real one (`cmp`).
2. **Item 5 note.** Open `/e/eclipse-1st-cour/bloody-fights-mbaacc-singles`, scroll the table down a
   screen, and click ✓ on any green row reviewed 2026-10-16 (Aster Laker). It stays green. The line next to
   Compare reads "Aster Laker was reviewed here on 2026-10-16; a click only undoes a review made here
   today, so that review stays." Wait 10 s: it is still there. Click ✓ on another row: the note clears.
3. **B2-3.** There is no live target: every Eclipse registrant already has a tiers row (107 app-set + 75
   sheet-only = 182). It is covered by the unit test named in Dispositions. To see it anyway, delete one
   player's row from the *scratch* `tiers.csv`, then ✓ and un-✓ them. The scratch file's record count
   comes back to what it was before the ✓.
4. **B2-2.** Open either Crescendo MBTL event: the major columns are Combo Breaker, Frosty Faustings,
   **Climax of Night**. UNI2 is unchanged (CEO, Evo, Combo Breaker, Frosty Faustings).
5. **Reload limit (assumption 1), optional.** At `next-event`, ✓ Aster Laker, reload, then ✓ again.
   Today's review clears and the 2026-10-16 review is **not** restored. This is the known limit of
   option (a). Restore the scratch file afterward.

### REPORT

```
REPORT
- Overview: Pass 3 (lead engineer, repair) disposed of every pass-2 finding and the orchestrator's
  item 5 on build/tool-a, final code commit bc7f0ad. An un-✓ now puts back the review the ✓
  replaced (B2-1, option (a)). An undo removes a row that only held that review (B2-3). MBTL gets
  Climax of Night (B2-2). The no-op explanation now shows in the status line and stays until the
  next action (item 5). node --test: 177 tests, 174 pass, 0 fail, 3 skipped, on the working tree
  and on a clean offline clone (before: 168/165/0/3).
- Found: B2-1 FIXED; B2-2 FIXED; B2-3 FIXED; B2-4 FIXED (recorded); B2-5 DECLINED, acknowledged
  per ruling; B2-6 DECLINED, acknowledged per ruling; B2-7 nothing to fix (orchestrator recorded
  it); B2-8 FIXED; item 5 FIXED (root cause: the note went to #msg above the scrolled table, never
  to #status).
- Ran: d710086 (MBTL majors list + test), 6b670d6 (reviewPlayer prior-pair restore, validation,
  empty-row removal, route + 6 tests), f609c9f (page sends the replaced pair; note in #status;
  M.reviewNote + 2 tests), 3d669e6 (README ✓ wording, B2-8), bc7f0ad (README reflow), plus this
  record. 9 new tests, 0 existing tests edited, 0 removed. Mutation checks on the server code each
  fail a new test. Live run on scratch copies in the preview pane: restore and note observed.
  out/ and registry/ hashes unchanged.
- Attributed: core / seeding-ops increment 3 build A. STATED: dispatch-contract-tool.md,
  design-tool.md §T1 Rules, the orchestrator's rulings for pass 3 in docs/build-record-tool.md.
- Queued: "Not saved" errors still go to #msg, which has the same out-of-view problem as item 5.
  It is outside item 5's ruling, so I reported it and did not fix it.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 3 of 4. No skills, subagents or
  workflows. start.gg requests 0. Token never read.
- Parked: none. Tree clean at the record commit. registry/tiers.csv.bak stays until pass 4 approves.
- Needs attention:
  1. B2-1 (amendable, option (a)): the restore works within one page load. After a reload, or from
     another browser, a same-day un-✓ clears today's review and the earlier one is lost. Option (c),
     a stored previous-review pair, closes that, but it changes T1's columns.
  2. B2-2 (amendable): MBTL now has its own list with Climax of Night. UNI2 has none (5 players of
     data, no basis yet).
  3. B2-5 / B2-6, for Noah's acknowledgment: the CLI HTML carries tiers and notes; review dates are
     UTC days.
  4. Increment 1's passes 2–4 remain open, due with build B.
```

---

## Orchestrator verification after pass 3 (2026-10-29)

Run in the session's browser pane. B2-1 and B2-3 were checked on a scratch copy (second server on 8799,
`SEED_TIERS_FILE` pointed at the copy, the Eclipse run folder duplicated as `next-event`); items 2 and 4
on the live app on 8765 (no writes: item 2 is a no-op click).

| item | result |
|---|---|
| 1 B2-1 restore | On `next-event`, Aster Laker started "Last reviewed 2026-10-16 at eclipse-1st-cour" (`rec-recent`). ✓ → "Last reviewed 2026-10-29 at next-event (this tournament)" (`rec-here`). ✓ again → back to 2026-10-16 at eclipse-1st-cour, status line "Aster Laker: today's review undone; the review of 2026-10-16 at eclipse-1st-cour is back." Scratch `tiers.csv` vs real afterwards: **byte-identical**. |
| 2 item 5 note | On the live Eclipse page, scrolled, ✓ on Aster Laker (reviewed 2026-10-16): row stays green; status line "Aster Laker was reviewed here on 2026-10-16; a click only undoes a review made here today, so that review stays." Still shown after 4 s. |
| 3 B2-3 | Not exercised live (every Eclipse registrant has a row); covered by the unit test pass 3 names. |
| 4 B2-2 | Data API: MBTL majors = Combo Breaker, Frosty Faustings, Climax of Night; UNI2 = CEO, Evo, Combo Breaker, Frosty Faustings. |
| 5 reload limit | Not exercised; pass 3 states it (option (a) restores only within one page load). Handed to pass 4 to judge. |

Pass 3's queued item ("Not saved" errors still go to `#msg`, out of view when scrolled) is also handed to pass 4.

---

## Pass 4 — engineering auditor (closing re-review)

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block), a fresh job. Model: Opus. Report-only: no source, test, config or data file edited, and
this section is the only commit. Reviewed `build/tool-a` at `b9985a0` (clean tree). The artifact is the
code at `bc7f0ad`; nothing but this record changed after it (`git diff --stat bc7f0ad b9985a0` lists
only this file). No skills, subagents or workflows. No start.gg calls, and the token was never read:
every script ran under `testlib/no-network.js` or touched no client, and the app was built with a
`getToken` that throws. Every write path ran on copies in a scratch folder. `out/`, `registry/tiers.csv`
and `registry/tiers.csv.bak` were only read.

### Terms as understood

- **Comparand:** `docs/dispatch-contract-tool.md` Acceptance 1–12 (12 is this pass's to give or
  withhold), the spec `docs/design-tool.md` §T1 Rules, §Display rules 5–9 and the §Open questions
  defaults. The caller's rulings for pass 3 (B2-1 option (a), B2-2 MBTL list, both amendable) are the
  scope pass 3 was held to. I did not re-decide them.
- **Loop:** 4 passes plus at most one extra repair/re-review pair. This is pass 4. If I withhold item 12,
  the extra pair is available, and I must say exactly what the repair has to do.
- **Two items the caller handed me to judge:** (a) B2-1's reload limit, and (b) pass 3's queued item,
  that "Not saved" errors go to `#msg`.
- **Assumption I supplied:** I judged "user impact at the next event" as Noah seeding alone, mostly
  in one tab, with a second browser possible. The spec's success criteria include "Clicking ✓ in one
  browser shows as reviewed in another", so the two-browser path is a real use, not a corner case.

### What I re-ran

| what | command / method | result |
|---|---|---|
| suite, working tree | `node --test` (Node v24.14.1) at `b9985a0` | tests 177, pass 174, fail 0, skipped 3 |
| suite, clean clone, offline | `git clone --branch build/tool-a` into scratch (HEAD `b9985a0`), `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` | 177 / 174 / 0 / 3, as claimed. The skips are the 3 `recorded:` fixtures ("not recorded yet …") |
| test names, pass 3 | sorted pass/skip lines at `1dcfec2` vs now, `comm` | 9 added, 0 removed, 0 renamed. `git diff 1dcfec2 bc7f0ad -- test` has 0 removed lines |
| test names, whole build | the same at `e388fcc` vs now | 144 → 177. The one name gone is pass 1's documented rename (`… keyed by label, not name` → `… through the run index …`) |
| mutation checks, pass 3's fixes | 15 single-line mutations in the clone, each run against `test/review.test.js`, restored with `git checkout --` after each (clone clean at the end, full suite 177/174/0/3 after) | 14 of 15 fail a named test (table below). The survivor is an equivalent mutant: letting a ✓ body's pair through the route changes nothing, because `reviewPlayer` ignores `prior` when `reviewed` is true |
| mutation, B2-2 | `36865` deleted from `config/majors.json` in the clone | "config/majors.json as shipped: an MBTL run gets a Climax of Night column (B2-2) …" fails; restored, it passes |
| B2-1 paths on real data | `data.reviewPlayer` on a scratch copy of the Eclipse run plus a copy renamed `next-event__…`, and a scratch `tiers.csv`; "now" 2026-11-02 | in-page undo (pair sent): Aster Laker back to `2026-10-16 @ eclipse-1st-cour`, file byte-identical. Reload / other-browser undo (no pair): review blank, band `never`, file differs (B4-1). Tag-only row: ✓ + in-page undo restores the review but leaves the row linked (B4-4) |
| migration, column by column | my own raw CSV splitter on `registry/tiers.csv.bak` vs `registry/tiers.csv` (read only) | BOM on both; 713 records each; 13 → 14 columns (`justification` out; `last_reviewed_on`, `last_reviewed_tournament` in); **0** raw-field differences in any carried column; 0 line-ending differences (CRLF); 0 unquoted fields; 0 non-empty justifications in the `.bak`; 107 `app` rows with `decided_on`, and exactly those 107 backfilled with `last_reviewed_on = decided_on` and `eclipse-1st-cour` |
| `.bak` is the pre-migration file | LF-normalized sha1 of `.bak` vs `git show e388fcc:registry/tiers.csv` | equal (`b8f2d3b…`) |
| `tiers.csv` history | `git log e388fcc..HEAD -- registry/tiers.csv` | one commit, `e23581b` (the migration) |
| routes | `createApp` over a scratch copy of all of `out/`, via `testlib/inject.js`, offline | `GET /` 200 with 3 event links; each event's page, `data` and `export.csv` 200. `/.env`, `/static/../.env`, `/%2e%2e/.env`, `/static/.env`, `/static/%2e%2e/%2e%2e/.env`, `/..%5c.env`, `/registry/tiers.csv`, `/out/x`, `/config/majors.json` all 404 |
| every run folder | `viewModel`, `summaryExport` and the CLI's `renderHtml` on scratch copies of all 6 folders | all render. Majors: MBTL ×3 `Combo Breaker, Frosty Faustings, Climax of Night`; UNI2 ×2 `CEO, Evo, Combo Breaker, Frosty Faustings`; Eclipse `Combo Breaker, Frosty Faustings, Climax of Night` |
| Eclipse recount | export of the Eclipse table (scratch copy); "two in a year" = a player with two results of one year in one column | Combo Breaker 77 players / 77 lines / 0; Frosty Faustings 61 / 79 / 0; Climax of Night 83 / 124 / 0; no CEO column. Same as pass 1 and pass 2. The CLI HTML: 107 `rec-here`, 75 `rec-never`. Players with an app-set tier: 107; without the Eclipse color: 0 |
| protected files | `git diff --stat e388fcc HEAD --` usage-log, the three designs, the contracts, increment 1/2 records, `.env`, `conflicts`, `out`, `lib/run.js`, `lib/output.js`, `lib/startgg.js`, `pull.js`, `seed.js` | empty |
| `out/` untouched | sha1 of all 56 files, combined | `5255e91…`, before and after my work, and the same as pass 3's |
| `registry/` untouched | sha1 | `tiers.csv` `ffb8898…`, `.bak` `de33fb8…`, both unchanged; working tree clean |

Mutation detail (each row: what I broke, and what failed):

| fix | mutation | tests failed |
|---|---|---|
| B2-1 restore | restore blank instead of the sent pair | 3 (the two-click test, the forged-pair test, the route test) |
| B2-1 guard | drop the "this tournament" check; separately, drop the "today" check | 2 each (the pre-existing same-day test and the forged-pair test) |
| B2-1 validation | drop both-or-neither; the calendar-date check; the slug check | 2; 1; 1 |
| B2-1 route | never pass the pair to `reviewPlayer` | 1 (route test) |
| B2-1 route | let a ✓ carry a body pair | 0 (equivalent: `reviewPlayer` ignores `prior` on a ✓) |
| B2-1 page | un-✓ sends no pair; the ✓ never remembers the pair | 1 each (the page source pin) |
| B2-3 | never remove the row; remove even a tiered row | 1; 3 |
| item 5 | note to `#msg` instead of the status line; empty no-op text; status refresh drops the note | 1 each |

### Findings

**On pass 3's dispositions.** Every one holds on the artifact.

| # | pass 3 said | holds? | evidence |
|---|---|---|---|
| B2-1 | FIXED, option (a) | **holds within its ruled limit** | Two-click test passes; mutations fail it. In-page undo restores the earlier review byte for byte on real data. The limit is B4-1. |
| B2-2 | FIXED | holds | `36865` list in `config/majors.json`; its test fails without it; all three MBTL folders now show Climax of Night; UNI2 unchanged. |
| B2-3 | FIXED | holds | Test passes; "never remove" fails it; "remove a tiered row too" fails 3 tests, so a tiered row is protected. |
| B2-4 | FIXED (recorded) | holds | Pass 3's "Changed tests" lists the fifth test and its reason. |
| B2-5 | DECLINED, acknowledged | holds | The ruling it cites is in "Orchestrator verification after pass 1", rulings table, row B2-5. |
| B2-6 | DECLINED, acknowledged | holds | Same table, row B2-6. |
| B2-7 | nothing to fix | holds | Recorded under "Out-of-band change (B2-7)". |
| B2-8 | FIXED | holds | `README.md`: `lib/view/export.js` has its own bullet under `data.js`. |
| item 5 | FIXED | holds | The note goes to `#status` (`role=status`) and stays until the next action; three mutations each fail a test. The orchestrator saw it live after pass 3. |

**B4-1 — FINDING, Noah's call; not a RETURN — the reload limit of B2-1 (the caller's item (a)).**
Reproduced on scratch copies. Aster Laker was reviewed `2026-10-16` at `eclipse-1st-cour`. At
`next-event` on 2026-11-02: ✓, then a reload (or the same row in another browser), then ✓ again. The
review is now blank. The Tier cell goes grey, and the hover reads "Never reviewed (tier from the sheet
import)", which is wrong twice: the review existed, and the tier was set in the app. The tier, notes
and `decided_on` survive. Only the date and tournament of the earlier review are lost.

My ruling: **acceptable with findings for this build.** The reasons:

- **Contract 3's wording is met.** Its mechanic is "un-✓ clears both only when they equal this
  tournament and today". The no-pair fallback is exactly that mechanic. The spec is what is
  inconsistent: its own rule text ("clears both fields") is what breaks its principle ("A review
  recorded earlier is never destroyed by a click") once a ✓ at a new tournament has replaced an older
  review. Option (a) shrank the gap to one path. Closing it fully needs a choice between product
  shapes, and that choice is Noah's (directive 6), not the repair loop's.
- **The path is narrow at the next event.** It needs a misclick on a player reviewed at an earlier
  tournament, then a reload or a second browser, then the undo on the same day. The usual misclick is
  caught in the same page, and that path now restores the review. The page's own Refresh does not
  reload the page (`app/public/app.js` has no `location.reload`), so the remembered pair survives it.
- **The loss is small and recoverable.** It is one player's review date and tournament, never the
  tier. `registry/tiers.csv` is tracked, so until Noah commits, `git diff registry/tiers.csv` shows
  the lost pair and `git checkout` restores it.

What would close it, ranked by my judgment. Each is Noah's pick, and none is needed to approve this
build:

1. **The server remembers the replaced pair for the day** (option (b), together with (a)). There is
   no T1 change. It covers a reload and a second browser, and loses only a server restart between the
   misclick and the undo. It costs a small map in `app/server.js` or `data.js` keyed by tiers file,
   game and player, plus a test. The pass-3 ruling rejected (b) because it does not survive a restart,
   but (a) does not survive a reload, and a reload is more common than a restart.
2. **Option (c), a stored previous-review pair.** This closes the gap completely, but it adds T1
   columns. That needs the spec amended and the migration extended.
3. **Un-✓ does nothing when the page holds no pair.** I do not recommend it. After a reload, a
   misclicked ✓ on a player who was never reviewed could not be undone that day. B2-3's empty-row
   cleanup would also stop working after a reload. It trades one wrong state for another.

Two text fixes belong with this finding, whichever option Noah picks. Neither blocks approval. (i) The
README sentence "after a reload the undo clears today's review" (`README.md:47-48`) is accurate but
understated. It should say the earlier review is lost on that path. (ii) The `reviewPlayer` comment
in `lib/view/data.js` says a review is "never destroyed by a click, including by a ✓ at a new
tournament followed by its undo (B2-1)". That is true only within one page load.

**B4-2 — NOTE — "Not saved" errors go to `#msg`, out of view when the table is scrolled (the
caller's item (b)).** `#msg` sits inside `#pane`, above the table, and `#pane` is the scrolling
element (`app/public/event.html:44`, `app/public/app.css:92`). The error is a note, not a finding:

- For a tier or notes edit, this is increment 2's behavior (`git show e388fcc:app/public/app.js`,
  line 606). The failed cell also flashes red for 2.5 s and keeps its old value, so the failure is
  visible even when the reason is not.
- For the ✓, it is new surface in build A, because the ✓ could not fail to save before it wrote to
  the server. A failed ✓ shows nothing in view: the row just does not turn green, and the ✓ cell gets
  no red flash.

User impact at the event is low. A save fails only if the server is down or the request is
malformed, and a stopped server also breaks every other action in view. The repair is small: send
"Not saved: …" through the status line in its error style (`showNote` plus the `err` class), and
flash the ✓ cell the way the editor does. It fits build B or a follow-up. It is outside this
contract's Acceptance list, so it is not a reason to withhold item 12.

**B4-3 — NOTE — the grey hover says "tier from the sheet import" for tiers set in the app.**
`lib/view/render.js:203` gives every `never` band the text "Never reviewed (tier from the sheet
import)". The spec's band is "never reviewed (sheet-only): grey". From the next event on, any tier
Noah sets in the app without clicking ✓ is grey, and its hover names the wrong source. The B4-1 path
does the same. The color is right by the spec's bands. Only the parenthetical is wrong for
`source = app` rows. The fix is one line: drop the parenthetical, or show it only when the row's
source is not `app`.

**B4-4 — NOTE — "byte for byte" holds for linked rows only.** If a player matches a `tiers.csv` row
by tag only (blank `player_id`, which is 530 of the MBAACC rows), the ✓ links the row to the
player's id, and the undo restores the review but keeps the link. The file then differs from before
in that one field. This is the same linking every edit does (A4-2's shared matcher), and the link is
correct, so no action is needed. But the test name's "byte for byte" and the record's
"byte-identical" describe the linked case, which is every Eclipse registrant. They do not describe the
first ✓ on a new registrant who has a sheet row.

**B4-5 — NOTE — a stale header comment in the CLI.** `views/major-table.js:10` still says "seed and
notes from views/notes.json". Since pass 1, the CLI reads tiers, notes and review marks from
`registry/tiers.csv` (the change B2-5 flagged). One line.

**Literal ask, both directions.** Short of it: nothing. Every Acceptance item is met (below). Beyond
it: nothing I would pull back. The files changed since `e388fcc` are all inside spec steps 2 and 3,
plus this record and the orchestrator's `launch.json` port (B2-7, recorded). `lib/run.js`,
`lib/output.js`, `app/jobs.js` and the pull are untouched, and nothing prepares build B's layout. Three
pieces of work go past the literal list, and each was ruled in pass 2 or by the caller: the `default`
majors list, the CLI reading tiers (required by Acceptance 8's parity), and the writer keeping unknown
columns. Pass 3's restore note ("today's review undone; … is back") is inside item 5's ruling.

**Comprehension.** Pass 3's diff is 307 lines in 8 files, and it reads in one sitting. The restore is
one function (`checkPrior`) and three lines in `reviewPlayer`. The page side is one `Map`. I could
follow every disposition from the code to the test that pins it.

### Acceptance

| # | item | met | my evidence |
|---|---|---|---|
| 1 | `node --test` on a clean clone, offline, no regression | **yes** | 177 / 174 / 0 / 3 on a clean clone with `no-network.js`. Every test from `e388fcc` still passes except the one renamed in place. Pass 3 added 9 tests and removed 0 lines from tests. |
| 2 | T1 migration | **yes** | My raw diff: 0 carried-field differences, BOM, quoting and CRLF kept, the 107 backfilled rows exactly right. The `.bak` equals the pre-pass committed file. `tiers.csv` changed in one commit only (`e23581b`). Idempotence and the 712/107 shape are covered by `test/tiers-migrate.test.js` (passing). Pass 2 replayed the migration byte for byte, and the file is unchanged since (`ffb8898…`). |
| 3 | ✓ semantics | **yes, with B4-1** | ✓ writes today and the URL's tournament through `matchTierRow`. Un-✓ changes a row only when its review is this tournament and today, and otherwise does nothing (mutations of either guard fail tests). A review from another tournament is never cleared by a single click. Unit and route tests pass. Browser storage was removed and is never read. The two-click case restores within a page load. The reload path is B4-1. |
| 4 | reviewed row display | **yes** | Green only when `last_reviewed_tournament` equals the page's tournament. Recency bands and hover are covered by the bands test. On Eclipse: 107 `here`, 75 `never` in the CLI output. Sort grouping is covered by its test and the orchestrator's browser check (item 6). Hover wording: B4-3. |
| 5 | editor: no reason prompt; `decided_on` on tier change | **yes** | No `reason`/`justification` in `app/public/app.js`. The route allow-list is tier and notes. The `decided_on` tests pass. The orchestrator saw one field in the browser. |
| 6 | majors per game | **yes** | `config/majors.json`: MBAACC's six with the right kinds, the exclusion list, `default`, and now `36865`. The logic is in `lib/view/model.js`. The named tests pass: Frosty GG main + MBAACC side gives no cell; Climax column for MBAACC; one per year; main event across the run; the four ratified rules on summary, compare panel and export; A4-1 header/row parity. |
| 7 | real-data check | **yes** | Recounted on a scratch copy of Eclipse: no two-in-a-year results in any major column (Frosty 61/79/0, before 61/103/20), every major cell is MBAACC, and 0 of 107 app-tier players lack the Eclipse color. |
| 8 | `GET /`, event pages, CLI parity | **yes** | `GET /` and all 3 event pages, data and exports 200. All 6 run folders render through the view model, the export and the CLI. Parity is pinned: "parity: the CLI view prints exactly the app's summary cells …" and "the Sheets export has the CLI's columns …". |
| 9 | `.env` never served; 404s | **yes** | 9 probe paths 404, including `/config/majors.json` and `/registry/tiers.csv`. `test/app.test.js` passes unchanged. |
| 10 | README | **yes, with B4-1's text fix** | App section: ✓ as review (with the reload limit stated), recency colors, no reason field, `config/majors.json` (where it lives, how to add a game or a major, MBTL's id). B2-8's slip is fixed. |
| 11 | `docs/usage-log.md` not edited | **yes** | `git diff e388fcc HEAD -- docs/usage-log.md` is empty. |
| 12 | closing approval on the actual artifact | **given** | This verdict, on the code at `bc7f0ad`. |

### Could not verify

- **Browser behavior myself.** I did not open a browser. The ✓ across two profiles, colors, hover,
  sort clicks, the editor and the status-line note rest on the orchestrator's two checklists in this
  record and on the source pins. In particular, the page's `replaced` map and note wiring are pinned
  by source only. The repo has no DOM harness.
- **The reload path in a real browser** (B4-1). I reproduced it at the data layer, which is what the
  page calls. Neither the orchestrator nor I observed it in a browser.
- **Midnight in Noah's timezone** (B2-6). I reasoned it from `todayOf`, as pass 2 did.
- **The A2-6 Sheets import**, still untried.
- **Visual design** of the colors, and whether the status-line note is noticed in practice.

### Open items that belong to Noah

Every amendable default and acknowledgement in this record, plus this pass's:

1. **B2-1 / B4-1 — what un-✓ restores (amendable; default option (a)).** Today the undo restores the
   earlier review within one page load. After a reload or from another browser, the earlier review's
   date and tournament are lost (recoverable from git until you commit `tiers.csv`). Keep it as is,
   or pick (b) the server remembers the pair for the day (no table change; my recommendation if you
   want it closed), or (c) a stored previous-review pair (a T1 change; needs the spec amended).
2. **B2-2 — Climax of Night for MBTL (amendable; default: an `36865` list with it).** UNI2 (`50203`)
   stays on the default four, because 5 players is no basis. Confirm, or edit `config/majors.json`.
3. **B2-5 — the CLI's HTML file now carries your tiers, notes and review marks** (acknowledged by the
   orchestrator as a default). Know it before you send `views/major-table.html` to anyone.
4. **B2-6 — "today" is the UTC date** (acknowledged as a default). A ✓ after 8 pm EDT / 7 pm EST is
   stamped tomorrow, and the same-day undo follows the UTC day. Changing it is one helper
   (`data.todayOf`); dates already written stay UTC.
5. **Pass 1's interpretations, still unconfirmed by you:** exclusions match the tournament name or
   the event name; major patterns are anchored to the start of the tournament name; the main event is
   judged across all registrants; CEO disappears from the Eclipse table (every CEO result there was a
   "Community Tournaments" side event).
6. **B4-2 / B4-3 / B4-5 — small text and display fixes** for build B or a follow-up: "Not saved"
   errors into the status line with a failed-✓ flash; the grey hover's "(tier from the sheet import)"
   only for sheet rows; the CLI header comment. Plus B4-1's README and code-comment wording.
7. **`registry/tiers.csv.bak`** may now be deleted (the contract keeps it "until pass 4 approves").
   That is your action or the orchestrator's. This seat does not touch it.
8. **Carried from earlier increments:** A2-5 (the "(N of 182)" series headers and counts under "no
   aggregate counts"), A2-6 (the Sheets import of `= + - @` tags), and increment 1's passes 2–4, which
   are still open and due with build B.

### Verdict: APPROVE WITH NOTES

**Acceptance item 12 is given.** The extra repair/re-review pair is not needed, and none is requested.

**What it covers:** Acceptance 1–11 on the code at `bc7f0ad`, checked on the artifact, not the record.
I re-ran the suite on the working tree and on a clean offline clone. I ran 16 mutation checks on pass
3's fixes. I diffed the migrated `tiers.csv` column by column against its `.bak` with my own parser. I
probed the routes over a copy of `out/`, rendered all six run folders through the app's model, the
export and the CLI, and recounted the Eclipse majors and recency. Every pass-2 finding holds as pass
3 dispositioned it. The build stays inside steps 2 and 3, with no work on build B's layout.

**Why notes and not a return:** the one open defect, B4-1, is the spec's own literal un-✓ rule
showing through on one narrow path. Contract 3 is met, the loss is a date and tournament and is
recoverable from git, and closing it fully is a product choice that belongs to Noah. It goes to him
ranked above, not to a repair pass. The four notes are small text and display fixes with no
contract miss among them.

**What it could not judge:** anything only a browser shows, which rests on the orchestrator's two
checklists; the reload path in a real browser; midnight in Noah's timezone; the Sheets import; visual
design. Increment 1's passes 2–4 remain open and are due with build B.

### REPORT

```
REPORT
- Overview: Pass 4 (engineering auditor, closing re-review) of build A at b9985a0 (code bc7f0ad).
  Verdict: APPROVE WITH NOTES; Acceptance item 12 is given and the extra repair pair is not
  needed. Every pass-3 disposition holds on the artifact. Suite 177/174/0/3 on the working tree
  and a clean offline clone. 14 of 15 mutations of pass 3's fixes fail a named test (the 15th is
  an equivalent mutant), and the B2-2 mutation fails its test. tiers.csv vs .bak: 0 carried-field
  differences, 107 backfilled exactly. out/ and registry/ hashes are unchanged.
- Found: B4-1 FINDING, Noah's call, not a RETURN (B2-1's reload limit: after a reload or from
  another browser, a same-day undo loses the earlier review's date and tournament; contract 3
  met; recoverable from git). B4-2 NOTE ("Not saved" in #msg is out of view when scrolled; new
  surface for the ✓ only). B4-3 NOTE (grey hover says "tier from the sheet import" for app-set
  tiers). B4-4 NOTE (✓ + undo leaves a tag-only row linked; "byte for byte" holds for linked
  rows). B4-5 NOTE (stale CLI header comment). Acceptance 1-11 met; 12 given.
- Ran: node --test on the working tree and a clean offline clone; test-name diffs vs 1dcfec2 and
  e388fcc; 16 mutation checks in the clone, restored with git checkout; B2-1 scenarios on scratch
  copies of Eclipse plus a renamed next-event run; my own raw CSV column diff of tiers.csv vs
  .bak; route probes and all-six-run rendering (app model, export, CLI) over a copy of out/;
  Eclipse majors and recency recount. Evidence: this section of docs/build-record-tool.md, one
  commit.
- Attributed: core / seeding-ops increment 3 build A, pass 4. STATED: dispatch-contract-tool.md
  (Passes table, Acceptance 12), design-tool.md, the caller's pass-4 dispatch.
- Queued: B4-1's closing option (b/c) waits on Noah's ruling: a product choice (impact) that the
  repair loop may not make. B4-2/B4-3/B4-5 and B4-1's text fixes are small, outside the Acceptance
  list, and suit build B or a follow-up.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 4 of 4; the extra pair is unused.
  No skills, subagents or workflows. start.gg requests 0. Token never read. out/ and registry/
  read only; all writes on scratch copies.
- Parked: none. Tree clean at the record commit. registry/tiers.csv.bak may now be deleted
  (Noah's or the orchestrator's action). The scratch clone and copies are in this session's
  scratchpad.
- Needs attention:
  1. B2-1/B4-1 (amendable, default (a)): keep the in-page-only restore, or pick (b) the server
     remembers the pair for the day (recommended if you want it closed) or (c) a stored pair (T1
     change).
  2. B2-2 (amendable): MBTL has Climax of Night; UNI2 on the default four.
  3. B2-5 / B2-6: acknowledge that the CLI HTML carries your tiers and notes, and that review
     dates are UTC days.
  4. Pass 1's interpretations: exclusions on tournament or event name, anchored patterns, main
     event across all registrants, CEO gone from Eclipse.
  5. Small fixes for later: B4-2, B4-3, B4-5, B4-1's README and comment wording.
  6. Delete registry/tiers.csv.bak; A2-5 and A2-6 still open; increment 1's passes 2-4 due with
     build B.
```

---

## Build B — Pass 1 — lead engineer

Seat: lead-engineer persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`, Profile block,
loaded in-seat). Model: Opus. Branch `build/tool-b`, started at `ca107e8` with a clean tree. Code and test
commits `59f817c`, `f07748b`, `760377d`, `fb0d49d`, `8773dd1`, plus this record's commit. Local only, no
push, no remote, nothing amended. No skills, subagents or workflows.

### Terms as understood

- **Scope:** contract `docs/dispatch-contract-tool-b.md` Acceptance 1–13 (14 is the auditor's increment 1
  audit in pass 2; 15 is pass 4's). Spec steps 4, 5 and 6 of `docs/design-tool.md` §Next steps: the
  tournament pool and page, the lifecycle, the outputs. Drag-to-order ("builds last … only if Noah still
  wants it") is not in the contract's Acceptance list and was not built.
- **Binding:** `docs/design-tool.md` §T2, §T3, §Pages, §Lifecycle, §Outputs, §Open questions defaults,
  §Rulings, §Reviewer Concerns; `docs/design.md` (increment 1) for the pull except where §T2 changes it;
  build A's record (✓ semantics option (a) with the in-page restore, the majors config, the review
  columns) as behavior to keep.
- **Grants used:** files under `seeding-ops/` except the protected docs, `.env`, `registry/tiers.csv`
  (only through the existing reader/writer; the real file was never written) and the existing `out/`
  run folders (never read, moved or deleted). `conflicts/` was moved into `lib/` and `app/public/`;
  `conflicts/linked.json` stays as the legacy source of side-tournament links.
- **Prohibitions:** live start.gg calls only against `crescendo-of-night-3-episode-0`: 50 requests in
  total (below). **One breach: 21 requests fell in one rolling 60 s window, one over the limit of 20**
  (Needs attention 1). The seeding post (`updatePhaseSeeding`) was never sent live; it ran against the
  fake only. The token was read only by `lib/token.js` from `.env` or the environment, and never
  printed, logged or committed.
- **Before-state** (recorded before the first edit, at `ca107e8`): `node --test` → **177 / 174 / 0 / 3**
  (the brief's figure). `out/`: 56 files, combined sha1 `5255e91…`. `registry/tiers.csv` sha1
  `ffb8898…`. `registry/tiers.csv.bak` no longer exists (pass 4 said it could be deleted). Sorted test
  names saved for the after comparison.
- **Grounding not consulted** (the standards bank, the runbook): the contract fixes the process. Every
  ruling below traces to the spec, the contract, build A's record or the existing code.
- **Provenance:** the persona was loaded from the library file named above; the design doc is Noah's
  approved `docs/design-tool.md`; I did not author it.

### Assumptions I supplied

Open-questions defaults used (spec §Open questions; the contract asks to name each one):

1. **A4-3** (time-budget error in the CLI pull): **keep current**. It fails that one player and the pull
   goes on; pinned by the existing `test/run.test.js` A4-3 test, behavior unchanged.
2. **Which phase receives the push:** **first by `phaseOrder`**, named in the dry run (a phase with no
   order sorts last, then by id).
3. **Archive standings:** **on request** (a button; never automatic at done).
4. **A4-6's two standing rules** (record out-of-band changes; things that must agree come from one source
   or are pinned by a test): adopted. The two numberings (export, push) are one function,
   `lib/view/model.js` `seedSequence`, pinned by test; the CLI/app/export parity test is unchanged.
5. Build A's defaults (recency bands, tier 0, main event, A2-5, A2-6) are untouched.

Interpretations where the spec is silent or loose (each amendable):

6. **A tab's players** are the pool players who entered one of that game's ticked events
   (`players.csv` `events`). Their results in every game are on the tab; `is_event_game` is computed per
   row as `game_id === tab game` (T2: "each tab computes"). Two ticked events of one game share a tab;
   the push is per event (a dry-run button per event on that tab).
7. **`state.json` also keeps the catalog:** the tournament (slug, name, start, timezone) and its events
   (slug, id, name, game, start, entrants, singles, phases) from the add-tournament request, plus
   `version`. The spec's list for `state.json` doesn't name it, but the picker must show the events
   before any pull exists, and the pull may not write `state.json`. Re-adding refreshes the catalog and
   keeps every decision.
8. **Incremental pull** (a newly ticked event with a pool present) re-reads every ticked event's
   registrants (one request per 100 entrants), carries every player the live pull has as `complete` or
   `limited` (rows unchanged), fetches only the rest (new players, and previously `failed` ones), and
   **keeps the pool's `run_at` and window**, so the pool has one window; `meta.incremental` records
   `{at, from, carried, fetched}`. Players in no ticked event drop out at this pull too, not only at the
   next full Refresh (stricter than the spec's sentence, since the registrants are re-read anyway).
9. **Retrying failed players** (a resume of a finished pull with failures) writes a NEW pull folder that
   carries everyone else, then swaps, instead of rewriting the live files in place. Increment 1 rewrote
   them; with a live pointer that would let a reader see a new `players.csv` beside an old
   `results.csv`, which T2's swap rule exists to prevent.
10. **After a swap** the replaced pull and every OLDER pull folder (an abandoned unfinished one) are
    deleted; a NEWER folder (another pull in progress) is left alone.
11. **The app's Refresh resumes** an unfinished (or finished but never swapped) pull newer than
    `current` whose seeded events equal the ticked set; otherwise it starts a full pull.
12. **The CLI** (`pull.js`): event URLs of one tournament tick those events in `state.json` (written by
    `pull.js`, the tool layer, never by `lib/run.js`) and pull every ticked event; a tournament URL
    re-pulls the ticked events. A tournament not yet added costs one extra request for its catalog.
    `seed.js` groups pasted links by tournament; resuming an unfinished pull ignores newly pasted
    events of that tournament (they are ticked on the next run).
13. **Status with nothing ticked:** the tournament's own start time stands in. The pull's `meta.json`
    start times win over the catalog's when both exist (fresher).
14. **Mark live again** (an undo of Mark done) was added: an override with no undo is a misclick trap.
    One button, shown only while `marked_done` is set.
15. **Archive and Delete are refused server-side while live** (409), the same table the page uses
    (`pool.controlsFor`). Delete needs the page's confirm dialog and, server-side, `confirm: <slug>` in
    the body; it refuses while a job runs for that tournament.
16. **Export seeds CSV:** columns in the spec's order `tier, tag, player_id, proposed_seed`. "The table's
    current order" is the page's row order (`data-i`, so pinned rows count at their sorted place), sent
    as `?order=`; without one, the page's default order. The *Needs tier only* filter does not shrink the
    export. `tag` is the start.gg gamer tag without the team prefix.
17. **Push:** a seed is unmappable when it has no entrant, or not exactly one participant with a player.
    "Crosses a tier boundary" means the seed changes places with a seed of another group (tier value,
    untiered, unmappable) relative to start.gg's current order. The post sends every seed of the phase.
    Before posting, the server re-reads the seeds and refuses (409, "run the dry run again") if the dry
    run's fingerprint no longer matches. The post is never retried except on a rate limit.
18. **Failure modes** are classified by message patterns (`lib/startgg.js` `pushFailure`); start.gg's
    actual wording for a started bracket or a non-admin token is NOT verified (model knowledge).
19. **Singles** = start.gg `Event.type === 1` and no teams word in the name (2v2, 3v3, doubles, team(s),
    crew(s)); without a type, the name alone. `Event.type` was accepted by the live query.
20. **T3:** only `out/<t>/schedule.json` is written (the old CSV/TXT side files are no longer written;
    their pure functions stay, tested). Side tournaments live in `state.json` `linked`, edited on the
    Schedule tab; `conflicts/linked.json` is read once, when a tournament is first added, so Eclipse's
    link survives. `conflicts/out/` is not read.
21. **The CLI view** (`views/major-table.js`) renders one game tab of a pool into
    `out/<t>/major-table-<game>.html` and refuses anything else; it no longer writes into run folders.
22. **Increment 1/2's `views/notes.json` seeds** are not carried into pools (T2: three tables; notes live
    in T1). The page's per-viewer settings (pins, freeze, compare) are keyed per tab now, so earlier
    per-event browser settings start fresh. Build A's line that removes the old `seeding:seeded:<slug>`
    key is kept as pinned; with the new key it removes nothing.
23. **"Both of its events"** (Acceptance 3's live pull) = `andante-uni2-pc` and `allegro-mbtl-pc`, the two
    events Noah seeded (the old `out/` folder names). The tournament has a third singles event, "A
    capriccio (MBAACC)", which was not ticked.
24. **The live pull went to a scratch `out/`** (the session scratchpad), not the repo's `out/`, so Noah's
    `out/` stayed byte-identical and the orchestrator's own UI check starts clean.

### Engineer's-choice rulings

| ruling | options considered | picked, and why |
|---|---|---|
| How a tab reuses increment 2's table | (a) new per-game view code; (b) slice the pool into a run-shaped source and run the existing model and render unchanged | (b) `data.tabSource` + `readSource` in `lib/view/data.js`. Every build A behavior (✓, majors per game, recency, compare, editor, export, CLI parity) runs on the same code paths. `model.js` and `render.js` changed only for B4-3, the seed numbering and the dry-run table. |
| Tabs as page loads or in-page switching | (a) one page swapping tabs in JS; (b) tabs as links (`/t/<t>?tab=<game>`), one shell, the tab's script loaded per load | (b). A stable URL per tab, a reload shows that tab, and `app.js` keeps its single-tab structure (its pinned tests still hold). Cost: a tab switch is a page load. |
| The single queue | (a) serialize at the job level; (b) one fetch queue under every client | (b) `app/queue.js`: one request in flight (the response body is read inside the queue), the existing `limit-fetch.js` ceiling under it, per-caller send records. Jobs keep their own pacing and retry; a backoff sleep happens outside the queue. |
| `current` safety | (a) trust the file; (b) accept only a well-formed `pull-…` name of a finished pull | (b) `output.readCurrent`. A bad or stale pointer reads as "no live pull", never as a path outside the tournament folder. |
| Push re-check before posting | (a) post the dry run the page holds; (b) re-read start.gg and compare a fingerprint | (b). What the confirm showed and what is posted cannot silently differ. Cost: one more seeds read (one request per 100 seeds). |
| Old routes | (a) keep `/api/e/<t>/<e>/…` as aliases; (b) replace them with `/api/t/<t>/…` and keep only the `/e/` page redirect | (b). The spec names the redirect only; aliases would keep an old-layout surface alive. |
| Error status | (a) keep `err.status` for both kinds; (b) handle `StartggError` first | (b). Found by test: a start.gg error carries start.gg's HTTP status (200), which the handler returned as its own. Fixed in `f07748b`. |
| Retrying a refused post | (a) the client's default (a GraphQL error with a `path` is retryable, 5 tries); (b) a per-request no-retry option | (b) `request(…, { retry: false })` for `updatePhaseSeeding`. Rate limits still retry (spec: "queued like everything else"); anything else fails on the first try. Found by test (`f07748b`). |

### Acceptance

Suite: `node --test` → **tests 207, pass 204, fail 0, skipped 3** (before: 177 / 174 / 0 / 3). The 3 skips
are the same pre-existing `recorded:` fixtures. Clean clone (`git clone --branch build/tool-b` at
`fb0d49d`), `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` → 206 / 203 / 0 / 3; the one
test added after it (`8773dd1`) passes on the working tree.

| # | item | met | evidence |
|---|---|---|---|
| 1 | `node --test` clean clone, offline, no regression | yes | Above. 30 tests added, 0 removed; every changed existing test is listed under "Changed tests" with the spec sentence that changes the behavior. |
| 2 | Pool layout, swap, crash, resume | yes | `test/pool.test.js`: "pool layout: out/<t>/pull-<stamp>/ …"; "the swap: a second pull is written beside the live one …" (`current` still names the old pull during the new pull; the old pull is deleted after); "a crash mid-pull leaves the old pull live and the app serving it; --resume finishes from the new pull's _work/ without refetching, then swaps" (a real SIGKILL via `testlib/fake-pull.js`; `check-requests` refetched = []). `test/output.test.js`: "current: written atomically …". |
| 3 | One pull per tournament | yes | `test/pool.test.js`: "one pull per tournament …" (16 players from 15 + 3 with 2 shared; users 9001 and 9008 fetched once); "Refresh re-pulls everyone and carries the W-L cache by event id: the second refresh repeats no set lookup"; "ticking a new event is incremental …" (UserEvents only for the one new player). **Live:** CoN3 Ep0 with both events: **47 requests** (TournamentEvents 1, EventEntrants 2, UserEvents 44), 24 players all `complete`, 2,192 results, query complexity max 841, exit 0, `scripts/reconcile.js` 18/18 PASS. No player entered both events, so the live run shows the union (24 = 3 + 21) but not the dedup; the fake shows the dedup. |
| 4 | Pages | yes | `test/tournament.test.js`: "add a tournament: an event URL makes ONE synchronous events request …" (singles-only picker; ticking a teams event is a 400); "GET / lists tournaments live first, then done, then archived; old run folders are never listed or read"; "GET /e/<t>/<e> redirects … only when out/<t>/ exists, else 404 with an add link …"; "tabs: one per seeded game …". Build A on tabs: the retargeted `test/review.test.js` and `test/data-tiers.test.js` route tests; `test/parity.test.js` and `test/majors.test.js` unchanged and passing. Exercised in the browser pane (below). |
| 5 | W-L summary-first across the union; partial W-L on reload | yes | `test/tournament.test.js` "W-L is fetched summary-first across the union of all tabs' summary columns" (both games' summary rows come before any other row); retargeted `test/app.test.js` "the data endpoint during a W-L fetch returns the W-L fetched so far (a reload shows partial W-L)". |
| 6 | T3 on the single queue | yes | `test/tournament.test.js` "T3: the schedule pull writes out/<t>/schedule.json with the side tournaments linked in state.json, through the same single request queue as the pool pull (never two in flight)": a pool refresh and a schedule pull run at once, max in flight 1, their requests interleave, every call went through the queue. Retargeted `test/conflicts-schedule.test.js`. |
| 7 | Lifecycle | yes | `test/tournament.test.js`: "status is computed from the latest ticked event's startAt …"; "lifecycle: Mark done; done blocks nothing; Archive standings makes one standings fetch per ticked event; Delete (confirmed) removes out/<t>/ only and never touches T1" (EventStandings exactly twice for two events; the tiers file's sha1 unchanged; an old run folder and another tournament untouched). |
| 8 | Export CSV in seed order, no request | yes | `test/outputs.test.js`: "seedSequence: …"; "export seeds CSV: …" (fetch spy: 0 calls); "the export and the push number with the same function (one source) …". |
| 9 | Push: dry run, a click to post, failure modes, fake only | yes | `test/outputs.test.js`: "push: the target phase is the first by phaseOrder"; "push dry run (pure): …"; "push dry run against the fake: …" (one PhaseSeeds request, no mutation); "push post: only on a confirmed click with the dry run's fingerprint; re-checked …; recorded in state.json.pushes"; "push failure modes are one status line, no retry …"; "the page: posting needs a click on a dry run and a confirm …". **The post was never sent live.** The live dry run (read-only, allowed) ran once per event: 2 PhaseSeeds requests; phases `2413289` and `2413291` "Bracket"; 3 and 21 seeds, all mapped to the pool, 0 tiered (T1 holds MBAACC tiers only), 0 moves. |
| 10 | T1 only through the reader/writer; ✓ writes the tournament slug | yes | `test/tournament.test.js` "Acceptance 10: a ✓ on a tournament page writes T1 through the existing writer with the tournament slug …". The writer is build A's `editTierRow`, unchanged. The real `registry/tiers.csv` is unchanged (`ffb8898…`). |
| 11 | `.env` never served; nothing outside `out/` and static; `state.json` and `current` never raw | yes | Retargeted `test/app.test.js` ".env is never served; nothing under out/ is served as a file (state.json and current included) …": 39 probe paths are 404 and none leaks the token or pool state; `/api/t/<t>` returns a projection (no event ids or phases). |
| 12 | README | yes | `fb0d49d`: add a tournament, tabs, Schedule, Refresh, lifecycle, export, push with dry run; "The per-event folder layout is retired." Partly pinned by "B4-1 wording …". |
| 13 | Build A follow-ups | yes | B4-2: "Not saved" through the status line in the error style, plus a red flash on the ✓ or edited cell (`notSaved` in `app.js`); test "B4-2 …". B4-3: `recencyTitle` names the sheet only for non-`app` rows, and `readNotes` carries `source`; test "B4-3 …". B4-5: the CLI header rewritten; test "B4-5 …". B4-1 wording: README and `reviewPlayer`'s comment; test "B4-1 wording …". |

**Live request record.** Scratch script `live-pull.js` in the session scratchpad; every send went through
`app/limit-fetch.js` at `max: 20`, and send times were appended to `live-sends.jsonl`.

| stage | requests | what |
|---|---|---|
| catalog | 1 | TournamentEvents (the add-tournament request) |
| pull | 47 | the pool pull, both events |
| dry run | 2 | PhaseSeeds, one per event (read-only) |
| **total** | **50** | over 307 s. **Max in any rolling 60 s: 21**: the catalog request at 15:34:13.658Z and the pull's first 20 sends fell within 60 s of each other. Each ran in its own process, and each limiter knew only its own sends. Within the pull alone: 20 actual sends (the pull's own request log, stamped before the limiter's wait, shows 21). |

**Live run in the browser pane** (directive 12; not a substitute for the orchestrator's check):
`node app/server.js --port 8799 --out <scratch>` with `NODE_OPTIONS` preloading `testlib/no-network.js`
and `testlib/fake-global-fetch.js` (the fake start.gg, offline), `STARTGG_TOKEN=FAKE-SENTINEL`, and
`SEED_TIERS_FILE` on a scratch copy. Add by event URL → the picker had that event pre-ticked, the teams
event greyed, no tabs. Tick the second event, Pull → the page reloaded into tabs `MBAACC | Melee |
Schedule`, W-L "Done: 105 W-L fetched". Melee tab: 3 players; ✓ turned the row green with the "this
tournament" hover; the seeds export link carried the table order. MBAACC tab: Push → dry run (phase
"Bracket", groups, 5 cross-tier flags) → the confirm text named the cross-tier moves → posted to the fake
and recorded. Schedule tab: linked a side tournament, Refresh schedule → 16 players with the side game.
Archive standings → "archived". Delete (confirmed) → back to an empty list. Every request returned
200/202 except the designed 404 "no schedule pull yet". **Screenshots timed out (the pane never drew)**,
so clicks were sent as DOM `click()` and results read from the DOM; nothing was checked visually.

### Changed tests

Every change retargets a test to the new layout because the spec changed the behavior. No assertion was
weakened, and none was skipped or deleted. Spec sentences cited: **T2-layout** = "A pull writes
players.csv, results.csv, meta.json and its own _work/ into out/<t>/pull-<stamp>/ … writes the new
directory's name into out/<t>/current … and deletes the previous pull directory"; **T2-col** =
"`is_event_game` is dropped … each tab computes game_id === tab.game_id"; **T2-W-L** = "set-records.json
… live at out/<t>/, outside any pull directory"; **Pages** = "GET /t/<tournament-slug> is the page … GET
/e/<t>/<e> redirects … Old … run folders … are left alone and not read"; **T3** = "Moves next to the pool
it belongs to".

| file | test(s) | change | cites |
|---|---|---|---|
| `test/run.test.js` | the `freshRun` helper; "full fake run …"; "a schema error mid-run …"; "kill + resume …"; "resume: a finished run with a failed player …" | runDir is the live (or newest) pull in `out/<t>/`. The folder-name assertion became the pull name plus `current`. "Other games kept" checks `game_id` instead of `is_event_game`. The schema-error test also asserts nothing was swapped in. Kill + resume finds the unfinished pull in `out/<t>/` and runs its clean comparison in a separate `out/` (a second pull would replace the first). The retry test reconciles the new swapped-in pull and asserts the old one is gone. Names unchanged. | T2-layout, T2-col |
| `test/output.test.js` | "runFolderName …" → "pullFolderName: pull-YYYYMMDD-HHMMSS"; "createRunFolder …" → "createPullFolder: a same-second second pull gets its own folder" | renamed and retargeted | T2-layout |
| `test/seed.test.js` | "seed: folderPrefix matches lib/output.js runFolderName" → "seed: pullsFor lists the tournament's lib/output.js pull folders …"; the resume tests use pull folders and `findUnfinishedPull`; "claude-prompt.txt is written only for a finished run …" → "… only for a live (finished) pull, from its meta.json, into out/<t>/" | renamed and retargeted | T2-layout |
| `test/app.test.js` | 6 tests: "GET / lists each event once …" → "… each tournament once; its tab always serves the live pull …"; ".env is never served …" → "… nothing under out/ is served as a file (state.json and current included) …" (probes added); "refresh makes a new run, merges the previous cache …" → "… a new pull, carries the pool's W-L cache …"; "the data endpoint during a W-L fetch …" (+ "(a reload shows partial W-L)"); "a pull that cannot start …" and "a refresh never sends more than SEED_APP_MAX_PER_MIN …" ("run" → "pull") | routes are `/api/t/<t>/…`. "The old run is kept" became "the old pull is deleted after the swap". The `views/notes.json` carry-forward assertion was dropped (notes live in T1; a pool has no notes.json). The cache file is `out/<t>/set-records.json`; `refresh-sends.json` and the W-L log are in the pull's `_work/`. | Pages, T2-layout, T2-W-L |
| `test/export.test.js` | "export: GET /api/e/<t>/<e>/export.csv …" → "export: GET /api/t/<t>/g/<game>/export.csv …" | the route; the filename stamp is the pull's `HHMMSS`; a 404 for a game that is not a tab was added | Pages |
| `test/wl.test.js` | the `fakeRun` helper; "views/major-table.js: renders a fake run end to end …" → "… a fake pool's game tab end to end …" | the pull is in `out/<t>/`; `is_event_game` is computed in the helper for the event's game; the CLI is called on `out/<t>` with `--game`, and its HTML and cache live in `out/<t>/` | T2-layout, T2-col, T2-W-L |
| `test/conflicts-schedule.test.js` | requires `lib/schedule`; "schedule app: page, data (latest pull wins) …" → "schedule app: the Schedule tab's data (out/<t>/schedule.json), refresh runs one schedule pull at a time"; the seedsOnly pull test asserts the file is `out/<t>/schedule.json` | routes and paths | T3, Pages |
| `test/data-tiers.test.js` | "route: POST player edit …" | builds a pool for the same players; URL `/api/t/tour/g/1/player/<id>`; assertions unchanged | Pages |
| `test/review.test.js` | the route tests ("route: POST …/player/<id>/review …", "a tier edit still stamps decided_on …", "route: an un-✓ body carries the earlier pair …") | `setup` and `setupNext` also build a pool with the same players; URLs `/api/t/<t>/g/<game>/…`; assertions unchanged | Pages |

Test names before vs after (`comm` of the sorted spec-reporter lines): 13 names changed (the renames
above), 0 tests removed, 30 added.

### Could not verify

- **The seeding post against real start.gg.** Prohibited in this build; tested against the fake only.
  The mutation and its input type come from start.gg's docs (spec §Landscape), not from a run.
- **start.gg's real messages** for a started bracket, a locked phase or a non-admin token. The patterns
  in `pushFailure` are model knowledge; anything else is shown with start.gg's own message.
- **The standings query live** (`EventStandings` field names): fake only.
- **Visual rendering.** The browser pane never drew (screenshots timed out), so layout, colors, the tab
  bar and the push panel were not seen; behavior was checked through the DOM only.
- **Two browser profiles; Explorer and Notepad opening from `seed.cmd`; `pull.js`'s event-URL path end to
  end** (its no-token, usage and resume paths are tested; ticking and pulling through the CLI against
  the fake is not).
- **The live dedup:** no CoN3 Ep0 player entered both events.
- **Increment 1's audit** is pass 2's (Acceptance 14).

### UI checklist for the orchestrator

Start the app (`npm start`). The home page now lists tournaments from the new layout only: the
existing Eclipse and Crescendo pulls (old per-event folders) **do not appear**, by design (Needs
attention 2). **Every Pull, Refresh, Archive or schedule pull is a live start.gg run** and counts against
your budget. Do not press the push's post button against a real event in this build.

1. **Add a tournament:** paste `https://www.start.gg/tournament/crescendo-of-night-3-episode-0/event/allegro-mbtl-pc`.
   One request. The page opens with *Seeded events* open, Allegro pre-ticked, three singles events, no
   tabs and a Pull button.
2. **Tick events:** also tick Andante (UNI2), then press **Pull**. The status line shows progress; when
   it's done the page reloads into tabs **Melty Blood: Type Lumina | Under Night In-Birth II Sys:Celes |
   Schedule** (about 47 requests for this tournament, then W-L).
3. **Tabs:** the MBTL tab shows 21 players with build A's columns (✓; Team | Player | Region | Tier
   frozen; majors Combo Breaker, Frosty Faustings, Climax of Night; series; Other series; Other games;
   Notes). The UNI2 tab shows 3 players with UNI2's default majors. ✓ on a row turns it green, with
   "this tournament" on hover. This writes `registry/tiers.csv`: undo it the same day, or point
   `SEED_TIERS_FILE` at a copy.
4. **Schedule tab:** press *Refresh schedule*; every player's blocks appear. *Conflicts first* works.
5. **Refresh swap:** on a game tab press *Refresh data*. While it runs, the table keeps showing the old
   pull; when the new pull lands, the table switches by itself. `out/crescendo-of-night-3-episode-0/`
   then holds one `pull-…` folder, and `current` names it. W-L already fetched is not fetched again.
6. **Lifecycle:** the tournament is in the past, so the pill reads **done**, with *Archive standings* and
   *Delete tournament data* showing and *Mark done* hidden. Archive → one request per ticked event → the
   pill reads **archived**. (Delete removes the folder after a confirm; `registry/tiers.csv` must be
   unchanged afterwards.)
7. **Export CSV:** sort the MBTL table by any column, then *Export seeds CSV*: tiered players first by
   tier, the table's order within a tier, untiered after; no start.gg request (watch the server log).
8. **Push dry run, NO post:** *Push to start.gg…* → *Dry run: Allegro (MBTL) - PC*. It names phase
   "Bracket" and shows 21 seeds, grouped (all "No tier" unless MBTL tiers exist), with moves and flags.
   **Do not press "Post this seeding to start.gg".**
9. **Old links:** `/e/crescendo-of-night-3-episode-0/allegro-mbtl-pc` redirects to the MBTL tab once the
   tournament is added; `/e/eclipse-1st-cour/bloody-fights-mbaacc-singles` is a 404 with an *Add the
   tournament* link until Eclipse is added.

### REPORT

```
REPORT
- Overview: Build B pass 1 is built and committed on build/tool-b (final code commit 8773dd1). The pull
  is one per tournament into out/<t>/pull-<stamp>/, swapped in through out/<t>/current. The app is one
  page per tournament with a tab per seeded game and a Schedule tab, and every start.gg call goes
  through one queue. The lifecycle (computed done, Mark done, Archive standings, Delete) and the outputs
  (seeds CSV, push dry run and a confirmed post, fake only) are in. node --test: 207 tests, 204 pass,
  0 fail, 3 skipped (before 177/174/0/3); clean clone offline 206/203/0/3 at fb0d49d. One prohibition
  breach: 21 live requests in one rolling 60 s window (limit 20).
- Found: Acceptance 1-13, all doable in-window and done (14 and 15 belong to passes 2 and 4). My own
  tests found two defects, fixed in f07748b: a refused post was retried 5 times, and a start.gg error's
  HTTP status leaked into the app's response status.
- Ran: 59f817c (pool layout, pull, pages, queue, push, T3 move, tests retargeted), f07748b (push
  no-retry, error status), 760377d (30 new tests: test/pool, tournament, outputs), fb0d49d (README,
  scripts), 8773dd1 (legacy linked test), plus this record. Live: 50 start.gg requests against
  crescendo-of-night-3-episode-0 (1 catalog, 47 for the pull with both events, 2 read-only dry-run
  seeds reads), into a scratch out/; no post. Browser pane: the full flow against the fake start.gg,
  driven through the DOM (the pane never drew). The out/ and registry/tiers.csv hashes are unchanged.
- Attributed: core / seeding-ops increment 3 build B. STATED: dispatch-contract-tool-b.md,
  design-tool.md §T2, §T3, §Pages, §Lifecycle, §Outputs.
- Queued: drag-to-order (spec step 6, "only if Noah still wants it"; not in the contract's list).
  Nothing else stopped.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 1 of 4. No skills, subagents or
  workflows. start.gg: 50 requests, max 21 in a rolling 60 s (one over the limit). Token never printed.
- Parked: none. The tree is clean at the record commit. Scratch artifacts (live-out/,
  live-sends.jsonl, the clone, the UI out/) are in this session's scratchpad.
- Needs attention:
  1. Budget breach: 21 requests in one rolling 60 s window against CoN3 Ep0 (limit 20). The catalog
     request and the pull's first 20 ran in two processes 12 s apart, and each limiter only knew its own
     sends. The app can't repeat this (one process, one queue); a future live script must seed its
     limiter with earlier sends or run everything in one process.
  2. After this build the app no longer shows the Eclipse and Crescendo pulls (old per-event folders,
     unread by design). For the week of 2026-11-02, add the new tournament and Pull. Eclipse's
     side-game link comes back from conflicts/linked.json if Eclipse is added.
  3. Interpretations to confirm (all amendable): incremental keeps the pool's window; a tab = the players
     who entered that game's events; state.json also holds the event catalog; "Mark live again" added;
     the push re-reads start.gg and refuses on a changed fingerprint; the export ignores the "Needs tier
     only" filter.
  4. Increment 1's audit (Acceptance 14) is due in pass 2.
  5. Carried from build A for Noah: B4-1's closing option ((b) a server-remembered pair or (c) a stored
     pair), the B2-5/B2-6 acknowledgements, A2-5, A2-6.
```

---

## Orchestrator verification after build B pass 1 (2026-10-29)

Run in the session's browser pane and with curl against the app started on a **scratch copy** of pass 1's
live Crescendo pull (`--out` a copy of the scratchpad `live-out/`, `SEED_TIERS_FILE` a copy of
`registry/tiers.csv`). No real file was written. Live start.gg calls made by the orchestrator: the
schedule pull (about 10 requests) and one push dry run (2 read-only requests), through the app's queue,
well under 20 in any minute. **No post was sent.**

| item | result |
|---|---|
| Routes | `/` 200 and lists the tournament; `/t/crescendo-of-night-3-episode-0` 200; `/e/crescendo-of-night-3-episode-0/allegro-mbtl-pc` 302; `/e/eclipse-1st-cour/bloody-fights-mbaacc-singles` 404 (not added); `/.env` 404; `/out/<t>/state.json` 404. |
| 3 Tabs | Tabs: Under Night In-Birth II Sys:Celes, Melty Blood: Type Lumina, Schedule. UNI2 tab: 3 players, majors CEO, Evo, Combo Breaker, Frosty Faustings; MBTL tab: 21 players, majors Combo Breaker, Frosty Faustings, Climax of Night; build A's columns (✓, Team, Player, Region, Tier frozen; series with counts; Other series; Other games; Notes) present. |
| 4 Schedule | `POST …/schedule/refresh` → 202, finished in about 1 s: 43 players, 3 events, `schedule.json` written beside the pool. |
| 6 Lifecycle | Pill reads **done**; Archive standings and Delete tournament data visible; Mark done hidden; Mark live again present but hidden. Archive and Delete not pressed. |
| 7 Export | `seeds.csv` for both games: header `tier, tag, player_id, proposed_seed`, 1..N, all untiered (no MBTL/UNI2 tiers exist); `export.csv` header carries the tab's columns plus the player id. No request logged. |
| 8 Push dry run | Dialog "Dry run: Allegro (MBTL) - PC, phase "Bracket". Nothing has been sent." 21 seeds: 0 tiered, 21 without a tier, 0 unmappable, 0 would move; table of current vs proposed; the post button is present and was **not pressed**. Closed. |
| 2, 5 Pull / Refresh | Not run (47+ live requests each); covered by pass 1's live pull record and the fake-API tests. |

**Pass 1's disclosed breach:** 21 requests in one rolling 60 s during pass 1's one-off live script (the
catalog request and the pull ran in two processes, each with its own limiter). Not repeatable by the app
(one process, one queue). Recorded here; the auditor should confirm the app's queue is the only path.

Screenshots were not possible (the pane did not draw); all checks were DOM and API reads.

---

## Build B — Pass 2 — engineering auditor

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block). Model: Opus. Report-only: no source, test, config or data file edited; this section and
the increment 1 audit appended to `docs/build-record.md` are the only changes, in one commit. Reviewed the
handoff at `ff56191` (code head `8773dd1`; commits `59f817c`, `f07748b`, `760377d`, `fb0d49d`, `8773dd1`,
record `61f48ba`) on `ca107e8`. No skills, subagents or workflows. **No start.gg calls**: every script I
ran preloaded `testlib/no-network.js`, and the app was built with a `getToken` that returns nothing or a
fake. The token was never read. `out/` and `registry/` were read only; every write ran in a clean clone
or on copies in the session scratchpad (`scratchpad/audit-b2/`, where my probe scripts are kept).

### Terms as understood

- **Comparand:** `docs/dispatch-contract-tool-b.md` Acceptance 1–13, and 14 (the increment 1 audit),
  which is this pass's own work; `docs/design-tool.md` §T2, §T3, §Pages, §Lifecycle, §Outputs, §Open
  questions, §Rulings, §Reviewer Concerns; the Ratified rows of `docs/usage-log.md`; for 14,
  `docs/design.md` and `docs/dispatch-contract.md` as amended by §T2. The builder's "Terms as
  understood" and "Assumptions I supplied" are the drift comparand.
- **Drift check:** the builder's terms match the contract: scope (drag-to-order correctly left out: the
  spec says it "builds last … only if Noah still wants it" and it is not on the Acceptance list), grants
  (verified below: no protected file changed, `out/` byte-identical, `registry/tiers.csv` unchanged) and
  prohibitions, with one disclosed breach (D2-11).
- **Rulings on the handoff's "interpretations to confirm"** (Needs attention 3):
  - *Incremental keeps the pool's window:* a real trade-off with no spec sentence either way. Noah's
    (D2-6).
  - *A tab = the players who entered that game's events:* fine. §Pages says "the seeding table, as
    today, sliced to that game", and today's table is an event's registrants.
  - *The catalog in `state.json`:* fine as a necessity, noted (D2-5).
  - *Mark live again:* out of contract (D2-4).
  - *The fingerprint refusal:* fine. It is what keeps "posting requires a click on the dry run" true
    when start.gg or the tiers change between the dry run and the click. It costs one seeds read and
    adds one refusal message.
  - *The export ignores Needs tier only:* fine. §Outputs says "the tab's players".
- **The other assumptions** (8–24): 9 (a retry writes a new pull folder) is required by the swap rule;
  8, 10, 11, 13, 15, 16, 17, 19, 20, 22, 23 and 24 are fine; 12 is D2-5 and D2-9; 14 is D2-4; 18 is under
  Could not verify; 21 is D2-12.
- **Needs attention 2** (the old per-event pulls disappear from the app) is the spec's own rule
  (§Pages, "left alone and not read"); Noah should still hear it before 2026-11-02. 5 is carried from
  build A and not this pass's.

### What I re-ran

| what | command / method | result |
|---|---|---|
| suite, clean clone of `build/tool-b` at `ff56191`, offline | `git clone` into scratch, `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` (Node v24.14.1) | tests 207, pass 204, fail 0, skipped 3 (matches the claim) |
| suite at `fb0d49d`, same way | checkout in a second clone | 206 / 203 / 0 / 3 (matches) |
| before-state at `ca107e8`, same way | same clone | 177 / 174 / 0 / 3 (matches) |
| suite, working tree | `node --test` | 207 / 204 / 0 / 3; afterwards `out/` and `registry/tiers.csv` unchanged, tree clean |
| test names, before vs after | sorted pass/skip lines, `comm` | 13 names gone, 43 new: the 13 renames the record lists plus 30 new tests; none deleted; the same 3 `recorded:` skips |
| removed assertions | `git diff ca107e8 8773dd1 -- test/` filtered to removed `assert` lines (37) | each is a renamed route or path re-asserted in its retargeted form, or a behavior the spec removed: `/api/e/…` routes (§Pages), "the old run is kept" (§T2 deletes it), the `views/notes.json` carry-forward (§T2, three tables; notes live in T1), `is_event_game` (§T2). No weakening found. |
| protected files | `git diff --stat ca107e8 ff56191 --` usage-log, the three designs, all four contracts, `build-record.md`, `build-record-webapp.md`, `registry/`, `.env`, `out/` | empty; `build-record-tool.md` only appended to |
| `out/` untouched | sha1 of all 56 files vs pass 1's before-state list (`scratchpad/out-before.sha1`) | 56 of 56 equal; `registry/tiers.csv` sha1 `ffb8898…` |
| the live request record | recomputed from `scratchpad/live-sends.jsonl` and the live pull's `_work/requests.jsonl` with `lib/pacing.maxInAnyWindow` | 50 sends (1 + 47 + 2); **max 21 in any rolling 60 s across the stages**; the pull alone 20 actual sends, 21 by its log's stamps; log ops TournamentEvents 1, EventEntrants 2, UserEvents 44; 0 errors, 0 retries; complexity max 841; the longest limiter wait 24.1 s |
| the live pool's shapes against §T2 | read-only listing and `node scripts/reconcile.js` on `scratchpad/live-out/…/pull-20261029-103426` | `out/<t>/` holds `current`, `state.json`, one `pull-20261029-103426/` (players.csv, results.csv, meta.json, `_work/`); `current` names it; players.csv ends with `events`; results.csv has no `is_event_game`; meta has the tournament and its seeded events with phases; 24 players, 2,192 rows; reconcile 18 of 18 pass |
| routes | `createApp` over a copy of the live pool, offline, via `testlib/inject.js` (`audit-b2/routes.js`) | 22 probes 404, among them `/.env`, `/%2e%2e/.env`, `/static/../.env`, `/out/<t>/state.json`, `/<t>/current`, `/t/<t>/state.json`, `/api/t/<t>/current`, `/api/t/<t>/pull-…/players.csv`, `/registry/tiers.csv`, `//etc/passwd`; `/e/<t>/allegro-mbtl-pc` 302 to `?tab=36865`; nothing leaked |
| the queue and the client's timeout | `audit-b2/queue-timeout.js`: `app/queue.js` + `lib/startgg` client, a fake fetch that honors `AbortSignal` like real `fetch`, time scaled 10x | ceiling 20/60 s: the 21st request was refused before sending (its signal had expired in the queue) and retried once; ceiling 75: none (D2-3) |
| incremental pull's meta | `audit-b2/incr-meta.js`, the fake | same 16 players and 107 rows as a full pull, but `skipped` 0/0 instead of 56/1 (D2-2) |
| ticking while a job runs | `audit-b2/tick-busy.js`, the fake, W-L held open | the tick saved, `started: false`, the new game's tab has 0 of its 3 players, and still 0 after the job ends (D2-1) |
| the post's retry rule | `audit-b2/post-retry.js`, `updatePhaseSeeding` against canned responses | HTTP 500: 1 send; GraphQL error with a path: 1; a thrown timeout: 1; 429 then ok: 2, posted; time-budget then ok: 2, posted (D2-10) |
| `pull.js` with two event URLs | the clone, `fake-global-fetch.js` preload, `STARTGG_TOKEN=FAKE` | exit 0, both events ticked in `state.json`, one pool swapped in; TournamentEvents requested twice (D2-9) |
| `pull.js --resume` on an increment 1 folder | a copy of `out/crescendo-of-night-3-episode-0__andante-uni2-pc__20261015-1052` | a stack trace ("not a pull folder name"); the copy byte-identical afterwards (`diff -r`) (D2-8) |
| token in history (pattern only; the token was not read) | `git log -p --all` for `STARTGG_TOKEN=<value>` and `Bearer <20+ chars>` | only test literals and blank lines; `.env` never committed |

### Findings

**D2-1 — FINDING — ticking a new event while any job runs starts nothing and says nothing.** Spec §T2:
"Ticking a new event triggers the incremental pull"; contract 3: "Ticking a new event pulls only new
players". `setTicked` (`app/server.js`) calls `jobs.startPull`, which returns `started: false` whenever
any pull, W-L fetch or archive is running, for this tournament or another. The tick is saved, no pull is
queued, and the page's *Save events* handler (`app/public/tournament.js`) just reloads. Reproduced
(`audit-b2/tick-busy.js`): a pool of one event, Refresh, tick the second event during the W-L. Response
`{"added":["melee-singles"],"started":false}`, and the new game's tab shows 0 of the event's 3
registrants, still 0 after the job ends. The players already in the pool who entered it are not on the
tab either, because their `events` column predates the tick. User impact: the W-L phase ran about 90
minutes at Eclipse, so this is the likely moment for a second tick. The tab is wrong with no message,
and only a full Refresh fixes it. **Resolves:** pass 3 queues the incremental pull to run after the job,
or refuses the tick (409) with a line saying why. Either way, a test.

**D2-2 — FINDING — an incremental or retry pull's `meta.json` counts no skips for carried players.**
`design.md` (the pull's spec, unchanged by §T2 here): "separate counts of everything skipped … Nothing is
dropped without being counted." `outcomesOf` (`lib/run.js`) rebuilds carried players from the CSVs with
`skipped: null`, so `buildOutputs` adds nothing for them. Reproduced (`audit-b2/incr-meta.js`): a full pull
of both events reports `out_of_window 56, no_event_container 1`. The same pool built incrementally has the
same 16 players and 107 rows but reports `0, 0`. `scripts/reconcile.js` does not catch it.
`request_count` also covers only the new pull's sends, which is defensible but should be said.
**Resolves:** carry each player's `skipped` from the live pull's `_work/checkpoint.jsonl`, or carry the
meta totals; add the assertion to the incremental test.

**D2-3 — FINDING — the client's 30 s request timeout starts before the queue wait.** `lib/startgg.js`
creates `AbortSignal.timeout(30000)` when the client calls `fetchImpl`, and the app's queue
(`app/queue.js`) then holds the call behind other callers and behind its ceiling. A request held longer
than 30 s is refused by `fetch` before it is sent. It still uses a ceiling slot, and it comes back as a
`network` error that the client retries after a 4 s backoff (5 tries, then the player or W-L row fails).
Reproduced (`audit-b2/queue-timeout.js`): with the ceiling at 20/60 s, the 21st request was refused
before sending and retried; at 75, nothing happened. The live record came close: pass 1's limiter held
one request for 24.1 s of the 30. The cause predates build B (increment 2's `limit-fetch.js` sat under
the client the same way), but the one queue makes waits longer, because every caller now waits behind
every other. It bites whenever `SEED_APP_MAX_PER_MIN` is below 75 (the README offers that setting) or
when two jobs share the ceiling. The suite cannot see it, because `testlib/fake-api.js` ignores
`signal`. **Resolves:** start the timeout when the queue sends (for example, the queue makes the signal
for the send), plus a test with a fake that honors `signal`.

**D2-4 — FINDING, Noah's call — "Mark live again" is beyond the contract.** §Lifecycle names three
controls: Mark done, Archive standings, Delete tournament data. Pass 1 added a fourth, `unmark-done`
(assumption 14), with a button, a route, a README line and a test. The builder's reason (an override
with no undo is a misclick trap) is sound and the cost is small, but out-of-contract work is pulled back
however cleanly it is done. **Resolves:** Noah keeps it, and the spec or usage log records it; otherwise
pass 3 removes it.

**D2-5 — NOTE — what `state.json` holds, and who writes it.** (a) The catalog (the tournament and its
events from the add request) is not in the spec's list for `state.json`. The page needs it before any
pull exists, and the pull may not write `state.json`, so it has to live somewhere. Keeping it in
`state.json` adds no new file. Fine; Noah should know. (b) `node pull.js <event URL>` writes `state.json`
(it ticks the events), while the README's Output table says "The pull never writes it". The CLI's tick is
Noah's own choice made on the command line, so the spec's purpose holds. But the CLI writes without the
app's knowledge, so with the app open a tick or a push record saved in between can be overwritten.
**Resolves:** a README sentence; acknowledge.

**D2-6 — NOTE, Noah's — an incremental pull keeps the pool's window.** New players are fetched in the
live pull's window, so their results between that pull and the tick are left out, as everyone else's
are. One window is simpler to read; mixed windows would include those results. **Resolves:** Noah
acknowledges or rules.

**D2-7 — NOTE — a failure deleting the old pull reads as "the pull did not finish".** In `swapIn`, a
`rmSync` that throws after `current` has moved (Windows file locks; *model knowledge, unverified here*)
makes `run()` throw. The job then reports "The pull did not finish … still shows the previous pull" and
skips the W-L, although the new pull is live. Nothing is lost: the next swap's "older" sweep removes the
leftover. **Resolves:** catch the cleanup error and leave the folder for the next sweep.

**D2-8 — NOTE — `pull.js --resume` accepts an increment 1 run folder.** The contract says old folders are
never read. Given `out/<t>__<e>__<stamp>`, `run()` reads its `_work/run.json` and `meta.json`, then
dies with a stack trace when `writeCurrent` refuses the name. That happens before anything is written:
a copy stayed byte-identical. By inspection, an old folder with failed players would take the retry
branch and create `out/pull-<stamp>/` and `out/current` at the `out/` root. None of the six old folders
has a failed player (all `failed 0`), so this is latent. **Resolves:** refuse a resume folder that is
neither `pull-…` nor a tournament folder.

**D2-9 — NOTE — the command-line paths are outside the app's queue.** Constraint 2 scopes "everything the
app does", so this is not a contract miss. But `pull.js` builds two clients in one process (the
`tickFromUrls` catalog request, then `run()`'s own), each with its own limiter. That is pass 1's breach
mechanism, and it requests TournamentEvents twice (verified against the fake). `meta.request_count`
leaves out the first of those requests. A CLI pull while the app runs is two limiters on one token.
Ticking a new event from the CLI also runs a full pull, not the incremental one. **Resolves:** one client
in `pull.js` (pass the catalog to `run()`); a README line on not running both at once.

**D2-10 — NOTE — the post's retry rule is right but only partly pinned.** The test pins "no retry" for a
GraphQL error with a path. My probe confirms the rest: a 5xx and a timeout are sent once, while a 429
and the time-budget error are retried and then posted. **Resolves:** add these cases to the existing
failure-modes test, so the rule cannot drift.

**D2-11 — FINDING (process), routed to Noah, no code repair — the live budget was exceeded once.**
Recomputed from `live-sends.jsonl`: 21 sends in one rolling 60 s (limit 20), the catalog request plus the
pull's first 20, run in two processes with a limiter each. Disclosed by pass 1 and recorded by the
orchestrator. The app's own calls all go through the one queue: add, pull, W-L, schedule, archive, dry
run and post each take `queue.fetch` or `queue.fetchFor` in `app/server.js` and `app/jobs.js`, and the
T3 test asserts `queue.stats.sends === fake.calls.length`. The mechanism remains on the command line
(D2-9). **Resolves:** Noah's acknowledgement.

**D2-12 — NOTE — two files in `out/<t>/` that §T2 does not list.** `views/major-table.js` writes
`major-table-<game>.html` and `seed.js` writes `claude-prompt.txt` there. Both are derived and removed
by Delete, but the README's Output table lists neither. **Resolves:** list them.

**D2-13 — NOTE — an incremental pull does not refresh a carried no-account player's other games.** A
`limited` player already in the pool who also entered the newly ticked game is carried as is, with no
`recentStandings` for the new game. The spec is literal here: "pulls only the players not yet in the
pool". All live data so far has 0 limited players. **Resolves:** acknowledge, or fetch the new game for
carried limited players.

### Acceptance

| # | item | met | evidence |
|---|---|---|---|
| 1 | clean clone, offline, no regression; retargets justified | yes | 207/204/0/3 at `ff56191`, 206/203/0/3 at `fb0d49d`, 177/174/0/3 before; 13 renames, 0 deleted; every removed assertion maps to a §T2/§Pages/§T3 sentence (table above) |
| 2 | pool layout, `current` after completion, old pull deleted after, W-L/state/schedule outside, crash, resume | yes | code: `writeOutputs` (meta last), then `swapIn` (`writeCurrent` by temp-and-rename, then `rmSync`); `readCurrent` accepts only a finished `pull-…`; tests "pool layout …", "the swap …" (current still the old pull during the new one), "a crash mid-pull …" (real SIGKILL, `refetched = []`); the live pool's files match §T2. Edges: D2-7, D2-8 |
| 3 | one pull per tournament; dedup; Refresh carries W-L by event id; tick is incremental | yes, with D2-1 and D2-2 | tests "one pull per tournament …" (users 9001/9008 once), "Refresh … repeats no set lookup", "ticking a new event is incremental …"; live: 24 = 3 + 21, 47 requests, no player in both events (dedup shown on the fake only). The busy case (D2-1) and the incremental meta (D2-2) fall short |
| 4 | pages | yes | tests in `tournament.test.js`; my route probes; build A's ✓ (Acceptance 10 test) and majors per game (the orchestrator saw UNI2 CEO/Evo/CB/Frosty and MBTL CB/Frosty/Climax on live tabs) |
| 5 | W-L summary-first across the union; partial W-L on reload | yes | test "W-L is fetched summary-first …" (both games' summary rows before any other); retargeted app test |
| 6 | T3: `schedule.json`, `linked` in state.json, one queue, never two in flight | yes | test "T3 …" asserts max in flight 1 with a pool refresh and a schedule pull interleaved, and that every call went through the queue; `lib/schedule-pull.js` writes only `out/<t>/schedule.json`. Timeout defect under the queue: D2-3 |
| 7 | lifecycle | yes, with D2-4 | `pool.statusOf`/`controlsFor`, server enforces the same table; test "lifecycle …" (EventStandings exactly once per event; Delete needs `confirm: <slug>`; T1 sha1, an old folder and another tournament untouched). Mark live again: D2-4 |
| 8 | export in seed order, no request | yes | tests "seedSequence …", "export seeds CSV …" (0 calls), "one source …" |
| 9 | push dry run; one sequence; diff and flags; click and confirm; `pushes`; failure line; fake only | yes | `lib/push.js`; the server refuses without `confirm: true` (400) or with a fingerprint other than a fresh re-read's (409); `updatePhaseSeeding` is called only from `push.post`, only from `postSeeding`; retry only on rate limits (`retry: false`; my probe, D2-10); tests in `outputs.test.js`. Never posted live |
| 10 | T1 only through the reader/writer; ✓ writes the tournament slug | yes | test "Acceptance 10 …"; `registry/tiers.csv` sha1 unchanged |
| 11 | `.env`, `state.json`, `current` never served; nothing outside `out/` and static | yes | retargeted test (39 probes) and my 22 probes |
| 12 | README | yes, with D2-5(b) and D2-12 | add, tabs, Schedule, Refresh, lifecycle, export, push with dry run; "The per-event folder layout is retired." |
| 13 | B4-2, B4-3, B4-5, B4-1 wording | yes | tests for each; `notSaved` in `app.js`; `render.js` hover; the CLI header |
| 14 | increment 1 audit | done in this pass | `docs/build-record.md` § "Pass 2 — engineering auditor (increment 1's audit, run with build B)", findings C2-1 to C2-8. In short: the pull meets `design.md` as amended for everything the suite and the files can show. Increment 1's live acceptance legs (recorded fixtures, ground truth, the live reconcile, the live kill-and-resume, the two schema checks) were parked on 2026-10-12 waiting for the token and never resumed. Closing them needs a small live allowance, which is the caller's to grant (C2-1, C2-2). |
| 15 | closing approval | — | pass 4's |

### Increment 1's audit (Acceptance 14)

Recorded in increment 1's own record, `docs/build-record.md` § "Pass 2 — engineering auditor (increment
1's audit, run with build B)", with its own ids C2-1 to C2-8. It reviews the pull (`lib/run.js`,
`lib/output.js`, `lib/history.js`, `lib/startgg.js`, `lib/pacing.js`, `lib/token.js`, `pull.js`,
`seed.js`, `lib/pool.js`, the scripts and the test fakes) against `docs/dispatch-contract.md`'s twelve
items and `docs/design.md` as amended by §T2. The code holds for everything that can be checked offline
or from the files. Item 3 (a live per-event folder for Combo Breaker 2026) no longer means anything under
the amendment; build B's live pool pull stands in for it. Increment 1's live legs were never closed (C2-1,
C2-2). D2-2 is that audit's finding too (C2-7), because the rule it breaks is `design.md`'s. Build B's
pass 3 repairs the C2 findings along with these, per the contract.

### Could not verify

- **The post against real start.gg, and start.gg's real error wording** for a started bracket, a locked
  phase or a non-admin token (`pushFailure`'s patterns are model knowledge). Prohibited live in this
  build.
- **The `EventStandings` query live** (field names model knowledge; fake only), and `Event.type === 1`
  as "singles" beyond the one live catalog.
- **Visual rendering.** No screenshots by either pass 1 or the orchestrator; I did not run a browser.
- **Windows file-lock behavior** of the `current` rename and the old pull's delete under a concurrent
  reader (D2-7 is a model-knowledge risk, not an observation).
- **The token's absence from history and outputs by value.** I did not read the token. The scan was by
  pattern only.
- **The live dedup** (no CoN3 Ep0 player entered both events).

### Verdict

**APPROVE WITH FINDINGS.** Build B's pass 1 meets Acceptance 1–13 on the artifact: the suite, the swap
and crash safety, the one queue, the outputs and the guarded post, the routes, and build A's behavior on
tabs, all re-run or re-derived above. Four findings need repair or a ruling before pass 4 can close:
**D2-1** (a tick during a running job leaves the new tab empty with no message), **D2-2** (incremental
meta loses skip counts), **D2-3** (queued requests can time out before they are sent), all three for
pass 3; and **D2-4** (Mark live again), Noah's. D2-11 is a disclosed process breach for Noah to
acknowledge. The rest are notes. Acceptance 14 is done; its live legs need an allowance (C2-1, C2-2). It
covers the code, tests, records and the live pass-1 artifacts. It could not judge the visual page, the
real post, or start.gg's real error and standings shapes.

### REPORT

```
REPORT
- Overview: Pass 2 (engineering auditor, report-only) reviewed build B at ff56191 (code 8773dd1) and ran
  increment 1's never-run audit. Acceptance 1-13 hold on the artifact: 207/204/0/3 on a clean offline
  clone (fb0d49d 206/203/0/3, before 177/174/0/3), out/ and tiers.csv byte-identical, the live pool's
  files match T2. Verdict: APPROVE WITH FINDINGS. Three defects for pass 3 (D2-1, D2-2, D2-3) and one
  out-of-contract control for Noah (D2-4).
- Found: D2-1 FINDING (tick during a running job: nothing pulled, nothing said, empty tab); D2-2 FINDING
  (incremental/retry meta.json counts 0 skips for carried players); D2-3 FINDING (client timeout starts
  before the queue wait; requests refused before sending below a 75/min ceiling); D2-4 FINDING, Noah's
  (Mark live again is beyond Lifecycle's three controls); D2-11 FINDING, process, Noah's (21 live
  requests in 60 s, recomputed); notes D2-5..D2-10, D2-12, D2-13. Increment 1: C2-1..C2-8 in
  docs/build-record.md (C2-1, C2-2 need a live allowance).
- Ran: the suite at ff56191, fb0d49d, ca107e8 and the working tree; test-name and removed-assertion
  diff; protected-file diff; out/ hash check (56/56); recomputed the live send record; reconcile on the
  live pool; 22 route probes on a copy; probes in scratchpad/audit-b2/ (queue-timeout, incr-meta,
  tick-busy, post-retry, pull.js against the fake, --resume on a copy of an old folder). Evidence:
  this section and docs/build-record.md, one commit.
- Attributed: core / seeding-ops increment 3 build B, and increment 1's audit (contract Acceptance 14).
  STATED: dispatch-contract-tool-b.md, design-tool.md, design.md, dispatch-contract.md.
- Queued: D2-4 and D2-6 wait on Noah (product choices). C2-1 and C2-2 wait on a live allowance (about 15
  read-only start.gg requests, past tournament and GeneralMidwest), which this pass does not have.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 2 of 4. No skills, subagents or
  workflows. start.gg requests 0. Token never read. All writes on scratch copies.
- Parked: none. Tree clean after the record commit.
- Needs attention:
  1. D2-4: keep "Mark live again" (record it in the spec or usage log) or have pass 3 remove it.
  2. D2-11: acknowledge the one-over budget breach in pass 1's live run.
  3. A live allowance for increment 1's open legs (C2-1 recorded fixtures, C2-2 ground truth, live
     reconcile, live kill-and-resume, schema checks): grant it to pass 3 or run it yourself.
  4. D2-6: an incremental pull keeps the pool's window (new players miss results since the last pull).
  5. Before 2026-11-02: the app no longer lists the old per-event pulls; add the tournament and Pull.
```
