import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  joinTrials, calibrateSelection, applyCalibration,
  adaptiveBalancedOutcomes, MIN_TRIALS_READY, MIN_PER_TYPE,
  WEIGHT_MIN, WEIGHT_MAX,
} from '../src/lib/selectionCalibration.js';
import { recordMistake, recordRetest } from '../src/lib/mistakeGraph.js';

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T09:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

function trial(over = {}) {
  return {
    at: iso(T0),
    engineVersion: 3,
    candidates: [],
    selectedId: 'mg-x',
    selectedConcept: 'passe-compose',
    masteryBefore: 30,
    recurrenceBefore: 2,
    variant: 'adaptive',
    activity: 'ai-drill',
    timeSpent: 300,
    completed: true,
    segments: [{ id: 'drill', minutes: 5 }],
    why: 'test',
    ...over,
  };
}

function graphWithRetest({ at, correct, immediate = false, context = 'drill' }) {
  let g = recordMistake([], {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY),
  });
  return { graph: recordRetest(g, { id: g[0].id, at, correct, immediate, context }), id: g[0].id };
}

// ── the join ───────────────────────────────────────────────────────────────

test('join: delayed result and new-context result come from post-trial retests only', () => {
  const { graph, id } = graphWithRetest({
    at: iso(T0 + DAY), correct: true, context: 'conversation',
  });
  const [joined] = joinTrials([trial({ selectedId: id, at: iso(T0) })], graph);
  assert.equal(joined.delayedResult, true);
  assert.equal(joined.delayedClass, 'DELAYED_NEW_CONTEXT');
  assert.equal(joined.newContextResult, true);
  assert.equal(joined.immediateResult, null, 'no immediate retest existed');
  assert.equal(joined.activity, 'ai-drill');
  assert.equal(joined.completed, true);
});

test('join: a pre-trial retest is not counted as outcome', () => {
  const { graph, id } = graphWithRetest({
    at: iso(T0 - 3600000), correct: true, context: 'drill',
  });
  const [joined] = joinTrials([trial({ selectedId: id, at: iso(T0) })], graph);
  assert.equal(joined.delayedResult, null);
  assert.equal(joined.newContextResult, null);
});

test('join: immediate post-practice success is recorded but never mastery evidence', () => {
  const { graph, id } = graphWithRetest({
    at: iso(T0 + 120000), correct: true, immediate: true, context: 'targeted-drill',
  });
  const [joined] = joinTrials([trial({ selectedId: id, at: iso(T0) })], graph);
  assert.equal(joined.immediateResult, true);
  assert.equal(joined.delayedResult, null, 'an immediate success is not a delayed one');
  assert.equal(joined.delayedClass, null);
});

test('join: recurrence = fresh mistake occurrence after the trial', () => {
  let g = recordMistake([], {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY),
  });
  const id = g[0].id;
  g = recordRetest(g, { id, at: iso(T0 + DAY), correct: true, context: 'drill' });
  // Learner slips again two days later.
  g = recordMistake(g, {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'c', corrected: 'b', confidence: 0.8, at: iso(T0 + 2 * DAY),
  });
  const [joined] = joinTrials([trial({ selectedId: id, at: iso(T0) })], g);
  assert.equal(joined.delayedResult, true);
  assert.equal(joined.recurred, true);
});

test('join: balanced-rotation trials without a graph node stay delivery-only', () => {
  const [joined] = joinTrials([trial({ selectedId: null, selectedConcept: 'articles' })], []);
  assert.equal(joined.delayedResult, null);
  assert.equal(joined.type, null);
  assert.equal(joined.concept, 'articles');
  assert.equal(joined.completed, true);
});

// ── conservative calibration ───────────────────────────────────────────────

test('below the trial floor nothing is ready and weights stay neutral', () => {
  const trials = Array.from({ length: MIN_TRIALS_READY - 1 }, (_, i) =>
    trial({ at: iso(T0 + i * 3600000), selectedId: null, selectedConcept: 'articles' }));
  const cal = calibrateSelection(trials, []);
  assert.equal(cal.ready, false);
  assert.deepEqual(cal.weights, {});
  assert.match(cal.message, /Only 9 of/);
});

