'use strict';
// lib/view/majors.js — reads config/majors.json, the per-game majors list (docs/design-tool.md,
// display rules 5 and 6), and hands lib/view/model.js the list for one game. Node only.
//
// The file is the only place the lists live: model.js holds no majors of its own, so the app, the
// CLI view and the Sheets export all read the same columns from here. A game without its own list
// gets "default". A malformed file is an error with the reason, never a silent empty list.
//
// The path is injectable (a `file` option, or SEED_MAJORS_FILE), read at call time, like the tiers
// file in lib/view/data.js.

const fs = require('node:fs');
const path = require('node:path');

const KINDS = new Set(['known', 'game']);

function defaultMajorsFile() {
  if (process.env.SEED_MAJORS_FILE) return path.resolve(process.env.SEED_MAJORS_FILE);
  // SEEDING_ROOT: the project folder when running inside the compiled desktop sidecar.
  const root = process.env.SEEDING_ROOT ? path.resolve(process.env.SEEDING_ROOT) : path.join(__dirname, '..', '..');
  return path.join(root, 'config', 'majors.json');
}

function bad(file, msg) { return new Error(`${file}: ${msg}`); }

function regex(file, where, src) {
  if (typeof src !== 'string' || !src) throw bad(file, `${where} must be a non-empty string`);
  try { return new RegExp(src, 'i'); } catch (err) { throw bad(file, `${where} is not a valid regular expression (${err.message})`); }
}

// Parse and check the whole file once: every pattern compiles, every kind is known, labels are
// unique within a game. Returns { file, exclude: [RegExp], games: { id: { name, majors: [{label, re, kind}] } } }.
function parseMajorsConfig(text, file = 'majors.json') {
  let cfg;
  try { cfg = JSON.parse(text); } catch (err) { throw bad(file, `not valid JSON (${err.message})`); }
  if (!cfg || typeof cfg !== 'object') throw bad(file, 'must be a JSON object');
  if (!Array.isArray(cfg.exclude)) throw bad(file, '"exclude" must be a list of patterns');
  const exclude = cfg.exclude.map((s, i) => regex(file, `exclude[${i}]`, s));
  if (!cfg.games || typeof cfg.games !== 'object') throw bad(file, '"games" must be an object keyed by start.gg videogame id');
  if (!cfg.games.default) throw bad(file, '"games" needs a "default" entry for games without their own list');
  const games = {};
  for (const [id, g] of Object.entries(cfg.games)) {
    if (!g || !Array.isArray(g.majors)) throw bad(file, `games.${id}.majors must be a list`);
    const seen = new Set();
    games[id] = {
      name: g.name || id,
      majors: g.majors.map((m, i) => {
        const where = `games.${id}.majors[${i}]`;
        if (!m || typeof m.label !== 'string' || !m.label.trim()) throw bad(file, `${where}.label must be a non-empty string`);
        if (seen.has(m.label)) throw bad(file, `${where}: label "${m.label}" is listed twice for this game`);
        seen.add(m.label);
        if (!KINDS.has(m.kind)) throw bad(file, `${where}.kind must be "known" or "game"`);
        return { label: m.label, re: regex(file, `${where}.pattern`, m.pattern), kind: m.kind };
      }),
    };
  }
  return { file, exclude, games };
}

// Cached by path and mtime, so an edit to the file shows on the next page load.
const cache = new Map();
function loadMajorsConfig(file = defaultMajorsFile()) {
  const mtime = fs.statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.cfg;
  const cfg = parseMajorsConfig(fs.readFileSync(file, 'utf8'), file);
  cache.set(file, { mtime, cfg });
  return cfg;
}

// The list for one game: { gameId, majors: [{label, re, kind}], exclude: [RegExp] }, the shape
// model.js's buildSeriesIndex takes as opts.majors.
function majorsForGame(cfg, gameId) {
  const g = cfg.games[String(gameId)] || cfg.games.default;
  return { gameId: String(gameId), majors: g.majors, exclude: cfg.exclude };
}

module.exports = { defaultMajorsFile, parseMajorsConfig, loadMajorsConfig, majorsForGame };
