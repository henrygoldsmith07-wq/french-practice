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

// ---- headline transfer aggregation: all skills, missing-safe, order-safe ----
// The headline transferSuccess must use EVERY available skill per participant,
// not whichever key happens to sit first. These are adversarial on purpose:
// key order, partially-missing skills, and asymmetric missingness between arms
// all changed the old implementation's answer.

describe('experiment report — headline transfer aggregation', () => {
  const withSkills = (id, arm, transferBySkill) => participant(id, arm, { transferBySkill });
  const pooledOf = (summaries) => ({ summaries, outcomes: [] });

  it('uses all available skills, not just the first key', () => {
    const report = experimentComparison(pooledOf([
      // 'listening' is deliberately LAST here; the old implementation read
      // whichever key came first and ignored the rest.
      withSkills('a0', 'adaptive', {
        listening: { mean: 30, n: 2 },
        vocabulary: { mean: 70, n: 2 },
      }),
    ]));
    // The participant's mean across both skills: (30 + 70) / 2 = 50.
    assert.equal(report.metrics.transferSuccess.adaptive.mean, 0.5,
      'headline must average every available skill, not the first key');
  });

  it('is insensitive to object key order', () => {
    const forward = experimentComparison(pooledOf([
      withSkills('a0', 'adaptive', { vocabulary: { mean: 70, n: 2 }, listening: { mean: 30, n: 2 } }),
    ]));
    const reversed = experimentComparison(pooledOf([
      withSkills('a0', 'adaptive', { listening: { mean: 30, n: 2 }, vocabulary: { mean: 70, n: 2 } }),
    ]));
    assert.equal(forward.metrics.transferSuccess.adaptive.mean, reversed.metrics.transferSuccess.adaptive.mean,
      'key insertion order must never change the headline');
  });

  it('the full skill set comes from ALL summaries, not just the first', () => {
    const report = experimentComparison(pooledOf([
      withSkills('a0', 'adaptive', { vocabulary: { mean: 70, n: 2 } }),
      // A skill that only later participants carry must still be reported.
      withSkills('a1', 'adaptive', { vocabulary: { mean: 60, n: 2 }, speaking: { mean: 40, n: 2 } }),
    ]));
    assert.ok(report.transferBySkill.vocabulary, 'vocabulary reported');
    assert.ok(report.transferBySkill.speaking,
      'a skill first seen on a later participant must appear in the report');
  });

  it('handles participants with different skill subsets without zero-filling', () => {
    const report = experimentComparison(pooledOf([
      withSkills('a0', 'adaptive', { vocabulary: { mean: 80, n: 2 } }),
      withSkills('a1', 'adaptive', { listening: { mean: 40, n: 2 } }),
      withSkills('a2', 'adaptive', { vocabulary: { mean: 60, n: 2 }, listening: { mean: 20, n: 2 } }),
    ]));
    // a0: 80, a1: 40, a2: (60+20)/2 = 40 → participant-weighted mean 53.33.
    // Treating a0's missing 'listening' as 0 would give (80+0)/2 = 40 instead.
    assert.equal(report.metrics.transferSuccess.adaptive.mean, 0.533,
      'missing skills are excluded from a participant mean, never counted as zero');
    assert.equal(report.metrics.transferSuccess.adaptive.scoredParticipants, 3);
  });

  it('no available transfer data reports no-data, never zero', () => {
    const report = experimentComparison(pooledOf([
      withSkills('a0', 'adaptive', {}),
      withSkills('a1', 'adaptive', { vocabulary: { mean: null, n: 0 } }),
    ]));
    assert.equal(report.metrics.transferSuccess.adaptive.state, 'no-data');
    assert.equal(report.metrics.transferSuccess.adaptive.display, null);
    assert.equal(report.metrics.transferSuccess.adaptive.mean, null);
  });

  it('one skill with data and several missing still reports honestly', () => {
    const report = experimentComparison(pooledOf([
      withSkills('a0', 'adaptive', {
        vocabulary: { mean: 65, n: 3 },
        listening: { mean: null, n: 0 },
        speaking: { mean: null, n: 0 },
      }),
    ]));
    assert.equal(report.metrics.transferSuccess.adaptive.mean, 0.65,
      'the one measured skill stands; nulls are excluded, not averaged as zeros');
    assert.equal(report.transferBySkill.listening.adaptive.mean, null);
    assert.equal(report.transferBySkill.speaking.adaptive.mean, null);
    assert.equal(report.transferBySkill.vocabulary.adaptive.mean, 0.65);
  });

  it('asymmetric missing-data patterns across arms stay per-participant', () => {
    const report = experimentComparison(pooledOf([
      // Adaptive measures two skills; balanced measures only one of them.
      withSkills('a0', 'adaptive', { vocabulary: { mean: 80, n: 2 }, listening: { mean: 40, n: 2 } }),
      withSkills('a1', 'adaptive', { vocabulary: { mean: 60, n: 2 }, listening: { mean: 20, n: 2 } }),
      withSkills('b0', 'balanced', { vocabulary: { mean: 50, n: 2 } }),
      withSkills('b1', 'balanced', { vocabulary: { mean: 30, n: 2 } }),
    ]));
    assert.equal(report.metrics.transferSuccess.adaptive.mean, 0.5,
      'adaptive: each participant averages their OWN available skills');
    assert.equal(report.metrics.transferSuccess.balanced.mean, 0.4,
      'balanced: only its measured skill contributes, never adaptive\u2019s extra one');
  });

  it('keeps transferBySkill separate and intact', () => {
    const report = experimentComparison(pooledOf([
      withSkills('a0', 'adaptive', { vocabulary: { mean: 70, n: 2 }, listening: { mean: 30, n: 2 } }),
      withSkills('b0', 'balanced', { vocabulary: { mean: 50, n: 2 }, listening: { mean: 20, n: 2 } }),
    ]));
    assert.equal(report.transferBySkill.vocabulary.adaptive.mean, 0.7);
    assert.equal(report.transferBySkill.vocabulary.balanced.mean, 0.5);
    assert.equal(report.transferBySkill.listening.adaptive.mean, 0.3);
    assert.equal(report.transferBySkill.listening.balanced.mean, 0.2);
  });

  it('documents its aggregation method in code', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/experimentReport.js', 'utf8');
    assert.ok(/participant-weighted/i.test(source), 'aggregation method is documented');
    assert.ok(/missing/i.test(source), 'missing-data handling is documented');
  });
});
