// lib/view/model.js — the seeding view's pure logic: series index, grouping, stats, column
// choice, the W-L tally and the events-both-entered join. No I/O, no DOM.
//
// It runs in two places: Node (the app server, views/major-table.js, the tests) and the browser
// (served by app/server.js as /static/model.js, where it becomes window.SeedModel). So it is plain
// ES2021 with no require() calls.
//
// Moved from views/major-table.js (increment 1's view) with behavior kept. Two changes, both
// covered by test/view-model.test.js: buildSeriesIndex finds a key's canonical prefix by walking
// its word prefixes instead of comparing every pair of keys (same result, linear instead of
// quadratic; a 200-player run has thousands of keys), and the column choice and fetch order
// that lived inline in the CLI's main() are now functions.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeedModel = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAJORS = [
    { label: 'CEO', re: /^CEO \d{4}\b/i },            // not "CEOtaku"
    { label: 'Evo', re: /^EVO \d{4}\b/i },
    { label: 'Combo Breaker', re: /combo breaker/i },
    { label: 'Frosty Faustings', re: /frosty faustings/i },
    { label: 'Climax of Night', re: /climax of night/i }, // not "Crescendo of Night"
  ];
  const BBB = /boston blue beat/i;
  const BBB_LABEL = 'Boston Blue Beat';
  const isMajorLabel = (k) => MAJORS.some((m) => m.label === k);

  const ord = (n) => { n = +n; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const place = (r) => (r.placement ? `${ord(r.placement)} / ${r.num_entrants}` : `— / ${r.num_entrants}`);
  const key = (r) => `${r.player_id}:${r.event_id}`;
  const isMajor = (r) => MAJORS.some((m) => m.re.test(r.tournament_name));
  const isGame = (r) => r.is_event_game === 'true';
  const eventLabel = (r) => (r.event_name && r.event_name !== r.tournament_name ? `${r.tournament_name} — ${r.event_name}` : r.tournament_name);

  // ---- W-L ------------------------------------------------------------------------------------
  // Set record for one entrant. DQ rule copied from startgg-results/core.js tallyRecords (D-6/D-7):
  // a set with any slot score of exactly -1 is a DQ and counts for neither side; a set without a
  // clean winner and a distinct opponent (a bye) is skipped.
  function recordFor(entrantId, sets) {
    let w = 0, l = 0, dq = 0;
    for (const s of sets) {
      const slots = s.slots || [];
      if (slots.some((x) => x && x.standing && x.standing.stats && x.standing.stats.score && x.standing.stats.score.value === -1)) { dq++; continue; }
      const ids = slots.map((x) => x && x.entrant && x.entrant.id).filter((x) => x != null).map(String);
      if (!ids.includes(String(entrantId)) || ids.length < 2 || s.winnerId == null || !ids.includes(String(s.winnerId))) continue;
      if (String(s.winnerId) === String(entrantId)) w++; else l++;
    }
    return { w, l, dq };
  }

  // A cached record that has at least one counted set; anything else shows as "—".
  function wlOf(records, r) {
    const rec = records[key(r)];
    return rec && !rec.missing && rec.w + rec.l > 0 ? rec : null;
  }
  const wlText = (rec) => (rec ? `${rec.w}-${rec.l}` : '—');

  // ---- Event series ---------------------------------------------------------------------------
  // start.gg has no series field, so a series is inferred from the tournament name: configured
  // series (MAJORS, BBB) by regex; everything else by a normalized name (numbering, dates, years,
  // seasons/weeks, bracketed notes, prize tags and trailing roman numerals stripped), then merged
  // into a shorter name it extends word-for-word ("bracket about nothing uni 2 open" -> "bracket
  // about nothing"). Heuristic: the view lists each series' events so a bad merge is visible.
  const PRIZE = /^(\$\d+\+?|\d[\d,]*\s*(jpy|usd|yen)\+?.*prize.*|.*prize pool!?)$/i;
  // The series part of a tournament name: bracketed notes removed first (they can hold " | "),
  // then the first " - " / " | " segment that isn't a prize tag.
  function seriesPart(name) {
    const s = String(name).replace(/[\[({<][^\])}>]*[\])}>]/g, ' '); // [Week 9] (PC) {UNI 2} <PEEK>
    const parts = s.split(/\s+[-|–—]\s+/);
    return parts.find((p) => p.trim() && !PRIZE.test(p.trim())) || parts[0];
  }
  // Display form: original casing, numbering/dates/years/seasons stripped.
  function prettyLabel(name) {
    return seriesPart(name)
      .replace(/^\s*\$\d+\+?\s*/, '')
      .replace(/\b\d{1,2}\/\d{1,2}(\s*(to|-)\s*\d{1,2}\/\d{1,2})?\b/g, ' ')
      .replace(/\b\d{1,2}\.\d{2}\b/g, ' ')                          // 4.25
      .replace(/\b(season|week|vol\.?|volume|episode|ep\.?)\s*\d+\b/gi, ' ')
      .replace(/#\s*\d+/g, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\s+([ivxlc]{1,7}|\d+)\s*$/i, ' ')                  // trailing XVII / LX / 3
      .replace(/\s+/g, ' ').replace(/^[\s:|-]+|[\s:|-]+$/g, '').trim() || String(name);
  }
  function normalizeName(name) {
    let s = seriesPart(name);
    s = s.toLowerCase()
      .replace(/^\$\d+\+?\s*/, ' ')                                // leading $25+
      .replace(/\b\d{1,2}\/\d{1,2}(\s*(to|-)\s*\d{1,2}\/\d{1,2})?\b/g, ' ') // 10/5 to 10/8
      .replace(/\b(season|week|vol\.?|volume|episode|ep\.?|part|s)\s*\d+\b/g, ' ')
      .replace(/#\s*\d+/g, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/\b\d+(st|nd|rd|th)?\b/g, ' ')
      .replace(/[®™©]/g, ' ')
      .replace(/[^a-z0-9:'&+ ]+/g, ' ')
      .replace(/\s+[ivxlc]{1,7}\s*$/, ' ')                           // trailing roman numerals (XVII, LX)
      .replace(/\s+/g, ' ').replace(/^[\s:-]+|[\s:-]+$/g, '').trim();
    return s || String(name).toLowerCase();
  }
  function seriesKeyFor(r) {
    const m = MAJORS.find((x) => x.re.test(r.tournament_name));
    if (m) return m.label;
    if (BBB.test(r.tournament_name)) return BBB_LABEL;
    return normalizeName(r.tournament_name);
  }

  // One series index for the whole run, so a series has the same key for every player: a shorter
  // key (2+ words) absorbs any key that extends it word-for-word, across all players' results.
  // A key's canonical form is its SHORTEST word prefix of 2+ words that is itself a key (that
  // prefix cannot have been absorbed: anything absorbing it would be a shorter prefix still).
  // This is what increment 1's pairwise loop computed, found by walking prefixes instead.
  function canonicalKeys(rawKeys) {
    const present = new Set(rawKeys);
    const canon = {};
    for (const k of present) {
      canon[k] = k;
      const words = k.split(' ');
      for (let n = 2; n < words.length; n++) {
        const p = words.slice(0, n).join(' ');
        if (present.has(p)) { canon[k] = p; break; }
      }
    }
    return canon;
  }
  function buildSeriesIndex(rows) {
    const keyOfRaw = new Map();
    for (const r of rows) if (!keyOfRaw.has(r.tournament_name)) keyOfRaw.set(r.tournament_name, seriesKeyFor(r));
    const canon = canonicalKeys(keyOfRaw.values());
    const names = {};
    for (const [t, k] of keyOfRaw) (names[canon[k]] ??= new Set()).add(t);
    const labels = {};
    const label = (k) => (labels[k] ??= (isMajorLabel(k) || k === BBB_LABEL ? k
      : names[k] ? prettyLabel([...names[k]].sort((a, b) => a.length - b.length)[0]) : k));
    return { keyOf: (r) => canon[keyOfRaw.get(r.tournament_name) ?? seriesKeyFor(r)] ?? seriesKeyFor(r), label };
  }
  // The browser receives each row's series key and the labels precomputed by the server (the
  // index is run-wide, so it is built once, where all the rows are). This rebuilds the same
  // interface from them.
  function indexFromKeys(labels, field = 's') {
    return { keyOf: (r) => r[field], label: (k) => labels[k] ?? k };
  }

  // Main bracket per tournament: the largest field (brackets of one tournament can span days).
  function mainBrackets(rows) {
    const byT = {};
    for (const r of rows) (byT[r.tournament_name] ??= []).push(r);
    return Object.values(byT).map((g) => [...g].sort((a, b) => +b.num_entrants - +a.num_entrants)[0]);
  }
  // Main bracket per tournament, grouped into series by the run's index.
  function groupSeries(rows, index = buildSeriesIndex(rows)) {
    const groups = {};
    for (const r of mainBrackets(rows)) (groups[index.keyOf(r)] ??= []).push(r);
    return Object.entries(groups).map(([k, rs]) => (
      { key: k, label: index.label(k), rows: rs.sort((a, b) => b.event_date.localeCompare(a.event_date)) }));
  }

  // Best placement (placement relative to field, ties to the bigger field), best W-L (win rate,
  // ties to more wins) and average W-L over the events that have one. No totals (display rule 3).
  function seriesStats(rows, records) {
    const placed = rows.filter((r) => r.placement).sort((a, b) => +a.placement - +b.placement || +b.num_entrants - +a.num_entrants);
    const withWl = rows.map((r) => ({ r, rec: wlOf(records, r) })).filter((x) => x.rec);
    const best = withWl.length ? [...withWl].sort((a, b) => b.rec.w / (b.rec.w + b.rec.l) - a.rec.w / (a.rec.w + a.rec.l) || b.rec.w - a.rec.w)[0] : null;
    const W = withWl.reduce((n, x) => n + x.rec.w, 0), L = withWl.reduce((n, x) => n + x.rec.l, 0);
    return {
      bestPlaced: placed[0] || null,
      best,
      avg: withWl.length ? { w: W / withWl.length, l: L / withWl.length, n: withWl.length } : null,
    };
  }

  // A series table's row order: biggest field first, then most events.
  function sortedSeries(rows, records, index) {
    return groupSeries(rows, index)
      .map((s) => ({ ...s, st: seriesStats(s.rows, records), maxN: Math.max(...s.rows.map((r) => +r.num_entrants)) }))
      .sort((a, b) => b.maxN - a.maxN || b.rows.length - a.rows.length);
  }

  // ---- Players and columns --------------------------------------------------------------------
  // Seeded players first (notes.json), then alphabetical: no ranking is implied by row order.
  // With tiers (registry/tiers.csv): highest tier first, untiered after — like Noah's sheet filter.
  function orderPlayers(players, notes) {
    const tierOf = (p) => (Number.isFinite(notes[p.player_id]?.tier) ? notes[p.player_id].tier : -1);
    return [...players].sort((a, b) => (notes[a.player_id]?.seed ?? 999) - (notes[b.player_id]?.seed ?? 999)
      || tierOf(b) - tierOf(a)
      || a.gamer_tag.localeCompare(b.gamer_tag, undefined, { sensitivity: 'base' }));
  }
  const region = (p) => [p.region_state, p.region_country].filter(Boolean).join(', ');

  function rowsByPlayer(rows) {
    const by = {};
    for (const r of rows) (by[r.player_id] ??= []).push(r);
    return by;
  }

  // Summary columns: majors at least one registrant played, then the series the most registrants
  // share (the comparable ones), top SHARED_MAX with at least SHARED_MIN players.
  const SHARED_MAX = 6;
  function chooseColumns(players, gameRows, index) {
    const gameBy = rowsByPlayer(gameRows);
    const groupsBy = Object.fromEntries(players.map((p) => [p.player_id,
      Object.fromEntries(groupSeries(gameBy[p.player_id] || [], index).map((g) => [g.key, g]))]));
    const sharedMin = Math.max(2, Math.ceil(players.length * 0.2));
    const majors = MAJORS.filter((m) => players.some((p) => groupsBy[p.player_id][m.label]));
    const reach = {};
    for (const p of players) for (const k of Object.keys(groupsBy[p.player_id])) reach[k] = (reach[k] || 0) + 1;
    const shared = Object.entries(reach).filter(([k, n]) => n >= sharedMin && !isMajorLabel(k))
      .sort((a, b) => b[1] - a[1]).slice(0, SHARED_MAX).map(([k, n]) => ({ key: k, label: index.label(k), n }));
    return { majors, shared, groupsBy };
  }

  // W-L fetch order: results the summary columns use (majors + shared series, this game) first,
  // so the summary is complete early; the per-player detail fills in after.
  function fetchOrder(rows, columns, index) {
    const summaryKeys = new Set([...columns.majors.map((m) => m.label), ...columns.shared.map((x) => x.key)]);
    const inSummary = (r) => isGame(r) && summaryKeys.has(index.keyOf(r));
    const summary = rows.filter(inSummary);
    return { ordered: [...summary, ...rows.filter((r) => !inSummary(r))], summaryCount: summary.length, inSummary };
  }

  // ---- Compare --------------------------------------------------------------------------------
  // Events both players entered, joined on the bracket (event_id), newest first. This compares
  // placements at the same event; it is not head-to-head sets.
  function eventsBothEntered(rowsA, rowsB) {
    const byEvent = new Map(rowsB.map((r) => [String(r.event_id), r]));
    const seen = new Set();
    const out = [];
    for (const a of rowsA) {
      const id = String(a.event_id);
      const b = byEvent.get(id);
      if (!b || seen.has(id)) continue;
      seen.add(id);
      out.push({ a, b });
    }
    return out.sort((x, y) => y.a.event_date.localeCompare(x.a.event_date)
      || +y.a.num_entrants - +x.a.num_entrants || eventLabel(x.a).localeCompare(eventLabel(y.a)));
  }

  // Two players' series side by side: a series both played is one row. Order: shared series
  // (biggest field first), then A's own, then B's own, each in series-table order.
  function alignSeries(seriesA, seriesB) {
    const bByKey = new Map(seriesB.map((s) => [s.key, s]));
    const aKeys = new Set(seriesA.map((s) => s.key));
    const both = [], onlyA = [];
    for (const a of seriesA) (bByKey.has(a.key) ? both : onlyA).push({ key: a.key, label: a.label, a, b: bByKey.get(a.key) || null });
    const maxN = (x) => Math.max(x.a ? x.a.maxN : 0, x.b ? x.b.maxN : 0);
    both.sort((x, y) => maxN(y) - maxN(x));
    const onlyB = seriesB.filter((s) => !aKeys.has(s.key)).map((b) => ({ key: b.key, label: b.label, a: null, b }));
    return [...both, ...onlyA, ...onlyB];
  }

  return {
    MAJORS, BBB, BBB_LABEL, SHARED_MAX,
    ord, place, key, isMajor, isGame, isMajorLabel, eventLabel, region,
    recordFor, wlOf, wlText,
    seriesPart, prettyLabel, normalizeName, seriesKeyFor, canonicalKeys, buildSeriesIndex, indexFromKeys,
    mainBrackets, groupSeries, seriesStats, sortedSeries,
    orderPlayers, rowsByPlayer, chooseColumns, fetchOrder,
    eventsBothEntered, alignSeries,
  };
}));
