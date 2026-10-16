'use strict';
// lib/view/model.js — the seeding view's pure logic (series index, grouping, stats, column
// choice, W-L tally, the events-both-entered join). Offline, no fixtures from out/.
const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../lib/view/model');

let nextEvent = 1;
// A results.csv-shaped row. Strings, like the CSV.
function row(player, tournament, extra = {}) {
  return {
    player_id: String(player), gamer_tag: `P${player}`, event_date: '2026-01-01', game_id: '1', game_name: 'MBTL',
    is_event_game: 'true', tournament_name: tournament, event_name: tournament, event_slug: '', event_id: String(nextEvent++),
    num_entrants: '16', placement: '5', is_online: 'false', ...extra,
  };
}
const dqSet = (a, b) => ({ winnerId: a, slots: [{ entrant: { id: a }, standing: { stats: { score: { value: 0 } } } }, { entrant: { id: b }, standing: { stats: { score: { value: -1 } } } }] });
const set = (winner, a, b) => ({ winnerId: winner, slots: [{ entrant: { id: a } }, { entrant: { id: b } }] });

test('model: "Blood Moon LX" roman numerals merge into one series, and the label drops them', () => {
  const names = ['Blood Moon LX', 'Blood Moon LXI', 'Blood Moon L', 'Blood Moon XXXVIII', 'Blood Moon IV', 'Blood Moon #12'];
  const rows = names.map((n) => row(1, n));
  const idx = M.buildSeriesIndex(rows);
  assert.deepStrictEqual(new Set(rows.map(idx.keyOf)), new Set(['blood moon']));
  assert.strictEqual(idx.label('blood moon'), 'Blood Moon');
  const groups = M.groupSeries(rows, idx);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].rows.length, names.length);
});

test('model: <…>, […], {…} and (…) notes are stripped before the series key', () => {
  assert.strictEqual(M.normalizeName('The New Moon Arcadian <BOUNDARY PEEK>'), 'the new moon arcadian');
  assert.strictEqual(M.normalizeName('The New Moon Arcadian {CIRCUIT SPARK}'), 'the new moon arcadian');
  assert.strictEqual(M.normalizeName('TNS Melty Blood Type Lumina #3 (PC)'), 'tns melty blood type lumina');
  assert.strictEqual(M.normalizeName('Melty Sweep 87'), 'melty sweep');
  assert.strictEqual(M.normalizeName('Melty sweep 78'), 'melty sweep');
  assert.strictEqual(M.prettyLabel('Melty Sweep <PEEK> 87'), 'Melty Sweep');
});

test('model: run-wide key consistency — one series gets the same key for two players', () => {
  // Player 1 only played the extended name; player 2 only the short one. Built per player, the
  // keys would differ; built once over the run, both land on the shorter key.
  const a = row(1, 'Bracket About Nothing UNI 2 Open #4');
  const b = row(2, 'Bracket About Nothing #7');
  const idx = M.buildSeriesIndex([a, b]);
  assert.strictEqual(idx.keyOf(a), 'bracket about nothing');
  assert.strictEqual(idx.keyOf(b), 'bracket about nothing');
  const g1 = M.groupSeries([a], idx), g2 = M.groupSeries([b], idx);
  assert.strictEqual(g1[0].key, g2[0].key);
  // A one-word key never absorbs (too generic).
  const c = row(1, 'Lunar'), d = row(2, 'Lunar Exam #14');
  const idx2 = M.buildSeriesIndex([c, d]);
  assert.notStrictEqual(idx2.keyOf(c), idx2.keyOf(d));
});

test('model: configured majors and Boston Blue Beat are keyed by label, not name', () => {
  assert.strictEqual(M.seriesKeyFor(row(1, 'CEO 2026')), 'CEO');
  assert.strictEqual(M.seriesKeyFor(row(1, 'CEOtaku 2025')), 'ceotaku');
  assert.strictEqual(M.seriesKeyFor(row(1, 'EVO 2025')), 'Evo');
  assert.strictEqual(M.seriesKeyFor(row(1, 'Climax of Night Season 6: [strong+hold]')), 'Climax of Night');
  assert.notStrictEqual(M.seriesKeyFor(row(1, 'Crescendo of Night 3 - Episode 0')), 'Climax of Night');
  assert.strictEqual(M.seriesKeyFor(row(1, 'Boston Blue Beat #40')), 'Boston Blue Beat');
});

