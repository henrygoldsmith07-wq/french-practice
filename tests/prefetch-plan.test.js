// Intelligent prefetch policy — pure decision tests (no browser needed).
// The plan must never offer a screen the active language doesn't offer, must
// respect the connection signals, and must keep the likely-next screens
// earliest.
// Run: node --test tests/prefetch-plan.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  prefetchPlan,
  screensForLanguage,
  EARLY_SCREENS,
  IDLE_SCREENS,
  FULL_ONLY_SCREENS,
} = await import('../src/lib/prefetch.js');

test('a full-support language gets early + idle + French-only screens', () => {
  const plan = prefetchPlan({ saveData: false, effectiveType: '4g', languageId: 'fr' });
  for (const name of EARLY_SCREENS) assert.ok(plan.early.includes(name), `${name} in early tier`);
  for (const name of IDLE_SCREENS) assert.ok(plan.idle.includes(name), `${name} in idle tier`);
  for (const name of FULL_ONLY_SCREENS) assert.ok(plan.idle.includes(name), `French-only ${name} prefetched for French`);
});

test('beta languages never prefetch French-only screens', () => {
  for (const lang of ['de', 'es']) {
    const plan = prefetchPlan({ saveData: false, effectiveType: '4g', languageId: lang });
    const all = [...plan.early, ...plan.idle];
    for (const name of FULL_ONLY_SCREENS) {
      assert.equal(all.includes(name), false, `${name} must not be prefetched for ${lang}`);
    }
    // The core loop is still warmed.
    for (const name of EARLY_SCREENS) assert.ok(plan.early.includes(name), `core ${name} still early for ${lang}`);
  }
});

test('saveData and 2G-class links prefetch nothing — chunks load on demand', () => {
  assert.deepEqual(prefetchPlan({ saveData: true, effectiveType: '4g', languageId: 'fr' }), { early: [], idle: [] });
  assert.deepEqual(prefetchPlan({ saveData: false, effectiveType: '2g', languageId: 'fr' }), { early: [], idle: [] });
  assert.deepEqual(prefetchPlan({ saveData: false, effectiveType: 'slow-2g', languageId: 'fr' }), { early: [], idle: [] });
});

test('3G gets only the likely-next tier', () => {
  const plan = prefetchPlan({ saveData: false, effectiveType: '3g', languageId: 'fr' });
  assert.ok(plan.early.length > 0);
  assert.deepEqual(plan.idle, [], 'no idle speculation on 3G');
});

test('screensForLanguage filters by capability rows, unknown names drop out', () => {
  assert.deepEqual(screensForLanguage(['Grammar', 'ChatArena'], 'de'), ['ChatArena']);
  assert.deepEqual(screensForLanguage(['Grammar', 'Culture'], 'fr'), ['Grammar', 'Culture']);
  assert.deepEqual(screensForLanguage(['NotAScreen'], 'fr'), []);
});
