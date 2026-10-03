import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildWeeklyReview, weeklyReviewLines } from '../src/lib/weeklyReview.js';

const NOW = new Date('2026-01-07T12:00:00Z').getTime();
const WEEK_START = '2026-01-01';

describe('weekly review', () => {
  it('an empty week reports honest zeros and gentle copy', () => {
    const summary = buildWeeklyReview({ now: NOW, weekStart: WEEK_START });
    assert.equal(summary.empty, true);
    assert.equal(summary.practisedMinutes, 0);
    assert.equal(summary.skillsDemonstrated, 0);
    assert.equal(summary.weaknessesImproved, 0);
    assert.equal(summary.weaknessesRecurred, 0);
    const lines = weeklyReviewLines(summary);
    assert.ok(lines[0].includes('No practice recorded'));
    assert.ok(!JSON.stringify(summary).toLowerCase().includes('insufficient'));
  });

  it('counts practised minutes from the time log only', () => {
    const summary = buildWeeklyReview({
      now: NOW,
      weekStart: WEEK_START,
      timeLog: { '2026-01-02': 3600, '2026-01-03': 4860, '2025-12-01': 999999 },
    });
    assert.equal(summary.practisedMinutes, 141);
  });

  it('never fabricates minutes from session counts alone', () => {
    const summary = buildWeeklyReview({
      now: NOW,
      weekStart: WEEK_START,
      sessions: [{ date: '2026-01-02T10:00:00Z', turns: 10 }],
    });
    assert.equal(summary.practisedMinutes, 0, 'no time log entry, no invented practice minutes');
    assert.equal(summary.empty, false, 'but the session is recognised');
  });

  it('estimates speaking minutes conservatively', () => {
    const summary = buildWeeklyReview({
      now: NOW,
      weekStart: WEEK_START,
      sessions: [{ date: '2026-01-02T10:00:00Z', turns: 20, kind: 'speaking' }],
    });
    assert.ok(summary.speakingMinutes > 0 && summary.speakingMinutes <= 20, `speakingMinutes=${summary.speakingMinutes}`);
  });

  it('distinguishes improvement from recurrence', () => {
    const summary = buildWeeklyReview({
      now: NOW,
      weekStart: WEEK_START,
      learningEvidence: {
        cycles: [
          {
            id: 'c1',
            target: { skill: 'grammar', key: 'past', label: 'past-tense narration' },
            startedAt: '2026-01-01T08:00:00Z', updatedAt: '2026-01-05T08:00:00Z',
            baseline: [{ phase: 'baseline', at: '2026-01-01T08:00:00Z', correct: false }],
            interventions: [{ phase: 'intervention', at: '2026-01-02T08:00:00Z', correct: true, independent: true, encounterId: 'e1' }],
            transfers: [{
              phase: 'transfer', at: '2026-01-03T08:00:00Z', correct: true, independent: true,
              heldOut: true, encounterId: 'e2', difficulty: 3, markerConfidence: 0.85, sourceReliability: 'high',
            }],
            delayed: [{
              phase: 'delayed', at: '2026-01-05T08:00:00Z', correct: true, independent: true,
              encounterId: 'e3', delayHours: 30, difficulty: 3, markerConfidence: 0.85, sourceReliability: 'high',
            }],
            recurrences: [],
          },
        ],
      },
      learnerErrorModel: {
        entries: [
          { key: 'adjective-agreement', label: 'adjective agreement', status: 'active', errorCount: 3, recurrenceCount: 1, lastErrorAt: '2026-01-06T10:00:00Z' },
        ],
      },
    });
    assert.equal(summary.skillsDemonstrated, 1);
    assert.equal(summary.weaknessesRecurred, 1);
    assert.equal(summary.biggestImprovement.label, 'past-tense narration');
    assert.ok(summary.needsAttention.why.includes('came back'));
  });

  it('next-week actions are concrete and derived from real weak areas', () => {
    const summary = buildWeeklyReview({
      now: NOW,
      weekStart: WEEK_START,
      learnerErrorModel: {
        entries: [
          { key: 'conditional', label: 'conditional tense', status: 'active', errorCount: 4, recurrenceCount: 1, lastErrorAt: '2026-01-06T10:00:00Z' },
        ],
      },
      sessions: [{ date: '2026-01-02T10:00:00Z', turns: 4 }],
    });
    assert.ok(summary.nextWeek.length > 0);
    assert.ok(summary.nextWeek.some((a) => a.includes('conditional tense')), JSON.stringify(summary.nextWeek));
    assert.ok(summary.nextWeek.some((a) => a.includes('speaking')), JSON.stringify(summary.nextWeek));
  });

  it('the summary lines read like the product spec', () => {
    const summary = buildWeeklyReview({
      now: NOW,
      weekStart: WEEK_START,
      timeLog: { '2026-01-02': 8520 },
      learningEvidence: { cycles: [] },
    });
    const lines = weeklyReviewLines(summary);
    assert.ok(lines.some((l) => l.includes('Practised: 142 minutes')), lines.join('|'));
    for (const line of lines) {
      for (const bad of ['evidence', 'recurrence detected', 'transfer evidence', 'insufficient']) {
        assert.ok(!line.toLowerCase().includes(bad), `line leaks "${bad}"`);
      }
    }
  });

  it('never throws on junk input', () => {
    assert.ok(buildWeeklyReview({ sessions: [null, {}], timeLog: null, learningEvidence: { cycles: [null] }, learnerErrorModel: { entries: [null] }, reviewEvents: [null], now: NOW }));
  });
});