test('model: main bracket = the largest field of a tournament', () => {
  const side = row(1, 'Frosty Faustings XVIII 2026', { event_name: 'Side bracket', num_entrants: '24', placement: '1' });
  const main = row(1, 'Frosty Faustings XVIII 2026', { event_name: 'Main', num_entrants: '310', placement: '49' });
  const mains = M.mainBrackets([side, main]);
  assert.deepStrictEqual(mains, [main]);
  const groups = M.groupSeries([side, main], M.buildSeriesIndex([side, main]));
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].rows, [main]);
});

test('model: the DQ rule — a -1 score is a DQ for neither side; byes are skipped', () => {
  const sets = [
    set(10, 10, 20),             // win
    set(20, 10, 20),             // loss
    dqSet(10, 20),               // DQ: neither
    { winnerId: 10, slots: [{ entrant: { id: 10 } }, { entrant: null }] }, // bye
    { winnerId: null, slots: [{ entrant: { id: 10 } }, { entrant: { id: 30 } }] }, // no winner
    set(40, 40, 50),             // not this entrant's set
  ];
  assert.deepStrictEqual(M.recordFor(10, sets), { w: 1, l: 1, dq: 1 });
  assert.deepStrictEqual(M.recordFor('10', [set('10', '10', '20')]), { w: 1, l: 0, dq: 0 }); // ids compare as strings
});

test('model: W-L tally — a record shows only with a counted set; missing shows —', () => {
  const r = row(1, 'X Cup');
  assert.strictEqual(M.wlText(M.wlOf({ [M.key(r)]: { w: 3, l: 2, dq: 0 } }, r)), '3-2');
  assert.strictEqual(M.wlText(M.wlOf({ [M.key(r)]: { w: 0, l: 0, dq: 2 } }, r)), '—');
  assert.strictEqual(M.wlText(M.wlOf({ [M.key(r)]: { missing: true } }, r)), '—');
  assert.strictEqual(M.wlText(M.wlOf({}, r)), '—');
});

test('model: series stats — best placement (bigger field wins ties), best W-L, average only over events with W-L', () => {
  const a = row(1, 'S Cup 1', { placement: '2', num_entrants: '8', event_date: '2026-01-01' });
  const b = row(1, 'S Cup 2', { placement: '2', num_entrants: '30', event_date: '2026-02-01' });
  const c = row(1, 'S Cup 3', { placement: '', num_entrants: '12', event_date: '2026-03-01' });
  const rec = { [M.key(a)]: { w: 4, l: 1, dq: 0 }, [M.key(b)]: { w: 2, l: 2, dq: 0 } };
  const st = M.seriesStats([a, b, c], rec);
  assert.strictEqual(st.bestPlaced, b);
  assert.strictEqual(st.best.r, a);
  assert.deepStrictEqual(st.avg, { w: 3, l: 1.5, n: 2 });
  assert.strictEqual(M.place(c), '— / 12');
  assert.strictEqual(M.place(b), '2nd / 30');
  assert.strictEqual(M.ord(11), '11th');
  assert.strictEqual(M.ord(23), '23rd');
});

