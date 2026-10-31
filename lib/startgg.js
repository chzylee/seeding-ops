'use strict';
// lib/startgg.js — the start.gg client: URL parsing, error classification, the GraphQL
// queries this tool sends, and a request function that paces, retries and logs.
// It knows nothing about players, windows or files. lib/history.js and lib/output.js do.

const pacing = require('./pacing');

const ENDPOINT = 'https://api.start.gg/gql/alpha';
const REQUEST_TIMEOUT_MS = 30_000;

// Page sizes. queryComplexity must stay under 1000 per request.
// - user.events: the Q-1 probe measured 351 at perPage 50 (about 7 per event node) with one
//   more field (userEntrant.id) than we request. 120 x 7 ~ 843. The live run records the
//   real maximum in meta.json (query_complexity_max).
// - entrants: about 5 objects per node (entrant, participant, player, user, location).
const USER_EVENTS_PER_PAGE = 120;
const ENTRANTS_PER_PAGE = 100;
const RECENT_STANDINGS_LIMIT = 20; // start.gg's cap

// ---- Queries ------------------------------------------------------------------------------
// Each has an operation name so the request log and the test fakes can tell them apart.

const Q_EVENT = `query ResolveEvent($slug: String!) {
  event(slug: $slug) {
    id slug name startAt numEntrants
    videogame { id name }
    tournament { name }
  }
}`;

// Never request city (design, Data source step 2).
const Q_ENTRANTS = `query EventEntrants($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    entrants(query: { page: $page, perPage: $perPage }) {
      pageInfo { total totalPages }
      nodes {
        id
        participants {
          id
          player {
            id gamerTag prefix
            user { id slug location { state country } }
          }
        }
      }
    }
  }
}`;

const Q_USER_EVENTS = `query UserEvents($userId: ID!, $page: Int!, $perPage: Int!) {
  user(id: $userId) {
    events(query: { page: $page, perPage: $perPage }) {
      pageInfo { total totalPages }
      nodes {
        id slug name startAt numEntrants isOnline
        videogame { id name }
        tournament { name }
        userEntrant(userId: $userId) { standing { placement } }
      }
    }
  }
}`;

const STANDING_FIELDS = `placement
      container {
        __typename
        ... on Event {
          id slug name startAt numEntrants isOnline
          videogame { id name }
          tournament { name }
        }
      }`;

// For a registrant with no linked user. One call per game we can identify.
const Q_RECENT_STANDINGS = `query RecentStandings($playerId: ID!, $videogameId: ID!, $limit: Int!) {
  player(id: $playerId) {
    recentStandings(videogameId: $videogameId, limit: $limit) {
      ${STANDING_FIELDS}
    }
  }
}`;

// The same without a game filter. Used only if the schema check shows videogameId is optional
// (design, Data source step 4). See ALL_GAMES_FALLBACK below.
const Q_RECENT_STANDINGS_ANY_GAME = `query RecentStandingsAnyGame($playerId: ID!, $limit: Int!) {
  player(id: $playerId) {
    recentStandings(limit: $limit) {
      ${STANDING_FIELDS}
    }
  }
}`;

// Build C (Amendment A1.3): one start.gg user by discriminator, for a CSV upload. The fields are the
// ones A1.3 names as verified (id, discriminator, player { id gamerTag prefix }, location); location
// takes state and country only, as the entrants query does (never city).
const Q_USER_BY_SLUG = `query UserBySlug($slug: String!) {
  user(slug: $slug) {
    id discriminator
    location { state country }
    player { id gamerTag prefix }
  }
}`;

// Whether to also call recentStandings with no videogameId. UNVERIFIED until
// scripts/schema-check.js runs against the live schema. If the argument is required, the call
// would fail validation and stop the run, so it stays off until the check confirms it.
const ALL_GAMES_FALLBACK = false;

