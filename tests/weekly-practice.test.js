import assert from 'node:assert/strict';
import { test } from 'node:test';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

// Local YYYY-MM-DD label n days from today.
function dayLabel(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
}

// getWeeklyPractice uses SUNDAY-start weeks (the Habit rule it mirrors), so
// fixtures must be built in that frame — and the tests pass an explicit
// `todayIso` so they are deterministic no matter which weekday CI runs on
// (a Monday-start fixture silently lands in the previous Sunday-week when
// the suite runs on a Sunday, which is exactly the flake this used to be).
const TODAY = '2026-01-07'; // a Wednesday
const dayIso = (offset) => {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
};
// This Sunday-start week: Sun Jan 4 … Sat Jan 10; today (Jan 7) is Wednesday.
// Offsets from TODAY: Sunday -3, Monday -2, Tuesday -1, Wednesday 0.

async function freshStorage() {
  globalThis.localStorage = memoryStorage();
  return import(`../src/lib/storage.js?weekly=${Date.now()}.${Math.random()}`);
}

test('weekly target defaults to 3 days and clamps to 1..7', async () => {
  const storage = await freshStorage();
  assert.equal(storage.getWeeklyDaysTarget(), 3);
  assert.equal(storage.setWeeklyDaysTarget(99), 7);
  assert.equal(storage.getWeeklyDaysTarget(), 7);
  assert.equal(storage.setWeeklyDaysTarget(0), 1);
  assert.equal(storage.setWeeklyDaysTarget(4), 4);
});

test('empty practice has no weekly streak', async () => {
  const storage = await freshStorage();
  const w = storage.getWeeklyPractice();
  assert.deepEqual(w, { daysThisWeek: 0, target: 3, met: false, current: 0, best: 0 });
});

test('three days this week meets the target', async () => {
  const storage = await freshStorage();
  const log = {};
  log[dayIso(-2)] = 10; // Monday
  log[dayIso(-1)] = 5;  // Tuesday
  log[dayIso(0)] = 8;   // today
  globalThis.localStorage.setItem('fp.xpLog', JSON.stringify(log));
  const w = storage.getWeeklyPractice(3, TODAY);
  assert.equal(w.daysThisWeek, 3);
  assert.equal(w.met, true);
});

test('a missed day does not break the weekly run (grace, Habit rule)', async () => {
  const storage = await freshStorage();
  // Last week fully met (3 days); this week only one early day, then missed
  // days through today (Wednesday). The run must still count last week.
  const log = {};
  // last week: Mon/Tue/Wed
  log[dayIso(-9)] = 10;
  log[dayIso(-8)] = 10;
  log[dayIso(-7)] = 10;
  // this week: Monday only (Tue and today missed)
  log[dayIso(-2)] = 10;
  globalThis.localStorage.setItem('fp.xpLog', JSON.stringify(log));
  const w = storage.getWeeklyPractice(3, TODAY);
  assert.equal(w.best, 1);
  // Current week unmet-but-in-progress: grace keeps last week's run alive.
  assert.equal(w.current, 1);
});

test('best counts only fully-met past weeks', async () => {
  const storage = await freshStorage();
  const log = {};
  // Three weeks ago: met. Two weeks ago: missed. Last week: met.
  log[dayIso(-23)] = 10;
  log[dayIso(-22)] = 10;
  log[dayIso(-21)] = 10;
  log[dayIso(-9)] = 10;
  log[dayIso(-8)] = 10;
  log[dayIso(-7)] = 10;
  globalThis.localStorage.setItem('fp.xpLog', JSON.stringify(log));
  const w = storage.getWeeklyPractice(3, TODAY);
  assert.equal(w.best, 1);
});
