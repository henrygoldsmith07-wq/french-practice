// Study assistant: suggestions drawn from the learner's own record.
//
// The first version of this panel was fed a hard-coded learner from App.jsx
// (a 12-day streak, 450 XP this week, "chat, maison, homme" as weak words,
// "4 areas improved"), so every learner saw the same advice. Its action
// buttons only logged to the console. It also had two bugs of its own: the
// pronunciation check looked for `byLang` on a profile that getPhonemeProfile
// had already unwrapped, so it never fired, and the weekend "best time"
// shift split "7:00PM" on ':' and printed "09:NaN".
//
// Everything here now reads the learner's real record. `readStudyState`
// takes the snapshot; every other function is pure over that snapshot (and
// an explicit `now`) so it can be unit-tested without storage.

import {
  getStreak, getXpLog, getTimeLog, getReviewEvents, getStudyEvents,
  getWeaknessSummary, getSettings,
} from './storage.js';
import { weakestPhonemes } from './phonemeProfile.js';
import { localDayKey } from './localDay.js';

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A snapshot of everything the assistant reasons over. */
export function readStudyState(now = Date.now()) {
  return {
    now,
    streak: getStreak(),
    xpLog: getXpLog(),
    timeLog: getTimeLog(),
    reviewEvents: getReviewEvents(),
    studyEvents: getStudyEvents(),
    weakPhonemes: weakestPhonemes(3).filter((p) => p.stats.weak && p.stats.attempts >= 3),
    weaknesses: getWeaknessSummary(),
    dailyGoal: Number(getSettings().dailyGoal) || 30,
  };
}

const dayKey = (now, offset = 0) => localDayKey(new Date(now - offset * DAY_MS));

function sumDays(log, now, from, to) {
  let total = 0;
  for (let i = from; i < to; i++) total += Number(log?.[dayKey(now, i)]) || 0;
  return total;
}

/** Cards the learner keeps missing: at least 3 reviews in the last 30 days
 *  and under 70% recalled, weakest first. */
export function strugglingItems(reviewEvents = [], now = Date.now(), limit = 5) {
  const since = now - 30 * DAY_MS;
  const byItem = new Map();
  for (const e of reviewEvents) {
    const at = new Date(e.reviewedAt).getTime();
    if (!(at >= since)) continue;
    const cur = byItem.get(e.itemId) || { id: e.itemId, label: e.itemLabel || e.itemId, reviews: 0, correct: 0 };
    cur.reviews += 1;
    if (e.correct) cur.correct += 1;
    if (e.itemLabel) cur.label = e.itemLabel;
    byItem.set(e.itemId, cur);
  }
  return [...byItem.values()]
    .filter((x) => x.reviews >= 3 && x.correct / x.reviews < 0.7)
    .sort((a, b) => a.correct / a.reviews - b.correct / b.reviews || b.reviews - a.reviews)
    .slice(0, limit);
}

/** The hour the learner most often practises, from the last 30 days of
 *  review and study events. Needs 10 events over 3 separate days before it
 *  will name an hour — two evenings are not a habit. */
export function peakPracticeHour(state) {
  const since = state.now - 30 * DAY_MS;
  const hours = new Array(24).fill(0);
  const days = new Set();
  let total = 0;
  const stamps = [
    ...(state.reviewEvents || []).map((e) => e.reviewedAt),
    ...(state.studyEvents || []).filter((e) => e.type !== 'review').map((e) => e.at),
  ];
  for (const stamp of stamps) {
    const d = new Date(stamp);
    const t = d.getTime();
    if (!(t >= since && t <= state.now)) continue;
    hours[d.getHours()] += 1;
    days.add(localDayKey(d));
    total += 1;
  }
  if (total < 10 || days.size < 3) return null;
  const hour = hours.indexOf(Math.max(...hours));
  return { hour, label: formatHour(hour), count: hours[hour], total };
}

