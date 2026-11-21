# UX review: Seeding Ops (owner pass)

Date: 2026-11-20 (session ran into 2026-11-21). Reviewer seat: Lead engineer persona v0.4.0, review only.
Method: `impeccable critique` (two independent assessments, A and B, run as sub-agents) and then
`impeccable audit`. Source files were read at commit `088821a`; the running app was at http://localhost:8765.
Nothing in the app or the repo was changed. The only files written are this report and impeccable's
snapshot at `.impeccable/critique/2026-11-21T06-12-06Z__app-public.md`.

## 1. Scope

**Reviewed**

| Surface | How |
|---|---|
| Home page: tournaments list, Add a tournament, Import from CSV row, notices | Live, plus source (`app/server.js`, `index.js`, `notices.js`) |
| Tournament page `/t/eclipse-1st-cour` (182 players) and `/t/mixfest-2026-mbaacc` (uploaded CSV): game tabs, seeding table, toolbar, Schedule tab | Live, plus source (`tournament.html`, `tournament.js`, `app.js`, `schedule.js`, `lib/view/render.js`) |
| Tiers view `/tiers` (726 rows): sheet, sort, an editor opened and then closed with Escape | Live, plus source (`tiers.js`) |
| Account bar (start.gg token) | Bar seen live; dialog from source only (`account.js`) |
| Busy, update and notice banners | Source only (`busy.js`, `update.js`, `notices.js`) |
| Light and dark theme | Live. Switched with a page-local `data-theme` attribute, not the switch, so your saved theme was not touched. The browser's OS setting is dark. |
| Narrow window | Live at 1440, 1100, 1024, 900 and 700 px wide |
| Tauri shell `src-tauri/shell/index.html` and window size in `src-tauri/src/main.rs` | Source only |

**Not reviewed**

| What | Why |
|---|---|
| Compare panel | Opening it means ticking rows |
| Push to start.gg panel | It starts the dry-run flow, which calls start.gg |
| Account token dialog, open | Needs Change… |
| Upload modal, open | Needs Import |
| Right-click Delete menu | Not opened |
| Error, offline, busy, update-available and not-signed-in states, live | Only reachable through actions that change data or call start.gg; reviewed from source |
| `rec-old` and `match-tag` tier cells, live | No such rows in the data; reviewed from source and tokens |
| Schedule "Conflicts first" colouring, live | Not toggled; reviewed from source and tokens |
| Screen reader | None run; findings come from the accessibility tree and the DOM |
| 200% zoom and text scaling, touch or mobile | Desktop app; out of scope |
| Running Tauri build | Not launched |
| Impeccable's in-page overlay | Needs `live-server.mjs`, which writes `.impeccable/live/`, which the contract forbids |

## 2. Critique results

**AI-slop verdict: not slop.** The colours are neutral greys (`#f6f7f9` light, `#15171b` dark) with one blue
accent. Corners are 6 px with a single border. There are no uppercase eyebrows, hero numbers or card grids. It passes
the product test ("would someone fluent in Linear or Notion trust it?") with a few places where they would pause:
- On `/tiers` in dark mode, Export… and Import… are unstyled browser buttons: grey, outset border, square corners.
- The home page's link field sits on the browser's default grey.
- "Seeds: tier order" is a bordered label that looks like a button.
- The active nav item uses a 3 px side stripe, a pattern the skill bans.

The detector found 3 things, none a real defect:

| Detector finding | Verdict |
|---|---|
| "side-tab" at `app.css:639` | False positive: a 1 px neutral nav divider |
| "layout-transition" at `app.css:522` and `:547` | True, but negligible: `width` transitions on two small progress fills |

`app/server.js` renders HTML from strings and the detector did not parse it.

