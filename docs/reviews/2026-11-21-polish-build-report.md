# Build report: UX polish (Amendment A4), 2026-11-21

Seat: Lead engineer (builds & updates), persona v0.4.0 (`personal-staff/personas/library/lead-engineer.md`).
Contract: `docs/reviews/2026-11-21-rulings-and-polish-contract.md` (Chief of staff, delegated by Noah).
Branch `polish/ux-review` off `main` at `088821a`. Local commits only: nothing pushed, nothing merged.
Run mode: unattended. No question round was run; gaps are in the interpretation ledger (§6).

## 1. Summary

- **Part 1:** all 11 items are done except **UX-04, which is partial**. 1440×900 meets its target:
  206.5 px against ≤ 216, down from 284. 1024×768 reaches 244.5 px against ≤ 230, down from 304.
  §2 explains what blocks the rest.
- **Part 2:** all 13 riders are done.
- **Tests:** `npm test` passed **405/405 before the first change** and **422/422 at the end**: 17 new
  tests in `test/ux-polish.test.js` and 2 corrected oracles in `test/tiers-view.test.js`.
- **`registry/tiers.csv`:** byte-for-byte unchanged (§8).
- **Docs:** design-doc **Amendment A4**, README, and a `docs/build-record-tool.md` pointer.

Verification levels use the persona's scale: 9–10 = run, with something re-runnable beside it; 7–8 =
strong pattern match, not run; 5–6 = stated with its caveat.

## 2. Part 1, per finding

