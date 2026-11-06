'use strict';
// Export CSV, RUN: app/public/app.js boots on a fake page (testlib/fake-dom.js; everything but the
// table and the button is a stand-in), the button is clicked, and the request it sends is checked:
// POST to the tab's export.csv, the app header, and the table's current order in the body (not the
// URL, which overflowed Node's header limit past ~2000 registrants: test/export-post.test.js).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, makeEl, anything } = require('../testlib/fake-dom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'public', 'app.js'), 'utf8');

test('export button: posts the table\'s current order (by row position, not DOM order) in the body to export.csv', async () => {
  // Three rows whose DOM order differs from their position (data-i), as after a re-sort.
  const rows = [['300', '2'], ['100', '0'], ['200', '1']].map(([pid, i]) => makeEl('tr', { dataset: { pid, i } }));
  const summary = makeEl('table', { id: 'summary' }).setAll('tbody tr[data-pid]', rows);
  summary.tHead = anything('thead');
  summary.tBodies = [anything('pinned'), anything('main')];
  const exportCsv = makeEl('button', { id: 'exportCsv' });
  const csv = 'Seed,Tag\n1,A\n';
  const g = { SeedModel: anything('SeedModel'), SeedRender: anything('SeedRender'), SEED_TAB: { t: 'some-major', game: { id: '1386', name: 'MBAACC' }, events: ['ev'] },
    localStorage: anything('localStorage'), performance: anything('performance'), PerformanceObserver: anything('PerformanceObserver'),
    IntersectionObserver: anything('IntersectionObserver'), ResizeObserver: anything('ResizeObserver'), requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    Blob: class { constructor(parts) { this.parts = parts; } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }, setInterval: () => 0, clearInterval: () => {},
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
    getComputedStyle: anything('getComputedStyle'), matchMedia: anything('matchMedia'), navigator: anything('navigator'), history: anything('history'), CSS: anything('CSS') };
  const page = loadPage(SRC, {
    stubMissing: true, elements: { summary, exportCsv }, globals: g,
    fetch: async (url) => (/export\.csv/.test(url) ? { body: csv, raw: true } : new Promise(() => {})),   // only the export answers
  });
  const ev = exportCsv.dispatch('click');
  await Promise.all(ev.results);
  const req = page.requests.find((r) => /export\.csv/.test(r.url));
  assert.ok(req, 'the click sent an export request');
  assert.strictEqual(req.url, '/api/t/some-major/g/1386/export.csv', 'nothing in the URL but the route');
  assert.strictEqual(req.method, 'POST');
  assert.strictEqual(req.headers['X-Seeding-App'], '1');
  assert.deepStrictEqual(JSON.parse(req.body), { order: ['100', '200', '300'] });
});
