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

module.exports = { loadToken };
