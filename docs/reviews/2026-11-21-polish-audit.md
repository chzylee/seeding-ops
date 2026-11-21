# Audit: UX polish build (Amendment A4), 2026-11-21

Seat: Engineering auditor (build acceptance), persona v0.2.0
(`personal-staff/personas/library/engineering-auditor.md`). Run unattended; Noah reviews the final
product. Report-only: no source edited, nothing committed (this file is left uncommitted).

## Verdict: approve with findings

The build meets its contract. Every part 1 item is met except UX-04, which stops short at 1024×768
(244.5 px against a 230 target). The contract allows that: it says to stop at the best value, report
it and mark the item partial, and the builder did exactly that. All 13 riders are done, and none grew
past its ruling. Nothing deferred crept in. No real data was touched. I found no regressions.
The seed move while sorted, which the builder had flagged as unverified, works (§3).

There are two small findings worth one repair round. Neither blocks: R1 is a stutter in new help text
Noah reads at checklist step 6, and R2 is two inaccurate lines in his checklist. The caller can ship
as-is or route them.

**What this verdict covers:** the code diff `main..polish/ux-review` (app, lib, test, views,
src-tauri), the docs it changes (README, design-doc Amendment A4, the build-record pointer), the
build report, the test suite, and live checks on the dev server (Eclipse, Mixfest, `/tiers`, home)
in both themes at 1440×900 and 1024×768.

**What it doesn't cover (unfilled legs):**
- no screen reader was run (accessible names were read from the DOM);
- reduced motion was not emulated live (the CSS is pinned by a test);
- the desktop (Tauri) shell was not launched;
- rec-old, tag-only and clash rows don't occur in the real data, so those are covered by token maths
  and tests, not seen live;
- I did not re-measure main's baselines (284 / 304 px); they come from the owner and audit reviews.

## 1. Re-verification log (everything here can be re-run)

