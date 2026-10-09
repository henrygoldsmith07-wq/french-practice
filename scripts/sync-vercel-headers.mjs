#!/usr/bin/env node
// Generates vercel.json's security headers from scripts/lib/security-headers.mjs
// and asserts the committed file matches.
//
// The headers are defined once (security-headers.mjs) and consumed by BOTH
// vercel.json (production) and vite.config.js (dev/preview), so a policy change
// can never ship to one and not the other.
//
//   node scripts/sync-vercel-headers.mjs          # rewrite vercel.json
//   node scripts/sync-vercel-headers.mjs --check  # verify only

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SECURITY_HEADERS } from './lib/security-headers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'vercel.json');
const CHECK_ONLY = process.argv.includes('--check');

const config = JSON.parse(readFileSync(target, 'utf8'));

// Long-lived immutable assets are cached forever by the service worker, so
// Vercel must agree on immutable caching for hashed build output.
const ASSET_CACHE = 'public, max-age=31536000, immutable';

config.headers = [
  {
    source: '/assets/(.*)',
    headers: [{ key: 'Cache-Control', value: ASSET_CACHE }],
  },
  {
    // Applied to every response, including the SPA fallback and the API
    // routes. frame-ancestors 'none' + HSTS live here.
    source: '/(.*)',
    headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
  },
];

const next = `${JSON.stringify(config, null, 2)}\n`;
const current = readFileSync(target, 'utf8');

if (current === next) {
  console.log('[sync-vercel-headers] OK — vercel.json security headers match security-headers.mjs.');
} else if (CHECK_ONLY) {
  console.error('\n[sync-vercel-headers] FAIL — vercel.json is out of date.\n');
  console.error('Run: node scripts/sync-vercel-headers.mjs\n');
  process.exit(1);
} else {
  writeFileSync(target, next, 'utf8');
  console.log('[sync-vercel-headers] vercel.json rewritten from security-headers.mjs.');
}