test('model: column choice — majors only if someone played them; shared series need 20% of players (min 2), max 6, majors excluded', () => {
  const players = Array.from({ length: 10 }, (_, i) => ({ player_id: String(i + 1), gamer_tag: `P${i + 1}` }));
  const rows = [];
  // Series s0..s7: s_k played by (8 - k) players. sharedMin = ceil(10*0.2) = 2 -> s0..s6 qualify, top 6 kept.
  for (let k = 0; k < 8; k++) for (let p = 1; p <= 8 - k; p++) rows.push(row(p, `Series${k} Cup #${p}`));
  rows.push(row(1, 'CEO 2026'), row(2, 'CEO 2025'), row(3, 'CEO 2024'));
  rows.push(row(1, 'Lonely Cup #1'));
  const idx = M.buildSeriesIndex(rows);
  const cols = M.chooseColumns(players, rows, idx);
  assert.deepStrictEqual(cols.majors.map((m) => m.label), ['CEO']);
  assert.deepStrictEqual(cols.shared.map((s) => s.key), ['series0 cup', 'series1 cup', 'series2 cup', 'series3 cup', 'series4 cup', 'series5 cup']);
  assert.deepStrictEqual(cols.shared.map((s) => s.n), [8, 7, 6, 5, 4, 3]);
  // Fetch order: this game's summary-column results first.
  const other = row(4, 'Series0 Cup #9', { is_event_game: 'false' });
  const { ordered, summaryCount } = M.fetchOrder([row(9, 'Lonely Cup #2'), other, ...rows], cols, idx);
  assert.ok(ordered.slice(0, summaryCount).every((r) => r.is_event_game === 'true'));
  assert.ok(ordered.indexOf(other) >= summaryCount, 'another game\'s result is not a summary result');
  assert.strictEqual(ordered.length, rows.length + 2);
});

test('model: players — seeded first, then alphabetical ignoring case', () => {
  const ps = [{ player_id: '1', gamer_tag: 'zed' }, { player_id: '2', gamer_tag: 'Amy' }, { player_id: '3', gamer_tag: 'bob' }, { player_id: '4', gamer_tag: 'Cy' }];
  assert.deepStrictEqual(M.orderPlayers(ps, {}).map((p) => p.gamer_tag), ['Amy', 'bob', 'Cy', 'zed']);
  assert.deepStrictEqual(M.orderPlayers(ps, { 1: { seed: 1 }, 4: { seed: 2 } }).map((p) => p.gamer_tag), ['zed', 'Cy', 'Amy', 'bob']);
});

test('model: events both entered — joined on the bracket (event_id), newest first, not on tournament name', () => {
  const shared1 = row(1, 'Melty Sweep 87', { event_id: '500', event_date: '2026-05-01' });
  const shared2 = row(1, 'Blood Moon LX', { event_id: '600', event_date: '2026-06-01' });
  const sideA = row(1, 'Frosty Faustings XVIII 2026', { event_id: '701', event_name: 'Main' });
  const b1 = row(2, 'Melty Sweep 87', { event_id: '500', event_date: '2026-05-01', placement: '1' });
  const b2 = row(2, 'Blood Moon LX', { event_id: '600', event_date: '2026-06-01', placement: '9' });
  const sideB = row(2, 'Frosty Faustings XVIII 2026', { event_id: '702', event_name: 'Side' }); // other bracket
  const onlyB = row(2, 'Lunar Exam #3', { event_id: '800' });
  const pairs = M.eventsBothEntered([shared1, shared2, sideA], [b1, b2, sideB, onlyB]);
  assert.deepStrictEqual(pairs.map((p) => p.a.event_id), ['600', '500']);
  assert.strictEqual(pairs[0].b, b2);
  assert.deepStrictEqual(M.eventsBothEntered([shared1], []), []);
});

test('model: compare series — a series both played is one row; shared first, then A only, then B only', () => {
  const rec = {};
  const A = [row(1, 'Melty Sweep 1', { num_entrants: '20' }), row(1, 'Blood Moon X', { num_entrants: '40' }), row(1, 'Only A Cup', { num_entrants: '99' })];
  const B = [row(2, 'Melty Sweep 2', { num_entrants: '20' }), row(2, 'Blood Moon XI', { num_entrants: '45' }), row(2, 'Only B Cup', { num_entrants: '5' })];
  const idx = M.buildSeriesIndex([...A, ...B]);
  const al = M.alignSeries(M.sortedSeries(A, rec, idx), M.sortedSeries(B, rec, idx));
  assert.deepStrictEqual(al.map((x) => [x.key, !!x.a, !!x.b]), [
    ['blood moon', true, true], ['melty sweep', true, true], ['only a cup', true, false], ['only b cup', false, true]]);
});

