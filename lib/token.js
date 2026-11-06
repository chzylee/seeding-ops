'use strict';
// lib/token.js — find the start.gg token without ever printing it.
// Order: the STARTGG_TOKEN environment variable, then STARTGG_TOKEN in <repo>/.env.
// A hosted runtime injects the variable directly, so the .env step simply finds nothing there.

const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

function loadToken({ env = process.env, envFile } = {}) {
  const fromEnv = (env.STARTGG_TOKEN || '').trim();
  if (fromEnv) return { token: fromEnv, source: 'environment' };
  if (envFile && fs.existsSync(envFile)) {
    const parsed = parseEnv(fs.readFileSync(envFile, 'utf8'));
    const fromFile = (parsed.STARTGG_TOKEN || '').trim();
    if (fromFile) return { token: fromFile, source: path.basename(envFile) };
  }
  return { token: '', source: null };
}

// Save a token into <repo>/.env (Noah, 2026-11-05: the app asks for one on first launch). The
// existing file is kept line for line; the STARTGG_TOKEN line is replaced (or appended); written to
// a temp file and renamed. Never logs the value. The environment variable, when set, still wins at
// read time, and callers say so.
function saveToken({ envFile, token }) {
  const t = String(token || '').trim();
  if (!t) throw new Error('empty token');
  let lines = [];
  if (fs.existsSync(envFile)) lines = fs.readFileSync(envFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  let done = false;
  lines = lines.map((l) => { if (/^\s*STARTGG_TOKEN\s*=/.test(l) && !done) { done = true; return `STARTGG_TOKEN=${t}`; } return l; });
  if (!done) { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); lines.push(`STARTGG_TOKEN=${t}`); }
  const text = lines.join('\n').replace(/\n*$/, '\n');
  const tmp = envFile + '.tmp';
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, envFile);
  return { file: path.basename(envFile) };
}

// One request: who this token belongs to. { ok: true, as } or { ok: false, kind, message }.
async function validateToken({ token, fetchImpl, now, sleep }) {
  const sgg = require('./startgg');
  const client = sgg.createClient({ token, fetchImpl, now, sleep });
  try {
    // Who the token belongs to, with the profile picture for the account bar (User.images(type:
    // "profile"), model knowledge of the schema; a missing picture is simply null).
    const d = await client.request('CurrentUser', 'query CurrentUser { currentUser { id slug player { id gamerTag prefix } images(type: "profile") { url } } }', {}, {}, { retry: false });
    const u = d && d.currentUser;
    if (!u) return { ok: false, kind: 'bad-token', message: 'start.gg did not recognise this token.' };
    const img = Array.isArray(u.images) && u.images[0] && typeof u.images[0].url === 'string' && /^https:\/\//.test(u.images[0].url) ? u.images[0].url : null;
    return { ok: true, as: (u.player && u.player.gamerTag) || `user ${u.id}`, prefix: (u.player && u.player.prefix) || null, image: img, slug: u.slug || null,
      user_id: String(u.id), player_id: u.player ? String(u.player.id) : null };
  } catch (err) {
    const kind = err && err.kind ? err.kind : 'network';
    const message = kind === 'bad-token' ? 'start.gg rejected this token. Check it was copied whole, or make a new one.'
      : kind === 'network' ? `Could not reach start.gg: ${err.message}` : `start.gg answered with an error (${kind}): ${err.message}`;
    return { ok: false, kind, message };
  }
}

module.exports = { loadToken, saveToken, validateToken };
