import test from 'node:test';
import assert from 'node:assert/strict';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (i) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  };
}

test('learner-error store feeds the separate learning-effectiveness record', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const storage = await (await import('./helpers/fullStorage.js')).importFullStorage(`le-${stamp}`);

  storage.recordLearnerError({
    category: 'grammar', key: 'articles', label: 'Articles', mode: 'writing', score: 40,
    sessionId: 's1', encounterId: 'e1', confidence: 0.9,
  }, { at: '2026-09-01T10:00:00.000Z' });
  let state = storage.getLearningEvidenceState();
  assert.equal(state.cycles.length, 1);
  assert.equal(state.cycles[0].baseline.length, 1);

  storage.recordLearnerSuccess({
    category: 'grammar', key: 'articles', label: 'Articles', mode: 'targeted-drill', score: 90,
    sessionId: 's1', encounterId: 'e2', confidence: 0.9,
  }, { at: '2026-09-01T11:00:00.000Z' });
  state = storage.getLearningEvidenceState();
  assert.equal(state.cycles[0].interventions.length, 1);
  assert.equal(state.cycles[0].delayed.length, 0);

  storage.recordLearnerSuccess({
    category: 'grammar', key: 'articles', label: 'Articles', mode: 'weakness-retest', score: 90,
    sessionId: 's2', encounterId: 'e3', confidence: 0.9,
  }, { at: '2026-09-03T11:00:00.000Z' });
  state = storage.getLearningEvidenceState();
  assert.equal(state.cycles[0].delayed.length, 1);
});

test('learning evidence is learner-owned and included in portable storage keys', async () => {
  globalThis.localStorage = memoryStorage();
  const { KEYS, isLearnerKey } = await import(`../src/lib/storageCore.js?le-key=${Date.now()}`);
  assert.equal(KEYS.learningEvidence, 'fp.learningEvidence.v1');
  assert.equal(isLearnerKey(KEYS.learningEvidence), true);
});
