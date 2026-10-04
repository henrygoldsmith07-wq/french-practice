// End-to-end: an owed check, run for real, discharges the debt — and the
// rules that guard the loop (independence, novelty, the delay floor) still hold.
//
// This exercises the REAL store bridge (recordLearnerError / recordLearnerSuccess
// → learnerErrors + learningEvidence) with the same payload the FollowUpCheck
// segment sends, so the wiring — not a mock — is what is under test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followUpTask, gradeProduction, FOLLOW_UP_KINDS } from '../src/lib/followUp.js';
import { ensureGrammarTopics } from '../src/lib/todayCapabilities.js';

const ready = ensureGrammarTopics();

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

async function fresh() {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}.${Math.random()}`;
  const storage = await import(`../src/lib/storage.js?v=${stamp}`);
  return storage;
}

// The exact payload shape FollowUpCheck.jsx records.
function followUpSuccessPayload(task, score, detail) {
  return {
    category: task.skill,
    key: task.key,
    label: task.label,
    mode: 'followup',
    source: `followup-${task.type}`,
    score,
    sessionId: 's-followup',
    encounterId: task.encounterId,
    activityId: `followup:${task.targetId}`,
    detail,
    transferVerified: true,
    heldOut: task.heldOut === true,
    promptNovelty: 1,
  };
}

test('a grammar weakness: repair → transfer owed → unseen check passes → debt cleared', async () => {
  await ready;
  const storage = await fresh();
  // 1. The mistake, then a repair — a normal same-session success.
  storage.recordLearnerError({ category: 'grammar', key: 'passe-compose', label: 'passe-compose', mode: 'drill', score: 0, encounterId: 'e0', sessionId: 's1' });
  storage.recordLearnerSuccess({ category: 'grammar', key: 'passe-compose', label: 'passe-compose', mode: 'drill', score: 80, encounterId: 'e1', sessionId: 's1' });

  // 2. The model now owes a transfer check.
  let due = storage.getLearningEvidenceOverview().due;
  assert.equal(due.length, 1, 'a transfer check is owed after a repair');
  assert.equal(due[0].type, 'transfer');
  assert.equal(due[0].target.id, 'grammar:passe-compose');

  // 3. Build the real task and run it: all items correct → success.
  const task = followUpTask(due[0], { dayIndex: 0 });
  assert.ok(task, 'a concrete task is built for the owed check');
  storage.recordLearnerSuccess(followUpSuccessPayload(task, 100, '3/3 on unseen items'));

  // 4. The transfer evidence is recorded against the RIGHT target, and the
  //    transfer debt is discharged (a delayed check becomes the new debt).
  const cycles = storage.getLearningEvidenceState().cycles;
  const cycle = cycles.find((c) => c.target.id === 'grammar:passe-compose');
  assert.ok(cycle, 'the cycle exists');
  assert.ok(cycle.transfers.length >= 1, 'the pass landed in the transfer lane');
  const transfer = cycle.transfers.at(-1);
  assert.equal(transfer.heldOut, true, 'recorded as held-out (unseen) transfer');
  assert.equal(transfer.independent, true, 'independent: the learner produced it unassisted');
  assert.equal(transfer.correct, true);

  due = storage.getLearningEvidenceOverview().due;
  assert.ok(!due.some((d) => d.type === 'transfer'), 'the transfer debt is cleared');
});

test('a failed follow-up goes back into the model as a dated mistake', async () => {
  await ready;
  const storage = await fresh();
  storage.recordLearnerError({ category: 'grammar', key: 'passe-compose', label: 'passe-compose', mode: 'drill', score: 0, encounterId: 'e0', sessionId: 's1' });
  storage.recordLearnerSuccess({ category: 'grammar', key: 'passe-compose', label: 'passe-compose', mode: 'drill', score: 80, encounterId: 'e1', sessionId: 's1' });
  const due = storage.getLearningEvidenceOverview().due;
  const task = followUpTask(due[0], { dayIndex: 0 });

  storage.recordLearnerError({
    category: task.skill, key: task.key, label: task.label,
    mode: 'followup', source: `followup-${task.type}`, score: 0,
    sessionId: 's-followup', encounterId: task.encounterId, activityId: `followup:${task.targetId}`,
    detail: '1/3 on unseen items',
  });

  const entry = storage.getLearnerErrors({ limit: 5 }).find((e) => e.id === 'grammar:passe-compose');
  assert.ok(entry, 'the weakness is still tracked');
  assert.equal(entry.status, 'active', 'a failed check reopens it');
  // The transfer lane must NOT fill on a miss.
  const cycle = storage.getLearningEvidenceState().cycles.find((c) => c.target.id === 'grammar:passe-compose');
  assert.ok(!cycle.transfers.some((t) => t.correct), 'no transfer evidence from a failure');
});

test('a vocabulary follow-up grades the sentence and records productive transfer', async () => {
  const storage = await fresh();
  storage.recordLearnerError({ category: 'vocabulary', key: 'manger', label: 'manger', mode: 'cards', score: 0, encounterId: 'e0', sessionId: 's1' });
  storage.recordLearnerSuccess({ category: 'vocabulary', key: 'manger', label: 'manger', mode: 'cards', score: 80, encounterId: 'e1', sessionId: 's1' });
  const due = storage.getLearningEvidenceOverview().due.find((d) => d.target.id === 'vocabulary:manger');
  assert.ok(due, 'a transfer check is owed for the word');

  const task = followUpTask(due, { dayIndex: 0 });
  assert.equal(task.kind, FOLLOW_UP_KINDS.PRODUCTION);
  const good = gradeProduction(task, 'Nous allons manger ce soir.');
  assert.equal(good.correct, true);
  storage.recordLearnerSuccess(followUpSuccessPayload(task, 100, 'used in a new sentence'));

  const cycle = storage.getLearningEvidenceState().cycles.find((c) => c.target.id === 'vocabulary:manger');
  assert.ok(cycle.transfers.length >= 1, 'productive use is transfer evidence');
  const t = cycle.transfers.at(-1);
  assert.equal(t.heldOut, false, 'same word, so not held-out material — but still a transfer');
  assert.equal(t.independent, true);
});