// A2-4 (build-record-webapp.md, pass 2): eventsSharedBy and alignSeriesN — the N-player compare's
// pure logic (acceptance 7/8, "Compare up to 3", built out-of-band in bc93955) — shipped with zero
// unit tests even though their 2-player predecessors just above are directly tested. These mirror
// those tests, 2- and 3-player, including the display rules (no totals, average only for 2+,
// shared-first ordering).
test('model: eventsSharedBy — 2 players reduces to eventsBothEntered\'s result (same join, same order)', () => {
  const shared1 = row(1, 'Melty Sweep 87', { event_id: '500', event_date: '2026-05-01' });
  const shared2 = row(1, 'Blood Moon LX', { event_id: '600', event_date: '2026-06-01' });
  const sideA = row(1, 'Frosty Faustings XVIII 2026', { event_id: '701', event_name: 'Main' });
  const b1 = row(2, 'Melty Sweep 87', { event_id: '500', event_date: '2026-05-01', placement: '1' });
  const b2 = row(2, 'Blood Moon LX', { event_id: '600', event_date: '2026-06-01', placement: '9' });
  const sideB = row(2, 'Frosty Faustings XVIII 2026', { event_id: '702', event_name: 'Side' });

  const pairs = M.eventsBothEntered([shared1, shared2, sideA], [b1, b2, sideB]);
  const shared = M.eventsSharedBy([[shared1, shared2, sideA], [b1, b2, sideB]]);
  assert.deepStrictEqual(shared.map((s) => s.n), [2, 2], 'only the 2 jointly-entered events qualify, not the side brackets');
  assert.deepStrictEqual(shared.map((s) => s.rows[0].event_id), pairs.map((p) => p.a.event_id));
  assert.deepStrictEqual(shared.map((s) => s.rows[1].event_id), pairs.map((p) => p.b.event_id));
});

test('model: eventsSharedBy — 3 players: an event only 2 of them entered still qualifies (n >= 2), with the 3rd slot null', () => {
  const a = row(1, 'Lunar Exam #3', { event_id: '900', event_date: '2026-07-01' });
  const b = row(2, 'Lunar Exam #3', { event_id: '900', event_date: '2026-07-01', placement: '2' });
  const abc = row(1, 'Blood Moon LX', { event_id: '600', event_date: '2026-06-01' });
  const abc2 = row(2, 'Blood Moon LX', { event_id: '600', event_date: '2026-06-01', placement: '4' });
  const abc3 = row(3, 'Blood Moon LX', { event_id: '600', event_date: '2026-06-01', placement: '7' });
  const onlyC = row(3, 'Only C Cup', { event_id: '950' });

  const shared = M.eventsSharedBy([[a, abc], [b, abc2], [abc3, onlyC]]);
  // Newest first: Lunar Exam (07-01) before Blood Moon (06-01).
  assert.deepStrictEqual(shared.map((s) => s.n), [2, 3]);
  assert.deepStrictEqual(shared.map((s) => s.rows[2]), [null, abc3]);
  assert.strictEqual(M.eventsSharedBy([[a], [], []]).length, 0, 'no event with 2+ entrants qualifies');
});

// A4-5 (build-record-webapp.md, pass 4): this test's name used to say alignSeriesN "reduces to
// alignSeries's result" at 2 players — that overclaims what's checked below (series keys and
// shared/only-side counts, in order), not full row-for-row equivalence. render.test.js's
// compareSeriesTableN test found the actual gap: alignSeriesN tie-breaks only-one-side rows by
// field size across both sides together, so row order inside an only-one-side group can differ
// from alignSeries at N=2, even though the same series appear with the same stats.
test('model: alignSeriesN — 2 players covers the same series, in the same order, as alignSeries (by key and shared/only-side count; row order within an only-one-side group can differ)', () => {
  const rec = {};
  const A = [row(1, 'Melty Sweep 1', { num_entrants: '20' }), row(1, 'Blood Moon X', { num_entrants: '40' }), row(1, 'Only A Cup', { num_entrants: '99' })];
  const B = [row(2, 'Melty Sweep 2', { num_entrants: '20' }), row(2, 'Blood Moon XI', { num_entrants: '45' }), row(2, 'Only B Cup', { num_entrants: '5' })];
  const idx = M.buildSeriesIndex([...A, ...B]);
  const two = M.alignSeries(M.sortedSeries(A, rec, idx), M.sortedSeries(B, rec, idx));
  const n = M.alignSeriesN([M.sortedSeries(A, rec, idx), M.sortedSeries(B, rec, idx)]);
  assert.deepStrictEqual(n.map((x) => x.key), two.map((x) => x.key));
  assert.deepStrictEqual(n.map((x) => x.n), two.map((x) => (x.a && x.b ? 2 : 1)));
});

