'use strict';
// lib/view/export.js — the summary table as a CSV for Google Sheets
// (File -> Import -> Upload -> Replace current sheet). Node only, pure.
//
// Format: UTF-8 without a BOM (Sheets reads UTF-8 by default; the BOM is for Excel, which this
// file is not for), CRLF line ends, every field quoted with embedded quotes doubled (RFC 4180),
// one header row, one row per player, each cell on one line.
//
// Formula guard: Sheets' import converts text to numbers, dates and formulas by default, so a
// cell starting with = + - @ (or a tab / carriage return) would be read as a formula or number.
// Such a cell gets a leading apostrophe, the spreadsheet convention for "this is text" (the OWASP
// CSV-injection guidance). Quoting alone doesn't prevent it. Only cells that start with one of
// those characters change; a seed like 3 stays a number.

const RISKY = /^[=+\-@\t\r]/;

function sheetsCell(v) {
  let s = v == null ? '' : String(v).replace(/\r?\n/g, ' ');
  if (RISKY.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toSheetsCsv(table) {
  return table.map((row) => row.map(sheetsCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { RISKY, sheetsCell, toSheetsCsv };
