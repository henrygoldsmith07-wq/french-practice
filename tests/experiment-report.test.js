import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  experimentComparison, formatMetricCell, EVENT_DEFINITIONS,
  MIN_PER_ARM, MIN_SCORED_PER_METRIC,
} from '../src/lib/experimentReport.js';

const participant = (id, arm, over = {}) => ({
  participantId: id, arm, sessions: 3,
  completion: { rate: 1, n: 3 },
  delayedShort: { rate: 0.8, n: 5 },
  delayedLong: { rate: 0.6, n: 4 },
  recurrence: { rate: 0.1, n: 4 },
  transferBySkill: { vocabulary: { mean: 70, n: 3 } },
  ...over,
});

const pooled = (adaptiveCount, balancedCount, over = {}) => {
  const summaries = [];
  const outcomes = [];
  for (let i = 0; i < adaptiveCount; i += 1) {
    summaries.push(participant(`a${i}`, 'adaptive'));
    outcomes.push({
      participantId: `a${i}`, variant: 'adaptive', timeSpent: 600,
      immediate: { correct: true }, hintsUsed: 0,
    });
  }
  for (let i = 0; i < balancedCount; i += 1) {
    summaries.push(participant(`b${i}`, 'balanced', { delayedShort: { rate: 0.5, n: 5 } }));
    outcomes.push({
      participantId: `b${i}`, variant: 'balanced', timeSpent: 500,
      immediate: { correct: false }, hintsUsed: 1,
    });
  }
  return { summaries, outcomes, participantsByArm: { adaptive: adaptiveCount, balanced: balancedCount }, ...over };
};

describe('experiment report — honest comparison', () => {
  it('reports both arms with sample sizes on every metric', () => {
    const report = experimentComparison(pooled(10, 10));
    assert.equal(report.arms.adaptive.participants, 10);
    assert.equal(report.arms.balanced.participants, 10);
    for (const [name, metric] of Object.entries(report.metrics)) {
      assert.ok(metric.adaptive, `metric ${name} missing adaptive cell`);
      assert.ok(metric.balanced, `metric ${name} missing balanced cell`);
      for (const arm of ['adaptive', 'balanced']) {
        assert.equal(typeof metric[arm].scoredParticipants, 'number', `${name}.${arm} lacks a sample size`);
      }
    }
  });

  it('carries a 95% Wilson interval on rate metrics', () => {
    const report = experimentComparison(pooled(10, 10));
    const delayed = report.metrics.delayedRecall.adaptive;
    assert.ok(delayed.interval, 'a rate metric carries an interval');
    assert.equal(delayed.interval.level, 0.95);
    assert.ok(delayed.interval.lower <= delayed.mean);
    assert.ok(delayed.interval.upper >= delayed.mean);
  });

  it('provisional below the floor, never a finding', () => {
    const small = pooled(3, 2);
    const report = experimentComparison(small);
    assert.equal(report.metrics.delayedRecall.adaptive.state, 'provisional');
    assert.equal(report.metrics.delayedRecall.balanced.state, 'provisional');
    const line = formatMetricCell('Delayed recall', report.metrics.delayedRecall.adaptive);
    assert.ok(line.includes('provisional'), line);
  });

  it('no data produces no numbers at all, never zeros', () => {
    const report = experimentComparison({ summaries: [], outcomes: [] });
    assert.equal(report.metrics.delayedRecall.adaptive.state, 'no-data');
    assert.equal(report.metrics.delayedRecall.adaptive.display, null);
    assert.equal(report.state, 'no-data');
    const line = formatMetricCell('Delayed recall', report.metrics.delayedRecall.adaptive);
    assert.ok(line.includes('no data yet'), line);
    assert.ok(!line.includes('0%'), 'an empty sample must never read as 0%');
  });

  it('ships the raw event definitions with the numbers', () => {
    const report = experimentComparison(pooled(10, 10));
    for (const key of Object.keys(report.metrics)) {
      assert.ok(EVENT_DEFINITIONS[key], `metric ${key} lacks its event definition`);
      assert.ok(EVENT_DEFINITIONS[key].length > 20);
    }
  });

  it('keeps transfer skills separate — domains never merge', () => {
    const report = experimentComparison(pooled(10, 10));
    assert.ok(report.transferBySkill.vocabulary, 'per-skill transfer detail exists');
    assert.equal(report.transferBySkill.vocabulary.adaptive.state, 'reportable');
    assert.equal(report.metrics.transferSuccess.adaptive.state, 'reportable', 'headline cell is arm-keyed like every metric');
  });

  it('names its capture gaps instead of inventing measures', () => {
    const report = experimentComparison(pooled(10, 10));
    assert.ok(Array.isArray(report.captureGaps));
    assert.ok(report.captureGaps.some((g) => g.includes('speakingTime')));
    assert.ok(report.captureGaps.some((g) => g.includes('usefulness')));
    assert.equal(report.metrics.speakingTime.adaptive.state, 'no-data',
      'uncaptured measures stay no-data, never fabricated');
  });

  it('time on task and assistance dependence come from real rows', () => {
    const report = experimentComparison(pooled(10, 10));
    assert.equal(report.metrics.timeOnTask.adaptive.mean, 10, 'adaptive rows average 600s = 10min');
    assert.equal(report.metrics.timeOnTask.balanced.mean, 8.333);
    assert.equal(report.metrics.assistanceDependence.adaptive.mean, 0);
    assert.equal(report.metrics.assistanceDependence.balanced.mean, 1);
    assert.equal(report.metrics.immediateSuccess.adaptive.display, 1);
    assert.equal(report.metrics.immediateSuccess.balanced.display, 0);
  });

  it('never claims significance — descriptive only', () => {
    const report = experimentComparison(pooled(10, 10));
    assert.ok(report.note.includes('not a significance claim'), report.note);
    assert.ok(report.floors.minPerArm === MIN_PER_ARM);
    assert.ok(report.floors.minScoredPerMetric === MIN_SCORED_PER_METRIC);
  });

  it('formatting always shows the sample size', () => {
    const report = experimentComparison(pooled(10, 10));
    const line = formatMetricCell('Delayed recall', report.metrics.delayedRecall.adaptive);
    assert.ok(/n=\d+/.test(line), line);
  });
});