test('per-type weights move within bounds only with enough per-type data', () => {
  // 8 tense trials all failing delayed retests, 2 others succeeding.
  const trials = [];
  let g = [];
  for (let i = 0; i < 8; i++) {
    g = recordMistake(g, {
      type: 'tense', concept: `passe-compose-${i}`, source: 'conversation',
      attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY - i),
    });
    const id = g[g.length - 1].id;
    g = recordRetest(g, { id, at: iso(T0 + DAY + i), correct: false, context: 'drill' });
    trials.push(trial({ at: iso(T0 + i), selectedId: id }));
  }
  for (let i = 0; i < 2; i++) {
    g = recordMistake(g, {
      type: 'agreement', concept: `accord-${i}`, source: 'conversation',
      attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY - i),
    });
    const id = g[g.length - 1].id;
    g = recordRetest(g, { id, at: iso(T0 + DAY + i), correct: true, context: 'drill' });
    trials.push(trial({ at: iso(T0 + i), selectedId: id }));
  }
  const cal = calibrateSelection(trials, g);
  assert.equal(cal.ready, true);
  assert.equal(cal.n, 10);
  const tense = cal.rows.find((r) => r.type === 'tense');
  const agreement = cal.rows.find((r) => r.type === 'agreement');
  // Tense 0% vs overall 20% → two bounded steps down.
  assert.equal(tense.weight, 0.9);
  assert.match(tense.reason, /below average/);
  // 2 agreement trials is below the per-type floor — no movement.
  assert.equal(agreement.weight, 1);
  assert.match(agreement.reason, /too few/);
  // Immediate success must not be the driver: tense had no immediate retests.
  assert.equal(tense.immediate.n, 0);
});

test('a type at exactly the floor gap moves one bounded step, not more', () => {
  // 6 agreement trials: 1 fails → rate 5/6 ≈ 0.83 vs overall 0.5 → +1 step
  const trials = [];
  let g = [];
  for (let i = 0; i < 5; i++) {
    g = recordMistake(g, {
      type: 'agreement', concept: `accord-${i}`, source: 'x',
      attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY),
    });
    const id = g[g.length - 1].id;
    g = recordRetest(g, { id, at: iso(T0 + DAY), correct: true, context: 'drill' });
    trials.push(trial({ at: iso(T0), selectedId: id }));
  }
  g = recordMistake(g, {
    type: 'agreement', concept: 'accord-5', source: 'x',
    attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY),
  });
  let id5 = g[g.length - 1].id;
  g = recordRetest(g, { id: id5, at: iso(T0 + DAY), correct: false, context: 'drill' });
  trials.push(trial({ at: iso(T0), selectedId: id5 }));
  for (let i = 0; i < 4; i++) {
    g = recordMistake(g, {
      type: 'grammar', concept: `negation-${i}`, source: 'x',
      attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY),
    });
    const id = g[g.length - 1].id;
    g = recordRetest(g, { id, at: iso(T0 + DAY), correct: false, context: 'drill' });
    trials.push(trial({ at: iso(T0), selectedId: id }));
  }
  const cal = calibrateSelection(trials, g);
  const agreement = cal.rows.find((r) => r.type === 'agreement');
  assert.ok(agreement.n >= MIN_PER_TYPE);
  // 5/6 vs 4/10 overall → 33pp gap, capped at two bounded steps.
  assert.equal(agreement.weight, 1.1);
  assert.match(agreement.reason, /above average/);
});

test('applyCalibration reorders overdue candidates by weight without breaking ties', () => {
  const candidates = [
    { id: 'a', type: 'tense', overdueBy: 2, recurrence: 1 },
    { id: 'b', type: 'agreement', overdueBy: 2, recurrence: 1 },
  ];
  const cal = { ready: true, weights: { tense: 0.85, agreement: 1.1 } };
  const ordered = applyCalibration(candidates, cal);
  assert.equal(ordered[0].id, 'b');
  assert.equal(ordered[1].id, 'a');
  const neutral = applyCalibration(candidates, { ready: false, weights: {} });
  assert.deepEqual(neutral.map((c) => c.id), ['a', 'b'], 'unready calibration must not reorder');
});

// ── adaptive vs balanced reporting ─────────────────────────────────────────

test('variant outcomes are null below the minimum n and gated above it', () => {
  const empty = adaptiveBalancedOutcomes([], []);
  assert.equal(empty.adaptive.delayedRate, null);
  assert.equal(empty.balanced.n, 0);
  assert.equal(empty.minN, 8);
  // 9 joined adaptive trials, all delayed-success → rate prints; balanced stays null.
  const trials = [];
  let g = [];
  for (let i = 0; i < 9; i++) {
    g = recordMistake(g, {
      type: 'tense', concept: `pc-${i}`, source: 'x',
      attempt: 'a', corrected: 'b', confidence: 0.8, at: iso(T0 - DAY),
    });
    const id = g[g.length - 1].id;
    g = recordRetest(g, { id, at: iso(T0 + DAY), correct: true, context: 'drill' });
    trials.push(trial({ at: iso(T0), selectedId: id, variant: 'adaptive' }));
  }
  const out = adaptiveBalancedOutcomes(trials, g);
  assert.equal(out.adaptive.n, 9);
  assert.equal(out.adaptive.delayedRate, 100);
  assert.equal(out.balanced.delayedRate, null);
});
