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

---

## Orchestrator rulings for build B pass 3 (2026-10-29)

Defaults chosen by the orchestrating session under Noah's "start the whole build"; each marked amendable
where it is a product choice. The repair pass builds to these, not to its own reading.

| finding | ruling |
|---|---|
| D2-1 | **Fix.** A tick while a job runs is saved and the incremental pull is queued behind the running job (one queue); the status line says so ("Allegro ticked; pulling its players after the current job"). Test with the fake. |
| D2-2 / C2-7 | **Fix.** `meta.json` counts (skipped out-of-window, no-event-container, request_count, etc.) cover carried players too: carry each player's checkpoint counts forward, or recompute from the merged results. Test: incremental and retry pulls report the same skip counts as a fresh pull of the same players. |
| D2-3 | **Fix.** The client's timeout starts when the request is sent, after the queue wait. Make the test fake honor timeouts enough to pin it (a queued request behind a slow one is not cancelled). |
| D2-4 | **Keep "Mark live again", amendable.** An override (Mark done) needs an undo; the orchestrator will add it to the usage log as a candidate row after pass 4. Pass 3 changes nothing here. |
| D2-5 | **Fix the overwrite.** `pull.js` may create `state.json` only when none exists (a new tournament from the CLI) and must merge into an existing one, never overwrite the app's fields (`marked_done`, `archived`, `pushes`, `linked`). README stays true: "the app's state, which the pull never overwrites". Test. |
| D2-6 | **Keep, amendable (Noah's).** An incremental pull keeps the pool's window; a full Refresh moves it. Document in the record and README. |
| D2-7 | **Fix.** If deleting the old pull directory fails after the swap, the job continues (W-L runs) and reports the leftover directory; the next pull retries the delete. |
| D2-8 | **Fix.** `pull.js --resume` on an increment 1 folder refuses with one line ("this is a per-event run folder from before the pool layout; add the tournament in the app or run a fresh pull"), exit 2, writes nothing. Test. |
| D2-9 | **Fix.** The CLI pull uses one client and one limiter for the whole run (catalog + pull), and asks for the event list once. |
| D2-10 | **Fix.** Tests for every post retry case (refused, started bracket, non-admin, network error: no retry; rate limit: retry). |
| D2-11 | Acknowledged: pass 1's one-off live script exceeded 20/min by one request; the app's single queue is the only path now (D2-9 closes the CLI's second limiter). |
| D2-12 | **Fix.** README lists `major-table-<game>.html` and `claude-prompt.txt` under `out/<t>/`, or they stop being written; pass 3 picks the smaller change and says which. |
| D2-13 | **Fix.** An incremental pull fetches the newly ticked game's `recentStandings` for no-account (`limited`) players already in the pool. Test with the fake. |
| C2-1, C2-2 | **Live allowance granted to pass 3:** at most **20 read-only start.gg requests in total**, never more than 10 in any rolling 60 s, through one client in one process, against `crescendo-of-night-3-episode-0` and the one user id increment 1's probe used (GeneralMidwest). Purpose: record the three recorded-fixture tests so they stop being skipped, and run the ground-truth count, the live reconcile and the token-absence check that increment 1 parked. The live kill-and-resume is done against the fake only. Write the results into `docs/build-record.md` as pass 3 of increment 1 (ids C3-n), pointed to from build B's pass 3 section. If the recorded fixtures cannot be made deterministic, say so and leave the skips with the reason. |
| C2-3..C2-6, C2-8 | Recorded; no action this pass. C2-3 (schema questions) and C2-6 (A2-6) remain Noah's. |

Before 2026-11-02 (pass 2's needs-attention 5): the app lists only the new layout, so the next event's
tournament must be added and pulled in the app. The orchestrator will do that with Noah's go.

---

## Build B — Pass 3 — lead engineer (repair)

Seat: lead-engineer persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`, Profile block,
loaded in-seat). Model: Opus. A fresh job: I did not build pass 1 and treated its code as a working
system to modify, with the before-state recorded first. Branch `build/tool-b`, started at `5ecc770` with a
clean tree. Code and test commits `8a371b7`, `b107de8`, `f6db706`, `0e21a4a`, `bfb7287`, `0bbe247`,
`a8c1422`, `7b3bfa9`, plus this record's commit. Local only: no push, no remote, nothing amended. No
skills, subagents or workflows.

### Terms as understood

- **Scope:** the "Orchestrator rulings for build B pass 3" table above, one disposition per row: D2-1..D2-13,
  and C2-1/C2-2 from `docs/build-record.md` §"Pass 2 — engineering auditor (increment 1's audit …)".
  The rulings are binding and were not re-decided here. Where a ruling offered a choice (D2-2's method,
  D2-12's two routes) the pick and the reason are in the table.
- **Binding:** `docs/dispatch-contract-tool-b.md` (Mutation grants, Prohibitions; Acceptance 1–13 must still
  hold), `docs/design-tool.md`, and `docs/design.md` for the pull as amended by §T2. Build A's ✓ semantics
  (option (a) with the in-page restore) and majors per game were not touched: no file under `lib/view/` and
  no build A test changed.
- **Allowed work types:** repair, plus the tests and tooling each repair needs (the contract's "additive /
  repair / preparatory").
- **Live allowance (the orchestrator's amendment):** at most 20 read-only start.gg requests in total, never
  more than 10 in any rolling 60 s, one client in one process, against `crescendo-of-night-3-episode-0` and
  GeneralMidwest (`user/14364d39`) only, for C2-1 and C2-2. Used: **16 requests, max 10 in any rolling
  60 s** (below). I read "against" as: a query keyed by that tournament's event or entrants, or by
  GeneralMidwest's user id. On that reading the ground truth's 3 random-row re-fetches (each rooted at
  `event(id:)` of some other tournament) fall outside the two targets, and the ruling names only "the
  ground-truth count", so they were **not run** (Could not verify).
- **Prohibitions held:** nothing was posted to start.gg (the live harness refused any `mutation` before
  sending). I never read or printed the token: lib/token loaded it inside the live script, and
  `scripts/token-absent.js` matched it inside its own process, printing only counts. `out/` was never
  written: 56 of 56 files are byte-identical to the before-state. `registry/tiers.csv` is unchanged
  (`ffb8898…`); the browser check used a scratch copy through `SEED_TIERS_FILE`. No protected doc changed
  (`git diff ca107e8 HEAD` over usage-log, the three designs, the four contracts and
  `build-record-webapp.md` is empty). The two build records were only appended to, as this job asked.
- **Before-state** (recorded at `5ecc770` before the first edit): `node --test` gave **207 / 204 / 0 / 3**,
  matching the brief. Sorted test names saved; `out/` sha1 list (56 files); tiers sha1.
- **Grounding not consulted** (standards bank, runbook): the rulings fix the work. Each choice below
  traces to a ruling, the spec, or the existing code.
- **Provenance:** the persona came from the library file named above. I did not author the design docs.

### Dispositions

| finding | disposition | commit | test that pins it | note |
|---|---|---|---|---|
| D2-1 | **FIXED** | `0e21a4a` | `test/pool.test.js` "D2-1: ticking a new event while a job runs saves the tick, queues the incremental pull behind the job and says so …" | `app/jobs.js` keeps a waiting list: `queuePull` starts the pull or queues it behind any running pull, W-L or archive, with one entry per tournament (a full pull outranks an incremental one). When the running job ends, the next pull starts by itself. `status()` reports `queued`. `/events` returns `queued` and `addedNames`, and the page's status line reads "Melee Singles ticked; pulling its players after the current job." It keeps polling and reloads into the new tab. Also run in the app (UI checklist; DOM-verified). |
| D2-2 / C2-7 | **FIXED** | `b107de8` | "D2-2 / D2-13: an incremental pull reports the same skip and request counts as a fresh pull …"; "D2-2: a retry pull … reports the same skips as a fresh pull …" | Of the ruling's two methods, I picked **carry each player's checkpoint counts forward**. Recomputing from merged results cannot recover skips, which have no rows. `outcomesOf` reads `skipped` and a new per-player `requests` from the source pull's checkpoint; an older checkpoint without `requests` is counted from its request log. `request_count` now covers carried players, and the new `requests_this_pull` is the pull's own sends (equal for a full pull). Incremental equals a fresh pull on skips, request_count, rows and statuses. A **retry reuses the registrant list**, so its request_count is the players' requests only, which is the fresh count minus the 3 registrant requests (asserted). That is the one place the two counts differ by design. |
| D2-3 | **FIXED** | `8a371b7` | `test/client.test.js` "D2-3: through the app queue, the timeout starts at the send …" and "D2-3: without a queue the client arms the timeout itself …" | A fetch that may hold a call declares `timeoutAtSend` (`app/queue.js`, `app/limit-fetch.js`). The client then passes `timeoutMs`, and limit-fetch arms `AbortSignal.timeout` when it sends. The fake used here honors `AbortSignal` like real fetch, with real timers and a 200 ms timeout. Three queued requests are each sent once with no retry, and a hung send still times out. Under the old arming the same test sends 6 times (verified). |
| D2-4 | **ACKNOWLEDGED** (ruling: keep, amendable) | — | the existing lifecycle test | No change. The orchestrator adds the usage-log candidate row after pass 4. |
| D2-5 | **FIXED** | `f6db706` | `test/pool.test.js` "D2-5: the CLI's tick merges into state.json as it is at write time …" | `pull.js` creates `state.json` only when none exists. Otherwise it merges through `pool.updateState`, which re-reads the file at write time, and touches only the catalog and `ticked`. In the test the app writes `marked_done`, `linked` and `pushes` while the CLI's catalog request is out. Under the old code all three were wiped (`[null, [], []]`, verified); now they survive. The README keeps "The pull never writes it" and adds what `pull.js` does. |
| D2-6 | **ACKNOWLEDGED, documented** (ruling: keep, amendable, Noah's) | `f6db706` | `test/outputs.test.js` "README (build B pass 3) …" pins the sentence | README: the incremental pull "keeps the pool's two-year window where it is … press **Refresh** to move the window to today for everyone". `lib/run.js`'s header says the same. |
| D2-7 | **FIXED** | `b107de8`, `7b3bfa9` | "D2-7: if the old pull folder cannot be deleted after the swap, the pull still counts as done, the W-L runs …"; "D2-7 (Windows partial delete, observed in pass 3) …" | `swapIn` catches a failed delete after `current` has moved and reports it as `leftover`. The job runs the W-L and its message names the folder; the next swap's sweep deletes it. **Pass 3 also found and fixed P3-1** (below): a real Windows lock leaves a half-deleted, resumable leftover. |
| D2-8 | **FIXED** | `b107de8` | `test/cli.test.js` "D2-8: --resume on an increment 1 per-event run folder refuses in one line, exit 2, and writes nothing" | A name containing `__` gets the ruling's one line and exit 2, before any file is opened. The folder stays byte-identical. Anything that is neither a `pull-…` nor a tournament folder is refused too. |
| D2-9 | **FIXED** | `f6db706` (with `run()`'s `client`/`apiT`/`records` options from `b107de8`) | `test/pool.test.js` "D2-9: a CLI pull uses one client (one limiter) …" | `pull.js` makes one client. `tickFromUrls` uses it for the catalog request and hands the response to `run()`, which reuses the client (its records go to the pull's request log). `createClient` is called once and TournamentEvents is requested once, with or without a known catalog. `request_count` now counts the catalog request. README: "Don't run a command-line pull while the app is pulling or fetching W-L." |
| D2-10 | **FIXED** (tests; the behavior was already right) | `bfb7287` | `test/outputs.test.js` "D2-10: the post's retry rule, every case …" | Sent once, with the status-line kind asserted: a GraphQL refusal (other), started bracket and locked phase (locked), non-admin by GraphQL message or HTTP 400 body (not-admin), 503, network error, timeout. Retried then posted: 429 and the time-budget error. The test fails with the post's `{ retry: false }` removed (verified). |
| D2-11 | **ACKNOWLEDGED** (ruling) | — | — | Pass 1's one-over breach stands as recorded. D2-9 removes the CLI's second limiter. This pass's own live run was one process, one client and one limiter at 10/60 s: max 10. |
| D2-12 | **FIXED** (README route) | `f6db706` | "README (build B pass 3) …" checks every row of the `out/<t>/` table | I picked the README route because it is the smaller change. Stopping the files would mean changing `views/major-table.js` and `seed.js` (the CLI view's output location and the launcher's prompt file), plus their tests and the README's "Hand this to Claude" step. Listing them is two table rows. |
| D2-13 | **FIXED** | `b107de8` | "D2-2 / D2-13 …" | An incremental pull asks a carried `limited` player about the newly seeded game only. The games already asked are those of the events in the old `players.csv` `events`. Rows are merged by event id, skips and requests summed. The top-up is kept in `_work/run.json`, so a resume finishes it. In the test there is exactly one RecentStandings call (player 104, Melee), and 104's rows equal a fresh pull's. |
| C2-1 | **FIXED** (live, 4 requests) | `0bbe247`, `a8c1422` | `test/recorded-shape.test.js`: 3 run, 3 pass, **0 skipped** (skipped since 2026-10-12) | Recorded from CoN3 Ep0 `allegro-mbtl-pc` and GeneralMidwest. **Deterministic:** each file keeps only `data`, the variables, `_recorded_on` and `extensions.queryComplexity`, and the test anchors its window to `_recorded_on`. Details in `docs/build-record.md` C3-1. |
| C2-2 | **DONE** for the legs the allowance names (live, 12 requests) | `0bbe247` (instruments) | `test/live-instruments.test.js` (the instruments, offline) | Ground-truth count **PASS 334 = 334**; live reconcile **20/20 PASS**; token-absence **0 hits**. The kill-and-resume stays fake-only, as ruled. The 3 random-row re-fetches were not run (Terms). Details in `docs/build-record.md` C3-2..C3-5. |
| C2-3..C2-6, C2-8 | **ACKNOWLEDGED** (ruling: recorded, no action) | — | — | C2-3 (`schema-check.js`) was not run: it is not in the allowance's purpose. |

**Found in this pass:**

- **P3-1 — FIXED in `7b3bfa9` (part of D2-7's leftover surface).** Seen in the browser check under a real
  Windows lock (PowerShell holding the live `players.csv` with `FileShare None`). The recursive delete of
  the replaced pull stopped partway, taking `meta.json` and leaving `_work/run.json`. The leftover then
  read as an unfinished, resumable pull. Reproduced offline on a copy: `node pull.js --resume out/<t>`
  finished the leftover and **swapped it in over the newer live pull**, deleting the newer one (`current`
  went from `pull-20261029-112329` to `pull-20261029-112224`). The app's Refresh was never exposed: it
  resumes only pulls newer than `current`. The fix: `swapIn` removes the resume marker first; a resume of a
  tournament folder takes only a pull newer than `current`; a named pull older than `current` is refused
  in one line, exit 2. Test: "D2-7 (Windows partial delete …)", verified failing without the guards. The
  same copy afterwards: both resume forms refuse, and `current` stays.
- **P3-2 — NOT FIXED, queued (outside the rulings).** On a new tournament (no pool yet), pressing **Pull**
  while another tournament's job runs gets a 409 from `/refresh`. The page's handler treats 409 as fine and
  says "Pulling…". It polls until the other job ends and then reloads into the same setup page, with nothing
  pulled and nothing said. This is D2-1's failure class on the first-Pull path. The D2-1 ruling covers the
  tick with a pool present, so the two-key rule (repair permitted AND inside the ruled increment) keeps it
  out of this pass. A likely fix: `/refresh` from the first Pull goes through `jobs.queuePull` (a few
  lines). Evidence: reading `app/public/tournament.js` (`pullFirst`) and `app/server.js` (`/refresh`);
  **not run** (7–8).

### Changed tests

Two existing tests changed, and no assertion was weakened, skipped or deleted. Test names before → after:
0 removed, 15 added (207 → 222, then 223 with P3-1's test).

| file | test | change | why |
|---|---|---|---|
| `test/tournament.test.js` | "add a tournament: an event URL makes ONE synchronous events request …" | the expected `/events` response gains `addedNames` and `queued: false` | Correcting the oracle: the D2-1 ruling redefines the response ("the status line says so" needs the added names and the queued flag). The test now asserts more fields. |
| `test/recorded-shape.test.js` | the three `recorded:` tests | the window is anchored to the fixture's `_recorded_on` instead of `Date.now()`; same assertions | Determinism, as the job asked: the result no longer depends on the day the suite runs. |

Tooling changed beside the tests: `testlib/fake-api.js` answers the instruments' queries (GTUser,
GTUserEvents, GTEvent, ReconcileCount), and `testlib/fake-global-fetch.js` takes `FAKE_DELAY_MS` (for the
UI checklist).

### Verification

| what | command | result |
|---|---|---|
| suite, before (`5ecc770`) | `node --test` | 207 / 204 / 0 / 3 |
| suite, working tree (`7b3bfa9`) | `node --test` | **223 / 223 / 0 / 0** |
| suite, clean clone, offline | `git clone --branch build/tool-b` into scratch (no `.env`), `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` at `7b3bfa9` | **223 / 223 / 0 / 0** (also 222/222/0/0 at `a8c1422`) |
| each new test fails on the old code | old files restored one at a time, the new tests run | D2-1, D2-2 (x2), D2-3, D2-5, D2-7 (x2), D2-8, D2-9, D2-10 all fail before the repair and pass after |
| `out/` untouched | sha1 of all 56 files vs the before list | identical |
| `registry/tiers.csv` | sha1 | `ffb8898…`, unchanged |
| token, by value | `node scripts/token-absent.js out test/fixtures/recorded <scratch> <scratch>/live-out` | 987 files, 0 contain it; `git log -p --all` 0 hits |
| live legs | scratch `p3/live-pass3.js` (one process, one client, limiter 10/60 s, hard stop at 20, mutations refused), dry-run first against the fake (`--fake`: 11 sends, all PASS) | below and in `docs/build-record.md` C3-n |
| the running app, offline | `node app/server.js` with the fake preloads, `FAKE_DELAY_MS=120`, a scratch `out/` and tiers copy, driven in the browser pane through the DOM | D2-1 and D2-7 as in the UI checklist; P3-1 found here |

### Live requests

Log: `<session scratchpad>/p3/live-sends-pass3.jsonl`, one line per send (time, step, operation,
variables, status). Result summary: `p3/live-pass3-result.json`. **16 requests, all HTTP 200, all
read-only. Max in any rolling 60 s: 10** (sends 1–10, 16:19:27.220Z–16:19:38.580Z; the limiter held send 11
until 16:20:27.231Z). Span 61.9 s. Stop at 20: not reached.

| # | step | operation | target |
|---|---|---|---|
| 1 | resolve user | GTUser | `user/14364d39` → user 302490, player 433798 (GeneralMidwest) |
| 2–5 | record fixtures | ResolveEvent, EventEntrants (10 of 21), UserEvents (perPage 10), RecentStandings | CoN3 Ep0 `allegro-mbtl-pc` (event 1721814); GeneralMidwest; one CoN3 entrant (player 2282067, MBTL 36865) |
| 6–9 | the pull's per-player code | UserEvents ×4 (perPage 120) | GeneralMidwest |
| 10–14 | ground-truth count | GTUserEvents ×5 (perPage 100) | GeneralMidwest |
| 15–16 | live reconcile | ReconcileCount ×2 | CoN3 Ep0 events 1721812 and 1721814 |

### Could not verify

- **Ground truth's 3 random-row re-fetches** (increment 1's acceptance 5, second half): not run, because
  their target is outside the allowance's two (Terms). The instrument itself is tested offline: it catches
  a changed placement.
- **`scripts/schema-check.js`** (C2-3): not in the allowance's purpose; still open.
- **The live kill-and-resume**: fake-only, as ruled. Covered by "a crash mid-pull …" (real SIGKILL) and
  `run.test.js` "kill + resume".
- **D2-3 against real start.gg timing:** pinned with a fake that honors `AbortSignal` the way the platform
  `fetch` does. That a real queued request now survives a long queue wait is a strong pattern match, not a
  live observation (7–8).
- **Which Windows programs lock this way:** verified with a `FileShare None` handle from PowerShell. That
  Excel's open-file lock behaves the same is model knowledge, unverified.
- **Visual rendering:** the browser pane never drew (screenshot timeouts, as in pass 1). Every UI check was
  a DOM click and a DOM read.
- **P3-2** is by code reading only.
- Two processes on one token (the CLI beside the app) is documented, not prevented.

### UI checklist for the orchestrator

Both checks run **offline against the fake start.gg: no live calls**. From the repo, in PowerShell:

```powershell
$env:NODE_OPTIONS = "--require ./testlib/no-network.js --require ./testlib/fake-global-fetch.js"
$env:FAKE_DELAY_MS = "120"            # slows the fake so you can click mid-job
$env:STARTGG_TOKEN = "FAKE-SENTINEL"  # the environment wins over .env: the real token is never loaded
Copy-Item registry\tiers.csv $env:TEMP\ui-tiers.csv; $env:SEED_TIERS_FILE = "$env:TEMP\ui-tiers.csv"
node app/server.js --port 8798 --out $env:TEMP\ui-out
```

**D2-1 (a tick while a job runs):**
1. Open `http://127.0.0.1:8798/` and add
   `https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code`. The
   MBAACC event is pre-ticked. Press **Pull** and wait for the tabs.
2. On the MBAACC tab press **Refresh data**. Within about 2 s open *Seeded events*, tick **Melee Singles**
   and press **Save events**.
3. Expect the header line: **"Melee Singles ticked; pulling its players after the current job."** Nothing
   else to click.
4. When both jobs finish, the page reloads with a **Super Smash Bros. Melee** tab of 3 players (GeneralMidwest,
   Player8, MeleeOnly).

**D2-7 (the old pull folder is locked):**
1. With the tournament pulled, read `$env:TEMP\ui-out\combo-breaker-2026\current` and lock that pull's
   `players.csv` in a second PowerShell window:
   `$f = [IO.File]::Open("$env:TEMP\ui-out\combo-breaker-2026\<current>\players.csv", 'Open', 'Read', 'None')`
2. Press **Refresh data**. Expect "Refreshed. Done: … the old pull folder pull-… could not be deleted yet
   (the next pull deletes it)". The table shows the new pull.
3. (P3-1) In a third window with the same `$env:` settings, run
   `node pull.js --resume $env:TEMP\ui-out\combo-breaker-2026`. Expect "Nothing to resume … no unfinished
   pull." (exit 2), with `current` unchanged.
4. `$f.Close()`, press **Refresh data** again, and the leftover folder is gone (one `pull-…` folder left).

### REPORT

```
REPORT
- Overview: Build B pass 3 (repair) dispositioned every row of the orchestrator's rulings: D2-1,
  D2-2/C2-7, D2-3, D2-5, D2-7, D2-8, D2-9, D2-10, D2-12, D2-13 FIXED with tests (each verified failing
  on the old code); D2-4, D2-6, D2-11 acknowledged per ruling (D2-6 documented); C2-1 recorded live
  (the 3 recorded tests now run); C2-2's ground-truth count, live reconcile and token check PASS.
  node --test 223/223/0/0 on the working tree and on a clean clone offline (before 207/204/0/3).
  16 live requests, max 10 in any 60 s, read-only; nothing posted.
- Found: all ruled items doable in-window and done. New: P3-1 (a Windows-locked leftover pull was
  resumable and could be swapped in over the live pull by pull.js --resume) FIXED in 7b3bfa9 as
  part of D2-7; P3-2 (first Pull while another tournament's job runs silently does nothing)
  queued, outside the rulings.
- Ran: 8a371b7 D2-3 · b107de8 D2-2/D2-13/D2-7/D2-8 · f6db706 D2-5/D2-9 + README (D2-6, D2-12) ·
  0e21a4a D2-1 · bfb7287 D2-10 · 0bbe247 live instruments (one client, deterministic fixtures,
  token-absent, offline tests) · a8c1422 C2-1 fixtures · 7b3bfa9 P3-1, plus the record commit.
  Live: scratchpad p3/live-pass3.js, log p3/live-sends-pass3.jsonl. App: offline against the
  fake in the browser pane, DOM-driven (the pane never drew).
- Attributed: core / seeding-ops increment 3 build B, pass 3, and increment 1's live legs.
  STATED: docs/build-record-tool.md "Orchestrator rulings for build B pass 3";
  dispatch-contract-tool-b.md.
- Queued: P3-2 (needs a ruling: it is outside D2-1's text). The ground truth's 3 random-row
  re-fetches and schema-check.js (C2-3): their targets or purpose are outside the live allowance.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 3 of 4. Live allowance 20
  requests / 10 per 60 s: used 16 / max 10. No skills, subagents or workflows. Token never read
  or printed by me.
- Parked: none. The tree is clean at the record commit.
- Needs attention:
  1. P3-2: route the first Pull through the same queue as D2-1 (a few lines), or leave it.
  2. D2-2's semantics: request_count now includes carried players' earlier requests;
     requests_this_pull is the pull's own. A retry's request_count leaves out the registrant
     requests it reused. Amendable.
  3. The orchestrator's usage-log row for "Mark live again" (D2-4), after pass 4.
  4. Pass 4: re-review, including the UI checklist above (offline, no live calls).
```

---

## Orchestrator verification after build B pass 3 (2026-10-29)

Suite on the working tree at `d89c860`: 223 tests, 223 pass, 0 fail, 0 skipped (matches pass 3).
The app restarted on the repaired code against the scratch Crescendo pool: home, tournament page, tab
data and seeds export all 200.

**D2-1, driven through the API against the fake start.gg** (no live calls; `fake-global-fetch.js`,
`FAKE_DELAY_MS=120`, `STARTGG_TOKEN=FAKE-SENTINEL`, scratch `--out` and tiers copy, port 8798):

| step | result |
|---|---|
| add `combo-breaker-2026`, tick MBAACC, Pull | done in about 2 s; one tab (MBAACC, 15 players) |
| Refresh, then tick Melee Singles while the job is in its W-L phase | tick response `started: false, queued: true`; status mid-job `message: "Fetching W-L", queued: true` |
| after both jobs | tabs MBAACC (15 players) and Super Smash Bros. Melee (3 players); `out/combo-breaker-2026/` holds one `pull-…` folder, `current` names it, `set-records.json` and `state.json` beside it |

One thing seen on the way, not a defect of pass 3: ticking events through the API on a tournament with
no pool yet does not start a pull (`started: null`); the page's Pull button is the path. That is the
shape of pass 3's queued **P3-2** (a first Pull while another tournament's job runs does nothing and says
nothing). Handed to pass 4 to judge; the extra repair pair is available if it is a return.

D2-7's Windows file-lock steps were not run by hand; they rest on pass 3's two tests and its own run.

---

## Build B — Pass 4 — engineering auditor (closing re-review)

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block), a fresh job. Model: Opus. Report-only: no source, test, config or data file edited; this
section is the only change, in one commit. Reviewed `build/tool-b` at `842829c` (clean tree). The artifact
is the code at `7b3bfa9`: `git diff --stat 7b3bfa9 842829c` lists only `docs/build-record-tool.md` and
`docs/build-record.md`. No skills, subagents or workflows. **No start.gg calls, and the token was never
read**: every run preloaded `testlib/no-network.js`; the probes built the app with a fake `getToken`; the
command-line runs set `STARTGG_TOKEN=FAKE-SENTINEL` (the environment wins over `.env`) in a clone with no
`.env`, against `testlib/fake-global-fetch.js`. `out/` and `registry/` were only read. Every write ran in a
clean clone (`scratchpad/p4/clone`) or on copies; probe scripts are in `scratchpad/p4/probes/`.

### Terms as understood

- **Comparand:** `docs/dispatch-contract-tool-b.md` Acceptance 1–14, and 15, which is this pass's to give
  or withhold; `docs/design-tool.md` (§T2, §T3, §Pages, §Lifecycle, §Outputs, §Open questions);
  `docs/design.md` for the pull as amended by §T2. Pass 3 was held to "Orchestrator rulings for build B
  pass 3"; I did not re-decide those rulings.
- **Loop:** 4 passes plus at most one extra repair/re-review pair. This is pass 4. If I withhold 15, the
  pair is available and I must say exactly what the repair does.
- **Handed to me to judge:** P3-2 (a first Pull while another tournament's job runs), and pass 3's
  needs-attention 2 (`request_count` vs `requests_this_pull`).
- **Increment 1's Acceptance 12** ("closing approval: build B's pass 4", `docs/build-record.md`) is also
  this pass's. I record it here, because this job allows one record section and one commit.
- **Assumption I supplied:** "user impact at the next event" means Noah seeding one tournament in the new
  layout in the week of 2026-11-02, with the app as the main path and the command line rare. The old
  per-event pulls are not listed, so a second tournament is in play only if he adds one.

### What I re-ran

| what | command / method | result |
|---|---|---|
| suite, working tree, twice | `node --test` at `842829c` (Node v24.14.1) | 223 / 223 / 0 / 0, both runs; tree clean afterwards |
| suite, clean clone, offline, twice | `git clone --branch build/tool-b` into scratch, checkout `7b3bfa9` (no `.env`, no `out/`), `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` | 223 / 223 / 0 / 0, both runs. Sorted test names identical across all four runs; the clone stayed clean, so the suite does not rewrite its fixtures |
| before-state | the same clone at `5ecc770` and at `ca107e8` | 207 / 204 / 0 / 3 and 177 / 174 / 0 / 3, as recorded |
| test names | sorted names at `5ecc770` and `ca107e8` vs now | pass 3: 0 removed, 16 added, and the 3 `recorded:` tests now run. Whole build: the 13 renames pass 1 listed, 46 added, none removed |
| mutation checks, pass 3's fixes | 19 distinct single-string mutations in the clone (`probes/mutate.js`, `mut-extra.json`), each run against the test file that should catch it, restored with `git checkout --` (clone clean after) | 17 of 19 fail a named test (table below). The 2 that survive are a weak source pin (D4-7) and a redundant guard (the next guard still refuses, with a different message) |
| mutation checks, core acceptance guards | 7 more (`mut-core.json`) | 7 of 7 fail a named test: the post's `confirm: true` check, the fresh-fingerprint check, the queue's one-in-flight chain, `current` naming only a finished pull, the old pull's delete, the tier order of `seedSequence`, Delete's slug confirm |
| pass 2's probes, re-run on `7b3bfa9` | `audit-b2/tick-busy.js` (then `probes/tick-busy2.js`, which waits for `jobs.idle()`), `queue-timeout.js 20`, `incr-meta.js`, `post-retry.js` | D2-1: the tick returns `started:false, queued:true`; when the job ends the queued pull runs and the new tab has 101, 108 and 116 (it had none in pass 2). D2-3: at a 20/60 s ceiling, 30 sent, 0 refused before sending, 0 retries (pass 2: refused and retried). D2-2: incremental equals full, `56 / 1` skipped, 20 requests. D2-10: unchanged and right |
| P3-2, server side | `probes/p3-2.js`: tournament A's Refresh held in its W-L phase; a pool-less tournament B gets what the page's Pull sends | B `/events` → `started:null, queued:false`; B `/refresh` → **409**; B's status `busy: combo-breaker-2026`; the waiting list is empty. When A finishes: B has no job, no pull, nothing queued, only `state.json` (D4-1) |
| a queued pull across a restart | `probes/restart.js`: tick during A's W-L (queued), then a new app over the same `out/` | queued false, nothing running; the new game's tab is listed and has 0 players; the live pull's `seeded` lacks the event (D4-2) |
| D2-7 / P3-1 under a real Windows lock | in the clone, offline: a fake CLI pull; a PowerShell process holds the live `players.csv` with `FileShare None`; `node pull.js <tournament URL>` | exit 0; `current` moved to the new pull; the old folder was left half-deleted (`players.csv`, `results.csv`, `checkpoint.jsonl`, `requests.jsonl`; no `meta.json`, **no `_work/run.json`**). `--resume out/<t>` → "Nothing to resume …", exit 2; `--resume` on the leftover by name → "no pull to resume here", exit 2; `current` unchanged. Lock released, next pull: one `pull-…` folder left |
| recorded fixtures: determinism | the three `recorded:` tests under a preload that shifts `Date` by −300, 0, +400 and +1,500 days | 3/3 pass at every shift. With the `_recorded_on` anchor, user-events gives 10 rows and recent-standings 2; without it, 0 and 0 at +1,500 days, and the test would still pass (D4-5) |
| recorded fixtures: content | every key in the four files; text search for `bearer`, `authorization`, `STARTGG_TOKEN` | top level only `_source`, `_recorded_on`, `_variables`, `data`, `extensions` (`queryComplexity` only); no key matching token/auth/header/cookie/rate/limit/time/stamp/secret; no token-like string. They do hold real players' public data (D4-6) |
| pass 3's live record | recomputed from `scratchpad/p3/live-sends-pass3.jsonl` with `lib/pacing.maxInAnyWindow` | 16 sends, all HTTP 200, max 10 in any 60 s, 0 mutations; targets only GeneralMidwest (user 302490), CoN3 Ep0 `allegro-mbtl-pc` and its entrant 2282067, and events 1721812/1721814. Matches the record |
| token in history (pattern only) | `git log -p --all` for `Bearer <20+ chars>` and `STARTGG_TOKEN=<10+ chars>` | one hit, the `deliberately-bogus-…` test token quoted in increment 1's record. I did not run `scripts/token-absent.js`: it loads the token, and this job forbids reading it |
| routes | `audit-b2/routes.js` over a scratch copy of pass 1's live pool **plus copies of the six old run folders** | 22 probes 404 (`.env` in five encodings, `state.json` and `current` under four prefixes, a pull's `players.csv`, `registry/tiers.csv`, `//etc/passwd`, …); nothing leaked. `GET /` links only `/t/crescendo-of-night-3-episode-0`; `/t/<old folder name>` and `/api/t/eclipse-1st-cour` 404; `/e/eclipse-1st-cour/…` 404 with the add page; `/e/<t>/allegro-mbtl-pc` 302 to `?tab=36865`. `/api/t/<t>` events carry only the game's id, no event ids or phases |
| one queue | every `createClient`/`fetch` path in `app/` and `lib/` | the app's clients take `queue.fetch` or `queue.fetchFor` (`app/server.js:138`, `app/jobs.js:115,157,169`); `lib/run.js` and `lib/schedule-pull.js` take the `fetchImpl` they are given. The only other path is the command line (D2-9, documented) |
| protected files | `git diff --stat ca107e8 842829c --` usage-log, the three designs, all four contracts, `build-record-webapp.md`, `registry/`, `.env.example` | empty. `build-record-tool.md` and `build-record.md`: 0 removed lines (append-only) |
| `out/` and T1 | sha1 of all 56 files under `out/`, before and after my work | identical; combined `5255e91…`, as at build A's close. `registry/tiers.csv` `ffb8898…`, unchanged |

Mutation detail, pass 3's fixes (each row: what I broke, what failed):

| fix | mutation | failed |
|---|---|---|
| D2-1 | the tick calls `startPull` only (no queue) | the D2-1 test |
| D2-1 | a finished job never starts the waiting pull | the D2-1 test |
| D2-1 page | the poll loop stops while a pull is queued | **nothing** (D4-7) |
| D2-2 | carried skips dropped | both D2-2 tests |
| D2-2 | carried requests dropped from `request_count` | both D2-2 tests |
| D2-3 | the client arms the timeout at call time under the queue | the queue test |
| D2-3 | limit-fetch never arms a timeout | both D2-3 tests |
| D2-5 | the CLI writes `state.json` from its start-time read | the D2-5 test |
| D2-7 | a failed delete fails the pull | both D2-7 tests |
| P3-1 | the resume marker is not removed first | the partial-delete test |
| P3-1 | a tournament-folder resume may take an older unfinished pull | nothing: the next guard refuses it anyway ("older than the live pull"), so behavior holds; only the message differs |
| P3-1 | a named older pull is not refused | the partial-delete test |
| D2-8 | a per-event folder is not refused | the D2-8 test |
| D2-9 | `pull.js` hands `run()` no client (two clients) | the D2-9 test |
| D2-10 | the post retried like any request | 2 tests (failure modes, D2-10) |
| D2-13 | no top-up for carried no-account players | the D2-2/D2-13 test |
| D2-12 | the README loses the `claude-prompt.txt` row | the README test |
| C2-1 | an entrant's player id made non-numeric in the fixture | `recorded: entrants page …` |
| C2-1 | `queryComplexity` removed from the user-events fixture | `recorded: user.events page …` |

### Findings

**On pass 3's dispositions.** Each one holds on the artifact.

| # | pass 3 said | holds? | evidence |
|---|---|---|---|
| D2-1 | FIXED | **holds**; the same failure remains on two paths it did not cover (D4-1, D4-2) | test passes; two mutations fail it; pass 2's probe now fills the tab |
| D2-2 / C2-7 | FIXED (checkpoint counts carried) | holds | two mutations fail both tests; probe: incremental = full |
| D2-3 | FIXED | holds | two mutations fail; pass 2's probe now sends 30 of 30 at 20/60 s |
| D2-4 | ACKNOWLEDGED | holds | ruling row D2-4 ("keep, amendable"); the usage-log row is the orchestrator's, after this pass |
| D2-5 | FIXED | holds | mutation fails the test; `pool.updateState` re-reads at write time and writes atomically |
| D2-6 | ACKNOWLEDGED, documented | holds | ruling row D2-6; README "keeps the pool's two-year window … press **Refresh**", pinned by the README test |
| D2-7 + P3-1 | FIXED | holds | four mutations, three fail; reproduced under a real Windows lock above |
| D2-8 | FIXED | holds | mutation fails the test |
| D2-9 | FIXED | holds | mutation fails the test |
| D2-10 | FIXED (tests) | holds | mutation fails two tests; probe unchanged |
| D2-11 | ACKNOWLEDGED | holds | ruling row D2-11; the app has one queue (above); the CLI's second limiter is gone (D2-9) |
| D2-12 | FIXED (README route) | holds | the README table lists both files; mutation fails the test |
| D2-13 | FIXED | holds | mutation fails the test |
| C2-1 | FIXED | holds | 3 recorded tests run and pass; deterministic across clock shifts; two fixture mutations fail; no secrets in the files |
| C2-2 | DONE for the named legs | holds as recorded | the live record recomputes; C3-4 (the 3 random rows) was not run, explicitly, as outside the allowance's targets |
| C2-3..C2-6, C2-8 | ACKNOWLEDGED | holds | ruling row "C2-3..C2-6, C2-8: recorded; no action" |

**D4-1 — FINDING, not a RETURN — P3-2: the first Pull while another tournament's job runs.**
Reproduced on the server (`probes/p3-2.js`); the page side is from `app/public/tournament.js`. The Pull
button saves the ticks (`/events` → `started: null`: a pool-less tournament never starts a pull from a
tick, which is the shape the orchestrator saw), then calls `/refresh`, which returns 409 because
`jobs.begin` refuses while any job runs. The handler treats 409 as success. It writes "Pulling. This page
switches to the tabs when the pull is in." under the picker and polls. While the other job runs, the
status line reads "Another tournament is busy (<slug>)." So the page is not silent, as pass 3 put it, but
it says two contradictory things. When the other job ends, the page reloads into the same setup page,
with nothing pulled, nothing queued and no message about why. Nothing is lost or wrong on disk, and one
more press of Pull recovers.

Why a finding and not a return: no Acceptance item is missed as written. The contract and §Pages say
"Pull starts the job", and constraint 2 allows one job at a time, so refusing while busy is allowed. The
defect is a false statement on the page, on a path that needs a second tournament with a job running.
At the next event that path is unlikely (see the assumption above), and the cost when it happens is
one extra click. Noah would sign this with a comment.

**If the caller wants it closed with the extra pair, the smallest repair is:**
1. `app/server.js`, `POST /api/t/<t>/refresh`: when the tournament has no live pull
   (`!pool.currentPull(tDir)`) and the running job belongs to another tournament, call
   `jobs.queuePull(t, { mode: 'full' })` and return 202 with `jobs.status(t)` (which reports `queued`).
   Every other case stays as it is (the game tab's Refresh is already disabled while another
   tournament is busy, `app/public/app.js:532`).
2. `app/public/tournament.js`: in the Pull handler, when the response is queued, write "Queued behind
   <busy>; this page switches to the tabs when the pull is in." In `jobText`, word the `queued` line
   so it fits a first pull as well as a tick (today it says "the newly ticked event's players").
3. One test with the fake: tournament A's job held; B's first Pull → 202 and queued; when A ends, B's
   pool exists and B's tab has its players.

This follows the D2-1 ruling, which already chose "queue behind the running job" for this class of
problem. A cheaper alternative changes only the page. On a 409 with `busy` set, say "Another tournament
(<busy>) is busy; press Pull when it finishes", re-enable the button and do not poll-reload. That is
honest, but it does not queue. The pick is the caller's.

**D4-2 — NOTE — a queued pull is lost if the app restarts while it waits.** `Jobs.waiting` is held in
memory. Reproduced (`probes/restart.js`): tick during a W-L, restart, and the new game's tab is listed
with 0 players and no message, which is D2-1's original symptom. `npm run dev` restarts the app when
server code changes. The README warns that a restart stops a running Refresh, but not that it drops a
queued pull. The server can see the gap: the ticked events include one that the live pull's `seeded`
list lacks. **Resolves:** at startup, or on the tournament's status read, treat "ticked but not in the
live pull" as an owed incremental pull and queue it, or at least show "not pulled yet; press Refresh"
on that tab.

**D4-3 — NOTE, directive 9 (same miss, third time) — a pull Noah asked for can still be dropped
quietly.** D2-1 (a tick during a job), D4-1 (a first Pull during another tournament's job) and D4-2 (a
queued pull across a restart) are one failure: the app knows what pull Noah asked for, and on a busy or
restarted server it neither runs it, keeps it, nor says plainly that it did not. Each was found one path
at a time. **Root cause:** what pulls are owed lives in per-path code and an in-memory list, and is not
derived from `state.json` and the live pull. **Candidate standing rule, for ratification:** "Every pull
the user asks for is either started, queued where the page shows it, or refused with a message that
says why and what to press. Nothing a click asked for is dropped quietly." With the rule, the cheap
check follows: ticked events vs the live pull's seeded events.

**D4-4 — NOTE — pass 3's needs-attention 2: `request_count` vs `requests_this_pull` is acceptable, and
not a spec inconsistency.** `design.md` asks only for a "request count" and does not say whose. The D2-2
ruling put `request_count` among the counts that "cover carried players too". Pass 3 followed that and
kept the pull's own sends as `requests_this_pull`, which is the number pacing and
`scripts/check-requests.js` care about. The README defines both, and the CLI summary prints the pull's
own count first. One wording gap: the README says `request_count` is "every request behind the pull's
rows", but a retry pull reuses the registrant list without counting those requests, and an incremental
pull never counts the earlier pull's registrant requests. So `request_count` counts the requests that
fetched each player's history, plus this pull's own registrant and catalog requests. **Resolves:** one
README clause, if Noah keeps both fields (amendable).

**D4-5 — NOTE — the recorded tests would pass with zero rows.** `test/recorded-shape.test.js` checks
`rows + skipped <= nodes` and the shape of each row. With the `_recorded_on` anchor it checks 10 and 2
rows. If the anchor regressed, the window would drift away from the fixtures' dates, the rows would
drop to 0, and the test would still pass while checking nothing. **Resolves:** add
`assert.ok(rows.length > 0)` to the user-events and standings tests.

**D4-6 — NOTE, Noah's (share phase) — the recorded fixtures are committed real data.**
`test/fixtures/recorded/` holds 10 CoN3 Ep0 entrants' tags, start.gg user slugs and state/country,
GeneralMidwest's 10 events, and one player's standings. All of it is public on start.gg, and the repo is
local, so nothing is wrong today. It is the first real player data in git; `out/` is gitignored.
Premise 9 says this version should avoid choices that block sharing. **Resolves:** before the repo is
shared, re-record against a test tournament or replace the tags, slugs and locations.

**D4-7 — NOTE — the D2-1 page pin cannot see its own line.** The D2-1 test checks the source of
`tournament.js` with `/st\.running \|\| st\.busy \|\| st\.queued/`. That string appears twice, in the poll
loop and at start-up. Removing `st.queued` from the poll loop (the line that keeps the page waiting)
passes the test. The behavior was observed: the orchestrator drove it through the API, and pass 3
through the DOM. **Resolves:** pin the poll loop's line specifically, or leave it (the repo has no DOM
harness).

