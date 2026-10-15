#!/usr/bin/env node
'use strict';
// scripts/synth-run.js — writes a synthetic finished run folder for load-testing the app.
//   node scripts/synth-run.js <outRoot> [--players 200] [--results 100] [--seed 1]
// Same files and schema as a real pull (lib/output.js), plus views/set-records.json (W-L for ~90%
// of this game's results) and views/notes.json (seeds for 16 players). Deterministic per --seed.
// Never point it at out/: the app's index would list the synthetic event.

const fs = require('node:fs');
const path = require('node:path');
const out = require('../lib/output');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const outRoot = args[0];
if (!outRoot || outRoot.startsWith('--')) { console.error('Usage: node scripts/synth-run.js <outRoot> [--players 200] [--results 100] [--seed 1]'); process.exit(2); }
const NP = opt('--players', 200), NR = opt('--results', 100);
let seed = opt('--seed', 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const SYL = ['blood', 'moon', 'melty', 'sweep', 'lunar', 'exam', 'kirbo', 'cup', 'glass', 'mingle', 'night', 'arcadian', 'vortex',
  'gallery', 'bracket', 'nothing', 'crescendo', 'ladder', 'aegis', 'tns', 'para', 'gon', 'clash', 'royal', 'thunder', 'storm'];
const GAME = { id: '36865', name: 'Melty Blood: Type Lumina' };
const OTHER = [{ id: '1', name: 'GGST' }, { id: '2', name: 'Under Night In-Birth II Sys:Celes' }, { id: '3', name: 'Granblue Fantasy Versus: Rising' }];
const RUN_AT = Date.UTC(2026, 9, 15, 12, 0, 0);
const DAY = 86_400_000;

// 400 local series (popularity ~ 1/rank) + the configured majors with big fields.
const series = Array.from({ length: 400 }, (_, k) => ({
  name: `${pick(SYL)} ${pick(SYL)} ${['Weekly', 'Monthly', 'Open', 'Cup', 'Night'][k % 5]}`.replace(/\b\w/g, (c) => c.toUpperCase()),
  w: 1 / (k + 1), game: rnd() < 0.7 ? GAME : pick(OTHER), online: rnd() < 0.6, size: 8 + Math.floor(rnd() * 60),
}));
const majors = ['CEO 2025', 'CEO 2026', 'EVO 2025', 'EVO 2026', 'Combo Breaker 2025', 'Combo Breaker 2026', 'Frosty Faustings XVII 2025', 'Frosty Faustings XVIII 2026']
  .map((name) => ({ name, w: 0.05, game: GAME, online: false, size: 150 + Math.floor(rnd() * 400), major: true }));
const pool = [...series, ...majors];
const totalW = pool.reduce((n, s) => n + s.w, 0);
const pickSeries = () => { let x = rnd() * totalW; for (const s of pool) { x -= s.w; if (x <= 0) return s; } return pool[0]; };

// Editions are shared events: two players at "Blood Moon Weekly #12" are at the same event_id.
let nextEvent = 2_000_000;
const editions = new Map();
function edition(s) {
  const n = s.major ? 0 : 1 + Math.floor(rnd() * 60);
  const k = `${s.name}#${n}`;
  if (!editions.has(k)) {
    editions.set(k, { id: String(nextEvent++), tournament: s.major ? s.name : `${s.name} #${n}`, date: new Date(RUN_AT - Math.floor(rnd() * 729) * DAY).toISOString().slice(0, 10),
      entrants: s.size + Math.floor(rnd() * 20), game: s.game, online: s.online });
  }
  return editions.get(k);
}

const players = [], results = [], records = {}, notes = {};
for (let i = 0; i < NP; i++) {
  const pid = String(5_000_000 + i);
  const tag = `${pick(SYL)}${pick(SYL)}${i}`;
  players.push({ player_id: pid, gamer_tag: i === 7 ? `=SUM(${i})` : tag, prefix: rnd() < 0.3 ? pick(['TF', 'ATG', 'PSA', 'CHAINED']) : '', user_slug: `user/${pid}`,
    region_state: rnd() < 0.6 ? pick(['NY', 'CA', 'TX', 'IL', 'FL']) : '', region_country: rnd() < 0.85 ? 'United States' : 'Japan',
    result_count: NR, history_status: 'complete', team_entry: 'false' });
  const seen = new Set();
  while (seen.size < NR) {
    const ed = edition(pickSeries());
    if (seen.has(ed.id)) continue;
    seen.add(ed.id);
    const placement = rnd() < 0.03 ? '' : String(1 + Math.floor(rnd() * ed.entrants));
    const r = { player_id: pid, gamer_tag: players[i].gamer_tag, event_date: ed.date, game_id: ed.game.id, game_name: ed.game.name,
      is_event_game: String(ed.game === GAME), tournament_name: ed.tournament, event_name: rnd() < 0.1 ? 'Side Bracket' : ed.tournament,
      event_slug: `tournament/t-${ed.id}/event/e-${ed.id}`, event_id: ed.id, num_entrants: String(ed.entrants), placement, is_online: String(ed.online) };
    results.push(r);
    if (r.is_event_game === 'true' && rnd() < 0.9) records[`${pid}:${ed.id}`] = { w: Math.floor(rnd() * 7), l: 1 + Math.floor(rnd() * 2), dq: 0 };
  }
  if (i < 16) notes[pid] = { seed: i + 1, notes: `Synthetic note for seed ${i + 1}.` };
}

const name = out.runFolderName('tournament/synthetic-major/event/synthetic-200', RUN_AT);
const dir = out.createRunFolder(path.resolve(outRoot), name);
fs.mkdirSync(path.join(dir, 'views'), { recursive: true });
const meta = {
  input_url: 'synthetic', event: { id: '1', slug: 'tournament/synthetic-major/event/synthetic-200', name: `Synthetic ${NP} x ${NR}`, tournament_name: 'Synthetic Major', start_at: null, num_entrants: NP },
  game: GAME, run_at: new Date(RUN_AT).toISOString(),
  window: { start: new Date(RUN_AT - 730 * DAY).toISOString(), end: new Date(RUN_AT).toISOString(), days: 730 },
  registrant_count: NP, result_count: results.length, history_status: { complete: NP, limited: 0, failed: 0 },
};
fs.writeFileSync(path.join(dir, 'players.csv'), out.toCsv(out.PLAYER_COLUMNS, players));
fs.writeFileSync(path.join(dir, 'results.csv'), out.toCsv(out.RESULT_COLUMNS, results));
fs.writeFileSync(path.join(dir, 'views', 'set-records.json'), JSON.stringify(records));
fs.writeFileSync(path.join(dir, 'views', 'notes.json'), JSON.stringify(notes));
fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`${dir}\n${NP} players, ${results.length} results, ${Object.keys(records).length} W-L records`);