**Nielsen heuristics: 24/40, Acceptable**

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Good status lines and the saved flash. While loading, the table is blank and a small pill sits at the bottom right. |
| 2 | Match with the real world | 3 | Mostly TO language. Internals leak: `registry/tiers.csv`, `out/<tournament>/`, URL slugs, "gameList". |
| 3 | User control and freedom | 2 | Keyboard seed moves save at once. The only undo is "Reset to tier order", which drops the whole arrangement. |
| 4 | Consistency | 2 | The two tier editors behave differently. Home and tournament pages use two date formats. One tooltip says "pick two" but the limit is 3. |
| 5 | Error prevention | 2 | The 0-10 tier range is not enforced, and a tier 11 exists. |
| 6 | Recognition over recall | 2 | No legend for the tier colours. Freeze and pin sit at 30-35% opacity until hover. |
| 7 | Flexibility and efficiency | 3 | Jump to, freeze, pins and keyboard seeding are good. The Tiers sheet has no find and no arrow keys. |
| 8 | Aesthetic and minimalist | 2 | At 900-1024 px the header takes about 38-42% of the window height. |
| 9 | Error recovery | 3 | Plain messages, but the Tiers read error has no style. |
| 10 | Help and documentation | 2 | "How to read this" is one dense paragraph. It never explains the colours or the Seeded column. |

**Cognitive load (tournament page): 4 of 8 checks fail, which is high.**

| Check | Result | Why |
|---|---|---|
| Single focus | Fail | Lifecycle and delete actions share the header with seeding controls |
| Visual hierarchy | Fail | No primary action. The most colourful control is the red "Delete tournament data". |
| Minimal choices | Fail | 13 header controls at 1024 px |
| Working memory | Fail | Tier colours are explained nowhere |
| Chunking | Pass | |
| Grouping | Pass | |
| One thing at a time | Pass | |
| Progressive disclosure | Pass | |

Other decision points with more than 4 options:
- The Schedule tab shows three "Refresh" buttons.
- Each seeding row has 9 tab stops.

**Strengths**
1. **The tokens work in both themes.** Dim text measures 5.4:1 in light and 6.4:1 in dark; links 6.9 and 6.3; tier digits 6.5-8.1.
2. **The one outward action is careful.** Push is a dry run first and then a confirmed second click. Archive says it can be undone. Delete says your tiers are kept.
3. **Keyboard work where it matters.**
   - Seed reordering has a live region and `aria-roledescription`.
   - The Tiers sheet headers are real buttons with `aria-sort`.
   - Both editors put focus back on Escape.

## 3. Audit results

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | Colour-only tier meaning; seeding sort is click-only; 2,178 tab stops on /tiers; a few contrast failures |
| 2 | Performance | 3 | Fine locally. Heavy spots: 52,955 DOM nodes on a 182-player page, and 5.7 MB of game logos on the home page that are never shown |
| 3 | Responsive | 2 | No horizontal page scroll anywhere. At the app's own minimum width, about one data column is visible. |
| 4 | Theming | 3 | Full token set and dark mode, but a few controls fall back to browser defaults in dark mode |
| 5 | Anti-patterns | 3 | Nav side stripe; 1 px border plus 24-40 px shadow on floating layers (PRODUCT.md lists this as an anti-reference) |
| **Total** | | **13/20** | **Acceptable** |

**Contrast (WCAG 2.2 AA), measured in both themes.** Text that fails:

| Element | Ratio | Where |
|---|---|---|
| start.gg source badge | 3.66:1, both themes | `app.css:24,404,450` |
| Home link-field placeholder, dark | 4.26:1 | `app.css:359` sets no background |
| `/tiers` Export… and Import…, dark | 4.39:1 | Unstyled |
| Reviewed ✓ (white on green), light | 4.25:1 | It is an icon, so the 3:1 non-text rule applies and it passes |

Non-text contrast:

| Element | Ratio |
|---|---|
| Control borders (`--line-strong` on `--cell`) | 1.63 light, 1.64 dark |
| Freeze ❄ and pin 📌 at rest | 1.6-2.5 |
| Tier recency fills against a plain cell | 1.23-2.07 |
| Schedule clash fills against a plain cell | 1.17-1.37 |
| Focus outline (`--accent`) | 6.9 light, 6.3 dark (passes) |

**Keyboard**
- Home: 15 stops, all with visible focus.
- Tournament page: every stop checked has visible focus. But the table's sort headers cannot be reached, there is no skip link, and there are about 1,600 stops in total.
- Tiers: every cell is a tab stop (2,178), and 1,117 of them are empty with no name.
- No keyboard traps found.

**Responsive**
- No page scrolls sideways at 1440, 1100, 900 or 700 px.
- The nav becomes icons below 1200 px; the links keep their names for screen readers.
- The tournament header plus the frozen columns crowd out the data (UX-04).

