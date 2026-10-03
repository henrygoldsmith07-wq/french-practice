import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scenarioLevel, nextScenarioStep, scenarioQueue, levelDirective,
  SCENARIO_LEVELS, MAX_SCENARIO_LEVEL,
} from '../src/lib/scenarioProgression.js';

const session = (scenarioId, overall, date = '2026-09-20T10:00:00Z') => ({
  scenarioId, date, report: { average_scores: { overall } },
});
const scenario = { id: 'restaurant', title: 'At the restaurant' };

describe('scenario progression', () => {
  it('starts at level 1 with no performance history', () => {
    const state = scenarioLevel([], scenario.id);
    assert.equal(state.level, 1);
    assert.equal(state.attempts, 0);
    assert.equal(state.average, null);
    assert.equal(state.readyForNext, false);
  });

  it('visits alone never advance difficulty', () => {
    const sessions = [session('restaurant', 55), session('restaurant', 58), session('restaurant', 57), session('restaurant', 56)];
    assert.equal(scenarioLevel(sessions, scenario.id).level, 1);
  });

  it('demonstrated ability advances the level', () => {
    const sessions = [session('restaurant', 80), session('restaurant', 82), session('restaurant', 85)];
    const state = scenarioLevel(sessions, scenario.id);
    assert.equal(state.level, 3);
    assert.equal(state.readyForNext, true);
  });

  it('weak performance keeps the scenario at its level', () => {
    const sessions = [session('restaurant', 52), session('restaurant', 58)];
    const state = scenarioLevel(sessions, scenario.id);
    assert.equal(state.level, 1);
    assert.equal(state.needsConsolidation, true);
  });

  it('a returning learner drifts back one step instead of hitting a wall', () => {
    const old = '2026-01-01T10:00:00Z';
    const sessions = [session('restaurant', 82, old), session('restaurant', 85, old), session('restaurant', 88, old)];
    const state = scenarioLevel(sessions, scenario.id, { now: new Date('2026-09-20T10:00:00Z').getTime() });
    assert.ok(state.level <= 3, `stale level ${state.level} should decay`);
  });

  it('the ladder has four progressively harder levels with plain labels', () => {
    assert.equal(SCENARIO_LEVELS.length, 4);
    assert.equal(MAX_SCENARIO_LEVEL, 4);
    for (const stage of SCENARIO_LEVELS) {
      assert.ok(stage.label.length > 0);
      assert.ok(stage.focus.length > 0);
    }
  });

  it('level directives escalate without leaking internal terms', () => {
    for (let level = 1; level <= 4; level += 1) {
      const directive = levelDirective(level, scenario);
      assert.ok(directive.length > 20);
      for (const bad of ['fp.', 'engine', 'candidate', 'calibration', 'CEFR']) {
        assert.ok(!directive.includes(bad), `level ${level} leaks "${bad}"`);
      }
    }
    assert.ok(levelDirective(3, scenario).includes('complication'));
    assert.ok(levelDirective(4, scenario).toLowerCase().includes('natural'));
  });

  it('next step frames consolidation honestly', () => {
    const sessions = [session('restaurant', 50), session('restaurant', 55)];
    const step = nextScenarioStep(sessions, scenario);
    assert.equal(step.level, 1);
    assert.ok(step.detail.includes('same level'));
  });

  it('the queue surfaces ready-to-progress scenarios first', () => {
    const sessions = [
      session('restaurant', 82), session('restaurant', 85), session('restaurant', 88),
      session('cafe', 60),
    ];
    const queue = scenarioQueue(sessions, [scenario, { id: 'cafe', title: 'At the café' }, { id: 'doctor', title: 'At the doctor' }]);
    assert.equal(queue[0].scenario.id, 'restaurant');
    assert.equal(queue[queue.length - 1].scenario.id, 'doctor');
  });

  it('never throws on junk sessions', () => {
    assert.ok(scenarioLevel([null, {}, { scenarioId: 'x' }], 'x'));
    assert.ok(nextScenarioStep([null], null));
  });
});
