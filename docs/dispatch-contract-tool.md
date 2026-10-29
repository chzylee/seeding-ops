# Dispatch contract — seeding-ops, increment 3 (the seeding tool), build A

Status: ISSUED 2026-10-29 on Noah’s go ("go ahead and change names everywhere and start the whole build … use subagents, and opus for engineering team").
Issued by the orchestrating session on Noah's instruction: *"use personal staff eng team to start
building."* Team: `personal-staff/personas/TEAMS.md` §Engineering team (owner **lead-engineer**,
auditor **engineering-auditor**, report-only). Profile blocks: `personal-staff/personas/library/<slug>.md`.

Increment 3 is built as **two builds under one spec**, because `docs/design-tool.md` §Next steps says
each step is usable alone and the next event is the week of 2026-11-02:

| build | steps from the spec | why split here |
|---|---|---|
| **A (this contract)** | 2 (T1 changes) and 3 (majors per game) | small, lands on the current layout, usable at next week's event |
| B (next contract) | 4 (tournament pool and page), 5 (lifecycle), 6 (outputs) | changes the pull's output layout; carries increment 1's overdue audit |

Step 1 (the snapshot commit) is the **orchestrating session's**, done before pass 1 and recorded in
the build record as out-of-band.

```
DISPATCH
- Directive: "want to polish it up for next use" / "reliable for me, then i share" / "don't
  overcomplicate it. it's 3 tables" / "results speak for themselves" (no justification field) /
  majors per game, main-event only (docs/design-tool.md §Display rules 5-9)
- Surfaces: C:\Users\iknow\repos\seeding-script (read/write per grants) · docs/design-tool.md
  (BINDING; its Open questions table's defaults apply unless Noah has ruled) · docs/usage-log.md
  "Requirements surfaced" Ratified rows (BINDING, read-only) · docs/design-webapp.md and
  docs/design.md (prior increments; design-tool.md wins where they differ)
- Term: work scope = the Acceptance list · 4 passes + at most ONE extra repair/re-review pair
- Current focus: next event week of 2026-11-02; Noah's ruling is that the deadline does not drive
  scope. Build A is sized so it lands either way.
- Work types: additive / repair (no preparatory work on build B's layout)
- Window-end: park-resumable
```

## Passes

| Pass | Seat | Model | Posture |
|---|---|---|---|
| 1 | lead-engineer | Opus | Build steps 2 and 3 to `docs/design-tool.md`; `docs/build-record-tool.md` §Pass 1 |
| 2 | engineering-auditor | Opus | Report-only review of pass 1 |
| 3 | lead-engineer, fresh job | Opus | Repair: every finding FIXED or DECLINED with reasoning |
| 4 | engineering-auditor, fresh job | Opus | Closing re-review; the build is not complete until this approves |

Browser behavior (✓ writes and reads back across two browser profiles, recency color, hover, the
editor without a reason prompt, the per-game majors columns on the real Eclipse run) is **also
verified by the orchestrating session** in its browser pane between passes. Write a UI checklist into
the build record for that.

## Mutation grants

