// The learner's own record, in the shape the AI Study Assistant reads.
//
// The panel used to be handed a fixed object from App.jsx:
//
//   { weeklyXP: 450, streakCount: 12, lowAccuracyWords: ['chat','maison','homme'],
//     activityByHour: { 7: 5, 8: 8, 9: 3, 18: 7, 19: 9, 20: 6 }, momentum: 1.15,
//     lastActivity: Date.now() - 2h, ... }
//
// so every learner on every device was shown the same "personalised" advice:
// the same streak, the same weak words, the same best hour to practise, and a
// streak-at-risk warning for a learner who had never opened the app. This
// module builds that shape from what the learner has actually done, and leaves
// a field empty when there is no evidence for it.
import {
  getMetrics, getSessions, getReviewEvents, getStreak, getWeekXp, getXpLog,
  getTimeLog, getLearnerErrorSummary, getLearnerErrors, getSettings,
} from './storage.js';
import { localDayKey } from './localDay.js';

const DAY_MS = 86400000;

// A claim about the learner's habits needs a sample behind it. Below this
// many records, "you usually practise at 7pm" is a guess, and this app does
// not make guesses about people.
export const MIN_ACTIVITY_SAMPLE = 5;

// The error categories the assistant can act on, mapped to the area the rest
// of the app calls them.
const AREA_BY_CATEGORY = {
  pronunciation: 'pronunciation',
  vocabulary: 'vocabulary',
  grammar: 'grammar',
  speaking: 'speaking',
  listening: 'listening',
  reading: 'reading',
  writing: 'writing',
};

const areaFor = (category) => AREA_BY_CATEGORY[category] || null;

// A local day key ('YYYY-MM-DD') as a local timestamp. Local noon, so the
// value is the same day whatever the learner's timezone offset.
const localNoon = (dayKey) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ''));
  if (!match) return NaN;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12).getTime();
};

const sumXpBetween = (log, from, to) => Object.entries(log).reduce((sum, [day, xp]) => {
  if (day >= from && day < to) return sum + (Number(xp) || 0);
  return sum;
}, 0);

/**
 * Build the assistant's view of the learner from the learner's own records.
 *
 * Every field is either a fact about the learner or null/undefined because
 * there is no evidence for it. Nothing here is invented.
 */
