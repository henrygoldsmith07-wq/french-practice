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

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

async function freshStorage() {
  globalThis.localStorage = memoryStorage();
  return import(`../src/lib/storage.js?weakness-${Date.now()}-${Math.random()}`);
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
  storage.recordWeaknessRetestResult('articles', true, { scenarioId: 'cafe', sessionId: 's2', encounterId: 's2:enc1' });
  assert.equal(storage.getWeaknessMemory()[0].status, 'resolved', 'delayed evidence resolves on its own');
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

  // A scheduled retest — genuinely delayed by construction — still resolves
  // the legacy weakness once it comes due.
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

test('a failed retest is a recurrence and cancels the scheduled retest', async () => {
  const storage = await freshStorage();
  storage.recordWeaknessError('du-de-la', { scenarioId: 'cafe' });
  storage.recordWeaknessRetestResult('du-de-la', false, { scenarioId: 'cafe' });
  const w = storage.getWeaknessMemory()[0];
  assert.equal(w.status, 'active');
  assert.equal(w.retestDueAt, null, 'a failed retest cancels the schedule');
  assert.equal(w.recurrenceCount, 1);
});
