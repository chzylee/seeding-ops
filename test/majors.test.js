'use strict';
// Majors per game (docs/design-tool.md, display rules 5 and 6; dispatch-contract-tool.md,
// Acceptance 6): the shipped config, the loader's checks, main-event detection, one result per
// year per column, and the ratified display rules on the major cells in the summary, the compare
// panel and the Sheets export. Offline; no out/ data.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../lib/view/model');
const R = require('../lib/view/render');
const { parseMajorsConfig, majorsForGame, loadMajorsConfig } = require('../lib/view/majors');
const { majorsFor, MBAACC_ID, EXCLUDE, KNOWN, MBAACC } = require('../testlib/majors-fixture');

const SHIPPED = path.join(__dirname, '..', 'config', 'majors.json');
let ev = 5000;
// A results.csv row. mb: the seeded game (MBAACC) unless game is given.
const row = (pid, tournament, extra = {}) => ({
  player_id: String(pid), gamer_tag: `P${pid}`, event_date: '2025-01-18', game_id: MBAACC_ID, game_name: 'MBAACC',
  is_event_game: 'true', tournament_name: tournament, event_name: 'Melty Blood Actress Again Current Code', event_slug: '',
  event_id: String(ev++), num_entrants: '100', placement: '9', is_online: 'false', ...extra,
});
// The same bracket (event_id) for another player.
const also = (pid, r, extra = {}) => ({ ...r, player_id: String(pid), gamer_tag: `P${pid}`, ...extra });
const gg = (pid, tournament, extra = {}) => row(pid, tournament, { game_id: '33945', game_name: 'Guilty Gear: Strive', is_event_game: 'false', event_name: 'Guilty Gear: Strive', ...extra });
const players = (n) => Array.from({ length: n }, (_, i) => ({ player_id: String(i + 1), gamer_tag: `P${i + 1}`, prefix: '', region_state: '', region_country: '' }));

function ctxFor(rows, ps, gameId = MBAACC_ID) {
  const index = M.buildSeriesIndex(rows, { majors: majorsFor(gameId) });
  const columns = M.chooseColumns(ps, rows.filter(M.isGame), index);
  return R.summaryContext({ meta: { game: { name: 'MBAACC' } }, players: ps, rows, records: {}, notes: {}, columns, index });
}
const majorLabels = (ctx) => ctx.majors.map((m) => m.label);
const cellText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('config/majors.json as shipped: MBAACC has the four known majors and Climax of Night + Eclipse; the exclusion list; a default list', () => {
  const cfg = loadMajorsConfig(SHIPPED);
  const mb = majorsForGame(cfg, MBAACC_ID).majors.map((m) => [m.label, m.kind]);
  assert.deepStrictEqual(mb, [['CEO', 'known'], ['Evo', 'known'], ['Combo Breaker', 'known'], ['Frosty Faustings', 'known'], ['Climax of Night', 'game'], ['Eclipse', 'game']]);
  assert.deepStrictEqual(majorsForGame(cfg, '999999').majors.map((m) => m.label), ['CEO', 'Evo', 'Combo Breaker', 'Frosty Faustings'], 'a game without a list gets the default');
  // The exclusion list (the spec's default: side / community / 2v2 / teams / "Pre-"), in the same file.
  const ex = majorsForGame(cfg, MBAACC_ID).exclude;
  for (const name of ['MBAACC Side Bracket', 'CEO 2025 Community Tournaments', 'MBAACC 2v2', 'Frosty Teams', 'RTM! (Pre-Combo Breaker Event)']) {
    assert.ok(ex.some((re) => re.test(name)), `"${name}" is excluded`);
  }
  for (const name of ['Melty Blood Actress Again Current Code', 'Frosty Faustings XVII 2025', '[a bloody finale.] MBAACC Singles', 'Presents: Climax']) {
    assert.ok(!ex.some((re) => re.test(name)), `"${name}" is not excluded`);
  }
  // The test fixture matches the shipped file as seeded.
  const raw = JSON.parse(fs.readFileSync(SHIPPED, 'utf8'));
  assert.deepStrictEqual(raw.exclude, EXCLUDE);
  assert.deepStrictEqual(raw.games.default.majors, KNOWN);
  assert.deepStrictEqual(raw.games[MBAACC_ID].majors, MBAACC);
});

