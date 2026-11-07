'use strict';
// lib/upload.js — a CSV list of players as its own tournament page (docs/design-tool.md, Amendment
// A1.3; dispatch-contract-tool-c.md, Acceptance 4–8). Three parts:
//
//   parseUploadCsv   the contract: two columns, name then discriminator; column names irrelevant; a
//                    header row expected but not required (absent when the first row's second value is
//                    itself a discriminator); a discriminator bare, as user/<code>, or as a URL; names
//                    in start.gg's "Team | tag" form split into prefix and tag; a duplicate
//                    discriminator collapsed onto its first row with a note; a malformed row reported
//                    with its line number, never dropped silently. Pure.
//   resolveRows      one user(slug: "user/<code>") lookup per row through the given client (the app's
//                    queue): user id, player id, current gamerTag, prefix, location. A code start.gg
//                    does not know stays a flagged row. Resumable: a row already resolved is skipped.
//   poolPlayers      the resolved rows as the pull's registrants (lib/run.js `upload`), one synthetic
//                    event for the chosen game; an unresolved row becomes a row with the list's name,
//                    no results and history_status "unresolved" (it never costs a request).

const sgg = require('./startgg');

// The start.gg discriminator: the eight-character code in start.gg/user/<code>. Every value seen so
// far is lower-case hex (the Mixfest file's 32; the pulls' user_slug values); kept lower case.
const CODE = /^[0-9a-f]{8}$/i;
const CODE_FORMS = [
  /^([0-9a-f]{8})$/i,                                                        // bare
  /^user\/([0-9a-f]{8})\/?$/i,                                                // user/<code>
  /^(?:https?:\/\/)?(?:www\.)?start\.gg\/user\/([0-9a-f]{8})(?:[/?#].*)?$/i,  // a profile URL
];
function normalizeDiscriminator(value) {
  const s = String(value == null ? '' : value).trim();
  for (const re of CODE_FORMS) { const m = re.exec(s); if (m) return m[1].toLowerCase(); }
  return null;
}

// E2-4 (build C pass 2; orchestrator ruling): a value that is not a discriminator but looks like an
// attempt at one: it contains user/, it is a link (://, www., start.gg/), or it is one token of 6-10
// letters and digits with at least one digit and at most two letters outside a-f (a mistyped code
// such as "abcd123" or "abcd12g3"; a column name such as "discriminator", "start.gg", "player1" or
// "column2" is not). A first row like this is reported as malformed, never taken as the header.
function looksLikeAttemptedCode(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return false;
  if (/user\//i.test(s) || /:\/\/|^www\.|start\.gg\//i.test(s)) return true;
  if (!/^[0-9a-z]{6,10}$/i.test(s) || !/\d/.test(s)) return false;
  return (s.match(/[^0-9a-f]/gi) || []).length <= 2;
}

// "Team | tag" -> { prefix, tag }, split on the last "|" (lib/view/data.js lastTag reads tags the
// same way); a name without "|" is the tag.
function splitName(name) {
  const s = String(name || '').trim();
  const i = s.lastIndexOf('|');
  if (i < 0) return { prefix: '', tag: s };
  return { prefix: s.slice(0, i).trim(), tag: s.slice(i + 1).trim() };
}

// CSV records with the physical line each starts on. RFC 4180 quoting (doubled quotes, line breaks
// inside quotes); CRLF, LF or CR line ends; a BOM is dropped. An unterminated quote ends the file
// and is reported as malformed at the line it opened on.
function csvRecords(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const records = [];
  let i = 0, line = 1;
  while (i < s.length) {
    const start = line;
    const fields = [];
    let field = '', quoted = false, broken = false;
    for (;;) {
      if (i >= s.length) { if (quoted) broken = true; fields.push(field); break; }
      const ch = s[i];
      if (quoted) {
        if (ch === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
        if (ch === '"') { quoted = false; i++; continue; }
        if (ch === '\n' || (ch === '\r' && s[i + 1] !== '\n')) line++;
        field += ch; i++; continue;
      }
      if (ch === '"' && field.trim() === '') { field = ''; quoted = true; i++; continue; }
      if (ch === ',') { fields.push(field); field = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        fields.push(field);
        i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
        line++;
        break;
      }
      field += ch; i++;
    }
    records.push({ line: start, fields, broken });
  }
  return records;
}

// -> { rows: [{ line, name, prefix, tag, discriminator }], header: string|null,
//      header_row: { line, values: [first, second] }|null (the row skipped as the header, so the
//      upload's summary can say so: E2-4),
//      duplicates: [{ discriminator, line, kept_line }], malformed: [{ line, text, reason }],
//      ignored_columns: [line] (rows with values after the second column; those values are ignored) }
// The header: the first row, when its second value is neither a discriminator nor an attempt at one.
// A one-column first row ("Gamertag") is still a header (E2-4). A second column that is there and
// blank is a player missing a code ("Alpha,": malformed at line 1, said as such), unless the first
// value is a column name people use for this list ("Gamertag," as a spreadsheet exports a header whose
// second cell is empty): then it is the header.
const HEADER_WORDS = new Set(['name', 'names', 'player', 'players', 'player name', 'player names', 'tag', 'tags', 'gamertag', 'gamertags', 'gamer tag',
  'gamer tags', 'handle', 'handles', 'entrant', 'entrants', 'participant', 'participants', 'startgg tag', 'start.gg tag', 'username', 'user']);
const isHeaderWord = (s) => HEADER_WORDS.has(String(s || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' '));
function parseUploadCsv(text) {
  const recs = csvRecords(text).filter((r) => r.broken || r.fields.some((f) => f.trim() !== ''));
  const out = { rows: [], header: null, header_row: null, duplicates: [], malformed: [], ignored_columns: [] };
  if (!recs.length) return out;
  let body = recs;
  const first = recs[0];
  const second = String(first.fields[1] == null ? '' : first.fields[1]).trim();
  const blankSecondColumn = first.fields.length >= 2 && second === '' && !isHeaderWord(first.fields[0]);
  if (!first.broken && !blankSecondColumn && normalizeDiscriminator(second) == null && !looksLikeAttemptedCode(second)) {
    out.header = first.fields.map((f) => f.trim()).join(',');
    out.header_row = { line: first.line, values: [String(first.fields[0] || '').trim(), String(first.fields[1] == null ? '' : first.fields[1]).trim()] };
    body = recs.slice(1);
  }
  const seen = new Map();
  for (const r of body) {
    const text = r.fields.join(',');
    if (r.broken) { out.malformed.push({ line: r.line, text, reason: 'a quote is opened and never closed' }); continue; }
    const name = String(r.fields[0] || '').trim();
    const raw = String(r.fields[1] == null ? '' : r.fields[1]).trim();
    if (!raw) { out.malformed.push({ line: r.line, text, reason: 'no discriminator in the second column' }); continue; }
    const code = normalizeDiscriminator(raw);
    if (!code) { out.malformed.push({ line: r.line, text, reason: `"${raw}" is not a start.gg discriminator (8 characters, bare, user/<code> or a profile link)` }); continue; }
    if (r.fields.slice(2).some((f) => f.trim() !== '')) out.ignored_columns.push(r.line);
    if (seen.has(code)) { out.duplicates.push({ discriminator: code, line: r.line, kept_line: seen.get(code) }); continue; }
    seen.set(code, r.line);
    out.rows.push({ line: r.line, name, ...splitName(name), discriminator: code });
  }
  return out;
}

// A page slug from the name Noah gives: lower case, ASCII letters and digits, single hyphens.
function slugify(name) {
  return String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

// ---- Resolution ---------------------------------------------------------------------------
// rows: parseUploadCsv rows, each possibly carrying an earlier `resolved` (a resumed upload). Each row
// without one gets one lookup and `resolved = { status, ... }`:
//   found       user and player: user_id, player_id, gamer_tag, prefix, region_state, region_country
//   not-found   start.gg has no user for the code, or the user has no player
//   error       the lookup failed after the client's retries (a later Refresh asks again)
// A bad token (or another fatal error) stops the resolution and is thrown; rows done so far keep
// their `resolved`, and onRow has been called for each, so the caller can save them.
async function resolveRows(client, rows, { onRow = () => {} } = {}) {
  let asked = 0;
  for (const row of rows) {
    if (row.resolved && row.resolved.status !== 'error') continue;
    asked++;
    try {
      const u = await sgg.fetchUserBySlug(client, row.discriminator, { discriminator: row.discriminator });
      if (!u || !u.player || u.player.id == null) {
        row.resolved = { status: 'not-found', reason: u ? 'the start.gg user has no player profile' : 'start.gg has no user with this discriminator' };
      } else {
        const loc = u.location || {};
        row.resolved = { status: 'found', user_id: String(u.id), player_id: String(u.player.id), gamer_tag: String(u.player.gamerTag || ''),
          prefix: String(u.player.prefix || ''), region_state: String(loc.state || '').trim(), region_country: String(loc.country || '').trim(),
          ...(u.discriminator && String(u.discriminator).toLowerCase() !== row.discriminator ? { discriminator_returned: String(u.discriminator) } : {}) };
      }
    } catch (err) {
      if (!(err instanceof sgg.StartggError) || err.fatal) throw err;
      row.resolved = { status: 'error', reason: err.message };
    }
    onRow(row);
  }
  return { asked };
}

// E2-7 (build C pass 2; orchestrator ruling): the most player rows one upload takes. Each row is a
// start.gg lookup and a pull on the app's one queue; a major's field is a few hundred.
const MAX_UPLOAD_ROWS = 1000;

const UPLOAD_EVENT = 'upload';
const unresolvedId = (code) => `unresolved-${code}`;
const isUnresolvedId = (id) => /^unresolved-/.test(String(id || ''));

// The synthetic event an upload's one tab stands on: the chosen game, the given date.
function uploadEvent({ name, game, startAt, count }) {
  return { slug: UPLOAD_EVENT, id: null, name: `${name} (uploaded list)`, game: { id: String(game.id), name: game.name },
    start_at: startAt, num_entrants: count, singles: true, phases: [] };
}

// The pull's registrants. Team: the list's prefix when it gives one, else start.gg's (an
// interpretation, build-record-tool.md §Build C pass 1). Tag: start.gg's current gamerTag; the list's
// name is kept as `alias`. A start.gg player listed twice under two codes is kept once.
function poolPlayers(rows, gameId) {
  const players = [];
  const seen = new Set();
  for (const r of rows) {
    const f = r.resolved && r.resolved.status === 'found' ? r.resolved : null;
    const base = { events: [UPLOAD_EVENT], games: [String(gameId)], team_entry: false, alias: r.name, list_line: r.line };
    if (f) {
      if (seen.has(f.player_id)) continue;
      seen.add(f.player_id);
      players.push({ ...base, player_id: f.player_id, gamer_tag: f.gamer_tag || r.tag, prefix: r.prefix || f.prefix,
        user_id: f.user_id, user_slug: `user/${r.discriminator}`, region_state: f.region_state, region_country: f.region_country });
    } else {
      // E2-6: a lookup that failed is not a code start.gg doesn't know; the reason travels to the page.
      const failed = r.resolved && r.resolved.status === 'error';
      players.push({ ...base, player_id: unresolvedId(r.discriminator), gamer_tag: r.tag || r.discriminator, prefix: r.prefix,
        user_id: '', user_slug: '', region_state: '', region_country: '', unresolved: true,
        lookup_error: failed ? String(r.resolved.reason || 'no reason given') : '' });
    }
  }
  return players;
}

module.exports = {
  CODE, normalizeDiscriminator, looksLikeAttemptedCode, splitName, csvRecords, parseUploadCsv, slugify,
  resolveRows, MAX_UPLOAD_ROWS, UPLOAD_EVENT, unresolvedId, isUnresolvedId, uploadEvent, poolPlayers,
};