**Performance**
- No console errors on any page.
- Tournament data JSON is 2.2 MB and served uncompressed (local, about 54 ms).
- Home loads 36 requests and 5.7 MB, almost all game logos.
- Reduced motion: transitions stop, but the busy bar and spinners keep looping (UX-11).

## 4. Findings

Verification levels follow the persona's scale:
- **9:** I ran the check myself; the scripts are in the appendix so you can re-run them.
- **8:** a sub-agent measured it live, or I read it in source; I have not re-run it.
- **7:** source only, and the state could not be reached safely.

Severity: P1 fails WCAG AA or causes real difficulty; P2 has a workaround; P3 is polish. There is no P0: nothing stops a task outright.

| ID | Sev | Surface | Finding | Evidence | Fix direction | Ver. |
|---|---|---|---|---|---|---|
| UX-01 | P1 | Tournament table | Tier recency (reviewed here / old / never / tag-only) is shown by colour alone, and the fills barely differ from a plain cell. There is no legend. PRODUCT.md requires a non-colour cue. | `lib/view/render.js:217-221`; `app.css:299-304`. Live on `/t/eclipse-1st-cour`: "never" fill vs cell 1.23 light / 1.24 dark; "here" 1.40 light / 2.07 dark. Meaning is only in the `title`, which keyboard users never see. | Add a small glyph or letter in the cell, stronger fills, and a one-line legend by the table | 9 |
| UX-02 | P1 | Tournament table | Sorting the seeding table is click-only: the header cells have no button, no tabindex and no `aria-sort`. | `app/public/app.js:622-623`. Live: 15 header cells, 0 focusable, 0 with `aria-sort`. | Use the Tiers sheet's pattern: a `<button>` in each header plus `aria-sort` (`render.js:536`) | 9 |
| UX-03 | P1 | Tiers view | Every cell is a tab stop: 2,178 of them, 1,117 empty with no accessible name. No skip link, no arrow-key movement. | Live `/tiers`: 726 rows. Cell tabindex set in `tiers.js`. | One tab stop for the sheet with arrow keys inside it; label empty cells ("Alias for X, empty") | 9 |
| UX-04 | P1 | Tournament page, narrow window | At the app's own window sizes the header and frozen columns leave about one results column visible. | `src-tauri/src/main.rs:71-72` (opens 1440×900, minimum 900×500). Live: header bottom at 296 px of 768 at 1024 wide. At 900×700 with Freeze "Through Tier", only part of one results column shows (screenshot). | Below 1200 px, fold the event facts and lifecycle buttons into one line or a menu; default Freeze to fewer columns at narrow widths | 9 |
| UX-05 | P1 | Home | The start.gg source badge text fails contrast: white on `#3f80ff`, 11 px bold, 3.66:1, both themes. | `app.css:24,404,450`. Live `span.src.src-startgg`. | Darken the badge fill (around `#2459a6` passes) or use dark text | 9 |
| UX-06 | P1 | Home, Tiers (dark) | Some controls have no app styling, so dark mode shows browser defaults. The home link field is `#3b3b3b` and its placeholder is 4.26:1. On `/tiers`, Export… and Import… are grey `#6b6b6b` with an outset border and square corners (4.39:1), and the "Another game" select is 19 px tall. | `app.css:359` (no background); `server.js:205,214-215`; `.tier-tools` at `app.css:667` styles no buttons. Live on `#addUrl` and `#tierExport`. | Give these controls the app's button and input styles | 9 |
| UX-07 | P1 | Both tier editors | The 0-10 tier range is not enforced. The seeding editor allows up to 20 and the sheet has no limit. A tier of 11 already exists and shows unflagged, right under the sheet's own "Tier players from 0-10". | `app.js:1050` (`max="20"`); `tiers.js:85` (no max); `registry/tiers.csv:2` (tier 11). Live: 1 cell above 10 on `/tiers`. | Clamp to 0-10 in both editors and on the server; flag out-of-range rows | 9 |
| UX-08 | P2 | Schedule tab | Clash rows (red = main pools clash, orange = side game only) are colour-only, and the fills are 1.17-1.37:1 against a plain cell. | `schedule.js:69`; tokens `app.css:25,405`. Computed from tokens. | Add a "Clash" or "Side" text tag in the row | 8 |
| UX-09 | P2 | Tournament table | Freeze ❄ and pin 📌 controls are nearly invisible at rest: 1.6-2.5:1 at 30-35% opacity, and pin is also grayscale. | `app.css:161,166`. Measured live by sub-agent B. | Rest at 0.6+ opacity, or show them on row hover and focus only, with a visible empty state | 8 |
| UX-10 | P2 | Home | Each tournament row is a focusable `role=link` with another link inside it, so it takes two tab stops. Delete is only in a right-click menu, announced only by a hover title. | `index.js:37` (role and tabIndex); `server.js:246` (`title="Right-click for options"`). Live: `li[data-t]` role link, 1 inner `<a>`. | Make the row one link; add a visible "…" menu button that also opens with the keyboard | 9 |
| UX-11 | P2 | All pages | Reduced motion is only partly respected. The busy bar, spinners and "pulling…" chip keep looping. The theme cross-fade uses `!important` and beats the reduce rule. The Tauri shell's dots pulse regardless. | `app.css:272-275` vs `:521,529,532`; `:444-445`; `src-tauri/shell/index.html:22-23` | Stop or slow these under `prefers-reduced-motion`; drop `!important` on the fade | 8 |
| UX-12 | P2 | Tournament toolbar | Lifecycle and destructive actions sit in the main seeding toolbar. "Delete tournament data" (red outline) is the most eye-catching control. "Archive" and "Archive standings" are different actions with the same verb. | `tournament.html:42-45`. Live screenshot at 900 px. | Move the lifecycle actions into a "Tournament…" menu; rename "Archive standings" to "Save final standings" | 9 |
| UX-13 | P2 | Tournament table | The Seeded column shows a ✓ on rows not yet reviewed, so they look done already. The header says "Seeded"; the tooltip says "Mark as reviewed". | `render.js:338-340` (the ✓ is in both states). Live: an unpressed button's text is "✓". | Use an empty circle when not reviewed; pick one word ("Reviewed") for header and tooltip | 9 |
| UX-14 | P2 | Tier editing | The two tier editors behave differently. The seeding table opens a popover on double-click with an "Enter saves · Esc cancels" hint. The sheet opens an inline input on single click with no hint. | `app.js:1046-1051` vs `tiers.js:80-90`. Seen live by sub-agent A. | Pick one way to open, show the same hint, and use one range rule (see UX-07) | 8 |
| UX-15 | P2 | Copy, several places | Internal names leak into what users read: `registry/tiers.csv` and `out/<tournament>/` in tooltips; the tier hover shows the URL slug ("at eclipse-1st-cour"); "Checking the gameList…"; "API key" in one place and "API token" in another; "discriminator" unexplained on home; the shell says ".env has no STARTGG_TOKEN". | `tournament.html:45,58`; `render.js:207`; `index.js:160,172`; `account.js:56,65`; `server.js:165`; `src-tauri/shell/index.html:46` | Rewrite in TO words: "your tiers", the tournament's name, "start.gg player id", "player list" | 9 |
| UX-16 | P2 | Home | The home page loads 27 game logos (5.7 MB, some 1500×1500) for a list inside a closed modal and shows them at 20-22 px. None use `loading="lazy"`. | `server.js:162`; `app.css:506,512`. Live: 27 images, 5,724,507 bytes. | Lazy-load them or render the list when the modal opens; ship 44 px thumbnails | 9 |
| UX-17 | P2 | Tournament page | 52,955 DOM nodes for 182 players. Most sit inside 302 closed `<details>` built up front. The data JSON is 2.2 MB and uncompressed. | Live DOM count on `/t/eclipse-1st-cour`. The closed-`<details>` split and JSON size were measured by sub-agent B. | Build the "Other games"/"Other series" tables when first opened; gzip the API | 9 / 8 |
| UX-18 | P2 | Tournament table | Some targets are under 24×24 px (WCAG 2.2 SC 2.5.8): the drag handle (19×14) next to the compare checkbox (14×14), freeze (18×18), and the pin (24×15). | `app.css:89,160,166,593`. Measured live by sub-agent B. | Pad these hit areas to 24 px | 8 |
| UX-19 | P2 | All pages | No skip link. The first tab stop is the account bar's "Change…". Each seeding row costs 9 stops. | Live: no skip link on any page. About 1,612 stops on Eclipse (sub-agent A). | Add "Skip to table"; take pin and compare out of the tab order behind a row action | 9 / 8 |
| UX-20 | P2 | Tiers view | The read-error message has class `err`, but `.err` is only styled inside `.status`, so the error shows as plain text. | `server.js:211`; `app.css:92,320` | Style it like the other error notices | 9 |
| UX-21 | P2 | Help | "How to read this" never explains the tier colours, the Seeded column or Freeze. Below 1200 px the nav is icons only, with names only in tooltips. | `tournament.html` "How to read this" block (from about line 75); `app.css:644-649` | Add the legend (UX-01) and one line per column; keep the icon rail but add tooltips that also show on focus | 8 |
| UX-22 | P2 | Inputs, both themes | Control borders are 1.63:1, under the 3:1 needed for a control's boundary (SC 1.4.11). Text inputs are marked only by that border. | `app.css:8,393` (`--line-strong`); computed | Add a separate, darker control-border token for inputs and selects only | 9 |
| UX-23 | P3 | Tournament toolbar | Focus on the Freeze select and the Jump to field is a 1 px border change plus a faint halo (1.3-1.5:1). It passes AA but is weak next to the 2 px outline everywhere else. | `app.css:87` | Use the global 2 px `:focus-visible` outline | 8 |
| UX-24 | P3 | Floating layers | Menus, modals, the busy pill and the export card use a 1 px border plus a 24-40 px shadow, which PRODUCT.md names as an anti-reference. Floating layers do need some lift. | `app.css:481,492,509,526,543,565` | Keep the border, cut the blur to 8 px or less | 9 |
| UX-25 | P3 | Nav | The active nav item has a 3 px left accent stripe, a pattern the skill bans. | `app.css:642` | Use the fill alone, or a full outline | 9 |
| UX-26 | P3 | Tournament page | While loading, the table area is blank and the Freeze select is empty for over a second, with no placeholder. | Seen live on `/t/mixfest-2026-mbaacc` by sub-agent B | Show skeleton rows in the table | 8 |
| UX-27 | P3 | Tauri shell | No `lang`, a different blue (`#3b82f6`), always dark. | `src-tauri/shell/index.html:22`; no `lang` attribute | Reuse the app's tokens and add `lang="en"` | 8 |
| UX-28 | P3 | Account bar (off / warn) | Dim text ("start.gg" prefix) on the red or amber bar is 4.47:1 (light, red) and 4.46:1 (dark, amber). | `app.css:561,575,606`; computed from tokens, state not reached | Inherit the bar's text colour in those states | 7 |
| UX-29 | P3 | Dates | Home shows "2026-10-30 20:15 UTC"; the tournament page shows local "10/15/2026, 9:25:07 AM". | `server.js:241`; `tournament.js:57`; screenshot | One format, local time | 9 |
| UX-30 | P3 | Notices | A failed Dismiss just re-enables the button with no message, against principle 4 ("nothing is lost silently"). | `notices.js:15` | Show "Couldn't dismiss, try again" | 9 |
| UX-31 | P3 | Small copy | The compare checkbox says "pick two" but the limit is 3. A disabled button shows a busy cursor everywhere, e.g. "Approve selected (0)". | `render.js:330`; `app.css:534` | Fix the word; only use `cursor: progress` while something is actually running | 9 |
| UX-32 | P3 | CSS upkeep | `app.css:1` still says "Light only". The dark token block is written twice and could drift. Two progress fills animate `width`. | `app.css:1`, `:390-408` vs `:410-428`, `:522,547` | Fix the comment; define the dark tokens once; use `transform: scaleX` | 9 |

