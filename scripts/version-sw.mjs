/**
 * Stamps the service worker's cache name with a per-build id.
 *
 * public/sw.js keeps the literal placeholder `__BUILD_ID__` so dev never
 * churns caches; after `vite build` this rewrites ONLY dist/sw.js, replacing
 * the placeholder with a stable content fingerprint of the bundle. Same
 * output → same id → no needless cache rotation for identical rebuilds;
 * any asset change → new id → activate() deletes the previous build's
 * runtime cache instead of letting orphaned content-hashed chunks pile up.
 *
 * Idempotent and safe to re-run (the fingerprint is computed from the dist
 * JS, not from the file being rewritten).
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const DIST = 'dist';
const PLACEHOLDER = '__BUILD_ID__';
const PRECACHE_SLOT = '/* __PRECACHE__ */ []';
const swPath = join(DIST, 'sw.js');

let sw;
try {
  sw = readFileSync(swPath, 'utf8');
} catch {
  console.error('version-sw: dist/sw.js not found — skipping (run `vite build` first).');
  process.exit(0);
}
if (!sw.includes(PLACEHOLDER) && !sw.includes(PRECACHE_SLOT)) {
  // Already stamped (or the placeholder was removed) — nothing to do.
  process.exit(0);
}

// Fingerprint the shipped JS so the id tracks the actual bundle, not time, and
// collect the same files for the precache manifest.
const hash = createHash('sha256');
const assets = [];
let any = false;
for (const f of readdirSync(DIST, { recursive: true })) {
  const p = join(DIST, String(f));
  let s;
  try { s = statSync(p); } catch { continue; }
  if (!s.isFile() || !/\.js$/.test(p) || p === swPath) continue;
  hash.update(String(f));
  hash.update(readFileSync(p));
  any = true;
  assets.push(`./${String(f).split(/[\\/]/).join('/')}`);
}
// CSS too: an app that has its markup but not its stylesheet is not "offline
// ready" in any sense a learner would recognise.
for (const f of readdirSync(DIST, { recursive: true })) {
  const p = join(DIST, String(f));
  let s;
  try { s = statSync(p); } catch { continue; }
  if (!s.isFile() || !/\.css$/.test(p)) continue;
  assets.push(`./${String(f).split(/[\\/]/).join('/')}`);
}
const buildId = any
  ? hash.digest('hex').slice(0, 12)
  : Date.now().toString(36); // no JS (odd build) — at least make the id unique

const stamped = sw
  .split(PLACEHOLDER).join(buildId)
  .split(PRECACHE_SLOT).join(JSON.stringify(assets));
if (stamped === sw) process.exit(0);
try {
  writeFileSync(swPath, stamped);
  console.log(`version-sw: cache name stamped → le-studio-${buildId}`);
  console.log(`version-sw: precache manifest → ${assets.length} build assets`);
} catch (e) {
  console.error(`version-sw: could not rewrite dist/sw.js (${e.message})`);
  process.exit(1);
}
