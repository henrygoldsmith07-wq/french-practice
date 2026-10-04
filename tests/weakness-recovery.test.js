// Weakness-memory recovery: evidence identity and independence rules at the
// storage boundary (the same rules as learner-errors.test.js, exercised
// through recordWeaknessError / recordWeaknessRepair / recordWeaknessRetestResult).
//
// The loop contract this pins:
//   error → repair (same encounter) → scheduled retest (delayed) → resolved
// with:
//   · same encounter can never increment independent mastery twice;
//   · two repairs from DISTINCT encounters resolve;
//   · one genuine delayed independent recall resolves on its own;
//   · legacy retests (no identity) never combine into a resolution;
//   · a recurrence resets recovery: old passes cannot re-resolve.
// Run: node --test tests/weakness-recovery.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';

function memoryStorage(seed) {
  return memoryStorageDouble(seed);
}

async function freshStorage() {
  globalThis.localStorage = memoryStorage();
  return import(`../src/lib/storage.js?weakness-${Date.now()}-${Math.random()}`);
}

// "Delayed" is verified against the clock at the storage boundary: a retest
// only counts as a genuine delayed recall once its scheduled due time has
// passed. In the app that happens on its own (getDueWeaknesses only surfaces
// retests whose retestDueAt has arrived); in tests we have to move the clock
// forward explicitly rather than assert the outcome from a label.
function makeRetestDue(topicId) {
  const KEY = 'fp.weaknessMemory';
  const list = JSON.parse(globalThis.localStorage.getItem(KEY) || '[]');
  const entry = list.find((x) => x && x.topicId === topicId);
  assert.ok(entry, `no weakness entry for ${topicId}`);
  entry.retestDueAt = new Date(Date.now() - 60_000).toISOString();
  globalThis.localStorage.setItem(KEY, JSON.stringify(list));
  return entry;
}

