# Dispatch contract — seeding-ops, increment 3 (the seeding tool), build B

Status: ISSUED 2026-10-29, after build A closed APPROVE WITH NOTES at 103b7f7 (pass 4, acceptance 12 given). Authority: Noah 2026-10-29, *"start the whole
build … use subagents, and opus for engineering team."* Team: `personal-staff/personas/TEAMS.md`
§Engineering team (owner **lead-engineer**, auditor **engineering-auditor**, report-only). Profile
blocks: `personal-staff/personas/library/<slug>.md`.

Build B is steps 4, 5 and 6 of `docs/design-tool.md` §Next steps: the tournament pool and page, the
lifecycle, and the outputs. It changes the pull's output layout, so **increment 1's never-run audit
passes are due here** (`docs/build-record.md`), as the spec says.

```
DISPATCH
- Directive: "it's 3 tables, and clicking a page for seeding an event shows a slice of data" /
  "have it by event with tabs per game or for schedule in it instead of separate pages" / "results
  are banked until event expires or deleted" / "pushing to startgg is optional … don't assert that
  it's fully ordered beyond tiers"
- Surfaces: C:\Users\iknow\repos\seeding-ops (read/write per grants) · docs/design-tool.md
  (BINDING; §T2, §T3, §Pages, §Lifecycle, §Outputs, §Open questions defaults) · docs/usage-log.md
  Ratified rows (BINDING, read-only) · docs/design.md (increment 1; its pull behavior and CSV
  columns are changed ONLY where design-tool.md §T2 says so)
- Term: work scope = the Acceptance list · 4 passes + at most ONE extra repair/re-review pair
- Current focus: next event week of 2026-11-02 will be seeded on build A if build B is not closed
  by then; build B must not break build A's page while in progress (branch isolation)
- Work types: additive / repair / preparatory (the pull's output layout)
- Window-end: park-resumable
```

## Passes

| Pass | Seat | Model | Posture |
|---|---|---|---|
| 1 | lead-engineer | Opus | Build steps 4, 5, 6 to `docs/design-tool.md`; `docs/build-record-tool.md` §Build B, Pass 1 |
| 2 | engineering-auditor | Opus | Report-only review of pass 1, **including the increment 1 audit** (the pull: `lib/run.js`, `lib/output.js`, `lib/startgg.js`, `lib/history.js`) against `docs/design.md` as amended by `docs/design-tool.md` §T2 |
| 3 | lead-engineer, fresh job | Opus | Repair: every finding FIXED or DECLINED with reasoning |
| 4 | engineering-auditor, fresh job | Opus | Closing re-review; the build is not complete until this approves |

The orchestrating session verifies in its browser between passes: add a tournament by URL, tick
events, pull, tabs per game, the Schedule tab, refresh swap, lifecycle controls, the export CSV, the
push dry-run diff (no post).

## Mutation grants