**Counts: P0 0 · P1 7 · P2 15 · P3 10 (32 total).**

## 5. Top 5 to do first

1. **UX-01 Tier recency cue and legend.** The tier is what this app produces, and PRODUCT.md names this exact requirement. Right now someone who can't tell the colours apart, or is using the keyboard, cannot see which tiers are stale.
2. **UX-02 Keyboard sort on the seeding table.** Cheap, because the Tiers sheet already has the right pattern to copy (`render.js:536`). It closes the gap in "full keyboard operation of every view".
3. **UX-07 Enforce the 0-10 tier range.** A tier 11 already exists in your data, and start.gg only supports 0-10, so this protects the push step. It is a few lines in two editors plus a server check.
4. **UX-04 Give the table its height back below 1200 px.** The app opens at 1440 but can be shrunk to 900. At that size the header and frozen columns leave about one results column, which works against "the data is the interface".
5. **UX-05, UX-06 and UX-22 together: the contrast fixes.** All three are token or style changes in `app.css`: the badge fill, the unstyled dark-mode controls, and a control-border token. Together they clear every AA text-contrast failure found.

Next after these: UX-03 (one tab stop for the Tiers sheet) is worth doing, but it is a bigger change to `tiers.js`'s keyboard model.

Impeccable's own suggested commands for these, kept here as recommendations and not run: `colorize` or `clarify` for UX-01, `harden` for UX-02, UX-03 and UX-07, `adapt` for UX-04, `polish` for UX-05/06/22, `optimize` for UX-16/17, `clarify` for UX-15.

