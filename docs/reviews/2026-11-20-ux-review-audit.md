# UX review: Seeding Ops (auditor pass)

Date: 2026-11-21. Seat: Engineering auditor persona v0.2.0 (`personal-staff/personas/library/engineering-auditor.md`).
Under review: `docs/reviews/2026-11-20-ux-review-owner.md` (the owner's report) and
`.impeccable/critique/2026-11-21T06-12-06Z__app-public.md` (impeccable's snapshot). `PRODUCT.md` is an input.
Source read at commit `088821a`; the running app at http://localhost:8765 was used read-only.

## 1. Verdict: approve with findings

The report meets its contract. Every required section is there. All 32 findings have evidence, a severity
and a verification level. The owner wrote only the two files allowed. Most of the evidence holds when
re-checked: every P1 citation resolves, and the contrast numbers and the live counts I re-ran came out the same.

There is one exception, and it changes what Noah should fix first. **UX-07 (top-5 item #3) is wrong.** The
0-10 tier range *is* enforced on the server and in the import. Commit `8943805` did that, and its tests pass.
The tier 11 is a known value carried over from before, and the design doc says it stays. The push does not send
tier values to start.gg. What is left of UX-07 is two out-of-date `max` attributes in the browser, which is P3.
The report should not reach Noah without this correction beside it.

**What this verdict covers:** whether the evidence is accurate (every P1 and most P2/P3 re-checked), whether
the severities and verification levels are honest, whether the report stays inside the literal ask, how
findings were merged, the top 5, and plain language.
**What it does not cover:** I did not re-score the Nielsen heuristics or the AI-slop verdict, which are matters
of taste. I did not run a screen reader. I did not re-measure items only sub-agent B measured live (UX-09 live
opacity, UX-14 live behaviour, UX-18 live sizes, UX-26 loading). For those I checked the source only. I also did
not open the Compare, Push, upload or account surfaces.

## 2. What I re-verified, and how to re-run it

| Claim | How I checked it | Result |
|---|---|---|
| Contrast ratios: UX-01, UX-05, UX-08, UX-22, UX-28 and the Strengths numbers | WCAG formula on the hex values in `app/public/app.css:6-28` and `:390-408`. Script: the `cr.js` pairs listed below | All match: badge 3.66; control borders 1.63 / 1.64; "never" 1.23 / 1.24; "here" 1.40 / 2.07; clash 1.17-1.37; dim 5.44 / 6.43; links 6.87 / 6.34; tier digits 6.53-8.10; ✓ on green 4.25; UX-28 4.47 / 4.46. Suggested badge fill `#2459a6` gives 6.87 (passes) |
| UX-06: dark-mode defaults | Live on `/` and `/tiers`. I set `data-theme="dark"` on the page and then put it back; the saved theme was not touched | `#addUrl` background `rgb(59,59,59)`, placeholder `#9aa0ab` gives 4.26. `#tierExport` is `#6b6b6b`, outset border, 0 radius, 4.39 |
| UX-03: Tiers tab stops | Live `/tiers`: count `td` with tabIndex ≥ 0 | 726 rows, 2,178 stops, 1,117 empty with no label, no skip link. Same as the owner |
| UX-07: "a tier 11 exists" | Live `/tiers` tier cells over 10; `registry/tiers.csv` line 2 | One 11 (Skeleton, MBAACC). Its source column says `sheet import 2026-10-15`, so it came in before the range became 0-10 |
| UX-07: "the range is not enforced" | `lib/view/data.js:558-561` (`MAX_TIER = 10`, `checkTier` returns 400); `lib/tiers-share.js:106` (import refuses tiers over 10); `git show 8943805`; `node --test test/data-tiers.test.js test/tiers-share.test.js test/tiers-view.test.js` | **False.** The server and the import both enforce 0-10. 38 of 38 tests pass, including "out-of-range → 400, nothing written". `registry/tiers.csv` sha1 was the same before and after the test run (`28a6fd48…`) |
| UX-07: "protects the push step" | `lib/push.js:94`: the post sends `{ seedId, seedNum }` only | **False.** Tier values never go to start.gg. A tier 11 only sorts above the 10s |
| UX-02: keyboard sort | Live on `/t/eclipse-1st-cour`: `#summary` headers; source `app.js:622-624`, `schedule.js:46,214` | Confirmed. The only buttons in the headers are the ❄ freeze buttons, and no header has `aria-sort`. The schedule block view and the `table.sortable` result tables are click-only too (see F3) |
| UX-04: header height | Live, viewport set to 1024×768 and then 1440×900, then reset to desktop | At 1024×768 the table starts at 304 px and frozen columns end at 782 px. At 1440×900 (the app's opening size) the table starts at 284 px (32% of the height) and frozen columns end at 898 px, with Freeze on "Through Tier" |
| UX-10, UX-16, UX-17, UX-13 (live part) | Live JS on `/` and the Eclipse page | Row `role=link` with tabindex 0, 1 link inside it, 15 home stops. 27 images, 5.72 MB, 0 lazy-loaded. 52,955 DOM nodes, 43,693 of them in 304 closed `<details>`. Unpressed button text is "✓" |
| Write scope | `git status --short`; `find .impeccable -type f`; `git diff --stat HEAD` | Only `PRODUCT.md`, `docs/reviews/`, `.impeccable/critique/…` are new. `.claude/worktrees/` dates from Nov 6-17, before this job. No tracked file changed and there is no `.impeccable/live/` |

**Citations re-resolved.** All P1s: UX-01 to UX-07. Of the P2/P3s I re-resolved UX-08, 09, 10, 11, 12, 13, 14,
15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31 and 32. Not re-resolved: UX-19's 1,612-stop count
and UX-26 (both sub-agent live observations).

Contrast pairs (paste into node with the formula from the owner's appendix): `#fff/#3f80ff`, `#fff/#2459a6`,
`#c6cbd3/#fff`, `#3b414b/#1a1d22`, `#e6e8ec/#fff`, `#2a2e35/#1a1d22`, `#bfe3c9/#fff`, `#1f5a34/#1a1d22`,
`#fdebcc/#fff`, `#4a3410/#1a1d22`, `#cfe2ff/#fff`, `#18406e/#1a1d22`, `#656a73/#fde3e3`, `#9aa0ab/#4a3410`,
`#9aa0ab/#3b3b3b`, `#e7e9ee/#6b6b6b`.

## 3. Findings about the review

| # | Finding | Evidence | Lens / value | Weight |
|---|---|---|---|---|
| F1 | **UX-07 is false where it matters.** "Not enforced", "clamp on the server", "protects the push step" and level 9 are all wrong. Only the browser-side `max` is out of date. | §2 rows on UX-07; `docs/design-tool.md:710-713` (Amendment A3: a stored value above 10 "still reads and shows; it can't be saved again") | Confidence is not provenance (corpus pattern 6). A 9 needs something re-runnable behind it, and running it disproves the claim | Changes the top 5 |
| F2 | **Top-5 item #5 overclaims.** The report says the three fixes "clear every AA text-contrast failure found". UX-28 (dim text on the red and amber account bar, 4.47 / 4.46) is a text failure left out of the bundle. UX-22 is a non-text failure, not a text one. | Owner report §5 item 5 vs UX-28; my token check | Confidence is not provenance | Small: add UX-28 to the bundle. It is one rule, `#accountBar.off .prefix, #accountBar.warn .prefix { color: inherit }` direction, `app.css:561` |
| F3 | **The merge lost scope on UX-02.** Impeccable's snapshot says "Seeding-table and schedule sort headers are click-only". The merged UX-02 names only the seeding table. The schedule block view (`schedule.js:46`, handler `:214`) and the result tables (`app.js:624`, `render.js:80,96,450,478`) have the same problem. | Snapshot "Priority Issues" line 2; source lines cited | Merge and de-duplication check | Widen UX-02. Same fix pattern |
| F4 | **Findings named in the critique have no row in the table,** so they have no severity, evidence or level. The contract says every finding gets all three. Missing: no undo for keyboard seed moves except a full reset (Nielsen 3); the Tiers sheet has no find (Nielsen 7); three Refresh buttons on the Schedule tab (`tournament.html:24,118,119`); "Seeds: tier order" looks like a button; start.gg account not named in the bar (snapshot, Jordan). | Owner report §2 vs §4; snapshot "Persona Red Flags" | Contract: every finding has evidence, a severity and a level | Medium. The Tiers-find item may matter most: 726 rows, and the desktop shell may not have the browser's Ctrl+F (model knowledge, unverified) |
| F5 | **Some verification levels are too high.** UX-20 and UX-30 are level 9, but their states (a tiers read error, a failed Dismiss) were never reached live. They are source reads, which the contract scale puts at 7-8. UX-07's 9 is covered in F1. The owner's own scale also puts a sub-agent's live measurement and a source read together at 8. That is cautious rather than inflated, but it is not the contract's scale. | Owner report §4 levels; contract scale | Directive 2: verify, don't accept on record-presence | Small: UX-20 and UX-30 go to 8 |
| F6 | **Evidence pointers off by a little.** UX-03 says the cell tabindex is set "in `tiers.js`"; it is set in `lib/view/render.js:543-546`. UX-15's "discriminator unexplained on home" is `server.js:166` (`:165` is a code comment). UX-29's home date is `server.js:242`, not `:241`. UX-01's 1.23-2.07 range understates it: the "old" amber fill is 1.17 light / 1.44 dark, and the tag-only fill is 1.31 / 1.61. | Source lines above; token check | Traceable cause: the pointer has to land on the thing | Small. The claims still hold |
| F7 | **UX-13 overstates.** An unpressed ✓ is drawn dim inside an outlined circle (`app.css:288-289`). A pressed one is filled green (`:291`). The rows do not "look done already". What holds is the word mismatch ("Seeded" in the header, "Mark as reviewed" in the tooltip) and a weak empty state. | Source; live unpressed colour `#9aa0ab` on the cell | User impact over the tool's reading | P2 → P3 |
| F8 | **UX-25 rests on the tool's taste, not on user impact.** Its only reason is "a pattern the skill bans". No user cost is named, and PRODUCT.md does not list side stripes. UX-24 is different: PRODUCT.md names border plus wide shadow, so it stands. | Owner report UX-25, §2 AI-slop bullets; `PRODUCT.md` anti-references | Declared bias: user impact over pattern-conformance | Drop UX-25, or mark it "taste, optional" |
| F9 | **UX-32 is outside the literal ask.** A stale CSS comment and a duplicated dark token block are code upkeep, not UI polish. Users never see them. Only the `width`-animation part touches the UI. | UX-32 | Pulls back to the literal ask (corpus pattern 9) | Small, because it is P3. Route it as code upkeep, not polish |
| F10 | **Some surfaces were skipped for reasons that don't hold.** The upload modal only calls `showModal()` (`index.js:102`) and writes nothing. The right-click menu writes nothing until Delete is clicked. Compare only saves a per-browser selection (`store.set`, `app.js:666`) and makes no server call. Skipping Compare was defensible, since it changes your saved selection, but it is a core tie-break tool. Skipping the account dialog was reasonable because of the real token. | Owner report §1 "Not reviewed"; source | The review must cover the ask (both directions) | Medium. The upload modal and Compare are unreviewed user surfaces. They should be listed as not reviewed by choice, not as unreachable |
| F11 | **UX-12's fix changes a layout the design doc sets.** `docs/design-tool.md:243-244` puts Mark done, Archive standings and Delete on the page header. Moving them into a menu needs your ruling, not just polish. The finding holds otherwise: Delete shows in every state (`lib/pool.js:173`). The button labelled "Archive" is the spec's "Mark done", so the rename is well-founded. | Design doc; `pool.js:167-173`; `tournament.html:42-45` | The review must not quietly reverse a ruled decision | Goes to rulings |
| F12 | **UX-04 holds, but only half of it is P1.** Freeze has a narrower setting ("Seeded + Seed + Team + Player"), so the frozen-columns part has a workaround, which is P2 by the report's own rubric. The header height (32% at 1440×900, 40% at 1024×768) has no workaround. | §2 UX-04 row; Freeze options read live | The report's own severity rubric | Keep it in the top 5, aimed at the header |
| F13 | **The Nielsen score has no caveat.** Your standards bank lists Nielsen's heuristics as "subordinate, flagged UNVALIDATED" under ISO 9241-110. The contract asked for Nielsen scores, so including them is right. The 24/40 should carry that note. The owner also chose not to consult the standards bank, and named that choice. | `personas/grounding/standards-bank.md` UX entries 1-2; owner report §6 Sources | Grounding | Small |
| F14 | **Plain language is mostly good.** Short sentences, TO words, no self-praise. A few terms go unexplained: "side-tab" and "layout-transition" (the detector's names), "skeleton rows", and "a pattern the skill bans" (see F8). | Owner report §2, UX-25, UX-26 | Plain language (corpus pattern 10) | Small |

**Is UX-07 a correctness bug to route elsewhere?** No. Data integrity holds: saves and imports refuse
values outside 0-10, and the tests prove it. What remains is a small bug left behind by `8943805`: the seeding
editor still has `max="20"` (`app/public/app.js:1050`) and the sheet editor has no `max` (`app/public/tiers.js:85`).
If you type 11 to 20, the browser accepts it, the save fails, and you see "Not saved: Tier must be a whole number
from 0 to 10." (`app.js:785-787`). That is a two-attribute fix. It belongs in the next small fix pass, not in the
polish list. No other finding is a correctness bug. UX-30 (a failed Dismiss says nothing) comes closest, and it
is correctly filed as P3.

## 4. Corrections to the owner's findings

| ID | Owner | Corrected | Why |
|---|---|---|---|
| UX-07 | P1, level 9, top-5 #3 | **P3, level 9 for what is left.** Set `max="10"` in both editors. Whether to flag the stored 11 is your call. Drop "clamp on the server" | F1 |
| UX-02 | Seeding table only | Also the schedule block view and the result tables | F3 |
| UX-13 | P2 | P3 | F7 |
| UX-25 | P3 | Drop, or mark "taste, optional" | F8 |
| UX-32 | P3 polish | Code upkeep, not polish | F9 |
| UX-20, UX-30 | Level 9 | Level 8 | F5 |
| UX-04 | P1 | P1 for the header height; the frozen-columns part is P2 | F12 |
| UX-03, UX-15, UX-29, UX-01 | — | Pointers and numbers fixed as in F6 | F6 |
| Top-5 #5 | 05 + 06 + 22 "clear every text failure" | Add UX-28 | F2 |
| New rows | — | Tiers sheet find; seed-move undo; three Refresh buttons; "Seeds: tier order" label; account not named in the bar. Severity left to the owner. My suggestion is P2 for Tiers find and P3 for the rest | F4 |

**Top 5 after corrections (my recommendation; the open slot is your call):**
1. UX-01: a cue that isn't colour, plus a legend, for tier recency. This holds: PRODUCT.md requires it, and the ratios check out.
2. UX-02: keyboard sort, now on all three kinds of table.
3. *Open slot (was UX-07).* The owner's runner-up, UX-03 (one tab stop for the Tiers sheet), fits best:
   PRODUCT.md names "the Tiers sheet editor especially". The other option is UX-14 (one way to open the tier
   editor in both places), which is cheaper and touches the most repeated action.
4. UX-04: header height below 1200 px, and at 1440×900 too.
5. Contrast bundle: UX-05, UX-06, UX-22 and UX-28.

## 5. Needs your ruling

1. **The open top-5 slot:** UX-03 (Tiers keyboard model, a bigger change) or UX-14 (one tier-editor behaviour, cheaper)?
2. **The stored tier 11** (Skeleton, Melty Blood, from the 2026-10-15 sheet import). Amendment A3 says it stays
   and shows. Options: leave it; flag values above 10 on the sheet; or set it within 0-10 yourself. It does not
   affect the push.
3. **UX-12 changes a layout you set.** `docs/design-tool.md:243-244` puts the lifecycle controls on the page
   header. Moving them into a "Tournament…" menu means amending that.
4. **UX-05 badge colour.** `app.css:448` says the badge is deliberately "start.gg's blue". Keep the blue and use
   dark text, or switch to the darker fill (`#2459a6`, the app's own accent)?
5. **One more owner round, or not?** Should the owner fold F1-F9 into the report (one more round), or should
   this audit stand beside it as the record? Unattended default: I did not send it back. This file carries the
   corrections. You can change that later, and a round costs about one owner pass.

Domain note: whether a TO needs keyboard sort or a find box on the Tiers sheet is a call about the people using
the app. The persona library (`personal-staff/personas/library/`) has no UX-design or tournament-organizer
persona, so these are flagged, not ruled.

## 6. Grounding

| Source | Status | Used for |
|---|---|---|
| `personas/grounding/standards-bank.md` | Resolved, read in full | UX entries 1-2 (Nielsen flagged unvalidated, F13); Code 13 (consistency within the codebase, UX-14) |
| `personas/grounding/design-principles.md` | Resolved, read in full | Traceable Cause: evidence must point at the thing (F1, F5, F6) |
| `personas/grounding/design-patterns.md` | Resolved, read in full | Negative Verification is about creative work. No ruling drawn from it here |
| `personas/grounding/observed-patterns-corpus.md` | Resolved. **Partly read:** headings plus patterns 6-13 (lines 338-507) | Patterns 6 (provenance), 9 (literal ask), 10 (plain language), 12 (recipient friction) |
| Persona library | Searched | No UX or TO persona (see the domain note) |
| Belt (gstack review skills) | **Not used.** Running one needs your spend sign-off. My checks were direct reads, one test run, and browser JS | Unfilled instrument: no automated accessibility scanner (for example axe) was run by either seat |

## 7. Spend and what I touched

- Sub-agents: 0 of 2 allowed.
- Commands: file reads; `git status`, `git show`, `git log`; one `node --test` run of 3 tier test files (38 pass,
  temp directories, `registry/tiers.csv` unchanged by sha1); `node` for contrast maths, with the script in the
  session scratchpad.
- Browser: my own tab (tab-4) on `/tiers`, `/` and `/t/eclipse-1st-cour`, reading only. I set `data-theme` on
  the page and removed it again (it was empty before). The viewport went to 1024×768 and 1440×900 and was reset to
  desktop. I pressed no control, made no start.gg call, changed no tier, alias or note, and did not touch the
  compare selection.
- Files written: this file only.
