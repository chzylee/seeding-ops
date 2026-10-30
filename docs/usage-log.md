# Usage log — seeding with the MVP

> **What this is:** a running record of using `seeding-ops` (named `seeding-script` until 2026-10-29) to seed real events. It records the
> pull, the transformations Noah asks Claude for, what drove each seeding decision, and where it
> hurt. **This log shapes the eventual tool**: requirements come from what actually happens here,
> not from guesses. Entries are Noah's observations unless marked *(Claude)*. Interpretations are
> marked *(Interpretation)*. This file is maintained by seeding sessions, not by the build.

## Overview

| | |
|---|---|
| **Stage** | MVP: barebones on purpose. The script gets the data, and Noah directs Claude to transform it. |
| **The script's job** | Every registrant's results from the last 2 years, all games, plus state/province and country → `players.csv`, `results.csv`, `meta.json`. See [design.md](design.md). |
| **Claude's job (manual, per event)** | Turn those files into whatever view the seeding needs that day. |
| **Reusable output** | A player registry (tag → tier, region, notes) that carries over between events. See [Player registry](#player-registry). |
| **Where requirements go** | [Requirements surfaced](#requirements-surfaced). Every entry should add to it or confirm a row. |

## Workflow v0

1. **Pull:** `node pull.js <event-url>` (see the README once pass 1 lands).
2. **Hand it to Claude:** give it the run folder and ask for a view. Record the exact prompt below.
3. **Transform:** iterate until the view supports seeding decisions. Record what worked and what
   didn't.
4. **Seed:** decide, then enter the seeding in start.gg. Record what drove the close calls.
5. **Update the registry:** tiers, region fixes and notes for players seen this event.

## Events

| Event | Date | Link | Tool used? | Entry |
|---|---|---|---|---|
| Chicago regional | last week (before 2026-10-12) | *(add)* | **No.** Seeded by hand. This is the baseline. | [Baseline](#baseline--chicago-regional-manual) |
| Crescendo of Night 3 — Episode 0 · Allegro (MBTL) - PC | 2026-10-14 | [link](https://www.start.gg/tournament/crescendo-of-night-3-episode-0/event/allegro-mbtl-pc) | **Yes.** 22 players. | [Entry](#crescendo-of-night-3--episode-0--allegro-mbtl-pc--2026-10-14) |
| Crescendo of Night 3 — Episode 0 · Andante (UNI2) - PC | 2026-10-13 | [link](https://www.start.gg/tournament/crescendo-of-night-3-episode-0/event/andante-uni2-pc) | **Yes.** First real run. | [Entry](#crescendo-of-night-3--episode-0--andante-uni2-pc--2026-10-13) |
| Upcoming event 1 | week of 2026-10-19 | *(add)* | Planned | *(add)* |
| Upcoming event 2 | week of 2026-10-19 | *(add)* | Planned | *(add)* |

## Entries

### Baseline — Chicago regional (manual)

Fill this in while it's fresh. It's what the tool is being measured against.

- **How I seeded it:** *(what I opened, what I clicked through per player)*
- **Time it took:** *(rough)*
- **Hardest players to place, and why:**
- **What I wished I could see:**

### Crescendo of Night 3 — Episode 0 · Allegro (MBTL) - PC — 2026-10-14

**Pull** *(Claude ran it; Noah's link; "the event for today")*
- Run folder: `out/crescendo-of-night-3-episode-0__allegro-mbtl-pc__20261014-1833`
- 22 registrants · 1,939 results (1,246 MBTL) · 22 complete · 42 requests, max 34 in any 60 s ·
  about 1 minute · `reconcile.js`: all 17 checks passed
- Nothing broke in the pull.

**Friction: W-L is the slow part** *(Claude)*
- W-L for 1,246 MBTL results took **~20 min**. start.gg answers each set query in ~3 s, and that
  latency is the limit, not the 80/min cap: one-at-a-time ≈ 50 events/min; 4 events per request ≈ 70/min;
  3 requests in flight ≈ 52/min (latency rose with concurrency). What helped was **fetching the
  summary-column results first**, so the summary completes in ~8 min.
- Strengthens the "set-level W-L in the pull" requirement: done there, it can run unattended
  overnight or right after registration closes, not on seeding day.

**View changes made for this event** *(Noah: "lets keep making the view better so i can use it for today")*
- Summary columns are now **the series the most registrants share**, in the ratified BBB format:
  Blood Moon (19 of 22), KIRBO CUP PLUS (16), Melty Sweep (15), Lunar Exam (12), Blue Glass Mingle (11),
  Crescendo of Night (11). Majors only shown if someone played them (Evo hidden here).
- Series are grouped once across the whole run, so a series is the same column for everyone.
  Fixed: "Blood Moon LX"-style roman numerals and `<…>` notes split series apart (11 → 19 players).
- Rows are alphabetical until seeds exist in `notes.json`. Player column stays visible on sideways scroll.

### Crescendo of Night 3 — Episode 0 · Andante (UNI2) - PC — 2026-10-13

**Pull** *(Claude ran it; Noah's link)*
- Run folder: `out/crescendo-of-night-3-episode-0__andante-uni2-pc__20261013-1739`, via `node seed.js <link>`
- 5 registrants · 308 results (2024-10-13..2026-10-13) · 5 complete, 0 limited, 0 failed · 10 requests,
  max queryComplexity 840, max 10 requests in any 60 s, 0 backoffs · exit 0
- Region coverage: 2 with state, 4 with country, 1 with neither
- `scripts/reconcile.js --live`: all 19 checks passed (fresh API registrant count 5 = 5).
  `check-requests.js`: PASS.
- Nothing broke. **Two players show 0 results while marked `complete`** (TaimRW9, Meezz). Checked
  directly: start.gg has **0 sets ever** for both, and `recentStandings` is null. Their only
  tournaments are registrations (tonight's; Meezz also "Freaky Frosty October!" with no sets).
  **Confirmed: `user.events` lists only events actually competed in.** The zero is genuine.

**Transformations asked of Claude**
| Prompt (verbatim) | What it produced | Useful? | Keep as a standard view? |
|---|---|---|---|
| "give me a table of everyone's results and summarize patterns in a notes column" | Per-player table: region, 2-yr volume, event-game volume, best majors, recent form, shared-event comparisons, notes | *(Noah to rate)* | *(Noah)* |
| "would it be easier for you to edit a table with a web view … add columns for results from these events if applicable: CEO, EVO, Combo Breaker, Frosty Faustings, Climax of Night · give me best placement, and best and average win-loss record from Boston blue beat events as well. then list other results in separate column" | `views/major-table.js` → `<run>/views/major-table.html`, served by `views/serve.js` at http://localhost:8765. One column per major (this game, main bracket = largest field, others marked "side"); BBB best placement + best and average set W-L (33 set lookups, cached in `views/bbb-records.json`); other results with expandable lists by game; notes from `views/notes.json` | *(Noah to rate)* | Likely: a "named majors + home series" view seems reusable per game |

**Seeding:** *(Noah to fill in after the event: close calls and what decided them)*

**Data observations** *(Claude)*
- Blank placements were all **ladder** events (e.g. "UNI2BL Monthly Ladder #21", `-/35`): real
  participation with no final standing. That supports keeping blank-placement rows.
- One tournament can hold **several brackets in the same game** (Frosty Faustings XVIII ×2, TNS #35 ×2
  on the same date). Views must show `event_name`, or a side bracket looks like a second tournament.
- Comparing players at shared events gives rough head-to-head signal, but it's **placement at the
  same event, not actual sets**.

### Entry template (copy for each event)

```markdown
### <Event name> — <YYYY-MM-DD>

**Pull**
- Command / run folder:
- Registrants · results · status counts (complete / limited / failed):
- Region coverage (with state / with country / neither):
- Anything that broke or needed babysitting:

**Transformations asked of Claude**
| Prompt (verbatim) | What it produced | Useful? | Keep as a standard view? |
|---|---|---|---|

**Seeding**
- Close calls and what decided them (result / H2H / region / scene knowledge / gut):
- Data I wanted but didn't have:

**Friction:** manual steps that should be automated next time:

**Registry updates:** players added or changed:

**Requirements surfaced:** add rows to the table below.
```

## Player registry

**Intent (Noah, 2026-10-12):** a reusable list of player tags with **tier, region and notes**, so
each event builds on the last rather than starting over.

**Convention v0** *(proposal, amendable; not built by the script)*: `registry/players.csv`

| column | filled by | notes |
|---|---|---|
| `player_id` | pull | start.gg `Player.id`, the join key. Tags change, IDs don't. |
| `gamer_tag` | pull | latest seen |
| `tier` | Noah, Claude-assisted | **Tier definitions are open.** Noah defines them. |
| `region_state` | pull, Noah can override | state/province only, never city |
| `region_country` | pull, Noah can override | |
| `notes` | Noah | free text |
| `last_reviewed` | Noah | YYYY-MM-DD |
| `source_event` | session | the event where the row was last updated |

Open: **what the tiers are**, and whether the registry is per game or across games.

## Requirements surfaced

Candidate requirements for the eventual tool. A row goes from **candidate** to **ratified** only
when Noah rules on it.

| Requirement | Surfaced | Evidence | Status |
|---|---|---|---|
| Fetch 2 years of results for every registrant, all games | 2026-10-12 | Noah: *"getting the data is currently very manual"* | In v1 build |
| Region as state/province and country, never city | 2026-10-12 | Noah's direct ask | In v1 build (amendment) |
| Results for other games available, with the event's game flagged | 2026-10-12 | Noah: *"sometimes those are helpful, but making sense of those results is more nuanced"* | In v1 build |
| Reusable player registry: tag → tier, region, notes | 2026-10-12 | Noah's direct ask | Candidate (manual v0) |
| Token supplied outside code, as an env var | 2026-10-12 | Noah: *"similar to how token would not be read directly from code in a cloud env"* | In v1 build |
| Distinguish "complete, no start.gg history" from "complete with history" (e.g. a `no_history` flag, or a note in the prompt file) | 2026-10-13 | CoN3 Ep0: 2 of 5 players had 0 sets ever on start.gg | Candidate |
| Real head-to-head (sets between registrants), not just placement at shared events | 2026-10-13 | CoN3 Ep0 analysis relied on shared-event placements | Candidate |
| Standard views always show `event_name` alongside `tournament_name` | 2026-10-13 | Side brackets (Frosty Faustings XVIII ×2, TNS #35 ×2) | Candidate |
| **Problem statement — tier maintenance** (next increment). The seeding sheet already tiers most players and sorts by tier. The tool's value is (a) tiering players not yet in the sheet, (b) updating tiers that have gone stale, (c) keeping a **justification** per tier. Today all three are manual and justifications mostly aren't kept. | 2026-10-15 | Noah: *"it makes it easier for me to determine tiers for the players i dont yet have … the annoying part … is that i have to update the tiers for some players i have recorded, store tiers for new ones, and ideally have the justification for those tiers as well."* | **Stated by Noah**; shape TBD after the Eclipse manual pass |
| **The work, as Noah breaks it down.** *Profiling (initial work):* look over results → profile a player → assign a tier. *Seeding an event:* arrange players → adjust tiers → look at data for tie-breakers between players who may be close. "That's what I use data and notes for after initial work." | 2026-10-15 | Noah: *"the general tasks are looking over results, profiling a player, assigning a tier / then when seeding an event, it's arranging players, adjusting tiers, looking at data for tie-breakers to compare players who may be close"* | **Stated by Noah**. Frames the tiers increment: profiling = needs-tier filter + evidence + justification; seeding = tier order + compare for close calls |
| **Tiers table as Noah's database** (`registry/tiers.csv`, separate from the All Players/Seeds sheet): player_id, tags, tier, justification, decided_on, source, plus the sheet's region/placements/notes carried over. Seeded once from his sheet export (653 rows; 123 linked to a start.gg player_id via Eclipse). The app shows a Tier column (frozen with Player), sorts by tier like his sheet filter, has a "Needs tier only" toggle, and shows sheet notes in Notes. | 2026-10-15 | Noah: *"one table for players to tiers, another table from players to results/notes"*; *"i should also be able to import to google sheets"* | **Built (read-only, out-of-band)**. Tier/justification editing in the app = next |
| Tier and notes **editable in place** (spreadsheet conventions), **sortable summary columns**, **compare by selecting rows** with type-a-tag-to-jump | 2026-10-15 | Noah: *"notes and tier should be editable preferably on double click or whatever standard best practices"*; *"sorting columns would also be great"*; *"rather than typing tag to compare, selecting rows maybe with typing tag to jump there … better visual and control and reliability"* | **Built** (59a21b0), verified live |
| Compare **up to 3** selected rows; no automatic overwrite (other boxes grey out at the cap); ✕ per player and **Clear** in the compare bar | 2026-10-15 | Noah: *"up to 3 selectable and include the button in the comparison tab to deselect instead of automatically overwriting … buttons can grey out … comparison tab can also have a clear button"* | **Built**, verified live |
| Column order **Team | Player | Region | Tier ‖ …** (team tag in its own column; freeze edge after Tier); **Other games** its own column before **Notes** | 2026-10-15 | Noah: *"team tag goes before the player tag and can go in its own column … move the part that freezes the first column to be after tier, and move region before tier"*; *"have other games as its own column before notes"* | **Built**, verified live |
| **Show team** toggle: a checkbox after "Needs tier only" hides or shows the Team column in the table and the compare panel, remembered per viewer. Compare widths now come from visible columns only. | 2026-10-15 | Noah: *"make showing team column toggle-able. it can be a check box after needs tier only"* | **Built** (7f7c556, out-of-band), verified live; recorded here after pass 4's A4-6 |
| **Other series (this game)** column: every series of the event's game not already shown as a major or shared-series column. Collapsed to series names (largest field first); expands to series > best placement · W-L, best W-L, avg W-L, date of best. Sorts by best placement / field size; included in the Sheets export. Sits before Other games. | 2026-10-16 | Noah: *"include a column for results for the game outside of just the specific events"* | **Built** (out-of-band after the pass-6 approval, recorded per proposed rule (a)); verified live; header/row parity test passes |
| **Seeded** column: leftmost, always frozen; a ✓ button per row toggles a green "seeded" highlight; header click sorts seeded/unseeded together. State is per event, per viewer (localStorage), surviving reloads and Refresh. | 2026-10-16 | Noah: *"add a column on the left with a button i can click to highlight the row green to mark it as seeded"* | **Built** (out-of-band, recorded per proposed rule (a)); verified live; parity test extended (column keys must match app vs CLI except the app-only Seeded) |
| **Handle start.gg's server-time budget**, not just the 80/min count. Live error: *"You have gone over the threshold for recent request time. Please wait before sending another request."* Hit after ~45 heavy batched set requests with 3 in flight (Eclipse, other-game W-L). 5 short retries didn't clear it. The workaround in the frozen copy was 1 in flight plus a 90 s wait on this error. `lib/wl.js` / the app's refresh need the same (or adaptive) handling. | 2026-10-15 | Observed live, Eclipse `--all-games` fetch | **Bug-class requirement**, for pass 2/3 of the webapp build |
| Notes column with other-game results: game → series → best placement / entrants, best W-L, average W-L, date of best placement | 2026-10-15 | Noah: *"i want a notes column that also includes results from other games … organizing by game, then by event series, then best placement out of entrants, best win-loss, average win-loss, and the date of the best placement."* | **Ratified** (direct ask) |
| **Per result, show: event name, placement out of entrants, W-L.** Date is secondary. | 2026-10-14 | Noah: *"most important results info is the event name, placement out of entrants, and win-loss record. the date is secondary"* | **Ratified** |
| **No aggregate counts** (number of results, wins, top-3s). Placements only mean something relative to the event. | 2026-10-14 | Noah: *"total wins is entirely irrelevant … '81 top 3' holds 0 value"* | **Ratified** |
| **Characterize every event series** by best placement (with W-L), best W-L, average W-L. No series total. | 2026-10-14 | Noah: *"all event series should be characterized this way … i care about this kind of data per event series"* (on the BBB column) | **Ratified** |
| Tables, not bullets, for result lists | 2026-10-14 | Noah: *"organizing in bullets like this is basically unreadable"* | **Ratified** |
| Series identity from start.gg (league / series metadata) instead of name heuristics | 2026-10-14 | The view infers series from normalized names; misses like "ParagOnline UNI2" vs "ParagOnline UNDER NIGHT…" | Candidate |
| **Set-level W-L in the pull** (sets won and lost per event, DQs excluded), so views don't need their own fetch | 2026-10-13 | BBB W-L view needed 33 extra set lookups at view time | Candidate |
| Configurable "named majors" and "home series" per game (regex on tournament name) | 2026-10-13 | CEO/Evo/CB/FF/Climax of Night + Boston Blue Beat for UNI2 | Candidate |
| A browser view of the seeding table (not markdown) | 2026-10-13 | Noah: *"would it be easier … with a web view"*; ~10 columns + long lists | Candidate (built as a view script) |
| **Justification field removed.** The tier editor no longer asks for a reason. | 2026-10-28 | Noah: *"not needing elaboration. results speak for themselves. notes are for clarifying details"* | **Ratified** (design-tool.md premise 4); **Built** (build A, 2026-10-29) |
| **The Seeded ✓ is the review mark**: it writes `last_reviewed_on` and `last_reviewed_tournament` to `registry/tiers.csv` (no more browser-only state); the Tier cell is colored by recency with the date and tournament on hover; a same-day undo restores what the ✓ replaced (within one page load; the reload case is Noah's open ruling B4-1). | 2026-10-28 | Noah: *"recording when player was last seeded is helpful too … when player was last reviewed with intent"* | **Ratified** (premises 2, 7); **Built** (build A) |
| **Majors are per game**: a known-major column only where the seeded game was a main event (side / community / 2v2 / teams / "Pre-" excluded), one result per year; game-specific majors (Climax of Night, Eclipse for MBAACC; Climax of Night for MBTL by rule 6's field test) from one config list per game (`config/majors.json`). CEO drops off the Eclipse table (all its MBAACC results were Community Tournaments). | 2026-10-28 | Noah: *"results from big events like frosty faustings were in the frosty faustings column for all games"*; the rule set he gave | **Ratified** (display rules 5–9); **Built** (build A) |
| **Only tiers persist; results are banked per tournament** until Noah deletes it (optional standings archive); one pull per tournament, one page per tournament with a tab per game plus a Schedule tab; tiers go to start.gg by API optionally, never asserted beyond tiers. | 2026-10-28 | Noah, office hours 2026-10-28 (design-tool.md) | **Ratified**; **Built** (build B, closed 2026-10-29 APPROVE WITH NOTES) |
| **"Mark live again"**: the undo for Mark done on the tournament page (a fourth lifecycle control beyond the spec's three). | 2026-10-29 | Built by build B pass 1; auditor D2-4 flagged it as beyond the contract; orchestrator kept it as the undo an override needs | Candidate (Noah to ratify or remove) |
| **Standing rule candidate: "nothing a click asked for is dropped quietly."** A pull the user asked for (tick during a job, first Pull while another tournament is busy, a queued pull across a restart) is either run or reported, never lost; the list of pulls owed derives from state.json and the live pull, not from memory. | 2026-10-29 | Build B pass 4 D4-3: the same failure shape found three times (D2-1 fixed, D4-1 and D4-2 open) | Candidate (Noah to ratify) |
| **The start.gg player id is the identity; the tag is the display name.** In `registry/tiers.csv` a row without a `player_id` is provisional (matched by tag until something resolves the id); the id, once known, wins over the tag. 182 of 712 rows carry an id today. | 2026-10-30 | Noah: *"the source of truth associating tag with tier should also record startgg id. that is the true identifier for someone and their tag is the display name"* | **Ratified** |
| **CSV upload of tag + start.gg discriminator** (the `abcd1234` code in a profile URL is the id of interest; the numeric player id stays the internal join key and is resolved from it): (a) as a registry operation that links tag-only tiers rows to ids; (b) as a way to build a tournament page from a player list with no start.gg event behind it (one game chosen at upload; no push, no schedule). The API resolves the other identifier; the page shows the current start.gg tag and keeps the CSV tag as an alias. | 2026-10-30 | Noah: *"the id im referring to is that discriminator like abcd1234. that's the id of interest"*; *"support an upload of csv with gamertag and startgg id/discriminator … look up results for all players by their id and then associate with and display the tag"* | Candidate (shape pending Noah's answers on the CSV source and the page) |
| **Past events stay, in the archived/done section; no sandbox mode.** Data size is not a concern (a pool is a few MB). Old per-event pulls (Eclipse, both Crescendo events) imported into the pool layout offline by `scripts/import-legacy.js`, with their W-L caches and the Eclipse schedule pulls. Manual delete when wanted. | 2026-10-30 | Noah: *"rather than a separate launcher … better to just put past events in archived section and let them be manually deleted if necessary"* | **Ratified**; **Built** (import run 2026-10-30) |
| **CSV upload contract:** two columns, name then discriminator (the bare `abcd1234` code), column names irrelevant. A header row is expected but not required: if the first value of the second column is itself a discriminator, there is no header. First real file: Mixfest 26 MBAACC Seeding (32 players, names carry start.gg's "Team | tag" prefix form). | 2026-10-30 | Noah: *"the contract should just be 2 columns of name/discriminator, expecting a header but not requiring (determined by checking if first value of the 2nd column is just discriminator)"* | **Ratified** (contract); upload itself not built |
| **Match by id first, then by tag; a tag-only match is highlighted** (grey or light blue on the Tier cell) so inferred links are visible. | 2026-10-30 | Noah: *"match should first be by id and if not then try tag only and we should use color highlighting to indicate these things"* | **Ratified** (design-tool.md A1.2); build C |
| **Home page shows the source of each tournament**: a start.gg badge in start.gg blue with small "start.gg" text for link-added tournaments, an upload badge for CSV pages. | 2026-10-30 | Noah: *"on the home screen should have some indication if it was by upload or startgg maybe a startgg blue and a small text that says startgg"* | **Ratified** (A1.4); build C |
| **CSV page shape**: its own tournament page, named at upload, one tab for a game picked at upload; no push, no Schedule; names split into prefix and tag. | 2026-10-30 | Orchestrator default stated 2026-10-30; Noah answered with the matching and badge rules (*"good call"* on the prefix split) | **Default, amendable** (A1.3) |
