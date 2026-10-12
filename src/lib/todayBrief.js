// Today's brief — the learner-facing answer to "what should I do right now?"
// before the session opens. Composed from the session planner, aligned with the
// live session so the dashboard never promises a shape Today won't deliver.
//
// One dominant CTA plus at most three short reason lines. No engine
// terminology, no stats wall.
//
// NOTE ON THE TWO PLANNERS: the brief is composed here by buildSessionPlan
// (the scoring planner), while the live session is composed by buildTodayPlan
// (todayPlan.js). They are deliberately distinct, but they read the SAME exam
// inputs — board identity (examBoard) and date pressure (examCountdown) — so a
// candidate close to their paper sees a speak-leaning brief AND a speak-leaning
// session, never a calm preview of an urgent session.

import { buildSessionPlan } from './sessionPlanner.js';
import { plannerState } from './plannerState.js';
import { weaknessLifecycle, WEAKNESS_LIFECYCLE } from './weaknessLifecycle.js';
import { buildCapabilityMap } from './capabilityModel.js';
import { localDayKey } from './localDay.js';
import { getLearnerErrors, getSettings, getStudyEvents } from './storage.js';
// Tier ids mirror TIER in lib/exams/boards.js. Duplicated as plain strings on
// purpose: importing boards.js here would put the ~25 KB registry on Today's
// load path (100 KB surface budget).
const TIER_FOUNDATION = 'foundation';
const TIER_HIGHER = 'higher';


const SEGMENT_SHORT = {
  warmup: 'Warm-up',
  input: 'Listen',
  speak: 'Speak',
  repair: 'Repair',
  transfer: 'Transfer',
  retrieve: 'Recall',
  review: 'Review',
};

/**
 * Compose today's session brief for the Today dashboard.
 *
 * @param {{entries?: Array<object>, minutes?: number, now?: number,
 *          level?: string|null, hasScenario?: boolean, hasListeningContent?: boolean}} options
 * @returns {{cta: string, lines: string[], demonstrate: string, shape: string[],
 *            minutes: number, focusLabel: string|null, empty: boolean}}
 */
export function todayBrief(options = {}) {
  const now = options.now || Date.now();
  const state = plannerState({
    entries: options.entries || [],
    now,
    hasScenario: options.hasScenario !== false,
    hasListeningContent: options.hasListeningContent !== false,
  });
  const minutes = Number(options.minutes)
    || Number(getSettings().sessionMinutes)
    || 15;
  const plan = buildSessionPlan({ minutes, state, now });

  const errorEntries = getLearnerErrors({ limit: 12 });
  const recurred = errorEntries.find((e) => {
    const life = weaknessLifecycle(e, { now });
    return life?.state === WEAKNESS_LIFECYCLE.RECURRED;
  }) || null;
  const topWeakness = errorEntries[0] || null;
  const skillLabel = skillShortLabel(state);

  const lines = [];
  // The exam the learner is actually preparing for, from the exam identity
  // ExamSetup persists the moment a board is picked. Named first so the whole
  // brief reads as aimed at that exam; a learner who has never picked a board
  // sees nothing (no exam, no line) — the brief must not invent a target.
  //
  // The board NAME is read from settings, not from boards.js. The registry is
  // ~25 KB of spec data and this module sits on Today's load path, which has a
  // 100 KB surface budget; ExamSetup resolves the name where the registry
  // already lives and persists it beside examBoard. An id with no stored name
  // (chosen before that field existed) falls back to nothing rather than to a
  // label this module cannot verify.
  const settings = getSettings();
  const examName = settings.examBoard && typeof settings.examBoardName === 'string'
    ? settings.examBoardName
    : null;
  const examTier = settings.examTier;
  if (examName) {
    const tierWord = examTier === TIER_FOUNDATION ? 'Foundation' : examTier === TIER_HIGHER ? 'Higher' : '';
    lines.push(`${tierWord ? `${tierWord} tier, ` : ''}${examName}`);
  }
  if (state.srsDue > 0) lines.push(`${state.srsDue} item${state.srsDue === 1 ? '' : 's'} due`);
  if (skillLabel) lines.push(`${skillLabel} needs work`);
  if (recurred) lines.push(`${recurred.label || recurred.key} recently recurred`);
  else if (!skillLabel && topWeakness && lines.length < 3) {
    lines.push(`${topWeakness.label || topWeakness.key} is worth a look`);
  }
  if (state.evidenceDue?.length) {
    const kind = state.evidenceDue[0].type === 'delayed' ? 'A delayed check is due' : 'Ready for a fresh-context check';
    if (lines.length < 3) lines.push(kind);
  }

  const demonstrate = plan.demonstration
    ? 'You will finish by using what you practised in a new situation.'
    : 'You will finish with a quick recall check.';
  return {
    cta: `Start today's session — ${plan.minutes} min`,
    lines: lines.slice(0, 3),
    demonstrate,
    shape: plan.segments.map((s) => SEGMENT_SHORT[s.id] || s.label),
    minutes: plan.minutes,
    focusLabel: plan.focus?.target && plan.focus.kind === 'repair'
      ? String(topWeakness?.label || topWeakness?.key || plan.focus.target)
      : null,
    empty: plan.segments.length === 0,
  };
}

