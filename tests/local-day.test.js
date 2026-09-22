import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localDayIndex, localDayKey } from '../src/lib/localDay.js';
import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';

test('local day identity follows calendar components, not UTC milliseconds', () => {
  const local = new Date(2026, 5, 2, 0, 30, 0);
  assert.equal(localDayKey(local), '2026-06-02');
  assert.equal(
    localDayIndex(local),
    Math.floor(Date.UTC(2026, 5, 2) / 86400000),
  );
});

test('local day index advances once across adjacent local dates, including DST seasons', () => {
  const before = new Date(2026, 2, 29, 12, 0, 0);
  const after = new Date(2026, 2, 30, 12, 0, 0);
  assert.equal(localDayIndex(after) - localDayIndex(before), 1);
});

test('daily curriculum stamps the same local day used by learner streaks', () => {
  const plan = buildDailyCurriculum({
    minutes: 20,
    suggestedScenarioId: 'cafe',
  });
  assert.equal(plan.date, localDayKey());
});
