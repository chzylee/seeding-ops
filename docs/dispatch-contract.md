# Dispatch contract — seeding-script v1 (Engineering team)

Issued 2026-10-12 by the session that ran office hours, on Noah's instruction:
*"let's use the engineering team in ~/repos/personal-staff to build this."*
Team: `personal-staff/personas/TEAMS.md` §Engineering team. Owner **lead-engineer** (Manager),
auditor **engineering-auditor** (report-only Worker). Persona profile blocks: the fenced block under
"Profile block" in `personal-staff/personas/library/<slug>.md`.

```
DISPATCH
- Directive: "if we can reliably automate getting all results data from past 2 years from
  execution time for all players in an event and storing that data in an organized way in a
  file, that would be the ideal for this mvp." / "we should still follow good practice of
  having token somewhere i can paste outside of the code itself" / "i'm choosing script for
  simplicity, but the eventual goal is to migrate beyond this into a tool." / "if something is
  built already, it can be reviewed."
- Surfaces: C:\Users\iknow\repos\seeding-script (read/write) · C:\Users\iknow\repos\startgg-results
  (READ-ONLY: review and copy) · docs/design.md (the binding spec)
- Term: work scope = the Acceptance list below · pass cap: 4 passes + at most ONE extra
  repair/re-review pair if pass 4 does not approve; after that, stop and report
- Current focus: Noah seeds two tournaments next week; this data feeds that
- Work types: additive (new repo); review of startgg-results is read-only
- Window-end: park-resumable
```

## Passes

| Pass | Seat | Model | Posture |
|---|---|---|---|
| 1 | lead-engineer | Opus | Build to `docs/design.md`; write `docs/build-record.md` §Pass 1 |
| 2 | engineering-auditor | Sonnet | Report-only review against the design and this list; its own section in the build record |
| 3 | lead-engineer, **fresh job** | Sonnet | Repair: every finding gets FIXED or DECLINED-with-reasoning |
| 4 | engineering-auditor, **fresh job** | Opus | Closing re-review of the actual artifact. **Build is not complete until this pass approves.** |

## Mutation grants

- Create, modify and delete anything under `C:\Users\iknow\repos\seeding-script\`.
- `git init` in that folder; local commits on branch `build/v1`. **No remote, no push.**
- Live start.gg API calls (`https://api.start.gg/gql/alpha` only), paced per the design, for
  development and the acceptance runs.

## Prohibitions (never judgment calls)

- **Token (ruled by Noah, D9): Noah pastes it himself.** `seeding-script/.env` already exists
  with a blank `STARTGG_TOKEN=` line, and `.gitignore` already covers `.env` and `out/`. Agents may
  **read** `.env` and **must never** write to it, copy a token into it from anywhere (including
  `startgg-results/.secrets/`), print it, log it or commit it. If `STARTGG_TOKEN` is still blank
  when a live check is due, do all the offline work, record the live checks as **PARKED: waiting
  on Noah's token paste**, and report. Never go looking for a token elsewhere. After `git init`,
  confirm `git check-ignore .env` succeeds before the first commit.
- Never write outside `seeding-script/`. `startgg-results` is read-only.
- Never weaken, skip or delete a test to make it pass. A failing test is a hard stop for that
  thread: park and report.
- Never exceed 80 requests per 60 s against start.gg.
- Never guess a blocked ruling. Record the options and stop that thread.
- No writes to records about Noah (memory, profiles).

## Out of scope

Anything listed under "Out of scope" in `docs/design.md`. Also no CI, no packaging, no publishing.

## Acceptance (binding; pass 4 checks each with evidence)

1. **Tests:** `node --test` passes on a clean checkout (`git clone` of the local repo into a temp
   folder), with no network, using recorded fixtures. Pure logic is covered: window filter, status
   rule, team split, CSV serialization (BOM, quoting, `= + - @` tags), slug parsing, pacing
   arithmetic, retry classification.
2. **Token:** read from `STARTGG_TOKEN` or the gitignored `.env`. `.env.example` is committed.
   Missing token → clear message, exit 2, no output folder. A bad token → the same, with no retry
   loop. `git log -p` and every output file contain no token string, verified by grep.
3. **Live run, unattended:** `node pull.js https://www.start.gg/tournament/combo-breaker-2026/event/melty-blood-actress-again-current-code`
   finishes with no intervention. Its output folder has `players.csv`, `results.csv` and
   `meta.json` exactly per the design.
4. **Reconciliation:** `players.csv` row count equals the registrant participant count from the
   API. For every player, `result_count` equals that player's row count in `results.csv`. The
   `meta.json` totals equal the CSV totals. Checked by a script committed to the repo, not by eye.
5. **Ground truth:** for GeneralMidwest (`user/14364d39`), an **independent** count of in-window
   `user.events` (a separate query written for this check) equals their `results.csv` rows. Three
   random rows across three players are re-fetched and match on date, event, game and placement.
6. **Rate limit:** the request log for the live run shows no 60 s window with more than 80
   requests, and backoff is exercised at least once, in a test or live.
7. **Resume:** a live run killed partway (after at least 10 players are checkpointed) is finished
   with `--resume`. The log shows checkpointed players weren't refetched, and the final output
   matches a clean run's player set and row counts.
8. **No fake-complete output:** a run killed before finishing leaves no `players.csv`,
   `results.csv` or `meta.json` in its run folder.
9. **No-account players:** handled per the design and marked `limited`. If none exist in the
   acceptance event, that's stated, and the path is covered by a fixture test.
10. **README:** setup (Node version, pasting the token into `.env`), run, resume, what each output
    file contains, and a short "hand this to Claude" note. A reader who hasn't seen this contract
    can run it.
11. **Reuse review:** the build record lists what was reviewed in `startgg-results`, what was
    copied (with credit), and what was rejected and why.
12. **Closing approval:** pass 4 approves after an actual pass over the actual artifact. Findings
    "fixed without re-review" don't count.

## Build record

`C:\Users\iknow\repos\seeding-script\docs\build-record.md`: one section per pass. Each starts with
"Terms as understood" and any assumption the seat supplied that this contract didn't state. It ends
in the REPORT shape from `personal-staff/dispatch-template.md` (Overview · Found · Ran · Queued ·
Spend · Parked · Needs attention).
