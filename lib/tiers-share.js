'use strict';
// lib/tiers-share.js — sharing one game's tiers with another organizer (docs/design-tool.md,
// Amendment A2.2). Node only. Three parts:
//
//   exportTiers    one game's tiered rows of registry/tiers.csv as a shareable file: the columns a
//                  receiver needs to match a player and read the tier (SHARE_COLS), never the private
//                  ones (PRIVATE_COLS: notes, review dates and tournaments, decided_on, source, the
//                  sheet import's region / placements / notes). Same writer as T1 (lib/output.js toCsv:
//                  UTF-8 with a BOM, every field quoted), so the file opens in Sheets like tiers.csv.
//   previewImport  the review step: the file's rows for the chosen game, matched against this table's
//                  rows of that game with T1's own precedence (player_id, then discriminator, then tag
//                  among rows with no id; lib/view/data.js indexTierRows), sorted into
//                    new         no tier here (no row, or a row with no tier): the import would add it
//                    conflict    a different tier here: shown side by side, Noah picks
//                    same        the same tier: nothing to do
//                    ambiguous   two or more of the file's rows match one row here: never applied
//                  plus the rows it could not read (malformed), rows repeated in the file (duplicates),
//                  rows without a tier, and rows for other games (counted, never touched). Read-only.
//   applyImport    the rows Noah chose, written in one atomic write to this game's rows only, after
//                  re-running the preview and checking it is the one he reviewed (the fingerprint).
//                  An applied row's `source` records the import (provenance); its notes and reviews
//                  are untouched; decided_on is the day the tier changed here.
//
// Parsing is the CSV upload's (lib/upload.js csvRecords): RFC 4180 quoting, CRLF / LF / CR, a BOM
// dropped, an unterminated quote reported at its line. Columns are found by header name (any order,
// any case), so this table's own registry/tiers.csv, or another organizer's, imports as well.

const crypto = require('node:crypto');
const data = require('./view/data');
const U = require('./upload');
const { toCsv } = require('./output');

const SHARE_COLS = ['game_id', 'game_name', 'player_id', 'discriminator', 'startgg_tag', 'sheet_tag', 'tier'];
const PRIVATE_COLS = ['notes', 'decided_on', 'last_reviewed_on', 'last_reviewed_tournament', 'source', 'sheet_region', 'sheet_placements', 'sheet_notes'];
const ID_COLS = ['player_id', 'discriminator', 'startgg_tag', 'sheet_tag'];
const MAX_TIER = 20; // the editor's bound (lib/view/data.js updatePlayer)

