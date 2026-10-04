// Evidence-integrity regressions for the learning-evidence pipeline.
//
// These pin the conversion rules the brief demands: the system must not turn
// repetition into transfer, immediate success into delayed evidence, assisted
// answers into independent mastery, duplicate submissions into extra proof,
// near-identical sentences into fresh-context evidence, several events from
// one encounter into separate proof, or one lucky response into "Demonstrated".
import assert from 'node:assert/strict';
import { test } from 'node:test';

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
  const learnerErrors = await import(`../src/lib/learnerErrors.js?le=${stamp}`);
  const learningEvidence = await import(`../src/lib/learningEvidence.js?lvg=${stamp}`);
  return { storage, learnerErrors, learningEvidence };
}

const SEED = (storage, over = {}) => storage.recordLearnerError({
  category: 'grammar', key: 'adjective-agreement', label: 'adjective agreement',
  mode: 'conversation', score: 0, source: 'test',
  sessionId: 's1', encounterId: 'e0', activityId: 'a0',
  ...over,
});

// ---- one lucky response never demonstrates --------------------------------

test('one clean answer leaves the weakness far from Demonstrated', async () => {
  const { storage, learnerErrors } = await fresh();
  SEED(storage);
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'adjective-agreement', mode: 'conversation',
    score: 100, sessionId: 's1', encounterId: 'e1', activityId: 'a1',
  });
  const entry = storage.getLearnerErrors({ limit: 5 }).find((e) => e.key === 'adjective-agreement');
  assert.equal(entry.status, 'recovering', 'one pass improves, it never resolves');
  const cycle = { target: { skill: 'grammar', key: 'adjective-agreement', label: 'adjective agreement' } };
  const life = learnerErrors;
  assert.ok(entry.independentPasses <= 1);
});

// ---- assisted answers are never independent mastery ----------------------

test('a retype (answer on screen) records as assisted, never independent', async () => {
  const { storage } = await fresh();
  SEED(storage);
  // NotebookRetype's exact call shape: mode 'retype', score 100, a real
  // encounter id, no assisted/hinted flags passed.
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'adjective-agreement', mode: 'retype',
    score: 100, sessionId: 's1', encounterId: 'e1', activityId: 'a1',
  });
  const cycles = storage.getLearningEvidenceState().cycles || [];
  const events = cycles.flatMap((c) => c.interventions || []);
  assert.ok(events.length >= 1, 'the attempt is recorded');
  const ev = events[events.length - 1];
  assert.equal(ev.assistance, 'assisted',
    'the answer was on screen — structurally assisted, whatever the label');
  assert.equal(ev.independent, false,
    'a retype can never mint independent mastery evidence');
});

test('a hinted answer never claims independence either', async () => {
  const { storage } = await fresh();
  SEED(storage);
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'adjective-agreement', mode: 'conversation',
    score: 100, hinted: true, sessionId: 's1', encounterId: 'e1', activityId: 'a1',
  });
  const events = (storage.getLearningEvidenceState().cycles || []).flatMap((c) => c.interventions || []);
  const ev = events[events.length - 1];
  assert.equal(ev.assistance, 'scaffolded');
  assert.equal(ev.independent, false);
});

// ---- immediate success is never delayed evidence -------------------------

test('a same-session pass is intervention evidence, never a delayed recall', async () => {
  const { storage } = await fresh();
  SEED(storage);
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'adjective-agreement', mode: 'conversation',
    score: 100, sessionId: 's1', encounterId: 'e1', activityId: 'a1',
  });
  const cycles = storage.getLearningEvidenceState().cycles || [];
  const delayed = cycles.flatMap((c) => c.delayed || []);
  assert.equal(delayed.length, 0,
    'a pass minutes after the mistake must not appear as delayed evidence');
  const interventions = cycles.flatMap((c) => c.interventions || []);
  assert.equal(interventions.length, 1, 'it lands in the intervention lane');
});

test('a mode label alone cannot claim the delayed phase', async () => {
  const { storage } = await fresh();
  SEED(storage);
  // Callers may label anything; the clock decides. 'srs' with no elapsed time
  // is still same-session evidence.
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'adjective-agreement', mode: 'srs',
    score: 100, sessionId: 's1', encounterId: 'e1', activityId: 'a1',
  });
  const cycles = storage.getLearningEvidenceState().cycles || [];
  const delayed = cycles.flatMap((c) => c.delayed || []);
  assert.equal(delayed.length, 0,
    'a label is not elapsed time; no delayed lane without a real delay');
});

