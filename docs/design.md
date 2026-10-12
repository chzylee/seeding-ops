# Design: seeding-script — 2 years of results for every registrant, in files Claude can read

Status: APPROVED 2026-10-11 (office hours), **amended 2026-10-12 per Noah** (see the Amendment log)
Origin: `~/.gstack/projects/startgg-results/iknow-master-design-20261011-001946.md`. This file
is now canonical. The origin doc points here.

## What it is

A local script. Give it a start.gg **event** URL. It writes every registrant's tournament results
from the **2 years before the moment it runs**, **all games**, to files. That's all it does.

Organizing, ranking and building views (big-event columns, seeding tiers) happen afterward: Noah
hands the files to Claude. In his words: *"it's easy to make something out of the data, but
getting the data is currently very manual."*

**Priority: reliability over speed.** *"time isnt the problem and effort is."* A run can take 15
minutes. It must not need babysitting, and it must never quietly return incomplete data.

**Direction:** a script now, chosen for simplicity. *"the eventual goal is to migrate beyond this
into a tool."* Keep the start.gg client, the history logic and the output writer as separate
modules so a later tool can reuse them. Don't build that tool now.

## Evidence this works (Q-1 probe, 2026-10-12)

Run against `start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code`
(218 entrants). Script: the session scratchpad `q1-probe.cjs`, reproduced in the build record.

| Question | Result |
|---|---|
| Is `user.events` usable for full history? | **Yes.** GeneralMidwest: 418 lifetime events. 150 fetched, **150/150 in the 2-yr window with `userEntrant.standing.placement`**, across 28 games. |
| Cost | start.gg returns `extensions.queryComplexity` on every response. `user.events` at perPage 50 cost **351**. Nested entrants + `recentStandings` at perPage 5 cost **196**. |
| Ordering | `user.events` is **not** sorted by `startAt` descending. **You must page through to the end; there's no early stop by date.** |
| `recentStandings` | Nesting under `entrants` works. Capped at 20, one game per call. 14 for GeneralMidwest vs 150 via `user.events`. |
| Untested | A registrant with **no linked user** (guest). All 5 sampled had one. |

## Data source

