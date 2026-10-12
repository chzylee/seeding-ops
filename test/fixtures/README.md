# Test fixtures

| file | source |
|---|---|
| `error-badtoken-400.json` | **Recorded** live response to a bad token. Copied from `startgg-results/fixtures/error-badtoken-400.json` (credit: the startgg-results build, decision D-8). |
| `entrants-page.json` | **Synthetic**: hand-built in the shape `lib/startgg.js` `Q_ENTRANTS` requests. |
| `user-events-page.json` | **Synthetic**: hand-built in the shape of `Q_USER_EVENTS`, matching the Q-1 probe's `user.events` response (see docs/build-record.md). |
| `recent-standings.json` | **Synthetic**: hand-built in the shape of `Q_RECENT_STANDINGS`, including a non-Event container. |

`scripts/record-fixtures.js` replaces the synthetic files with real responses once a token is in `.env`. It writes no token and no headers.
