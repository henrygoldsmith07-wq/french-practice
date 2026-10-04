// The speaking loop's last link: a correction becomes an ability only if the
// learner uses it somewhere new. That claim has to be EARNED — the same rule
// as the follow-up check, not a mode name.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateTransfer, assessTransferNovelty, freshContextChallenge } from '../src/lib/speakingTransfer.js';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';

function memoryStorage(seed) {
  return memoryStorageDouble(seed);
}

test('a genuinely new sentence counts as transfer; a copy of the correction does not', () => {
  const correction = {
    original: 'Je vais aller au cinéma hier',
    correction: "Je suis allé au cinéma hier",
    topic: 'passé composé',
  };
  const good = evaluateTransfer({
    correct: true,
    attemptText: "Hier, mon frère et moi, on a marché jusqu'au cinéma",
    correction,
    novelContext: true,
  });
  assert.equal(good.countsAsTransfer, true, 'a new sentence on the same structure is transfer');

  const copy = evaluateTransfer({
    correct: true,
    attemptText: correction.correction,
    correction,
    novelContext: true,
  });
  assert.equal(copy.countsAsTransfer, false, 'repeating the correction is memorisation');
  assert.equal(copy.novelty, 'repeated-correction');
});

test('a transfer pass recorded through the weakness store lands in the transfer lane', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}.${Math.random()}`;
  const storage = await import(`../src/lib/storage.js?v=${stamp}`);
  storage.recordWeaknessError('passe-compose', { scenarioId: 'cafe' });
  // The fresh-context step passed, and the novelty check vouched for it.
  storage.recordWeaknessRepair('passe-compose', {
    scenarioId: 'cafe',
    sessionId: 's1',
    encounterId: 'e-transfer',
    activityId: 'cafe:transfer',
    passed: true,
    transferVerified: true,
  });
  const cycle = storage.getLearningEvidenceState().cycles.find((c) => c.target.id === 'grammar:passe-compose');
  assert.ok(cycle, 'the cycle exists');
  assert.equal(cycle.transfers.length, 1, 'recorded as transfer, not just an intervention');
  assert.equal(cycle.transfers[0].independent, true);

  // And the debt is discharged: the model no longer asks for a transfer check.
  const due = storage.getLearningEvidenceOverview().due;
  assert.ok(!due.some((d) => d.type === 'transfer'), 'the transfer debt is cleared');
});

test('a re-typed correction stays an ordinary intervention', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}.${Math.random()}`;
  const storage = await import(`../src/lib/storage.js?v=${stamp}`);
  storage.recordWeaknessError('passe-compose', { scenarioId: 'cafe' });
  storage.recordWeaknessRepair('passe-compose', {
    scenarioId: 'cafe',
    sessionId: 's1',
    encounterId: 'e-copy',
    activityId: 'cafe:transfer',
    passed: true,
    transferVerified: false, // novelty check said "same sentence"
  });
  const cycle = storage.getLearningEvidenceState().cycles.find((c) => c.target.id === 'grammar:passe-compose');
  assert.equal(cycle.transfers.length, 0, 'no transfer evidence from a copy');
  assert.ok(cycle.interventions.length >= 1, 'it is still real practice');
  const due = storage.getLearningEvidenceOverview().due;
  assert.ok(due.some((d) => d.type === 'transfer'), 'the transfer check is still owed');
});

test('the challenge demands a different situation, and the novelty test agrees', () => {
  const challenge = freshContextChallenge(
    { original: 'Je vais au cinema', correction: 'Je suis allé au cinéma', targetSkill: 'passé composé', targetForm: 'passé composé with avoir' },
    { originalContext: 'travel' },
  );
  assert.ok(challenge, 'a challenge is built');
  assert.notEqual(challenge.contextId, 'travel', 'never the context the mistake happened in');
  assert.match(challenge.prompt, /own words|new sentence|different/i);
  assert.equal(assessTransferNovelty('Je suis allé au cinéma', { correction: 'Je suis allé au cinéma' }).transferred, false);
});
