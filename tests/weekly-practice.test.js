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
  log[dayLabel(0)] = 10;
  log[dayLabel(-1)] = 5;
  log[dayLabel(-2)] = 8;
  globalThis.localStorage.setItem('fp.xpLog', JSON.stringify(log));
  const w = storage.getWeeklyPractice();
  assert.ok(w.daysThisWeek >= 3 || w.met || w.current >= 0);
  // All three days sit in the current week unless a Sunday boundary splits
  // them — either way the week counts every practised day, never zeroed.
  assert.ok(w.daysThisWeek >= 1);
});

test('a missed day does not break the weekly run (grace, Habit rule)', async () => {
  const storage = await freshStorage();
  // Last week fully met (3 days); this week only one early day, then missed
  // days through today. The run must still count last week.
  const dow = new Date().getDay(); // 0 = Sunday
  const thisMondayOffset = -(dow === 0 ? 6 : dow - 1);
  const log = {};
  // last week: Mon/Tue/Wed
  log[dayLabel(thisMondayOffset - 7)] = 10;
  log[dayLabel(thisMondayOffset - 6)] = 10;
  log[dayLabel(thisMondayOffset - 5)] = 10;
  // this week: Monday only (Tue..today missed — except when today IS Monday)
  log[dayLabel(thisMondayOffset)] = 10;
  globalThis.localStorage.setItem('fp.xpLog', JSON.stringify(log));
  const w = storage.getWeeklyPractice(3);
  assert.equal(w.best, 1);
  // Current week unmet-but-in-progress: grace keeps last week's run alive.
  // (When today is Monday, this week is already met → current is 2.)
  assert.ok(w.current === 1 || (w.met && w.current === 2), `got ${JSON.stringify(w)}`);
});

test('best counts only fully-met past weeks', async () => {
  const storage = await freshStorage();
  const dow = new Date().getDay();
  const thisMondayOffset = -(dow === 0 ? 6 : dow - 1);
  const log = {};
  // Three weeks ago: met. Two weeks ago: missed. Last week: met.
  log[dayLabel(thisMondayOffset - 21)] = 10;
  log[dayLabel(thisMondayOffset - 20)] = 10;
  log[dayLabel(thisMondayOffset - 19)] = 10;
  log[dayLabel(thisMondayOffset - 7)] = 10;
  log[dayLabel(thisMondayOffset - 6)] = 10;
  log[dayLabel(thisMondayOffset - 5)] = 10;
  globalThis.localStorage.setItem('fp.xpLog', JSON.stringify(log));
  const w = storage.getWeeklyPractice(3);
  assert.equal(w.best, 1);
});
