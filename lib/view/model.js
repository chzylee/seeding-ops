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
//
// Increment 3 (docs/design-tool.md, display rules 5, 6 and 9): majors are per game and main-event
// only. This file holds no majors list: the list for the run's game comes from config/majors.json
// (lib/view/majors.js) as buildSeriesIndex's opts.majors, and a major is a series KEY the index
// gives only to the selected main-event rows (mainEventMajors), so the browser, which gets each
// row's key from the server, needs no patterns at all. Tier recency (rule 9) is `recency` below.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeedModel = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BBB = /boston blue beat/i;
  const BBB_LABEL = 'Boston Blue Beat';

  const ord = (n) => { n = +n; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const place = (r) => (r.placement ? `${ord(r.placement)} / ${r.num_entrants}` : `— / ${r.num_entrants}`);
  const key = (r) => `${r.player_id}:${r.event_id}`;
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
  // A row's series by its tournament name alone. Majors are not decided here: whether a row is a
  // major depends on the game and on the other brackets at that tournament (mainEventMajors).
  function seriesKeyFor(r) {
    if (BBB.test(r.tournament_name)) return BBB_LABEL;
    return normalizeName(r.tournament_name);
  }

  // ---- Majors per game (display rules 5 and 6) --------------------------------------------------
  // majors = { majors: [{ label, re, kind }], exclude: [RegExp] }: one game's list from
  // config/majors.json (lib/view/majors.js majorsForGame). Over the whole run's rows of the seeded
  // game (isGame):
  //   1. a bracket is a candidate for a major when its tournament name matches the entry's pattern
  //      (the first entry that matches) and neither its tournament nor its event name matches an
  //      exclude pattern (side / community / 2v2 / teams / "Pre-" by default);
  //   2. the tournament's MAIN EVENT for the seeded game is its largest candidate bracket (by
  //      entrants), judged across every registrant's results, so it is the same bracket for all;
  //   3. one per year per column: when two tournaments of one major fall in the same year, the
  //      larger main event is the column's result for that year (rule 5: "a major is a single
  //      yearly event"); the other stays a series.
  // Returns Map(event_id -> label). Rows not in it are series (rule 7).
  const yearOf = (r) => String(r.event_date).slice(0, 4);
  // > 0 when a should win over b: more entrants, then the later date, then the lower event id.
  const preferEvent = (a, b) => (+a.num_entrants - +b.num_entrants)
    || String(a.event_date).localeCompare(String(b.event_date))
    || String(b.event_id).localeCompare(String(a.event_id), undefined, { numeric: true });
  function majorEntryFor(r, majors) {
    if (!majors || !isGame(r)) return null;
    const m = majors.majors.find((x) => x.re.test(r.tournament_name));
    if (!m) return null;
    if (majors.exclude.some((re) => re.test(r.tournament_name) || re.test(r.event_name || ''))) return null;
    return m;
  }
  function mainEventMajors(rows, majors) {
    const out = new Map();
    if (!majors) return out;
    const mainOf = new Map(); // label \0 tournament -> { r, label }
    for (const r of rows) {
      const m = majorEntryFor(r, majors);
      if (!m) continue;
      const k = `${m.label}\u0000${r.tournament_name}`;
      const cur = mainOf.get(k);
      if (!cur || preferEvent(r, cur.r) > 0) mainOf.set(k, { r, label: m.label });
    }
    const yearly = new Map(); // label \0 year -> { r, label }
    for (const x of mainOf.values()) {
      const k = `${x.label}\u0000${yearOf(x.r)}`;
      const cur = yearly.get(k);
      if (!cur || preferEvent(x.r, cur.r) > 0) yearly.set(k, x);
    }
    for (const x of yearly.values()) out.set(String(x.r.event_id), x.label);
    return out;
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
  // opts.majors: the game's majors list (see mainEventMajors). Without it there are no majors and
  // every row is a series. The index answers keyOf(row), label(key), isMajorKey(key) and lists
  // the majors present in the run, in config order (index.majors: [{ label, kind }]).
  function buildSeriesIndex(rows, { majors } = {}) {
    const majorOf = mainEventMajors(rows, majors);
    const majorKeys = new Set(majorOf.values());
    const keyOfRaw = new Map();
    for (const r of rows) if (!keyOfRaw.has(r.tournament_name)) keyOfRaw.set(r.tournament_name, seriesKeyFor(r));
    const canon = canonicalKeys(keyOfRaw.values());
    const names = {};
    for (const [t, k] of keyOfRaw) (names[canon[k]] ??= new Set()).add(t);
    const labels = {};
    const label = (k) => (labels[k] ??= (majorKeys.has(k) || k === BBB_LABEL ? k
      : names[k] ? prettyLabel([...names[k]].sort((a, b) => a.length - b.length)[0]) : k));
    const seriesOf = (r) => canon[keyOfRaw.get(r.tournament_name) ?? seriesKeyFor(r)] ?? seriesKeyFor(r);
    return {
      keyOf: (r) => majorOf.get(String(r.event_id)) ?? seriesOf(r),
      label,
      isMajorKey: (k) => majorKeys.has(k),
      majors: majors ? majors.majors.filter((m) => majorKeys.has(m.label)).map((m) => ({ label: m.label, kind: m.kind })) : [],
    };
  }
  // The browser receives each row's series key and the labels precomputed by the server (the
  // index is run-wide, so it is built once, where all the rows are), plus the run's major labels
  // (view model columns.majors). This rebuilds the same interface from them.
  function indexFromKeys(labels, majorLabels = [], field = 's') {
    const majorKeys = new Set(majorLabels.map((m) => (typeof m === 'string' ? m : m.label)));
    return { keyOf: (r) => r[field], label: (k) => labels[k] ?? k, isMajorKey: (k) => majorKeys.has(k),
      majors: [...majorKeys].map((label) => ({ label })) };
  }

  // Main bracket per tournament: the largest field (brackets of one tournament can span days).
  // prefer(row): a row that must win its tournament regardless of size (a selected major main
  // event, which a larger excluded bracket such as a 2v2 must not displace).
  function mainBrackets(rows, prefer) {
    const byT = {};
    for (const r of rows) (byT[r.tournament_name] ??= []).push(r);
    return Object.values(byT).map((g) => (prefer && g.find(prefer)) || [...g].sort((a, b) => +b.num_entrants - +a.num_entrants)[0]);
  }
  // Main bracket per tournament, grouped into series by the run's index.
  function groupSeries(rows, index = buildSeriesIndex(rows)) {
    const groups = {};
    const prefer = index.isMajorKey ? (r) => index.isMajorKey(index.keyOf(r)) : null;
    for (const r of mainBrackets(rows, prefer)) (groups[index.keyOf(r)] ??= []).push(r);
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
  // The within-tier tie-break (tier, then tag) is byTierThenTag, the one the seed order's tier mode
  // uses (A2.3: the initial seeds are this table's order).
  function orderPlayers(players, notes) {
    const tierOf = (p) => (Number.isFinite(notes[p.player_id]?.tier) ? notes[p.player_id].tier : null);
    return [...players].sort((a, b) => (notes[a.player_id]?.seed ?? 999) - (notes[b.player_id]?.seed ?? 999)
      || byTierThenTag({ tier: tierOf(a), tag: a.gamer_tag }, { tier: tierOf(b), tag: b.gamer_tag }));
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
    const majors = (index.majors || []).filter((m) => players.some((p) => groupsBy[p.player_id][m.label]));
    const reach = {};
    for (const p of players) for (const k of Object.keys(groupsBy[p.player_id])) reach[k] = (reach[k] || 0) + 1;
    const shared = Object.entries(reach).filter(([k, n]) => n >= sharedMin && !index.isMajorKey(k))
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

  // Compare, up to 3 players (N-way). Events at least two of them entered, joined on the bracket
  // (event_id): [{ rows: [row|null per player], n }], newest first.
  function eventsSharedBy(rowsList) {
    const byEvent = new Map();
    rowsList.forEach((rows, i) => {
      for (const r of rows) {
        const id = String(r.event_id);
        if (!byEvent.has(id)) byEvent.set(id, rowsList.map(() => null));
        if (!byEvent.get(id)[i]) byEvent.get(id)[i] = r;
      }
    });
    const out = [];
    for (const rows of byEvent.values()) {
      const n = rows.filter(Boolean).length;
      if (n >= 2) out.push({ rows, n });
    }
    const first = (x) => x.rows.find(Boolean);
    return out.sort((x, y) => first(y).event_date.localeCompare(first(x).event_date)
      || +first(y).num_entrants - +first(x).num_entrants || eventLabel(first(x)).localeCompare(eventLabel(first(y))));
  }
  // Series side by side for N players: [{ key, label, sides: [series|null per player], n }].
  // Series more of them played come first, then by largest field.
  function alignSeriesN(seriesLists) {
    const byKey = new Map();
    seriesLists.forEach((list, i) => {
      for (const s of list) {
        if (!byKey.has(s.key)) byKey.set(s.key, { key: s.key, label: s.label, sides: seriesLists.map(() => null) });
        byKey.get(s.key).sides[i] = s;
      }
    });
    const maxN = (x) => Math.max(...x.sides.map((s) => (s ? s.maxN : 0)));
    return [...byKey.values()].map((x) => ({ ...x, n: x.sides.filter(Boolean).length }))
      .sort((x, y) => y.n - x.n || maxN(y) - maxN(x) || x.label.localeCompare(y.label));
  }

  // ---- Tier review and recency (T1 rules; display rule 9) --------------------------------------
  // n: a player's notes entry (lib/view/data.js readNotes): tier, last_reviewed_on (YYYY-MM-DD),
  // last_reviewed_tournament (a tournament slug). `today` is YYYY-MM-DD; `tournament` is the
  // page's tournament slug. Bands (docs/design-tool.md, Open questions default):
  //   'here'   reviewed at this tournament (green)
  //   'recent' last reviewed within RECENT_MONTHS of today (no color)
  //   'old'    last reviewed before that (amber)
  //   'never'  has a tier, never reviewed: a sheet-only tier (grey)
  //   null     no tier and no review: nothing to color
  const RECENT_MONTHS = 6;
  const pad2 = (n) => String(n).padStart(2, '0');
  // The same day of the month n months earlier, clamped to that month's last day (Aug 31 -> Feb 28).
  function monthsBefore(day, n) {
    const [y, m, d] = String(day).split('-').map(Number);
    const idx = y * 12 + (m - 1) - n;
    const yy = Math.floor(idx / 12), mm = idx - yy * 12 + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${pad2(mm)}-${pad2(Math.min(d, last))}`;
  }
  const reviewedHere = (n, tournament) => !!(n && tournament && n.last_reviewed_tournament && n.last_reviewed_tournament === tournament);
  function recency(n, { tournament, today } = {}) {
    if (!n) return null;
    if (reviewedHere(n, tournament)) return 'here';
    if (n.last_reviewed_on) return today && n.last_reviewed_on < monthsBefore(today, RECENT_MONTHS) ? 'old' : 'recent';
    return Number.isFinite(n.tier) ? 'never' : null;
  }

  // The status-line note after a ✓ click (app/public/app.js toggleReviewed); '' when the click needs
  // none. An un-✓ that changed nothing kept a review (T1 rules: it only undoes a review made here
  // today); one that put an earlier review back says so (B2-1). `body` is the review route's reply.
  function reviewNote(tag, reviewed, body, tournament) {
    if (reviewed || !body) return '';
    const on = body.last_reviewed_on, at = body.last_reviewed_tournament;
    if (body.changed) return on ? `${tag}: today's review undone; the review of ${on} at ${at} is back.` : '';
    if (!on) return `${tag} has no review to undo.`;
    const where = at === tournament ? 'here' : `at ${at}`;
    return `${tag} was reviewed ${where} on ${on}; a click only undoes a review made here today, so that review stays.`;
  }

  // ---- Seed numbering (docs/design-tool.md, Outputs) ---------------------------------------------
  // The ONE sequence both outputs number with: the export (lib/view/data.js seedsExport, the table's
  // order within a tier) and the push (lib/push.js, start.gg's current order within a tier).
  // entries: [{ id, tier (number or null), mappable (false for a seed with no player) }] in the
  // within-tier order to keep. Groups, concatenated and numbered 1..N: (a) tiered, tier descending
  // (higher tier gets the lower seed number), the given order within a tier; (b) untiered, the given
  // order; (c) unmappable, the given order. The tool never orders beyond tiers by itself.
  function seedSequence(entries) {
    const isTiered = (e) => e.mappable !== false && Number.isFinite(e.tier);
    const tiered = entries.filter(isTiered).map((e, i) => ({ e, i }))
      .sort((a, b) => b.e.tier - a.e.tier || a.i - b.i).map((x) => ({ ...x.e, group: 'tiered' }));
    const untiered = entries.filter((e) => e.mappable !== false && !isTiered(e)).map((e) => ({ ...e, group: 'untiered' }));
    const unmappable = entries.filter((e) => e.mappable === false).map((e) => ({ ...e, group: 'unmappable' }));
    return [...tiered, ...untiered, ...unmappable].map((e, k) => ({ ...e, seed: k + 1 }));
  }

  // ---- Seed order (docs/design-tool.md, Amendment A2.3) -----------------------------------------
  // One event's seeds: an order of player ids, numbered 1..N. Two modes:
  //   'tiers'     nothing arranged: the tier order, with the table's own within-tier tie-break
  //               (orderPlayers: tier descending, untiered last, then tag), recomputed on every read,
  //               so a tier edit moves the player.
  //   'arranged'  Noah dragged a row: his order, saved per event (state.json `seeding`), the source
  //               of truth for the push. A later read reconciles it with the event's entrants:
  //               an id no longer entered is dropped (the gap closes), and an entrant not in it slots
  //               in by tier: after the last player whose tier is at least its own (untiered: at the
  //               end), several newcomers in tier order among themselves.
  // entrants: [{ id, tier (number | null), tag }].
  const tierKey = (t) => (Number.isFinite(t) ? t : -1);
  const byTierThenTag = (a, b) => tierKey(b.tier) - tierKey(a.tier) || String(a.tag || '').localeCompare(String(b.tag || ''), undefined, { sensitivity: 'base' });
  function tierOrder(entrants) {
    return [...entrants].sort(byTierThenTag).map((e) => String(e.id));
  }
  function reconcileOrder(saved, entrants) {
    const byId = new Map(entrants.map((e) => [String(e.id), e]));
    const seen = new Set();
    const list = [];
    for (const id of saved || []) {
      const k = String(id);
      if (byId.has(k) && !seen.has(k)) { seen.add(k); list.push(k); }
    }
    for (const id of tierOrder(entrants.filter((e) => !seen.has(String(e.id))))) {
      const t = tierKey(byId.get(id).tier);
      let at = list.length - 1;
      while (at >= 0 && tierKey(byId.get(list[at]).tier) < t) at--;
      list.splice(at + 1, 0, id);
      seen.add(id);
    }
    return list;
  }
  // saved: { order: [ids], at } or null. -> { mode, order, at }.
  function seedOrder(entrants, saved) {
    if (saved && Array.isArray(saved.order)) return { mode: 'arranged', order: reconcileOrder(saved.order, entrants), at: saved.at || null };
    return { mode: 'tiers', order: tierOrder(entrants), at: null };
  }
  // A move: `id` placed before or after `targetId`. -> a new order (the same order when nothing moves).
  function moveSeed(order, id, targetId, where) {
    const k = String(id), t = String(targetId);
    if (k === t || !order.includes(k) || !order.includes(t)) return order.slice();
    const rest = order.filter((x) => x !== k);
    const i = rest.indexOf(t) + (where === 'after' ? 1 : 0);
    rest.splice(i, 0, k);
    return rest;
  }

  // ---- The push plan (docs/design-tool.md, Outputs 2; Amendment A2.3 as ruled 2026-11-07) ---------
  // Noah: "push should prepare the seed column and then send what was finalized". The Seed column is
  // the push's order in both modes: `order` is the column as the page shows it (tier order, or the
  // arranged order), and `mode` only says which of the two it is. Reconciled with start.gg's seeds by
  // reconcileOrder: a seed whose player is not in the column (not in the pool yet) slots in by tier; a
  // column player start.gg no longer seeds is skipped (the gap closes); then the unmappable seeds, in
  // start.gg's order. With no order given, the seeds' own tier order (the column's rule over the seeds).
  // There is no "start.gg's order within a tier" any more (premise 1's default, ruled out 2026-11-07).
  // entries: start.gg's seeds, in its current order: [{ id (seed id), current, mappable, player_id,
  // tag, sort_tag, tier, in_pool }]. Every seed is placed exactly once and numbered 1..N. A move that
  // passes a seed of another tier group relative to start.gg's current order is flagged
  // (crosses_tier). Pure: the page redraws an open dry run with it after every drag or tier edit.
  function pushPlan(entries, { order = null, mode = null } = {}) {
    const groupOf = (e) => (e.mappable === false ? 'unmappable' : Number.isFinite(e.tier) ? 'tiered' : 'untiered');
    const mappable = entries.filter((e) => e.mappable !== false);
    const queue = new Map();
    for (const e of mappable) { const k = String(e.player_id); if (!queue.has(k)) queue.set(k, []); queue.get(k).push(e); }
    const column = reconcileOrder(order || [], [...queue.keys()].map((k) => { const e = queue.get(k)[0]; return { id: k, tier: e.tier, tag: e.sort_tag ?? e.tag }; }));
    const placed = column.map((k) => queue.get(k).shift());
    const left = [...queue.values()].flat(); // a player on two seeds (start.gg should never send it): kept, after
    const seq = [...placed, ...left, ...entries.filter((e) => e.mappable === false)].map((e, i) => ({ ...e, group: groupOf(e), seed: i + 1 }));
    const gk = (x) => (x.group === 'tiered' ? `tier:${x.tier}` : x.group);
    const pos = new Map(seq.map((x) => [x.id, x.seed]));
    const rows = seq.map((x) => ({
      seed_id: x.id, player_id: x.player_id, tag: x.tag, tier: x.tier, group: x.group,
      current: x.current, proposed: x.seed, moved: x.current !== x.seed,
      crosses_tier: seq.some((y) => y.id !== x.id && gk(y) !== gk(x) && Math.sign(y.current - x.current) !== Math.sign(pos.get(y.id) - pos.get(x.id))),
      not_in_pool: x.mappable !== false && !x.in_pool,
    }));
    const count = (f) => rows.filter(f).length;
    return {
      mode: mode === 'arranged' ? 'arranged' : 'tiers', rows,
      summary: { seeds: rows.length, tiered: count((r) => r.group === 'tiered'), untiered: count((r) => r.group === 'untiered'), unmappable: count((r) => r.group === 'unmappable'),
        moved: count((r) => r.moved), crosses_tier: count((r) => r.crosses_tier), not_in_pool: count((r) => r.not_in_pool) },
    };
  }
  // What a dry run proposes, as [seed id, seed number] pairs: the page sends the pairs it shows with
  // Post, and the server posts only when its own plan is the same (Amendment A2.3: what is posted is
  // what was on screen).
  const proposedPairs = (rows) => rows.map((r) => [String(r.seed_id), Number(r.proposed)]);

  // ---- Tier import choices (docs/design-tool.md, Amendment A2.2) ---------------------------------
  // The review (lib/tiers-share.js previewImport) lists `new` rows (no tier here) and `conflicts`
  // (a different tier here). choices: { [row key]: 'theirs' | 'mine' }. A row with no choice takes the
  // default: a new row is added (theirs), a conflict keeps mine. -> the keys to apply.
  const IMPORT_DEFAULT = { new: 'theirs', conflicts: 'mine' };
  const importChoice = (choices, section, key) => (choices && (choices[key] === 'theirs' || choices[key] === 'mine') ? choices[key] : IMPORT_DEFAULT[section]);
  function importTake(preview, choices) {
    const keys = [];
    for (const section of ['new', 'conflicts']) {
      for (const x of (preview && preview[section]) || []) if (importChoice(choices, section, x.key) === 'theirs') keys.push(String(x.key));
    }
    return keys;
  }
  // "Keep all mine" / "Take all theirs" (conflicts), "Add none" / "Add all" (new): one section set to
  // one side. Returns a new choices object; the other section's choices are kept.
  function importBulk(preview, choices, section, side) {
    const next = { ...(choices || {}) };
    for (const x of (preview && preview[section]) || []) next[x.key] = side;
    return next;
  }

  return {
    importTake, importBulk, importChoice,
    tierOrder, reconcileOrder, seedOrder, moveSeed, pushPlan, proposedPairs,
    seedSequence,
    eventsSharedBy, alignSeriesN, reviewNote,
    BBB, BBB_LABEL, SHARED_MAX, RECENT_MONTHS,
    ord, place, key, isGame, eventLabel, region,
    recordFor, wlOf, wlText,
    seriesPart, prettyLabel, normalizeName, seriesKeyFor, canonicalKeys, buildSeriesIndex, indexFromKeys,
    mainEventMajors, majorEntryFor, monthsBefore, reviewedHere, recency,
    mainBrackets, groupSeries, seriesStats, sortedSeries,
    orderPlayers, rowsByPlayer, chooseColumns, fetchOrder,
    eventsBothEntered, alignSeries,
  };
}));
