# Build record — seeding-ops, increment 3, build A

Contract: [`dispatch-contract-tool.md`](dispatch-contract-tool.md). Spec: [`design-tool.md`](design-tool.md).
One section per pass. Increment 1's passes 2–4 remain open ([`build-record.md`](build-record.md)) and are
due with build B (spec §Next steps, step 4).

---

## Pre-pass — snapshot and rename (orchestrating session, 2026-10-29)

Recorded here as out-of-band work per the standing rule the spec assumes (A4-6 rule (a): record every
out-of-band change before the next pass). Done by the orchestrating session on Noah's instruction
*"going with 'seeding-ops'. go ahead and change names everywhere and start the whole build."*

**Rename.** `C:\Users\iknow\repos\seeding-script` → `C:\Users\iknow\repos\seeding-ops`. Live docs,
`package.json` (name, description) and the README title updated. Historical records (`design.md`,
`design-webapp.md`, `dispatch-contract*.md`, `build-record*.md` for increments 1 and 2) keep the old
name as written. `docs/usage-log.md` line 3 notes the rename (the orchestrator's one permitted edit
there; no seat edits that file).

**Snapshot commit on `build/webapp`** (everything that was uncommitted when the spec was approved):

| what | state before | note |
|---|---|---|
| `registry/tiers.csv` | 713 insertions / 654 deletions vs HEAD | Noah's tier edits from Eclipse (107 app-set tiers). Committed as is; the T1 migration in pass 1 starts from this. |
| `conflicts/` (`pull-schedule.js`, `lib/`, `public/`, `linked.json`), `test/conflicts-schedule.test.js`, `app/server.js` (+75), `package.json` (`npm run schedule`) | untracked / modified since 2026-10-16 | the schedule-conflicts feature, built outside the seeding session; becomes T3 in build B |
| `conflicts/out/` | 7.3 MB of schedule pulls | **not committed**; added to `.gitignore` |
| `.claude/launch.json` | untracked | the app's preview launcher |
| `docs/design-tool.md`, `docs/dispatch-contract-tool.md`, this file | new | spec, contract, record |

Branch for build A: `build/tool-a` from that commit. Models: Opus for every seat (Noah's ruling).

---