| Check | Command / method | Result |
|---|---|---|
| Tests | `npm test` | **422 pass, 0 fail** (17 in `test/ux-polish.test.js`; 405 before is the builder's claim, not re-run) |
| `tiers.csv` SHA-256 (caller) | `sha256sum registry/tiers.csv` | `a8bbc695…0be6`: matches, before and after my live run |
| `tiers.csv` SHA-1 (contract) | `sha1sum registry/tiers.csv` | `28a6fd48108ce1a81654e22cb843954ed957beb7`: matches |
| Same blob on main, branch and disk | `git hash-object registry/tiers.csv; git rev-parse main:registry/tiers.csv; git rev-parse polish/ux-review:registry/tiers.csv` | all `04b44db5…`. (`git show main:… \| sha256sum` gives a different hash only because of autocrlf; the blob is identical.) |
| No data writes | `git diff --quiet main -- registry config out`; `find out config registry .env -newer docs/reviews/2026-11-21-polish-build-report.md -type f` | no diff; no file newer than the report |
| Tree | `git status --short` | only `.claude/worktrees/` and `.impeccable/` untracked |
| Header height (Freeze "Through Tier"), `#summary.getBoundingClientRect().top` | live, `data-theme` light / dark / none (OS dark) | **1440×900: 206.5 in all three** (≤ 216 ✓). **1024×768: 244.5 in all three** (≤ 230 ✗, partial) |
| 1024 breakdown | live, `getBoundingClientRect` per part | account bar 36; title + facts 42.7 (two lines); tabs + legend 30.8; first bar 30; seed toolbar 68 (two rows). This supports the builder's blocker: both two-line rows need either hiding a control or shorter copy to go to one row |
| Mixfest at 1440 | live | `#summary` top 250.8; header bottom 201.5; the difference is the upload summary, which sits below the header (see F4) |
| Lifecycle controls | live | Archive standings and Delete tournament data are separate visible buttons; the Archive / Mark live again buttons are hidden because the tournament is done (unchanged behaviour) |
| Tier digit and mark contrast | live, WCAG formula on computed colours | rec-here 6.53 light / 6.55 dark; rec-never 8.10 / 8.04; the "!" on Skeleton 6.26 / 6.01. "!" (`--err`) on every tier fill, by tokens: light ≥ 5.50, dark ≥ 3.61 (≥ 3 ✓) |
| Accessible names, seeding table | live | e.g. "9, reviewed at this tournament", "11, above 10: start.gg supports 0-10; set it within 0-10 to save, never reviewed" |
| Keyboard sort, seeding table | live, real key presses | 14 sortable headers, **14 sort buttons**, 0 focusable `th`, `aria-sort` 0 before. Region: **Enter** → `region=ascending` only; **Space** → `descending`, rows WI/WI/WA/WA; focus stays on the button |
| Keyboard sort, result table | live | 2 visible tables, 12/12 headers are buttons; Enter on "Events" → `ascending` on that header only |
| Keyboard sort, block view | live | 12/12 headers are buttons; Enter on "Wave B" → `aria-sort` on wB only; focus returns to the redrawn button. (I put the block-view toggle and sort back afterwards; that state lives in the preview browser's localStorage only) |
| Tiers sheet | live, `/tiers` MBAACC | 726 rows, 2,178 editable cells, **1 tab stop**, 0 empty names, 7 sort buttons; exactly one flagged cell: "Tier for Skeleton, 11, above 10: …" |
| Tiers sheet keys | live, real key presses | Tab → Skip to table → Enter → "Alias for Skeleton, empty" → Right, Down, Down → "Tier for Alps, 10" (still 1 tab stop) → Enter → editor `min=0 max=10`, hint "Enter saves · Esc cancels" → **Esc** → focus back on "Tier for Alps, 10", editor gone → Tab leaves the sheet |
| Seeding editor | live | double-click opens `min=0 max=10`, same hint; Esc closes it and focus goes back to the cell |
| No saves reached the server | browser network log | no request matching `seeds` or `tiers/row` |
| Skip link, tournament page | live | first Tab: "Skip to table" at top 6 px (`#0b0d11` on `#6ea0ea` dark; 6.87 light / 7.30 dark by tokens); Enter → the Seeded sort button |
| UX-05 / UX-06 / UX-22 / UX-28 | live, home page, light / dark | badge 5.32 / 5.32; upload badge 8.90 / 8.51 (unchanged token); `#addUrl` bg `#fff` / `rgb(26,29,34)`, placeholder 5.44 / 6.43, border 3.46 / 3.71 against its surround; account-bar prefix with `.off` 6.32 / 6.29 and `.warn` 7.27 / 7.41 (temporary span, removed) |
| UX-06 `/tiers` | live | Export…/Import…: radius 6 px, height 30 px, token border; "Another game" select 30 px |
| UX-09 | live, computed colour blended at its opacity | ❄ 3.30 light / 4.53 dark. 📌 is an emoji, so this method can't measure it; I accept the builder's canvas sample (3.75 / 5.79) at its stated caveat |
| UX-23 | live, Shift+Tab / Tab | `#freezeN` and `#jump` match `:focus-visible`: solid 2 px `rgb(110,160,234)` (`--accent`, dark) |
| UX-36 | live | `#seedMode` border none, transparent background |
| Console | live | no errors on the Mixfest or Eclipse loads |

## 2. Per-item results against contract §3.1

| ID | Result | Basis |
|---|---|---|
| UX-01 | **Met** | Marks ✓ ◷ ? ≈ (+ "!") from one map (`lib/view/render.js` `TIER_MARKS`); accessible names in words; legend beside the table; hover title kept; contrast live (§1); sort and export use `data-v` and the test checks that the export is the bare number |
| UX-02 | **Met** | Live on all three kinds of table (§1); one helper (`sortButton` / `ariaSort`); ❄ is still its own stop; A2.3 verified live (§3). The builder's ledger L2 (counting buttons, not `th`) is the right reading of the snippet |
| UX-03 | **Met** | 1 tab stop, arrows, Enter/F2, Esc back to the cell, Tab leaves, names never empty, sort buttons unchanged; tests pin the markup, `gridMove` and a page run |
| UX-04 | **Partial, within the contract's allowance** | 206.5 at 1440 ✓; 244.5 at 1024 ✗. Every control is still its own button; the 0.3.0 layout is kept. My breakdown supports the builder's stated blocker. See *Needs your ruling* |
| UX-05 | **Met** | 5.32 in both themes, through `--src-startgg-fg` in all three token blocks |
| UX-06 | **Met** | §1 |
| UX-22 | **Met** | `--ctl-line` ≥ 3:1 on `--cell`, `--bg` and `--head` in both themes (test plus live); `--line-strong` unchanged |
| UX-28 | **Met** | §1 |
| UX-07 / A4-6 | **Met, beyond "best"** | `MIN_TIER`/`MAX_TIER` now live once in `lib/view/model.js:518`, which the server (`data.js:560`, `tiers-share.js:37` through `data`) and both editors (`app.js:1058`, `tiers.js:128`) read. No hard-coded `max="N"` is left (test) |
| A2 flag | **Met** | Live: exactly one flagged cell; the value is shown as-is; a fixture test covers 11/10/0; the import still refuses 11; `tiers.csv` unchanged |
| UX-32 | **Met** | A test deep-compares the two dark blocks; the comment on line 1 is fixed |

**Riders (13 of 13 done; 11 sampled):** UX-08 (test), UX-11 (CSS test), UX-21 (live, see R1),
UX-19 (live, both pages), UX-14 (live, both editors), UX-09 (live ❄), UX-23 (live), UX-24 (test),
UX-36 (live), UX-20 (test with a monkey-patched read; never the real file), UX-30 (code and test).
UX-31 and UX-27 read in the diff. **None grew past its ruling.** The largest, UX-09's dark-only
`brightness(1.8)` pin filter, is a token that serves the ≥ 3:1 ask (ledger L10).

## 3. The builder's open item: "seed move while sorted"

**It works, and the risk is low.** The code change is narrow. `ensureSeedOrder` (`app/public/app.js:259`)
still clears the sort, sets `sortedBy = null` and redraws in seed order, exactly as on main. The only
new step is `markSorted(row, null)`, which also removes `aria-sort`. `markSorted` is a top-level
function in the same IIFE, so hoisting holds. Both callers, the keyboard handle (`:343`) and the
pointer drag (`:366`), still go through it.

**Live check (saves blocked in the page).** I replaced `window.fetch` in the page so that any non-GET
request was recorded and never sent. Then I sorted by Region (descending), focused Unorigin's ⠿
handle (seed 36) and pressed ↓. Results:
- rows were back in seed order 1..10…;
- no header had `aria-sort` or `data-dir`;
- Unorigin was now seed 37;
- the live region said "Unorigin: seed 37 of 182";
- one `POST …/seeds` was caught in the page and never sent (the network log has no `seeds` request);
- after a reload: still "Seeds: tier order", Unorigin seed 36, and no file in `out/` newer than the
  report.

**Gap.** No automated test drives this path (finding F3).

## 4. Findings (lenses kept separate)

**Plain language**
- **F1. The help line stutters (low; repair R1).** "How to read this" renders *"Tier colours and
  marks: Tier marks: ✓ reviewed at this tournament · …"*. The bold label comes from
  `tournament.html:57`, and `tournament.js:132` overwrites the span with `tierLegendText()`
  (`render.js:271`), which starts with its own "Tier marks:". The line also never names the colours
  its label promises; the HTML's own sentence about them is replaced. Noah reads this at checklist
  step 6. Value: plain language is a surface requirement (observed pattern #10).

**Report accuracy** (confidence is not provenance)
- **F2. The checklist doesn't quite match the screen (low; repair R2).** Step 2 says Skeleton shows
  "**11 !** in red". The cell reads **11 ! ?**, and only the "!" is red. Step 13 can't show anything
  on Eclipse, which has 0 clashes (the report says so in §3 but not in the step). Noah walks this list
  alone, so each step should match what he will see.
- **F3. A2.3 has no automated pin (low; no repair required).** The design-doc amendment states "A2.3
  holds" as fact. The build report rated that same claim 7, "not shown live". The claim is true (§3),
  but the doc said it before anyone had checked. A fake-DOM test like the one `test/ux-polish.test.js:55`
  already uses for `app.js` could pin it. That is outside the contract's letter, so it is a suggestion
  only.

**Test quality** (standards bank #12)
- **F4. The legend-completeness test lists the states by hand (low; ★★).** `test/ux-polish.test.js:152`
  lists `['here','recent','old','never','tag']` itself instead of deriving them from `M.recency`. A new
  recency band would not fail it. This meets A4-6 for today's states.

**Measurement reading**
- **F5. Mixfest's table starts at 250.8 px at 1440 (information).** The header ends at 201.5. The
  rest is the upload summary, which is outside the header and outside UX-04. The builder disclosed
  this. I read the 216 px target as Eclipse's, since that is where its baseline comes from.

**Literal ask, both directions**
- Nothing short: every §3.1 item and every §3.4 doc item is present.
- Nothing beyond, apart from three disclosed consequences, all accepted:
  - the CLI view (`views/major-table.js`) styles the sort buttons and adds the legend sentence. The
    shared renderer now emits marks and buttons there, and its sort script still works because the
    listener sits on the `th`;
  - README :58 also says Archive (ledger L9);
  - "How to read this" moved beside Seeded events (UX-04 layout, ledger L8).
- No UX-12, 13, 15, 10, 17, 18, 26, 29 or 33–37 work appears in the diff. The lifecycle group, the
  Delete style, the open gesture and the push are untouched.

**Comprehension** (would Noah understand and sign?)
- Yes. The README additions are plain: no "roving tabindex", and an example of what a screen reader
  says.
- The design-doc amendment is dense but complete against §3.4, and points to the contract for each
  ruling.
- The build report's tables lean on code names (`gridMove`, `aria-sort`), but its summary and the
  14-step checklist are plain. With R2 the checklist matches the screen.

## 5. Repair list (one round; optional, since neither item blocks)

| # | Where | What's wrong | Acceptance check |
|---|---|---|---|
| R1 | `app/public/tournament.js:132` with `app/public/tournament.html:57` (source `lib/view/render.js:271`) | The help line repeats "Tier marks:" after its bold label "Tier colours and marks:", and drops the sentence that explains the colours | On `/t/eclipse-1st-cour`, `document.querySelector('#readHelp .about-body').innerText` contains "Tier marks:" **at most once**, and the tier line still lists every `TIER_MARKS` entry plus "no mark" (from the one map; test `A4 UX-01: the legend lists every state…` still passes). The CLI view's sentence is unchanged or still reads cleanly. `npm test` green |
| R2 | `docs/reviews/2026-11-21-polish-build-report.md:180` and `:202` | Checklist step 2 doesn't describe Skeleton's cell as it appears; step 13 can't be seen on Eclipse | Step 2 says the cell reads "11 ! ?" with a red "!". Step 13 says Eclipse has no clashes today, so the tag will only show on an event that has them (the test `A4 UX-08 / UX-02…` is the proof meanwhile) |

## 6. Needs your ruling (Noah)

1. **UX-04 at 1024×768: accept 244.5 px, or allow one of these.**
   - (a) A shorter "W-L known for…" fact. This is a copy change, and copy is yours (UX-15).
   - (b) Narrower View-group controls.

   Getting the seed toolbar onto one row needs about 220 px, which narrowing alone won't find, so (b)
   likely saves less than the 15 px still missing. Neither is needed at 1440.
2. **Builder proposals found outside scope (§11 of the build report).** None was built.
   - Blank regions sort first on Region ascending (a bug that predates this build).
   - Opening "Seeded events" pushes the Lifecycle buttons to a new row (one CSS rule, the same one
     used for "How to read this").
   - The Tiers import panel's three buttons are unstyled (same kind of issue as UX-06).
   - "How to read this" doesn't mention keyboard sort (copy).

   Each is small. Say which, if any, go in a next pass.

The items the contract deferred to you (UX-12 and the Archive / Archive standings clash, the UX-14 open
gesture, UX-15 copy, UX-33 find and the rest) are unchanged, and this build doesn't make any of them
harder.

## 7. Grounding consulted

All resolved, in `personal-staff/personas/grounding/`:
- `standards-bank.md` (#12 test-quality stars, #13 consistency within a codebase, #4 YAGNI);
- `design-principles.md` (Traceable Cause: every finding cites a file:line or a re-runnable check);
- `design-patterns.md` (Negative Verification, "flag, don't delete": the A2 flag is that pattern);
- `observed-patterns-corpus.md` (#6 provenance, #9 pull back to the literal ask, #10 plain language,
  #16 one datum, one home: the tier maximum).

No source failed to resolve. There is no tournament-organizer persona in the library (the CoS noted
this too); no finding here turns on TO-domain judgment.

**Belt:** no review skills were dispatched. Noah's standing rule puts spend-multiplying skills behind
his sign-off, and none was granted for this job. Instruments that went unused:
- an accessibility audit skill (I covered the accessibility checks by hand in §1);
- a screen reader.

## 8. Spend

0 sub-agents (cap 2), 0 skills. One dev-server session (`preview_start` "dev", stopped at the end),
with the viewport reset to desktop. Page loads ran the app's own account check (`GET /api/token`) and
update check, as every load does. Nothing else that calls start.gg was pressed: no Add, Import,
archive, delete, token change or saved edit. Two editors were opened and closed with Esc. One seed move
ran with its save blocked inside the page (§3). One repair round is still available.