test('majors config: a malformed file is an error naming the problem, never a silent empty list', () => {
  const ok = { exclude: [], games: { default: { majors: [{ label: 'A', pattern: '^a', kind: 'known' }] } } };
  assert.doesNotThrow(() => parseMajorsConfig(JSON.stringify(ok)));
  const bad = (cfg, re) => assert.throws(() => parseMajorsConfig(typeof cfg === 'string' ? cfg : JSON.stringify(cfg), 'x.json'), re);
  bad('{ not json', /not valid JSON/);
  bad({ ...ok, exclude: 'side' }, /"exclude" must be a list/);
  bad({ exclude: [], games: { 1: ok.games.default } }, /needs a "default"/);
  bad({ exclude: [], games: { default: { majors: [{ label: 'A', pattern: '^a', kind: 'big' }] } } }, /kind must be "known" or "game"/);
  bad({ exclude: [], games: { default: { majors: [{ label: 'A', pattern: '(', kind: 'known' }] } } }, /not a valid regular expression/);
  bad({ exclude: [], games: { default: { majors: [{ label: 'A', pattern: 'a', kind: 'known' }, { label: 'A', pattern: 'b', kind: 'game' }] } } }, /listed twice/);
  bad({ exclude: ['['], games: ok.games }, /exclude\[0\] is not a valid regular expression/);
});

test('rule 5: a Frosty Faustings with a Guilty Gear main and an MBAACC side bracket gives no MBAACC Frosty cell; the side result stays a series', () => {
  const rows = [
    gg(1, 'Frosty Faustings XVII 2025', { num_entrants: '701', placement: '33' }),
    row(1, 'Frosty Faustings XVII 2025', { event_name: 'MBAACC Side Bracket', num_entrants: '24', placement: '1' }),
    row(2, 'Midweek Melting 44', { event_date: '2025-02-01' }),
  ];
  const ps = players(2);
  const ctx = ctxFor(rows, ps);
  assert.ok(!majorLabels(ctx).includes('Frosty Faustings'), 'no Frosty column: MBAACC had no main event there');
  assert.strictEqual(cellText(R.majorCell(rows.filter((r) => r.player_id === '1'), { label: 'Frosty Faustings' }, {}, ctx.index)), '—');
  // The side bracket is still visible, as a series of this game (rule 7), not lost.
  const other = R.otherSeriesOf(ps[0], ctx);
  assert.ok(other.some((s) => /Frosty Faustings/.test(s.label) && s.rows[0].num_entrants === '24'), 'the side bracket shows under Other series');
  // And the Guilty Gear main is another game's result: Other games, never a major column.
  assert.match(R.otherGamesText(ps[0], ctx), /Guilty Gear: Strive \/ Frosty Faustings: best 33rd \/ 701/);
});

