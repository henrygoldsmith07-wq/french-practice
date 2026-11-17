import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateTurnEvaluation, validateWritingFeedback } from '../src/lib/aiValidate.js';

// Regression guard: finite01to100 previously used Number(v), so null / '' /
// false / [] all coerced to 0 and were accepted as a real score. A missing
// overall score could then silently drive checkpoint pass/fail and CEFR
// promotion. The validator must require a genuine number.

const turn = (overall) => ({ reply: 'ok', corrections: '', scores: { overall } });

test('validateTurnEvaluation rejects overall:null (missing overall is unusable)', () => {
  const r = validateTurnEvaluation(turn(null));
  assert.equal(r.ok, false);
  assert.match(r.error, /overall/);
});

test('validateTurnEvaluation rejects non-number overall look-alikes', () => {
  // Number('') === 0, Number(false) === 0, Number([]) === 0 — none are scores.
  for (const bad of ['', false, []]) {
    const r = validateTurnEvaluation(turn(bad));
    assert.equal(r.ok, false, `expected overall=${JSON.stringify(bad)} to be rejected`);
    assert.match(r.error, /overall/);
  }
});

test('validateTurnEvaluation rejects numeric-string overall (no silent coercion)', () => {
  for (const bad of ['66', '0']) {
    const r = validateTurnEvaluation(turn(bad));
    assert.equal(r.ok, false, `expected overall="${bad}" to be rejected`);
  }
});

test('validateTurnEvaluation accepts a genuine zero overall', () => {
  const r = validateTurnEvaluation(turn(0));
  assert.equal(r.ok, true);
  assert.equal(r.scores.overall, 0);
});

test('validateTurnEvaluation falls back null/missing sub-scores to overall', () => {
  const r = validateTurnEvaluation({
    reply: 'ok',
    corrections: '',
    scores: { overall: 66, grammar: null, naturalness: undefined, fluency: [] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.scores.overall, 66);
  // A null (or otherwise non-number) sub-score must fall back to overall,
  // not silently become 0.
  assert.equal(r.scores.grammar, 66);
  assert.equal(r.scores.naturalness, 66);
  assert.equal(r.scores.fluency, 66);
  // relevance is simply absent, so it falls back too.
  assert.equal(r.scores.relevance, 66);
});

test('validateTurnEvaluation keeps valid sub-scores alongside the fallback', () => {
  const r = validateTurnEvaluation({
    reply: 'ok',
    corrections: '',
    scores: { overall: 60, grammar: 91, naturalness: null },
  });
  assert.equal(r.ok, true);
  assert.equal(r.scores.grammar, 91);
  assert.equal(r.scores.naturalness, 60);
});

const writing = (scores) => ({ corrections: 'a', strengths: [], suggestions: [], scores });

test('validateWritingFeedback rejects all-null scores', () => {
  const r = validateWritingFeedback(writing({ grammar: null, fluency: null, overall: null }));
  assert.equal(r.ok, false);
  assert.match(r.error, /scores/);
});

test('validateWritingFeedback falls back a null score to the one valid score', () => {
  const r = validateWritingFeedback(writing({ grammar: 72, overall: null }));
  assert.equal(r.ok, true);
  assert.equal(r.scores.grammar, 72);
  assert.equal(r.scores.overall, 72);
});

test('validateWritingFeedback rejects non-number-only scores but accepts a real zero', () => {
  assert.equal(validateWritingFeedback(writing({ grammar: '', overall: false })).ok, false);
  const zero = validateWritingFeedback(writing({ grammar: 0, overall: null }));
  assert.equal(zero.ok, true);
  assert.equal(zero.scores.grammar, 0);
  assert.equal(zero.scores.overall, 0);
});