| ID | Status | What changed | How it was shown (re-runnable) | Level |
|---|---|---|---|---|
| **UX-01** tier recency | Done | `lib/view/render.js:236` `TIER_MARKS`: one map for the cell's mark, the cell's words and the legend. Marks: ✓ here, ◷ over 6 months, ? never, ≈ tag only; "recent" has none. The Tier cell gets the mark plus `aria-label` (`render.js:412`). Legend: `tierLegend()` `render.js:267`, drawn on the tabs' row (`tournament.html:25`, `tournament.js:130`). CSS `.tier-mark`, `.tier-legend` (`app.css`). The CLI view gets the same marks and a legend sentence (`views/major-table.js`) | Tests: `A4 UX-01: each recency state…`, `A4 UX-01: the legend lists every state…`. **Live** on `/t/eclipse-1st-cour`: 183 marks; names such as "9, reviewed at this tournament". Digit and mark on their fill: rec-here **6.53 light / 6.55 dark**, rec-never **8.10 / 8.04** (formula from the owner's appendix, run in the page). rec-old and match-tag cells don't occur in the real data, so the token test covers them (all ≥ 4.5) | 9 (here/never live) · 8 (old/tag: tokens only) |
| **UX-02** keyboard sort | Done | Shared helper `sortButton` / `ariaSort` (`render.js:278`). Seeding head (`summaryHeadRow`; Notes excluded). Result tables and shared events (`render.js`). Schedule block view (`schedule.js:50`; focus returns to the button after the redraw, `:231`). `markSorted` in `app.js:615` sets one `aria-sort` and is used by sort, seed sort and `ensureSeedOrder`. The Freeze-menu names read the button label (`fillFreeze`) | Tests: `A4 UX-02…`, `A4 UX-08 / UX-02: the Schedule tab, run…`. **Live, keys pressed:** on Eclipse, Region button focused → **Enter** → `aria-sort="ascending"` on Region only → **Space** → `descending`, rows WI/WI/WA first. Snippet result: 15 headers, 14 sortable, **14 focusable sort buttons**, ariaSort 0 → 1. ❄ is still its own tab stop. A player's result table: 6/6 headers are buttons; Enter on "Best placement" → `ascending`. Block view: 12/12 headers are buttons; Enter on "Wave A" → `aria-sort` on wA, focus kept | 9 |
| UX-02: A2.3 seed move while sorted | Not shown live | Code path: `ensureSeedOrder` now calls `markSorted(…, null)`, the same reset as before plus `aria-sort` | A live move would write the real seed order (read-only rule). No test drives it | 7 |
| **UX-03** Tiers sheet keyboard | Done | Roving tabindex and named cells: `render.js:596` `tiersTable(rows, sort, active)`. Arrow, Home/End and Ctrl+Home/End moves: `model.js:525` `gridMove`. Page logic: `tiers.js:66` `activate`, `:102` keydown, focusin. Focus returns to the sort button after a header sort | Tests: three `A4 UX-03…` (markup, `gridMove`, page run with keys). **Live `/tiers` MBAACC:** 726 rows, **2,178 editable cells, 1 tab stop** (was 2,178), **0 empty names**. Keys pressed: Tab → Skip link → Enter → "Alias for Skeleton, empty" → **Right, Down, Down, Left** → "Alias for Alps, empty" (one tab stop). → **Right, Enter** opened the Tier editor (`min=0 max=10`, hint shown) → **Esc** → focus "Tier for Alps, 10", nothing saved (status empty, no POST in the server log). Tab from the sheet leaves it in one press. The page has no control after the sheet, so focus wraps to the skip link | 9 |
| **UX-04** header height | **Partial** | `tournament.html:15-30`: the event facts sit on the title line, the legend on the tabs row, and "How to read this" in the first bar beside "Seeded events" (it opens onto its own row: `#readHelp[open] { order: 1 }`). Padding and margins tightened in `app.css` (header 6/8 px, bars 6 px, closed disclosures have no 8 px top margin, tabs 5 px, table 4 px). Every control is still its own button; the 0.3.0 layout is kept (full-width bar, nav under it, theme switch in the bar, Back in the nav) | **Live** with Freeze "Through Tier", `#summary.getBoundingClientRect().top`: **1440×900: 284 → 206.5** (≤ 216 ✓, both themes). **1024×768: 304 → 244.5** (target ≤ 230 ✗, both themes). Blocker: at 940 px of content width the seed toolbar's four groups need about 1,159 px (View alone is 676), so they wrap to 2 rows (68 px). On this event the title + facts + W-L need about 1,340 px, so they take 2 lines. Getting the last 15 px needs hiding or merging a control (ruling A3) or a copy change (UX-15), so I stopped there. Mixfest at 1440 is 250.8; the header ends at 202, and the 45 px under it is the upload summary, which is outside the header | 9 |
| **UX-05** start.gg badge | Done | `--src-startgg-fg: #0b0d11` in all three token blocks; the fill stays `#3f80ff` | Live on `/`: **5.32 both themes**. Test: `A4 contrast…`. The upload badge is unchanged | 9 |
| **UX-06** unstyled controls | Done | `.add-t input` gets a background and colour. `.tier-tools button` gets the app button style. `.game-more select` gets the app input style (block appended to `app.css`) | Live: `#addUrl` bg `#fff` / `rgb(26,29,34)`; placeholder **5.44 light / 6.43 dark**. Export…/Import…: radius 6px, height 30px, token border, text **16.88 / 13.91**. "Another game" select **30 px** tall | 9 |
| **UX-22** control border | Done | New `--ctl-line` (`#80858e` light, `#6b7280` dark) on text inputs, selects and textareas only. `--line-strong` is unchanged | Test: `A4 contrast…` (≥ 3:1 on `--cell`, `--bg`, `--head`, both themes: light 3.71/3.46/3.31, dark 3.50/3.71/3.42). Live `#addUrl` border **3.71 / 3.50** | 9 |
| **UX-28** account-bar prefix | Done | `#accountBar.off .prefix, #accountBar.warn .prefix { color: inherit }` | Token arithmetic in the test. Live: a temporary `.prefix` span with `.off`/`.warn` set for a moment, then removed: **off 6.32 / 6.29, warn 7.27 / 7.41** (light/dark). No token or account action | 9 |
| **UX-07** remainder | Done (best option) | `MIN_TIER`/`MAX_TIER` are defined once in `lib/view/model.js:518`, the file both server and browser load. `data.js` reads them from there. `app.js:1058` and `tiers.js` build `min`/`max` from `M.MAX_TIER` | Test `A4 tier range…` runs both editors on fake pages and asserts `max="10"`; it also asserts no hard-coded `max="N"` is left in either file. Live: the sheet's editor reads `max=10` | 9 |
| **A2 flag** (tier above 10) | Done | `OVER_MAX` (`render.js`): a red "!" mark plus the words "above 10: start.gg supports 0-10; set it within 0-10 to save", in the seeding cell's `aria-label` and title and in the sheet cell's label. The value is shown as-is | Test `A4 ruling A2…`: fixture rows 11/10/0; only the 11 is flagged, the file is unchanged, and the import still refuses 11. **Live `/tiers`:** exactly one flagged cell, Skeleton 11. **Live seeding page:** Skeleton 11 shows "11 ! ?"; mark contrast **6.26 / 6.01** | 9 |
| **UX-32** dark tokens | Done | Comment on `app.css:1` fixed. Two blocks are kept because CSS can't share one block between a selector and a media query without a build step | Test `A4 UX-32…` parses both blocks and asserts they are deep-equal (comments stripped) | 9 |

