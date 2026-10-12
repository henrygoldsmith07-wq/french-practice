// End-to-end: a saved exam board actually changes today's plan.
//
// The unit tests prove the factor exists; this proves it reaches a real plan
// through plannerState — the storage→planning boundary, and the only path the
// app itself uses. A factor that never survives that boundary is decoration.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers/memory-storage.js';

globalThis.localStorage = memoryStorage();

const settings = await import('../src/lib/stores/settingsStore.js');
const { plannerState } = await import('../src/lib/plannerState.js');
const { scoreCandidates, SCORE_FACTORS } = await import('../src/lib/sessionPlanner.js');

function speakFor(boardId, tier = null) {
  settings.setSettings({ ...settings.getSettings(), examBoard: boardId, examTier: tier });
  const state = plannerState({ entries: [], hasListeningContent: false, hasScenario: true });
  return { cand: scoreCandidates(state).find((c) => c.kind === 'speak'), state };
}

describe('exam weighting reaches a real plan', () => {
  it('carries the board record across the storage→planning boundary', () => {
    const { state } = speakFor('wjec-gcse-3800', 'higher');
    assert.equal(state.examBoard.id, 'wjec-gcse-3800', 'the resolved board reaches the planner');
    assert.equal(state.examBoard.speakingWeight, 0.25);
  });

  it('an oracy-heavy board buys more speaking than a neutral one', () => {
    const light = speakFor('wjec-gcse-3800', 'higher');      // 25% speaking
    const heavy = speakFor('wjec-gcse-3830', 'foundation');  // 30% oracy
    assert.equal(light.cand.factors[SCORE_FACTORS.examWeighting], undefined, '25% is the neutral baseline');
    assert.ok(heavy.cand.factors[SCORE_FACTORS.examWeighting] > 0, '30% pulls positive');
    assert.ok(heavy.cand.score > light.cand.score, `${heavy.cand.score} should exceed ${light.cand.score}`);
  });

  it('the plan explains itself in learner-visible evidence', () => {
    const { cand } = speakFor('wjec-gcse-3830', 'foundation');
    assert.ok(
      cand.evidence.some((e) => /weights speaking at 30%/.test(e)),
      `the reason must name the weighting: ${JSON.stringify(cand.evidence)}`,
    );
  });

  it('no board is exactly as neutral as the lightest board', () => {
    const none = speakFor(null);
    const light = speakFor('wjec-gcse-3800', 'higher');
    assert.equal(none.state.examBoard, null);
    assert.equal(none.cand.score, light.cand.score, 'an absent exam must not bias practice');
  });

  it('a stale board id the registry no longer knows biases nothing', () => {
    const stale = speakFor('a-board-that-was-removed', 'higher');
    assert.equal(stale.state.examBoard, null, 'an unknown board resolves to null, not to a wrong board');
    assert.equal(stale.cand.factors[SCORE_FACTORS.examWeighting], undefined);
  });
});
