// Submode capability rows — the registry is authoritative for EVERY visible
// mode, not just hubs. German/Spanish must never reach a French-authored
// submode through the hub list, a deep link, or a stale mode state.
//
// Run: node --test tests/submode-capabilities.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CAPABILITIES, hasCapability, featureOffered, FEATURE_CAPABILITY,
} from '../src/lib/capabilities.js';

const SUBMODE_ROWS = [
  'number-listening', 'conditions-listening', 'sentence-completion',
  'free-writing-prompts', 'essay-prompts', 'accent-trainer',
];

test('every French-authored listening/writing submode has an fr-only row', () => {
  for (const row of SUBMODE_ROWS) {
    assert.deepEqual(hasCapability(row, 'fr'), true, `${row} is a French capability`);
    assert.deepEqual(hasCapability(row, 'de'), false, `${row} is hidden for German`);
    assert.deepEqual(hasCapability(row, 'es'), false, `${row} is hidden for Spanish`);
  }
});

test('genuinely multilingual submodes stay available to beta languages', () => {
  for (const cap of ['dictation', 'pronunciation', 'vocabulary', 'conversation']) {
    for (const lang of ['fr', 'de', 'es']) {
      assert.equal(hasCapability(cap, lang), true, `${cap} must stay multilingual (failed for ${lang})`);
    }
  }
});

test('submode surface ids resolve through the same FEATURE map', () => {
  for (const [surface, row] of [['numbers', 'number-listening'], ['conditions', 'conditions-listening'], ['completion', 'sentence-completion'], ['free', 'free-writing-prompts'], ['essay', 'essay-prompts'], ['accents', 'accent-trainer']]) {
    assert.equal(FEATURE_CAPABILITY[surface], row, `${surface} maps to ${row}`);
    assert.equal(featureOffered(surface, 'de'), false, `deep link to ${surface} is refused for German`);
    assert.equal(featureOffered(surface, 'fr'), true, `${surface} stays offered for French`);
  }
});

// The hub LISTS must derive from the matrix — a hand-rolled language
// conditional is exactly the drift this registry exists to prevent.
test('the Listening hub gates conditions/numbers/track modes through the matrix', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/Listening.jsx'), 'utf8');
  assert.match(src, /hasCapabilityNow\('conditions-listening'\)/);
  assert.match(src, /hasCapabilityNow\('number-listening'\)/);
  assert.match(src, /hasCapabilityNow\('listening-library'\)/, 'track library stays gated');
  // The mode ROUTES are gated too, so a stale/deep-linked mode id cannot render.
  assert.match(src, /mode === 'conditions' && hasCapabilityNow\('conditions-listening'\)/);
  assert.match(src, /mode === 'numbers' && hasCapabilityNow\('number-listening'\)/);
});

test('the Writing hub gates French-authored submodes through the matrix', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/Writing.jsx'), 'utf8');
  assert.match(src, /cap: 'accent-trainer'/);
  assert.match(src, /cap: 'sentence-completion'/);
  assert.match(src, /cap: 'free-writing-prompts'/);
  assert.match(src, /cap: 'essay-prompts'/);
  // Render-side gates: a stale mode id cannot open a gated submode.
  assert.match(src, /mode === 'completion' && hasCapabilityNow\('sentence-completion'\)/);
  assert.match(src, /mode === 'free' && hasCapabilityNow\('free-writing-prompts'\)/);
  assert.match(src, /mode === 'essay' && hasCapabilityNow\('essay-prompts'\)/);
  assert.match(src, /mode === 'accents' && hasCapabilityNow\('accent-trainer'\)/);
});

test('retained multilingual modes carry no hard-coded French copy', () => {
  const translate = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/TranslateDrill.jsx'), 'utf8');
  assert.ok(!/EN → FR|FR → EN/.test(translate), 'direction chips must be built from the active language');
  assert.ok(!/Écris-le en français/.test(translate), 'placeholder must not hard-code French');
  assert.ok(!/Ça passe/.test(translate), 'success copy must not be French-only');
  const studio = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/components/WritingStudio.jsx'), 'utf8');
  assert.ok(!/Écrivez en français/.test(studio), 'studio placeholder must follow the active language');
});