## 3. Part 2 riders (in build order)

| # | ID | Status | What changed / shown | Level |
|---|---|---|---|---|
| 1 | UX-08 | Done | `schedule.js:76`: with Conflicts first on, a clash row gets a "Clash" or "Side clash" tag inside the player cell's text (bordered, `--clash-fg` or `--warn-fg` on `--cell`). Test `A4 UX-08 / UX-02: the Schedule tab, run…` (fake page, fixture with main and side clashes). Contrast via the token test (light 10+, dark 10+). **Not shown live:** Eclipse has 0 clashes of either kind | 9 (test) / live unreached |
| 2 | UX-11 | Done | The reduce block stops `#busyBar`, `.spinner` and `.busy::before`. The theme fade only runs under `prefers-reduced-motion: no-preference`. Shell `.dot` stops under reduce. **Proof: test** `A4 UX-11…` (asserts the CSS rules). Reduced motion was not emulated live | 8 |
| 3 | UX-21 | Done | "How to read this" (`tournament.html:46`) has three new paragraphs: tier colours and marks (filled from `tierLegendText()`, the same map), Seeded ✓, and Freeze. Seen live | 9 |
| 4 | UX-19 | Done | `server.js:187` `skipLink`, placed before the nav on `/t/…` and `/tiers`. `account.js` puts the account bar after it. Handlers: `tournament.js:32` and `tiers.js:108`. Live: first **Tab** shows "Skip to table" at top 6 px; **Enter** focuses the first seeding sort button (Seeded) or the sheet's tab stop. Test `A4 UX-19…` | 9 |
| 5 | UX-14 (hint) | Done | The sheet editor shows "Enter saves · Esc cancels" (Notes also shows "Shift+Enter new line"). The open gesture is unchanged. Live screenshot description: the hint appears under the Tier input. Tests: page run, and the corrected `repair 1` oracle | 9 |
| 6 | UX-09 | Done | ❄ at rest opacity .8; 📌 opacity .8 with `--pin-rest-filter` (grayscale; dark theme adds `brightness(1.8)`). Live: canvas-sampled glyph colour blended at that opacity on its cell: **❄ 3.30 light / 4.53 dark, 📌 3.75 light / 5.79 dark**. Caveat: 📌 is an emoji, so its value is an average of its sampled pixels | 8 |
| 7 | UX-23 | Done | Removed `outline: none` and the halo. Live, via a real click and Shift+Tab: `#jump` and `#freezeN` match `:focus-visible` with `solid 2px rgb(36,89,166)` (`--accent`) | 9 |
| 8 | UX-24 | Done | All floating-layer shadows now blur ≤ 8 px; borders kept. Test `A4 UX-24…` parses every `box-shadow` and checks the seven layers' borders | 9 |
| 9 | UX-36 | Done | `.seed-mode` is now text only: no border, no background (arranged: accent ink, semibold). Words unchanged. Live: `border none 0px`, bg transparent | 9 |
| 10 | UX-20 | Done | `#tierReadError` gets `class="err data-notice warn"`. Test `A4 UX-20…` uses a temporary tiers file with a simulated EBUSY read, **never the real file** | 9 |
| 11 | UX-31 | Done | The compare checkbox title says "up to 3" (`render.js:385`). `button:disabled` uses `cursor: default`; `html.is-busy button:disabled` uses `progress` (busy.js already sets `is-busy`). Test `A4 UX-31…` | 9 |
| 12 | UX-30 | Done | A live region `.notice-msg` is server-rendered beside Dismiss. `notices.js:21` shows "Couldn't dismiss. Try again." on failure and re-enables the button. Test `A4 UX-30…` runs `notices.js` against a 500 | 9 |
| 13 | UX-27 | Done | `src-tauri/shell/index.html` has `<html lang="en">`. Test asserts it | 9 |

Out of scope and not touched: UX-04 frozen columns, UX-10, 12, 13, 15–18, 26, 29, 33–37, the UX-14 open
gesture, UX-19 row tab stops, UX-21 nav tooltips, UX-27 shell tokens, UX-25, and the UX-32 width
animation.

