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
    const light = resolveExamWeighting({ name: 'WJEC GCSE French', speakingWeight: 0.25 });
    const heavy = resolveExamWeighting({ name: 'WJEC Made for Wales', speakingWeight: 0.30 });
    assert.equal(light.factor, 0, 'the lightest shipped weight is the neutral baseline');
    assert.ok(heavy.factor > 0, `a 30% board must pull positive, got ${heavy.factor}`);
    assert.ok(heavy.factor <= MAX_EXAM_FACTOR);
    assert.match(heavy.reason, /weights speaking at 30%/);
  });

  it('is neutral for the baseline weight — no factor, and no reason line either', () => {
    const base = resolveExamWeighting({ name: 'Any', speakingWeight: BASELINE_SPEAKING_WEIGHT });
    assert.equal(base.factor, 0);
    assert.equal(base.reason, null, 'a baseline board must not add a line to the brief');
  });

  it('yields nothing for an absent or unusable board rather than guessing', () => {
    for (const input of [null, undefined, {}, { name: 'X' }, { speakingWeight: 0 }, { speakingWeight: 'lots' }, { speakingWeight: -1 }, 'not-a-board']) {
      const out = resolveExamWeighting(input);
      assert.equal(out.factor, 0, `${JSON.stringify(input)} must contribute no factor`);
      assert.equal(out.reason, null, `${JSON.stringify(input)} must add no reason line`);
    }
  });

  it('still applies a real weight when the board carries no display name', () => {
    // The name is only used for the reason line; a board record with a valid
    // weight but no name is odd, not invalid — the pull still applies, and the
    // reason falls back to a generic subject rather than naming nothing.
    const out = resolveExamWeighting({ speakingWeight: 0.30 });
    assert.ok(out.factor > 0);
    assert.match(out.reason, /weights speaking at 30%/);
    assert.match(out.reason, /chosen/);
  });

  it('is bounded — context can never outrank real evidence', () => {
    const extreme = resolveExamWeighting({ name: 'X', speakingWeight: 1 });
    assert.equal(Math.abs(extreme.factor), MAX_EXAM_FACTOR);
    assert.ok(extreme.factor <= 0.4, 'the factor stays well under skillImbalance (1.2)');
  });

  it('every shipped board resolves to a factor inside the bound', () => {
    // Guards the real registry, not a fixture: if a future board carries a
    // weight outside the shipped span, this is where it becomes visible.
    for (const [id, board] of Object.entries(BOARDS)) {
      const out = resolveExamWeighting(board);
      assert.ok(Math.abs(out.factor) <= MAX_EXAM_FACTOR, `${id} produced ${out.factor}`);
      assert.ok(out.factor >= 0, `${id} should not penalise speaking for a normal board`);
    }
  });
});