test('a same-encounter repair never resolves; two distinct-encounter repairs do', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('passe-compose', { scenarioId: 'cafe' });

  // Re-answering the SAME drill (same encounter, e.g. the redo of one turn):
  // real success evidence, but not a second independent encounter.
  storage.recordWeaknessRepair('passe-compose', { scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc1', passed: true });
  storage.recordWeaknessRepair('passe-compose', { scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc1', passed: true });
  let w = storage.getWeaknessMemory()[0];
  assert.equal(w.status, 'recovering', 'one encounter, however many re-answers, is not mastery');

  // A repair from a DIFFERENT encounter completes the evidence.
  storage.recordWeaknessRepair('passe-compose', { scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc2', passed: true });
  w = storage.getWeaknessMemory()[0];
  assert.equal(w.status, 'resolved', 'two distinct encounters resolve');
});

test('one delayed independent recall resolves on its own; delayed stays stronger', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('articles', { scenarioId: 'cafe' });
  storage.recordWeaknessRepair('articles', { scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc1', passed: true });
  assert.equal(storage.getWeaknessMemory()[0].status, 'recovering');

  // The scheduled retest comes due and is answered cleanly: resolved without
  // needing a second same-session pass.
  makeRetestDue('articles');
  storage.recordWeaknessRetestResult('articles', true, { scenarioId: 'cafe', sessionId: 's2', encounterId: 's2:enc1' });
  assert.equal(storage.getWeaknessMemory()[0].status, 'resolved', 'delayed evidence resolves on its own');
});

test('a retest answered BEFORE it comes due is not delayed evidence and cannot resolve', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('articles', { scenarioId: 'cafe' });
  storage.recordWeaknessRepair('articles', { scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc1', passed: true });

  // Same call, same `delayed: true` claim — but the scheduled retest is still
  // days away, so no time has actually passed. Labelling an immediate retry
  // as a spaced recall would resolve the weakness on an answer the learner
  // has just been shown. (Same encounterId as the repair, so this isolates the
  // delayed rule from the separate two-distinct-encounters rule.)
  storage.recordWeaknessRetestResult('articles', true, {
    scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc1', delayed: true,
  });
  const w = storage.getWeaknessMemory()[0];
  assert.equal(w.retests.at(-1).delayed, false, 'the stored record says delayed=false, not the claimed true');
  assert.equal(w.status, 'recovering', 'an early retest must not resolve the weakness');

  // Once the scheduled retest has genuinely come due, the delayed rule applies
  // and the same weakness does resolve.
  makeRetestDue('articles');
  storage.recordWeaknessRetestResult('articles', true, {
    scenarioId: 'cafe', sessionId: 's3', encounterId: 's3:enc1', delayed: true,
  });
  assert.equal(storage.getWeaknessMemory()[0].status, 'resolved', 'a genuinely due retest resolves it');
});

test('legacy retests without identity never invent independence', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('negation', { scenarioId: 'cafe' });
  // Simulate legacy records (pre-identity schema): dated passes, no ids.
  const legacy = storage.getWeaknessMemory()[0];
  legacy.retests = [
    { at: new Date().toISOString(), scenarioId: 'cafe', passed: true },
    { at: new Date().toISOString(), scenarioId: 'cafe', passed: true },
  ];
  globalThis.localStorage.setItem('fp.weaknessMemory', JSON.stringify([legacy]));
  assert.equal(storage.getWeaknessMemory()[0].status, 'recovering', 'two identity-less passes cannot resolve');

  // A scheduled retest — genuinely delayed — still resolves the legacy
  // weakness once it actually comes due.
  makeRetestDue('negation');
  storage.recordWeaknessRetestResult('negation', true, { scenarioId: 'cafe' });
  assert.equal(storage.getWeaknessMemory()[0].status, 'resolved', 'delayed recall resolves a legacy weakness');
});

test('recurrence resets recovery: old passes cannot re-resolve', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('genre', { scenarioId: 'cafe' });
  storage.recordWeaknessRepair('genre', { scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc1', passed: true });
  storage.recordWeaknessRepair('genre', { scenarioId: 'cafe', sessionId: 's1', encounterId: 's1:enc2', passed: true });
  assert.equal(storage.getWeaknessMemory()[0].status, 'resolved');

  // The form comes back: everything reopens.
  storage.recordWeaknessError('genre', { scenarioId: 'maison' });
  let w = storage.getWeaknessMemory()[0];
  assert.equal(w.status, 'active');
  assert.equal(w.recurrenceCount, 1);

  // A repair in the SAME encounter as before the recurrence cannot shortcut
  // recovery again: the window restarted.
  storage.recordWeaknessRepair('genre', { scenarioId: 'maison', sessionId: 's1', encounterId: 's1:enc1', passed: true });
  storage.recordWeaknessRepair('genre', { scenarioId: 'maison', sessionId: 's1', encounterId: 's1:enc1', passed: true });
  assert.equal(storage.getWeaknessMemory()[0].status, 'recovering', 'stale passes cannot paper over a fresh slip');
});

test('scheduled retest strength is forwarded to the unified learner-error model', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('articles', { scenarioId: 'cafe' });
  // Weakness-memory and the unified learner-error model are intentionally
  // separate stores; seed the unified gap so this test isolates the retest
  // evidence hand-off rather than assuming the weakness store created it.
  storage.recordLearnerError({
    category: 'grammar',
    key: 'articles',
    label: 'Articles',
    mode: 'conversation',
    score: 0,
    source: 'test-gap',
  });
  makeRetestDue('articles');
  storage.recordWeaknessRetestResult('articles', true, {
    scenarioId: 'market',
    sessionId: 's-delayed',
    encounterId: 's-delayed:enc1',
    delayed: true,
  });
  const entry = storage.getLearnerErrorModel().entries.find((e) => e.id === 'grammar:articles');
  assert.ok(entry);
  assert.equal(entry.lastEvidence, 'delayed', 'scheduled retest remains delayed in the unified model');
  assert.equal(entry.status, 'resolved', 'one genuine delayed clean recall is strong evidence');
});

test('a failed retest is a recurrence and cancels the scheduled retest', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('du-de-la', { scenarioId: 'cafe' });
  storage.recordWeaknessRetestResult('du-de-la', false, { scenarioId: 'cafe' });
  const w = storage.getWeaknessMemory()[0];
  assert.equal(w.status, 'active');
  assert.equal(w.retestDueAt, null, 'a failed retest cancels the schedule');
  assert.equal(w.recurrenceCount, 1);
});