test('model: alignSeriesN — 3 players: series more of them share sort first; a series only one played still appears', () => {
  const rec = {};
  const A = [row(1, 'Melty Sweep 1', { num_entrants: '20' }), row(1, 'Only A Cup', { num_entrants: '8' })];
  const B = [row(2, 'Melty Sweep 2', { num_entrants: '22' })];
  const C = [row(3, 'Melty Sweep 3', { num_entrants: '18' }), row(3, 'Blood Moon X', { num_entrants: '40' })];
  const idx = M.buildSeriesIndex([...A, ...B, ...C]);
  const lists = [M.sortedSeries(A, rec, idx), M.sortedSeries(B, rec, idx), M.sortedSeries(C, rec, idx)];
  const n = M.alignSeriesN(lists);
  // Melty Sweep: all 3 (n=3) sorts before Blood Moon / Only A Cup (n=1 each, alphabetical tiebreak).
  assert.strictEqual(n[0].key, 'melty sweep');
  assert.strictEqual(n[0].n, 3);
  assert.deepStrictEqual(n[0].sides.map(Boolean), [true, true, true]);
  const rest = n.slice(1).sort((a, b) => a.label.localeCompare(b.label));
  assert.deepStrictEqual(rest.map((x) => x.label), ['Blood Moon', 'Only A Cup']);
  assert.ok(rest.every((x) => x.n === 1));
});

test('model: indexFromKeys rebuilds the run-wide index from per-row keys (what the browser gets)', () => {
  const rows = [row(1, 'Bracket About Nothing UNI 2 Open'), row(2, 'Bracket About Nothing #3')];
  const idx = M.buildSeriesIndex(rows);
  const shipped = rows.map((r) => ({ ...r, s: idx.keyOf(r) }));
  const labels = { 'bracket about nothing': idx.label('bracket about nothing') };
  const idx2 = M.indexFromKeys(labels);
  assert.deepStrictEqual(M.groupSeries(shipped, idx2).map((g) => [g.key, g.label]), M.groupSeries(rows, idx).map((g) => [g.key, g.label]));
});

// Increment 1's pairwise absorption loop, kept here verbatim as the oracle for canonicalKeys.
function referenceCanon(rawKeys) {
  const raw = [...new Set(rawKeys)].sort((a, b) => a.length - b.length);
  const canon = {};
  for (const k of raw) {
    canon[k] ??= k;
    if (k.split(' ').length < 2 || canon[k] !== k) continue;
    for (const k2 of raw) if (k2 !== k && (k2 + ' ').startsWith(k + ' ') && canon[k2] == null) canon[k2] = k;
  }
  return canon;
}

test('model: canonicalKeys equals increment 1\'s pairwise loop (handwritten + 300 random key sets)', () => {
  const hand = ['a', 'a b', 'a b c', 'a b c d', 'a bc', 'x y z', 'x y', 'x', 'blood moon', 'blood moon lx', 'q  r', 'q  r s', 'CEO', 'Boston Blue Beat'];
  assert.deepStrictEqual(M.canonicalKeys(hand), referenceCanon(hand));
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const words = ['a', 'b', 'c', 'd', 'moon', 'cup'];
  for (let t = 0; t < 300; t++) {
    const keys = Array.from({ length: 1 + rnd(25) }, () => Array.from({ length: 1 + rnd(5) }, () => words[rnd(words.length)]).join(' '));
    assert.deepStrictEqual(M.canonicalKeys(keys), referenceCanon(keys), JSON.stringify(keys));
  }
});
