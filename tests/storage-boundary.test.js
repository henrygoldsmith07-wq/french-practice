// Storage-boundary regression test.
//
// storageCore.js is THE physical persistence boundary — its header says so:
// "Nothing else in the app may touch localStorage except through here".
// Product components historically grew raw `fp.*` accesses (the conversation
// mode, the Culture/RealWorld seen-lists), each one invisible until something
// broke in a household or an export. This test walks src/ and fails on any
// REAL `localStorage.<op>` outside:
//
//   1. the storage infrastructure (storageCore, the storage facade, stores/)
//   2. a short, documented list of modules whose direct access is deliberate
//
// Comment mentions ("…re-reads localStorage on tick") do NOT count — only
// property access (`localStorage.getItem` etc.) does.
//
// sessionStorage is out of scope here: it is deliberately session-scoped and
// has exactly one component use today (ChatArena's fp.sessionMins budget).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

// The sanctioned layers: anything under these paths may touch browser storage.
const INFRASTRUCTURE = [
  'lib/storageCore.js', // the boundary itself
  'lib/storage.js', // legacy facade, still a sanctioned layer (migrating store-by-store)
];

const isInfrastructure = (rel) =>
  INFRASTRUCTURE.includes(rel) || rel.startsWith('lib/stores/'); // every domain store

// Documented, deliberate direct access — each entry explains WHY it is not
// routed through storageCore today. Removing an entry is preferred; adding
// one requires the same justification in this comment.
const DOCUMENTED_BOUNDARIES = {
  // The A/B practice-variant assignment is global by design: it must be stable
  // across learners, households and exports — it is not learner data.
  'lib/assignment.js': 'pre-learner global A/B variant; must stay un-namespaced',
  // Storage is injectable so the conversation memory is testable in Node
  // without a browser; localStorage is only the default adapter.
  'lib/conversation.js': 'injectable storage adapter (localStorage is the default)',
  // Quota-watch state and the relay token are infra keys that never entered the
  // KEYS map; raw access matches their (non-routed) storage semantics.
  'lib/quota.js': 'quota-watch state key not in the KEYS map',
  'lib/relay.js': 'relay token key not in the KEYS map',
};

// `localStorage.foo` — but NOT a sentence-ending period (`localStorage. Nothing`
// in a prose comment has whitespace after the dot, so the negative lookahead
// lets it pass while real `localStorage.getItem` access still matches).
const REAL_ACCESS = /localStorage\s*\.(?!\s)[A-Za-z_$]/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.endsWith('.bak')) out.push(p);
  }
  return out;
}

test('no product component touches localStorage directly', () => {
  const violations = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length + 1).split(/[\\/]/).join('/'); // src-root-relative
    const text = readFileSync(file, 'utf8');
    if (!REAL_ACCESS.test(text)) continue;
    const sanctioned =
      isInfrastructure(rel) || Object.prototype.hasOwnProperty.call(DOCUMENTED_BOUNDARIES, rel);
    if (!sanctioned) violations.push(rel);
  }
  assert.deepEqual(
    violations,
    [],
    `Direct localStorage access outside storageCore. Route it through a store ` +
      `(see stores/seenStore.js for the pattern) or, if the access is genuinely ` +
      `deliberate, document it in DOCUMENTED_BOUNDARIES in this test. Offenders: ` +
      violations.join(', ')
  );
});

test('the migrated preference and seen-list keys are learner-routed', async () => {
  const core = await import('../src/lib/storageCore.js');
  // These used to be raw component-level keys. If they ever fall out of
  // the routing set, households silently share them again — pin both directions.
  for (const name of ['conversationMode', 'cultureSeen', 'realworldSeen', 'path', 'phonemeProfile']) {
    assert.ok(core.KEYS[name], `KEYS.${name} missing`);
    assert.equal(core.isLearnerKey(core.KEYS[name]), true, `KEYS.${name} must be learner-routed`);
  }
});
