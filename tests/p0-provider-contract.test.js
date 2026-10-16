import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MODEL_LIMITS } from '../server/relay-validation.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// ── P0.5: the provider/relay model contract must be coherent ───────────────
// The browser client (src/lib/groq.js) speaks to NVIDIA NIM with `nvidia/*`
// model ids. The server relay (server/relay.js + relay-validation.js) was
// written against Groq and only allowlists Groq model ids. If these two sets
// never intersect, every relayed call fails validation with model_not_allowed
// — the relay path is dead. This test makes that mismatch visible and fails
// loudly until the contract is unified.

function clientChatModels() {
  const src = read('src/lib/groq.js');
  const models = new Set();
  for (const m of src.matchAll(/(?:CHAT_MODEL|CHAT_FALLBACK_MODEL|VISION_MODEL|AUDIO_STT_MODEL|AUDIO_STT_FALLBACK_MODEL)\s*=\s*'([^']+)'/g)) {
    models.add(m[1]);
  }
  return models;
}

test('P0.5: client chat models are NVIDIA NIM ids', () => {
  const models = clientChatModels();
  assert.ok(models.size > 0, 'expected to find client model constants');
  for (const m of models) assert.match(m, /^nvidia\//, `client model ${m} should be an NVIDIA id`);
});

test('P0.5: relay proxies the provider the client uses (NVIDIA NIM)', () => {
  const relay = read('server/relay.js');
  assert.match(relay, /integrate\.api\.nvidia\.com\/v1/, 'relay must forward to the NVIDIA NIM base URL the client targets');
  assert.doesNotMatch(relay, /api\.groq\.com/, 'relay must not point at a different provider than the client');
});

test('P0.5: relay allowlist intersects the client model set (relay path is usable)', () => {
  const client = clientChatModels();
  const relayAllowed = Object.keys(MODEL_LIMITS);
  const intersection = [...client].filter((m) => relayAllowed.includes(m));
  assert.ok(
    intersection.length > 0,
    `relay allowlist [${relayAllowed.join(', ')}] shares no chat model with the client ` +
    `[${[...client].join(', ')}] — the relay rejects every real client request (model_not_allowed).`,
  );
});

test('P0.5: every client chat model is relay-allowed (no silent 400s)', () => {
  const client = clientChatModels();
  const relayAllowed = new Set(Object.keys(MODEL_LIMITS));
  const blocked = [...client].filter((m) => !relayAllowed.has(m));
  assert.deepEqual(blocked, [], `client models not allowlisted by the relay: ${blocked.join(', ')}`);
});

// ── P0.7: no shared/provider secret may be exposed via VITE_* ───────────────
// Vite inlines VITE_* into the public bundle. A shared credential behind a
// VITE_* name is a leak. Scan first-party source for any such reference.

test('P0.7: source never reads a shared/provider secret from VITE_*', () => {
  const guard = read('scripts/check-no-shared-secrets.mjs');
  assert.match(guard, /VITE_.*GROQ/i, 'guard must block Groq shared secrets');
  assert.match(guard, /process\.env/, 'guard must inspect the environment');

  // Scan EVERY first-party source file, not a hand-maintained list.
  //
  // This test used to name three files. When the real VITE_* read moved to
  // src/lib/stores/settingsStore.js, the guard kept passing while inspecting
  // none of the code that actually reads the environment — a guard that had
  // silently stopped guarding. Walking the tree means it cannot go stale again.
  const forbidden = /import\.meta\.env\.VITE_[A-Z0-9_]*(?:GROQ|NVIDIA|OPENAI|SHARED|PROVIDER|JWT_SECRET|SIGNING)[A-Z0-9_]*/i;
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) sources.push(full);
    }
  };
  walk(join(root, 'src'));
  assert.ok(sources.length > 100, `expected to scan the whole source tree, found ${sources.length} files`);

  const offenders = [];
  for (const full of sources) {
    const body = readFileSync(full, 'utf8');
    const hits = body.match(new RegExp(forbidden.source, 'gi')) || [];
    // VITE_GROQ_RELAY_URL / VITE_GROQ_DAILY_LIMIT are config, not secrets.
    const secrets = hits.filter((h) => !/RELAY_URL|DAILY_LIMIT/i.test(h));
    if (secrets.length) offenders.push(`${full.slice(root.length + 1)}: ${secrets.join(', ')}`);
  }
  assert.deepEqual(offenders, [], `shared secret read via VITE_*:\n${offenders.join('\n')}`);
});