const bad = (status, msg, extra = {}) => Object.assign(new Error(msg), { status, ...extra });
const tiered = (r) => String(r.tier ?? '').trim() !== '';
const fileSafe = (s) => String(s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';

// Every game this table has rows for: { id, name, tiered } (tiered: rows with a tier), by id.
function gamesInTable({ tiersFile = data.defaultTiersFile() } = {}) {
  const { all } = data.readTierTable(tiersFile);
  const by = new Map();
  for (const r of all) {
    const id = String(r.game_id || '').trim();
    if (!data.hasGame(id)) continue;
    if (!by.has(id)) by.set(id, { id, name: r.game_name || `Game ${id}`, tiered: 0 });
    if (tiered(r)) by.get(id).tiered++;
  }
  return [...by.values()];
}

// -> { filename, csv, count, game }. Tier descending, then tag, so two exports of the same table diff cleanly.
function exportTiers(gameId, { tiersFile = data.defaultTiersFile(), now = new Date(), gameName } = {}) {
  if (!data.hasGame(gameId)) throw bad(400, 'Pick a game to export.');
  const { all } = data.readTierTable(tiersFile);
  const rows = all.filter((r) => String(r.game_id) === String(gameId) && tiered(r));
  if (!rows.length) throw bad(404, 'There are no tiers for this game yet.');
  const name = rows[0].game_name || gameName || `Game ${gameId}`;
  const tag = (r) => r.startgg_tag || r.sheet_tag || '';
  rows.sort((a, b) => Number(b.tier) - Number(a.tier) || tag(a).localeCompare(tag(b), undefined, { sensitivity: 'base' }) || String(a.player_id).localeCompare(String(b.player_id)));
  const out = rows.map((r) => ({ ...Object.fromEntries(SHARE_COLS.map((c) => [c, r[c] ?? ''])), game_id: String(gameId), game_name: name }));
  return { filename: `tiers-${fileSafe(name)}-${data.todayOf(now)}.csv`, csv: toCsv(SHARE_COLS, out), count: out.length, game: { id: String(gameId), name } };
}

// ---- Reading a shared file ------------------------------------------------------------------
// -> { rows: [{ line, game_id, game_name, player_id, discriminator, startgg_tag, sheet_tag, tier }],
//      malformed: [{ line, text, reason }] }. Throws 400 when the file is not a tiers file at all.
// Rows are checked for the target game only (a row of another game is counted, never judged).
function parseShared(text, gameId) {
  const recs = U.csvRecords(text).filter((r) => r.broken || r.fields.some((f) => f.trim() !== ''));
  if (!recs.length) throw bad(400, 'The file is empty.');
  const head = recs[0];
  if (head.broken) throw bad(400, `Line ${head.line}: a quote is opened and never closed.`);
  const names = head.fields.map((f) => f.trim().toLowerCase());
  const at = (c) => names.indexOf(c);
  if (at('game_id') < 0 || at('tier') < 0 || !ID_COLS.some((c) => at(c) >= 0)) {
    throw bad(400, 'This is not a tiers file: its first row must name the columns, with game_id, tier, and at least one of player_id, discriminator, startgg_tag or sheet_tag.');
  }
  const rows = [], malformed = [], otherGames = new Map();
  let noTier = 0;
  for (const r of recs.slice(1)) {
    const text = r.fields.join(',');
    const get = (c) => (at(c) >= 0 ? String(r.fields[at(c)] ?? '').trim() : '');
    if (r.broken) { malformed.push({ line: r.line, text, reason: 'a quote is opened and never closed' }); continue; }
    const gid = get('game_id');
    if (gid !== String(gameId)) {
      const k = gid || '(none)';
      if (!otherGames.has(k)) otherGames.set(k, { id: gid, name: get('game_name') || (gid ? `Game ${gid}` : 'no game id'), rows: 0 });
      otherGames.get(k).rows++;
      continue;
    }
    const row = { line: r.line, game_id: gid, game_name: get('game_name'), player_id: get('player_id'), discriminator: '', startgg_tag: get('startgg_tag'), sheet_tag: get('sheet_tag'), tier: get('tier') };
    const rawDisc = get('discriminator');
    if (rawDisc) {
      const d = U.normalizeDiscriminator(rawDisc);
      if (!d) { malformed.push({ line: r.line, text, reason: `"${rawDisc}" is not a start.gg discriminator` }); continue; }
      row.discriminator = d;
    }
    if (row.player_id && !/^\d+$/.test(row.player_id)) { malformed.push({ line: r.line, text, reason: `player_id "${row.player_id}" is not a start.gg player id` }); continue; }
    if (!row.player_id && !row.discriminator && !row.startgg_tag && !row.sheet_tag) { malformed.push({ line: r.line, text, reason: 'no player id, discriminator or tag to match it by' }); continue; }
    if (!row.tier) { noTier++; continue; }
    if (!/^\d+$/.test(row.tier) || Number(row.tier) > MAX_TIER) { malformed.push({ line: r.line, text, reason: `tier "${row.tier}" is not a whole number from 0 to ${MAX_TIER}` }); continue; }
    row.tier = String(Number(row.tier));
    rows.push(row);
  }
  return { rows, malformed, no_tier: noTier, other_games: [...otherGames.values()] };
}

// One of the file's rows against this game's index: { row, by } or null. T1's precedence (A1.2):
// the row with this player_id; else the row with this discriminator, unless it names someone else;
// else, among rows with no id, the first whose tag (in full, or with the team prefix stripped) is
// one of the file row's tags.
function matchShared(index, r) {
  if (r.player_id && index.byPid.has(r.player_id)) return { row: index.byPid.get(r.player_id), by: 'player_id' };
  const disc = r.discriminator && index.byDisc.get(r.discriminator);
  if (disc && (!disc.player_id || !r.player_id || String(disc.player_id) === r.player_id)) return { row: disc, by: 'discriminator' };
  const keys = [r.startgg_tag, r.sheet_tag].flatMap((t) => [data.normTag(t), data.lastTag(t)]).filter(Boolean);
  const tagRow = keys.map((k) => index.unlinkedByTag.get(k)).find(Boolean);
  return tagRow ? { row: tagRow, by: 'tag' } : null;
}

// The file's own repeats: a player_id, a discriminator, or (for a row with neither) a tag seen on an
// earlier row. The first is kept.
function dedupe(rows) {
  const seen = new Map(), kept = [], duplicates = [];
  for (const r of rows) {
    const keys = [r.player_id && `p:${r.player_id}`, r.discriminator && `d:${r.discriminator}`,
      !r.player_id && !r.discriminator && `t:${data.lastTag(r.startgg_tag || r.sheet_tag)}`].filter(Boolean);
    const hit = keys.map((k) => seen.get(k)).find((x) => x != null);
    if (hit != null) { duplicates.push({ line: r.line, kept_line: hit, tag: r.startgg_tag || r.sheet_tag }); continue; }
    for (const k of keys) seen.set(k, r.line);
    kept.push(r);
  }
  return { kept, duplicates };
}

const fingerprintOf = (gameId, text, mine) => crypto.createHash('sha1').update(JSON.stringify({ g: String(gameId), text,
  mine: mine.map((r) => [r.player_id, r.discriminator, r.startgg_tag, r.sheet_tag, r.tier]) })).digest('hex');

function review({ csv, gameId, tiersFile }) {
  if (!data.hasGame(gameId)) throw bad(400, 'Pick the game these tiers are for.');
  if (typeof csv !== 'string' || !csv.trim()) throw bad(400, 'The file is empty.');
  const parsed = parseShared(csv, gameId);
  const { all, cols } = data.readTierTable(tiersFile);
  const mine = all.filter((r) => String(r.game_id) === String(gameId));
  if (!parsed.rows.length) {
    const others = parsed.other_games.filter((g) => g.id);
    const what = others.length ? ` It has tiers for ${others.map((g) => `${g.name} (${g.rows} row${g.rows === 1 ? '' : 's'})`).join(', ')}.` : '';
    const notRead = parsed.malformed.length ? ` ${parsed.malformed.length} row(s) could not be read: ${parsed.malformed.slice(0, 5).map((m) => `line ${m.line} (${m.reason})`).join('; ')}.` : '';
    throw bad(400, `The file has no tiers for this game.${what}${notRead}`, { other_games: parsed.other_games, malformed: parsed.malformed });
  }
  const { kept, duplicates } = dedupe(parsed.rows);
  const index = data.indexTierRows(mine);
  const matched = kept.map((r) => ({ r, m: matchShared(index, r) }));
  // Two or more of the file's rows on one row here. By an id (player_id or discriminator: a row here
  // that has one is never matched by tag) they name the same start.gg player, so the first is used and
  // the rest are repeats. By tag only (one tag, several people, A6-1) none is applied: ambiguous.
  const tagOf = (r) => r.startgg_tag || r.sheet_tag || '';
  const claims = new Map(); // a row here -> the file's rows matched to it
  for (const x of matched) if (x.m) { if (!claims.has(x.m.row)) claims.set(x.m.row, []); claims.get(x.m.row).push(x); }
  const repeat = new Set();
  for (const xs of claims.values()) {
    if (xs.length < 2 || xs[0].m.by === 'tag') continue;
    for (const x of xs.slice(1)) { repeat.add(x); duplicates.push({ line: x.r.line, kept_line: xs[0].r.line, tag: tagOf(x.r) }); }
  }
  duplicates.sort((a, b) => a.line - b.line);
  const items = { new: [], conflicts: [], same: [], ambiguous: [] };
  for (const x of matched) {
    const { r, m } = x;
    if (repeat.has(x)) continue;
    const base = { key: String(r.line), line: r.line, player_id: r.player_id, discriminator: r.discriminator, tag: tagOf(r), theirs: Number(r.tier) };
    if (m && m.by === 'tag' && claims.get(m.row).length > 1) { items.ambiguous.push({ ...base, mine_tag: tagOf(m.row), by: m.by }); continue; }
    if (!m) { items.new.push({ ...base, mine: null, has_row: false, by: null }); continue; }
    const mt = tiered(m.row) ? Number(m.row.tier) : null;
    const one = { ...base, mine: mt, has_row: true, by: m.by, mine_tag: tagOf(m.row), mine_notes: m.row.notes || '' };
    if (mt == null) items.new.push(one);
    else if (mt === Number(r.tier)) items.same.push(one);
    else items.conflicts.push(one);
  }
  return { parsed, duplicates, matched, items, all, cols, mine, fingerprint: fingerprintOf(gameId, csv, mine) };
}

// The review the page shows (read-only). gameName names the game when this table has no row for it.
function previewImport({ csv, gameId, fileName, gameName, tiersFile = data.defaultTiersFile() } = {}) {
  const v = review({ csv, gameId, tiersFile });
  const name = (v.mine[0] && v.mine[0].game_name) || gameName || (v.parsed.rows[0] && v.parsed.rows[0].game_name) || `Game ${gameId}`;
  const { items } = v;
  return {
    game: { id: String(gameId), name }, file_name: fileName || null,
    counts: { rows: v.parsed.rows.length, new: items.new.length, conflicts: items.conflicts.length, same: items.same.length, ambiguous: items.ambiguous.length,
      duplicates: v.duplicates.length, malformed: v.parsed.malformed.length, no_tier: v.parsed.no_tier, other_games: v.parsed.other_games.reduce((n, g) => n + g.rows, 0) },
    new: items.new, conflicts: items.conflicts, ambiguous: items.ambiguous,
    duplicates: v.duplicates, malformed: v.parsed.malformed, other_games: v.parsed.other_games,
    fingerprint: v.fingerprint,
  };
}

// The provenance an applied row carries in `source`: the day and the file it came from.
function sourceLabel(fileName, now) {
  const f = String(fileName || '').replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 80);
  return `import ${data.todayOf(now)}${f ? ` from ${f}` : ''}`;
}

