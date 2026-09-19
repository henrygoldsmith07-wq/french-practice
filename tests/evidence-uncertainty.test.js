// Real-evidence honesty: agreement percentages must carry their uncertainty,
// and sample-size planning must be available without fabricating data.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sampleSizeForMargin, wilsonInterval, formatWithUncertainty,
} from '../src/lib/evidenceUncertainty.js';
import { statusReport, METHOD_NOTE, EVIDENCE_FLOORS } from '../src/lib/validationStatusReport.js';

test('wilsonInterval stays honest at small n and boundaries', () => {
  assert.equal(wilsonInterval(0, 0), null, 'no data → no interval');
  assert.equal(wilsonInterval(1, 0), null, 'impossible n');
  assert.equal(wilsonInterval(4, 3), null, 'k > n is invalid');
  // 3/3 must NOT read as 100%: the interval keeps room for doubt.
  const perfect = wilsonInterval(3, 3);
  assert.equal(perfect.level, 0.95);
  assert.ok(perfect.upper <= 1 && perfect.upper > 0.6);
  assert.ok(perfect.lower > 0.3, 'lower bound stays positive on 3/3');
  // 0/3 must not read as 0%: symmetric doubt on the other side.
  const zero = wilsonInterval(0, 3);
  assert.ok(zero.lower === 0 && zero.upper < 0.7);
  // Large-sample sanity: interval narrows and brackets the point estimate.
  const big = wilsonInterval(500, 1000);
  assert.ok(big.lower < 0.5 && big.upper > 0.5);
  assert.ok(big.upper - big.lower < 0.07);
});

test('formatWithUncertainty renders no-data as an em-dash, never a number', () => {
  assert.equal(formatWithUncertainty(0, 0), '—');
  assert.equal(formatWithUncertainty(null, null), '—');
  const cell = formatWithUncertainty(7, 10);
  assert.match(cell, /^70% \[\d+%, \d+%\]$/);
  const [point, lo, hi] = cell.match(/(\d+)%/) ? [null, ...cell.match(/\[(\d+)%, (\d+)%\]/).slice(1)] : [];
  assert.ok(Number(lo) <= 70 && Number(hi) >= 70, 'interval brackets the point estimate');
});

test('sampleSizeForMargin reproduces the classic planning numbers', () => {
  assert.equal(sampleSizeForMargin(0.1, 0.5), 97, '±10pp at p=0.5 needs ~97');
  assert.equal(sampleSizeForMargin(0.05, 0.5), 385, '±5pp at p=0.5 needs ~385');
  assert.equal(sampleSizeForMargin(0.1, 0.9) < sampleSizeForMargin(0.1, 0.5), true,
    'planning away from p=0.5 needs fewer participants');
});

test('statusReport placement row reports hits over n, not a bare percentage', () => {
  const rows = statusReport({
    placementValidations: Array.from({ length: 20 }, (_, i) => ({
      knownLevel: 'B1', placedLevel: i < 14 ? 'B1' : 'B2', theta: 0, se: 0.5, at: '2026-01-01',
    })),
  });
  const placement = rows.find((r) => r.track === 'placement');
  assert.equal(placement.n, 20);
  assert.match(placement.headline, /exact 70% \[\d+%, \d+%\]/, 'headline carries the Wilson interval');
});

test('the method note commits to real marks, delayed evidence and XP separation', () => {
  assert.match(METHOD_NOTE, /real, dated human marks only/);
  assert.match(METHOD_NOTE, /Wilson/);
  assert.match(METHOD_NOTE, /Delayed held-out checks/);
  assert.match(METHOD_NOTE, /never mixed into agreement figures/);
  // Floors stay documented so recruitment has a concrete target per track.
  assert.equal(EVIDENCE_FLOORS.placement, 20);
  assert.equal(EVIDENCE_FLOORS.examiner, 30);
});