test('rule 5: the Eclipse-run side events (2v2s, community and "Pre-" tournaments, side tournaments "at" a major) never become major cells', () => {
  const rows = [
    row(1, 'MBAACC 2v2 @ Frosty Faustings XVII', { event_name: 'MBAACC 2v2', num_entrants: '17' }),
    row(1, 'Vortex Gallery at Frosty Faustings XVIII 2026', { event_name: 'Melty Blood Actress Again Current Code - 2v2', event_date: '2026-01-30', num_entrants: '13' }),
    row(1, 'CEO 2025 Community Tournaments', { event_name: 'Melty Blood: Actress Again Current Code', event_date: '2025-06-27', num_entrants: '32' }),
    row(1, 'RTM! Presents: B-Side #21 (Pre-Combo Breaker Event)', { event_name: 'MBAACC - 6:30PM', event_date: '2026-05-22', num_entrants: '5' }),
    row(1, 'All In Together 2025: COMBO BREAKER Community Tournaments', { event_date: '2025-05-23', num_entrants: '69' }),
    row(1, 'Climax of Night FINAL: MBAACC 2v2 - Blood Moon Scherzo', { event_name: '2v2 AACC - Blood Moon Scherzo', event_date: '2025-11-08', num_entrants: '24' }),
  ];
  const ctx = ctxFor(rows, players(1));
  assert.deepStrictEqual(majorLabels(ctx), [], 'none of these is a main event of a major');
  assert.strictEqual(M.mainEventMajors(rows, majorsFor(MBAACC_ID)).size, 0);
});

