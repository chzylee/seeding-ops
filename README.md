# seeding-script

## Quick start (seeding a bracket)

**One-time setup**

1. Install **Node 24+** from <https://nodejs.org>.
2. Open `.env` in this folder and paste your start.gg token after `STARTGG_TOKEN=`, then save.
   Get a token at <https://start.gg/admin/profile/developer>. If you skip this, the launcher
   opens `.env` in Notepad for you.

**Every time**

1. **Double-click `seed.cmd`.** From a terminal, `npm run seed` does the same thing.
2. **Paste the event links,** one per line. Paste all of this week's brackets at once if you
   like. Press **Enter on an empty line** to start. Links must contain `/event/`.
3. **Walk away.** Each event takes a few minutes and they run one after another. When they're
   done, the results folder opens by itself.
4. **Hand the files to Claude.** In each event's folder, attach `players.csv`, `results.csv` and
   `meta.json`, then paste `claude-prompt.txt` with the last line filled in: what you want
   (tiers, big-event columns, regions...).

**If it stops partway** (laptop sleeps, Wi-Fi drops, you close the window), double-click
`seed.cmd` again and paste the same link. It picks up where it left off, as long as that's
within 24 hours. Players already fetched aren't fetched again.

**What the summary means:** `done` = all good · `stopped or some players failed` = run it
again to resume · `could not start` = read the message (usually the token or a bad link).

Log how each seeding session goes in [`docs/usage-log.md`](docs/usage-log.md).

---

## Reference

Give it a start.gg **event** URL. It writes every registrant's tournament results from the
**two years before the moment it runs**, in **all games**, to three files. It doesn't rank
or seed anything. That happens afterward: you hand the files to Claude (see the end of this
README).

A run takes a few minutes for a ~200-player event. Nobody needs to watch it. It never hands back
incomplete data as if it were complete: either the three files appear, or they don't and the
run can be resumed.

The binding spec is [`docs/design.md`](docs/design.md).

## Setup

1. **Node 24 or newer.** Check with `node --version`. There are no packages to install.
2. **Paste your start.gg token into `.env`.** The `.env` file in this folder already has an empty
   `STARTGG_TOKEN=` line. Paste your token right after the `=` and save. If the file isn't
   there, copy `.env.example` to `.env` first.
   - Get a token at <https://start.gg/admin/profile/developer> (Personal Access Tokens).
   - `.env` is gitignored. The script only reads it. It never prints the token, logs it or
     writes it into any output.
   - A `STARTGG_TOKEN` environment variable, if set, takes priority over `.env`.

## Run

```
node pull.js https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code
```

Any event URL works: with or without `https://`, with trailing parts like `/overview`, or the
bare `tournament/<t>/event/<e>` slug.

Progress goes to stderr (`player 41/218 · page 2/3 · SomeTag`). A summary goes to stdout when
the run finishes. Requests are paced to at most 75 per rolling 60 seconds (start.gg allows 80),
and rate-limit or server errors are retried with backoff (up to 5 tries).

**Exit codes:** `0` all players fetched · `1` finished but some players `failed`, or the run
stopped partway (resumable) · `2` couldn't start: no token, token rejected, not an event URL, or
the event doesn't exist. On exit `2` no output folder is created.

## Resume

If a run is killed or stops partway, each player finished so far is already saved in the run
folder. Finish it with:

```
node pull.js --resume out/combo-breaker-2026__melty-blood-actress-again-current-code__20261012-1530
```

Players that were already saved aren't fetched again. The resumed run keeps the original
run time, so the two-year window doesn't move. Resuming a finished run that had `failed`
players retries just those players and rewrites the files.

## Output

Each run writes one folder: `out/<tournament>__<event>__<YYYYMMDD-HHMM>/` (local time).

| file | contents |
|---|---|
| `players.csv` | One row per registrant, **including players with no results**. Columns: `player_id` (the join key; never join on tag), `gamer_tag`, `prefix`, `user_slug` (blank if no start.gg account), `region_state`, `region_country` (from the account's public location; blank if hidden or no account), `result_count`, `history_status`, `team_entry`. |
| `results.csv` | One row per player per past event, newest first within each player. Columns: `player_id`, `gamer_tag`, `event_date` (YYYY-MM-DD, UTC), `game_id`, `game_name`, `is_event_game` (`true` if same game as the input event), `tournament_name`, `event_name`, `event_slug`, `event_id`, `num_entrants`, `placement` (blank if start.gg has none), `is_online`. |
| `meta.json` | The input URL, the event and its game, `run_at`, the window, counts (registrants, results, `history_status`, `team_entries_split`, `region_coverage`), `request_count`, `query_complexity_max`, everything skipped (`out_of_window`, `no_event_container`), and `failed_players` with each one's last error. |
| `_work/` | The run's working state: `run.json` (what a resume needs), `checkpoint.jsonl` (one line per finished player), `requests.jsonl` (one line per request: time, query, player, status, complexity; no token). You don't need these files for analysis. |

`history_status` means:

- **`complete`**: the player has a start.gg account, and all of their events were read.
- **`limited`**: there's no linked account, so only start.gg's `recentStandings` was available.
  That covers the 20 most recent results in this event's game. This is the most start.gg offers
  for these players.
- **`failed`**: requests for this player kept failing (5 tries). The error is in
  `meta.json.failed_players`, and the run exits `1`. `--resume` retries these players.

The three files appear only when every player is `complete`, `limited` or `failed`. They're
written to temporary files and then renamed, with `meta.json` last. **If `meta.json` exists,
the run finished.**

All CSVs are UTF-8 with a BOM. Every field is quoted, and embedded quotes are doubled. Tags are
written exactly as they appear on start.gg. A tag that starts with `=`, `+`, `-` or `@` is not
escaped, so a spreadsheet may read it as a formula. Import as text if that matters.

## Checking a run

```
node scripts/reconcile.js <run folder>          # counts agree across the three files
node scripts/reconcile.js <run folder> --live   # ...and with a fresh registrant count from start.gg
node scripts/check-requests.js <run folder>     # pacing (max per 60 s), backoffs, resume refetches
node scripts/ground-truth.js <run folder>       # independent recount for one player + 3 spot checks
node scripts/schema-check.js                    # the design's open schema questions
```

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

The start.gg client, the history logic and the output writer are separate modules, so a later
tool can reuse them:

- `lib/startgg.js`: queries, URL parsing, error classification, and a client that paces,
  retries and logs. `lib/pacing.js` holds the arithmetic.
- `lib/history.js`: registrants, the two-year window, and turning start.gg responses into rows.
- `lib/output.js`: CSV/JSON, the run folder, the checkpoint and request log, and the final
  write.
- `lib/run.js`: the orchestrator (fresh run and resume). `pull.js` is the command line on top.
- `seed.js` / `seed.cmd`: the everyday launcher. It runs `pull.js` once per pasted link,
  auto-resumes an unfinished run of the same event touched in the last 24 h, writes
  `claude-prompt.txt` into each finished run folder, and opens the output folder. It adds no
  fetch logic. Set `SEED_NO_OPEN=1` to stop it opening Explorer or Notepad.

## Hand this to Claude

Attach `players.csv`, `results.csv` and `meta.json` from one run folder, and say something like:

```
These are start.gg results for every registrant of <event>, covering the two years before
`meta.json.run_at`. Join on `player_id`. `history_status` = `limited` means the player has no
start.gg account, so we only have their last 20 results in this game. `failed` means we have
nothing for them. `is_event_game` marks results in this event's game. Placement is blank
when start.gg has no standing. Using this, <what you want: seeding tiers, a big-event
column, head-to-head notes...>.
```
