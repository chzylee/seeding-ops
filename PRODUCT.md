# Product

## Register

product

## Users

Fighting-game tournament organizers (TOs) seeding their own events. Today that is Noah; sharing with
other TOs is the stated second goal (`docs/design-tool.md`, "Realer"). They use it at a desk in the
days before an event, sometimes for a 180+ player bracket, often in long sessions. The jobs, in
Noah's words: profiling ("looking over results, profiling a player, assigning a tier"), seeding
("arranging players, adjusting tiers, looking at data for tie-breakers"), and handing the tiers to
start.gg's seed generator.

## Product Purpose

A local app (browser page or Tauri desktop shell) that pulls two years of start.gg results for every
registrant, keeps a per-game tier registry (0-10), and shows one page per tournament with a tab per
game. It ends at tiers; pushing them into start.gg is an optional last step. Success: a TO can set
or confirm every tier for an event from one page without re-pulling data or typing seeds by hand.
Scope line: "it's 3 tables, and clicking a page for seeding an event shows a slice of data."

## Brand Personality

Friendly to new TOs: clear enough that another organizer can pick it up without a walkthrough.
Plain, calm, competent. Labels say what things do; no jargon, no cleverness in the copy. Results
are shown as tables, not bullets (binding display rules in `docs/usage-log.md`).

## Anti-references

- The AI-generated look: cream/sand backgrounds, tracked uppercase eyebrows, over-rounded cards,
  ghost-card border-plus-wide-shadow, hero metrics.
- A start.gg clone: it sits next to start.gg, it shouldn't mimic start.gg's admin UI.
- Gamer-RGB: neon, glow, esports-overlay styling.

## Design Principles

1. **The data is the interface.** Tables carry the work; chrome stays out of their way.
2. **Learnable without a walkthrough.** A new TO should find each action where they look for it,
   with labels in plain words.
3. **Three tables, not a platform.** Resist features and surfaces beyond the stated scope.
4. **Nothing is lost silently.** Edits, pulls and pushes say what happened, and destructive steps
   confirm first.
5. **No AI on FGC-facing surfaces** (Noah's standing rule); the share phase must not carry it.

## Accessibility & Inclusion

WCAG 2.2 AA: 4.5:1 text contrast in both light and dark themes, full keyboard operation of every
view (the Tiers sheet editor especially), visible focus, and color never the only carrier of
meaning. One owner-ruled exception: tier recency is color plus hover and screen-reader words, with no
visible mark (the marks were tried in Amendment A4 and removed in Noah's review, 2026-11-21). Respect
`prefers-reduced-motion`.
