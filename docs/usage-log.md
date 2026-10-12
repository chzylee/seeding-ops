# Usage log — seeding with the MVP

> **What this is:** a running record of using `seeding-script` to seed real events. It records the
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
| Upcoming event 1 | week of 2026-10-19 | *(add)* | Planned | *(add)* |
| Upcoming event 2 | week of 2026-10-19 | *(add)* | Planned | *(add)* |

## Entries

### Baseline — Chicago regional (manual)

Fill this in while it's fresh. It's what the tool is being measured against.

- **How I seeded it:** *(what I opened, what I clicked through per player)*
- **Time it took:** *(rough)*
- **Hardest players to place, and why:**
- **What I wished I could see:**

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