// take: the keys (the file's line numbers, as previewImport gives them) of the rows to apply: new
// rows to add and conflicts where Noah takes theirs. Everything else stays as it is here.
function applyImport({ csv, gameId, fileName, gameName, fingerprint, take, now = new Date(), tiersFile = data.defaultTiersFile() } = {}) {
  if (!Array.isArray(take) || !take.every((k) => typeof k === 'string' || typeof k === 'number')) throw bad(400, '"take" must be a list of row keys.');
  const v = review({ csv, gameId, tiersFile });
  if (fingerprint !== v.fingerprint) throw bad(409, 'Your tiers for this game changed since this review (or the file is not the one reviewed). Review the import again.', { failure: 'stale' });
  const wanted = new Set(take.map(String));
  const byKey = new Map();
  for (const x of [...v.items.new, ...v.items.conflicts]) byKey.set(x.key, x);
  for (const k of wanted) {
    if (byKey.has(k)) continue;
    const kind = v.items.same.some((x) => x.key === k) ? 'already has the same tier' : v.items.ambiguous.some((x) => x.key === k) ? 'is ambiguous (it matches a row other file rows match too)' : 'is not a row of this review';
    throw bad(400, `Row ${k} ${kind}; it cannot be applied.`);
  }
  const { all, cols } = v;
  for (const r of all) if (!('notes' in r)) r.notes = r.sheet_notes || ''; // the T1 writer's rule (editTierRow)
  const today = data.todayOf(now);
  const source = sourceLabel(fileName, now);
  const name = (v.mine[0] && v.mine[0].game_name) || gameName || `Game ${gameId}`;
  const summary = { added: 0, updated: 0, kept: v.items.conflicts.length, skipped_new: v.items.new.length, linked_by_tag: [], source };
  for (const { r, m } of v.matched) {
    const key = String(r.line);
    if (!wanted.has(key)) continue;
    const item = byKey.get(key);
    if (!m) {
      const row = Object.fromEntries(cols.map((c) => [c, '']));
      Object.assign(row, { game_id: String(gameId), game_name: name, player_id: r.player_id, discriminator: r.discriminator,
        startgg_tag: r.startgg_tag || r.sheet_tag, sheet_tag: r.sheet_tag || r.startgg_tag, tier: r.tier, decided_on: today, source });
      all.push(row);
      summary.added++; summary.skipped_new--;
      continue;
    }
    const row = m.row;
    row.tier = r.tier;
    row.decided_on = today;
    row.source = source;
    // The ids the file gives fill the ones this row lacks (never replace one it has). On a row found
    // by tag only this makes the link real, as an edit does (A1.2); it is reported for review.
    if (!row.player_id && r.player_id) row.player_id = r.player_id;
    if (!row.discriminator && r.discriminator) row.discriminator = r.discriminator;
    if (m.by === 'tag') summary.linked_by_tag.push({ line: r.line, tag: item.tag, row_tag: item.mine_tag, player_id: row.player_id || '' });
    summary.updated++;
    if (item.mine == null) summary.skipped_new--; else summary.kept--;
  }
  if (summary.added || summary.updated) data.writeTierTable(tiersFile, cols, all);
  return summary;
}

module.exports = { SHARE_COLS, PRIVATE_COLS, gamesInTable, exportTiers, parseShared, previewImport, applyImport, sourceLabel };