- Under `C:\Users\iknow\repos\seeding-script\`: create/modify/delete anything **except**
  `docs/usage-log.md`, `docs/design-tool.md`, `docs/design-webapp.md`, `docs/design.md`,
  `docs/dispatch-contract*.md`, increment 1's and 2's build records, `.env`, `conflicts/` (build B's),
  and **existing `out/` run folders** (read-only).
- `registry/tiers.csv`: **modify only through the migration in Acceptance 2**, run once, after the
  snapshot commit, and only after the migration's tests pass on a copy. Keep a `.bak` beside it until
  pass 4 approves. Never hand-edit rows.
- Git: branch **`build/tool-a`** from `build/webapp` HEAD after the snapshot commit. Local commits
  only. No remote, no push.

## Prohibitions

- **start.gg budget: at most 20 requests per rolling 60 s across all of this build's live calls,**
  and only against past small events (`crescendo-of-night-3-episode-0`'s UNI2 or MBTL event). Nothing
  in build A needs live calls; most testing is offline against fixtures and the real `out/` folders,
  read-only.
- Never read a token from anywhere but `.env` or the environment, and never print, log or commit it.
- Never delete or rewrite an existing run folder's CSV or meta files.
- Never weaken, skip or delete a test to make it pass. A failing test is a hard stop for that thread.
- Never guess a blocked ruling; record the options and stop that thread. The spec's Open questions
  table gives defaults; using one is not guessing, and the build record names each default used.
- Don't change increment 1's pull behavior or CSV schema (that is build B's).
- No skills, subagents or workflows beyond the seats in this contract (Noah's spend rule).

## Acceptance (binding)

1. `node --test` passes on a clean clone, offline (with `testlib/no-network.js`), with no regression
   in increment 1's or 2's tests.
2. **T1 migration** (spec §T1): `justification` dropped; `last_reviewed_on` and
   `last_reviewed_tournament` added; rows with `source = app` and `decided_on` set are backfilled with
   `last_reviewed_on = decided_on`, `last_reviewed_tournament = eclipse-1st-cour`; BOM, quoting and
   every other column byte-identical. Tested on a copy of the real file's shape (712 rows, 107 app rows)
   and idempotent (running it twice changes nothing).
3. **✓ semantics** (spec §T1 Rules): ✓ writes today and the page's tournament slug to T1 through the
   existing tier-row matcher; un-✓ clears both only when they equal this tournament and today, else no-op;
   a review from another tournament is never cleared. Covered by unit tests and a route test. The
   browser-storage seeded state is removed (or read once for migration display and then ignored; say which).
4. **Reviewed row display:** green when `last_reviewed_tournament` equals the page's tournament;
   recency color on the Tier cell per the spec's default bands measured from today; hover shows date
   and tournament. Header sort on the ✓ column groups reviewed and unreviewed as today.
5. **Editor:** tier and notes editable in place as today; **no reason prompt.** `decided_on` still
   updates when the tier changes.
6. **Majors per game** (spec §Display rules 5 and 6, in `lib/view/model.js`): one config list per game
   (name pattern + kind `known` | `game`), MBAACC seeded with CEO, Evo, Combo Breaker, Frosty Faustings
   (`known`) and Climax of Night, Eclipse (`game`); a major column shows only the seeded game's results;
   main-event detection per the spec's default (largest singles bracket of the seeded game at that
   tournament, excluding names matching side / community / 2v2 / teams / "Pre-"), with the exclusion
   list in the same config. Tests: a Frosty Faustings tournament with a Guilty Gear main and an MBAACC
   side bracket produces no MBAACC Frosty cell; a Climax of Night field gets its own column for MBAACC;
   one result per year per column; the four ratified display rules hold in every table, compare panel
   and the Sheets export; header/row parity test still passes.
7. **Real-data check:** on the real Eclipse run folder (read-only), the summary table shows no
   duplicate Frosty Faustings results from other games, and every player with an app-set tier shows the
   Eclipse recency color. Recorded in the build record with counts before and after.
8. `GET /` and the event page still work for every existing run folder; the CLI view
   (`views/major-table.js`) renders the same cells as the app (parity test).
9. `.env` is never served; paths outside `out/` and the static files return 404 (existing tests pass).
10. README: the App section updated for ✓-as-review, recency color, no reason prompt, and the per-game
    majors config (where it lives, how to add a game).
11. `docs/usage-log.md` is not edited by any seat; the orchestrating session adds the rows after pass 4.
12. Closing approval by pass 4 on the actual artifact.

## Build record

`docs/build-record-tool.md`, one section per pass. Each opens with "Terms as understood" and the
assumptions the seat supplied (including every Open-questions default used), and ends in the REPORT
shape of `personal-staff/dispatch-template.md`. Note there that increment 1's passes 2–4 remain open
and are due with build B (spec §Next steps, step 4).
