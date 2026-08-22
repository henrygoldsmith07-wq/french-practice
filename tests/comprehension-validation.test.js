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

test('listening/reading comprehension validation ships empty and reports it', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?comp-test-${Date.now()}`);
  const lib = await import(`../src/lib/listeningReadingValidation.js?comp-test-${Date.now()}`);

  assert.deepEqual(storage.getComprehensionValidations(), []);
  const m = storage.getComprehensionValidationMetrics('listening');
  assert.equal(m.status, 'no-data');
  assert.equal(m.n, 0);
  assert.equal(lib.MIN_COMPREHENSION_N >= 30, true);
});

test('rejects invalid skill, missing item and out-of-range scores', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?comp-reject-${Date.now()}`);
  assert.equal(storage.recordComprehensionValidation({ skill: 'speaking', itemId: 'x', aiScore: 50, humanScore: 50 }), null);
  assert.equal(storage.recordComprehensionValidation({ skill: 'reading', itemId: '  ', aiScore: 50, humanScore: 50 }), null);
  // Non-numeric AI score stores as unpaired rather than smuggling a zero in.
  const made = storage.recordComprehensionValidation({ skill: 'reading', itemId: 'r1', aiScore: 'oops', humanScore: 70 });
  assert.ok(made);
  assert.equal(made.aiScore, null);
  assert.equal(made.paired, false);
});

test('pairs marks, computes agreement maths exactly, and respects per-skill filters', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?comp-pair-${Date.now()}`);
  // listening: app 80 / human 70 → |d|=10
  storage.recordComprehensionValidation({ skill: 'listening', itemId: 't1', aiScore: 80, humanScore: 70, rater: 'Mme Roy' });
  // reading: perfect agreement
  storage.recordComprehensionValidation({ skill: 'reading', itemId: 'r1', aiScore: 64, humanScore: 64 });

  const listen = storage.getComprehensionValidationMetrics('listening');
  assert.equal(listen.n, 1);
  assert.equal(listen.meanAbsoluteError, 10);
  assert.equal(listen.within10, 1);
  assert.equal(listen.within5, 0);
  assert.equal(listen.status, 'provisional');

  const read = storage.getComprehensionValidationMetrics('reading');
  assert.equal(read.n, 1);
  assert.equal(read.meanAbsoluteError, 0);

  const all = await import(`../src/lib/listeningReadingValidation.js?comp-pair-${Date.now()}`);
  const overall = all.comprehensionAgreement(storage.getComprehensionValidations());
  assert.equal(overall.n, 2);
  assert.equal(overall.meanAbsoluteError, 5);
});

test('double marking requires a different rater and feeds the reliability check', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?comp-double-${Date.now()}`);
  const entry = storage.recordComprehensionValidation({ skill: 'listening', itemId: 't2', aiScore: 60, humanScore: 58, rater: 'A' });
  // Same rater re-marking themselves measures nothing — refused.
  assert.equal(storage.updateComprehensionSecondMark(entry.id, { humanScore2: 90, rater2: ' A ' }), null);
  const marked = storage.updateComprehensionSecondMark(entry.id, { humanScore2: 62, rater2: 'B' });
  assert.equal(marked.doubleMarked, true);

  const lib = await import(`../src/lib/listeningReadingValidation.js?comp-double-${Date.now()}`);
  const health = lib.comprehensionMetrics(storage.getComprehensionValidations());
  assert.equal(health.doubleMarked, 1);
  assert.equal(health.agreement.n, 1);
});

test('reaching the sample floor flips status to validated', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?comp-floor-${Date.now()}`);
  const lib = await import(`../src/lib/listeningReadingValidation.js?comp-floor-${Date.now()}`);
  for (let i = 0; i < lib.MIN_COMPREHENSION_N; i += 1) {
    storage.recordComprehensionValidation({ skill: 'reading', itemId: `r-${i}`, aiScore: 50 + (i % 10), humanScore: 52 + (i % 10) });
  }
  const m = storage.getComprehensionValidationMetrics('reading');
  assert.equal(m.n, lib.MIN_COMPREHENSION_N);
  assert.equal(m.status, 'validated');
});