## 4. Docs

- `docs/design-tool.md`: **Amendment A4**, covering rulings A1–A5 with pointers, display rule 9
  extended, the above-10 flag beside A3's tier range, the badge text beside A1.4, the sheet's
  keyboard model, sortable headers, the header changes, and the Archive/Mark done lifecycle note. It
  says the older "A4-3"/"A4-6" labels are not this amendment.
- `README.md`:
  - new section on using the Tiers view from the keyboard (and the above-10 mark);
  - tier colours **and marks** with the legend;
  - keyboard sort and the skip link;
  - **Mark done → Archive** at the lifecycle line, and also at the uploaded-list line (§6, L9);
  - "(blue)" at line 31 kept.
- `docs/build-record-tool.md`: a short entry pointing here.

## 5. Terms as understood

- **Allowed work:** UI changes in `app/public/`; `lib/` only where a finding needs it (`model.js`
  holds the tier range and `gridMove`; `render.js`; `data.js` now reads the range from `model.js`);
  `app/server.js` for the skip link, the read-error class and the Dismiss live region;
  `views/major-table.js` to keep the CLI view's legend and sort buttons consistent;
  `src-tauri/shell/index.html` for UX-27 and UX-11; tests; docs.
- **Boundary:** contract §2 "In" (part 1 + riders 1–13). No menu, relabel or Delete restyle (A3). No
  open-gesture change. No copy rewrites beyond the named words. No registry, push or A2.3 write-rule
  change. No version bump.
- **Acceptance criteria:** contract §3.1 as written, with the adaptations in the ledger (L2, L5).
- **Process:** no Ship Pipeline, `/auto-build` or other skills; 0 sub-agents (cap 3). No design doc
  was drafted: the contract's §3.1 is the binding spec (persona directive 2: the change is atomic per
  finding and existing code answers the structure).
- **Real data:** read-only. No start.gg-calling control pressed, no Add/Import/archive/delete, no
  token change. One tier editor was opened and closed with **Esc** (nothing saved; no POST in the dev
  server log). Themes were switched by setting `data-theme` on the page, then removed. The viewport
  was reset to "desktop" and the dev server stopped.
- **Grounding:** persona standards bank consulted (test-quality stars) and runbook skimmed. The
  runbook is **known stale**, and its pipeline mapping was not applicable because the caller barred
  pipelines. The Software architect persona was not loaded (not needed).

## 6. Interpretation ledger (gaps I closed; each can be changed)

| # | Gap | What I did | Alternative / cost to change |
|---|---|---|---|
| L1 | Mark glyphs (the contract leaves the choice to the engineer) | ✓ here (it echoes the Seeded ✓), ◷ old (a clock), ? never, ≈ tag only (an approximate match), ! above 10 | One-line change each in `TIER_MARKS` |
| L2 | The owner's snippet counts `th.tabIndex ≥ 0`, which a button-inside-th design can't satisfy without doubling tab stops | Counted the `button.sort` elements instead (14 of 14); `th` stays non-focusable | Making `th` focusable would add a second stop per header |
| L3 | Where the legend goes without costing UX-04 height | On the tabs' row, right side (it wraps under the tabs when narrow). Short labels there; full words in each item's hover and in "How to read this" | A line above the table costs about 20 px of table height |
| L4 | Contract's "Side" tag | "Side clash" (the contract allows refining the words) | Change the string in `schedule.js:77` |
| L5 | "Tab from the sheet goes to the next control after it" | `/tiers` has no control after the sheet, so Tab leaves it in one press (it wrapped to the skip link in the pane) | None needed |
| L6 | Tiers sheet ARIA role | Kept a plain `<table>` (no `role="grid"`) with a roving tabindex and `aria-label`s. Reason: the header sort buttons stay separate tab stops, which a full APG grid wouldn't allow. Screen-reader users still reach cells with table navigation and Enter, which clicks | `role="grid"` would also need the headers inside the roving set |
| L7 | One source for the tier max | Moved `MIN_TIER`/`MAX_TIER` into `lib/view/model.js` (shared by server and page) instead of sending a data attribute. `data.MAX_TIER` is still exported, as the same value | A data attribute would need plumbing in two page renders |
| L8 | Moving "How to read this" | From the seed bar to the first bar, beside "Seeded events". It is hidden on the Schedule tab as before and opens onto its own row | Moving it back costs about 38 px at 1440 |
| L9 | README "Mark done" | Fixed both lines that name the control (lifecycle at :246 and the uploaded-list line at :58), not only the one the contract cites | Revert one line |
| L10 | UX-09 pin in dark | A token filter (`brightness(1.8)` in dark), because grayscale alone measured 2.32:1 in dark | A different glyph would change the control's look |
| L11 | Table top margin 8 → 4 px (UX-04) | Taken; it's spacing | +4 px |
| L12 | Tests counted as the contract's "server-render test" for UX-03 | `render.js tiersTable` (the shared renderer) plus a run of the page script on a fake DOM; the sheet body is drawn by the browser, not the server | None |