// ---- Increment 3 (docs/design-tool.md): the tournament pool, the push, the archive -----------
// One request for a tournament's events: add a tournament, and the pool pull's first step. The
// fields are those the schedule query (conflicts' TournamentSchedule, live-verified 2026-10-16)
// already used, plus Event.type (1 = singles; model knowledge, exercised by the live CoN3 Ep0
// pull) for the singles-only picker.
const Q_TOURNAMENT_EVENTS = `query TournamentEvents($slug: String!) {
  tournament(slug: $slug) {
    id slug name startAt timezone
    events {
      id slug name startAt numEntrants type
      videogame { id name }
      phases { id name phaseOrder }
    }
  }
}`;

// A phase's seeds in start.gg's current order (the push dry run). Shape from start.gg's
// update-phase-seeding example (docs/design-tool.md, Landscape). Read-only.
const SEEDS_PER_PAGE = 100;
const Q_PHASE_SEEDS = `query PhaseSeeds($phaseId: ID!, $page: Int!, $perPage: Int!) {
  phase(id: $phaseId) {
    id name
    seeds(query: { page: $page, perPage: $perPage }) {
      pageInfo { total totalPages }
      nodes { id seedNum entrant { id name participants { player { id gamerTag prefix } } } }
    }
  }
}`;

// The post. Built and tested against the fake only; never sent live in build B (contract,
// Prohibitions). Mutation and input type from start.gg's docs (design-tool.md, Landscape).
const M_UPDATE_PHASE_SEEDING = `mutation UpdatePhaseSeeding($phaseId: ID!, $seedMapping: [UpdatePhaseSeedInfo]!) {
  updatePhaseSeeding(phaseId: $phaseId, seedMapping: $seedMapping) { id }
}`;

// Final standings of one event (the optional archive). Field names are model knowledge, tested
// against the fake only.
const STANDINGS_PER_PAGE = 100;
const Q_EVENT_STANDINGS = `query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
  event(id: $eventId) {
    id slug
    standings(query: { page: $page, perPage: $perPage }) {
      pageInfo { total totalPages }
      nodes { placement entrant { id name participants { player { id gamerTag } } } }
    }
  }
}`;

