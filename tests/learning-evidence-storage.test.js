import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';

function memoryStorage(seed) {
  return memoryStorageDouble(seed);
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

  // Two days later, with no transfer recorded yet: this is the next lane the
  // cycle owes, NOT a delayed pass. Lanes are positional — the first one the
  // cycle has not satisfied. Classifying this by the clock alone (it is >20 h
  // past the mistake) used to skip the transfer step entirely, and since
  // learningCycleStatus needs BOTH an independent transfer and an independent
  // delayed pass to call a cycle demonstrated, such a cycle could never finish:
  // it reported "needs confirmation" forever while owing the learner nothing.
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'articles', label: 'Articles', mode: 'weakness-retest', score: 90,
    sessionId: 's2', encounterId: 'e3', confidence: 0.9,
  }, { at: '2026-09-03T11:00:00.000Z' });
  state = storage.getLearningEvidenceState();
  assert.equal(state.cycles[0].transfers.length, 1, 'the first pass after the repair is transfer evidence');
  assert.equal(state.cycles[0].delayed.length, 0, 'and it is not filed as delayed');

  // The lane after transfer, once it exists, is the delayed retest.
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'articles', label: 'Articles', mode: 'weakness-retest', score: 90,
    sessionId: 's3', encounterId: 'e4', confidence: 0.9,
    delayed: true,
  }, { at: '2026-09-05T11:00:00.000Z' });
  state = storage.getLearningEvidenceState();
  assert.equal(state.cycles[0].delayed.length, 1);
});

test('learning evidence is learner-owned and included in portable storage keys', async () => {
  globalThis.localStorage = memoryStorage();
  const { KEYS, isLearnerKey } = await import(`../src/lib/storageCore.js?le-key=${Date.now()}`);
  assert.equal(KEYS.learningEvidence, 'fp.learningEvidence.v1');
  assert.equal(isLearnerKey(KEYS.learningEvidence), true);
});