## 7. Spend

- Granted: the caller's terms. No numeric budget; at most 3 sub-agents; no pipelines.
- Used: **0 sub-agents, 0 skills**, one session. Commands were local: node tests, git, file edits, and
  the dev server through `preview_start`/`preview_stop`. The ceiling was not reached.
- Outside the build: page loads run the app's own account check (`GET /api/token?check=1`) and update
  check, as every page load does. I didn't trigger anything else.

## 8. `registry/tiers.csv` checksums

| When | SHA-1 (contract) | SHA-256 (caller) |
|---|---|---|
| Start (before the branch) | `28a6fd48108ce1a81654e22cb843954ed957beb7` | `a8bbc695c49fed8b605f1295cad95c2659b326bd2b5ccedbb490aa4db21a0be6` |
| End | `28a6fd48108ce1a81654e22cb843954ed957beb7` | `a8bbc695c49fed8b605f1295cad95c2659b326bd2b5ccedbb490aa4db21a0be6` |

Both match. No real data file was edited (`config/`, `out/`, `registry/`, `.env`).

## 9. Commits (`git log --oneline main..polish/ux-review`)

Listed at the time of writing; the commit that adds this report comes last.

```
7fcd433 Docs for Amendment A4 (UX polish): design doc amendment, README (keyboard, tier marks and legend, skip link, Archive label), build-record pointer
c496f28 Amendment A4 UX polish: tier marks + legend, keyboard sort, Tiers sheet keyboard model, header height, contrast bundle, one tier maximum, above-10 flag, riders
c6ea0f8 Review record: PRODUCT.md, the UX review (owner + audit) and the CoS rulings/polish contract
```

## 10. Out-of-band changes

None by anyone else during the window. Changes of my own beyond what the contract named:
- `views/major-table.js` (CLI view): sort-button CSS and the legend sentence, so the shared marks read
  correctly there.
- README :58 (L9).

## 11. Found outside scope (reported, not fixed)

1. **Region sort puts blank regions first when ascending.** Blank cells sort on `data-v="~"`, and
   `localeCompare` puts "~" ahead of letters. Pre-existing (`render.js` summaryRow region `data-v`).
2. **Opening "Seeded events" pushes the Lifecycle buttons to a new row.** Pre-existing. I fixed the
   same effect for the moved "How to read this" only (`#readHelp[open] { order: 1 }`); the same rule
   would fix "Seeded events".
3. **The Tiers import panel's buttons are unstyled.** `#impApproveSel`, `#impApproveAll` and
   `#impClose` aren't covered by `.tier-tools button`; dark mode not checked (proposal, unverified;
   it's the same kind of issue as UX-06).
4. **UX-04 at 1024 needs a ruling to go further.** Options: a shorter "W-L known for…" fact (copy,
   UX-15) or a narrower View group (for example, a shorter Jump field). Both are Noah's call.
5. **"How to read this" doesn't mention keyboard sort.** I left it out to respect "no copy rewrites".
   Suggested words: "or Tab to it and press Enter".
6. **The auditor loop (contract §5) hasn't run.** It belongs to a separate seat.

## 12. Open items (verification legs not reached)

- A2.3 "a seed moved while sorted by another column returns to seed order" was not run live (it would
  write the real seed order) and no test drives it (§2).
- UX-08 clash tags not seen live (no clashes in the real data); shown by a test.
- UX-11 reduced motion: asserted on the CSS by a test, not emulated live.
- rec-old and match-tag cells don't occur in the real data; their contrast comes from tokens.
- No screen reader was run. Accessible names were read from the DOM (`aria-label`).
- The desktop (Tauri) build was not launched.

