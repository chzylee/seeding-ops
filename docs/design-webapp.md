# Design: seeding-script webapp (increment 2) — a local seeding table with pin, compare and refresh

Status: APPROVED by Noah in chat, 2026-10-15 (features stated by him; defaults below were proposed in
chat and not objected to). Scope authority: this file + `docs/usage-log.md` → "Requirements surfaced"
rows marked **Ratified**. Builds on increment 1 (`docs/design.md`, the pull), which this does not change.

## What it is

Today's static view (`views/major-table.js` → an HTML file per run folder, served by `views/serve.js`)
becomes a **local web app**: one stable page per event that always shows the **latest** pull, with three
features Noah asked for:

> "a button to toggle a split view on the lower half where i can specifically select and compare 2
> players to see their rows. a button on a row where i can pin it to top of view and freeze it so i can
> scroll table and compare the selected row of interest to other rows. also on refresh, i want to just be
> able to refresh page in my browser. no new page for each refresh since only latest data is valuable."

Use case driving it: seeding a large event (100+ registrants) today. What he likes and must keep:
*"i've really liked the experience thus far of scrolling the table and its starting to look better."*

## Binding display rules (ratified, `docs/usage-log.md`)

1. Per result: **event name, placement out of entrants, W-L**. Date is secondary.
2. **No aggregate counts** (number of results, wins, top-3s).
3. **Every event series** is characterized by **best placement (with its W-L), best W-L, average W-L**.
   No series totals. Average is shown only for 2+ events.
4. **Tables, not bullets.**

## The current view is the starting point

Keep its behavior unless this doc changes it: the summary table (Player, Region, majors that someone
played, the top shared series in the format of rule 3, Notes/Seed if `notes.json` exists), per-player
series tables, collapsed "every result" and "other games" tables, sortable headers, the series index
built once per run (normalized names, shorter keys absorb extensions, MAJORS/BBB regexes), main bracket =
largest field, W-L via `Event.userEntrant(userId).paginatedSets` with the startgg-results DQ rule,
batched/concurrent/summary-first fetching, and the cache in `<run>/views/set-records.json`.

**Restructure, don't rewrite:** move the pure logic (series index, grouping, stats, column choice, W-L
tally) into a module with tests; the fetch into a module that uses `lib/startgg.createClient`; rendering
into the browser. `views/major-table.js` may remain as a thin CLI over the same modules, or be retired
once the app covers it. Say which in the build record.

## Server

- Node 24 built-ins only, bound to **127.0.0.1**, default port **8765**. Started with `npm run app`
  and by double-clicking `app.cmd` (Windows), which opens the browser to the index. `views/serve.js`
  is replaced by this.
- `GET /` → index of events (one entry per event slug, using its **latest finished** run folder).
- `GET /e/<tournament-slug>/<event-slug>` → **the app page. Stable URL.** It always renders the
  latest finished run for that event. **A browser reload shows the newest data.** No new URL per refresh.
- `GET /api/e/<t>/<e>/data` → JSON for the page (the view model). It's computed from the latest run folder
  and cache at request time, so a reload during a W-L fetch shows the W-L fetched so far.
- `POST /api/e/<t>/<e>/refresh` → re-pull this event via the existing `lib/run.js` (or `pull.js`), producing
  a new run folder. **Merge the previous latest run's `views/set-records.json` into the new run** before
  fetching, then fetch W-L for whatever's missing, **summary-column results first**, in the background.
  Returns immediately.
- `GET /api/e/<t>/<e>/status` → `{ pulling, wl: { done, total, summaryDone, summaryTotal }, lastRunAt, error }`.
- **One background job at a time per server** (start.gg's limit is per token). A second refresh while
  one is running returns 409 with the job's status.
- Old run folders are **kept** on disk (no deletion). Only the latest is ever shown.
- Never expose `.env` or anything outside `out/` and the app's static files.

## Page

- **Header:** event name, game, registrant count, data window, `run_at`, and a **Refresh data** button.
  While a job runs, a status line shows "Pulling…" or "W-L 340 / 1,200 (summary 210 / 400)". The page
  polls `/status` and offers a reload (or reloads itself) when the pull finishes. Reloading the page
  manually is always enough.
- **Summary table**, as today: sticky header row and sticky player column.
- **📌 Pin a row:** a button on each summary row. Pinned rows move into a block **frozen directly under
  the sticky header** and stay visible while the rest of the table scrolls beneath, aligned to the same
  columns. Multiple pins allowed; click again to unpin. Pins persist per event in `localStorage`
  (a convenience: losing them must not break anything).
- **⇅ Compare (split view):** a toggle button. When on, the **lower half** of the window is a
  panel, and the table stays scrollable in the upper half. Two player pickers (type-to-search by tag)
  select A and B. The panel shows:
  1. A's and B's **summary rows**, aligned to the summary table's columns.
  2. **Events both entered:** Event | A placement · W-L | B placement · W-L | Date. This compares
     placements at the same event; it is **not** head-to-head sets (say so in the panel).
  3. A's and B's **series tables** side by side. A series both have played appears on the same row.
  Toggling off restores the full-height table. The selected pair persists like pins.
- Rows remain alphabetical unless `notes.json` provides seeds.

## Performance

The page must stay smooth at **200 registrants × ~100 results each** (~20,000 result rows). Render the
summary immediately and render per-player detail on demand (expand, or into the compare panel), not
all up front. Measure and record load time for the largest real run available.

## Out of scope (this increment)

Tier import from Noah's sheet (explicitly deferred). Head-to-head **sets** between two players. Hosting,
authentication, multi-user. Changing the pull (`lib/run.js` behavior, CSV schema). Editing seeds/notes
from the page.

## Amendment A1 — freeze columns, Google Sheets export (Noah, 2026-10-15, mid-pass-1)

> "i should also be able to import to google sheets because that is much easier for me to both manage
> and share. the ability to freeze columns and rows would also be awesome."

- **Freeze columns:** a control on the summary table to choose how many leading columns stay fixed
  when scrolling sideways (Player is always frozen), or to freeze specific columns by clicking their
  header. Frozen columns stay aligned in the pinned-row block and the compare panel. Persist per event
  like pins. **Freeze rows = the 📌 pin** (already specified).
- **Download for Google Sheets:** a button that downloads the summary table as a CSV built to be
  imported with Sheets' *File → Import → Upload → Replace current sheet*: one header row, one row per
  player, each cell's lines joined so it reads as one line in a spreadsheet cell (e.g. `9th / 196 · 4-2 ('26)`), UTF-8.
  **Tags that start with `= + - @`** must import as text, not formulas. Choose and test the escaping, and
  record the choice. The download is served by the app (`GET /api/e/<t>/<e>/export.csv`); no browser-only blob tricks.
- Out of scope still: tier import/editing (next increment, see below).

## Next increment (not this build) — tiers as Noah's database

Noah, 2026-10-15: *"ideally i manage a separate independent sheet of tiers, but we shouldnt lock in to my
existing all players/seeds sheet … one table for players to tiers, another table from players to
results/notes thats much like the generated sheet from results"* and *"we're going to keep building now
but incrementally because i am literally using this right now."* Shape: `registry/` tables (tiers:
player_id, tag, game, tier, justification, decided_on, source; results/notes), Sheets-importable, one-time
seed from his existing sheet, tier + justification editable in the app, "needs tier" filter, his Tier
Guide shown alongside. Recorded here so this build's structure doesn't block it.

## Amendment log

- 2026-10-15: created (Noah, chat). Process: full 4 passes now (Noah, D: "Full 4 passes now").
  Tiers: not in this build. W-L order for large events: summary columns first.