- Under `C:\Users\iknow\repos\seeding-ops\`: create/modify/delete anything **except**
  `docs/usage-log.md`, `docs/design-tool.md`, `docs/design-webapp.md`, `docs/design.md`,
  `docs/dispatch-contract*.md`, prior build records, `.env`, `registry/tiers.csv` (build A's migrated
  file; read and write only through the existing tiers reader/writer), and **existing `out/` run
  folders** (read-only; the new `out/<tournament-slug>/` layout is created beside them and must never
  read, move or delete the old `out/<t>__<e>__<stamp>/` folders).
- `conflicts/`: may be moved/refactored into the app (T3 and the Schedule tab) with its tests kept green.
- Git: branch **`build/tool-b`** from `build/tool-a` at `103b7f7`. Local commits only. No
  remote, no push.

## Prohibitions

- **start.gg budget: at most 20 requests per rolling 60 s across all live calls,** and only against
  past small tournaments (`crescendo-of-night-3-episode-0`). One live pull of that tournament with
  both of its events ticked is allowed for Acceptance 3; everything else is offline against the fake
  start.gg (`testlib/fake-api.js`).
- **Never post seeding to start.gg** (`updatePhaseSeeding`). The push is built and tested against the
  fake; the dry run may run live read-only (the phase seeds query) against the past tournament only.
  The first real post is Noah's, in the orchestrating session, against his own upcoming event.
- Never read a token from anywhere but `.env` or the environment, and never print, log or commit it.
- Never delete or rewrite an existing run folder's CSV or meta files.
- Never weaken, skip or delete a test to make it pass. A failing test is a hard stop for that thread.
- Never guess a blocked ruling; record the options and stop that thread. Open-questions defaults are
  not guesses; name each one used.
- No skills, subagents or workflows beyond the seats in this contract.

## Acceptance (binding)

1. `node --test` passes on a clean clone, offline, no regression in build A's, increment 2's or
   increment 1's tests (tests of the old per-event layout may be retargeted to the new layout only
   where the spec changes the behavior; say which and why).
2. **Pool layout** (spec §T2): `out/<tournament-slug>/` with `pull-<stamp>/` (players.csv with
   `events`, results.csv without `is_event_game`, meta.json, `_work/`), a `current` pointer written
   atomically after the pull completes, old pull directory deleted after the swap; `set-records.json`,
   `state.json`, `schedule.json` outside any pull directory. A crash mid-pull leaves the old pull live
   (test). Resume works from the new pull's `_work/` (test).
3. **One pull per tournament:** registrants are the union across ticked events; a player in two
   events is fetched once (test with the fake; one live run of CoN3 Ep0 with both events, recorded with
   request counts). Refresh re-pulls everyone and carries the W-L cache by event id (test: no set
   lookup repeated). Ticking a new event pulls only new players (test).
4. **Pages** (spec §Pages): `GET /` lists tournaments live / done / archived; add-tournament by
   tournament or event URL with one synchronous events request and a singles-only picker;
   `GET /t/<t>` with a tab per ticked game and a Schedule tab; the seeding tab is increment 2's table
   sliced by `game_id`, with everything build A delivered intact (✓ writes T1 with the tournament
   slug; majors per game); `GET /e/<t>/<e>` redirects only when `out/<t>/` exists, else 404 with an
   add link; old run folders are not read.
5. **W-L** summary-first across the union of all tabs' summary columns; the page shows partial W-L
   on reload (existing test retargeted).
6. **T3**: the schedule pull writes `out/<t>/schedule.json`, linked side tournaments live in
   `state.json`, and the schedule pull goes through the same single request queue as every other
   start.gg call (test: never two in flight).
7. **Lifecycle** (spec §Lifecycle): status computed from the latest ticked event's `startAt` with
   `marked_done` / `archived` overrides in `state.json`; done blocks nothing; Mark done, Archive
   standings (on request; one standings fetch per ticked event, tested against the fake), Delete
   tournament data (with confirm; removes `out/<t>/` only; T1 untouched, test).
8. **Export CSV** in seed order: higher tier = lower seed number, 1..N contiguous, table order within
   a tier, untiered after tiered; no start.gg request (test).
9. **Push dry run** (spec §Outputs): phase = first by `phaseOrder`; seeds query mapped to T1 and the
   pool; the one numbered sequence (tiered desc with start.gg order within tier → untiered → unmappable);
   diff current→proposed with cross-tier moves flagged and not-in-pool seeds marked; posting requires a
   click and is recorded in `state.json.pushes`; failure modes shown as a status line. Tested against
   the fake only. **The post itself is behind a confirm and is never exercised live in this build.**
10. The tiers file is read and written only through the existing reader/writer; a ✓ on a tournament
    page writes the tournament slug (build A's semantics unchanged; test).
11. `.env` never served; nothing outside `out/` and static files served; `state.json` and `current`
    are never served raw (tests).
12. README rewritten for the tournament page: add a tournament, tabs, refresh, lifecycle, export, push
    with dry run; the CLI pull section says the per-event folder layout is retired.
13. **Build A follow-ups** carried in (small, outside build A's list, from its pass 4): B4-2 (a failed ✓ or edit shows its "Not saved" in the status line, not only in `#msg`), B4-3 (the grey hover says "never reviewed" without claiming the tier came from the sheet when `source` is `app`), B4-5 (the CLI view's header comment matches what it renders), and the README/comment wording for B4-1 (the undo restores only within one page load unless Noah rules otherwise).
14. **Increment 1 audit** (pass 2): the auditor reviews the pull against `docs/design.md` as amended,
    writes its findings into `docs/build-record.md` as its passes 2 (and 3/4 as the loop allows), and
    build B's pass 3 repairs them with build B's own findings.
15. Closing approval by pass 4 on the actual artifact.

## Build record

`docs/build-record-tool.md`, sections "Build B — Pass N". Same shape as build A's: Terms as
understood, Assumptions supplied (every default used), Engineer's-choice rulings, Acceptance table,
Could not verify, UI checklist, REPORT block.