1. **Resolve** `event(slug)` → `id name startAt numEntrants videogame{id name} tournament{name}`.
2. **Registrants:** page `event.entrants` → `participants { player { id gamerTag prefix user { id slug
   location { state country } } } }`. `User.location` is "Public location info for this user",
   type `Address` ([User](https://developer.start.gg/reference/user.doc.html),
   [Address](https://developer.start.gg/reference/address.doc.html)). **Never request `city`**:
   Noah wants state/province and country only. A missing or hidden location is a blank value,
   not an error.
   This query is cheap and needs no nested history. Size the page from `queryComplexity`.
3. **History, for registrants with a linked `user`** (the primary path): page
   `user(id).events(query:{page, perPage})` to the **last page** → `id slug name startAt numEntrants
   isOnline videogame{id name} tournament{name} userEntrant(userId){ standing{ placement } }`.
   Keep events with `startAt` in `[runTime − 730 days, runTime]`.
   - Use the largest `perPage` whose `queryComplexity` stays under 1000. The probe suggests ~140.
     Check what start.gg actually allows.
   - **To check:** whether `UserEventsPaginationQuery.filter` supports a date or `past` filter.
     If it does and the result matches unfiltered paging, use it to cut requests. If not, page
     everything.
4. **History, for registrants with no linked user** (fallback): `player.recentStandings(limit: 20)`
   for **each game** we can identify. At minimum the input event's game. If `videogameId` is
   optional, call it without one. Mark these players `limited`. We can't get more than this from
   start.gg for them.

## Output — `out/<tournament-slug>__<event-slug>__<YYYYMMDD-HHMM>/`

**`players.csv`**: one row per registrant participant, **including players with zero results**.

| column | meaning |
|---|---|
| `player_id` | `Player.id`, the join key. Never join on tag. |
| `gamer_tag`, `prefix` | as on start.gg |
| `user_slug` | empty if there's no linked account |
| `region_state` | `User.location.state` (state/province). Blank if not public, or if there's no account. |
| `region_country` | `User.location.country`. Blank if not public, or if there's no account. |
| `result_count` | rows in `results.csv` for this player |
| `history_status` | `complete` (`user.events` fully paged), `limited` (no linked user, `recentStandings` only), or `failed` (retries exhausted, see `meta.json`) |
| `team_entry` | `true` if this came from an entrant with more than one participant. Each participant gets its own row. |

**`results.csv`**: one row per (player, past event). Long form.

| column | meaning |
|---|---|
| `player_id`, `gamer_tag` | join back to `players.csv` |
| `event_date` | `startAt` as YYYY-MM-DD |
| `game_id`, `game_name` | the past event's game |
| `is_event_game` | `true` if the game matches the input event's game |
| `tournament_name`, `event_name`, `event_slug`, `event_id` | identity |
| `num_entrants` | field size |
| `placement` | blank if start.gg has none (not started yet, or no standing) |
| `is_online` | boolean |

**`meta.json`**: input URL, event identity and game, `run_at`, window start and end, registrant
count, result count, counts by `history_status`, `team_entries_split`, request count, the
`queryComplexity` max seen, and **separate** counts of everything skipped:
`{ out_of_window, no_event_container }`, plus `region_coverage: { with_state, with_country,
neither }`. Nothing is dropped without being counted.

All CSVs: UTF-8 with a BOM, every field quoted, embedded `"` doubled.

## Reliability requirements

- **Token:** read from the `STARTGG_TOKEN` environment variable, which a gitignored `.env` in the
  repo root may supply. Commit `.env.example`. **Never** hard-code a path to the token, print it,
  log it, or write it to an output file. A missing or invalid token → a plain message, exit code 2,
  no output folder. This mirrors how a cloud runtime injects secrets, so the move to a hosted tool
  is just a config change.
- **Pacing:** at most 75 requests per rolling 60 s (start.gg's limit is 80).
- **Retries:** on a rate-limit or 5xx response, exponential backoff, up to 5 tries per request.
  On a bad token, a bad slug or a GraphQL schema error, stop the run immediately.
- **Resumable:** save each finished player's history to a checkpoint under the run folder as soon
  as it completes. Re-running with `--resume <run-folder>` skips players already done. **A killed
  run must be finishable without refetching.**
- **No fake-complete output:** the three output files are written only once every player is
  `complete`, `limited` or `failed`. Write them to temp files, then rename. A player that ends
  `failed` is listed in `meta.json` with its last error. The run exits non-zero if any failed.
- **Progress** goes to stderr (`player 41/218 · page 3/9`). The summary goes to stdout.
- **No dependencies** beyond Node 24 built-ins (built-in `fetch`, `node --test`), unless the
  build record justifies one.

## Out of scope

Views, rankings and seeding logic. Writing back to start.gg. A UI or hosting. The Google Sheets
API. Fetching big events' full standings (the deferred "majors" fetch).

## Reuse

`C:\Users\iknow\repos\startgg-results\core.js` has a tested `parseEventSlug` and error
classification (`classifyError`; per its comments, a bad token returns HTTP **400**, not 401).
**Review before copying.** Copy what holds up into this repo and credit the source. Don't import
across repos.

## Acceptance (the build is done when all hold)

See `docs/dispatch-contract.md` §Acceptance. That list is binding.

## Amendment log

- **2026-10-12 (Noah, chat):** standalone repo `seeding-script`, not `startgg-results/pull`. Token
  read from the environment, not from a path in code. Window **2 years back from execution time**,
  replacing "12 months before the event start" (2026-10-11), which had replaced the 3-calendar-year
  window (OWNER-2026-08-30c). **All games**, with the event's game flagged, replacing "same game
  only". The Q-1 probe made `user.events` the primary source and `recentStandings` the fallback.
- **2026-10-12, later (Noah, chat, mid-pass-1):** add region. Store **state/province and country**
  from `User.location`, never city. New `players.csv` columns `region_state` and `region_country`,
  and `meta.json.region_coverage`. Whether start.gg returns it for other users with a personal
  token is **unverified**. Pass 1 checks this on the live run and records the coverage it finds.