## 13. Review checklist for Noah (one sitting, 14 steps)

1. Open a tournament page, for example Eclipse, at the app's normal size (1440). The table starts
   about a third higher than before. The event facts sit beside the title, and Archive standings and
   Delete are still separate buttons at the right.
2. On the same page, look at the Tier column. Each coloured tier has a small mark after the number
   (✓ green, ? grey), and the line to the right of the game tabs explains the marks. Skeleton's cell
   reads **11 ! ?**: the "!" is red (above 10), and the "?" means never reviewed.
3. Hover over Skeleton's tier. The tooltip starts "Above 10: start.gg supports tiers 0-10…" and still
   gives the review text.
4. Press **Tab** once after the page loads. A blue "Skip to table" appears top left. Press **Enter**:
   focus lands on the Seeded header.
5. Press Tab a few times along the header and **Enter** on Region. The table sorts by Region; press
   **Space** to reverse it. ❄ is still a separate stop.
6. Open "How to read this", beside "Seeded events". There are new lines for tier marks, Seeded ✓ and
   Freeze, and the buttons on the right don't move.
7. Shrink the window to about 1024 wide. Everything still fits in about 3 rows; nothing is hidden.
   (This is the partial target: 244 px against a 230 goal.)
8. Click into **Jump to**, then Shift+Tab to **Freeze**. Both show the same 2 px blue focus ring as
   every other control.
9. Go to **Tiers** in the nav (MBAACC). Press Tab, Enter on "Skip to table", then use the arrow keys:
   the focus box moves between the Alias, Tier and Notes cells. One Tab from there leaves the sheet.
10. On a Tier cell press **Enter**. The editor shows "Enter saves · Esc cancels", and its up arrow
    stops at 10 (the box's max). Press **Esc**; focus is back on the cell and nothing is saved.
11. On the same page, Skeleton's Tier reads **11 !** in red; no other row has the mark. Export… and
    Import… now look like the app's other buttons in dark mode.
12. On the home page in dark mode, the start.gg badge is blue with **dark** text, and the link field
    is dark with a visible border.
13. Eclipse has no schedule clashes today, so there is nothing to see there. The **Clash** / **Side
    clash** tag only shows on an event whose Schedule tab has clashes, after you press Conflicts first.
    Until then, the proof is the test `A4 UX-08 / UX-02: the Schedule tab, run…`.
14. With Windows "Show animations" off, the loading bar and spinners stand still, and switching the
    theme snaps instead of fading.

## 14. Repair round (the one the contract allows; auditor record `docs/reviews/2026-11-21-polish-audit.md`)

- **R1. Done.**
  - Each `TIER_MARKS` entry now carries its colour (green, amber, grey, light blue).
  - A new `tierHelpText()` (`lib/view/render.js`) builds the help line from that same map: each
    colour with its mark and meaning, once, then the red "!" and "no colour and no mark".
  - `tournament.js:132` uses it, and the placeholder text in `tournament.html:57` is gone.
  - The CLI view's sentence (`tierLegendText`) is unchanged.
  - Shown by the new test `A4 repair R1…`.
  - Shown live on `/t/eclipse-1st-cour`: in `#readHelp .about-body`, "Tier marks:" appears 0 times. The
    line reads: "Tier colours and marks: Green with ✓: reviewed at this tournament. Amber with ◷: last
    reviewed over 6 months ago. Grey with ?: never reviewed. Light blue with ≈: matched by tag only. A
    red ! beside the number: the stored tier is above 10 (start.gg supports 0-10; set it within 0-10
    to save). No colour and no mark: reviewed within the last 6 months."
  - Dev server stopped afterwards.
- **R2. Done.**
  - Checklist step 2 now says Skeleton reads "11 ! ?" with a red "!".
  - Step 13 now says Eclipse has no clashes, and that the test is the proof until an event has them.
- **Not touched** (the auditor's ruling items go to Noah): UX-04 at 1024 px and the out-of-scope
  proposals.
- **Tests:** `npm test` 423/423.
- **`registry/tiers.csv`:** unchanged. SHA-1 `28a6fd48108ce1a81654e22cb843954ed957beb7`; SHA-256
  `a8bbc695c49fed8b605f1295cad95c2659b326bd2b5ccedbb490aa4db21a0be6`.
- **Commit:** the auditor's record is committed as-is together with these repairs.
