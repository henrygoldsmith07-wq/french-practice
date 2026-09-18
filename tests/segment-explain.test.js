import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentExplain, targetHeadline, evidenceLines, successRequirement } from '../src/lib/segmentExplain.js';

test('the conjugation example from the product brief renders verbatim', () => {
  const panel = segmentExplain({
    segId: 'drill',
    concept: 'conjugating parler (present · je)',
    drillKind: 'conj-drill',
    target: { errorCount: 3 },
  });
  assert.equal(panel.headline, 'Present tense: je + parler');
  assert.equal(panel.evidence[0], '3 recent mistakes');
  assert.ok(panel.why.includes('missed this specific form'));
  assert.ok(panel.success.length > 10);
  // The four required pieces are always present for targeted segments.
  for (const key of ['name', 'headline', 'why', 'evidence', 'success']) {
    assert.ok(panel[key] !== null && panel[key] !== undefined, `${key} present`);
  }
});

test('the resolved example: evidence lines from real counters only', () => {
  assert.deepEqual(evidenceLines({ errorCount: 3, overdueBy: 96 }), ['3 recent mistakes', 'due for retrieval']);
  assert.deepEqual(evidenceLines({ recurrence: 2, lowRetention: true }), ['2 recent mistakes', 'your recall has slipped here']);
  assert.deepEqual(evidenceLines({}), [], 'no counters → no invented evidence');
  assert.deepEqual(evidenceLines(null), []);
});

test('each focused drill kind states a concrete success requirement', () => {
  assert.match(successRequirement('conj-drill'), /clean pass/);
  assert.match(successRequirement('dictation-drill'), /80%/);
  assert.match(successRequirement('accent-drill'), /8 of 10/);
  assert.match(successRequirement('ai-drill'), /Two correct/);
  assert.match(successRequirement('retype'), /retyped/);
});

test('no internal vocabulary ever reaches the learner copy', () => {
  // Throw for forbidden tokens in headline/why/evidence/success.
  assert.throws(() => segmentExplain({
    segId: 'drill',
    concept: 'conjugating parler (present)',
    drillKind: 'conj-drill',
    target: { errorCount: 2 },
    fallbackWhy: 'Registry picked the trainer-gap producer (P2 calibration ready)',
  }));
  // And the happy path composes without throwing.
  const panel = segmentExplain({ segId: 'review', drillKind: null, target: null });
  assert.ok(panel.why.includes('correction'));
});

test('degraded inputs stay honest, never fabricated', () => {
  const panel = segmentExplain({ segId: 'drill', concept: null, drillKind: null, target: null });
  assert.equal(panel.headline, 'Targeted drill', 'falls back to the segment name — no invented specifics');
  assert.deepEqual(panel.evidence, [], 'no invented evidence lines');
  assert.ok(panel.success.length > 10);
  const fallback = segmentExplain({ segId: 'retrieve', targeted: false });
  assert.equal(fallback, null, 'non-targeted segments keep their existing why line');
});

test('recovery states walk Active weakness → Improving → Resolved on real counters', async () => {
  const { recoveryStatus } = await import('../src/lib/segmentExplain.js');
  assert.deepEqual(
    recoveryStatus({ status: 'active', errorCount: 3, successCount: 0, cleanPasses: 0 }),
    { state: 'Active weakness', detail: '3 recent mistakes · due for retrieval' },
  );
  assert.deepEqual(
    recoveryStatus({ status: 'recovering', errorCount: 3, successCount: 1, cleanPasses: 1 }),
    { state: 'Improving', detail: '1 correct recall so far — one more clean pass resolves it.' },
  );
  assert.deepEqual(
    recoveryStatus({ status: 'resolved', errorCount: 3, successCount: 3, cleanPasses: 2 }),
    { state: 'Resolved', detail: '3 independent correct recalls.' },
  );
  // One success is "Improving", never "Resolved" — mastery is never granted
  // on a single correct response.
  assert.equal(recoveryStatus({ status: 'recovering', errorCount: 1, successCount: 1, cleanPasses: 1 }).state, 'Improving');
  // No model → no fabricated status.
  assert.equal(recoveryStatus(null), null);
});