function skillShortLabel(state) {
  const neediest = Object.entries(state.skillNeeds || {})
    .filter(([, v]) => Number(v) > 0.25)
    .sort((a, b) => b[1] - a[1])[0];
  if (!neediest) return null;
  const labels = {
    speak: 'speaking confidence',
    listen: 'listening at speed',
    retrieve: 'recalling vocabulary',
  };
  return labels[neediest[0]] || null;
}

/**
 * Today's outcome line — what the learner has actually done today. XP is
 * deliberately secondary; this is the headline.
 *
 * @param {{events?: Array<object>, now?: number}} options
 */
export function todayOutcome(options = {}) {
  const now = options.now || Date.now();
  // LOCAL day, from the one helper the app uses — not `toISOString()`, which
  // slices the UTC date. An evening session east of Greenwich is stored on the
  // next UTC day, so the UTC reading disagreed with the streak/XP surfaces
  // about which day it was. This is the same drift weeklyReview.js had.
  const today = localDayKey(now);
  const events = (options.events || getStudyEvents()).filter((e) => (
    typeof e?.at === 'string' && localDayKey(e.at) === today
  ));
  const practised = new Set();
  let improved = 0;
  let reviews = 0;
  let demonstrated = 0;
  for (const event of events) {
    if (event.type === 'segment-completed' || event.type === 'practice.completed') {
      if (event.segment || event.skill) practised.add(event.segment || event.skill);
    }
    if (event.type === 'weakness.improved') improved += 1;
    if (event.type === 'weakness.demonstrated' || event.type === 'skill.demonstrated') demonstrated += 1;
    if (event.type === 'review.completed') reviews += 1;
    if (event.type === 'session.completed' && event.segments) {
      for (const s of event.segments) if (s) practised.add(s);
    }
  }
  const parts = [];
  if (practised.size) parts.push(`${practised.size} skill${practised.size === 1 ? '' : 's'} practised`);
  if (improved) parts.push(`${improved} weakness${improved === 1 ? '' : 'es'} improved`);
  if (demonstrated) parts.push(`${demonstrated} demonstrated`);
  if (reviews) parts.push(`${reviews} review${reviews === 1 ? '' : 's'} completed`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * The Home screen's one concise evidence-based progress summary: what the
 * learner has actually demonstrated, what is improving, what still needs
 * work. Derived from real performance (learner-error model + learning
 * evidence) — never from XP, streaks or coins.
 *
 * @param {{ now?: number }} options
 * @returns {{ demonstrated: number, improving: number, needsWork: number,
 *            next: string|null, headline: string }}
 */
export function progressSummary(options = {}) {
  const now = options.now || Date.now();
  const errorEntries = getLearnerErrors({ limit: 40 });
  let improving = 0;
  let needsWork = 0;
  let nextLabel = null;
  for (const entry of errorEntries) {
    const life = weaknessLifecycle(entry, { now });
    if (!life) continue;
    if (life.state === WEAKNESS_LIFECYCLE.IMPROVING || life.state === WEAKNESS_LIFECYCLE.TRANSFER_CHECK
      || life.state === WEAKNESS_LIFECYCLE.DELAYED_CONFIRMATION) improving += 1;
    else if (life.state === WEAKNESS_LIFECYCLE.RECURRED || life.state === WEAKNESS_LIFECYCLE.CONFIRMED) {
      needsWork += 1;
      if (!nextLabel) nextLabel = String(entry.label || entry.key);
    }
  }
  // Demonstrated skills come from the capability model's independent
  // evidence — the same source Progress shows.
  let demonstrated = 0;
  try {
    demonstrated = buildCapabilityMap({ errorEntries }).demonstrated.length;
  } catch { /* capability model is additive; the summary still works */ }
  const parts = [];
  if (demonstrated) parts.push(`${demonstrated} skill${demonstrated === 1 ? '' : 's'} demonstrated`);
  if (improving) parts.push(`${improving} improving`);
  if (needsWork) parts.push(`${needsWork} need${needsWork === 1 ? 's' : ''} work`);
  return {
    demonstrated,
    improving,
    needsWork,
    next: nextLabel ? `Use ${nextLabel.toLowerCase()} in a new situation` : null,
    headline: parts.length ? parts.join(' · ') : 'Le Studio is still learning what you know.',
  };
}
