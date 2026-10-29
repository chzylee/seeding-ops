# Test fixtures

| file | source |
|---|---|
| `error-badtoken-400.json` | **Recorded** live response to a bad token. Copied from `startgg-results/fixtures/error-badtoken-400.json` (credit: the startgg-results build, decision D-8). |
| `entrants-page.json` | **Synthetic**: hand-built in the shape `lib/startgg.js` `Q_ENTRANTS` requests. |
| `user-events-page.json` | **Synthetic**: hand-built in the shape of `Q_USER_EVENTS`, matching the Q-1 probe's `user.events` response (see docs/build-record.md). |
| `recent-standings.json` | **Synthetic**: hand-built in the shape of `Q_RECENT_STANDINGS`, including a non-Event container. |

`scripts/record-fixtures.js` writes real responses (bodies only: no token, no headers) to `recorded/`. `test/recorded-shape.test.js` runs the parsers over them (it skips, with the reason printed, if they are missing). The synthetic files stay: their exact values are what the unit tests assert.

`recorded/` was recorded on 2026-10-29 (build B pass 3, increment 1's C2-1): `event.json` and `entrants-page.json` (10 of 21 entrants) from `crescendo-of-night-3-episode-0` / `allegro-mbtl-pc`, `user-events-page.json` (10 of GeneralMidwest's 428 events, `user/14364d39`), and `recent-standings.json` (one of that event's players, MBTL). Each file keeps only `data`, the query's variables, `_recorded_on` and `extensions.queryComplexity`, and the test anchors its window to `_recorded_on`, so its result does not change with the day it runs.
