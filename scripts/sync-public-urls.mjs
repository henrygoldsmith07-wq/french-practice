#!/usr/bin/env node
// Public-URL consistency guard.
//
// The canonical link, Open Graph and Twitter tags (index.html), the sitemap,
// robots.txt and llms.txt must all name the deployment that actually serves
// the app. When they drift — as they did when index.html still pointed at a
// dead `claude-code-alpha-nine.vercel.app` deployment — crawlers index the
// wrong host and every shared link previews as a 404.
//
// This script rewrites those files from one SITE_URL value and then asserts
// they agree, so the check fails loudly if anything drifts again. Run with
// `--check` to verify without writing.
//
//   node scripts/sync-public-urls.mjs            # rewrite + verify
//   node scripts/sync-public-urls.mjs --check    # verify only

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_URL } from './lib/site-url.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const read = (rel) => readFileSync(join(root, rel), 'utf8');
const write = (rel, text) => writeFileSync(join(root, rel), text, 'utf8');

// The canonical host, with no trailing slash. Every absolute URL below is
// derived from this single string.
const HOST = SITE_URL;

/** Replace every vercel.app (or localhost) absolute URL with the canonical host. */
function toHost(text) {
  return text.replace(/https?:\/\/(?:[a-z0-9-]+\.)*vercel\.app|https?:\/\/127\.0\.0\.1:\d+|https?:\/\/localhost:\d+/gi, HOST);
}

const targets = [
  'index.html',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/llms.txt',
];

let changed = 0;
for (const rel of targets) {
  const before = read(rel);
  const after = toHost(before);
  if (after !== before) {
    changed += 1;
    if (!CHECK_ONLY) write(rel, after);
  }
}

// ---- verify: nothing public-facing may name a stale host -------------------

const problems = [];
const STALE_HOST = /https?:\/\/(?!le-studio-french\.vercel\.app)(?:[a-z0-9-]+\.)*vercel\.app/i;

for (const rel of targets) {
  const text = read(rel);
  for (const m of text.match(STALE_HOST) || []) {
    problems.push(`${rel}: stale deployment URL ${m}`);
  }
}

if (problems.length) {
  console.error('\n[sync-public-urls] FAIL — public files name a deployment that is not the canonical host:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nCanonical host (SITE_URL): ${HOST}`);
  console.error('Fix by running: node scripts/sync-public-urls.mjs');
  console.error('or set SITE_URL=<real deployment> for this build.\n');
  process.exit(1);
}

console.log(`[sync-public-urls] OK — index.html, robots.txt, sitemap.xml and llms.txt all agree on ${HOST}${changed && !CHECK_ONLY ? ` (${changed} rewritten)` : ''}.`);
