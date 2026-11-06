'use strict';
// testlib/fake-dom.js — just enough of a browser to RUN the app's page scripts (app/public/*.js) in a
// test, instead of grepping their source. No HTML parser: an element's querySelector(sel) hands back
// one stable stub element per selector, and the elements a page script looks up by id are the ones
// the real server rendered (ids()). What a test checks is what the script did: listeners bound,
// requests sent, text shown, dialogs opened.
//
//   const page = loadPage(src, { html, fetch, location })
//   page.document.getElementById('add').dispatch('submit')   -> the listeners' event (await page.flush())
//   page.requests                                            -> every fetch the script made
const vm = require('node:vm');

function classList() {
  const s = new Set();
  return {
    add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)),
    toggle: (c, on) => { const want = on === undefined ? !s.has(c) : !!on; if (want) s.add(c); else s.delete(c); return want; },
    contains: (c) => s.has(c), get size() { return s.size; }, toString: () => [...s].join(' '),
  };
}

function makeEl(tag = 'div', { id = null, attrs = {}, dataset = {} } = {}) {
  const el = {
    tagName: String(tag).toUpperCase(), id, attrs: { ...attrs }, dataset: { ...dataset }, classList: classList(), style: {},
    hidden: 'hidden' in attrs, disabled: false, value: attrs.value || '', open: false, showModalCalls: 0, focusCalls: 0,
    children: [], listeners: {}, _q: new Map(), _qa: new Map(), _text: '', _html: '', files: [],
    offsetWidth: 0, offsetHeight: 0, tabIndex: -1, required: false,
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); this._html = ''; },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); this._text = String(v).replace(/<[^>]*>/g, ''); this._q.clear(); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); },
    // Calls the listeners; returns the event, with `results` (each listener's return, e.g. a promise).
    dispatch(type, extra = {}) {
      const ev = { type, target: el, defaultPrevented: false, button: 0, key: '', preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
      ev.results = (this.listeners[type] || []).map((fn) => fn.call(el, ev));
      return ev;
    },
    querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, makeEl('stub', { id: sel })); return this._q.get(sel); },
    querySelectorAll(sel) { return this._qa.get(sel) || []; },
    setAll(sel, list) { this._qa.set(sel, list); return this; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
    focus() { this.focusCalls++; }, select() {}, scrollIntoView() {}, click() { return this.dispatch('click'); },
    showModal() { this.open = true; this.showModalCalls++; }, close() { this.open = false; },
    contains(x) { return x === el || this.children.includes(x); }, closest() { return null; },
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.unshift(c); return c; }, remove() {},
  };
  return el;
}

// The ids (and their data-* attributes) in a page the server rendered, and the game picker's options.
function elementsFromHtml(html) {
  const byId = new Map();
  const attrsOf = (s) => Object.fromEntries([...s.matchAll(/([a-z-]+)="([^"]*)"/gi)].map((m) => [m[1], m[2]]).concat([...s.matchAll(/\s(hidden|required)(?=[\s>]|$)/g)].map((m) => [m[1], ''])));
  for (const m of String(html).matchAll(/<([a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const attrs = attrsOf(m[2]);
    const dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
    byId.set(m[3], makeEl(m[1], { id: m[3], attrs, dataset }));
  }
  const options = [...String(html).matchAll(/<li role="option"([^>]*)>/g)].map((m) => {
    const attrs = attrsOf(m[1]);
    const dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5), v]));
    return makeEl('li', { attrs: { role: 'option', ...attrs }, dataset });
  });
  return { byId, options };
}

// Runs a page script against a fake document. html: the page the server rendered (for ids).
// fetch(url, init) -> { status, body } (a plain object, sent as JSON) or a Response-like object.
function loadPage(src, { html = '', fetch, search = '', confirm = () => true, globals = {} } = {}) {
  const { byId, options } = elementsFromHtml(html);
  if (byId.has('upGameList')) byId.get('upGameList').setAll('[role="option"]', options);
  const events = /<ul class="events">/.test(html) ? makeEl('ul') : null;
  const misses = [];
  const created = [];
  const docListeners = {};
  const body = makeEl('body');
  const requests = [];
  const timers = [];
  const location = { search, href: 'http://127.0.0.1:8765/', reload() { this.reloaded = true; } };
  const document = {
    readyState: 'complete', body,
    getElementById: (id) => { if (!byId.has(id)) misses.push(id); return byId.get(id) || null; },
    querySelector: (sel) => (sel === 'ul.events' ? events : null),
    createElement: (tag) => { const e = makeEl(tag); created.push(e); return e; },
    addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); },
  };
  const respond = (r) => {
    const status = r.status || 200;
    const payload = r.body === undefined ? {} : r.body;
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  const ctx = {
    document, location, console, Promise, URLSearchParams, JSON, Math, Date, Number, String, Object, Array, Set, Map, Error, encodeURIComponent,
    innerWidth: 1280, innerHeight: 800,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
    confirm,
    fetch: async (url, init = {}) => { requests.push({ url, ...init }); return respond(await fetch(url, init)); },
    addEventListener: () => {},
    ...globals,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'page-script.js' });
  return {
    window: ctx, document, created, requests, location, timers, misses, events,
    runTimers() { const t = timers.splice(0); t.forEach((x) => x.fn()); },
    async flush(n = 6) { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); },
  };
}

module.exports = { makeEl, loadPage, elementsFromHtml };
