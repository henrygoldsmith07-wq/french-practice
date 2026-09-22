// Evidence identity through the REAL activity producers — integration tests.
//
// The pure model rules live in learner-errors.test.js / weakness-recovery.test.js.
// This file pins the OTHER half of the contract: the actual UI producers —
// rateCard (every flashcard surface), recordLearningActivity (the onActivity
// trail), the storage gap recorders — stamp evidence with
// sessionId / encounterId / activityId so the recovery loop can tell one
// drill presentation from another. If a producer stops carrying identity the
// way the screen emits it, these tests fail BEFORE recovery silently degrades
// to "never independent".
//
// Run: node --test tests/evidence-identity.test.js
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
  return import(`../src/lib/storage.js?evid-${Date.now()}-${Math.random()}`);
}

// ---- rateCard: every flashcard surface routes through here -----------------

test('rateCard stamps a fresh encounter per presentation and dedupes a re-rate', async () => {
  const storage = await freshStorage();
  // The lapse opens the gap (a clean recall on an absent entry is a no-op by
  // design); the later clean recalls of the SAME card are success evidence.
  storage.rateCard('maison', 'again', { mode: 'receptive', itemLabel: 'la maison', source: 'flashcard' });

  // Two separate presentations of the card (two calls, two encounters):
  // each carries its own encounter id, session id and the card as activityId.
  storage.rateCard('maison', 'good', { mode: 'receptive', itemLabel: 'la maison', source: 'flashcard' });
  storage.rateCard('maison', 'good', { mode: 'receptive', itemLabel: 'la maison', source: 'flashcard' });

  const model = storage.getLearnerErrorModel();
  const entry = model.entries.find((e) => e.id === 'vocabulary:item:maison');
  assert.ok(entry, 'the gap entry exists');
  const evidence = entry.evidence.filter((item) => item.source === 'per-review-event');
  assert.ok(evidence.length >= 2, 'both clean recalls recorded evidence');
  for (const item of evidence) {
    assert.ok(item.sessionId, `evidence carries a sessionId (${JSON.stringify(item)})`);
    assert.ok(item.encounterId, `evidence carries an encounterId (${JSON.stringify(item)})`);
    assert.equal(item.activityId, 'maison', 'the card id is the activityId');
  }
  const encounters = new Set(evidence.map((item) => item.encounterId));
  assert.equal(encounters.size, evidence.length, 'each presentation is its own encounter — no synthetic duplicates');

  // The caller may pin the encounter (a true re-answer of the SAME
  // presentation): the SAME id flows through untouched, so the model can
  // dedupe it instead of minting a second independent pass.
  storage.rateCard('maison', 'good', { mode: 'receptive', source: 'flashcard', encounterId: 'fixed-encounter' });
  storage.rateCard('maison', 'good', { mode: 'receptive', source: 'flashcard', encounterId: 'fixed-encounter' });
  const again = storage.getLearnerErrorModel().entries.find((e) => e.id === 'vocabulary:item:maison')
    .evidence.filter((item) => item.source === 'per-review-event' && item.score === 100 && item.encounterId === 'fixed-encounter');
  assert.equal(again.length, 2, 'both re-answers of the same presentation persisted');
  assert.equal(new Set(again.map((i) => i.encounterId)).size, 1, 'same presentation ⇒ same encounter id');
});

test('rateCard lapse provenance: mistakes carry identity too', async () => {
  const storage = await freshStorage();
  storage.rateCard('chien', 'again', { mode: 'receptive', itemLabel: 'le chien', source: 'vocab-quiz' });
  const model = storage.getLearnerErrorModel();
  const entry = model.entries.find((e) => e.id === 'vocabulary:item:chien');
  assert.ok(entry, 'a lapse creates the gap entry');
  const mistake = entry.evidence[entry.evidence.length - 1];
  assert.ok(mistake.sessionId && mistake.encounterId, 'the mistake evidence carries provenance');
  assert.equal(mistake.activityId, 'chien');
});

// ---- recordLearningActivity: the onActivity trail --------------------------

test('recordLearningActivity preserves producer identity on the gap evidence', async () => {
  const storage = await freshStorage();
  // A WEAK dictation round (the only kind that opens a gap — strong rounds on
  // an absent entry are no-ops by design), exactly what Dictation.jsx emits:
  storage.recordLearningActivity({
    type: 'dictation', accuracy: 45, score: 45, mode: 'dictation', label: 'Dictée',
    sessionId: 'ses_ui', encounterId: 'ses_ui:enc7', activityId: 'sent-123',
  });
  const model = storage.getLearnerErrorModel();
  const entry = model.entries.find((e) => e.id === 'listening:dictation');
  assert.ok(entry, 'a weak dictation round opens/updates the listening gap');
  const item = entry.evidence[entry.evidence.length - 1];
  assert.equal(item.sessionId, 'ses_ui', 'session id preserved verbatim');
  assert.equal(item.encounterId, 'ses_ui:enc7', 'encounter id preserved verbatim');
  assert.equal(item.activityId, 'sent-123', 'activity id preserved verbatim');
});

test('recordLearningActivity mints a session id when the producer omits one', async () => {
  const storage = await freshStorage();
  const stored = storage.recordLearningActivity({ type: 'writing', score: 40, mode: 'essay' });
  assert.ok(stored.sessionId, 'study event still carries a session id');
  const model = storage.getLearnerErrorModel();
  const entry = model.entries.find((e) => e.id === 'writing:writing');
  const item = entry.evidence[entry.evidence.length - 1];
  assert.ok(item.sessionId, 'a session-less producer still yields a session id');
  assert.equal(item.encounterId, null, 'but never an INVENTED encounter id — independence stays unknown');
});

test('distinct encounters advance recovery; the same encounter never does twice', async () => {
  const storage = await freshStorage();
  storage.recordLearningActivity({ type: 'grammar', topicId: 'gender', score: 40 });
  const ids = ['s:enc-a', 's:enc-b', 's:enc-a'];
  for (const encounterId of ids) {
    storage.recordLearningActivity({ type: 'grammar', topicId: 'gender', score: 90, sessionId: 's', encounterId, activityId: 'gender' });
  }
  const model = storage.getLearnerErrorModel();
  const entry = model.entries.find((e) => e.id === 'grammar:gender');
  assert.equal(entry.status, 'resolved', 'two distinct encounters resolve even though three passes were recorded');
});

// ---- gap recorders (Dictation / Listening / Pronunciation path) ------------

test('gap recorders forward encounter identity into the ledger', async () => {
  const storage = await freshStorage();
  storage.recordListeningGap('tr1:q0', {
    label: 'Question', score: 40, source: 'listening-quiz',
    encounterId: 'enc-q0', activityId: 'tr1:q0',
  });
  const ledger = storage.getEvidenceLedgerModel();
  const row = ledger.find((e) => e.mode === 'listening' && e.key === 'tr1:q0');
  assert.ok(row, 'ledger row exists');
  assert.equal(row.lastEncounterId, 'enc-q0', 'ledger keeps the encounter for audit');
  assert.equal(row.lastActivityId, 'tr1:q0');
});

// ---- identity helpers -------------------------------------------------------

test('newEncounterId is unique per call and anchored to the session', async () => {
  const { newEncounterId, currentSessionId } = await import('../src/lib/evidenceIdentity.js');
  const a = newEncounterId();
  const b = newEncounterId();
  assert.notEqual(a, b, 'every presentation gets a fresh encounter');
  assert.ok(a.startsWith(currentSessionId()), 'encounters are scoped to the session');
});