export function buildStudyState(now = Date.now()) {
  const metrics = getMetrics() || [];
  const sessions = getSessions() || [];
  const reviews = getReviewEvents() || [];
  const errors = getLearnerErrorSummary() || {};
  const entries = getLearnerErrors() || [];
  const streak = getStreak() || { count: 0, lastDay: null };
  const timeLog = getTimeLog() || {};
  const xpLog = getXpLog() || {};
  const settings = getSettings() || {};

  // --- when the learner was last here -------------------------------------
  // Two kinds of evidence, kept apart:
  //   · precise stamps — a session, a scored attempt, a review. These have a
  //     real hour, so they are what the "you practise at 7pm" claim is built
  //     from.
  //   · the time log — a day and a number of seconds. It says the learner was
  //     here, but not when, so it cannot answer a question about hours. It
  //     used to be mixed into the hour histogram, which put every study day
  //     at noon and made "12:00" the peak hour of every learner.
  const preciseStamps = [
    ...metrics.map((m) => Date.parse(m.at)),
    ...sessions.map((s) => Date.parse(s.date)),
    ...reviews.map((r) => Date.parse(r.reviewedAt)),
  ].filter((t) => Number.isFinite(t));
  const studiedDayStamps = Object.entries(timeLog)
    .filter(([, seconds]) => Number(seconds) > 0)
    .map(([day]) => localNoon(day))
    .filter((t) => Number.isFinite(t));

  const allStamps = [...preciseStamps, ...studiedDayStamps];
  const lastActivity = allStamps.length ? Math.max(...allStamps) : null;

  // --- which hours they actually practise ---------------------------------
  const activityByHour = {};
  for (const t of preciseStamps) {
    const hour = new Date(t).getHours();
    activityByHour[hour] = (activityByHour[hour] || 0) + 1;
  }

  // --- the weak words are their own tracked mistakes ----------------------
  const lowAccuracyWords = entries
    .filter((e) => e.category === 'vocabulary' && (e.errorCount || 0) > 0)
    .map((e) => e.label || e.key)
    .filter(Boolean);

  // --- the area to work on: the category with the most ACTIVE errors ------
  const byCategory = errors.byCategory || {};
  const worst = Object.entries(byCategory)
    .map(([category, row]) => [category, (row && row.active) || 0])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0];
  const weakestArea = worst ? areaFor(worst[0]) : null;

  // --- per-item review history, for the retention check -------------------
  const byItem = new Map();
  for (const r of reviews) {
    const key = r.itemId;
    if (!key) continue;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push({ correct: r.correct !== false, at: r.reviewedAt });
  }
  const vocabulary = [...byItem.entries()].map(([target, list]) => ({ target, reviews: list }));

  // --- weekly momentum: this week against last week -----------------------
  const today = new Date(now);
  const weekday = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday);
  const lastWeekStart = localDayKey(new Date(monday.getTime() - 7 * DAY_MS));
  // The app's own week figure is the authority for this week; last week has
  // to come out of the log.
  const thisWeekXP = getWeekXp();
  const lastWeekXP = sumXpBetween(xpLog, lastWeekStart, localDayKey(monday));
  const momentum = lastWeekXP > 0
    ? thisWeekXP / lastWeekXP
    : (thisWeekXP > 0 ? 1.1 : 1);

  // --- how much they actually study, on an average day --------------------
  const lastSeven = [];
  for (let i = 0; i < 7; i += 1) {
    const key = localDayKey(new Date(now - i * DAY_MS));
    lastSeven.push(Number(timeLog[key]) || 0);
  }
  const studiedDays = lastSeven.filter((s) => s > 0);
  const recentAverageMinutes = studiedDays.length
    ? Math.round((studiedDays.reduce((a, b) => a + b, 0) / studiedDays.length) / 60)
    : 0;

  // --- which weekdays they tend to study (last four weeks) ---------------
  // Monday = 0, matching the order the plan is written in.
  const weekdaySeconds = [0, 0, 0, 0, 0, 0, 0];
  const weekdayDays = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 28; i += 1) {
    const day = new Date(now - i * DAY_MS);
    const key = localDayKey(day);
    const seconds = Number(timeLog[key]) || 0;
    if (!seconds) continue;
    const index = (day.getDay() + 6) % 7;
    weekdaySeconds[index] += seconds;
    weekdayDays[index] += 1;
  }
  const minutesByWeekday = weekdaySeconds.map((seconds, i) => (
    weekdayDays[i] ? Math.round((seconds / weekdayDays[i]) / 60) : 0
  ));

  // --- the scores they have actually earned -------------------------------
  const scored = metrics.filter((m) => Number.isFinite(Number(m.score)));
  const accuracy = scored.length
    ? Math.round(scored.reduce((sum, m) => sum + Number(m.score), 0) / scored.length)
    : null;

  return {
    weeklyXP: getWeekXp(),
    streakCount: (streak.count || 0),
    // What the learner lost when a streak broke. The panel needs it to say
    // "a session today starts a new streak" instead of "keep your streak
    // alive" for a streak that is already gone.
    streakLost: streak.lostCount || 0,
    sessionsCompleted: sessions.length,
    lastActivity,
    activityByHour,
    lowAccuracyWords,
    weakestArea,
    vocabulary,
    momentum,
    recentAverageMinutes,
    minutesByWeekday,
    accuracy,
    cefrLevel: settings.level || null,
    // What the learner has repaired, so the panel can say so honestly.
    weaknessesResolved: errors.resolved || 0,
    weaknessesActive: errors.active || 0,
    // The app's own daily target, in XP. The plan is in minutes, so it is
    // converted with the learner's own recent pace.
    dailyGoalXP: settings.dailyGoal || null,
    activitySample: preciseStamps.length,
    hasEvidence: allStamps.length > 0,
  };
}
