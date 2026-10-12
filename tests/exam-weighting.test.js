import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExamWeighting,
  BASELINE_SPEAKING_WEIGHT,
  MAX_EXAM_FACTOR,
} from '../src/lib/examWeighting.js';
import { BOARDS } from '../src/lib/exams/boards.js';

describe('exam weighting — what the learner is actually sitting for', () => {
  it('gives a heavier-speaking board a larger pull than a lighter one', () => {
    const light = resolveExamWeighting(0.25, 'WJEC GCSE French');
    const heavy = resolveExamWeighting(0.30, 'WJEC Made for Wales');
    assert.equal(light.factor, 0, 'the lightest shipped weight is the neutral baseline');
    assert.ok(heavy.factor > 0, `a 30% board must pull positive, got ${heavy.factor}`);
    assert.ok(heavy.factor <= MAX_EXAM_FACTOR);
    assert.match(heavy.reason, /weights speaking at 30%/);
  });

  it('is neutral for the baseline weight — no factor, and no reason line either', () => {
    const base = resolveExamWeighting(BASELINE_SPEAKING_WEIGHT, 'Any');
    assert.equal(base.factor, 0);
    assert.equal(base.reason, null, 'a baseline board must not add a line to the brief');
  });

  it('names the board when one is given, and says "chosen" when it is not', () => {
    const named = resolveExamWeighting(0.30, 'WJEC GCSE French (Made for Wales)');
    assert.match(named.reason, /^the WJEC GCSE French \(Made for Wales\) qualification/);
    const unnamed = resolveExamWeighting(0.30, null);
    assert.match(unnamed.reason, /^the chosen qualification/);
  });

  it('yields nothing for an absent or unusable weight rather than guessing', () => {
    for (const input of [null, undefined, 0, 'lots', -1, NaN, Infinity, {}, []]) {
      const out = resolveExamWeighting(input, 'A board');
      assert.equal(out.factor, 0, `${JSON.stringify(input)} must contribute no factor`);
      assert.equal(out.reason, null, `${JSON.stringify(input)} must add no reason line`);
    }
  });

  it('is bounded — context can never outrank real evidence', () => {
    const extreme = resolveExamWeighting(1, 'X');
    assert.equal(Math.abs(extreme.factor), MAX_EXAM_FACTOR);
    assert.ok(extreme.factor <= 0.4, 'the factor stays well under skillImbalance (1.2)');
  });

  it('every shipped board resolves to a factor inside the bound', () => {
    // Guards the real registry, not a fixture: if a future board carries a
    // weight outside the shipped span, this is where it becomes visible.
    // This is the ONLY test that imports boards.js, and it does so to check the
    // registry against the rule — production code must not (bundle budget).
    for (const [id, board] of Object.entries(BOARDS)) {
      const out = resolveExamWeighting(board.speakingWeight, board.name);
      assert.ok(Math.abs(out.factor) <= MAX_EXAM_FACTOR, `${id} produced ${out.factor}`);
      assert.ok(out.factor >= 0, `${id} should not penalise speaking for a normal board`);
      if (board.speakingWeight > 0) {
        // Only a board above the 25% baseline earns a reason line; the
        // baseline board deliberately produces none (see resolveExamWeighting).
        if (board.speakingWeight > BASELINE_SPEAKING_WEIGHT) {
          assert.match(out.reason ?? '', /weights speaking at \d+%/, `${id} should explain itself`);
        } else {
          assert.equal(out.reason, null, `${id} is the baseline and must not add a line`);
        }
      } else {
        assert.equal(out.reason, null, `${id} has no weight and must add nothing`);
      }
    }
  });
});
