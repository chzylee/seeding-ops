# Dispatch contract — seeding-script webapp (increment 2, Engineering team)

Issued 2026-10-15 by the orchestrating session on Noah's instruction: *"this is a good point to use the
~/repos/personal-staff engineering team to start turning this into a local webapp."* Team:
`personal-staff/personas/TEAMS.md` §Engineering team (owner **lead-engineer**, auditor
**engineering-auditor**, report-only). Profile blocks: `personal-staff/personas/library/<slug>.md`.

```
DISPATCH
- Directive: "a button to toggle a split view on the lower half where i can specifically select and
  compare 2 players to see their rows. a button on a row where i can pin it to top of view and freeze it
  so i can scroll table and compare the selected row of interest to other rows. also on refresh, i want
  to just be able to refresh page in my browser. no new page for each refresh since only latest data is
  valuable." / "now i want real features" / "i have a huge event to seed today"
- Surfaces: C:\Users\iknow\repos\seeding-script (read/write per grants) · docs/design-webapp.md (BINDING)
  · docs/usage-log.md "Requirements surfaced" Ratified rows (BINDING, read-only)
- Term: work scope = the Acceptance list · 4 passes + at most ONE extra repair/re-review pair
- Current focus: Noah is seeding a large event TODAY; a working app sooner matters, but the process is
  the full 4 passes (his ruling)
- Window-end: park-resumable
```

## Passes

| Pass | Seat | Model | Posture |
|---|---|---|---|
| 1 | lead-engineer | Opus | Build to `docs/design-webapp.md`; `docs/build-record-webapp.md` §Pass 1 |
| 2 | engineering-auditor | Sonnet | Report-only review |
| 3 | lead-engineer, fresh job | Sonnet | Repair: every finding FIXED or DECLINED with reasoning |
| 4 | engineering-auditor, fresh job | Opus | Closing re-review; the build is not complete until this approves |

Browser-UI behavior (pin, compare, refresh, smooth scrolling) is **also verified by the orchestrating
session** in its browser pane between passes. Write a UI checklist into the build record for that.

## Mutation grants

- Under `C:\Users\iknow\repos\seeding-script\`: create/modify/delete anything **except**
  `docs/usage-log.md`, `registry/`, `.env`, `docs/design.md`, `docs/dispatch-contract.md`,
  `docs/build-record.md` (increment 1's records), and **existing `out/` run folders** (read-only; the
  app's refresh may create new run folders and write `views/` caches inside them).
- Git: branch **`build/webapp`** from the current `build/v1` HEAD. Local commits only. No remote, no push.

## Prohibitions

- **start.gg budget: at most 20 requests per rolling 60 s across all of this build's live calls,** and only
  against the small event `https://www.start.gg/tournament/crescendo-of-night-3-episode-0/event/andante-uni2-pc`
  (5 registrants). The orchestrating session is concurrently fetching W-L for Noah's large event with
  the same token. The sum must stay under start.gg's 80. Most testing uses fixtures, offline.
- Never read a token from anywhere but `.env` or the environment, and never print, log or commit it.
- Never delete or rewrite an existing run folder's CSV or meta files.
- Never weaken, skip or delete a test to make it pass. A failing test is a hard stop for that thread.
- Never guess a blocked ruling; record the options and stop that thread.
- Don't change increment 1's pull behavior or CSV schema.

## Acceptance (binding)

1. `node --test` passes on a clean clone, offline (with `testlib/no-network.js`), with no regression in
   increment 1's tests.
2. Pure view logic (series index, grouping, stats, column choice, W-L tally, the events-both-entered
   join) lives in a module with unit tests, including: the "Blood Moon LX" roman-numeral merge,
   `<…>` stripping, run-wide key consistency (the same series gives the same key for two players), main
   bracket = largest field, and the DQ rule.
3. `npm run app` and `app.cmd` start the server on 127.0.0.1:8765. `GET /` lists events. The event URL is
   stable across refreshes and **always** shows the latest finished run (test: two run folders → the newer one wins).
4. Refresh endpoint: creates a new run, merges the previous cache, fetches W-L summary-first, and returns
   immediately. Status reports progress. A second concurrent refresh → 409. Covered by a test with a fake
   start.gg, plus **one** live refresh of the small event within the budget above.
5. The data endpoint during an in-progress W-L fetch returns the partial W-L (a reload shows progress).
6. Pin: pinned rows are frozen under the header, aligned, multiple allowed, unpinnable, persisted per event.
7. Compare: the lower-half split toggles; two searchable pickers; aligned summary rows; events-both-entered
   table with placement · W-L for each; side-by-side series tables with shared series on the same row;
   the "not head-to-head sets" note.
8. All four ratified display rules hold in every table, including the compare panel.
9. Performance: with a synthetic run of 200 players × 100 results, the first paint of the summary and the
   time to open a compare are measured and recorded, and the page stays scrollable without long freezes.
10. `.env` is never served (a test requests it), and paths outside `out/` and the static files return 404.
11. README: an "App" section (start it, the stable URL, refresh, pin, compare) at the top of Quick start.
12. Closing approval by pass 4 on the actual artifact.

## Build record

`docs/build-record-webapp.md`, one section per pass. Each opens with "Terms as understood" and the
assumptions the seat supplied, and ends in the REPORT shape of `personal-staff/dispatch-template.md`.
Note there that increment 1's passes 2–4 are still open; they are not this build's to close.