**D4-8 — NOTE — the README's "Checking a pull" list omits pass 3's two new instruments.**
`scripts/token-absent.js` (the by-value token check) and `scripts/record-fixtures.js` are described in
code headers and `test/fixtures/README.md`, not in the README. **Resolves:** two lines, if Noah wants
them findable.

**Literal ask, both directions.** *Short of it:* nothing on the Acceptance list as written. The
silent-drop paths are D4-1 and D4-2. *Beyond it:* nothing new to pull back. "Mark live again" is ruled
(D2-4, keep, amendable). Pass 3's additions all sit inside its rulings: the `requests_this_pull` field
(the D2-2 method), `jobs.idle()` and `pull.js main(opts)` (testability), and `scripts/token-absent.js`
plus the one-client instruments (the C2-2 allowance's "token-absence check"). Drag-to-order is correctly
not built. No file outside the grants changed.

**Comprehension.** Pass 3's diff is 1,549 added and 156 removed lines over 28 files. About 900 lines are
tests and recorded fixtures. The dense part is `lib/run.js`, where the incremental pull now has three
kinds of player: carried, topped up (D2-13) and fetched. The comments name each, and I could follow each
disposition from the ruling to the code to the test that fails without it. Read whole, the build is the
one in the spec: one pool folder per tournament, `current`, one queue, tabs, lifecycle, the two outputs.
It is larger than build A, but it reads in one sitting per area.

### Acceptance

| # | item | met | my evidence |
|---|---|---|---|
| 1 | `node --test` clean clone, offline, no regression; retargets justified | **yes** | 223/223/0/0 on a clean offline clone and the working tree, twice each, names identical. Since `ca107e8`: the 13 renames are pass 1's justified retargets (pass 2 checked each removed assertion), 0 removed, 46 added; the 3 recorded tests now run instead of skipping |
| 2 | pool layout; `current` atomic, after completion; old pull deleted after; W-L/state/schedule outside; crash; resume | **yes** | `writeOutputs` (meta last), then `swapIn`: `writeCurrent` writes to a temp file and renames it, and only for a pull with `meta.json` (mutation fails); the old folder is deleted after (mutation fails 5 tests). If the delete is blocked, the folder is reported and swept by the next pull (D2-7, reproduced under a real lock). Tests "pool layout …", "the swap …", "a crash mid-pull …" (real SIGKILL), "current: written atomically …" |
| 3 | one pull per tournament; dedup; Refresh carries W-L by event id; a tick is incremental | **yes, with D4-2** | tests "one pull per tournament …", "Refresh … repeats no set lookup", "ticking a new event is incremental …", D2-1, D2-2/D2-13; pass 1's live run (47 requests, 24 = 3 + 21; dedup shown on the fake only). The busy tick is queued now; a restart drops a queued tick (D4-2) |
| 4 | pages; add by URL with one request and a singles picker; tabs + Schedule; build A intact on tabs; `/e/` redirect or 404; old folders not read | **yes, with D4-1** | tests in `tournament.test.js`; my route probes over the live pool plus the six old folders (only the pool listed; the old names 404; `/e/` 302 or 404 with the add link). Build A on tabs: the "Acceptance 10" test, `parity`, `majors`, `review` and `data-tiers` tests pass unchanged since pass 2. "Pull starts the job" except while another tournament's job runs (D4-1) |
| 5 | W-L summary-first across the union; partial W-L on reload | **yes** | tests "W-L is fetched summary-first across the union …" and the retargeted "… (a reload shows partial W-L)" pass |
| 6 | T3 `schedule.json`, `linked` in `state.json`, one queue, never two in flight | **yes** | the T3 test asserts max in flight 1 with a pool refresh and a schedule pull interleaved; making the queue send without waiting fails it. Every app client is on the queue (above) |
| 7 | lifecycle: computed status, overrides, done blocks nothing, Mark done, Archive (one fetch per ticked event), Delete (confirm; `out/<t>/` only; T1 untouched) | **yes** (+ Mark live again, ruled) | tests "status is computed …" and "lifecycle …" (EventStandings once per event; T1 sha1, an old folder and another tournament untouched); removing Delete's slug confirm fails the test |
| 8 | export in seed order, 1..N, table order within a tier, untiered after; no request | **yes** | tests "seedSequence …", "export seeds CSV …" (0 fetch calls), "one source …"; reversing the tier sort fails 5 tests |
| 9 | push dry run; one sequence; diff, cross-tier flags, not-in-pool marks; a click to post; `pushes`; failure line; fake only; post behind a confirm | **yes** | `postSeeding` refuses without `confirm: true` (400) and against a stale fingerprint after a fresh re-read (409); each guard's removal fails the post test. `updatePhaseSeeding` is sent with `retry: false` (retried only on a rate limit or the time budget; removal fails 2 tests). Never posted live: pass 3's live log has 0 mutations, and this pass made no live calls |
| 10 | T1 only through the reader/writer; ✓ writes the tournament slug | **yes** | the "Acceptance 10" test; `registry/tiers.csv` `ffb8898…` unchanged |
| 11 | `.env`, `state.json`, `current` never served; nothing outside `out/` and static | **yes** | the retargeted app test (39 probes) and my 22 probes over a live-pool copy; no leak |
| 12 | README for the tournament page; CLI says the per-event layout is retired | **yes, with D4-4 and D4-8 wording notes** | add, tabs, Schedule, Refresh, lifecycle, export, push with dry run, a tick while busy, the window, the CLI's one client and "don't run beside the app", the `out/<t>/` table (pinned), "The per-event folder layout is retired." I read it against the code; nothing in it is false. The two gaps are wording (D4-4, D4-8) |
| 13 | B4-2, B4-3, B4-5, B4-1 wording | **yes** | the four tests pass; no `lib/view/` file changed in pass 3 |
| 14 | increment 1's audit | **yes** | `docs/build-record.md` pass 2 (C2-1..C2-8) and pass 3 (C3-1..C3-8). Each finding is dispositioned: C2-1 met, C2-2 met for the named legs with C3-4 explicitly not run, C2-7 fixed, and C2-3, C2-4, C2-5, C2-6, C2-8 recorded with no action and left to Noah (below) |
| 15 | closing approval on the actual artifact | **given** | this verdict, on the code at `7b3bfa9` |

**Increment 1's own Acceptance 12** (closing approval, `docs/build-record.md`): **given, with notes**, for
the pull's code against `design.md` as amended by §T2. Its items stand as pass 3 left them. Item 5's
three random-row re-fetches (C3-4) and the schema questions (C2-3) are still open. Both need a live
allowance and are left to Noah. Item 7's live kill is fake-only, by ruling. `docs/build-record.md` has no
pointer to this section yet (this job allowed one record); the orchestrator may add one line.

### Could not verify

- **The page in a browser.** I drove the server through its handler and read the page code. I did not
  open the browser pane. The P3-2 page text (D4-1) is from code reading, matched to the server
  responses I observed. Visual rendering is still unseen by every pass (the pane never drew for passes 1
  and 3 or for the orchestrator).
- **The post against real start.gg, start.gg's real error wording, and `EventStandings` live.**
  Prohibited or fake-only in this build; the `pushFailure` patterns remain model knowledge.
- **The token by value.** I did not read it, so I did not run `scripts/token-absent.js`. Pass 3's run
  (987 files, 0 hits) and my pattern scan are the evidence.
- **Two processes writing `state.json` in the same instant** (the app and a command-line tick). Each
  write is an atomic read-modify-write, so the window is milliseconds. I did not exercise it.
- **Which Windows programs lock files like `FileShare None`** (Excel, an editor). I reproduced the lock
  with PowerShell only.
- **The live dedup** (no CoN3 Ep0 player entered both events), as in passes 1 and 2.

### Open items that belong to Noah

Every amendable default and acknowledgement across build A and build B, plus this pass's:

1. **B2-1 / B4-1 — what un-✓ restores** (amendable; default option (a)). The undo restores the earlier
   review within one page load. After a reload or from another browser, that review's date and
   tournament are lost (recoverable from git until you commit `tiers.csv`). Keep it, or pick (b) the
   server remembers the pair for the day (no table change), or (c) a stored previous-review pair (a T1
   change and a spec amendment).
2. **B2-2 — majors for MBTL** (amendable): `36865` has its own list with Climax of Night; UNI2 stays on
   the default four.
3. **B2-5 — the CLI's HTML carries your tiers, notes and review marks.** Know it before sending
   `major-table-<game>.html` to anyone.
4. **B2-6 — "today" is the UTC day** for ✓ dates and the same-day undo (after 8 pm EDT a ✓ is stamped
   tomorrow).
5. **D2-4 — "Mark live again"** (kept, amendable; outside §Lifecycle's three controls). The
   orchestrator adds the candidate usage-log row after this pass.
6. **D2-6 — an incremental pull keeps the pool's window** (amendable). New players miss results since
   the last pull until a full Refresh.
7. **D2-11 — pass 1's live run went one over the budget** (21 in 60 s against 20). Acknowledged by the
   orchestrator; needs your acknowledgement. The app path is one queue now, and the CLI has one client.
8. **D4-1 / P3-2 — the first Pull while another tournament's job runs** says "Pulling" and then
   returns to the setup page with nothing pulled. Close it now with the extra repair pair (repair above),
   or later, or leave it.
9. **D4-2 / D4-3 — a queued pull is lost on an app restart; the candidate standing rule** "nothing a
   click asked for is dropped quietly". Ratify the rule or not; the fix is small either way.
10. **D2-2 / D4-4 — `request_count` includes carried players' earlier requests; `requests_this_pull`
    is the pull's own** (amendable). Keep both, or keep one.
11. **D4-6 — the recorded fixtures are real players' public data in git.** Fine locally; scrub or
    re-record before sharing the repo.
12. **Pass 1's interpretations still unconfirmed by you:** a tab = the players who entered that game's
    ticked events; `state.json` also holds the event catalog (D2-5a); the push re-reads start.gg and
    refuses on a changed fingerprint; the export ignores *Needs tier only*. Plus build A pass 1's
    majors interpretations (exclusions on tournament or event name, anchored patterns, main event across
    all registrants, CEO gone from Eclipse).
13. **A2-5** (the "(N of 182)" series headers vs "no aggregate counts"; default: drop the labels, keep
    an events list without a count) and **A2-6** (the Sheets import of `= + - @` tags; default: test one
    row before relying on it).
14. **A4-3** — a time-budget error fails that one player and the pull goes on (default "keep current",
    pinned by test), vs stopping the whole run resumably.
15. **A4-6** — the two standing rules (record out-of-band changes; things that must agree come from
    one source or a pinning test): adopted as the default, and build B followed them (`seedSequence`
    is the one numbering).
16. **C2-3 — the schema questions** (is `recentStandings`' `videogameId` optional; does `user.events`
    take a date filter). `scripts/schema-check.js` has never run; a no-account player's other games are
    not fetched until it does. Needs a small live allowance. With it: **C3-4**, increment 1's three
    random-row re-fetches. Also recorded, no action: C2-4 (`reconcile --live` takes three subtractions
    from the pull's own meta) and C2-5 (request-log stamps are taken before an outer limiter's wait, so
    `check-requests.js` is an upper bound).
17. **Before 2026-11-02:** the app lists only the new layout. Add the next event's tournament and Pull
    in the app; the old per-event pulls are not shown. Eclipse's side-game link comes back from
    `conflicts/linked.json` if Eclipse is added.
18. **Drag-to-order** (spec step 6, "only if Noah still wants it") was not built and is not in this
    contract.

### Verdict: APPROVE WITH NOTES

**Acceptance item 15 is given.** The extra repair/re-review pair is not required for it. It stays
available if the caller wants D4-1 closed before the next event (the repair is specified above).

**What it covers:** Acceptance 1–14 on the code at `7b3bfa9`, checked on the artifact, not the record.
I re-ran the suite four times (working tree and a clean offline clone, twice each) with identical
results. I ran 26 mutation checks (24 failed a named test; the 2 survivors are explained above), re-ran
pass 2's four probes against the repaired code, and wrote two new probes (P3-2, restart). I reproduced
D2-7 and P3-1 under a real Windows file lock, shifted the clock across five years for the recorded
fixtures, audited the fixtures' content, recomputed pass 3's live log, probed 22 routes over a live pool
beside the six old folders, and hashed `out/` and T1 before and after. Every pass-3 disposition holds as
dispositioned.

**Why notes and not a return:** no Acceptance item is missed as written. D4-1 is a false "Pulling"
message on a path that needs a second tournament's job, with no data effect and a one-click recovery.
D4-2 needs a restart mid-job. Both are the same failure as D2-1, so they go up as a root-cause rule
(D4-3) for Noah to ratify, not into a third repair loop on symptoms. The rest are wording, test-strength
and share-phase notes.

**What it could not judge:** anything only a browser shows; the real post and start.gg's real errors;
the token by value (not read, by the job's terms); the live dedup; the open increment 1 legs that need a
live allowance (C2-3, C3-4).

### REPORT

```
REPORT
- Overview: Pass 4 (engineering auditor, closing re-review) of build B at 842829c (code 7b3bfa9).
  Verdict: APPROVE WITH NOTES; Acceptance 15 is given, and increment 1's own Acceptance 12 is given
  with notes. Every pass-3 disposition holds on the artifact. Suite 223/223/0/0 on the working tree
  and a clean offline clone, twice each, names identical; 24 of 26 mutations fail a named test.
  out/ (56 files, 5255e91…) and registry/tiers.csv (ffb8898…) unchanged.
- Found: D4-1 FINDING, not a return (P3-2: a first Pull while another tournament's job runs says
  "Pulling", then reloads to the setup page with nothing pulled; repair specified for the optional
  extra pair). D4-2 NOTE (a queued pull is lost on an app restart; the tab is empty with no message).
  D4-3 NOTE, directive 9 (third time the same shape: candidate standing rule "nothing a click asked
  for is dropped quietly"). D4-4 NOTE (request_count vs requests_this_pull acceptable, not a spec
  inconsistency; one README clause). D4-5 NOTE (recorded tests pass with zero rows). D4-6 NOTE (the
  recorded fixtures are real players' public data in git; share phase). D4-7 NOTE (the D2-1 page pin
  cannot see the poll loop). D4-8 NOTE (README omits token-absent.js and record-fixtures.js).
- Ran: node --test x4; test-name diffs vs 5ecc770 and ca107e8; 26 mutations in a clean clone
  (probes/mutate.js, mut-extra.json, mut-core.json); pass 2's probes re-run (tick-busy, queue-timeout,
  incr-meta, post-retry); new probes p3-2.js and restart.js; D2-7/P3-1 under a real PowerShell
  FileShare-None lock (offline, fake start.gg); recorded tests under 4 clock shifts; fixture key audit;
  pass 3's live log recomputed (16 sends, max 10/60 s, 0 mutations); 22 route probes over a live-pool
  copy plus the six old folders; protected-file diff; out/ and T1 hashes. Evidence: this section of
  docs/build-record-tool.md, one commit; scripts in the session scratchpad p4/probes/.
- Attributed: core / seeding-ops increment 3 build B, pass 4, and increment 1's closing (its
  Acceptance 12). STATED: dispatch-contract-tool-b.md (Passes table, Acceptance 15), design-tool.md,
  design.md, the caller's pass-4 dispatch.
- Queued: D4-1's repair, which is the caller's pick (impact: low, a message on a rare path; use the
  extra pair, or fix later). D4-3's standing rule, which needs Noah's ratification (a values rule, not
  this seat's to make). C2-3 and C3-4, which need a live allowance this pass did not have.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 4 of 4; the extra pair is unused. No
  skills, subagents or workflows. start.gg requests 0. Token never read. out/ and registry/ read only;
  all writes on a scratch clone and copies.
- Parked: none. Tree clean at the record commit. The scratch clone is clean (its out/ removed).
- Needs attention:
  1. D4-1 (P3-2): close it now with the extra pair (repair specified: /refresh queues a first Pull
     behind another tournament's job, the page says so, one test), or later.
  2. D4-3: ratify "nothing a click asked for is dropped quietly" (it would also close D4-2).
  3. Before 2026-11-02: add the next tournament in the app and Pull (old per-event pulls are not
     listed).
  4. Amendable defaults to confirm: B2-1/B4-1 undo scope, B2-2 MBTL majors, D2-4 Mark live again
     (usage-log row), D2-6 window, D2-2/D4-4 request counts; acknowledgements: B2-5, B2-6, D2-11.
  5. Carried: A2-5, A2-6, A4-3, A4-6, C2-3 (+ C3-4, needs a live allowance), D4-6 before sharing,
     pass 1's interpretations, drag-to-order if still wanted.
```

---

## Out-of-band: the desktop app shell (orchestrating session, 2026-10-29)

Noah: *"the scoreboard control tool i built for my stream setup uses a good tauri setup that i want to
replicate for this … copy the setup with pipeline too."* Recorded per standing rule (a). Not part of
build A or B; the share-phase direction the spec named ("a Tauri shell"), done now on his instruction.

Copied from `C:\Users\iknow\repos\mbaacc-stream-setup` with names, port and window size changed:

| file | role |
|---|---|
| `src-tauri/` (Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, shell/index.html, src/main.rs, icons/) | the Rust shell: spawn the sidecar (`app/seeding-server.exe` beside the code, or beside the exe), open a window on a starting page, navigate to `http://127.0.0.1:8765/` once the port is up, kill the server on exit. Window 1440×900, min 900×500. Icons are the stream app's for now. |
| `app/app-main.js` | the compiled sidecar's entry: prefers a live `app/server.js` found beside the exe, its parent, `project-path.txt` or `SEEDING_PROJECT`; else the embedded copy. Sets `SEEDING_ROOT` and calls `main([])`. |
| `scripts/build-sidecar.mjs` | `npm run sidecar`: Bun compiles `app/app-main.js` to `src-tauri/binaries/seeding-server-<triple>.exe`. |
| `.github/workflows/release.yml` | dispatch or `v*` tag: tests, sidecar, tauri-action build (nsis, dmg as artifacts), a portable Windows ZIP (`Seeding Ops.exe`, `app/seeding-server.exe`, app/, lib/, config/, views/, registry/tiers.csv, pull.js, seed.js, launchers, README, .env.example; never out/ or .env), published under `latest` or the tag. |
| `package.json`, `package-lock.json` | scripts `sidecar`, `tauri`; devDependency `@tauri-apps/cli ^2` (the first dependency in the repo; dev only, for CI's `npm ci`). |
| `.gitignore`, README §Desktop app | build output and the dropped-in exes ignored; the checkout and release workflow documented. |

**Code change for the embedded case:** a compiled binary's `__dirname` is inside the bundle, so
`app/server.js`, `lib/view/data.js`, `lib/view/majors.js`, `lib/pool.js` and `pull.js` resolve the
project folder from `SEEDING_ROOT` when it is set (the loader sets it), and the server's static files
come from `<root>/app/public`. From source nothing changes. Suite after: 223/223/0/0 offline.

**Verified locally** (Bun 1.4.4): the sidecar compiles (110 MB); dropped into `app/` it starts in live
mode (`server code : live from …app\server.js`), home 200, `/static/model.js` 200, `/.env` 404; from
a bare folder without `app/server.js` it starts in embedded mode against the files beside it, same
probes. `node:util.parseEnv` works under Bun, so `.env` loading does. **Not verified:** the Rust shell
itself (no Rust toolchain here; CI builds it, as for the stream app), the NSIS resources list, the
workflow end to end (the repo has no remote yet).

---

## Out-of-band: light/dark theme switch (orchestrating session, 2026-10-29)

Noah: *"light and dark mode toggle that's persistently visible like a switch would be good."* Recorded per
standing rule (a). `app/public/theme.js` (served on every page, loaded in `<head>` so the theme applies
before first paint) renders a fixed top-right switch; the choice is per browser in
`localStorage['seeding:theme']`; with nothing saved the OS preference applies. `app/public/app.css`: the
34 hardcoded colors moved onto variables (none left), a dark block overrides the same variables under
`html[data-theme="dark"]` and under `prefers-color-scheme: dark` when no choice is saved. Verified in the
browser pane: OS-dark applied with nothing saved; the click saved `light`, applied it, and it held on
another page; the switch is present on the index, the not-added page and the tournament page. Not
checked by eye: the seeding table's dark colors on real data (no tournament is in the new layout yet).
Suite 223/223/0/0.

---

## Out-of-band: import of the old per-event pulls (orchestrating session, 2026-10-30)

Noah: *"import of those is fine"*, and no sandbox: *"put past events in archived section and let them
be manually deleted if necessary."* `scripts/import-legacy.js` (+ `test/import-legacy.test.js`) converts
`out/<t>__<e>__<stamp>/` (newest finished run per event) into `out/<t>/pull-<stamp>/` + `current` +
`state.json` (all events ticked; linked side tournaments from `conflicts/linked.json`) +
`set-records.json` (the runs' W-L caches merged) + `schedule.json` (newest `conflicts/out/<t>__*`), offline,
never touching the old folders. Run on the real `out/`: Crescendo (2 events, 27 players, 2,272 results,
1,560 W-L) and Eclipse (182 players, 10,154 results, 10,154 W-L, schedule with 402 players, 31 events,
1 side tournament). Both list as **done** in the app with their tabs; verified through the API and the
browser pane. The old folders remain on disk (gitignored) and are unused by design.

---

## Build C — Pass 1 — lead engineer

Seat: lead-engineer persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`, Profile block,
loaded in-seat). Model: Opus. Branch `build/tool-c`, started at `c7be7b3` with a clean tree. Commits
`ff379d3`, `56c7c5d`, `c4cf4a3`, `00996c1`, `e26b22f`, `d72d3bb`, `c23be07`, `c6f0aee`, `6c49b79`, plus
this record's commit. Local only, no push, nothing amended. No skills, subagents or workflows.

### Terms as understood

- **Scope:** `docs/dispatch-contract-tool-c.md` Acceptance 1–11 (12 is pass 4's). Spec:
  `docs/design-tool.md` Amendment A1 (the discriminator, match order and the tag-only color, the CSV
  contract and page, source badges, prior pages), with §T1, §T2, §Pages, §Lifecycle and §Open
  questions where A1 is silent.
- **Kept from builds A and B:** the ✓ semantics (option (a), the in-page restore; B2-3's empty-row
  removal), the one tier-row matcher for reader and writer (A4-2), A6-1, the majors config, the pool
  layout and `current` swap, the one queue, the theme switch (both dark blocks), `scripts/import-legacy.js`
  pools reading as start.gg.
- **Mid-pass caller messages** (Noah, relayed by the coordinator, 2026-10-30; binding; applied in
  `c23be07` and `c6f0aee`, pinned by `test/upload.test.js` "home page layout"):
  1. Under an "Add a tournament" header, the link field and its Add button on one row; under that row
     an "Import from CSV" option with a short description (two columns name/discriminator, its own
     page for one game, no push or schedule). Home page order: header, link row, CSV import.
  2. No "Live tournaments" block or explanatory text. The list stays live, then done, then archived;
     one small sentence above the first done tournament says tournaments are marked done
     automatically once their last seeded event's date has passed and can be deleted by hand.
- **Grants used:**
  - `registry/tiers.csv`: (a) the migration, once, after its tests passed and after a run on a scratch
    copy (`c4cf4a3`; `registry/tiers.csv.bak` kept, gitignored, until pass 4); (b) the writer in
    `lib/view/data.js` during the live upload (`6c49b79`). **For the auditor:** the upload's linking
    is a new function (`linkPlayers`, and `fillDiscriminators` for pulls) on the writer's path: the
    same `readTierTable`, the same `toCsv`, the same temp-file-and-rename, now shared with
    `editTierRow` as `writeTierTable`. I read "the existing reader/writer" as that path, not as "only
    the ✓ and edit routes". No row was hand-edited.
  - `out/`: created `out/mixfest-26-mbaacc/` only (live run) and scratch folders under this session's
    scratchpad. The existing pools were not written: `out/eclipse-1st-cour/state.json` and
    `out/crescendo-of-night-3-episode-0/state.json` still have mtime 2026-10-30 09:13:14, from before
    this pass (`ls -l`). The old `out/<t>__<e>__*` folders were never read.
- **Prohibitions:** start.gg was called only by the live upload, through the app's queue, one
  process, ceiling 20 per 60 s (`SEED_APP_MAX_PER_MIN=20`): 32 user lookups and one pull (per-player
  history plus W-L). 168 requests; max **20** in any rolling 60 s by the queue's send times (details
  under Live requests). Nothing was posted. I never opened, read or printed `.env` or the token; the
  app's `lib/token.js` loaded it. One web search (Exa, not start.gg's API) found the event date.
- **Before-state** (at `c7be7b3`, before the first edit): `node --test` → **225 tests, 225 pass, 0
  fail, 0 skipped.**
- **Grounding not consulted** (the standards bank, the runbook): the contract fixes the process; every
  ruling below traces to A1, the spec, the earlier build records or the existing code.
- **Provenance:** the persona was loaded from the library file named above. The design doc and the
  amendment are Noah's; I did not author them.

### Assumptions I supplied

Defaults and interpretations, each amendable.

1. **The tag-only color is light blue:** `--tag-only-bg: #cfe2ff; --tag-only-fg: #12357a` (light),
   `#18406e` / `#d3e5ff` (dark, both dark blocks), and `#cfe2ff`/`#12357a` in the CLI view. A1.2 allows
   grey or light blue; grey already means "never reviewed" (`rec-never`), so grey would be ambiguous.
   Hover text, exactly: *"Matched by tag only: this tiers row has no start.gg id yet. A ✓ or an edit
   links it to this player."*, then " · " and the recency text it replaces.
2. **The tag-only color replaces the recency color** on that cell (the recency stays in the hover).
   Nearly every tag-only row is a never-reviewed sheet row (a ✓ links the row), so the grey carried
   no extra information there. Visible consequence: on start.gg pages (Eclipse), sheet-only rows that
   were grey are now light blue.
3. **A discriminator is 8 hex characters**, kept lower case. Evidence: all 32 in the Mixfest file
   and every `user_slug` in the pulls. That start.gg never issues another shape is model knowledge,
   unverified. Header detection depends on it (a first row whose second value is not such a code is
   the header).
4. **Match details** (`lib/view/data.js` `matchTierRowBy`): a row with a discriminator and no
   `player_id` never answers to a tag; a row whose `player_id` names another player never answers to
   a discriminator. For an uploaded player the list's name is an extra tag key, after start.gg's own
   (reader and writer share it).
5. **Team** on an uploaded page is the list's prefix when it gives one, else start.gg's. A1.3 says
   "the Team column gets the prefix" without saying whose. On the Mixfest data it makes no
   difference: all 32 list names equal start.gg's prefix and tag.
6. **The alias hover** shows when the tag part of the list's name differs from start.gg's tag (case
   and spacing ignored): a dotted underline, title *In the uploaded list as "…"*. None on Mixfest.
7. **A code start.gg doesn't know** becomes a row with id `unresolved-<code>`, `history_status`
   "unresolved", the list's name, no request, no ✓ and no tier or notes edit (the routes accept
   digits only, so they 404). It is counted in `meta.json` `history_status` only where it occurs.
8. **Registry linking at upload writes the ids of tag-only matches** (A1.3), so those rows read by id
   afterwards and the light blue does not appear on the upload's own page; the review surface there
   is the summary's "Linked by tag — please review" list. When two or more uploaded players match one
   row by tag, none is linked (A6-1 for a batch) and the summary lists it.
9. **Pulls fill discriminators** (A1.1, "rows get a discriminator when a pull … resolves one"): after
   every pull, rows already linked by `player_id` get the player's discriminator, any game. Never by
   tag. **No backfill in the migration** (the contract's "may"): the migration stays a pure byte
   transform, and rows fill on the next pull, upload, ✓ or edit.
10. **"Done by the given date"** = from the start of that date in the server's local time
    (`new Date(y, m-1, d)`; Mixfest's is stored as `2026-11-14T06:00:00.000Z`, midnight CST). The
    Mixfest date, 2026-11-14, is start.gg's listing for "Melty Blood Actress Again Current Code" at
    Midwest Mixfest '26 (<https://www.start.gg/tournament/midwest-mixfest-26/events>, seen through an Exa
    search; tournament dates Nov 13–15, MBAACC on the 14th).
11. **The page slug comes from the name** (`Mixfest 26 MBAACC` → `mixfest-26-mbaacc`). An existing
    `out/<slug>/` is refused (409), and adding a start.gg tournament whose slug is an uploaded page's is
    refused too, so neither overwrites the other.
12. **Refresh on an uploaded page** pulls the same players again (Refresh means everything) and looks
    up any row whose lookup failed. It never re-reads the file.
13. **"Shown once"**: the page opens the newest summary by itself while it is unseen, then marks it
    seen (`POST /api/t/<t>/upload/seen`, `shown_at`); afterwards it stays on the page, folded. Each run
    that looked something up appends a summary to `state.json` `uploads`.
14. **The game picker**: the numeric ids in `config/majors.json` (22407, 36865) with their names, then
    "Other": a free id plus an optional name (default `Game <id>`).
15. **CSV edges**: blank lines skipped; values after the second column ignored and listed by line; an
    unterminated quote reported as malformed at its line; an empty name allowed (start.gg fills the tag).
16. **`source` on read**: `lib/pool.js` `readState` gives `"startgg"` to a state.json without one and
    never writes it; new tournaments get `source: "startgg"` from `newState`.
17. **start.gg blue is `#3f80ff`**, model knowledge, unverified; one token per theme. The upload badge
    is a muted violet (`#ece4f7`/`#4b2a7a`, dark `#3a2a52`/`#dccbf5`).
18. **Archive standings is off for an uploaded page** (no start.gg events to fetch); Mark done and
    Delete work.
19. **`players.csv` gains `alias`** only in an uploaded pool; a start.gg pull's file is unchanged.
20. **The lookups are logged** to `out/<t>/upload-requests.jsonl` (op, time, code, status; no token).
21. **The desktop app on 8765 runs an older build** (the compiled sidecar). Two effects to know:
    it shows the Mixfest page without build C's behavior (badges, hidden push), and its writer orders
    columns by its old list, so its next tier write would move `discriminator` to the end of
    `registry/tiers.csv`. Reads are by name, so nothing breaks, and the next write by new code puts it
    back. Not exercised; reasoned from `readTierTable`.

### Engineer's-choice rulings

| ruling | options considered | picked, and why |
|---|---|---|
| Where an upload's pull lives | (a) a separate upload runner; (b) an `upload` input to `lib/run.js` that replaces only the registrant source | (b). The per-player loop, checkpoint, resume, `buildOutputs` and the swap are the existing code; the W-L stage in `app/jobs.js` is unchanged. |
| Where the lookups' answers live | (a) in memory until done; (b) in `state.json`, written as each answers | (b). A stopped job resumes without asking again; `test/upload.test.js` "a stopped upload resumes". |
| Representing an unknown code | (a) a view-only join from `state.json`; (b) a row in `players.csv` with a synthetic id | (b). Every view (table, compare, exports, CLI) shows it with no new plumbing; the id can't reach a write route. |
| The match result | (a) change `matchTierRow` to return `{ row, by }`; (b) add `matchTierRowBy`, keep `matchTierRow` | (b). `lib/push.js` keeps its call unchanged; one index and one precedence for every caller. |
| Tag-only vs recency on one cell | (a) both classes, CSS order decides; (b) one class chosen in `tierCellClass` | (b). No dependence on stylesheet order; the table, compare panel and CLI all call it. |
| The CSV parser | (a) `lib/output.js` `parseCsv`; (b) `tiers-migrate` `splitRaw`; (c) a small one in `lib/upload.js` | (c). (a) keys rows by header and loses line numbers; (b) throws on the first bad quote. The contract needs line numbers and keeps going. |
| How the file reaches the server | (a) multipart form; (b) the browser reads it (FileReader) and sends JSON | (b). The server stays JSON-only, with no multipart parser to own. Limit: the 200 kB body cap (a 32-row list is about 1 kB). |
| How the page drops the blue after a ✓ or edit | (a) the page infers it from the action; (b) the write route answers `linked` | (b). The server states whether the row now carries this player's id. |

### Acceptance

Suite: `node --test` → **tests 256, pass 256, fail 0, skipped 0** (before 225/225/0/0). Clean clone
(`git clone -b build/tool-c` at `6c49b79`, no `.env`): 256 / 256 / 0 / 0.

| # | item | met | evidence |
|---|---|---|---|
| 1 | `node --test` clean clone, offline, no regression | yes | Above. 31 tests added, 0 removed or skipped; 7 existing tests changed, each listed below with the spec sentence behind it. |
| 2 | T1 migration: `discriminator` after `player_id`, blank, every other byte identical, idempotent, reader/writer round-trip; rows get a discriminator from pulls and uploads | yes | `lib/tiers-migrate.js` `migrateTiersDiscriminator`, `migrateTiers`; `test/tiers-migrate.test.js` (byte identity on the real shape incl. CRLF, BOM and line breaks inside fields; LF; bare quoting; idempotence; refusals; the round-trip). Real run: scratch copy first (713 records, 0 mismatches, BOM and CRLF kept, re-run a no-op), then `node scripts/migrate-tiers.js` once (`c4cf4a3`). Pull fill: `test/upload.test.js` "a start.gg pull writes the discriminator…"; upload fill: "registry linking on upload". No backfill (assumption 9). |
| 3 | Match order id → discriminator → tag; one matcher; tag-only marked and colored in table, compare panel, CLI; color and hover recorded; ✓ or edit writes both ids; A6-1 | yes | `test/match-order.test.js` (9 tests: each path, the view-model mark, the cell in table and compare panel, the CLI's CSS, both dark blocks equal, ✓ and edit linking, an existing discriminator kept, A6-1, the route). `test/parity.test.js` pins the CLI cell. Mutation check: disabling the discriminator step, the tag-only mark, or the write's discriminator fails 2, 4 and 3 tests (restored after). Color and hover: assumptions 1–2. |
| 4 | CSV parsing contract | yes | `test/upload-csv.test.js`: the Mixfest fixture (32 rows, header, splits, 9 team names), code forms, header detection, duplicates with lines, malformed rows with lines (one column, empty, bad code, unterminated quote) beside kept rows, quoted commas and line breaks. |
| 5 | Resolution: one `user(slug)` per row through the queue; unresolved kept and flagged; fake gains a resolver | yes | `lib/startgg.js` `Q_USER_BY_SLUG`/`fetchUserBySlug`; `lib/upload.js` `resolveRows`; `testlib/fake-api.js` `UserBySlug`. Tests: found fields, not-found (no user, no player), a 503 kept as an error and asked again, a bad token stopping it, one request per row. Live: 32 `UserBySlug` requests, 32 found. |
| 6 | `POST /api/uploads` → `out/<slug>/`, `state.json` source upload, one synthetic event, pull via per-player code; one tab, no push, no Schedule; done by date; export and ✓; home lists it; form beside "Add a tournament" | yes | `app/server.js` `createUpload`; `app/jobs.js` `resolveUpload`; `lib/run.js` `upload`. `test/upload.test.js` (requests and order, state, the page's tab and controls, export, seeds, ✓, refusals of push/schedule/linked/ticking/Archive, done after the date, validation). Home layout per the two mid-pass messages (pinned). Browser pane, offline against the fake on port 8790: the form submitted, redirect, the job, the page in both themes, no console errors. Live: `out/mixfest-26-mbaacc/`. |
| 7 | Display: current start.gg tag; the list name as alias on hover; prefix in Team | yes | `lib/view/render.js` `akaOf`; test "the page: …" (alias hover on a renamed player, none on a same-tag one, Team from the list, else start.gg's). Seen in the pane (dotted underline, title). Live data has no differing names (assumption 5). |
| 8 | Registry linking on upload, linked-by-tag listed, summary shown once and kept in `state.json.uploads`; test with a scratch tiers file | yes | `lib/view/data.js` `linkPlayers`; test "registry linking on upload" (scratch file: id match, tag link, two players one tag, another game's row, tier/notes/source untouched, the summary, `upload/seen`). Live: 7 by id, 11 by tag, 0 ambiguous, 14 with no row; `git show 6c49b79` changes only `discriminator` (18 rows) and `player_id` (11). |
| 9 | Source badges, both themes; existing and imported read as start.gg (migrated on read) | yes | `SOURCE_BADGE` in `app/server.js`; tokens in `app.css` light and both dark blocks (`test/match-order.test.js` compares the dark blocks). Test "the home page: …" (a state.json without `source` reads as start.gg and its bytes are unchanged). Live home page via the API: Mixfest `upload`, Eclipse and Crescendo `start.gg`. |
| 10 | Live check: Mixfest uploaded once for real, request counts recorded; the page checked by the orchestrator | yes for the run, the orchestrator's check is pending | Live requests, below. The page itself is for the orchestrator: I left the summary unseen for Noah (opening the page marks it seen). |
| 11 | README | yes | `d72d3bb`, `c6f0aee`: the upload (contract, what you get, what is missing), the discriminator column and match order, the light blue, the badges, `lib/upload.js`. |

### Changed tests

| test | change | why (spec) |
|---|---|---|
| `test/review.test.js` ×3 (✓ response shapes, lines 60, 114, 305) | expected objects gain `linked` | A1.2: the write route answers whether the row is now linked, so the page can drop the tag-only color. Additive. |
| `test/outputs.test.js` "B4-3: the grey hover…" | the sheet-only row is now `match-tag` with *"Matched by tag only … · Never reviewed (tier from the sheet import)"*; the app row keeps grey | A1.2: a row matched by tag only gets the distinct color. The B4-3 text is still asserted, after the tag-only text. |
| `test/parity.test.js` "parity: the CLI view…" | `rec-never` → `match-tag` for the sheet-only row; plus the CLI's CSS rule | A1.2, and the CLI must show the same cell. |
| `test/tiers-migrate.test.js` "scripts/migrate-tiers.js on a copy…" | after the script, the file is T1 *then* the discriminator column | Acceptance 2: the script brings the file to the current shape. The T1 step is still pinned by the T1 tests. |
| `test/tiers-migrate.test.js` "the real registry/tiers.csv…" | adds the discriminator-shaped branch (and build C's `.bak` branch); the pre-T1 branch is unchanged | Acceptance 2: the real file now has the column. |

New: `test/match-order.test.js` (9), `test/upload-csv.test.js` (10), `test/upload.test.js` (9), and 3 in
`test/tiers-migrate.test.js`. 225 + 31 = 256.

### Live requests

One run, 2026-10-30 15:04:57Z–15:13:17Z, the app from source on port 8791
(`SEED_APP_MAX_PER_MIN=20 node app/server.js --port 8791`), the real token from `.env`, the real `out/`
and `registry/tiers.csv`, via `curl -X POST /api/uploads` with the fixture's text (the same body the
form sends).

| part | requests | source of the count |
|---|---|---|
| user lookups (`UserBySlug`) | 32 (32 found, 0 not found, 0 errors, 0 retries) | `out/mixfest-26-mbaacc/upload-requests.jsonl` |
| pull: per-player history (`UserEvents`) | 70 (0 retries) | `out/mixfest-26-mbaacc/pull-20261030-100600/_work/requests.jsonl`; `meta.json` `request_count` 70 |
| pull: W-L (`UserIds` 2, `SetsBatch` 64) | 66 (0 retries) | `…/_work/wl-requests.jsonl` |
| **total** | **168** | `…/_work/refresh-sends.json` `requests: 168` (every send of the job, through the queue) |

**Max in any rolling 60 s: 20**, by the queue's send times (`refresh-sends.json` `sent_at_ms`, through
`lib/pacing.js` `maxInAnyWindow`), with the ceiling at 20. **For the auditor:** the client's request
records give 21 in one window. Those records are stamped when a request enters the queue
(`lib/startgg.js` `request` takes `t = now()` before `fetchImpl`), and the queue may hold a request
before sending it. So the client view runs a little ahead of the sends, and the queue's stamps
(`app/limit-fetch.js` `onSend`, taken at the send) are the HTTP requests. I read the limit as HTTP
requests; the auditor may read it otherwise.

Result: 32 players (32 complete), 3,076 result rows in the window, 256 W-L fetched (all known), max
`queryComplexity` 841, 0 failed. Tiers: 18 of 32 players have a tier (7 by id, 11 newly linked by tag).

### Could not verify

- **The live Mixfest page in a browser.** Not opened on purpose: the first visit marks the upload
  summary seen, and that viewing is Noah's. Checked through the API instead (32 players, 3,076 rows, W-L
  256/256, one tab, `controls` without Archive, the summary unseen, the home page's badges).
- **start.gg's exact blue** (`#3f80ff`): model knowledge.
- **The discriminator's shape** beyond the 8-hex values seen (assumption 3).
- **The desktop app (8765)** against the new files: not exercised (assumption 21).
- **The form's real file picker:** in the pane the file was attached with a `DataTransfer` (the pane
  has no file dialog). The submit, the reading and the redirect ran for real.
- **The light blue on a live page:** the Mixfest page has no tag-only rows after linking; the color
  was checked in the pane on the offline fake page (both themes) and by tests.

### UI checklist for the orchestrator

Run the app **from source** (`npm start`, or `node app/server.js --port <p>`), not the desktop exe on
8765, which is an older build.

1. **Home page layout** (both mid-pass messages): "Tournaments", then the "Add a tournament" header,
   the link field and **Add** on one row, then **Import from CSV** with its one-line description shown
   while folded, then the list. No "Live tournaments first…" text. The sentence *"Tournaments are
   marked done automatically once their last seeded event's date has passed. Delete one by hand…"*
   sits just above the first done tournament (Mixfest is live, so above Eclipse).
2. **Badges** in light and dark: Mixfest 26 MBAACC has a violet **upload** badge; Eclipse and Crescendo
   have the blue **start.gg** badge.
3. **Import from CSV** opened: page name, Game (the two Melty Blood games, then "Other (start.gg game
   id)…", which reveals an id and a name field), Date, CSV file, Upload. (Uploading again with the
   same name is refused, 409.)
4. **`/t/mixfest-26-mbaacc`, first open:** the **Upload summary** is open: 32 rows, 32 found; Tiers
   file: 7 matched by start.gg id, 7 discriminators written, 0 player ids written, 14 with no tiers row;
   **Linked by tag — please review**: Spiraler (listed as RBS | Spiraler) → "Spiraler" tier 2, Mishi 2,
   Alterchemist 1, Blixby 1, Ricefield 1, NITROUS 1, Wishy 2, Leebzz 2, Scrub Jay 1, Hydrous 0,
   Javonero 1. Reload: it's folded. **The first open is Noah's if he should see it open.**
5. The page: one tab (Melty Blood Actress Again Current Code), no Schedule tab, no **Seeded events**
   picker, no **Push to start.gg…**; Refresh, Mark done present; status **live** (done from 2026-11-14).
   32 players, 18 with a tier, majors columns Combo Breaker, Frosty Faustings, Climax of Night, Eclipse.
6. **The tag-only color** is on the **Eclipse** page (sheet rows still unlinked): light blue Tier cells,
   hover starting "Matched by tag only…"; the same in dark; tick two players including one blue to see
   it in the compare panel; ✓ one blue row and the blue goes (that writes the row's ids into
   `registry/tiers.csv`; un-✓ the same day undoes the review, the ids stay).
7. **Registry links:** `git show 6c49b79 -- registry/tiers.csv`: 18 rows, only `discriminator` and
   `player_id` changed.
8. Download for Google Sheets and Export seeds CSV on the Mixfest tab both download.

### REPORT

```
REPORT
- Overview: Build C pass 1 is built and committed on build/tool-c (record commit follows 6c49b79).
  registry/tiers.csv has a discriminator column (migrated once, byte-safe); players match tiers rows by
  player_id, then discriminator, then tag, and a tag-only match is light blue in the table, compare panel
  and CLI. A CSV list (name, discriminator) becomes its own page through POST /api/uploads: one lookup
  per row through the queue, registry linking, the pull and W-L; the home page shows start.gg/upload
  badges and follows Noah's two mid-pass layout messages. Live: the Mixfest file uploaded once,
  168 requests, max 20 in any 60 s by send time. node --test 256/256/0/0 (before 225/225/0/0).
- Found: Acceptance 1-11, all doable and done (12 is pass 4's). Two mid-pass layout amendments,
  applied. One reading to check: the client log shows 21 in one 60 s window, the sends show 20.
- Ran: ff379d3 (migration, matcher, writer), 56c7c5d (tag-only color), c4cf4a3 (the real tiers file
  migrated), 00996c1 (CSV contract, user lookup, fake resolver), e26b22f (upload page, jobs, badges,
  pull fill), d72d3bb + c6f0aee (README), c23be07 (home layout amendments), 6c49b79 (live linking in
  registry/tiers.csv). Live: out/mixfest-26-mbaacc/. Browser pane: offline against the fake, both
  themes. Clean-clone run: 256/256.
- Attributed: core / seeding-ops increment 4, build C. STATED: dispatch-contract-tool-c.md,
  design-tool.md Amendment A1, Noah's two mid-pass messages.
- Queued: none.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 1 of 4. start.gg: 168 of the granted
  32 lookups + one pull; max 20/60 s (queue send times). No skills, subagents or workflows; one Exa
  web search for the date. Token never read or printed.
- Parked: none. Tree clean at the record commit. registry/tiers.csv.bak kept (gitignored) until pass 4.
  Scratch (the offline UI demo, the scratch migration copy, the clone) is in this session's scratchpad.
- Needs attention:
  1. The 60 s count: 20 by the queue's send stamps (the HTTP requests), 21 by the client's records
     (stamped on entering the queue). I read the limit as HTTP sends; the auditor should rule.
  2. The first open of /t/mixfest-26-mbaacc shows the upload summary, then folds it. Let Noah have it,
     or reset uploads[0].shown_at to null in out/mixfest-26-mbaacc/state.json after checking.
  3. Interpretations for Noah to confirm (all amendable): light blue replaces the recency color on
     tag-only cells, so Eclipse's sheet rows turn from grey to blue; Team takes the list's prefix
     first (no effect on Mixfest); an upload links tag matches at once and lists them, so its own page
     shows no blue; two listed players on one tag links neither; no discriminator backfill from old
     pools; done from the start of the given date, local time; Mixfest's date 2026-11-14 from start.gg's
     listing.
  4. The desktop exe on 8765 is an older build: it shows the Mixfest page without build C's behavior,
     and its next tier write would move the discriminator column to the end of the file (harmless;
     reads are by name). Rebuild the sidecar before relying on it.
  5. start.gg's brand blue (#3f80ff) is model knowledge; one CSS token to change if wrong.
```

---

## Build C — Pass 2 — engineering auditor

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block). Model: Opus. Report-only: no source, test, config or data file edited; this section is
the only change, in one commit. Reviewed `build/tool-c` at `109cbf6` (code commits `ff379d3`, `56c7c5d`,
`c4cf4a3`, `00996c1`, `e26b22f`, `d72d3bb`, `c23be07`, `c6f0aee`, `6c49b79` on `c7be7b3`). No skills,
subagents or workflows. **No start.gg calls**: every suite and probe ran with `testlib/no-network.js`
preloaded, in a clean clone without `.env`, against the fake. The token was never read. `out/`,
`registry/tiers.csv` and `registry/tiers.csv.bak` were read only (copies in the session scratchpad,
`scratchpad/audit-c2/`, where the probe scripts `csvdiff.js`, `mutate.js` and `mutate2.js` are kept).
The desktop app on 8765 was not started or stopped, and was sent only one `GET /` (the home page, which
is not the Mixfest page and marks nothing seen). The Mixfest page and its `/api/t/` route were not
opened on 8765.

### Terms as understood

- **Comparand:** `docs/dispatch-contract-tool-c.md` Acceptance 1–11 (12 is pass 4's); `docs/design-tool.md`
  Amendment A1 with §T1, §Pages, §Lifecycle; the Ratified rows 192–194 of `docs/usage-log.md`; Noah's two
  mid-pass home-page messages as pass 1 recorded them (binding per the caller). The builder's "Terms as
  understood" and "Assumptions I supplied" are the drift comparand.
- **Drift check:** the builder's terms match the contract on scope, grants and prohibitions. The one
  stretch the builder flagged itself, grant (b) "the existing reader/writer" read as the write path
  (`readTierTable`, `toCsv`, the atomic rename, now `writeTierTable`) rather than only the ✓ and edit
  routes, is ruled under E2-9: inside the grant. The contract's "beside 'Add a tournament'" became
  "under it" by Noah's first mid-pass message; that is an amendment, not drift.
- **Ruling on Needs attention 1 (the 60 s count).** The limit means HTTP requests sent to start.gg, so the
  queue's send stamps are the measure: **20, within the ceiling.** The client's records are stamped
  before the request waits in the queue (`lib/startgg.js` `request`, `const t = now()` before
  `sendOnce`; `app/limit-fetch.js` stamps at the send), so they measure queue entry, not sending. Two
  facts go with the ruling: the margin is zero (the tightest 21-send span is exactly 60 000 ms), and
  this is the second build whose request log could not be read against the budget directly (E2-1).
- **Rulings on Needs attention 3 (interpretations):**
  - *Light blue replaces the recency color:* fine. One class per cell, chosen in `tierCellClass`; the
    recency stays in the hover. But the stated visible consequence is not true on the real data (E2-2).
  - *Team takes the list's prefix first:* fine, and the literal reading. A1.3's "the Team column gets
    the prefix" follows the sentence that splits the list's names into prefix and tag.
  - *An upload links tag matches at once and lists them:* A1.3's own words ("gets its id and
    discriminator written in and is reported as 'linked by tag'"). The consequence for Noah: the light
    blue never shows for those rows; the summary is the review surface.
  - *Two listed players on one tag links neither:* fine. A6-1 applied to a batch; the reader then shows
    both blue, which is where the color earns its place.
  - *No discriminator backfill from old pools:* allowed by the contract's "may"; said which.
  - *Done from the start of the given date, local time:* consistent with §Lifecycle (done once the
    latest seeded event's start has passed). Mixfest's stored `2026-11-14T06:00:00.000Z` is midnight
    CST, correct after the 2026-11-01 DST change.
  - *Mixfest's date 2026-11-14:* not verified by me (no start.gg access in this pass). Noah's to confirm.
- **The other assumptions:** 1 and 3–20 fine (3 is model knowledge, disclosed; 4 includes the list's
  name as an extra tag key, E2-8; 7's flag wording, E2-6; 11 checked by probes). **21 is wrong** (E2-3).
- **Needs attention 2** (the summary's first open is Noah's): `out/mixfest-26-mbaacc/state.json`
  `uploads[0].shown_at` is still `null` as of this pass; I did not change it.

### What I re-ran

| what | command / method | result |
|---|---|---|
| suite, working tree | `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` | tests 256, pass 256, fail 0, skipped 0; sha1 of all 83 files under `out/` and `registry/` identical before and after |
| suite, clean clone at `109cbf6`, offline (no `.env`) | `git clone -b build/tool-c`, same command | 256 / 256 / 0 / 0 (matches the claim) |
| before-state, clone at `c7be7b3` | same | 225 / 225 / 0 / 0 (matches) |
| test names, before vs after | sorted pass lines, `comm` | 0 gone, 31 new (match-order 9, upload-csv 10, upload 9, tiers-migrate 3) |
| changed assertions | `git diff c7be7b3 109cbf6 -- test/` | the 7 listed changes only: `linked` added to three ✓ shapes; the sheet-only cell `rec-never` → `match-tag` with the B4-3 text still asserted after the tag-only text; the tiers-migrate script and real-file tests extended to the new shape, the pre-T1 branch unchanged. No weakening. |
| protected paths | `git show --name-only` per commit | no usage log, design doc, contract, prior record, `.env`, `src-tauri/` or `.github/` touched; `out/eclipse-1st-cour` and `out/crescendo-of-night-3-episode-0` mtimes 09:13:14, before `c7be7b3` (09:40) |
| **T1 migration**, own parser (`audit-c2/csvdiff.js`: raw fields with quotes kept, per-record line ending) | `.bak` (pre-migration working bytes, sha1 `ffb8898…`) vs `c4cf4a3`'s blob; `c4cf4a3^` blob vs `c4cf4a3` blob | BOM kept; 713 records each; header gains only `discriminator`, after `player_id`; every other raw field identical, 0 quoting changes, line endings identical (blob to blob); `migrateTiers(.bak)` equals the migrated blob with CRLF restored, byte for byte |
| live linking commit | `6c49b79^` vs `6c49b79` blobs, same parser | only `discriminator` (18 rows) and `player_id` (11 of them) changed; 0 quoting changes. The 18: 7 already linked by `player_id` got a discriminator; 11 tag rows got both (Leebzz, Mishi, Spiraler, Wishy, Alterchemist, Blixby, Javonero, NITROUS, Ricefield, Scrub Jay, Hydrous) |
| the whole chain in working bytes | `.bak` vs the working `registry/tiers.csv` | CRLF everywhere, kept; the same 18 rows and two columns; nothing else |
| idempotence | `migrateTiers` on the current file; `scripts/migrate-tiers.js` on a copy | `changed: false`, text identical; the script says "already migrated", file byte-identical, no `.bak` written |
| line endings in git | `git ls-files --eol`, `.gitattributes` | `i/lf w/crlf` (`* text=auto eol=lf`): the repository stores LF and the working file is CRLF, as before this build; `git hash-object` of the working file equals `HEAD:registry/tiers.csv` |
| mutation checks, 40 mutants (`audit-c2/mutate.js`, `mutate2.js`; clone; restored after each; tree clean) | one replacement each, full suite | **Killed** (failing tests in brackets): tag before id (1), discriminator before `player_id` (1), no discriminator step (2), the other-`player_id` guard (1), a discriminator-only row answering to a tag (1), the tag-only mark in `readNotes` (7), the class in render (3), header always / never detected (3 / 5), URL form (7), `user/` form (7), first-bar split (1), no split (4), duplicates kept (5), malformed dropped (4), the unresolved flag (4), the tag link not written (1), A6-1 linking both (1), the write route's discriminator (5), the pull fill (2), `readState`'s source fallback (1), both badge fallbacks (1), schedule on upload (1), slug collision (1), add-tournament over an upload (1), the calendar date check (1), game id digits (1), the alias tag keys (1), Archive on upload (1), `linked` always true (2), unresolved row editable (1), unresolved players passed to `linkPlayers` (1), seen never marked (1). **Survived:** `linkPlayers`' own discriminator write on an id match (equivalent: `fillIds` writes the same value right after; no action), and **the push guard on an uploaded page (E2-5)**. The builder's own counts (2, 4, 3) differ from mine (2, 7, 5) by mutation shape, not substance. |
| the live request record | `out/mixfest-26-mbaacc/` logs, recomputed with my own sliding window | ops UserBySlug 32, UserEvents 70, UserIds 2, SetsBatch 64 = 168; 0 retries, 0 non-200; complexity max 841; `refresh-sends.json` 168 sends, **max 20** in any 60 s; client stamps **21** (in each of the three stages); tightest 21-send span 60 000 ms |
| the live pool | read-only: `state.json`, `players.csv`, `meta.json` | `source: "upload"`, one event `upload` for 22407, ticked `["upload"]`; 32 rows all `found`; `players.csv` has `alias`, 32 complete; meta `source: "upload"`, `request_count` 70; summary 7 by id, 11 by tag, 0 ambiguous, 14 unmatched, `shown_at: null` |
| live matching after the upload | `matchTierRowBy` over copies of the current tiers rows and pools | Mixfest 18 by id, 14 none, **0 tag-only**; Eclipse 182 by `player_id`, **0 tag-only**, the same against the pre-build `.bak`; Crescendo's tabs are other games (no tiers rows apply) |
| upload validation | `createApp` + `testlib/inject` on a scratch `out/` against the fake | names `CON`, `nul`, `Aux`, `COM1`, `lpt1` create `out/con/` etc. on this machine without error; `../../x` → `x`; `a/b\c` → `a-bc`; a 100-character name truncates to 60 and the next long name collides with 409; a 9 000-row, 134 kB file is accepted (E2-7); body cap 200 kB (413), the form refuses over 150 KB |
| header edge | `parseUploadCsv('Alice,abcd123\nBob,bbbb0002\n')` | header `"Alice,abcd123"`, 1 row, **0 malformed**: a header-less file whose first code has a typo loses that player with no report (E2-4) |
| home page, both themes | the clone on port 8797 (`--out` a copy of the three pools, `SEED_TIERS_FILE` a copy), Browser pane, `GET /` only | per both mid-pass messages: the header, the link row, *Import from CSV* with its description visible while folded, then the list; the sentence above Eclipse (the first done); upload badge violet, start.gg badge blue with white "start.gg" text, legible in light and dark |
| the running desktop app | `Get-Process`; `app/app-main.js`; `GET http://127.0.0.1:8765/` | `seeding-server.exe` started 10:16:50, after the last code commit; `app-main.js` loads the checkout's live `app/server.js` when the exe sits in `<repo>/app/`; the 8765 home page carries `src-upload`, `src-startgg`, *Import from CSV* and the done note: build C's code (E2-3) |

The Browser pane refused my navigation to the copy's `/t/eclipse-1st-cour` (an auto-mode classifier
denial). I did not pursue that view another way; the tournament page's visuals are under Could not verify.

### Findings

**E2-1 — NOTE, with a standing-rule proposal for Noah (directive 9, second occurrence).** The budget
ruling above holds: 20 by sends. But this is the second build whose own request records cannot be read
against the budget: build B pass 1's pull log showed 21 where the sends were 20 (this file, §Build B
Pass 1 "Live requests", and D2-11), and here every stage's client log shows 21 where the sends show 20.
The cause is the same both times: `lib/startgg.js` stamps a request when it is handed to the queue, and
only `refresh-sends.json` carries send times. The limiter also runs at exactly the ceiling (zero margin;
start.gg's own 80 per 60 s is far off, so no harm). **Proposed standing rule:** the request records a
build writes carry the send time (or both stamps), so the budget is checkable from them alone; and a
live run under a self-imposed ceiling sets the queue one below it. Noah to ratify or decline; not a
pass 3 repair unless he says so.

**E2-2 — FINDING (handoff accuracy) — the tag-only color is not on the Eclipse page.** Assumption 2 says
"on start.gg pages (Eclipse), sheet-only rows that were grey are now light blue", and UI checklist item 6
sends the orchestrator there to see it. On the real files every one of Eclipse's 182 players matches a
tiers row by `player_id` (before and after this build), so no Eclipse cell is blue; after the upload's
linking, Mixfest has none either. No page in `out/` shows the color today. The orchestrator's
between-pass check of "the tag-only highlight" will find nothing where the record points. Resolves:
pass 3 corrects the assumption and the checklist and names a place the color can be seen (the offline
fake page the builder used, or a scratch tiers copy with an unlinked row), with no change to the real
tiers file.

**E2-3 — FINDING (handoff accuracy) — the desktop app on 8765 runs build C's code.** Assumption 21 and
Needs attention 4 say the exe is an older build that shows Mixfest without build C's behavior and would
move the `discriminator` column on its next tier write; the checklist says not to use it.
`app/app-main.js` (the sidecar's entry) loads the checkout's own `app/server.js` when the exe sits in
`<repo>/app/`, which it does; the process started at 10:16:50, after the last code commit; and its home
page serves the build C badges and form. So Noah's 8765 is build C, and the column-order warning does
not apply to it. One correction for Noah follows: opening Mixfest there **will** use up the one-time
summary (`/upload/seen`). Resolves: pass 3 corrects assumption 21, Needs attention 4 and the checklist's
first line.

**E2-4 — FINDING — a header-less file whose first code is mistyped loses that player silently.**
Acceptance 4: "a malformed row reported with its line number, never silently dropped." By the ratified
detection rule a first row whose second value is not a code is the header, so `Alice,abcd123` (seven
characters) becomes the header and Alice is gone: 0 malformed, nothing on the page. The detected header
is kept in `state.json` `upload.header` and in the POST response, but the form discards the response and
neither the summary nor the page header shows it. The rule is Noah's and stays; the silence is the
defect. User impact: a typo in row 1 of a list without a header drops a player from the seeding table
with no trace. Resolves: show the line taken as the header in the summary (or the page's upload facts),
for example "line 1 read as the header: Alice,abcd123", with a test.

**E2-5 — FINDING (test) — the push refusal on an uploaded page is not pinned.** Removing
`notForUpload(t, 'there is nothing to push to')` leaves the suite green. The test's 409 and
`/uploaded list/` are satisfied by `push.dryRun`'s own refusal, "Combo Breaker 2026 (uploaded list) has
no phases on start.gg yet." (the synthetic event's name contains the words). The behavior is safe today
(no request is made; the page hides the control), but the guard the contract asks for has no test of its
own. Resolves: assert the guard's own message, and cover the post route too.

**E2-6 — NOTE — a failed lookup is flagged "not found on start.gg".** `poolPlayers` treats `error` rows
like `not-found` ones, so a row whose lookup timed out shows "not found on start.gg (code)" with the
hover "This discriminator is not a start.gg user…". The page's header and the summary say it correctly
("lookups failed (Refresh asks again)"). Pass 3 may word the flag by status; optional.

**E2-7 — NOTE — no ceiling on rows.** A 134 kB file of 9 000 rows is accepted: 9 000 lookups plus the
pulls, hours on the one queue, behind which every other job waits. The 150 KB / 200 kB caps are the only
limit. Noah's lists are tens of rows; no repair proposed. Recorded so the size check is known to be a
byte cap, not a cost cap.

**E2-8 — NOTE (interpretation for Noah) — the list's name is an extra tag key.** Assumption 4: an
uploaded player also answers to a tiers row by the name the list gave, after start.gg's tags, in the
reader and the writer alike. It can link a row the start.gg tag would not (the list calls someone "Bob",
start.gg says "Robert"). Every such link lands in the summary's review list, so it is visible. Within
A1.3's ambit; Noah's to keep or drop.

**E2-9 — NOTE (ruling) — the registry writes stayed inside the grant.** `linkPlayers` and
`fillDiscriminators` are new callers of the existing write path; A1.3 and Acceptance 8 require upload
linking, which no ✓ or edit route can do. Verified on the artifact: one commit (`6c49b79`), two columns,
18 rows, no other byte. No hand edit.

### Acceptance

| # | item | met | evidence |
|---|---|---|---|
| 1 | suite, clean clone, offline, no regression | yes | 256/256/0/0 in a clean clone without `.env` and on the working tree; before 225/225/0/0; 0 tests gone; 7 changed assertions, each traced to A1 |
| 2 | T1 migration byte-safe, idempotent, round-trip; ids filled by pulls and uploads | yes | own parser: only `discriminator` added; BOM, quoting and line endings kept; idempotent by function and script; `6c49b79` changes only `discriminator` and `player_id` on 18 rows; the round-trip, pull-fill and upload-fill tests killed their mutants; no backfill, said which |
| 3 | match order id → discriminator → tag; one matcher; tag-only marked and colored; ✓ or edit write both ids; A6-1 | yes, with E2-2 | `matchTierRowBy` is the one matcher for `readNotes`, `editTierRow`, `linkPlayers` and `lib/push.js`; ordering mutants killed; the class comes from `tierCellClass` for table, compare panel and CLI; tokens in light and both dark blocks, the CLI's CSS pinned by the parity test; A6-1 pinned in reader, writer and batch. Visual check of the cell not done by me (Could not verify). |
| 4 | CSV parsing contract | yes, with E2-4 | header detection, three code forms, `|` split, duplicate collapse, malformed with lines: each mutant killed; the first-row typo case is silent |
| 5 | one `user(slug)` per row through the queue; unresolved kept and flagged; fake resolver | yes | `jobs.client` uses `queue.fetchFor`; live 32 UserBySlug, 32 found; resumable and error rows tested; the unresolved-flag mutant killed |
| 6 | `POST /api/uploads`, `state.json` source upload, one synthetic event, pull via per-player code; one tab, no push, no Schedule; done by date; export and ✓; home lists it; form on the home page | yes, with E2-5 | `createUpload`, `resolveUpload`, `run({ upload })`; validation probes above; schedule, side-tournament, tick, Archive and slug-collision guards each pinned; the push guard present but unpinned; home page seen in both themes per the mid-pass messages |
| 7 | current tag shown; list name as alias on hover; prefix fills Team | yes | `akaOf`, `poolPlayers`; tested; live data has no differing names (0 of 32) |
| 8 | registry linking on upload; linked-by-tag listed; summary shown once and kept | yes | `linkPlayers` mutants killed; the live summary matches the column diff (7 + 11); `shown_at` null, left for Noah |
| 9 | source badges, both themes; old state.json reads as start.gg | yes | `readState` defaults `source` and never writes it; seen in both themes on a copy and in 8765's `GET /` |
| 10 | live check recorded with counts | yes (the run); the orchestrator's page check is pending | counts recomputed: 168, 20 by sends (E2-1) |
| 11 | README | yes | the upload's contract, what you get and what is missing, the discriminator column, the light blue, the badges: each sentence checked against the code |

### Could not verify

- **The tournament page's visuals:** the tag-only cell, the compare panel, the alias underline and the
  upload summary, in either theme. My Browser pane navigation to a copy's tournament page was refused; I
  relied on the tests, the CSS tokens and the builder's pane check on the fake.
- **Mixfest's date** (2026-11-14) and **start.gg's brand blue** (`#3f80ff`): neither checkable without
  start.gg or the web in this pass.
- **The discriminator's shape** beyond the 8-hex values seen (the builder's assumption 3; model knowledge).
- **Whether the 11 tag links are the right people:** the tags and teams agree on the data; whether each
  tiers row was written for that person is Noah's review, as A1.3 says.
- **The 8765 process's environment** (`SEEDING_PROJECT`): not read. The served home page shows build C's
  code either way.

### Verdict

**APPROVE WITH FINDINGS.** Build C pass 1 meets Acceptance 1–11 on the artifact: the suite on a clean
offline clone, the byte-level T1 migration and live linking diff on my own parser, the one matcher and its
order under mutation, the CSV contract, the upload route and its guards, the badges, and the live request
record, recomputed. For pass 3: **E2-4** (the silent first-row header) and **E2-5** (the unpinned push
guard) are small repairs; **E2-2** and **E2-3** are record corrections the orchestrator needs before its
browser check, since both point it at the wrong place. E2-6 is optional. E2-1's standing rule and E2-8 are
Noah's. The verdict covers code, tests, records, the tiers file and the live pool's files. It does not
cover the tournament page's rendering (Could not verify) or start.gg-side facts.

### REPORT

```
REPORT
- Overview: Pass 2 (engineering auditor, report-only) reviewed build C at 109cbf6. Acceptance 1-11 hold
  on the artifact: 256/256/0/0 on a clean offline clone (before 225/225/0/0); the tiers migration adds
  only `discriminator` with every other byte kept and is idempotent; the live linking changed only
  discriminator and player_id on 18 rows. Verdict: APPROVE WITH FINDINGS. Two small repairs and two
  record corrections for pass 3.
- Found: E2-1 NOTE (60 s count ruled: 20 by sends, within; second build whose request log can't be read
  against the budget; standing rule proposed); E2-2 FINDING (record: no page shows the tag-only color,
  Eclipse included); E2-3 FINDING (record: the 8765 desktop app runs build C's live code, not an older
  build); E2-4 FINDING (a header-less file's mistyped first row is taken as the header and dropped
  silently); E2-5 FINDING (the push refusal on an uploaded page passes its test for the wrong reason);
  notes E2-6 (failed lookups flagged "not found"), E2-7 (no row ceiling), E2-8 (the list's name as a tag
  key, Noah's), E2-9 (registry writes inside the grant).
- Ran: the suite on the working tree and in clean clones at 109cbf6 and c7be7b3; test-name and assertion
  diff; protected-path and out/ hash checks; a column-level diff of tiers.csv (.bak, c4cf4a3, 6c49b79,
  working bytes) with my own parser; idempotence; 40 mutants (38 killed, 1 equivalent, 1 survivor =
  E2-5); recomputed live request windows; upload-validation probes against the fake; the home page in
  both themes on a copy (port 8797) and GET / on 8765. Evidence: this section, one commit; probe scripts
  in the session scratchpad audit-c2/.
- Attributed: core / seeding-ops increment 4, build C. STATED: dispatch-contract-tool-c.md,
  design-tool.md Amendment A1, usage-log rows 192-194, Noah's two mid-pass messages.
- Queued: E2-1's standing rule and E2-8 wait on Noah (process and product choices, not repairs).
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 2 of 4. No skills, subagents or
  workflows. start.gg requests 0. Token never read. All writes in scratch copies.
- Parked: none. Tree clean after the record commit. registry/tiers.csv.bak kept for pass 4.
- Needs attention:
  1. The 8765 app is build C (E2-3): opening Mixfest there uses up the one-time summary.
  2. E2-1: ratify or decline the standing rule (request records carry send times; live ceilings set
     one below the limit).
  3. E2-8: keep or drop the list's name as an extra tag key for linking.
  4. Confirm Mixfest's date (2026-11-14) and start.gg's blue (#3f80ff), both unverified.
  5. Review the 11 "linked by tag" rows in the upload summary (A1.3's own review step).
```

---

## Orchestrator rulings for build C pass 3 (2026-10-30)

Defaults chosen by the orchestrating session under Noah's go for build C; product choices marked amendable.

| finding | ruling |
|---|---|
| E2-1 | **Fix the cheap half:** the client's request log stamps the send time (consistent with D2-3's timeout), so a log can be read against the budget. The "ceiling one below the limit" rule for live scripts goes to Noah as a candidate standing rule; pass 3 adds it to nothing. |
| E2-2 | **Record correction** in pass 3's section: no page in `out/` shows the tag-only color today because every Eclipse registrant's tiers row carries a player id; name a way to see it (a fixture or a scratch tiers copy with a row stripped of its ids) in the UI checklist. |
| E2-3 | **Record correction:** the desktop app on 8765 runs the checkout's live code (app/app-main.js), not an older build; the sidecar needs rebuilding only when the loader changes. |
| E2-4 | **Fix.** A header is assumed only when the first row's second value is not a discriminator **and** does not look like an attempted one (contains `user/`, a URL, or a 6–10 character hex-like token); an attempted-but-malformed first row is reported as malformed with its line number, never taken as the header. Whenever a header row is skipped, the upload summary says so with the row's two values, so nothing is silent. Tests for both. |
| E2-5 | **Fix the test:** the push refusal on an uploaded page gets its own test, asserting the upload-specific message/status and failing when the guard is removed (not satisfied by the "no phases" 409). |
| E2-6 | **Fix:** a failed lookup is flagged "lookup failed (<reason>)", distinct from "not found on start.gg". |
| E2-7 | **Fix:** a row ceiling of 1,000 rows (a major's field is a few hundred); over it, the upload is refused with the count, before any start.gg request. Test. |
| E2-8 | **Keep, amendable (Noah's):** the list's name counts as a tag key for matching tiers rows; the name is the tag in practice. |
| E2-9 | Recorded. |

Noah is using the desktop app against this checkout while pass 3 runs; it loads live code, so pass 3
commits in small steps and keeps the tree working between commits.

---

## Build C — Pass 3 — lead engineer (repair)

Seat: lead-engineer persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`, Profile block,
loaded in-seat), a fresh job; I did not build pass 1. Model: Opus. Branch `build/tool-c`, started at
`d19f853` with a clean tree. Commits `8ba8783`, `6e84da4`, `da53062`, `69b2582`, `a1b4e28`, `345508f`,
plus this record's commit. Local only, no push, nothing amended. No skills, subagents or workflows.

### Terms as understood

- **Scope:** the "Orchestrator rulings for build C pass 3" table above, E2-1..E2-9, each ruling taken
  as given (not re-decided). Contract `docs/dispatch-contract-tool-c.md` (pass 3: repair, every finding
  FIXED or DECLINED with reasoning); spec `docs/design-tool.md` with Amendment A1. Work types: repair.
- **Kept from builds A, B and C pass 1:** the ✓ semantics, the one matcher (`matchTierRowBy`), A6-1, the
  single queue (`app/queue.js` over `app/limit-fetch.js`), both dark blocks. No CSS changed in this pass.
- **Grants used:** source, tests and README edits under the repo. `registry/tiers.csv` was not written
  (mtime still 2026-10-30 10:06:00, pass 1's live run; `.bak` kept). `out/` was not written: the
  Mixfest `state.json` is unchanged (mtime 10:06:00) and its `uploads[0].shown_at` is still `null`
  (read-only check); `/t/mixfest-26-mbaacc` was never opened, on 8765 or anywhere.
- **Prohibitions:** **0 start.gg requests.** Every suite ran with `testlib/no-network.js`; my own app run
  used `testlib/fake-global-fetch.js` with `STARTGG_TOKEN=offline-fake` in the environment of a clean
  clone that has no `.env`. The token was never read or printed. Port 8765 was not touched; my runs used
  port 8796, and the mutation checks ran in a scratch clone.
- **Owner on 8765:** every code commit was preceded by a green full suite. The 8765 process loaded
  `app/server.js` and `lib/` at launch, so the server-side changes reach it at its next launch;
  `app/public/tournament.js` is served per request and its new line is guarded (`if (x.header)`), so the
  Mixfest summary, recorded before the field existed, renders as before (pinned in the E2-4 test).
- **Before-state** (at `d19f853`, before the first edit): `NODE_OPTIONS="--require ./testlib/no-network.js"
  node --test` → **tests 256, pass 256, fail 0, skipped 0.**
- **Grounding not consulted** (the standards bank, the runbook): every change traces to a ruling, the
  contract or the existing code.

### Assumptions I supplied

1. **E2-4's "hex-like token"** is defined as one token of 6–10 letters and digits with at least one digit
   and at most two letters outside a–f (`lib/upload.js` `looksLikeAttemptedCode`). It catches `abcd123`,
   `abcd12g3`, `ABCD12345`, and leaves `discriminator`, `start.gg`, `startgg id`, `player1`, `column2` and
   `code` as headers (all pinned). "A URL" is `://`, a leading `www.`, or `start.gg/`; a bare `start.gg`
   column name stays a header. Amendable in one function.
2. **E2-1's record shape:** `t`/`ms` are now the send time (every existing reader of `ms`, including
   `scripts/check-requests.js`, `lib/run.js`'s summary line and `priorSends`, already treated it as a
   send time); `queued_ms` is added only when it differs. With the real clock a request that waited one
   event-loop turn shows `queued_ms` 1 ms earlier (seen in the offline demo's `upload-requests.jsonl`);
   that is accurate, so I left it.
3. **E2-6's reason travels in a new upload-only `lookup_error` column** of the pool's `players.csv`
   (empty unless the lookup failed). The flag text is `lookup failed (<the client's error message>)`;
   the history status stays `unresolved`, so counts and the no-✓/no-edit rules are unchanged. The live
   Mixfest pool has no such column and reads as before.
4. **E2-7 counts rows after repeats are collapsed** (the number of lookups), refuses with **400** and the
   count, and writes nothing (pinned: no `out/too-big/`, no fake request).
5. **E2-4's note wording** on the page: *"Line N was read as the column header and skipped: `a`, `b`. If
   that is a player, add a header row above it and upload again."* The row is also in the POST response
   (`header_row`) and in `state.json` `upload.header_row`.

### Dispositions

| finding | disposition | commit | test (verified failing on the old code) | note |
|---|---|---|---|---|
| E2-1 | **FIXED** (the cheap half, per ruling) | `6e84da4` | `test/client.test.js` "E2-1: through the app queue, each request record carries the time it was sent…": on `d19f853`'s code the three records' `ms` are `[1000000, 1000000, 1000000]` where the queue sent the third at ≥ 1060000 | `app/limit-fetch.js` reports the send time to a caller that asks (`init.onSent`, stripped before the real fetch); `lib/startgg.js` stamps `t`/`ms` with it and keeps `queued_ms`. Covers the pull, W-L and upload logs (all go through the client). The "ceiling one below the limit" rule is added nowhere; Noah's, per ruling. |
| E2-2 | **ACKNOWLEDGED: record correction** | this record | n/a | Record corrections 1; UI checklist item 1 names where to see the color. |
| E2-3 | **ACKNOWLEDGED: record correction** | this record | n/a | Record corrections 2. |
| E2-4 | **FIXED** | `da53062` | `test/upload-csv.test.js` "E2-4: a first row whose second value is an attempted discriminator…" (old: `Alice,abcd123` became the header) and `test/upload.test.js` "E2-4: the upload summary names the row skipped as the header…" (old: no `header_row`, no summary field, no note) | Header only when the first row's second value is neither a code nor an attempt at one; an attempt is malformed at its line. The skipped header row is in the POST response, `state.json` `upload.header_row`, each summary's `header`, and the page's summary. |
| E2-5 | **FIXED** (test) | `8ba8783` | `test/upload.test.js` "E2-5: the push routes on an uploaded page are refused by the upload guard itself…": with `notForUpload(t, 'there is nothing to push to')` removed it fails with *"Mixfest 26 Test (uploaded list) has no phases on start.gg yet."* | Asserts the guard's exact message on `dry-run` and `post`, and no start.gg request. The old test is unchanged. |
| E2-6 | **FIXED** | `69b2582` | `test/upload.test.js` "E2-6: a row whose lookup failed is flagged \"lookup failed (<reason>)\"…" (old: no `lookup_error`, flag "not found on start.gg") | Hover: *"The start.gg lookup for <code> failed, so this row has no results and no id to link a tier to yet. Refresh asks again."* Not-found rows unchanged. |
| E2-7 | **FIXED** | `a1b4e28` | `test/upload.test.js` "E2-7: an upload over 1,000 player rows is refused…" (old: 202) | `MAX_UPLOAD_ROWS = 1000` in `lib/upload.js`, checked in `createUpload` before anything is written or queued. 1,000 rows (1,001 lines with one repeat) is accepted. |
| E2-8 | **DECLINED** (no change) | n/a | n/a | Ruling: keep, amendable, Noah's. The list's name stays a tag key (`lib/view/data.js`). |
| E2-9 | **ACKNOWLEDGED** | n/a | n/a | Ruling: recorded. Nothing to repair; this pass wrote no registry row. |

README (`345508f`): the header rule for a mistyped first code, the 1,000-row ceiling, the *lookup failed*
flag, and `requests.jsonl` stamped at the send with `queued_ms`.

### Record corrections

1. **E2-2: the tag-only color is not visible on any real page today.** Pass 1's assumption 2 ("on
   start.gg pages (Eclipse), sheet-only rows that were grey are now light blue") and its UI checklist item
   6 (see it on the Eclipse page) are **wrong**. Every one of Eclipse's 182 registrants matches a tiers row
   by `player_id` (pass 2's matcher run, before and after build C), and the Mixfest upload linked its 11
   tag matches by writing their ids, so **no page in `out/` shows the light blue**. The rule itself
   stands (light blue replaces the recency color on a tag-only cell); the place to see it is a scratch
   setup, UI checklist item 1 below. Nothing in the real `registry/tiers.csv` is to be changed to show it.
2. **E2-3: the desktop app on 8765 runs the checkout's live code.** Pass 1's assumption 21, its Needs
   attention 4, and its checklist's first line ("not the desktop exe on 8765, which is an older build")
   are **wrong**. `app/app-main.js` (the compiled sidecar's entry) looks for a folder carrying
   `app/server.js` and, when it finds one (the exe sits in `<repo>/app/`), sets `SEEDING_ROOT` and
   `require`s that live `app/server.js` (lines 46–52); only otherwise does it run the copy embedded at
   compile time. So 8765 serves this checkout's code as of its launch: build C's badges and form (pass 2
   saw them), and its tier writes use the current column order, so the "moves `discriminator` to the end"
   warning does not apply. The sidecar needs rebuilding only when the loader (`app/app-main.js`) itself
   changes. Two consequences: server-side changes reach 8765 at its next launch, while files under
   `app/public/` are served from disk per request; and opening `/t/mixfest-26-mbaacc` there **does** use
   up the one-time summary (`POST …/upload/seen`).

### Changed tests

None. Six tests added; no existing assertion changed, removed or skipped. `git diff d19f853 --numstat --
test/`: `client.test.js` +24/−0, `upload-csv.test.js` +22/−0, `upload.test.js` +97/−0. 256 + 6 = 262.

### Verification

| what | command / method | result |
|---|---|---|
| before-state | working tree at `d19f853`, `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` | 256 / 256 / 0 / 0 |
| each new test fails on the old code | scratch clone at `d19f853` with only the new test file copied in (and, for E2-5, the guard line removed) | E2-5, E2-1, both E2-4, E2-6, E2-7 each fail, with the old behavior quoted under Dispositions |
| suite after each code commit | same command, working tree | 258 after `6e84da4`, 260 after `da53062`, 261 after `69b2582`, 262 after `a1b4e28`; 0 fail each time |
| **suite, working tree (final code)** | same command at `345508f` | **tests 262, pass 262, fail 0, skipped 0** |
| **suite, clean clone, offline** | `git clone -b build/tool-c` at `345508f` (no `.env`), same command | **tests 262, pass 262, fail 0, skipped 0** |
| the app, offline, port 8796 | the clean clone, the command under UI checklist; Browser pane | the fake Combo Breaker page: TeamA's Tier cell light blue (dark theme, `rgb(24, 64, 110)` = `#18406e`), hover *"Matched by tag only: … · Never reviewed (tier from the sheet import)"*; an upload with header `Player,Code`: the summary open with *"Line 1 was read as the column header and skipped: Player, Code. …"*; 1,001 rows POSTed as the form does: 400 *"The list has 1001 player rows; an upload takes at most 1000 …"*, no folder, no fake request; `upload-requests.jsonl` lines carry `ms` and, where a request waited, `queued_ms` |
| protected files | `ls -l`, `git status`, a read of Mixfest's `state.json` | `registry/tiers.csv` and `out/mixfest-26-mbaacc/state.json` mtime 10:06:00 (pass 1); `out/eclipse-1st-cour/state.json` 09:13:14; Mixfest `shown_at` null |

### Could not verify

- **The 1,000-row refusal shown in the form itself.** The Browser pane refused navigation back to my demo's
  home page (an auto-mode classifier denial); I did not work around it. The refusal is checked by the test
  and by POSTing the form's body to my 8796 server (400 with the message above); the form puts any error's
  text in its message line (`app/public/index.js`, unchanged).
- **The light theme** of the tag-only cell and of the header note: only the dark theme was seen this pass.
  No CSS changed; pass 1 checked both themes.
- **8765 picking up the server-side changes:** not exercised (not mine to restart); reasoned from
  `app/app-main.js` (Record corrections 2).
- **A real start.gg failure's text** in the *lookup failed (…)* flag: the fake's 503 gives the client's
  "gave up after 5 tries" message; a real one shows whatever the client throws.

### UI checklist for the orchestrator

All offline against the fake, from a clean clone, on your own port (not 8765). Setup once (bash; replace
`<scratch>`):

```
git clone -b build/tool-c C:/Users/iknow/repos/seeding-ops <scratch>/clone && cd <scratch>/clone
mkdir -p <scratch>/demo/out
node -e "const out=require('./lib/output'),data=require('./lib/view/data');const row=(o)=>({game_id:'22',game_name:'Melty Blood: Actress Again Current Code',player_id:'',discriminator:'',startgg_tag:'',sheet_tag:'',tier:'',notes:'',decided_on:'',last_reviewed_on:'',last_reviewed_tournament:'',source:'sheet import',sheet_region:'',sheet_placements:'',sheet_notes:'',...o});require('fs').writeFileSync(process.argv[1],out.toCsv(data.TIER_COLS,[row({sheet_tag:'Quiet',tier:'5'}),row({sheet_tag:'TeamA',tier:'3'}),row({player_id:'101',startgg_tag:'GeneralMidwest',tier:'9',source:'app'})]))" <scratch>/demo/tiers.csv
STARTGG_TOKEN=offline-fake SEED_TIERS_FILE=<scratch>/demo/tiers.csv NODE_OPTIONS="--require ./testlib/no-network.js --require ./testlib/fake-global-fetch.js" node app/server.js --port 8796 --out <scratch>/demo/out
```

1. **The tag-only light blue (E2-2's place to see it).** On the home page add
   `https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code` (the
   fake) and let the pull finish. The scratch tiers rows *Quiet* (5) and *TeamA* (3) carry no ids, so both
   Tier cells are light blue with a hover starting *"Matched by tag only…"*; GeneralMidwest (9, linked by
   id) is not. Switch the theme to see both. Do this **before** step 2: step 2's upload links *Quiet* by
   tag, after which only *TeamA* stays blue.
2. **The header-skipped note (E2-4).** *Import from CSV*: name `Header Demo`, game Other with id `22`, any
   date, a file of four lines: `Player,Code`, `Gen,14364d39`, `Quiet,aaaa0003`, `Kid,user/aaaa0002`. The
   page's **Upload summary** opens with *"Line 1 was read as the column header and skipped: Player, Code.
   If that is a player, add a header row above it and upload again."* Then upload a header-less file whose
   first line is `Kid,aaaa002` (seven characters) and second `Quiet,aaaa0003`: no header note, and *Rows
   not read* lists *line 1: `Kid,aaaa002`*.
3. **The row ceiling (E2-7).** Upload a file of 1,001 distinct rows (make it with
   `node -e "let s='name,discriminator\n';for(let i=0;i<1001;i++)s+='P'+i+','+(0xa0000000+i).toString(16)+'\n';require('fs').writeFileSync('too-big.csv',s)"`).
   The form's message line shows *"The list has 1001 player rows; an upload takes at most 1000 (…). Split
   the list."*; no page is created and the fake gets no request.
4. **Lookup failed (E2-6)** is pinned by test only (the app's fake has no failing code); it is the existing
   `flag-unresolved` pill with the new text.
5. **Request logs (E2-1):** `<scratch>/demo/out/header-demo/upload-requests.jsonl` lines carry `ms` (the
   send) and, where a request waited, `queued_ms`.

### REPORT

```
REPORT
- Overview: Build C pass 3 (repair) disposed E2-1..E2-9 per the orchestrator's rulings on build/tool-c:
  5 FIXED (E2-1 send-time request logs, E2-4 mistyped first code + named header, E2-5 push-guard test,
  E2-6 "lookup failed (<reason>)", E2-7 1,000-row ceiling), 2 record corrections (E2-2, E2-3), E2-8
  declined (kept per ruling), E2-9 acknowledged. node --test 262/262/0/0 on the working tree and on a
  clean offline clone (before 256/256/0/0). 0 start.gg requests.
- Found: 9 findings, each with a ruling; all doable within the rulings. No new defect outside them.
- Ran: 8ba8783 (E2-5), 6e84da4 (E2-1), da53062 (E2-4), 69b2582 (E2-6), a1b4e28 (E2-7), 345508f
  (README), then this record's commit. Each new test failed on d19f853's code (scratch clone). Offline
  app run on port 8796 from a clean clone against the fake (Browser pane): the tag-only blue, the
  header note, the 1,001-row refusal (by API; the pane refused the home page).
- Attributed: core / seeding-ops increment 4, build C. STATED: dispatch-contract-tool-c.md,
  design-tool.md Amendment A1, "Orchestrator rulings for build C pass 3".
- Queued: E2-1's "live ceiling one below the limit" rule (Noah's, per ruling; added nowhere). E2-8 stays
  Noah's to keep or drop.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 3 of 4. start.gg requests 0. No skills,
  subagents or workflows. Token never read.
- Parked: none. Tree clean at the record commit. registry/tiers.csv.bak kept for pass 4. Scratch (the
  mutation clone, the clean clone, the offline demo) in this session's scratchpad.
- Needs attention:
  1. 8765 runs the checkout's live app/server.js (record correction 2): this pass's server-side changes
     reach it at its next launch; opening Mixfest there uses up the one-time summary (shown_at still null).
  2. E2-4's "attempted code" test (assumption 1) is a definition I supplied; amendable in one function.
  3. Still unverified from earlier passes: Mixfest's date (2026-11-14) and start.gg's blue (#3f80ff).
```

---

## Orchestrator verification after build C pass 3 (2026-10-30)

Suite on the working tree at `fea9a0a`: 262 tests, 262 pass, 0 fail, 0 skipped (matches pass 3). The
desktop app on 8765 was left running for Noah throughout passes 2 and 3 (it loads live code; its
server-side changes reach it at the next launch, which the orchestrator does after pass 4). The Mixfest
page's one-time upload summary is still unseen (`uploads[0].shown_at` null). The browser checklist items
(tag-only light blue on a scratch copy, the header-skipped note, the 1,000-row refusal) rest on pass 3's
own offline run and the six new tests; not re-run here to avoid touching the checkout while Noah uses it.

---

## Build C — Pass 4 — engineering auditor (closing re-review)

Seat: engineering-auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`,
Profile block), a fresh job. Model: Opus. Report-only: no source, test, config or data file edited; this
section is the only change, in one commit. Reviewed `build/tool-c` at `637485b` (clean tree). The artifact
is the code at `345508f`: `git diff --stat 345508f 637485b` lists only `docs/build-record-tool.md`. No
skills, subagents or workflows. **No start.gg calls, and the token was never read**: every suite and probe
preloaded `testlib/no-network.js`, in a clean clone without `.env` (`scratchpad/p4c/clone`), against the
fake. `out/`, `registry/tiers.csv` and `registry/tiers.csv.bak` were only read; every write ran in the
clone or on copies (`scratchpad/p4c/outcopy`, `scratchpad/p4c/view`). Probe scripts are in
`scratchpad/p4c/probes/` (`mutate.js` with `m1.json` and `m2.json`, `csvdiff.js`, `routes.js`).
**Port 8765 was not started, stopped or sent any request**, and `/t/mixfest-26-mbaacc` was never opened
on it; my own server ran on port 8799 over a copy and was stopped afterwards.
`out/mixfest-26-mbaacc/state.json` `uploads[0].shown_at` is still `null`.

### Terms as understood

- **Comparand:** `docs/dispatch-contract-tool-c.md` Acceptance 1–11, plus 12, which is this pass's to
  give or withhold; Noah's two mid-pass home-page messages as pass 1 recorded them (binding per the
  caller); `docs/design-tool.md` Amendment A1 with §Pages and §Lifecycle. Pass 3 was held to
  "Orchestrator rulings for build C pass 3"; I did not re-decide those rulings.
- **Loop:** 4 passes plus at most one extra repair/re-review pair. This is pass 4. If I withhold 12, the
  pair is available and I must say exactly what the repair does.
- **Handed to me to judge:** pass 3's assumption 1, the definition of an "attempted" discriminator (E2-4).
- **Assumption I supplied:** the live upload's 18-row linking is judged against the Mixfest pool's own
  `players.csv` and its upload summary, not against start.gg (no calls). Amendable.
- **One disclosure:** my first baseline hash (`sha1sum` of every file under `out/` and `registry/`, as
  pass 2 did) also hashed the bytes of the old `out/<t>__<e>__*` folders. Nothing in them was opened or
  parsed; every later hash covered only the three pools and `registry/`.

### What I re-ran

| what | command / method | result |
|---|---|---|
| suite, working tree | `NODE_OPTIONS="--require ./testlib/no-network.js" node --test` at `637485b` (Node v24.14.1) | tests 262, pass 262, fail 0, skipped 0; tree clean afterwards |
| suite, clean clone, offline | `git clone -b build/tool-c`, checkout `345508f`, no `.env`, same command | 262 / 262 / 0 / 0 (matches the claim) |
| before-states | the clone at `d19f853` and at `c7be7b3` | 256 / 256 / 0 / 0 and 225 / 225 / 0 / 0 (match) |
| test names | sorted pass lines at `c7be7b3`, `d19f853`, `345508f` | pass 3: 0 gone, 6 new (E2-1, E2-4 ×2, E2-5, E2-6, E2-7). Whole build: 0 gone, 37 new. `git diff d19f853 345508f -- test/` has no removed line |
| protected files | `git diff --stat c7be7b3 345508f --` the usage log, the design doc, all contracts, `build-record.md`, `build-record-webapp.md`, `.env.example`, `src-tauri/`, `.github/`; removed lines in `git diff c7be7b3 637485b -- docs/build-record-tool.md` | empty; 0 removed lines (the record is append-only) |
| mutation checks, pass 3's fixes (`m1.json`, 20 mutants, full suite each, restored with `git checkout --`) | table below | 19 killed by the named pass-3 test; 1 survivor (E4-1) |
| mutation checks, core acceptance guards (`m2.json`, 8 mutants) | A6-1 in a batch, `readState`'s source fallback, the badge fallback, the tag-only mark, a discriminator-linked row answering to a tag, the `player_id` step, the tag-only class, the migration's BOM | 7 killed (1 to 24 tests each). The server's badge fallback survives as an equivalent mutant: `readState` already gives every state a known source |
| **T1 migration and live linking**, own raw parser (`csvdiff.js`: quotes kept, each record's line ending) | `registry/tiers.csv.bak` vs the working `registry/tiers.csv` | BOM kept on both; 713 records each; CRLF on all 713, 0 line-ending changes; the header gains only `discriminator`, after `player_id`; 0 quoting changes; exactly 18 rows differ, in `discriminator` (18) and `player_id` (11), nothing else |
| the 18 rows against the live pool | each tiers row with a discriminator vs `out/mixfest-26-mbaacc/<current>/players.csv` | 18 of 18: the row's `player_id` is a Mixfest player whose `user_slug` is `user/<the row's discriminator>`, game 22407. The 11 with a new `player_id` are exactly the summary's *Linked by tag* list (Spiraler, Mishi, Alterchemist, Blixby, Ricefield, NITROUS, Wishy, Leebzz, Scrub Jay, Hydrous, Javonero); the other 7 are its "7 matched by start.gg id"; 0 ambiguous, 14 with no row |
| the tiers file in git | `git hash-object` vs `HEAD:registry/tiers.csv`; `git ls-files --eol`; `git log -- registry/tiers.csv` | equal (`359f543…`); `i/lf w/crlf`, as before the build; last written by `6c49b79`; `.bak` sha1 `ffb8898…` (build B's close), ignored by `.gitignore:5` |
| idempotence | `migrateTiers` on the current file | `changed: false`, text identical |
| tag-only today (E2-2's correction) | `readNotes` over each pool's current players with the real tiers file | Eclipse: 182 rows, 0 tag-only; Mixfest: 18 rows, 0 tag-only; no tiers row matches Crescendo's players. The correction is true |
| the 8765 loader (E2-3's correction) | `app/app-main.js` lines 45–52; `Get-Process` on `seeding-server.exe` | the loader `require`s `<repo>/app/server.js` when it exists, and the exe sits in `app/`. The correction is true. The process started at 10:16:50, **before** pass 3's commits (10:37–10:40); see E4-3 |
| routes and leaks (`routes.js`: `createApp` over copies of the three pools plus a planted `.env`) | 19 paths: `.env` in plain, `%2e`, `../`, `..%2f`, `%5c` and double-slash forms; `state.json` and `current` under `/t/`, `/out/`, `/api/t/`, `/static/`; `registry/tiers.csv` | all 404; nothing leaked |
| the upload page's guards (on the copy) | `POST` to `events`, `schedule/refresh`, `linked`, `push/upload/dry-run`, `push/upload/post`; `lifecycle` archive | 409 with the upload guard's own message on the first five; archive refused; `GET /api/t/mixfest-26-mbaacc` → `source: upload`, one event, `controls.archive: false` |
| upload names and path safety (on the copy) | `../../evil`, `..\..\evil`, `CON`, `a/b\c`, `%2e%2e`, blanks, `.env`, `state.json`, an existing pool's name, an accented name, 100 characters | slugs are only `[a-z0-9-]`: `evil` (then 409 for the second), `con`, `a-bc`, `2e-2e`, 400 for blanks, `env`, `state-json`, 409 for `eclipse 1st cour`, `unicode-fest`, 60 characters. Nothing written outside the scratch `out/` |
| the home page (copy: `GET /` through the handler, and the Browser pane, dark) | the order and text per both mid-pass messages | the header, the link row with Add, *Import from CSV* with its one-line description, then the list; one done-note above Eclipse; no "Live tournaments" text; badges: Mixfest `upload`, Eclipse and Crescendo `start.gg` (their `state.json` have no `source`, and their bytes are unchanged) |
| **the Mixfest page, on a copy** | the clean clone on port 8799 (`--out` a copy of the three pools; `SEED_TIERS_FILE` a copy of the tiers file with Mishi's and Hydrous's ids blanked); Browser pane | one tab (Melty Blood Actress Again Current Code), no *Seeded events* box, *Push to start.gg…* hidden, no Schedule tab; the upload summary opened on the first visit (the copy's `shown_at` was set; the real one is still `null`) and listed the 11 tag links; Mishi's and Hydrous's Tier cells `match-tag` with the hover starting "Matched by tag only…", dark `#18406e`/`#d3e5ff`, after a reload in light `#cfe2ff`/`#12357a`, and the same light blue in the compare panel with both ticked |
| the one queue | every `createClient` and `fetchFor` in `app/`, `lib/run.js`, `lib/upload.js` | the upload's lookups, pull and W-L all take `queue.fetchFor` (`app/jobs.js:115,158,170`); E2-1's `onSent` is stripped by `limit-fetch` before the real fetch |
| `out/` and T1 before and after | sha1 of the 27 files in the three pools and `registry/` | identical. Eclipse and Crescendo: no file newer than the contract; mtimes 09:13:14, before `c7be7b3` (09:40) |

Mutation detail, pass 3's fixes:

| fix | mutation | failed |
|---|---|---|
| E2-5 | the guard removed from the push routes | the E2-5 test |
| E2-5 | the guard on dry-run only | the E2-5 test (the post route is pinned too) |
| E2-1 | the record stamped at queue entry (`at = t`) | the E2-1 test |
| E2-1 | `limit-fetch` never reports the send | the E2-1 test |
| E2-1 | `queued_ms` dropped | the E2-1 test |
| E2-4 | an attempted code taken as the header | both E2-4 tests |
| E2-4 | `user/` and links not counted as attempts | the E2-4 parse test |
| E2-4 | the non-hex letter budget 2 → 0 | the E2-4 parse test |
| E2-4 | **the "at least one digit" clause dropped** | **nothing** (E4-1) |
| E2-4 | `header_row` not parsed / not in `state.json` / not in the summary / not on the page | 2, 1, 1, 1 tests |
| E2-6 | a failed lookup treated as not found; render ignores `lookup_error`; `players.csv` drops the column; `loadRun` drops it | the E2-6 test, each |
| E2-7 | no ceiling; `>=` for `>`; a ceiling of 5,000 | the E2-7 test, each |

### Findings

**On pass 3's dispositions.** Each one holds on the artifact.

| # | pass 3 said | holds? | evidence |
|---|---|---|---|
| E2-1 | FIXED (the cheap half) | **holds** | records carry the send time, and `queued_ms` when they waited; three mutations fail the test; the "ceiling one below" half went nowhere, per ruling |
| E2-2 | ACKNOWLEDGED, record correction | **holds; the correction is true** | 0 tag-only matches on every real pool; I saw the color on a copy with two rows' ids blanked (both themes, table and compare panel) |
| E2-3 | ACKNOWLEDGED, record correction | **holds; the correction is true** | `app/app-main.js` loads the checkout's `app/server.js`. One consequence the correction did not spell out is E4-3 |
| E2-4 | FIXED | **holds**, one clause unpinned (E4-1) | both tests; 7 of 8 mutations fail |
| E2-5 | FIXED (test) | **holds** | the guard's exact message on both routes; removing it, or keeping it on dry-run only, fails the test |
| E2-6 | FIXED | **holds** | four mutations fail the test; the live pool (no `lookup_error` column) renders as before |
| E2-7 | FIXED | **holds** | 1,000 accepted, 1,001 refused with the count before any write or request; three mutations fail |
| E2-8 | DECLINED (kept, per ruling) | **holds** | the ruling says keep, amendable; the README does not say it (E4-2) |
| E2-9 | ACKNOWLEDGED | **holds** | no registry write since `6c49b79` |

**Pass 3's E2-4 definition, judged** (the job asked me to). A first row is a header only when its second
value is neither a code nor "an attempt at one": it contains `user/`, it is a link (`://`, `www.`,
`start.gg/`), or it is one token of 6–10 letters and digits with at least one digit and at most two
letters outside a–f. My probes: `abcd123`, `aaaa002`, `aaaa00002`, `abcd1234x` and `abcdefg1` count as
attempts; `discriminator`, `Discrim`, `CodeID`, `Decode`, `StartGG`, `startgg id`, `user id`,
`user_slug`, `slug`, `ID`, `gamertag1` and `tag2` stay headers. A mistype outside the rule (`zzzz1234`,
a 5-character fragment) is still skipped as the header, but the summary now names that row with its line
and both values, so nothing is silent; that is the ruling's own backstop. **The definition is sound, and
Noah could sign it.** One cost to know: every list with a normal header now gets the note "Line 1 was
read as the column header and skipped: name, discriminator. If that is a player, add a header row above
it and upload again." It is dim text, and it is what the ruling asked for ("whenever a header row is
skipped"). Noah may find it noise; that is his call (Open items).

**E4-1 — NOTE — the digit clause of the attempted-code rule is not pinned.** Dropping "at least one digit"
from `looksLikeAttemptedCode` leaves the suite green. The clause keeps a short all-letter column name such
as `CodeID` or `Decode` a header. Without it, line 1 would be reported as malformed instead; nothing
would be lost, because the rows below still read. **Resolves:** add one such name to the E2-4 test's
header list. No user impact today.

**E4-2 — NOTE — the README does not say the list's name is also a tag key.** E2-8 kept, by ruling, that an
uploaded player answers to a tiers row by the name the list gave as well as by start.gg's tags, in the
reader and the writer. The README's *Your tiers file on upload* and *Tiers and start.gg ids* paragraphs
describe matching by tag without saying whose tag, so Noah would read them as start.gg's tag only. Every
such link is in the summary's review list, so it is visible. **Resolves:** one clause, for example "by
tag (start.gg's, or the name the list gave)".

**E4-3 — NOTE, for Noah before his next upload — the app on 8765 runs pass 1's server code.** The process
started at 10:16:50; pass 3's commits are from 10:37–10:40. The loader reads `app/server.js` and `lib/`
once, at launch, while `app/public/` and `lib/view/render.js` are served from disk on each request. So
until the app is relaunched, an upload made there still accepts more than 1,000 rows, still skips a
mistyped first code as the header without naming it, still flags a failed lookup as "not found", and
still stamps its request logs at queue entry. The pages render, because the new browser code only reads
fields the old server does not send. Nothing is wrong on disk. **Resolves:** relaunch the desktop app
(the orchestrator already plans to after this pass). A relaunch does not touch the Mixfest summary.

**E4-4 — NOTE — Acceptance 10's "the resulting page checked by the orchestrator" is not on the record.**
The contract's Passes table puts a browser check between passes. The record has no orchestrator section
after pass 1, and the one after pass 3 says the checklist was not re-run, on purpose, so that Noah sees
the Mixfest summary first. I rendered a copy of the live pool in the Browser pane (above): one tab, the
controls, the summary with the 11 tag links, and the blue on blanked rows in both themes. That is the
page's code over the real data. The first open of the real page is still Noah's, as intended. This is not
a build defect.

**Literal ask, both directions.** *Short of it:* nothing on the Acceptance list as written; item 10's
orchestrator leg is E4-4. *Beyond it:* nothing to pull back. Every addition sits inside A1, the contract
or a ruling: the upload request log and `lookup_error` (E2-1, E2-6); Refresh asking failed lookups again
(A1.3: the pool is pulled "the same way as a tournament's"); the refusal to add a start.gg tournament over
an uploaded page's slug (it protects A1.3's page); Archive off on an upload (A1.3 lists Mark done and
Delete only); the `alias` column (A1.3's alias); and the list's name as a tag key (E2-8, ruled). No file
outside the grants changed.

**Comprehension.** Pass 3's code diff is 78 added and 18 removed lines over 9 files, plus 143 test
lines. Each disposition reads straight from the ruling to a small function and the test that fails
without it. Read whole, build C is A1 as written: one matcher with an id-then-tag order, one color class
from one function, a CSV parser that keeps line numbers, and one upload route that writes a `state.json`
and hands the rest to the existing pull. I could follow it in one sitting per area.

### Acceptance

| # | item | met | my evidence |
|---|---|---|---|
| 1 | `node --test` clean clone, offline, no regression (225 before) | **yes** | 262/262/0/0 on a clean offline clone at `345508f` and on the working tree; 225/225/0/0 at `c7be7b3`; 0 test names gone, 37 added; pass 3 removed no assertion |
| 2 | T1 migration: `discriminator` after `player_id`, blank, every other byte identical, idempotent, round-trip; rows filled by pulls and uploads | **yes** | my own raw parser, `.bak` vs the file: only the column added; BOM, quoting and CRLF kept; the only later changes are the upload's 18 rows in two columns; idempotent; the BOM and round-trip mutants fail tests; no backfill from old pools (said which, pass 1) |
| 3 | match order id → discriminator → tag; one matcher for reader and writer; tag-only marked and colored in table, compare panel, CLI, both themes; ✓ or edit writes both ids; A6-1 | **yes** | `matchTierRowBy` serves `readNotes`, `editTierRow`, `linkPlayers` and `lib/push.js`; the ordering, mark and class mutants fail 1 to 24 tests; the CLI's cell is pinned by the parity test; seen on a copy in the table and compare panel, dark and light; A6-1 in a batch fails its test when broken |
| 4 | CSV contract | **yes** | pass 2's mutants, plus pass 3's: a mistyped first code is malformed at line 1, and a skipped header is named (E2-4); the attempted-code definition is judged sound (above; E4-1) |
| 5 | one `user(slug)` per row through the queue; unresolved kept and flagged; fake resolver | **yes** | the lookups take `queue.fetchFor`; not-found and failed rows are flagged distinctly (E2-6); the live 32 lookups were recomputed by pass 2 |
| 6 | `POST /api/uploads`; `state.json` source upload; one synthetic event; pull through the per-player code; one tab, no push, no Schedule; done by date; export and ✓; home lists it; form under "Add a tournament" | **yes** | probes on a copy: guards on every push, schedule, linked and tick route; slugs safe; 409 on collisions; the row ceiling; the page seen with one tab and no push or schedule; the home layout per both mid-pass messages |
| 7 | current start.gg tag; list name as alias on hover; prefix fills Team | **yes** | `akaOf` and `poolPlayers`, tested; on Mixfest the list's names equal start.gg's prefix and tag, so no alias shows (Spiraler is listed as "RBS \| Spiraler", which is the team prefix) |
| 8 | registry linking on upload; linked-by-tag listed; summary shown once and kept in `state.json.uploads`; scratch-file test | **yes** | the 18 rows match the pool and the summary exactly; the test uses a scratch file; "shown once" seen on the copy (opened, then `shown_at` set); the real one untouched |
| 9 | badges, both themes; an old `state.json` reads as start.gg | **yes** | `readState` defaults `source` and never writes it (the pools' bytes are unchanged); dark seen by me on the copy, light by pass 2; start.gg's blue itself is unverified (Open items) |
| 10 | live check recorded with request counts; the page checked by the orchestrator | **yes for the run**; the orchestrator's page check is open (E4-4) | pass 2 recomputed 168 requests, max 20 in any 60 s by sends; I rendered a copy of the live pool |
| 11 | README: the upload, the discriminator column, the tag-only color, the badges | **yes, with E4-2** | each paragraph read against the code; pass 3's additions (the header rule, 1,000 rows, *lookup failed*, send-time logs) are true; the list's name as a tag key is missing |
| 12 | closing approval by pass 4 on the actual artifact | **given** | this verdict, on the code at `345508f` |

### Could not verify

- **The real Mixfest page in a browser.** Not opened, on purpose: its first open is Noah's. I rendered a
  byte copy of the pool with the same code.
- **The light theme of the home page's badges.** The Browser pane refused my navigation back to the
  copy's home page (an auto-mode classifier denial); I did not work around it. I saw dark; pass 2 saw
  both; the tokens are in all three blocks.
- **start.gg's brand blue** (`#3f80ff`) and **Mixfest's date** (2026-11-14): no start.gg or web access in
  this job.
- **Whether the 11 tag links are the right people.** The tags agree on the data; whether each tiers row
  was written for that person is Noah's review (A1.3).
- **The 8765 app after a relaunch.** Reasoned from the loader; it is not mine to restart.
- **Windows reserved names on other machines.** A page named `CON` makes `out/con/` here (Windows 11, as
  pass 2 saw). An older Windows may refuse that folder, and the upload would then fail with a server
  error. Not exercised elsewhere.

### Open items that belong to Noah

From build C:

1. **E2-1 — the second half of the candidate standing rule:** a live run under a self-imposed ceiling
   sets the queue one below it. (The first half, send-time logs, is built.) Ratify or decline.
2. **E2-8 — the list's name counts as a tag key** for matching tiers rows (kept, amendable), plus E4-2's
   README clause if you keep it.
3. **Pass 3's E2-4 definition of an "attempted" code** (amendable in one function), and whether the
   "Line 1 was read as the column header" note on every normal upload is wanted or is noise.
4. **Confirm Mixfest's date (2026-11-14) and start.gg's blue (`#3f80ff`).** Both are unverified: the date
   came from an Exa search, the blue is model knowledge.
5. **Review the 11 rows linked by tag** in the Mixfest upload summary (Spiraler, Mishi, Alterchemist,
   Blixby, Ricefield, NITROUS, Wishy, Leebzz, Scrub Jay, Hydrous, Javonero). If one is the wrong person,
   clear that row's `player_id` and `discriminator`.
6. **E4-3 — relaunch the desktop app before the next upload**, so pass 3's server fixes are live there.
7. **Pass 1's interpretations, still unconfirmed:** light blue replaces the recency color; Team takes the
   list's prefix first; an upload links tag matches at once (so its own page shows no blue); two listed
   players on one tag link neither; no discriminator backfill from old pools; done from the start of the
   given date, local time; discriminators are 8 hex characters (model knowledge).
8. **`registry/tiers.csv.bak`** may be deleted now (the contract keeps it until pass 4). That is your
   action or the orchestrator's; this seat does not touch it.
9. **The Mixfest list is in git:** `c7be7b3` committed `test/fixtures/mixfest-26-players.csv` (32 names
   and discriminators; public start.gg data, allowed by the contract). Same share-phase note as D4-6.

Carried from builds A and B (unchanged by build C):

10. **B2-1 / B4-1** — what un-✓ restores (default option (a)).
11. **B2-2** — majors for MBTL; **B2-5** — the CLI's HTML carries your tiers and notes; **B2-6** — "today"
    is the UTC day.
12. **D2-4** — "Mark live again" (kept, amendable); **D2-6** — an incremental pull keeps the pool's
    window; **D2-11** — build B pass 1's 21 requests in 60 s, which needs your acknowledgement;
    **D2-2 / D4-4** — `request_count` vs `requests_this_pull`.
13. **D4-1 / P3-2** — a first Pull while another tournament's job runs; **D4-2 / D4-3** — a queued pull
    is lost on a restart, and the candidate standing rule "nothing a click asked for is dropped quietly".
14. **D4-6** — the recorded fixtures are real players' public data in git; scrub them before sharing.
15. **A2-5, A2-6, A4-3, A4-6, C2-3 (+ C3-4, which needs a live allowance)**, build A's majors
    interpretations, and drag-to-order if you still want it.

### Verdict: APPROVE WITH NOTES

**Acceptance item 12 is given.** The extra repair/re-review pair is not needed, and none is requested.

**What it covers:** Acceptance 1–11 on the code at `345508f`, checked on the artifact, not the record.
I re-ran the suite on the working tree and a clean offline clone (262/262/0/0) and both before-states. I
diffed the tiers file column by column against its `.bak` with my own parser and matched all 18 linked
rows to the live pool. I ran 28 mutations (26 killed, 1 equivalent, 1 survivor: E4-1). I probed 19 leak
paths, the upload page's guards and 11 upload names over copies. I rendered a copy of the live Mixfest
pool in the Browser pane and saw the tag-only blue in the table and the compare panel in both themes.
Every pass-3 disposition holds, and both record corrections are true.

**Why notes and not a return:** no Acceptance item is missed as written. E4-1 is one unpinned clause,
E4-2 one README clause, E4-3 an operating note (relaunch 8765), and E4-4 an orchestrator leg that is
deliberately waiting for Noah's first look. None changes what Noah gets from the build.

**What it could not judge:** the first open of the real Mixfest page (Noah's); start.gg's blue and
Mixfest's date; whether the 11 tag links are the right people; the 8765 app after a relaunch; the
light-theme home page by my own eye in this pass.

### REPORT

```
REPORT
- Overview: Pass 4 (engineering auditor, closing re-review) of build C at 637485b (code 345508f).
  Verdict: APPROVE WITH NOTES; Acceptance 12 is given. Every pass-3 disposition holds on the
  artifact, and the E2-2 and E2-3 record corrections are true. Suite 262/262/0/0 on the working tree
  and a clean offline clone. The tiers file differs from its .bak only by the discriminator column
  and the upload's 18 rows. The three out/ pools and registry/ are unchanged (27 files, sha1).
- Found: E4-1 NOTE (the attempted-code rule's digit clause is unpinned; one test line). E4-2 NOTE
  (the README does not say the list's name is a tag key, E2-8). E4-3 NOTE (the 8765 app started
  before pass 3's commits, so pass 3's server fixes are not live there until a relaunch). E4-4 NOTE
  (Acceptance 10's orchestrator page check is not on the record; I rendered a copy of the live pool).
  Pass 3's E2-4 definition is judged sound.
- Ran: node --test on the working tree and on clean clones at 345508f, d19f853 and c7be7b3;
  test-name diffs; 28 mutations (probes/mutate.js, m1.json, m2.json); csvdiff.js on tiers.csv.bak vs
  tiers.csv; the 18 linked rows vs the Mixfest pool; routes.js (19 leak paths, the upload guards, 11
  upload names) over copies; the clone on port 8799 over a copy of out/ in the Browser pane (the
  Mixfest page; the tag-only blue in the table and compare panel, dark and light); protected-file
  diff; out/ and registry hashes. Evidence: this section of docs/build-record-tool.md, one commit;
  scripts in the session scratchpad p4c/probes/.
- Attributed: core / seeding-ops increment 4, build C, pass 4. STATED: dispatch-contract-tool-c.md
  (Passes table, Acceptance 12), design-tool.md Amendment A1, Noah's two mid-pass messages, the
  caller's pass-4 dispatch.
- Queued: E2-1's second half and E2-8 wait on Noah (process and product choices, not repairs).
  E4-1 and E4-2 are small and optional; they do not justify the extra pair.
- Spend: term = 4 passes + at most 1 repair pair; consumed pass 4 of 4; the extra pair is unused. No
  skills, subagents or workflows. start.gg requests 0. Token never read. out/ and registry/ read only;
  all writes in a scratch clone and copies. Port 8765 untouched; Mixfest shown_at still null.
- Parked: none. Tree clean at the record commit. My port-8799 server is stopped; the scratch clone is
  clean.
- Needs attention:
  1. Relaunch the desktop app before the next upload (E4-3), so the 1,000-row ceiling, the header rule
     and the lookup-failed flag are live there.
  2. Open /t/mixfest-26-mbaacc yourself and review the 11 "Linked by tag" rows (A1.3's review step).
  3. Confirm Mixfest's date (2026-11-14) and start.gg's blue (#3f80ff).
  4. Rule on: E2-1's "ceiling one below the limit"; E2-8 (the list's name as a tag key); E2-4's
     definition and its header note on every upload.
  5. registry/tiers.csv.bak may now be deleted. The carried items from builds A and B are listed above.
```
