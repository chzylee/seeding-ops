'use strict';
// lib/tiers-migrate.js — the migrations of registry/tiers.csv: T1 (docs/design-tool.md, T1;
// dispatch-contract-tool.md, Acceptance 2) and, below it, the discriminator column (Amendment A1.1;
// dispatch-contract-tool-c.md, Acceptance 2). Pure: text in, text out. Run by scripts/migrate-tiers.js.
//
//   - drops `justification` (refuses if any row has a value: the spec's premise is that none do,
//     so a value means the premise is wrong and nothing is dropped);
//   - adds `last_reviewed_on` and `last_reviewed_tournament` right after `decided_on`;
//   - backfills rows with source = app and decided_on set: last_reviewed_on = decided_on,
//     last_reviewed_tournament = eclipse-1st-cour (Eclipse's ✓ marks lived in one browser and are
//     lost; the tier was set there, so that is when and where it was reviewed);
//   - leaves everything else byte-identical: the BOM, every other field's raw text (quoting
//     included) and each record's line ending. It works on raw field text, never re-serializing
//     a field it doesn't change.
//   - is idempotent: a file that already has the T1 columns and no justification is returned as is.

const BOM = '﻿';
const BACKFILL_TOURNAMENT = 'eclipse-1st-cour';

// Records as raw field strings, each with its own line terminator. Fields keep their quotes.
function splitRaw(text) {
  const records = [];
  let fields = [];
  let i = 0;
  const n = text.length;
  if (n === 0) return records;
  for (;;) {
    // one field
    const start = i;
    if (text[i] === '"') {
      i++;
      for (;;) {
        if (i >= n) throw new Error(`Unterminated quoted field starting at offset ${start}.`);
        if (text[i] === '"') {
          if (text[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
    } else {
      while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
    }
    fields.push(text.slice(start, i));
    if (i >= n) { records.push({ fields, eol: '' }); break; }
    if (text[i] === ',') { i++; continue; }
    let eol;
    if (text[i] === '\r' && text[i + 1] === '\n') eol = '\r\n';
    else if (text[i] === '\n') eol = '\n';
    else throw new Error(`Unexpected character after field at offset ${i}.`);
    i += eol.length;
    records.push({ fields, eol });
    fields = [];
    if (i >= n) break;
  }
  return records;
}

const unquote = (raw) => (raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw);
const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;

// Returns { text, changed, stats: { rows, app, backfilled, columnsBefore, columnsAfter } }.
function migrateTiersT1(input, { tournament = BACKFILL_TOURNAMENT } = {}) {
  const hasBom = input.startsWith(BOM);
  const body = hasBom ? input.slice(1) : input;
  const records = splitRaw(body);
  if (!records.length) throw new Error('The tiers file is empty (no header).');
  const header = records[0].fields.map(unquote);
  const rows = records.slice(1);
  const col = (name) => header.indexOf(name);
  for (const [k, r] of rows.entries()) {
    if (r.fields.length !== header.length) throw new Error(`Row ${k + 1} has ${r.fields.length} fields; the header has ${header.length}.`);
  }
  const stats = { rows: rows.length, app: 0, backfilled: 0, columnsBefore: header.length, columnsAfter: header.length };
  const iSource = col('source'), iDecided = col('decided_on');
  const has = { j: col('justification') >= 0, on: col('last_reviewed_on') >= 0, at: col('last_reviewed_tournament') >= 0 };
  stats.app = iSource >= 0 ? rows.filter((r) => unquote(r.fields[iSource]) === 'app').length : 0;
  if (!has.j && has.on && has.at) return { text: input, changed: false, stats };
  if (has.on || has.at) throw new Error('The file has some of the T1 columns but not all; not a state this migration knows. Nothing written.');
  if (!has.j) throw new Error('The file has no justification column and no T1 columns; not the expected pre-T1 shape. Nothing written.');
  if (iSource < 0 || iDecided < 0) throw new Error('The file needs source and decided_on columns. Nothing written.');
  const iJ = col('justification');
  const withValue = rows.filter((r) => unquote(r.fields[iJ]).trim() !== '').length;
  if (withValue) throw new Error(`${withValue} rows have a justification; the T1 migration drops that column only when it is empty. Nothing written.`);

  // New layout: the old columns minus justification, with the two review columns after decided_on.
  const reshape = (fields, onRaw, atRaw) => {
    const out = [];
    fields.forEach((f, k) => {
      if (k === iJ) return;
      out.push(f);
      if (k === iDecided) out.push(onRaw, atRaw);
    });
    return out;
  };
  const outRecords = [{ fields: reshape(records[0].fields, quote('last_reviewed_on'), quote('last_reviewed_tournament')), eol: records[0].eol }];
  for (const r of rows) {
    const decided = unquote(r.fields[iDecided]);
    const backfill = unquote(r.fields[iSource]) === 'app' && decided.trim() !== '';
    if (backfill) stats.backfilled++;
    outRecords.push({ fields: reshape(r.fields, backfill ? quote(decided) : '""', backfill ? quote(tournament) : '""'), eol: r.eol });
  }
  stats.columnsAfter = outRecords[0].fields.length;
  const text = (hasBom ? BOM : '') + outRecords.map((r) => r.fields.join(',') + r.eol).join('');
  return { text, changed: true, stats };
}

// ---- Build C (Amendment A1.1): the discriminator column -------------------------------------
// Adds `discriminator` (the start.gg user code in start.gg/user/<code>) right after `player_id`,
// blank on every row. Everything else stays byte-identical: the BOM, every other field's raw text
// and each record's line ending. The new field follows the record's own quoting: quoted ("") where
// that record's player_id field is quoted, bare where it is bare. Idempotent: a file that already
// has the column comes back as is. No backfill here: rows get a value when a pull, an upload, a ✓
// or an edit resolves one for a linked player (lib/view/data.js).
function migrateTiersDiscriminator(input) {
  const hasBom = input.startsWith(BOM);
  const records = splitRaw(hasBom ? input.slice(1) : input);
  if (!records.length) throw new Error('The tiers file is empty (no header).');
  const header = records[0].fields.map(unquote);
  const rows = records.slice(1);
  const stats = { rows: rows.length, columnsBefore: header.length, columnsAfter: header.length };
  if (header.includes('discriminator')) return { text: input, changed: false, stats };
  const iPid = header.indexOf('player_id');
  if (iPid < 0) throw new Error('The file has no player_id column (the discriminator goes after it). Nothing written.');
  for (const [k, r] of rows.entries()) {
    if (r.fields.length !== header.length) throw new Error(`Row ${k + 1} has ${r.fields.length} fields; the header has ${header.length}.`);
  }
  const withColumn = (rec, value) => {
    const f = [...rec.fields];
    f.splice(iPid + 1, 0, rec.fields[iPid].startsWith('"') ? quote(value) : value);
    return f.join(',') + rec.eol;
  };
  const text = (hasBom ? BOM : '') + withColumn(records[0], 'discriminator') + rows.map((r) => withColumn(r, '')).join('');
  stats.columnsAfter = header.length + 1;
  return { text, changed: true, stats };
}

// The file brought to the current shape: T1 when it is pre-T1 (build A), then the discriminator
// column (build C). Each step is a no-op on a file already past it.
function migrateTiers(input, opts) {
  const t1 = migrateTiersT1(input, opts);
  const d = migrateTiersDiscriminator(t1.text);
  return { text: d.text, changed: t1.changed || d.changed,
    stats: { ...t1.stats, columnsAfter: d.stats.columnsAfter, steps: [t1.changed && 'T1', d.changed && 'discriminator'].filter(Boolean) } };
}

module.exports = { migrateTiersT1, migrateTiersDiscriminator, migrateTiers, splitRaw, unquote, BACKFILL_TOURNAMENT };
