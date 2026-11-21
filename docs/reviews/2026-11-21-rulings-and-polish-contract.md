# Rulings and polish contract: the UX review (2026-11-21)

Seat: Chief of staff (autonomous work), persona v0.5.0
(`personal-staff/personas/library/chief-of-staff.md`), acting under Noah's delegation in chat today:
*"have chief of staff and engineering team make the decisions for me. i'll review from their product"*.
The goal is his earlier one: *"polish the ui/ux"*.

Noah reviews the finished polish build, not these rulings ahead of time. The build runs under these
rulings. **Every ruling below can be changed by Noah**, and each one says what changing it would cost.

**Inputs read in full:**
- `docs/reviews/2026-11-20-ux-review-owner.md` (the owner's review, UX-01 to UX-32)
- `docs/reviews/2026-11-20-ux-review-audit.md` (the auditor's check, F1 to F14 and its corrections)
- `PRODUCT.md`
- `docs/design-tool.md`: Constraints, Pages, Display rules, Lifecycle, Rulings, Open questions, and
  Amendments A1 to A3

**Inputs read in part:**
- `README.md`: headings, the Quick start lifecycle section and Tests
- `docs/build-record-tool.md`: the 2026-10-30 out-of-band entry and the last pass's REPORT
- `git show 42771e5`, `git log` for `8943805`, `f51c04a` and `088821a`

**Grounding** (persona directive 6). All four resolved, in `personal-staff/personas/grounding/`:
- `design-principles.md` (Traceable Cause)
- `design-patterns.md` (Negative Verification: flag, don't delete)
- `director-layer-framework.md` (authority and the two-axis escalation rule)
- `proxy-and-dispatch-v1.md`

No source failed to resolve. There is no tournament-organizer persona in the library, which the
auditor also noted. Calls about what a TO needs rest on `PRODUCT.md` and are this seat's judgment.

**Run mode.** Noah set this run as unattended, so the intake round of questions (directive 8) was
skipped. Where something was unclear I ruled with a stated default. Section 6 lists the gaps I
filled on my own.

---

## 1. Rulings on the five items the auditor routed to Noah

| # | Item | Ruling | Reason (what it traces to) | If Noah changes it |
|---|---|---|---|---|
| A1 | The open top-5 slot: UX-03 or UX-14 | **UX-03 takes the slot** (one tab stop and arrow keys in the Tiers sheet, plus names for empty cells). UX-14 rides along in part only: the sheet's editor shows the same key hint as the seeding editor, and both editors take their top tier value from one source (see A2 and UX-07). **Which gesture opens the editor (single click or double click) is deferred.** | `PRODUCT.md`, Accessibility: *"full keyboard operation of every view (the Tiers sheet editor especially)"*. That is the only view `PRODUCT.md` names. UX-03 is P1: 2,178 tab stops, 1,117 with no name (re-measured by the auditor, §2). UX-14 is P2. The persona's declared bias favours taking care of tomorrow: UX-03 is the bigger fix, and it is what a second TO with a keyboard runs into first. The open gesture is a habit Noah has, so changing it is his call. | Swapping in all of UX-14 later is additive. Dropping UX-03 means reverting a contained `tiers.js` and `render.js` change. |
| A2 | The stored tier 11 in `registry/tiers.csv` | **Flag it; don't fix it. The build never edits registry data.** Any stored tier above the maximum (`MAX_TIER`) shows a visible marker that isn't colour, plus words a screen reader can read, such as "above 10: start.gg supports 0-10; set it within 0-10 to save". The marker appears in the Tiers sheet and in the seeding table. The value itself is shown and kept exactly as it is. Correcting it is Noah's job. | Amendment A3, Tier range: a stored value above 10 *"still reads and shows; it can't be saved again until it is set within 0..10"*. Flagging keeps that. `PRODUCT.md` principle 4, *"Nothing is lost silently"*. Negative Verification: *"Flag, don't delete"*. The data is Noah's (the caller's term). The push is not affected: the auditor showed that `lib/push.js:94` sends `{ seedId, seedNum }` only. | Removing the flag is one rule. Noah setting the 11 to 0-10 makes the flag disappear by itself. |
| A3 | UX-12 moves the lifecycle controls that the design doc puts on the page header | **Not allowed in this build. Deferred to Noah.** Mark done (labelled "Archive"), Archive standings and Delete tournament data stay as separate buttons on the page header. UX-04 may tighten the spacing around them but may not hide them, fold them into a menu or remove them. The relabel is deferred as well: see the note below this table. | `docs/design-tool.md:243-244` (Lifecycle): *"Controls on the page header: Mark done … Archive standings … Delete tournament data"*. The contract says anything that conflicts with the design doc goes to Noah. Reversing a ruled layout is a decision with real consequences, so it waits for him (director-layer framework, two-axis rule). | Noah can allow the menu later. It is a contained change to `tournament.html`/`tournament.js` and needs a design-doc amendment. |
| A4 | start.gg badge colour | **Keep start.gg's blue (`#3f80ff`) and change the text to dark `#0b0d11` in both themes.** That measures **5.32:1**; white measures 3.66:1 today. | Amendment A1.4, Noah's ruling: *"a small **start.gg** badge in start.gg's blue"*. `README.md:31` also says "(blue)". Of the two options, dark text is the only one that fixes the contrast failure without overriding a ruled decision. The darker fill (`#2459a6`) would also make the badge the same colour as the app's accent, which blurs "source" with "action". Ratios come from the script in §7. | Switching to the darker fill is a one-token change (`--src-startgg-bg` and `-fg`, both theme blocks). |
| A5 | Send the review back for another owner round? | **No.** The audit stands beside the owner's report as the record. This contract uses the auditor's corrected findings wherever the two differ. | The corrections already exist on disk with their evidence (Traceable Cause: the cause is captured and anyone can check it). Another round would cost about one owner pass and change no build decision. The auditor's unattended default and the caller's default agree. | One owner pass whenever Noah wants it. |

**A3 note: the "Archive" label.** The auditor (F11) read the "Archive" button as the spec's "Mark
done" and called renaming it well-founded. It is the spec's Mark done. But **Noah chose the word
"Archive" himself on 2026-10-30**: *"there can be a manual archive button with approval follow up"*
(commit `42771e5`, recorded in `docs/build-record-tool.md` under "Out-of-band: the upload modal …").
Neither label is a free choice, then: "Archive" is Noah's word, and "Archive standings" is the
design doc's. The fix for two controls sharing one verb belongs to Noah, so it is deferred with
UX-12. `README.md:241` still says **Mark done** and the design doc's Lifecycle section does too.
That is documentation lagging behind what Noah chose. The build fixes the README text only; see §3.4.

## 2. Polish scope

I used the auditor's corrected findings. UX-07 is now P3, with only the browser `max` left to fix.
UX-02 now covers three kinds of table. UX-13 is P3. UX-25 is dropped. UX-32 is treated as code
upkeep. UX-04's P1 part is the header height. The five findings the critique raised but left out
of the table get IDs here: **UX-33 to UX-37** (these numbers are mine).

**Two parts.** Part 1 is the corrected top 5 plus what the rulings and standing rules require.
Part 2 is small, low-risk riders, mostly in the same files, listed in build order. If the window
runs short, unfinished riders are reported as **not done**. Nothing is left half-built.

| ID | Scope | One-line reason |
|---|---|---|
| UX-01 | **In, part 1** | Top 5 #1. `PRODUCT.md` requires a cue that isn't colour for tier recency. Adds to display rule 9 and doesn't conflict with it: the colour and the hover stay. |
| UX-02 | **In, part 1** (widened per F3) | Top 5 #2. Keyboard sort on the seeding table, the schedule block view and the result tables, copying the Tiers sheet's pattern. |
| UX-03 | **In, part 1** | Ruling A1. |
| UX-04 | **In, part 1: header height only** | Top 5 #4, per F12. Only spacing and layout tightening, within ruling A3. |
| UX-04 (frozen columns) | Deferred | P2 with a workaround (the narrower Freeze setting). Changing the remembered default changes behaviour. |
| UX-05 | **In, part 1** | Contrast bundle; ruling A4. |
| UX-06 | **In, part 1** | Contrast bundle: unstyled dark-mode controls. |
| UX-22 | **In, part 1** | Contrast bundle: control-border token (SC 1.4.11). |
| UX-28 | **In, part 1** | Contrast bundle, added by F2: one rule. |
| UX-07 (what remains) | **In, part 1** | P3, but standing rule A4-6 applies: the browser `max` must come from `MAX_TIER` or be pinned by a test. It lives in the same files as UX-03. |
| A2 flag (tier above 10) | **In, part 1** | Ruling A2. |
| UX-32 (dark-token duplication, stale comment) | **In, part 1** | The contrast bundle edits dark tokens, and those tokens are written twice. Standing rule A4-6: build them from one source or pin them with a test. |
| UX-32 (`width` animation) | Dropped | Negligible, per F9 and the owner's own detector verdict. |
| UX-08 | In, part 2 (rider 1) | Colour-only meaning (SC 1.4.1), the same kind of failure as UX-01. `schedule.js` is already open for UX-02. The design doc's "polish deferred" for the Schedule tab dated from increment 3; this pass is that polish. |
| UX-11 | In, part 2 (rider 2) | `PRODUCT.md`: *"Respect `prefers-reduced-motion`"*. CSS only. |
| UX-21 (help lines) | In, part 2 (rider 3) | Goes with the UX-01 legend. One line each for tier markers, Seeded ✓ and Freeze in "How to read this". |
| UX-21 (nav tooltips on focus) | Deferred | Nav markup from A3. A separate surface. |
| UX-19 (skip link) | In, part 2 (rider 4) | Cheap. More needed once UX-02 adds header buttons. |
| UX-19 (fewer tab stops per row) | Deferred | Taking pin and compare out of the tab order changes how rows work. |
| UX-14 (shared hint) | In, part 2 (rider 5) | Ruling A1, the cheap part. |
| UX-14 (one open gesture) | Deferred | Ruling A1: Noah's habit. |
| UX-09 | In, part 2 (rider 6) | One opacity rule in `app.css`. |
| UX-23 | In, part 2 (rider 7) | Use the global focus outline. `app.css` only. |
| UX-24 | In, part 2 (rider 8) | An anti-reference named in `PRODUCT.md`. A shadow-value change only. |
| UX-36 ("Seeds: tier order" looks like a button) | In, part 2 (rider 9) | Style only. The words stay, since A2.3 sets them. |
| UX-20 | In, part 2 (rider 10) | One CSS rule. |
| UX-31 | In, part 2 (rider 11) | One wrong word and one cursor rule. |
| UX-30 | In, part 2 (rider 12) | `PRODUCT.md` principle 4. A few lines. |
| UX-27 (`lang="en"`) | In, part 2 (rider 13) | One attribute (SC 3.1.1). |
| UX-27 (shell tokens, always dark) | Deferred | The shell's look is a design choice. |
| UX-10 | Deferred | Adds a new visible control and changes how the home page works. Noah's call. |
| UX-12 | Deferred | Ruling A3. Includes calming the red Delete. |
| UX-13 | Deferred | "Seeded" is the design doc's word (premise 7). Choosing one word for the header and the tooltip is a vocabulary call for Noah. |
| UX-15 | Deferred | UI copy: Noah edits copy himself (the A3 "Copy cut"), and "discriminator" is a word he chose (A1.1). The owner's list is ready for him. |
| UX-16 | Deferred | Load speed is fine locally (owner §3). Suggested as the first item of a later speed pass. |
| UX-17 | Deferred | A structural rendering change, too risky for a polish pass. |
| UX-18 | Deferred | Changes the geometry of dense rows and needs live measurement. Next pass. |
| UX-26 | Deferred | A new loading state. P3. |
| UX-29 | Deferred | Noah should pick the date format and time zone. It touches server rendering. |
| UX-33 (Tiers sheet find) | Deferred | A new control in a view Noah laid out (A3). Principle 3, *"Three tables, not a platform"*. Strong candidate for Noah to approve. |
| UX-34 (undo a seed move) | Deferred | A new feature that touches A2.3's write rules. High blast radius. |
| UX-35 (three Refresh buttons) | Deferred | Needs a ruling on which refresh does what. Copy and layout. |
| UX-37 (account name in the bar) | Deferred | Needs a start.gg call, which the read-only rule forbids. |
| UX-25 | **Dropped** | Taste only. No user cost, and `PRODUCT.md` doesn't name it (F8). |
| UX-07 (original claims) | **Dropped** | "Clamp on the server" and "protects the push" are false per F1. |

**In:** part 1 has UX-01, 02, 03, 04 (header), 05, 06, 22, 28, 07 (remainder), the A2 flag and 32
(tokens). Part 2 has UX-08, 11, 21 (help), 19 (skip link), 14 (hint), 09, 23, 24, 36, 20, 31, 30
and 27 (`lang`).

## 3. Build contract for the lead engineer

### 3.1 Acceptance criteria

Unless a line says otherwise, measure on the dev server in **both themes** and at **1440×900 and
1024×768**.
- Pages: `/t/eclipse-1st-cour` (182 players), `/t/mixfest-2026-mbaacc` and `/tiers`.
- Contrast: use the WCAG formula in the owner's appendix.
- Theme switching: set `data-theme` on the page and remove it afterwards, the way the owner and the
  auditor did. Don't press the theme switch.

**Part 1**

- **UX-01: tier recency**
  - Each of `rec-here`, `rec-old`, `rec-never` and `match-tag` gets its own marker that isn't
    colour (a glyph or a letter; the engineer picks and records it). The marker shows without
    hover or focus.
  - The cell's accessible name includes the state in words, for example "6, never reviewed".
  - Reviewed within 6 months has no marker, as today.
  - A legend next to the table (visible without hover, and not only in a tooltip) lists all four
    states plus "no marker = reviewed within 6 months". It matches the bands in
    `docs/design-tool.md` (Open questions, tier recency) and A1.2.
  - Contrast in both themes: the tier digit is ≥ 4.5:1 on its fill, and the marker is ≥ 3:1 on its
    fill.
  - The hover title (date and tournament) stays.
  - Sorting by Tier and the CSV export are unchanged. The marker is not part of the value. The
    existing export and sort tests pass.
- **UX-02: keyboard sort** on `#summary`, the schedule block view (`schedule.js:46`) and every
  `table.sortable` result table:
  - Every sortable header holds a `<button>` that Tab can reach. Enter or Space sorts, and so does
    a click.
  - The sorted header has `aria-sort="ascending"` or `"descending"`; the others have none.
  - The ❄ freeze buttons in the headers still work and remain separate tab stops.
  - A2.3 still holds: moving a seed while the table is sorted by another column returns it to seed
    order.
  - Re-run the owner's appendix snippet. Expected: `focusable` equals the number of sortable
    headers, and `ariaSort` is 1 after a sort.
- **UX-03: Tiers sheet keyboard**
  - The sheet body has **exactly one** cell with `tabindex="0"` (a roving tabindex). Check:
    `[...document.querySelectorAll('table.tier-sheet td')].filter(t=>t.tabIndex>=0).length === 1`
    (2,178 today).
  - ↑ ↓ ← → move between the editable cells (Alias, Tier, Notes).
  - Enter (or F2) opens the editor. Esc closes it and puts focus back on that cell, which is
    today's behaviour (`074368a`).
  - Tab from the sheet goes to the next control after it.
  - Every cell that can take focus has an accessible name that isn't empty, for example "Alias for
    Skeleton, empty".
  - The sort buttons in the headers are unchanged.
  - A server-render test pins the one-tab-stop markup (in `test/tiers-view.test.js` or a new file).
    Demonstrate the keys live, but **never press Enter inside an open editor on real data**. Saving
    is proven by tests.
- **UX-04: header height**
  - Freeze is on "Through Tier". `document.querySelector('#summary').getBoundingClientRect().top`
    must be **≤ 216 px at 1440×900** (284 today) and **≤ 230 px at 1024×768** (304 today).
  - Every header control stays visible as its own button (ruling A3).
  - Keep the 0.3.0 layout Noah set in `f51c04a` and `088821a`: the top bar full width with the nav
    under it, the theme switch inside the bar, and Back in the left nav.
  - If a target can't be reached without hiding or moving a control into a menu, stop at the best
    value. Report the number you measured and what blocks it, and mark UX-04 *partial*. Don't break
    ruling A3 to hit a number.
- **UX-05**
  - `.src.src-startgg` text on its fill measures **5.32:1** in both themes: fill `#3f80ff`, text
    `#0b0d11`, set through the `--src-startgg-fg` token in both theme blocks.
  - The upload badge is unchanged.
- **UX-06**
  - `#addUrl` uses the app's input style in both themes. Its placeholder measures ≥ 4.5:1 against
    the input's background.
  - On `/tiers`, Export… and Import… use the app's button style: radius `--radius`, height
    `--ctl-h`, token border, text ≥ 4.5:1.
  - The "Another game" select's height equals `--ctl-h` (30 px).
- **UX-22**
  - Add a new control-border token, used by text inputs, selects and textareas only.
  - Its border measures ≥ 3:1 against every surface it sits on (`--cell`, `--bg`, `--head`) in both
    themes.
  - `--line-strong` stays as it is for dividers.
- **UX-28**
  - On `#accountBar.off` and `.warn`, the prefix text measures ≥ 4.5:1 in both themes.
  - Show it by the token arithmetic, and by setting the class in the page for a moment (no token
    change and no account action).
- **UX-07 (remainder) and A4-6**
  - The seeding editor's `max` (`app.js:1050`, `20` today) and the sheet editor's
    (`tiers.js:85`, none today) both equal `data.MAX_TIER` (10).
  - Best: the browser reads the value the server sends, derived from `MAX_TIER`, for example as a
    data attribute.
  - Acceptable: a test that reads both files and asserts both bounds equal `data.MAX_TIER`.
  - A hard-coded `10` with no test fails this contract.
- **A2 flag (tier above 10)**
  - The cut-off comes from `MAX_TIER` by the same rule as above.
  - On `/tiers` for MBAACC, the one stored 11 (Skeleton) shows the marker and its words; no other
    cell does. On a seeding page, any tier above 10 shows the same marker.
  - A test pins it with a fixture row of 11.
  - `registry/tiers.csv` is byte-for-byte unchanged. Its SHA-1 must be
    `28a6fd48108ce1a81654e22cb843954ed957beb7` at the start and at the end (`sha1sum registry/tiers.csv`).
- **UX-32 (tokens)**
  - The dark token block in `:root[data-theme="dark"]` and the one in the
    `prefers-color-scheme: dark` block declare the same properties with the same values. Either
    build them from one source, or add a test that parses `app.css` and fails when they differ.
  - The comment on `app.css:1` stops saying "Light only".

**Part 2, in build order**

1. **UX-08.** Clash rows on the Schedule tab show a text tag ("Clash" for main pools, "Side" for
   side game only; the engineer may refine the words). The tag is part of the row's accessible
   text. Contrast ≥ 4.5:1 in both themes.
2. **UX-11.** Under `prefers-reduced-motion: reduce`:
   - the busy bar, the spinners, the "pulling…" chip and the shell's pulsing dots have no running
     animation;
   - the theme cross-fade's `!important` transition no longer wins over the reduce rule.
   - Proof: a test that asserts the CSS rules, or a live check with reduced motion emulated. Name
     which one you used.
3. **UX-21 (help lines).** "How to read this" gets one plain-words line each for the tier markers
   (matching the legend), the Seeded ✓ column and Freeze. No file paths or internal names.
4. **UX-19 (skip link).** On the tournament page and on `/tiers`, the first Tab shows a visible
   "Skip to table" link. Activating it moves focus into the table (the first sortable header or
   the sheet's active cell).
5. **UX-14 (hint).** When the sheet's editor opens, it shows the seeding editor's hint ("Enter
   saves · Esc cancels"; Notes also say "Shift+Enter: new line"). The open gesture is unchanged.
6. **UX-09.** At rest, the ❄ and 📌 controls measure ≥ 3:1 against their cell in both themes.
7. **UX-23.** `#freezeN` and `#jump` show the global 2 px `:focus-visible` outline in `--accent`.
8. **UX-24.** Every floating layer (`app.css:481, 492, 509, 526, 543, 565`) keeps its 1 px border.
   No `box-shadow` has a blur over 8 px.
9. **UX-36.** `#seedMode` reads as status text: no border, no look of a button. The words stay as
   set in A2.3.
10. **UX-20.** The Tiers read-error message is styled like the other error notices. Show it with a
    test or a temp-file fixture, **never by locking the real `tiers.csv`**.
11. **UX-31.** The compare checkbox's title says "up to 3". `button:disabled` uses the default
    cursor, and `progress` only while a job runs.
12. **UX-30.** A failed Dismiss shows "Couldn't dismiss. Try again." (or close to it) in a live
    region. Proven by a test with a failing endpoint.
13. **UX-27.** `src-tauri/shell/index.html` has `<html lang="en">`.

### 3.2 Out of scope (do not build)

- Everything marked Deferred or Dropped in §2.
- Specifically:
  - no menu for lifecycle controls, no relabelling "Archive" or "Archive standings", no restyling of
    Delete (UX-12, ruling A3);
  - no change to the editor's open gesture (UX-14);
  - no copy rewrites beyond the words named in §3.1 (UX-15, UX-13);
  - no new features (UX-33, 34, 35, 37).
- No change to `registry/` data, to the push, or to the seeding write rules (A2.3).
- No version bump, tag or release: releasing is outward-facing and Noah's.
- If the build finds something it believes is needed and not listed here: record it in the report
  as a proposal and don't build it.

### 3.3 Standing rules that apply (`docs/design-tool.md`, Open questions, A4-6)

- **Things that must agree come from one source or are pinned by a test.** Here that means:
  - the tier maximum in both editors and the above-10 flag (`data.MAX_TIER`);
  - the two dark token blocks;
  - the recency legend and the cell markers (one map in code that both read; a test pins that the
    legend lists every state the cell can take);
  - the sort-header pattern across the three kinds of table (one helper, or a test per kind).
- **Record every out-of-band change before the next pass.** Anything changed outside this contract
  during the window, by anyone, goes in the build report before the auditor's pass.

### 3.4 Docs to update (repo practice: README for behaviour, design-doc amendments for ruled changes)

- **`docs/design-tool.md`.** Add **"Amendment A4 — UX polish (rulings 2026-11-21, delegated)"**.
  - It should record:
    - rulings A1 to A5 with a pointer to this file;
    - display rule 9 extended (colour + marker + legend);
    - the above-10 flag beside A3's tier-range paragraph;
    - the badge text colour beside A1.4;
    - the Tiers sheet keyboard model;
    - the lifecycle note: the Mark done control has been labelled **Archive** since 2026-10-30
      (`42771e5`), recorded and not changed.
  - Note in the amendment that the "A4-3" and "A4-6" labels under Open questions are older item
    numbers and not this amendment.
- **`README.md`**
  - Tiers view: keyboard use.
  - Tournament page: the recency markers and legend, keyboard sort, the skip link.
  - `README.md:241`: change "**Mark done**" to match the on-screen **Archive**.
  - Keep "(blue)" at `README.md:31`.
- **`docs/build-record-tool.md`**: a short entry for this pass that points to the build report.

## 4. Engagement terms (the caller's, copied exactly)

work on a new local branch `polish/ux-review` off `main`; local commits at green points allowed, NO push, NO merge to main; `npm test` must pass; the app must be run and the changes demonstrated, under the read-only rule for real data (dev server: `npm run dev`, http://127.0.0.1:8765; no start.gg calls, no add/import/archive/delete, no token change; tier/alias/note edits may be opened but not saved against real data unless restored — prefer exercising editors via tests); do NOT edit registry/tiers.csv or other real data files; no Ship Pipeline / /auto-build / other pipeline skills; at most 3 sub-agents; return report at docs/reviews/2026-11-21-polish-build-report.md.

**The report must contain:**
- the `npm test` count before the first change and at the end;
- for each in-scope ID, done, partial or not done, with the artifact that checks it (a test name, a
  measured value with the snippet that produced it, or a commit);
- the `tiers.csv` SHA-1 at the start and at the end;
- the commits on `polish/ux-review`;
- the out-of-band changes, if any;
- proposals the build found but did not build;
- **a review checklist Noah can walk in one sitting** (15 steps or fewer, each naming the page,
  the theme or width, and what he should see).

## 5. Auditor loop

The engineering auditor gets **one repair round**:
1. The auditor checks the build against §3.
2. The lead engineer repairs what the auditor finds.
3. The auditor checks the repairs once.

Anything still open after that goes to Noah in the report as a finding, not as a third round.

## 6. Gaps I filled on my own (all can be changed)

- **IDs UX-33 to UX-37** for the five findings the audit listed without numbers (F4). They follow
  the auditor's suggested severities: P2 for Tiers find, P3 for the rest.
- **The two-part structure and the rider order.** I chose it to keep the build inside one window
  and one review sitting. Part 2 items left unfinished are reported, not forced.
- **UX-04's targets (216 px and 230 px)** are mine. They are roughly a 25% cut from the auditor's
  measurements. Stopping at the best value is allowed, and the report has to say so.
- **The "Archive" label finding** (§1, A3 note) goes beyond the auditor's F11. Evidence: `git show
  42771e5` and `docs/build-record-tool.md`, "Out-of-band: the upload modal …".

## 7. Re-runnable checks behind this file

- Badge ratios: `node cr.js '#0b0d11/#3f80ff' '#ffffff/#3f80ff' '#2459a6/#ffffff'`. `cr.js` is the
  owner's appendix formula reading hex pairs. Results: 5.32, 3.66 and 6.87 (the 6.87 is the
  auditor's figure).
- Real data baseline: `sha1sum registry/tiers.csv` → `28a6fd48108ce1a81654e22cb843954ed957beb7`.
  This matches the auditor's `28a6fd48…`.
- `MAX_TIER`: `lib/view/data.js:558`; used again in `lib/tiers-share.js:37`.
- Lifecycle controls: `docs/design-tool.md:243-244`; `app/public/tournament.html:42-45`.
- Badge ruling: `docs/design-tool.md:485-486` (A1.4).
- Tiers sheet tab stops: `lib/view/render.js:543-546` (three cells with `tabindex="0"` per row).