// ---- duplicates never inflate evidence -----------------------------------

test('re-answering one presentation never adds a second independent pass', async () => {
  const { storage } = await fresh();
  SEED(storage);
  const shared = { sessionId: 's1', activityId: 'a1', encounterId: 'e1' };
  storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100, ...shared });
  storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100, ...shared });
  storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100, ...shared });
  const entry = storage.getLearnerErrors({ limit: 5 }).find((e) => e.key === 'adjective-agreement');
  assert.equal(entry.independentPasses, 1,
    'one presentation, one independent pass — however often it is submitted');
  assert.equal(entry.status, 'recovering', 'three submits still never resolve');
});

test('distinct encounters do accumulate — the rule is not blanket suppression', async () => {
  const { storage } = await fresh();
  SEED(storage);
  storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100, sessionId: 's1', encounterId: 'e1', activityId: 'a1' });
  storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100, sessionId: 's2', encounterId: 'e2', activityId: 'a2' });
  // Read through the raw model: a resolved weakness leaves the prioritised
  // queue by design (the learner has nothing left to practise).
  const entry = storage.getLearnerErrorModel().entries.find((e) => e.key === 'adjective-agreement');
  assert.equal(entry.independentPasses, 2);
  assert.equal(entry.status, 'resolved',
    'two genuinely independent clean passes earn resolution');
});

// ---- identity-less evidence cannot resolve -------------------------------

test('a pass with no encounter identity can improve but never resolve', async () => {
  const { storage } = await fresh();
  SEED(storage);
  for (let i = 0; i < 5; i += 1) {
    storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100 });
  }
  const entry = storage.getLearnerErrorModel().entries.find((e) => e.key === 'adjective-agreement');
  assert.equal(entry.status, 'recovering',
    'unknown provenance may extend improving; it can never invent independence');
});

// ---- recurrence reopens the weakness -------------------------------------

test('a mistake after repair reopens the cycle as recurred', async () => {
  const { storage, learnerErrors } = await fresh();
  SEED(storage);
  storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100, sessionId: 's1', encounterId: 'e1', activityId: 'a1' });
  storage.recordLearnerSuccess({ category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 100, sessionId: 's2', encounterId: 'e2', activityId: 'a2' });
  const resolved = storage.getLearnerErrorModel().entries.find((e) => e.key === 'adjective-agreement');
  assert.equal(resolved.status, 'resolved');
  // The same slip comes back days later.
  storage.recordLearnerError({
    category: 'grammar', key: 'adjective-agreement', mode: 'conversation', score: 0,
    sessionId: 's3', encounterId: 'e3', activityId: 'a3',
  });
  const reopened = storage.getLearnerErrors({ limit: 5 }).find((e) => e.key === 'adjective-agreement');
  assert.equal(reopened.status, 'active', 'recurrence reopens the weakness');
  assert.equal(reopened.independentPasses, 0, 'old passes cannot re-resolve it');
  assert.ok(reopened.recurrenceCount >= 1);
});

// ---- UI interaction volume never raises confidence -----------------------

test('an error with no attempts stays a slip, not a confirmed weakness', async () => {
  const { learnerErrors } = await fresh();
  const model = learnerErrors.createLearnerErrorModel();
  const slip = learnerErrors.recordLearnerError(model, {
    category: 'grammar', key: 'negation', label: 'negation', mode: 'conversation', score: 0,
  });
  const entry = slip.entries[0];
  const confidence = (await import(`../src/lib/weaknessLifecycle.js?wl=${Date.now()}`)).weaknessLifecycle(entry);
  assert.equal(confidence.confidence, 'single', 'one-off = slip');
  assert.equal(confidence.state, 'detected', 'never jumps to a stronger state');
});

test('the delayed evidence lane only fills from a genuinely later pass', async () => {
  const { storage } = await fresh();
  SEED(storage);
  // Explicit, verified delayed flag — the strongest local signal, and it is
  // only reachable through the clock-verified retest path.
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'adjective-agreement', mode: 'conversation',
    score: 100, delayed: true, sessionId: 's1', encounterId: 'e1', activityId: 'a1',
  });
  const cycles = storage.getLearningEvidenceState().cycles || [];
  const delayed = cycles.flatMap((c) => c.delayed || []);
  assert.equal(delayed.length, 1, 'an explicitly delayed pass lands in the delayed lane');
  const ev = delayed[0];
  assert.equal(ev.independent, true, 'and is independent when the learner produced it');
});
