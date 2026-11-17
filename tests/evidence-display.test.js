// Honesty/evidence regressions for the three display bugs:
//   1. roadmap chips always rendered 0/floor because the lookup was keyed by
//      display name while the chips were built from canonical track keys;
//   2. assistance reached 'validated' on with-only data (no comparison group);
//   3. rate intervals were pooled-item Wilson intervals that could exclude the
//      participant-weighted mean shown next to them.
//
// The chip helper lives in a .jsx file, so register the repo's JSX loader from
// inside this test (the verification command runs plain `node --test`, with no
// --import flag). Only the pure helper is imported — no React rendering.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { register } from 'node:module';
import { makeAssistanceEvent, assistanceMetrics, MIN_ASSISTANCE_N } from '../src/lib/assistanceValidation.js';
import {
  experimentComparison, formatMetricCell, participantMeanInterval,
} from '../src/lib/experimentReport.js';

register('./jsx-loader.mjs', new URL('./', import.meta.url));
const { roadmapChips, EVIDENCE_TRACK_BY_LABEL } = await import('../src/components/AnalyticsEvidence.jsx');

describe('bug 1 — roadmap evidence chips find real counts', () => {
  it('shows a seeded track\'s real n/floor instead of a constant 0/floor', () => {
    const external = [
      ['Placement accuracy', { n: 7 }],
      ['Progression transfer', { n: 4 }],
      ['Listening vs humans', { n: 2 }],
      ['Reading vs humans', { n: 3 }],
      ['Assistance fading', { n: 9 }],
    ];
    const chips = roadmapChips(external);
    assert.match(chips, /placement 7\/20/, chips);
    assert.match(chips, /progression 4\/15/, chips);
    // Both comprehension rows roll up into the single comprehension track.
    assert.match(chips, /comprehension 5\/30/, chips);
    assert.match(chips, /assistance 9\/20/, chips);
  });

  it('maps display labels to canonical track keys (comprehension is many-to-one)', () => {
    assert.equal(EVIDENCE_TRACK_BY_LABEL['Placement accuracy'], 'placement');
    assert.equal(EVIDENCE_TRACK_BY_LABEL['Listening vs humans'], 'comprehension');
    assert.equal(EVIDENCE_TRACK_BY_LABEL['Reading vs humans'], 'comprehension');
  });

  it('shows 0 for tracks with no data in this view, never a fabricated count', () => {
    const chips = roadmapChips([]);
    assert.match(chips, /placement 0\/20/, chips);
    assert.match(chips, /examiner 0\/30/, chips);
    assert.match(chips, /fsrs 0\/50/, chips);
    assert.ok(!/placement [1-9]/.test(chips), 'empty stores must not print a real-looking n');
  });
});

describe('bug 2 — assistance needs paired data before claiming validation', () => {
  const eventsFor = (support, count) => Array.from({ length: count }, (_, i) =>
    makeAssistanceEvent({ id: `${support}-${i}`, skill: 'reading', support, score: support === 'with' ? 85 : 70 }));

  it('with-only events at the total floor stay provisional (no comparison group)', () => {
    const m = assistanceMetrics(eventsFor('with', MIN_ASSISTANCE_N));
    assert.equal(m.n, MIN_ASSISTANCE_N);
    assert.equal(m.withN, MIN_ASSISTANCE_N);
    assert.equal(m.withoutN, 0);
    assert.equal(m.status, 'provisional', 'supported-only data cannot be validated');
    assert.equal(m.gap, null, 'no unaided group means no gap can be claimed');
    assert.equal(m.dependent, false);
    assert.match(m.message, /Provisional/);
    assert.match(m.message, /without=0/, 'the missing group is named explicitly');
  });

  it('with enough events on both sides the comparison becomes eligible/validated', () => {
    const m = assistanceMetrics([...eventsFor('with', 12), ...eventsFor('without', 12)]);
    assert.equal(m.status, 'validated');
    assert.equal(m.withN, 12);
    assert.equal(m.withoutN, 12);
    assert.ok(m.gap != null, 'a real with-vs-without gap is now computable');
  });

  it('one event per group is not enough to validate (small per-group floor)', () => {
    const m = assistanceMetrics([...eventsFor('with', 19), ...eventsFor('without', 1)]);
    assert.equal(m.status, 'provisional', 'a lone comparison event is not a group');
  });

  it('empty stores stay no-data', () => {
    assert.equal(assistanceMetrics([]).status, 'no-data');
  });
});

describe('bug 3 — rate intervals follow the participant-weighted mean', () => {
  const unequalN = () => {
    const summaries = [];
    for (let i = 0; i < 9; i += 1) {
      summaries.push({ participantId: `a${i}`, arm: 'adaptive', delayedShort: { rate: 1, n: 10 } });
    }
    summaries.push({ participantId: 'a9', arm: 'adaptive', delayedShort: { rate: 0, n: 1 } });
    return experimentComparison({ summaries, outcomes: [] }).metrics.delayedRecall.adaptive;
  };

  it('interval contains (is centred on) the participant-weighted mean, not the pooled rate', () => {
    const cell = unequalN();
    assert.equal(cell.mean, 0.9, '(9 × 1.0 + 1 × 0.0) / 10 participants = 0.9');
    assert.ok(cell.interval, 'a rate metric carries an interval');
    assert.ok(cell.interval.lower <= cell.mean && cell.mean <= cell.interval.upper,
      `interval ${JSON.stringify(cell.interval)} must contain the displayed mean ${cell.mean}`);
    // A pooled Wilson interval on 90/91 items has lower ≈ 0.935 and would
    // exclude 0.9 — that is the bug we are pinning against.
    assert.ok(cell.interval.lower < 0.9, `lower bound ${cell.interval.lower} still excludes the participant mean`);
    assert.equal(cell.interval.level, 0.95);
    assert.equal(cell.interval.method, 'participant-mean-t');
  });

  it('participantMeanInterval estimates variance across participants', () => {
    const interval = participantMeanInterval([1, 0]);
    assert.ok(interval, 'two participants give a variance estimate');
    assert.ok(interval.lower <= 0.5 && 0.5 <= interval.upper);
    assert.equal(participantMeanInterval([0.8]), null, 'one participant gives no interval');
  });

  it('when the interval is omitted it is explicitly noted, not silently absent', () => {
    const cell = experimentComparison({
      summaries: [{ participantId: 'a0', arm: 'adaptive', delayedShort: { rate: 0.8, n: 5 } }],
      outcomes: [],
    }).metrics.delayedRecall.adaptive;
    assert.equal(cell.interval, null);
    assert.ok(cell.intervalNote && /at least two scored participants/i.test(cell.intervalNote));
    assert.match(formatMetricCell('Delayed recall', cell), /No interval/);
  });

  it('keeps the equal-n interval centred on the mean (no regression)', () => {
    const summaries = Array.from({ length: 10 }, (_, i) => ({
      participantId: `a${i}`, arm: 'adaptive', delayedShort: { rate: 0.8, n: 5 },
    }));
    const cell = experimentComparison({ summaries, outcomes: [] }).metrics.delayedRecall.adaptive;
    assert.equal(cell.mean, 0.8);
    assert.equal(cell.interval.lower, 0.8);
    assert.equal(cell.interval.upper, 0.8);
  });
});