export function formatHour(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  return `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;
}

const PRIORITY = { urgent: 4, high: 3, medium: 2, low: 1 };

/** Ranked suggestions. Each carries an `action` the app can route (`run`),
 *  or none when it is information only. */
export function generateRecommendations(state) {
  const recs = [];
  const today = dayKey(state.now);
  const streak = state.streak || {};

  if (streak.count > 0 && streak.lastDay !== today) {
    recs.push({
      id: 'streak',
      priority: 'urgent',
      title: `Keep your ${streak.count}-day streak`,
      description: 'You have not practised yet today. One short session keeps it alive.',
      action: { label: 'Start today’s session', run: 'today' },
      estimatedTime: 5,
    });
  }

  const due = state.weaknesses?.due || 0;
  if (due > 0) {
    recs.push({
      id: 'retests',
      priority: 'high',
      title: `${due} weak ${due === 1 ? 'spot is' : 'spots are'} due for a retest`,
      description: 'A retest on a later day is what shows a fix has stuck.',
      action: { label: 'Retest in today’s session', run: 'today' },
      estimatedTime: Math.min(15, due * 2),
    });
  }

  const phonemes = state.weakPhonemes || [];
  if (phonemes.length) {
    recs.push({
      id: 'pronunciation',
      priority: 'high',
      title: phonemes.length === 1 ? 'One sound needs work' : `${phonemes.length} sounds need work`,
      description: `You miss these most often: ${phonemes.map((p) => p.label).join(', ')}.`,
      action: { label: 'Practise pronunciation', run: 'pronunciation' },
      estimatedTime: 10,
    });
  }

  const struggling = strugglingItems(state.reviewEvents, state.now);
  if (struggling.length) {
    recs.push({
      id: 'cards',
      priority: struggling.length >= 3 ? 'high' : 'medium',
      title: struggling.length === 1 ? 'One word keeps slipping' : `${struggling.length} words keep slipping`,
      description: `Recalled under 70% of the time this month: ${struggling.map((x) => x.label).join(', ')}.`,
      action: { label: 'Review cards', run: 'cards' },
      estimatedTime: struggling.length * 2,
    });
  }

  const peak = peakPracticeHour(state);
  if (peak) {
    recs.push({
      id: 'timing',
      priority: 'low',
      title: `You practise most around ${peak.label}`,
      description: `${peak.count} of your last ${peak.total} practice events were in that hour. Keeping to it makes the habit easier to hold.`,
      action: null,
      estimatedTime: null,
    });
  }

  return recs.sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority]);
}

/** This week, Monday to Sunday: XP earned against the daily goal on days
 *  that have happened, and a focus drawn from the suggestions for the days
 *  still to come. */
export function generateWeeklyPlan(state, recommendations = generateRecommendations(state)) {
  const now = new Date(state.now);
  const sinceMonday = (now.getDay() + 6) % 7;
  const focuses = recommendations.filter((r) => r.action && r.id !== 'streak').map((r) => r.action);
  const fallback = { label: 'Today’s session', run: 'today' };
  const plan = [];
  for (let i = 0; i < 7; i++) {
    const offset = sinceMonday - i; // >0 past, 0 today, <0 future
    const date = new Date(state.now - offset * DAY_MS);
    const key = localDayKey(date);
    const xp = Number(state.xpLog?.[key]) || 0;
    const status = offset > 0 ? 'past' : offset === 0 ? 'today' : 'future';
    plan.push({
      key,
      day: WEEKDAYS[date.getDay()],
      status,
      xp,
      goal: state.dailyGoal,
      met: xp >= state.dailyGoal,
      focus: status === 'past' ? null : (focuses.length ? focuses[(i - sinceMonday) % focuses.length] : fallback),
    });
  }
  return plan;
}

/** Last 7 days against the 7 before them. A trend is only claimed when
 *  there is an earlier week to compare with. */
export function weeklyInsights(state) {
  const xpThis = sumDays(state.xpLog, state.now, 0, 7);
  const xpPrev = sumDays(state.xpLog, state.now, 7, 14);
  const minThis = Math.round(sumDays(state.timeLog, state.now, 0, 7) / 60);
  const minPrev = Math.round(sumDays(state.timeLog, state.now, 7, 14) / 60);
  const trend = (a, b) => (b === 0 ? null : a > b ? 'up' : a < b ? 'down' : 'flat');
  const w = state.weaknesses || { total: 0, byStatus: {} };
  return {
    xp: { value: xpThis, previous: xpPrev, trend: trend(xpThis, xpPrev) },
    minutes: { value: minThis, previous: minPrev, trend: trend(minThis, minPrev) },
    streak: state.streak?.count || 0,
    weaknesses: { total: w.total || 0, resolved: w.byStatus?.resolved || 0, recovering: w.byStatus?.recovering || 0 },
  };
}
