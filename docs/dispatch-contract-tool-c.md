# Dispatch contract — seeding-ops, increment 4 (CSV upload, discriminator, source badges), build C

Status: DRAFT 2026-10-30, awaiting Noah's go before any seat is dispatched.
Team: `personal-staff/personas/TEAMS.md` §Engineering team (owner **lead-engineer**, auditor
**engineering-auditor**, report-only). Profile blocks: `personal-staff/personas/library/<slug>.md`.
Models: Opus for every seat (Noah's standing ruling).

```
DISPATCH
- Directive: "support an upload of csv with gamertag and startgg id/discriminator … look up results for
  all players by their id and then associate with and display the tag" / "the source of truth
  associating tag with tier should also record startgg id" / "match should first be by id and if not
  then try tag only … color highlighting" / "home screen should have some indication if it was by
  upload or startgg"
- Surfaces: C:\Users\iknow\repos\seeding-ops (read/write per grants) · docs/design-tool.md **Amendment
  A1** (BINDING) with the rest of that spec · docs/usage-log.md Ratified rows (BINDING, read-only) ·
  the first real file: C:\Users\iknow\Downloads\Mixfest 26 MBAACC Seeding - players.csv (32 rows; may be
  copied into test/fixtures as the CSV fixture; it is public start.gg data)
- Term: work scope = the Acceptance list · 4 passes + at most ONE extra repair/re-review pair
- Current focus: Noah wants to upload the Mixfest list and see the page; the build is also the first
  user of the discriminator column, so T1's migration must be byte-safe like build A's
- Work types: additive / repair
- Window-end: park-resumable
```

## Passes

| Pass | Seat | Model | Posture |
|---|---|---|---|
| 1 | lead-engineer | Opus | Build to A1; `docs/build-record-tool.md` §Build C, Pass 1 |
| 2 | engineering-auditor | Opus | Report-only review |
| 3 | lead-engineer, fresh job | Opus | Repair: every finding FIXED or DECLINED with reasoning |
| 4 | engineering-auditor, fresh job | Opus | Closing re-review; the build is not complete until this approves |

The orchestrating session verifies in its browser between passes: the upload form, the resulting page,
the tag-only highlight, the badges on the home page, and the registry links written.

## Mutation grants

- Under `C:\Users\iknow\repos\seeding-ops\`: create/modify/delete anything **except** `docs/usage-log.md`,
  `docs/design-tool.md`, `docs/dispatch-contract*.md`, prior build records, `.env`, `src-tauri/`,
  `.github/`, and existing `out/` tournament folders other than ones this build creates (read-only).
- `registry/tiers.csv`: **modify only through (a) the migration in Acceptance 2, run once after its tests
  pass on a copy (keep `registry/tiers.csv.bak` until pass 4), and (b) the existing reader/writer**. Never
  hand-edit rows.
- Git: branch **`build/tool-c`** from `build/tool-b` HEAD. Local commits only; the orchestrator pushes.

## Prohibitions

- **start.gg budget: at most 20 requests per rolling 60 s**, through the app's single queue or one client
  in one process, and only for: resolving the Mixfest file's 32 discriminators once (32 `user` lookups),
  and at most one pull of that list's results. Everything else offline against the fake start.gg.
- Never post anything to start.gg. Never read or print the token.
- Never delete or rewrite an existing tournament folder; never read the old `out/<t>__<e>__*` folders.
- Never weaken, skip or delete a test to pass. A failing test is a hard stop for that thread.
- Never guess a blocked ruling; record the options and stop that thread. A1 and the spec's Open-questions
  defaults are not guesses; name each default used.
- No skills, subagents or workflows beyond the seats in this contract.

## Acceptance (binding)

1. `node --test` passes on a clean clone, offline, no regression (225 tests before this build).
2. **T1 migration:** `discriminator` column added after `player_id`, blank everywhere; every other byte
   identical (BOM, quoting, line endings); idempotent; the reader/writer round-trip keeps it. Rows get a
   discriminator when a pull or an upload resolves one for a linked player (the pull already has
   `user_slug`; the migration may backfill from existing pools where `user_slug` is known, say which).
3. **Match order** (A1.2): id first (player id, or discriminator), then tag only; one matcher used by the
   reader and the writer (A4-2's rule). A tag-only match is marked in the view model and rendered with a
   distinct Tier-cell color in the table, the compare panel and the CLI view; the color and its hover text
   are recorded. A ✓ or an edit on a tag-only row writes `player_id` and `discriminator` into it. Tests
   for each path, including the two-players-one-tag case (A6-1) which must not link both.
4. **CSV parsing** (A1.3 contract): two columns; header optional, detected by the second column's first
   value being a discriminator; discriminator accepted bare, as `user/<code>`, or as a URL; names split
   into prefix and tag on ` | `; duplicate discriminators collapsed with a note; a malformed row reported
   with its line number, never silently dropped. Tests on the Mixfest fixture and on synthetic edge cases.
5. **Resolution:** one `user(slug: "user/<code>")` per row through the queue → user id, player id,
   current gamerTag, prefix, location; unresolved codes kept as flagged rows. Tests against the fake (the
   fake gains a `user` resolver).
6. **The page:** `POST /api/uploads` (name, game id, date, CSV) creates `out/<slug>/` with
   `state.json { source: "upload", … }`, a catalog with one synthetic event for the chosen game, and a pull
   of the resolved players' results and W-L through the existing per-player code; the page has one tab,
   no push control, no Schedule tab; lifecycle done by the given date; export and ✓ work; the home page
   lists it. The upload form lives on the home page beside "Add a tournament" (game picker: the games
   present in `config/majors.json` plus a free id).
7. **Display:** the current start.gg tag is shown; the CSV's name is kept (alias on hover when it
   differs); the prefix fills Team.
8. **Registry linking:** on upload, matched tiers rows get `discriminator` (and `player_id`) written; rows
   linked by tag are listed in the upload's summary; the summary is shown on the page once and recorded
   in `state.json.uploads`. Test with a scratch tiers file.
9. **Source badges** (A1.4): the home page shows a start.gg badge (start.gg blue, small "start.gg" text)
   for `source: "startgg"` and an upload badge for `source: "upload"`; existing and imported tournaments
   read as `startgg` (migrate `state.json` on read; say how). Both themes.
10. **Live check:** the Mixfest file uploaded once for real (32 lookups + one pull), recorded with request
    counts; the resulting page checked by the orchestrator.
11. README: the upload (contract, what you get, what is missing vs a start.gg tournament), the
    discriminator column, the tag-only color, the badges.
12. Closing approval by pass 4 on the actual artifact.

## Build record

`docs/build-record-tool.md`, sections "Build C — Pass N", same shape as builds A and B.
