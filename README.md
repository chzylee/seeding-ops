# seeding-ops

## Quick start (seeding a tournament)

### App: one page per tournament, in your browser

**Start it:**

| Command | What it does |
|---|---|
| `npm start` | Starts the app **and opens your browser**. The everyday way (Windows and Mac). |
| double-click **`app.cmd`** | The same as `npm start`, without a terminal (Windows). |
| `npm run dev` | Starts the app and **restarts it automatically when server code changes** (`app/`, `lib/`). Use it while the app is being changed. It doesn't open the browser; go to <http://127.0.0.1:8765/>. A restart stops a Refresh that's running, so avoid editing code mid-refresh. |
| `npm run app` | Starts the app only; open <http://127.0.0.1:8765/> yourself. |

Leave the window open while you use it; close it (or Ctrl+C) to stop. It only listens on your own
machine. Page files (`app/public/`) are read fresh on every load, so a browser reload picks up their
changes in any mode. **First launch:** the home page asks you to connect to start.gg: paste a personal
API token (from <https://start.gg/admin/profile/developer>), it is checked with one request and saved
to `.env` next to the app, and it works at once. The same screen comes back if start.gg ever rejects
the saved token. (See *Setup* below for the file itself.)

**Add a tournament.** The home page lists your tournaments: live ones first, then done, then
archived (a short line above the first done one says done is automatic once the last seeded event's date has passed). Paste a start.gg tournament link, or any of its event links, into *Add a tournament*. The
app asks start.gg once for the tournament's events and opens the tournament's page. Each tournament
on the home page carries a small badge saying where it came from: **start.gg** (blue) for one added
by link, **upload** (violet) for a CSV list (below). Tournaments added before the badges existed,
and the old per-event pulls imported into this layout, count as start.gg.

**Or upload a player list.** When there is no start.gg event to read registrants from (or you have
your own list), open *Import from CSV* under the link field in *Add a tournament*:

- **The file:** two columns, the player's name and then their start.gg **discriminator**, the
  8-character code in their profile link (`start.gg/user/2d17cccd`). The code can be given bare
  (`2d17cccd`), as `user/2d17cccd`, or as the whole profile link. Column names don't matter and a
  header row is optional (the app sees there is none when the first row's second value is itself a
  code, or looks like a mistyped one: then that row is reported as unreadable, never skipped as a
  header; when a row is skipped as the header, the upload summary names it). A list takes at most
  1,000 players (each is a start.gg lookup); a longer one is refused with the count. A name like `CHAINED | illumin` is split into team and tag. A code listed twice is kept
  once; a row it can't read (no code, or not a code) is reported with its line number. Blank lines
  and values after the second column are ignored (the latter are listed).
- **The form:** a page name (it becomes the page's address, `/t/<name>`), the game (the games in
  `config/majors.json`, or *Other* with a start.gg game id), the event's date, and the file.
- **What you get:** a page like a tournament's with **one tab** for that game. The app looks each
  code up on start.gg once (one request per row), then pulls those players' two years of results and
  their W-L exactly as for a tournament, through the same queue. The table shows each player's
  **current start.gg tag**; when the list named them differently, hover the (dotted) tag to see the
  list's name. The Team column takes the list's team, or start.gg's when the list gives none. A code
  start.gg doesn't know stays on the page under the list's name, flagged *not found on start.gg*
  (a lookup that failed instead is flagged *lookup failed* with the reason, and Refresh asks again),
  with no results and no ✓ or tier edit (there is no id to save them against). Tiers, ✓, notes,
  majors, compare and both exports work as on any tab. The page reads as **done** from the start of
  the date you gave; Mark done and Delete work as usual. **Refresh** pulls the same players' results
  again, and looks up again any row whose lookup failed (it does not re-read the file; upload a new
  list as a new page for that).
- **What's missing compared with a start.gg tournament:** no event picker, no **Push to start.gg**
  (there is no bracket), no **Schedule** tab and no **Archive standings** (there are no start.gg
  events behind the page). A page name already used by another page is refused, and adding a
  start.gg tournament whose address matches an uploaded page's is refused too, so neither
  overwrites the other.
- **Your tiers file on upload:** every listed player is matched to the game's rows in
  `registry/tiers.csv` (see *Tiers and start.gg ids* below). A row matched by start.gg id gets the
  player's discriminator written in. A row with no id that matches **by tag only** gets the player's
  ids written in and is listed under *Linked by tag — please review* in the page's **Upload
  summary**, which opens by itself the first time you visit the page and stays there folded after
  (it is kept in `out/<page>/state.json` under `uploads`). When two listed players match the same
  row by tag, neither is linked and the summary says so. Tiers, notes and reviews are never changed
  by an upload. The summary also lists codes not found, repeated codes and unreadable rows.

**Tiers and start.gg ids.** `registry/tiers.csv` has a `discriminator` column next to `player_id`
(added by `scripts/migrate-tiers.js`; blank until known). **A tier is for one player in one game**
(the row's `game_id`, start.gg's videogame id): a player can be a 9 in one game and a 4 in another,
and every read, edit, ✓, link and push uses only the tab's game's rows. A player is matched to a tiers row by id
first (the row's `player_id`, then its `discriminator`), and only then by tag, among rows that have
neither id. Ids get written in by a ✓ or an edit on the row, by an upload (above), and by any pull:
a row already linked by `player_id` gets that player's discriminator (in every game: it is the same
start.gg player).

**Share tiers with another organizer.** The home page's **Tiers** section has a game picker.
**Export tiers…** saves that game's tiers as a CSV: each tiered player's tier, tags, start.gg player
id and discriminator. Your notes, review dates and tournaments, `decided_on`, `source` and the sheet
import's region / placements / notes are **not** in it. **Import tiers…** reads such a file (or anyone's
`tiers.csv`) for the picked game and shows a review before anything changes: **new players** (no tier
of yours; each with an Add box, plus *Add all* / *Add none*) and **conflicts** (your tier and theirs
side by side; *Mine* / *Theirs* per row, plus *Keep all mine* / *Take all theirs*). Players are matched
by start.gg id, then discriminator, then tag. **Apply** writes only the rows you picked, only in that
game; their notes and reviews stay yours, and each changed row's `source` says
`import <date> from <file>`, which the grey "never reviewed" hover shows. Rows for other games in the file are
counted and ignored; a file with none for the picked game is refused, naming the games it has. A row
matched by tag only that you take is listed afterwards for you to check. If your tiers change between
the review and Apply, the review is shown again.

**Tick the events to seed, then Pull.** On a new tournament's page, *Seeded events* lists its
singles events (teams events are shown greyed out: they can't be seeded). Tick the ones you're
seeding and press **Pull**. One pull covers the whole tournament: every registrant of every ticked
event, each with two years of results in all games. A player who entered two of your events is
fetched once. Then the app fetches W-L, summary columns first. Before the first pull there are no
tabs, just the picker, the Pull button and the status.

**The tournament page** lives at `http://127.0.0.1:8765/t/<tournament>`. Bookmark it: the address
never changes, and a **browser reload** shows the newest data. Old event links
(`/e/<tournament>/<event>`) take you to that event's tab once the tournament has been added.

- **A tab per game.** Each ticked event's game gets a tab: the seeding table for that game, sliced
  from the one pool. A player's results in another of your games show under *Other games* on this
  tab and as "this game" on that one's. Ticking another event later adds a tab and pulls **only the
  players not already in the pool** (a player with no start.gg account who is already in it gets the
  new game's results added). That pull keeps the pool's two-year window where it is, so the new
  players are read over the same dates as everyone else; press **Refresh** to move the window to
  today for everyone. If a pull, W-L fetch or archive is already running, the tick is saved and the
  status line says the new players are pulled after the current job; they are, without another
  click. Unticking hides a tab (no pull).
- **The Schedule tab** shows every player's pools and start times across all the tournament's
  events, plus side tournaments you link (type their start.gg slugs under *Side tournaments* and
  save; the next *Refresh schedule* pulls them). *Conflicts first* puts players with two pools at the
  same time on top. It only shows conflicts; fixing them stays with you in start.gg.
- **Refresh data** re-pulls everything: every ticked event's registrants and every player's results
  (new results since the last pull are the point). The new pull is written next to the old one and
  only replaces it when it is complete, so the page never shows half of each; the old one is then
  deleted. W-L already fetched is kept (it's cached per player per event), so only new results cost
  W-L requests. The status line shows progress (`Pulling…`, then `W-L 340 / 1,200 (summary 210 / 400)`),
  and the page switches to the new pull by itself. Reloading during the W-L fetch shows what's been
  fetched so far. One pull runs at a time.
- **Everything the app sends to start.gg goes through one queue**, one request at a time: pulls,
  W-L, the schedule, the push. To leave room for something else using the same token, set
  `SEED_APP_MAX_PER_MIN` (default 75 per rolling 60 s).
- **📌 Pin** (on each row) freezes that row under the header so you can scroll and compare against
  it. Pin as many as you like; click again to unpin.
- **Freeze** columns so they stay put when you scroll sideways: the *Freeze* menu picks how many
  leading columns, or click **❄** in any column header to freeze just that one. Player always stays.
- **⇅ Compare** splits the window: tick up to three players and the lower half shows their summary
  rows, the events they entered together (each one's placement and W-L there; this is *not*
  head-to-head sets), and their series side by side.
- **Export to CSV** saves this table as a CSV, in seed order with a **Seed** column first (numbered by
  tier with the same sequence the push uses; the table's current order within a tier; untiered last).
  You pick where to save it; a small card shows the progress and goes away when done. For Google Sheets:
  *File → Import → Upload*, then *Replace current sheet*. Tags that start with `=`, `+`, `-` or `@` get a
  leading `'` so Sheets keeps them as text.
- **Tier and Notes** are edited in place: double-click the cell (or focus it and press Enter).
  Enter saves, Esc cancels. Saves go to `registry/tiers.csv`. There is no reason field: the results
  are the justification, and notes are for what results don't show. Changing a tier stamps its
  `decided_on` date. If a save fails, the status line says "Not saved" and the cell flashes red.
- **✓ (Seeded column) marks a player as reviewed at this tournament.** It writes today's date and
  this tournament to `registry/tiers.csv` (`last_reviewed_on`, `last_reviewed_tournament`), so the
  mark shows in every browser, not just this one. The row turns green when the player's last review
  was at this page's tournament. Clicking ✓ again the same day undoes a misclick. The undo puts
  back the review the ✓ replaced only **within one page load**: the page remembers it until you
  reload. After a reload, or from another browser, the undo clears today's review and the earlier
  review's date and tournament are lost (the tier and notes are not touched; `git diff
  registry/tiers.csv` shows the old pair until you commit). On a review from an earlier day the
  click does nothing, and the status line says why. Clicking the Seeded header groups reviewed and
  unreviewed rows.
- **Tier colors** show how recently you reviewed each player: green = reviewed at this tournament,
  no color = within the last 6 months, amber = longer ago, grey = never reviewed. Hover a tier for
  the date and the tournament of the last review; a grey tier that came from the sheet import says so.
  **Light blue** = the tier comes from a row matched **by tag only** (it has no start.gg id yet, so
  the app is inferring that it's this player). It takes the place of the recency color; the hover
  says "Matched by tag only" and then the review text. A ✓ or an edit on that row writes the
  player's ids into it and the blue goes. Two people with the same tag both show the row in blue
  until one of them is ✓'d or edited; after that it belongs to that one only.
- **Major columns are per game, main event only.** A major column shows a player's result in the
  tab's game at that tournament's main event for the game (its largest bracket of that game that
  isn't a side, community, 2v2, teams or "Pre-" bracket), one result per year. Side brackets stay
  in the series columns. The lists live in **`config/majors.json`**, one per game, keyed by the
  start.gg game id (MBAACC is `22407`; MBTL is `36865`, which adds Climax of Night; a tournament's
  games and their ids are in its pull's `meta.json` under `seeded_events`); `default` covers games
  without their own list. **To add a game** copy the `default` block under the game's id and add its
  own majors; **to add a major** add `{ "label": "Name", "pattern": "^name\\b", "kind": "game" }`
  (`pattern` is a case-insensitive regular expression on the tournament name; `kind` is `known` for
  the big four, `game` for a game's own majors). Your rule for adding one: a series of the game
  whose field is at least as large as a known major's. A reload picks up the change.
- Pins, frozen columns and the compare picks are remembered per tab in this browser.

**Seeds: tier order, or your own order.** Each game's table has a **Seed** column. Until you arrange
anything the seeds are the tier order (top tier = seed 1, then by tag within a tier, untiered last)
and follow every tier edit; the bar says *Seeds: tier order*. **Drag a row by its ⠿ handle**, or
focus the handle and press ↑ / ↓ (Page Up / Page Down: ten rows, Home / End: first / last), to put
players in an exact order; the bar then says *Seeds: arranged by hand*, and that order is saved for
the event at once (every move, in `out/<tournament>/state.json`), so a reload or another browser
shows it. Players who register later slot in by tier; players who leave close the gap. **Reset to
tier order** forgets the arrangement (it asks first). **Sort by seed** (or the Seed header) puts the
table back in seed order after sorting by another column; dragging does that by itself. When a tab
covers two events of one game, *Seeds for* picks which event the column numbers.

**Getting your tiers into start.gg (optional).** These two buttons on a game's tab hand the seeds
over. Both number seeds the same way: one sequence 1..N, **your arranged order** when you have one,
otherwise **higher tier gets the lower seed number**, untiered players after tiered ones.

- **Push to start.gg… → Dry run** reads the event's seeding from start.gg (its first phase by phase
  order, named in the dry run; nothing is sent) and shows current seed → proposed seed. The line above
  the table says which order it uses. **Tier order:** tiered players by tier with **start.gg's current
  order within a tier**, then players without a tier. **Your arranged order:** exactly the Seed column
  (a seed whose player isn't in it is slotted in by tier). Then seeds with no single player
  (placeholders, teams). A move that crosses a tier boundary
  relative to start.gg's current order is flagged, so a conflict fix you made by hand in start.gg
  is visible before a re-push would revert it. Seeds whose player isn't in this tournament's pool
  are marked (Refresh to pull them). **Rows stay draggable while the dry run is open**: it redraws
  after every drag or tier edit, and **Post sends the order as it is when you click**. **Posting needs
  a click on the dry run and a confirm**; if start.gg's own seeding changed since the dry run (seeds
  moved there), nothing is posted and a fresh dry run is shown. After a post the panel stays open:
  drag again and post again to update start.gg. Each push is recorded on the page. Failures show as one status line, with no retry: the
  bracket has started or the phase is locked, the token isn't an admin of the tournament, or
  start.gg's rate limit. Your token must be an admin of the tournament to post. *The post has been
  tested against a fake start.gg only; your first real post is the first time it runs.*

**After the event.** A tournament reads as **done** once the latest start time among its ticked
events has passed (or when you press **Mark done**; **Mark live again** undoes that). Done blocks
nothing: Refresh, tier edits, ✓, export and push all still work (late registrations and a
multi-day tournament's later tabs are normal). Done only moves the tournament down the home page and
shows two more buttons:

- **Archive standings** (on request) fetches each ticked event's final standings once, into
  `out/<tournament>/standings.json`, so you can look back at how the seeding played out. The
  tournament then reads as **archived**; its data stays until you delete it.
- **Delete tournament data** (asks you to confirm) removes `out/<tournament>/`: the pool, W-L,
  schedule, standings and push records. **Your tiers, notes and reviews in `registry/tiers.csv` are
  never touched by it.**

### Pulling from the command line

**One-time setup**

1. Install **Node 24+** from <https://nodejs.org>.
2. A start.gg token: either connect from the app's home page (it saves the token to `.env` for you),
   or open `.env` in this folder and paste it after `STARTGG_TOKEN=`. Get a token at
   <https://start.gg/admin/profile/developer>. If you skip this, the launcher opens `.env` in Notepad
   for you.

**Every time**

1. **Double-click `seed.cmd`.** From a terminal, `npm run seed` does the same thing.
2. **Paste the event links,** one per line. Events of the same tournament are pulled together into
   that tournament's pool, once. Press **Enter on an empty line** to start. Links must contain
   `/event/`.
3. **Walk away.** Each tournament takes a few minutes, one after another. When they're done, the
   results folder opens by itself. The tournament also shows up in the app.
4. **Hand the files to Claude** if you want: from `out/<tournament>/`, attach the live pull's
   `players.csv`, `results.csv` and `meta.json` (the pull folder `current` names), then paste
   `claude-prompt.txt` with the last line filled in.

**If it stops partway** (laptop sleeps, Wi-Fi drops, you close the window), double-click
`seed.cmd` again and paste the same links. It picks up where it left off, as long as that's
within 24 hours. Players already fetched aren't fetched again.

**What the summary means:** `done` = all good · `stopped or some players failed` = run it
again to resume · `could not start` = read the message (usually the token or a bad link).

Log how each seeding session goes in [`docs/usage-log.md`](docs/usage-log.md).

---

## Reference

The pull takes a tournament and the events you seed in it. It writes every registrant's
tournament results from the **two years before the moment it runs**, in **all games**, to three
files, once for the whole tournament. It doesn't rank or seed anything; the app does that with you.

A pull takes a few minutes for a ~200-player event. Nobody needs to watch it. It never hands back
incomplete data as if it were complete: either a finished pull replaces the live one, or nothing
changes and the pull can be resumed.

The binding specs are [`docs/design-tool.md`](docs/design-tool.md) (increment 3, the tool) and
[`docs/design.md`](docs/design.md) (increment 1, the pull) where increment 3 doesn't change it.

## Setup

1. **Node 24 or newer.** Check with `node --version`. There are no packages to install.
2. **A start.gg token.** The easy way: start the app and use **Connect to start.gg** on its home
   page; it checks the token and writes `.env` for you. By hand: the `.env` file in this folder has
   an empty `STARTGG_TOKEN=` line; paste your token right after the `=` and save. If the file isn't
   there, copy `.env.example` to `.env` first.
   - Get a token at <https://start.gg/admin/profile/developer> (Personal Access Tokens).
   - `.env` is gitignored. The tool only reads it. It never prints the token, logs it or
     writes it into any output, and the app never serves it.
   - A `STARTGG_TOKEN` environment variable, if set, takes priority over `.env`.

## Run

```
node pull.js https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code
node pull.js <event link> <another event link of the same tournament>
node pull.js https://www.start.gg/tournament/combo-breaker-2026
```

An event link ticks that event for its tournament (added to `out/<tournament>/state.json`, the same
list the app's picker shows) and pulls every ticked event of the tournament. A tournament link alone
re-pulls its ticked events (the app's Refresh). Links work with or without `https://`, with trailing
parts like `/overview`, or as bare `tournament/<t>/event/<e>` slugs. Only singles events can be
seeded.

The command line uses one start.gg client for its whole run (the tournament's events are asked for
once), and ticking from it never overwrites what the app saved in `state.json` (Mark done, archive,
side tournaments, push records). **Don't run a command-line pull while the app is pulling or
fetching W-L:** they are two processes on one token, each with its own limiter.

**The per-event folder layout is retired.** Increment 1 wrote one folder per event,
`out/<tournament>__<event>__<stamp>/`. Nothing writes those any more, and the app doesn't read them;
any you still have are left as they are, and you can delete them whenever you like.

Progress goes to stderr (`player 41/218 · page 2/3 · SomeTag`). A summary goes to stdout when
the pull finishes. Requests are paced to at most 75 per rolling 60 seconds (start.gg allows 80),
and rate-limit or server errors are retried with backoff (up to 5 tries; start.gg's "recent request
time" budget error waits 90 s between up to 8 tries).

**Exit codes:** `0` all players fetched · `1` finished but some players `failed`, or the pull
stopped partway (resumable) · `2` couldn't start: no token, token rejected, not a start.gg link, or
the tournament or event doesn't exist. On exit `2` no pull folder is created.

## Resume

If a pull is killed or stops partway, each player finished so far is already saved in the new pull's
folder, and the previous pull is still the live one. Finish it with either of:

```
node pull.js --resume out/combo-breaker-2026
node pull.js --resume out/combo-breaker-2026/pull-20261012-153012
```

Players that were already saved aren't fetched again. The resumed pull keeps its original
run time, so the two-year window doesn't move, and it is swapped in when it finishes. Resuming a
finished pull that had `failed` players retries just those players in a new pull folder and swaps
that in. The app's Refresh resumes an unfinished pull of the same ticked events by itself.

## Output

One folder per tournament: `out/<tournament>/`.

| file | contents |
|---|---|
| `current` | One line: the name of the live pull folder. Written atomically once a pull is complete. |
| `pull-<YYYYMMDD-HHMMSS>/` | One pull (local time): `players.csv`, `results.csv`, `meta.json` and `_work/`. The previous pull folder is deleted once a new one is live. |
| `state.json` | What you decided: the tournament's events (from start.gg when you added it), which are ticked, linked side tournaments, `marked_done`, `archived`, and one entry per seed push. The pull never writes it. `pull.js <event link>` ticks events in it (and creates it for a tournament not added yet) without overwriting the app's fields. |
| `set-records.json` | The W-L cache, one entry per player per event (`<player_id>:<event_id>`), shared by every tab and kept across pulls. |
| `schedule.json` | The Schedule tab's data: every player's pools and start times. |
| `standings.json` | Only after *Archive standings*: each ticked event's final placements. |
| `major-table-<game id>.html` | Only if you run `node views/major-table.js out/<tournament> --game <id>`: one game tab as a single HTML file. Derived; safe to delete. |
| `claude-prompt.txt` | Written by `seed.cmd` after a pull: the prompt to paste when handing the files to Claude. Derived; safe to delete. |

In a pull folder:

| file | contents |
|---|---|
| `players.csv` | One row per registrant of any ticked event, **including players with no results**. Columns: `player_id` (the join key; never join on tag), `gamer_tag`, `prefix`, `user_slug` (blank if no start.gg account), `region_state`, `region_country` (from the account's public location; blank if hidden or no account), `result_count`, `history_status`, `team_entry`, `events` (the ticked events they entered, by event slug, separated by `;`). |
| `results.csv` | One row per player per past event, all games, newest first within each player. Columns: `player_id`, `gamer_tag`, `event_date` (YYYY-MM-DD, UTC), `game_id`, `game_name`, `tournament_name`, `event_name`, `event_slug`, `event_id`, `num_entrants`, `placement` (blank if start.gg has none), `is_online`. There is no `is_event_game` column: a tab compares `game_id` with its own game. |
| `meta.json` | The tournament (slug, name, start, timezone), its seeded events (slug, name, game, start, phases), `run_at`, the window, `mode` (`full`, `incremental` or `retry`), counts (registrants, results, `history_status`, `team_entries_split`, `region_coverage`, registrants in two events), `request_count` (every request behind the pull's rows, including the earlier requests that fetched players an incremental or retry pull carried over), `requests_this_pull` (what this pull itself sent; the same as `request_count` for a full pull), `query_complexity_max`, everything skipped (`out_of_window`, `no_event_container`), and `failed_players` with each one's last error. |
| `_work/` | The pull's working state: `run.json` (what a resume needs), `checkpoint.jsonl` (one line per finished player), `requests.jsonl` (one line per request: the time it was sent, query, player, status, complexity, and `queued_ms` when it waited in the app's queue; no token), and the app's W-L request log. You don't need these files for analysis. |

`history_status` means:

- **`complete`**: the player has a start.gg account, and all of their events were read.
- **`limited`**: there's no linked account, so only start.gg's `recentStandings` was available:
  the 20 most recent results in each ticked event's game they entered. This is the most start.gg
  offers for these players.
- **`failed`**: requests for this player kept failing. The error is in
  `meta.json.failed_players`, and the pull exits `1`. `--resume` retries these players.

A pull's three files appear only when every player is `complete`, `limited` or `failed`. They're
written to temporary files and then renamed, with `meta.json` last, and only then does `current`
move to that pull. **The folder `current` names is always a finished pull.**

All CSVs are UTF-8 with a BOM. Every field is quoted, and embedded quotes are doubled. Tags are
written exactly as they appear on start.gg. A tag that starts with `=`, `+`, `-` or `@` is not
escaped, so a spreadsheet may read it as a formula. Import as text if that matters. (The app's two
CSV downloads escape them.)

## Checking a pull

```
node scripts/reconcile.js <pull folder>          # counts agree across the three files
node scripts/reconcile.js <pull folder> --live   # ...and with a fresh registrant count from start.gg
node scripts/check-requests.js <pull folder>     # pacing (max per 60 s), backoffs, resume refetches
node scripts/ground-truth.js <pull folder>       # independent recount for one player + 3 spot checks
node scripts/schema-check.js                     # the design's open schema questions
node scripts/pull-schedule.js <tournament link>  # the Schedule tab's pull, from the command line
```

## Desktop app

The same server, in a window, with no Node on the machine: a Tauri shell (`src-tauri/`) that
spawns a compiled copy of `app/server.js` and points a webview at `http://127.0.0.1:8765/`. The
arrangement is copied from `mbaacc-stream-setup`, where it runs the stream scoreboard.

**Using it in this checkout.** Take the two executables out of `Seeding-Ops-windows.zip` (the
release download, or the artifact of any `release` workflow run) and drop them into the repo:

```
Seeding Ops.exe          the app; launch this, pin this
app/seeding-server.exe   the server it spawns, tucked in with the server code
```

An exe sitting in a project folder serves that folder: `app/server.js` is loaded **live from the
checkout** at launch (the startup line says `server code : live from …`), so server and page edits
apply on the next relaunch and the exes never need rebuilding. Both files are gitignored. The
token comes from `.env` as always; pulls land in `out/`; tiers are `registry/tiers.csv`.

An unzipped copy outside a checkout works the same way with the files in the ZIP: the embedded
server runs against the `app/`, `lib/`, `config/` and `registry/` beside the exe. An installed
copy (the NSIS artifact) can be pointed at a checkout with a `project-path.txt` next to the exe
whose first line is the folder to serve, or `SEEDING_PROJECT` in the environment.

One server at a time: everything wants port 8765. If `npm start` is already running, the window
simply adopts it.

**Releasing.** Builds happen in GitHub Actions (`.github/workflows/release.yml`); no Rust
toolchain is needed locally.

- *Test a build*: Actions → `release` → Run workflow, `publish` unticked. The installer and the
  portable ZIP are kept as run artifacts; nothing reaches the Releases page.
- *Share it*: the same with `publish` ticked. Publishes **one file**, the installer
  (`Seeding-Ops-windows-setup.exe`), under the `tag` input, default `latest`, re-pointed on every
  publish. A new user installs it, opens the app, pastes a start.gg API key, presses Save. The release
  ships an **empty tiers table** (`registry/tiers.template.csv`), never this checkout's.
- *Cut a version*: bump `version` in `package.json`, `src-tauri/tauri.conf.json` and
  `src-tauri/Cargo.toml`, then push a `v*` tag.
- *This checkout*: the portable ZIP (run artifact) holds the two exes to drop in; see above.

`npm run sidecar` compiles the server with Bun into `src-tauri/binaries/` (needed before
`npm run tauri build`; CI does it for you). The app is not code signed: Windows shows
"publisher unknown", choose **More info → Run anyway**.

## Tests

```
node --test
```

The tests run offline against a fake start.gg (`testlib/fake-api.js`). To prove they don't
touch the network:

```
NODE_OPTIONS="--require ./testlib/no-network.js" node --test
```

## Code layout

The start.gg client, the history logic and the output writer are separate modules:

- `lib/startgg.js`: queries, URL parsing, error classification, and a client that paces,
  retries and logs. `lib/pacing.js` holds the arithmetic.
- `lib/history.js`: registrants, the two-year window, and turning start.gg responses into rows.
- `lib/output.js`: CSV/JSON, the pull folder and the `current` pointer, the checkpoint and request
  log, and the final write.
- `lib/run.js`: the pull (fresh, incremental, resume, retry) and the swap. `pull.js` is the command
  line on top.
- `lib/pool.js`: a tournament's folder, `state.json`, the tabs and the computed status.
- `seed.js` / `seed.cmd`: the everyday launcher. It groups pasted links by tournament, runs
  `pull.js` once per tournament, auto-resumes an unfinished pull touched in the last 24 h, writes
  `claude-prompt.txt` into `out/<tournament>/`, and opens the output folder. It adds no fetch logic.
  Set `SEED_NO_OPEN=1` to stop it opening Explorer or Notepad.

The seeding view (increment 2, spec [`docs/design-webapp.md`](docs/design-webapp.md), as changed by
increment 3, [`docs/design-tool.md`](docs/design-tool.md)):

- `lib/view/model.js`: the view's pure logic: series index, grouping, stats, column choice,
  W-L tally, events entered together, and the one seed numbering both outputs use. Runs in Node and
  in the browser.
- `lib/view/render.js`: HTML (and the export's plain text) for every cell and table, and the push's
  dry-run table. Also shared by Node and the browser, so the app and `views/major-table.js` show
  the same cells.
- `lib/view/data.js`: a tab of a tournament pool → the page's JSON; the Sheets and seeds exports;
  the tier/notes and ✓ review writes to `registry/tiers.csv`.
- `lib/view/export.js`: the Google Sheets CSV.
- `lib/view/majors.js`: reads `config/majors.json`, the per-game majors lists.
- `lib/wl.js`: W-L (sets) for result rows through `lib/startgg`'s client, cached in
  `out/<tournament>/set-records.json`.
- `lib/push.js`: the push's dry run and post; the order is `lib/view/model.js` `pushPlan` (shared
  with the page, which redraws an open dry run after a drag). `lib/seeding.js`: the arranged seed
  order per event (`state.json` `seeding`). `lib/tiers-share.js`: one game's tiers out (export) and in
  (the import's review and apply). `lib/schedule.js` and `lib/schedule-pull.js`: the
  Schedule tab's data (moved from `conflicts/`; `conflicts/linked.json` is read once, when a
  tournament is added, for side tournaments linked before increment 3; `conflicts/out/` isn't read).
- `scripts/migrate-tiers.js`: brings `registry/tiers.csv` to the current shape: the T1 migration
  (drops `justification`, adds the two review columns, backfills Eclipse's app-set tiers), then the
  `discriminator` column after `player_id` (build C). Both already run; running it again does
  nothing. It keeps the original as `registry/tiers.csv.bak` (not committed).
- `lib/upload.js`: an uploaded list: the CSV contract, the per-row start.gg user lookup, and the
  rows as the pull's players (`lib/run.js`'s `upload` input). The registry linking is
  `lib/view/data.js` `linkPlayers`, through the same row matcher as the page.
- `app/server.js` (`npm start`, `app.cmd`): the local server; `app/jobs.js` the pull, W-L, schedule
  and archive jobs; `app/queue.js` the one request queue; `app/limit-fetch.js` its ceiling;
  `app/public/` the pages (plain HTML/CSS/JS, no build): `tournament.html` with `tournament.js`
  (header, tabs, picker, lifecycle), `app.js` (a game's tab), `schedule.js` (the Schedule tab).
- `views/major-table.js out/<tournament> [--game <id>]`: one game tab as a single HTML file in
  `out/<tournament>/`, for keeping. It carries your tiers, notes and review marks.
- `scripts/synth-run.js <folder>`: a synthetic 200 × 100 run-shaped folder for load-testing the view
  code.

## Hand this to Claude

Attach `players.csv`, `results.csv` and `meta.json` from the live pull (`out/<tournament>/`, the
folder `current` names), and say something like:

```
These are start.gg results for every registrant of <tournament>'s seeded events, covering the two
years before `meta.json.run_at`. Join on `player_id`. `history_status` = `limited` means the player
has no start.gg account, so we only have their last 20 results per seeded game. `failed` means we
have nothing for them. players.csv `events` lists which seeded events each player entered; a
result is in a seeded game when its `game_id` matches that event's game in meta.json
`seeded_events`. Placement is blank when start.gg has no standing. Using this, <what you want:
seeding tiers, a big-event column, head-to-head notes...>.
```