test('rule 6: a Climax of Night field gets its own column for MBAACC, and not for a game whose list lacks it', () => {
  const rows = [
    row(1, 'Climax of Night Final Season: [breakadawn]', { event_name: '[a bloody finale.] MBAACC Singles', num_entrants: '245', placement: '5', event_date: '2025-11-08' }),
    row(2, 'Climax of Night Final Season: [breakadawn]', { event_name: '[a bloody finale.] MBAACC Singles', num_entrants: '245', placement: '65', event_date: '2025-11-08' }),
  ];
  rows[1].event_id = rows[0].event_id; // one bracket, two players
  const mb = ctxFor(rows, players(2));
  assert.deepStrictEqual(majorLabels(mb), ['Climax of Night']);
  assert.match(cellText(R.majorCell(rows.filter((r) => r.player_id === '1'), { label: 'Climax of Night' }, {}, mb.index)), /^5th \/ 245 · — '25$/);
  const other = ctxFor(rows, players(2), '1');
  assert.deepStrictEqual(majorLabels(other), [], 'default list: Climax of Night is a series there');
});

// B2-2 (ruled 2026-10-29, amendable): MBTL (36865) has its own list, the four known majors plus
// Climax of Night (kind game), because rule 6's test holds on the real MBTL data (Climax of Night
// MBTL Singles 142 / 158 entrants vs Frosty Faustings MBTL 85 / 73). UNI2 (50203) stays on default.
// The rows mirror out/crescendo-of-night-3-episode-0__allegro-mbtl-pc__20261014-1909/results.csv
// (tournament and event names, entrants, dates, game ids), read with the shipped config.
test('config/majors.json as shipped: an MBTL run gets a Climax of Night column (B2-2); UNI2 stays on the default list', () => {
  const cfg = loadMajorsConfig(SHIPPED);
  const MBTL = '36865', UNI2 = '50203';
  assert.deepStrictEqual(majorsForGame(cfg, MBTL).majors.map((m) => [m.label, m.kind]),
    [['CEO', 'known'], ['Evo', 'known'], ['Combo Breaker', 'known'], ['Frosty Faustings', 'known'], ['Climax of Night', 'game']]);
  assert.deepStrictEqual(majorsForGame(cfg, UNI2).majors.map((m) => m.label), ['CEO', 'Evo', 'Combo Breaker', 'Frosty Faustings'], 'UNI2 has no list of its own');
  const mbtl = (pid, tournament, event_name, num_entrants, event_date, extra = {}) => row(pid, tournament,
    { game_id: MBTL, game_name: 'Melty Blood: Type Lumina', event_name, num_entrants, event_date, ...extra });
  const s6 = mbtl(1, 'Climax of Night Season 6: [strong+hold]', '[strong+light] MBTL Singles', '158', '2024-10-25');
  const fin = mbtl(1, 'Climax of Night Final Season: [breakadawn]', '[all of the lights.] MBTL Singles', '142', '2025-10-24');
  const ff17 = mbtl(2, 'Frosty Faustings XVII 2025', 'Melty Blood: Type Lumina', '85', '2025-01-24');
  const ff18 = mbtl(2, 'Frosty Faustings XVIII 2026', 'Melty Blood: Type Lumina', '73', '2026-01-30');
  // Another game's Climax bracket in the same results: never an MBTL cell.
  const uni = row(3, 'Climax of Night Final Season: [breakadawn]', { game_id: UNI2, game_name: 'Under Night In-Birth II Sys:Celes', is_event_game: 'false', event_name: '[the last night.] UNI2 Singles', num_entrants: '491', event_date: '2025-10-24' });
  const rows = [s6, fin, also(2, fin), ff17, ff18, also(1, ff17), uni];
  const ps = players(3);
  const ctxWith = (majors) => {
    const index = M.buildSeriesIndex(rows, { majors });
    return R.summaryContext({ meta: { game: { name: 'MBTL' } }, players: ps, rows, records: {}, notes: {}, columns: M.chooseColumns(ps, rows.filter(M.isGame), index), index });
  };
  const after = ctxWith(majorsForGame(cfg, MBTL));
  assert.deepStrictEqual(majorLabels(after), ['Frosty Faustings', 'Climax of Night'], 'MBTL shows Frosty Faustings and Climax of Night');
  const p1 = rows.filter((r) => r.player_id === '1');
  assert.match(cellText(R.majorCell(p1, { label: 'Climax of Night' }, {}, after.index)), /^9th \/ 142 · — '25 9th \/ 158 · — '24$/, 'one result per year, MBTL brackets only');
  assert.ok(!/491/.test(cellText(R.majorCell(rows.filter((r) => r.player_id === '3'), { label: 'Climax of Night' }, {}, after.index))), 'the UNI2 bracket is not an MBTL cell');
  // Before B2-2 (the default list): no Climax of Night column for MBTL.
  assert.ok(!majorLabels(ctxWith(majorsForGame(cfg, UNI2))).includes('Climax of Night'));
});

test('rule 5: the main event is judged across the run (one bracket for everyone), and a larger excluded bracket never displaces it', () => {
  const main = row(1, 'Frosty Faustings XVII 2025', { num_entrants: '145', placement: '9' });
  const rows = [
    main, also(2, main, { placement: '49' }),
    // Player 3 entered only a smaller, unexcluded MBAACC bracket at the same tournament: not the main event.
    row(3, 'Frosty Faustings XVII 2025', { event_name: 'MBAACC Beginners', num_entrants: '20', placement: '1' }),
    // Player 1 also entered a bigger 2v2 at the same tournament: excluded, and it must not take the main's place.
    row(1, 'Frosty Faustings XVII 2025', { event_name: 'MBAACC 2v2', num_entrants: '300', placement: '2' }),
  ];
  const ctx = ctxFor(rows, players(3));
  assert.deepStrictEqual(majorLabels(ctx), ['Frosty Faustings']);
  const cell = (pid) => cellText(R.majorCell(rows.filter((r) => r.player_id === String(pid)), { label: 'Frosty Faustings' }, {}, ctx.index));
  assert.strictEqual(cell(1), "9th / 145 · — '25");
  assert.strictEqual(cell(2), "49th / 145 · — '25");
  assert.strictEqual(cell(3), '—', 'a bracket that is not the main event is not the major cell');
  assert.strictEqual(ctx.groupsBy['1']['Frosty Faustings'].rows[0], main, 'the series grouping keeps the main event, not the larger 2v2');
});

test('rule 5: one result per year per column — two tournaments of one major in a year: the larger main event is the column, the other a series', () => {
  const s6 = row(1, 'Climax of Night Season 6: [strong+hold]', { event_name: '[strong+blood] MBAACC Singles', num_entrants: '192', placement: '17', event_date: '2025-03-01' });
  const fin = row(1, 'Climax of Night Final Season: [breakadawn]', { event_name: '[a bloody finale.] MBAACC Singles', num_entrants: '245', placement: '9', event_date: '2025-11-08' });
  const y24 = row(1, 'Climax of Night Season 5', { num_entrants: '150', placement: '5', event_date: '2024-09-01' });
  const rows = [s6, fin, y24, also(2, s6, { placement: '3' })];
  const ctx = ctxFor(rows, players(2));
  const lines = (pid) => R.majorCell(rows.filter((r) => r.player_id === String(pid)), { label: 'Climax of Night' }, {}, ctx.index).match(/<div class="line">/g) || [];
  assert.strictEqual(lines(1).length, 2, 'player 1: one line for 2025 (the Final Season, larger) and one for 2024');
  assert.match(cellText(R.majorCell(rows.filter((r) => r.player_id === '1'), { label: 'Climax of Night' }, {}, ctx.index)), /^9th \/ 245 · — '25 5th \/ 150 · — '24$/);
  assert.strictEqual(cellText(R.majorCell(rows.filter((r) => r.player_id === '2'), { label: 'Climax of Night' }, {}, ctx.index)), '—', 'player 2 only played the smaller 2025 event');
  // That event is still shown, as a series of this game (here a shared-series column, since both
  // players have it), under a key that is not a major.
  const p2 = Object.entries(ctx.groupsBy['2']).find(([, g]) => g.rows.some((r) => r.event_id === s6.event_id));
  assert.ok(p2 && !ctx.index.isMajorKey(p2[0]), 'the smaller same-year event is a series, not lost');
  // Every major cell, for every player and column, holds at most one result per year.
  for (const p of players(2)) {
    for (const m of ctx.majors) {
      const years = (R.majorText(rows.filter((r) => r.player_id === p.player_id), m, {}, ctx.index).match(/\('(\d\d)\)/g) || []);
      assert.strictEqual(new Set(years).size, years.length, `${p.gamer_tag} ${m.label}`);
    }
  }
});

test('the four ratified display rules on major cells: summary, compare panel and Sheets export show placement / entrants · W-L per result, no counts, tables', () => {
  const main = row(1, 'Frosty Faustings XVIII 2026', { num_entrants: '133', placement: '7', event_date: '2026-01-30' });
  const rows = [main, also(2, main, { placement: '25' }), row(1, 'Combo Breaker 2025', { num_entrants: '96', placement: '13', event_date: '2025-05-23' })];
  const ps = players(2);
  const ctx = ctxFor(rows, ps);
  ctx.records[M.key(rows[0])] = { w: 4, l: 2, dq: 0 };
  assert.deepStrictEqual(majorLabels(ctx), ['Combo Breaker', 'Frosty Faustings'], 'config order');
  const summary = `<table class="summary"><thead>${R.summaryHeadRow(ctx)}</thead><tbody>${ps.map((p) => R.summaryRow(p, ctx)).join('')}</tbody></table>`;
  const compare = `<table class="summary"><thead>${R.summaryHeadRow({ ...ctx, app: true })}</thead><tbody>${ps.map((p) => R.summaryRow(p, { ...ctx, app: true })).join('')}</tbody></table>`;
  for (const html of [summary, compare]) {
    assert.match(html, /<b>7th \/ 133<\/b> · 4-2 <span class="dim">'26<\/span>/, 'rule 1: placement out of entrants, W-L, year secondary');
    assert.ok(!/<(ul|ol|li)\b/.test(html), 'rule 4: tables, not bullets');
    assert.ok(!/\b\d+ (wins|results|top)/i.test(html), 'rule 2: no aggregate counts');
  }
  const [head, ...body] = R.summaryTextTable(ctx, ps);
  const p1 = body.find((r) => r[r.length - 1] === '1');
  assert.strictEqual(p1[head.indexOf('Frosty Faustings')], "7th / 133 · 4-2 ('26)");
  assert.strictEqual(p1[head.indexOf('Combo Breaker')], "13th / 96 · — ('25)");
});