## 6. Terms as understood, and spend

**Terms**
- Allowed work: a UX/UI review using impeccable, and nothing else. No source edits, no commits, no pushes.
- Files written: this report, and `.impeccable/critique/2026-11-21T06-12-06Z__app-public.md` (impeccable's snapshot).
- Goal: find and rank what to polish, not polish it.
- Acceptance: every finding carries evidence, a severity and a verification level.
- The running app was read-only. No data-changing or start.gg-calling control was pressed. One Tier editor was opened and closed with Escape by sub-agent A.
- No `init`, `document` or `.impeccable/live/` writes.

**Gaps I filled on my own**
- "Both themes" was tested by setting the theme attribute inside the page, not by clicking the switch, so your saved theme choice in that browser was not changed.
- The in-page overlay was skipped because its server writes to `.impeccable/live/`.
- The critique snapshot's P1 count (4) comes from the critique alone. The merged table above (7) also includes the audit's findings.

**Sources**
- Persona: `personal-staff/personas/library/lead-engineer.md` v0.4.0.
- Product context: `PRODUCT.md` (register: product).
- Visual system: `app/public/app.css`. No DESIGN.md exists.
- Not consulted: the persona's standards bank and runbook (`personas/grounding/`), because this job was a review and not a build.

**Spend**
- Sub-agents: 2 of 4 allowed (Assessment A, about 238k tokens; Assessment B, about 220k tokens).
- Impeccable commands: `critique` and `audit` only.
- The detector ran twice: once by B, once by me to check B's result. Same 3 findings.
- The sub-agents' scratch files are in the session scratchpad, not in the repo.

## Appendix: re-runnable checks behind the level-9 items

Paste into the browser console on the named page. The first block on `/t/eclipse-1st-cour`:

```js
const L=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};
const lum=s=>{const m=s.match(/\d+(\.\d+)?/g).map(Number);return .2126*L(m[0])+.7152*L(m[1])+.0722*L(m[2])};
const cr=(a,b)=>{const x=lum(a),y=lum(b);return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
const top=[...document.querySelector('#summary').tHead.rows].flatMap(r=>[...r.cells]);
const cell=getComputedStyle(document.querySelector('#summary td.team')).backgroundColor;
({ headers: top.length, focusable: top.filter(t=>t.tabIndex>=0).length, ariaSort: top.filter(t=>t.hasAttribute('aria-sort')).length,
   dom: document.getElementsByTagName('*').length,
   never: cr(getComputedStyle(document.querySelector('#summary td.tier.rec-never')).backgroundColor, cell),
   here:  cr(getComputedStyle(document.querySelector('#summary td.tier.rec-here')).backgroundColor, cell),
   uncheckedSeedText: document.querySelector('button.seed-btn[aria-pressed=false]').textContent })
```

On `/`: `span.src.src-startgg` colour pair (expect 3.66); `getComputedStyle(document.querySelector('#addUrl')).backgroundColor` in dark;
`performance.getEntriesByType('resource').filter(r=>r.initiatorType==='img')` (27 entries, about 5.7 MB).
On `/tiers`: `[...document.querySelectorAll('table.tier-sheet td')].filter(t=>t.tabIndex>=0).length` (2178), and
`getComputedStyle(document.querySelector('#tierExport'))` in dark (`#6b6b6b`, outset border, 0 radius).
Token ratios (UX-08, UX-22, UX-28): the WCAG formula on the hex values in `app.css:6-28` and `:390-408`.
Detector: `node C:/Users/iknow/.claude/skills/impeccable/scripts/detect.mjs --json app/public src-tauri/shell` (exit 2, 3 findings).
