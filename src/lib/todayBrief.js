// Today's brief — the learner-facing answer to "what should I do right now?"
// before the session opens. Built from the same planner the session uses, so
// the dashboard can never promise a session Today won't deliver.
//
// One dominant CTA plus at most three short reason lines. No engine
// terminology, no stats wall.

import { buildSessionPlan } from './sessionPlanner.js';
import { plannerState } from './plannerState.js';
import { weaknessLifecycle, WEAKNESS_LIFECYCLE } from './weaknessLifecycle.js';
import { buildCapabilityMap } from './capabilityModel.js';
import { getLearnerErrors, getSettings, getStudyEvents } from './storage.js';

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
  const today = new Date(now).toISOString().slice(0, 10);
  const events = (options.events || getStudyEvents()).filter((e) => (
    typeof e?.at === 'string' && e.at.slice(0, 10) === today
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