// ---- Slug parsing -------------------------------------------------------------------------
// COPIED VERBATIM from startgg-results/core.js:33 (parseEventSlug), also carried at
// startgg-results/merge/startgg.js:54. Credit: the startgg-results build. Its tests are ported
// to test/slug.test.js.
// Accepts a full event URL (with/without protocol, trailing paths, surrounding whitespace) or a
// raw "tournament/<t>/event/<e>" slug. Returns { slug } or { error: 'not-an-event-url' }.
function parseEventSlug(input) {
  if (input == null) return { error: 'not-an-event-url' };
  var s = String(input).trim();
  if (!s) return { error: 'not-an-event-url' };
  s = s.replace(/^[a-z]+:\/\//i, '');
  s = s.replace(/^[^/]*start\.gg\/?/i, '');
  s = s.replace(/^\/+/, '');
  var m = s.match(/tournament\/([^/]+)\/event\/([^/?#]+)/i);
  if (!m) return { error: 'not-an-event-url' };
  return { slug: 'tournament/' + m[1] + '/event/' + m[2] };
}

// A tournament URL, any of its event URLs, or a bare tournament slug -> the tournament slug
// (lower case), else null. Moved here from conflicts/lib/schedule.js (the schedule feature, T3).
function parseTournamentSlug(input) {
  const s = String(input == null ? '' : input).trim();
  const m = s.match(/tournament\/([^/?#\s]+)/i);
  if (m) return m[1].toLowerCase();
  if (/^[a-z0-9][a-z0-9-]*$/i.test(s)) return s.toLowerCase();
  return null;
}

// ---- Error classification -----------------------------------------------------------------
// ADAPTED from startgg-results/core.js:52 (classifyError). Kept unchanged: the live-verified
// rules that a bad token is HTTP 400 recognized by its BODY, never by a 401 status alone
// (startgg-results D-8), and that a GraphQL error carrying an auth message is a bad token.
// Changed for this tool, which retries some failures and stops on others:
//   - 5xx is its own kind, 'server' (retryable). The original folded it into 'network'.
//   - GraphQL errors split on the spec's `path` rule: an error without `path` was raised
//     before execution (validation, schema, query complexity) and is 'query' (fatal). One with
//     `path` happened while resolving a field and is 'server' (retryable).
//   - Other 4xx without the auth signature are 'query' (fatal), not 'network'.
//   - A rate-limit message is checked before the auth regex. start.gg's rate-limit text is
//     believed to mention "api-token" (model knowledge, unverified), which the auth regex would
//     otherwise misread as a bad token.
//   - A2-2 (usage-log.md 2026-10-15): start.gg also enforces a server-time budget, separate from
//     the 80/min request count (plain 429, 'rate-limited', short exponential backoff), with its
//     own message: "You have gone over the threshold for recent request time. Please wait before
//     sending another request." BUDGET_RE recognizes this literal phrase and classifies it as its
//     own kind, 'time-budget' — not 'rate-limited' — so it gets its own (long) retry schedule
//     (pacing.js: a flat 90 s wait, up to ~8 tries) without changing the already-working 429
//     schedule. Checked in every shape it can arrive in: a pre-execution GraphQL error with no
//     `path`, a GraphQL error with a `path`, or an HTTP 4xx body message — all three are checked
//     against BUDGET_RE before anything else in this function, including before the 429 check.
// Returns 'bad-token' | 'event-not-found' | 'rate-limited' | 'time-budget' | 'server' | 'network'
// | 'query'.
const AUTH_RE = /auth|token|unauthor/i;
const RATE_RE = /rate limit/i;
const BUDGET_RE = /over the threshold for (recent )?request time/i;

function classifyError(o) {
  o = o || {};
  if (o.threw) return 'network';
  const status = o.httpStatus;
  const body = o.body;
  const gqlErrors = o.graphqlErrors;
  const bodyMsg = body && typeof body.message === 'string' ? body.message : '';

  if (BUDGET_RE.test(bodyMsg)) return 'time-budget';
  if (status === 429 || RATE_RE.test(bodyMsg)) return 'rate-limited';
  if (gqlErrors && gqlErrors.length) {
    for (const e of gqlErrors) {
      const msg = (e && e.message) || '';
      if (BUDGET_RE.test(msg)) return 'time-budget';
    }
    for (const e of gqlErrors) {
      const msg = (e && e.message) || '';
      if (RATE_RE.test(msg)) return 'rate-limited';
    }
    for (const e of gqlErrors) {
      const msg = (e && e.message) || '';
      if (AUTH_RE.test(msg)) return 'bad-token';
    }
  }
  if (status && status >= 500) return 'server';
  if (status && status >= 400) {
    if (body && (body.success === false || AUTH_RE.test(bodyMsg))) return 'bad-token';
    return 'query';
  }
  if (o.eventNull) return 'event-not-found';
  if (gqlErrors && gqlErrors.length) {
    return gqlErrors.every((e) => e && Array.isArray(e.path) && e.path.length) ? 'server' : 'query';
  }
  return 'network';
}

// ---- Errors -------------------------------------------------------------------------------

class StartggError extends Error {
  constructor(kind, detail, extra = {}) {
    super(detail);
    this.name = 'StartggError';
    this.kind = kind;
    this.fatal = !pacing.isRetryable(kind);
    Object.assign(this, extra);
  }
}

// ---- The client ---------------------------------------------------------------------------
// createClient returns { request, stats }. request(opName, query, variables, tag) resolves to
// the response's `data` or throws a StartggError after retries run out (or at once for a
// fatal kind). Every send goes through the pacer, retries included.
//
// Options (all injectable for tests):
//   token        the bearer token. Never logged, never put on an error.
//   fetchImpl    defaults to global fetch
//   now, sleep   clock and timer
//   onRequest    called with one log record per send (no token, no headers)
//   priorSends   send times (ms) from an earlier process, so a resumed run keeps pacing
//   timeoutMs    per-send timeout (default REQUEST_TIMEOUT_MS), counted from the actual send
// The returned client's `onRequest` may be replaced after creation (pull.js hands one client to
// lib/run.js, which then routes the records into the pull's own request log).
function createClient(opts) {
  const token = opts.token;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const now = opts.now || Date.now;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const endpoint = opts.endpoint || ENDPOINT;
  const sentAt = [...(opts.priorSends || [])];
  const stats = { requests: 0, complexityMax: 0, retries: 0 };
  const timeoutMs = opts.timeoutMs || REQUEST_TIMEOUT_MS;

  async function sendOnce(query, variables, onSent) {
    let res;
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ query, variables }),
    };
    // D2-3: the timeout counts from the moment the request is SENT. A fetch that may hold a call
    // before sending it (app/queue.js, app/limit-fetch.js) says so with `timeoutAtSend` and arms
    // the timeout itself when it sends; any other fetch sends when called, so it is armed here.
    // E2-1: such a fetch also reports the send time (init.onSent), for the request log.
    if (fetchImpl.timeoutAtSend) { init.timeoutMs = timeoutMs; init.onSent = onSent; }
    else init.signal = AbortSignal.timeout(timeoutMs);
    try {
      res = await fetchImpl(endpoint, init);
    } catch (err) {
      // A fetch wrapper may refuse a send because the job was stopped (app/jobs.js cancel): that is
      // final, not a network failure to retry.
      if (err && err.kind === 'cancelled') return { ok: false, kind: 'cancelled', status: 0, detail: 'stopped' };
      return { ok: false, kind: 'network', status: 0, detail: (err && err.message) || 'network error' };
    }
    const status = res.status;
    let text = '';
    try { text = await res.text(); } catch { text = ''; }
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    const complexity = body && body.extensions && typeof body.extensions.queryComplexity === 'number'
      ? body.extensions.queryComplexity : null;
    const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0;
    if (!res.ok || (body && body.errors && body.errors.length)) {
      const errors = body && body.errors;
      const kind = classifyError({ httpStatus: res.ok ? 200 : status, body, graphqlErrors: errors });
      const detail = (errors && errors[0] && errors[0].message) || (body && body.message) || ('HTTP ' + status);
      return { ok: false, kind, status, detail, complexity, retryAfterMs };
    }
    return { ok: true, status, data: (body && body.data) || null, complexity };
  }

  // opts.retry === false: only a rate limit is retried (it is queued like everything else); any other
  // failure is final on the first try. The seeding post uses it (docs/design-tool.md, Outputs: failure
  // modes are shown as a status line, no retry).
  async function request(opName, query, variables, tag = {}, opts = {}) {
    let last;
    const retryable = (kind) => pacing.isRetryable(kind) && (opts.retry !== false || kind === 'rate-limited' || kind === 'time-budget');
    // The try ceiling depends on the failure's own kind (pacing.maxTriesFor): 'time-budget'
    // (A2-2's server-time-budget error — a distinct kind from 'rate-limited', the plain 429/
    // 80-per-minute count) gets ~8 tries at a flat 90 s wait instead of the general 5 tries of
    // exponential backoff, re-checked after every attempt since the kind can only be known once a
    // response comes back. (A4-5: this comment previously said 'rate-limited'.)
    for (let attempt = 1; ; attempt++) {
      const wait = pacing.delayBeforeNext(sentAt, now());
      if (wait > 0) await sleep(wait);
      const t = now();
      sentAt.push(t);
      // Keep the list short: only the last window matters.
      while (sentAt.length > pacing.MAX_REQUESTS * 2) sentAt.shift();
      stats.requests++;
      // E2-1 (build C pass 2): the record is stamped with the time the request was SENT. A fetch that
      // holds calls (the app's queue) reports it; any other fetch sends when called, at `t`. When the
      // two differ the record also keeps `queued_ms`, the time it was handed over.
      let sent = null;
      const out = await sendOnce(query, variables, (ms) => { sent = ms; });
      if (out.complexity != null) stats.complexityMax = Math.max(stats.complexityMax, out.complexity);
      const at = sent ?? t;
      const record = {
        t: new Date(at).toISOString(), ms: at, ...(at !== t ? { queued_ms: t } : {}), op: opName, ...tag, attempt,
        status: out.status, complexity: out.complexity ?? null,
      };
      if (out.ok) {
        api.onRequest(record);
        return out.data;
      }
      record.kind = out.kind;
      record.error = out.detail;
      last = out;
      if (!retryable(out.kind) || attempt >= pacing.maxTriesFor(out.kind)) {
        api.onRequest(record);
        break;
      }
      const backoff = pacing.backoffMs(attempt + 1, out.retryAfterMs, out.kind);
      record.retry_in_ms = backoff;
      api.onRequest(record);
      stats.retries++;
      await sleep(backoff);
    }
    const gaveUp = retryable(last.kind);
    const maxTries = pacing.maxTriesFor(last.kind);
    const detail = gaveUp
      ? `${opName}: gave up after ${maxTries} tries (${last.kind}: ${last.detail})`
      : `${opName}: ${last.kind}: ${last.detail}`;
    throw new StartggError(last.kind, detail, { status: last.status, exhausted: gaveUp });
  }

  const api = { request, stats, onRequest: opts.onRequest || (() => {}) };
  return api;
}

// ---- API calls ----------------------------------------------------------------------------

async function resolveEvent(client, slug) {
  const data = await client.request('ResolveEvent', Q_EVENT, { slug });
  const ev = data && data.event;
  if (!ev) throw new StartggError('event-not-found', `No event found for "${slug}".`);
  return ev;
}

// Pages event.entrants to the end. Returns the raw entrant nodes in API order.
async function fetchEntrants(client, eventId, onPage = () => {}) {
  const all = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const data = await client.request('EventEntrants', Q_ENTRANTS,
      { eventId, page, perPage: ENTRANTS_PER_PAGE }, { page });
    const conn = data && data.event && data.event.entrants;
    if (!conn) throw new StartggError('query', `EventEntrants: no entrants returned for event ${eventId} (page ${page}).`);
    totalPages = (conn.pageInfo && conn.pageInfo.totalPages) || 0;
    all.push(...(conn.nodes || []));
    onPage(page, totalPages);
  }
  return all;
}

// One page of user.events. Returns { nodes, totalPages, total } or null if the user is gone.
async function fetchUserEventsPage(client, userId, page, tag = {}) {
  const data = await client.request('UserEvents', Q_USER_EVENTS,
    { userId, page, perPage: USER_EVENTS_PER_PAGE }, { ...tag, page });
  const conn = data && data.user && data.user.events;
  // No user, or a user whose events connection is null: we cannot claim a complete history.
  if (!conn) return null;
  return {
    nodes: (conn && conn.nodes) || [],
    totalPages: (conn && conn.pageInfo && conn.pageInfo.totalPages) || 0,
    total: (conn && conn.pageInfo && conn.pageInfo.total) || 0,
  };
}

// player.recentStandings. videogameId null means "any game" (only when ALL_GAMES_FALLBACK).
async function fetchRecentStandings(client, playerId, videogameId, tag = {}) {
  const data = videogameId == null
    ? await client.request('RecentStandingsAnyGame', Q_RECENT_STANDINGS_ANY_GAME,
      { playerId, limit: RECENT_STANDINGS_LIMIT }, tag)
    : await client.request('RecentStandings', Q_RECENT_STANDINGS,
      { playerId, videogameId, limit: RECENT_STANDINGS_LIMIT }, tag);
  if (!data || !data.player) return null;
  return data.player.recentStandings || [];
}

// A user by discriminator (Q_USER_BY_SLUG), or null when start.gg has none.
async function fetchUserBySlug(client, code, tag = {}) {
  const data = await client.request('UserBySlug', Q_USER_BY_SLUG, { slug: `user/${code}` }, tag);
  return (data && data.user) || null;
}

// A tournament and its events (Q_TOURNAMENT_EVENTS). Throws event-not-found when there is none.
async function fetchTournamentEvents(client, slug) {
  const data = await client.request('TournamentEvents', Q_TOURNAMENT_EVENTS, { slug });
  const t = data && data.tournament;
  if (!t) throw new StartggError('event-not-found', `No event found: start.gg has no tournament "${slug}".`);
  return t;
}

// Every seed of a phase, paged to the end, in start.gg's page order. Returns { id, name, seeds }.
async function fetchPhaseSeeds(client, phaseId, onPage = () => {}) {
  const seeds = [];
  let name = null;
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const data = await client.request('PhaseSeeds', Q_PHASE_SEEDS, { phaseId, page, perPage: SEEDS_PER_PAGE }, { page });
    const ph = data && data.phase;
    if (!ph || !ph.seeds) throw new StartggError('query', `PhaseSeeds: no seeds returned for phase ${phaseId} (page ${page}).`);
    name = ph.name;
    totalPages = (ph.seeds.pageInfo && ph.seeds.pageInfo.totalPages) || 0;
    seeds.push(...(ph.seeds.nodes || []));
    onPage(page, totalPages);
  }
  return { id: String(phaseId), name, seeds };
}

// The seeding post. seedMapping: [{ seedId, seedNum }]. Never called live in build B.
async function updatePhaseSeeding(client, phaseId, seedMapping) {
  const data = await client.request('UpdatePhaseSeeding', M_UPDATE_PHASE_SEEDING, { phaseId, seedMapping }, {}, { retry: false });
  return data && data.updatePhaseSeeding;
}

// Every standing of one event, paged to the end. Returns the standing nodes.
async function fetchEventStandings(client, eventId) {
  const all = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const data = await client.request('EventStandings', Q_EVENT_STANDINGS, { eventId, page, perPage: STANDINGS_PER_PAGE }, { page });
    const st = data && data.event && data.event.standings;
    if (!st) throw new StartggError('query', `EventStandings: no standings returned for event ${eventId} (page ${page}).`);
    totalPages = (st.pageInfo && st.pageInfo.totalPages) || 0;
    all.push(...(st.nodes || []));
  }
  return all;
}

// The push's failure modes as one status line (docs/design-tool.md, Outputs: "bracket already
// started or phase locked, token not an admin of the tournament, rate limit"). start.gg's exact
// messages for the first two are NOT verified (model knowledge): the patterns are deliberately
// loose, and anything else is shown with start.gg's own message.
function pushFailure(err) {
  const msg = String((err && err.message) || err || '');
  if (err && (err.kind === 'rate-limited' || err.kind === 'time-budget')) return { kind: 'rate-limit', text: `start.gg's rate limit: still refused after the queue's retries. Try again in a minute. (${msg})` };
  if (/\bstarted\b|in progress|\blocked\b|already (begun|underway)|cannot (be )?(re)?seed/i.test(msg)) return { kind: 'locked', text: `The bracket has started or the phase is locked; start.gg refused the seeding. (${msg})` };
  if ((err && err.kind === 'bad-token') || /admin|permission|not authori[sz]ed|unauthori[sz]ed|forbidden|access/i.test(msg)) return { kind: 'not-admin', text: `The token is not an admin of this tournament, so start.gg refused. (${msg})` };
  return { kind: 'other', text: `start.gg refused: ${msg}` };
}

module.exports = {
  ENDPOINT, REQUEST_TIMEOUT_MS, USER_EVENTS_PER_PAGE, ENTRANTS_PER_PAGE, RECENT_STANDINGS_LIMIT, ALL_GAMES_FALLBACK,
  SEEDS_PER_PAGE, STANDINGS_PER_PAGE,
  Q_EVENT, Q_ENTRANTS, Q_USER_EVENTS, Q_RECENT_STANDINGS, Q_RECENT_STANDINGS_ANY_GAME,
  Q_TOURNAMENT_EVENTS, Q_PHASE_SEEDS, M_UPDATE_PHASE_SEEDING, Q_EVENT_STANDINGS, Q_USER_BY_SLUG, fetchUserBySlug,
  parseEventSlug, parseTournamentSlug, classifyError, StartggError, createClient,
  resolveEvent, fetchEntrants, fetchUserEventsPage, fetchRecentStandings,
  fetchTournamentEvents, fetchPhaseSeeds, updatePhaseSeeding, fetchEventStandings, pushFailure,
};
