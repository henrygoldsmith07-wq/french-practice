// Small honesty/correctness regressions for three contained bugs.
//
//  1. Reading: a comprehension score earned with the English translation open
//     must not be logged as independent. The rule lives in
//     readingAssistanceMeta() and is applied to both the skill metric and the
//     activity event.
//  2. WritingStudio: `r.scores.overall || 50` inflated a genuine, validated 0
//     to 50 (and 5 XP instead of 2). resolveOverallScore() keeps 0.
//  3. PronunciationInsightsPanel: the synthetic 'overall' pseudo-phoneme is
//     word-recognition accuracy, not phoneme evidence. phonemeAttemptTotals()
//     excludes it from the phoneme health summary.
//
// The three helpers are exported by the components so they can be asserted
// without mounting a component. Importing .jsx needs the repo's JSX loader,
// registered here so this file runs with the plain command:
//   node --test tests/skills-honesty-small.test.js
import { register } from 'node:module';
register('./jsx-loader.mjs', new URL('./', import.meta.url));

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Storage-backed modules (phonemeProfile) touch localStorage; Node has none.
// A tiny in-memory double is enough for read/write to work for real.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

// Content registries in the import chain fetch() per-language JSON via file:
// URLs (browser-only); mirror the wrapper in tests/register-jsx.mjs so those
// resolve off disk instead of being rejected by Node's fetch.
const realFetch = globalThis.fetch;
if (typeof realFetch === 'function') {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
    if (typeof url === 'string' && url.startsWith('file:')) {
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const body = await readFile(fileURLToPath(url), 'utf8');
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
}

const { readingAssistanceMeta } = await import('../src/components/Reading.jsx');
const { resolveOverallScore } = await import('../src/components/WritingStudio.jsx');
const { phonemeAttemptTotals, SYNTHETIC_PHONEME_KEYS } = await import('../src/components/PronunciationInsightsPanel.jsx');
const { recordPhonemeAttempt, getPhonemeProfile } = await import('../src/lib/phonemeProfile.js');
const { KEYS } = await import('../src/lib/storageCore.js');

// ---- Bug 2: a legal score of 0 is not inflated ----

test('resolveOverallScore keeps a genuine zero (not inflated to 50)', () => {
  const score = resolveOverallScore({ scores: { overall: 0 } });
  assert.equal(score, 0, 'a validated 0 must survive');
  assert.notEqual(score, 50, 'the old `|| 50` fallback must be gone');
  // XP follows the real score: 2, not the 5 a fabricated 50 would award.
  assert.equal(Math.max(2, Math.round(score / 10)), 2);
});

test('resolveOverallScore passes other valid numbers through unchanged', () => {
  assert.equal(resolveOverallScore({ scores: { overall: 73 } }), 73);
  assert.equal(resolveOverallScore({ scores: { overall: 100 } }), 100);
});

test('resolveOverallScore returns null for missing/invalid marks (honest fallback)', () => {
  assert.equal(resolveOverallScore(null), null);
  assert.equal(resolveOverallScore({}), null);
  assert.equal(resolveOverallScore({ scores: {} }), null);
  assert.equal(resolveOverallScore({ scores: { overall: null } }), null);
  assert.equal(resolveOverallScore({ scores: { overall: undefined } }), null);
  assert.equal(resolveOverallScore({ scores: { overall: '70' } }), null, 'numeric strings are not silently coerced');
  assert.equal(resolveOverallScore({ scores: { overall: NaN } }), null);
  assert.equal(resolveOverallScore({ scores: { overall: Infinity } }), null);
});

// ---- Bug 3: the synthetic 'overall' pseudo-phoneme is excluded ----

test('phonemeAttemptTotals ignores the synthetic overall key using real profile data', () => {
  mem.clear();
  localStorage.removeItem(KEYS.phonemeProfile);

  // Real per-phoneme attempts (the kind Phonology writes in Pronunciation.jsx).
  recordPhonemeAttempt('u-ou', { correct: false, confidence: 0.35, trackGap: false });
  recordPhonemeAttempt('u-ou', { correct: false, confidence: 0.35, trackGap: false });
  recordPhonemeAttempt('r', { correct: true, confidence: 0.8, trackGap: false });

  // The same loop Pronunciation.jsx:135 writes for each WORD hit under the
  // fake 'overall' key. This is word recognition, not phoneme health.
  for (let i = 0; i < 6; i += 1) {
    recordPhonemeAttempt('overall', { correct: false, confidence: 0.4, trackGap: false });
  }

  const profile = getPhonemeProfile();
  assert.equal(profile.overall.attempts, 6, 'the fixture really wrote the synthetic key');
  assert.equal(profile['u-ou'].attempts, 2);
  assert.equal(profile.r.attempts, 1);

  const totals = phonemeAttemptTotals(profile);
  assert.equal(totals.totalAttempts, 3, 'only the two real phonemes count (2 + 1), not 2 + 1 + 6');
  assert.equal(totals.totalMisses, 2, 'the 6 synthetic misses are not phoneme misses');

  // What the old Object.values() reduction reported — the bug this prevents.
  const naive = Object.values(profile).reduce(
    (acc, s) => ({ attempts: acc.attempts + (s.attempts || 0), misses: acc.misses + (s.misses || 0) }),
    { attempts: 0, misses: 0 },
  );
  assert.deepEqual(naive, { attempts: 9, misses: 8 });
  assert.notDeepEqual(totals, naive);
});

test('overall is the only excluded key; empty and malformed profiles are safe', () => {
  assert.ok(SYNTHETIC_PHONEME_KEYS.has('overall'));
  assert.deepEqual(phonemeAttemptTotals(null), { totalAttempts: 0, totalMisses: 0 });
  assert.deepEqual(phonemeAttemptTotals({}), { totalAttempts: 0, totalMisses: 0 });
  assert.deepEqual(
    phonemeAttemptTotals({ overall: { attempts: 99, misses: 99 }, nasal_on: { attempts: 4, misses: 1 }, junk: null }),
    { totalAttempts: 4, totalMisses: 1 },
  );
});

// ---- Bug 1: reading assistance travels with the score ----

test('reading assistance metadata marks translation-assisted quizzes scaffolded', () => {
  assert.deepEqual(readingAssistanceMeta(false), {
    independent: true, assistance: 'none', translationRevealed: false,
  });
  assert.deepEqual(readingAssistanceMeta(true), {
    independent: false, assistance: 'scaffolded', translationRevealed: true,
  });
});
