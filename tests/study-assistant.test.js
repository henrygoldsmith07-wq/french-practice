// The study assistant must describe THIS learner. Its first version was fed
// a hard-coded learner from App.jsx, so a brand-new learner was told about a
// 12-day streak, 450 XP and "4 areas improved"; its pronunciation check could
// never fire, and its weekend "best time" printed "09:NaN".
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { localDayKey } from '../src/lib/localDay.js';

installMemoryStorage();
const {
  readStudyState, generateRecommendations, generateWeeklyPlan, weeklyInsights,
  strugglingItems, peakPracticeHour, formatHour,
} = await import('../src/lib/aiStudyAssistant.js');

const DAY = 86400000;
const NOW = new Date(2026, 9, 22, 12, 0, 0).getTime(); // Thursday, local noon
const day = (offset) => localDayKey(new Date(NOW - offset * DAY));
const at = (offsetDays, hour) => {
  const d = new Date(NOW - offsetDays * DAY);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

const empty = (over = {}) => ({
  now: NOW,
  streak: { count: 0, lastDay: null },
  xpLog: {},
  timeLog: {},
  reviewEvents: [],
  studyEvents: [],
  weakPhonemes: [],
  weaknesses: { total: 0, byStatus: { active: 0, recovering: 0, resolved: 0 }, due: 0 },
  dailyGoal: 30,
  ...over,
});

const review = (itemId, correct, offsetDays, hour = 19) => ({ itemId, itemLabel: itemId, correct, reviewedAt: at(offsetDays, hour) });

describe('study assistant', () => {
  it('a new learner gets no invented advice and no invented numbers', () => {
    const state = empty();
    assert.deepEqual(generateRecommendations(state), []);
    const insights = weeklyInsights(state);
    assert.equal(insights.xp.value, 0);
    assert.equal(insights.xp.trend, null, 'no earlier week, so no trend arrow');
    assert.equal(insights.streak, 0);
    assert.equal(insights.weaknesses.resolved, 0);
  });

  it('warns about a streak only when today has not been practised', () => {
    const unpractised = generateRecommendations(empty({ streak: { count: 6, lastDay: day(1) } }));
    assert.equal(unpractised[0].id, 'streak');
    assert.equal(unpractised[0].priority, 'urgent');
    assert.match(unpractised[0].title, /6-day streak/);
    assert.equal(unpractised[0].action.run, 'today');

    const practised = generateRecommendations(empty({ streak: { count: 6, lastDay: day(0) } }));
    assert.ok(!practised.some((r) => r.id === 'streak'));
  });

  it('names the weak sounds and routes to pronunciation practice', () => {
    const recs = generateRecommendations(empty({ weakPhonemes: [{ id: 'r', label: 'r (uvular ʁ)', stats: { attempts: 4, weak: true } }] }));
    const rec = recs.find((r) => r.id === 'pronunciation');
    assert.ok(rec, 'the pronunciation suggestion fires');
    assert.match(rec.description, /uvular/);
    assert.equal(rec.action.run, 'pronunciation');
  });

  it('flags words the learner keeps missing, from their own reviews', () => {
    const events = [
      review('maison', false, 3), review('maison', false, 2), review('maison', true, 1),
      review('chat', true, 3), review('chat', true, 2), review('chat', true, 1),
      review('chien', false, 1), review('chien', false, 1), // only two reviews: not enough
      review('vieux', false, 40), review('vieux', false, 40), review('vieux', false, 40), // too old
    ];
    const items = strugglingItems(events, NOW);
    assert.deepEqual(items.map((x) => x.id), ['maison']);
    const rec = generateRecommendations(empty({ reviewEvents: events })).find((r) => r.id === 'cards');
    assert.match(rec.description, /maison/);
    assert.equal(rec.action.run, 'cards');
  });

  it('names a practice hour only once there is a habit to name', () => {
    const few = [review('a', true, 1, 19), review('b', true, 2, 19)];
    assert.equal(peakPracticeHour(empty({ reviewEvents: few })), null);

    const habit = [];
    for (let d = 1; d <= 5; d++) habit.push(review(`w${d}`, true, d, 19), review(`x${d}`, true, d, 19));
    habit.push(review('m', true, 2, 8));
    const peak = peakPracticeHour(empty({ reviewEvents: habit }));
    assert.equal(peak.hour, 19);
    assert.equal(peak.label, '7 PM');
    assert.equal(peak.count, 10);
    assert.doesNotMatch(generateRecommendations(empty({ reviewEvents: habit })).map((r) => r.title).join(' '), /NaN/);
  });

  it('formats every hour without NaN', () => {
    for (let h = 0; h < 24; h++) assert.match(formatHour(h), /^\d{1,2} (AM|PM)$/);
    assert.equal(formatHour(0), '12 AM');
    assert.equal(formatHour(12), '12 PM');
  });

  it('the week runs Monday to Sunday with real XP on the days that have happened', () => {
    // NOW is a Thursday: Mon..Wed past, Thu today, Fri..Sun to come.
    const plan = generateWeeklyPlan(empty({ xpLog: { [day(3)]: 45, [day(1)]: 10, [day(0)]: 30 } }));
    assert.deepEqual(plan.map((d) => d.day), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.deepEqual(plan.map((d) => d.status), ['past', 'past', 'past', 'today', 'future', 'future', 'future']);
    assert.deepEqual(plan.slice(0, 4).map((d) => d.xp), [45, 0, 10, 30]);
    assert.deepEqual(plan.slice(0, 4).map((d) => d.met), [true, false, false, true]);
    assert.ok(plan.slice(0, 3).every((d) => d.focus === null), 'no advice for days already gone');
    assert.ok(plan.slice(3).every((d) => d.focus && d.focus.run), 'every day ahead has something to do');
  });

  it('compares the last 7 days with the 7 before', () => {
    const insights = weeklyInsights(empty({
      xpLog: { [day(0)]: 50, [day(6)]: 20, [day(7)]: 30, [day(13)]: 10 },
      timeLog: { [day(0)]: 600, [day(8)]: 1200 },
    }));
    assert.deepEqual(insights.xp, { value: 70, previous: 40, trend: 'up' });
    assert.deepEqual(insights.minutes, { value: 10, previous: 20, trend: 'down' });
  });

  it('reads the learner record from storage', () => {
    const today = localDayKey(new Date());
    localStorage.setItem('fp.streak', JSON.stringify({ count: 5, lastDay: today }));
    localStorage.setItem('fp.xpLog', JSON.stringify({ [today]: 40 }));
    localStorage.setItem('fp.settings', JSON.stringify({ dailyGoal: 50 }));
    const state = readStudyState();
    assert.equal(state.streak.count, 5);
    assert.equal(state.dailyGoal, 50);
    assert.equal(weeklyInsights(state).xp.value, 40);
    assert.ok(!generateRecommendations(state).some((r) => r.id === 'streak'), 'practised today, so no warning');
  });
});
