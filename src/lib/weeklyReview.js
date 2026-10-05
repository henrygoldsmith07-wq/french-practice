// Weekly review — the concise "this week" summary.
//
// Real data only. Every number comes from the learner's own recorded
// activity; a quiet week honestly reports zeros rather than inventing
// movement. Copy is actionable and plain: what was practised, what improved,
// what recurred, and what to do next week.

import { localDayKey } from './localDay.js';
import { learningCycleSummary } from './learningEvidence.js';

const DAY = 86400000;

// Every calendar day in this module must be a LOCAL day.
//
// The window bounds come from localDayKey(), but the timestamps being filtered
// (session.date, event.at, entry.lastErrorAt) are persisted as UTC ISO strings
// by storage.js. Slicing the first 10 characters of a UTC string yields the UTC
// date, so an evening session east of Greenwich ran past UTC midnight, was
// stamped a day ahead of the window, and was dropped: a learner who had just
// practised for ten minutes was told they had not practised this week.
//
// One day identity for the whole app (localDay.js), applied to every input
// shape. Invalid input yields null, which fails the window comparison and so
// excludes the row rather than corrupting the bounds.
function isoDay(value) {
  return localDayKey(value instanceof Date ? value : new Date(value));
}

function inWindow(at, since, until) {
  const day = isoDay(at);
  return day >= since && day <= until;
}

/**
 * Build the weekly summary from the learner's own state.
 *
 * @param {{
 *   sessions?: Array<object>,       // saved sessions (date, turns, kind…)
 *   timeLog?: object,               // {'YYYY-MM-DD': seconds}
 *   learningEvidence?: object,      // learningEvidence state (cycles)
 *   learnerErrorModel?: object,     // learnerErrors model (entries)
 *   reviewEvents?: Array<object>,   // review events
 *   weekStart?: string,             // YYYY-MM-DD (inclusive)
 *   now?: number,
 * }} input
 */
export function buildWeeklyReview(input = {}) {
  const now = input.now || Date.now();
  const until = isoDay(now);
  const since = input.weekStart || isoDay(now - 6 * DAY);

  // Minutes: the time log is the canonical record of practice time.
  const timeLog = input.timeLog || {};
  let practisedSeconds = 0;
  for (const [day, seconds] of Object.entries(timeLog)) {
    if (inWindow(day, since, until)) practisedSeconds += Number(seconds) || 0;
  }
  const sessions = (input.sessions || []).filter((s) => s && inWindow(s.date || '', since, until));
  // Speaking minutes. saveSession records `speakingSeconds` (voiced production
  // time from the learner's own audio); it never recorded `durationSeconds` or
  // `kind`, which is what this read, so the measured branch was unreachable and
  // every week fell back to a turns-based estimate. Use the real measurement
  // when it exists and keep the estimate only for history written before it.
  // Only used when the time log has nothing for the week, so the estimate is
  // never additive with real measurements.
  const speakingEstimates = sessions.map((s) => {
    const recorded = Number(s.speakingSeconds);
    if (Number.isFinite(recorded) && recorded > 0) return recorded / 60;
    return (Number(s.turns) || 0) * 0.75;
  });
  const speakingMinutes = Math.round(
    practisedSeconds > 0
      ? Math.min(speakingEstimates.reduce((a, b) => a + b, 0), (practisedSeconds / 60) * 0.6)
      : speakingEstimates.reduce((a, b) => a + b, 0),
  );

  // Skill demonstrations and weakness movement from the learning-evidence
  // cycles — the loop the product promises (baseline → repair → transfer →
  // delayed). A cycle that reached a fresh state this week counts once.
  const cycles = (input.learningEvidence?.cycles || []).filter((c) => c);
  let skillsDemonstrated = 0;
  let weaknessesImproved = 0;
  let weaknessesRecurred = 0;
  const improvements = [];
  const recurrences = [];
  for (const cycle of cycles) {
    const summary = learningCycleSummary(cycle, now);
    if (!summary) continue;
    const touchedThisWeek = [...cycle.baseline, ...cycle.interventions, ...cycle.transfers, ...cycle.delayed, ...cycle.recurrences]
      .some((e) => inWindow(e.at || '', since, until));
    if (!touchedThisWeek) continue;
    const label = summary.target?.label || summary.target?.key || 'a weakness';
    if (summary.status === 'demonstrated') {
      skillsDemonstrated += 1;
      improvements.push({ label, why: 'You used it independently in a new situation and later on.' });
    } else if (summary.status === 'recurred') {
      weaknessesRecurred += 1;
      recurrences.push({ label, why: 'It came back after improving — so it needs practice again.' });
    } else if (summary.independentSamples > 0 || summary.samples > 1) {
      weaknessesImproved += 1;
      improvements.push({ label, why: 'Recent attempts are better — it just needs to hold up.' });
    }
  }

  // Errors that came back this week (the learner-error model's recurrence).
  for (const entry of (input.learnerErrorModel?.entries || [])) {
    if (!entry || !(Number(entry.recurrenceCount) > 0)) continue;
    if (!inWindow(entry.lastErrorAt || '', since, until)) continue;
    const label = String(entry.label || entry.key);
    if (recurrences.some((r) => r.label === label)) continue;
    weaknessesRecurred += 1;
    recurrences.push({ label, why: 'It came back after improving — so it needs practice again.' });
  }

  const reviews = (input.reviewEvents || []).filter((e) => e && inWindow(e.at || '', since, until));

  const biggestImprovement = improvements[0] || null;
  const needsAttention = recurrences[0]
    || weakestOpen((input.learnerErrorModel?.entries || []))
    || improvements.at(-1)
    || null;

  return {
    weekStart: since,
    weekEnd: until,
    practisedMinutes: Math.round(practisedSeconds / 60),
    speakingMinutes,
    skillsDemonstrated,
    weaknessesImproved,
    weaknessesRecurred,
    reviewsCompleted: reviews.length,
    biggestImprovement,
    needsAttention,
    nextWeek: nextWeekActions({ recurrences, needsAttention, speakingMinutes, practisedSeconds }),
    empty: practisedSeconds === 0 && sessions.length === 0 && !improvements.length && !recurrences.length,
  };
}

function weakestOpen(entries) {
  const open = (entries || [])
    .filter((e) => e && e.status === 'active' && (Number(e.errorCount) || 0) > 0)
    .sort((a, b) => (Number(b.errorCount) || 0) - (Number(a.errorCount) || 0))[0];
  return open
    ? { label: String(open.label || open.key), why: 'This keeps showing up in your practice.' }
    : null;
}

function nextWeekActions({ recurrences, needsAttention, speakingMinutes, practisedSeconds }) {
  const actions = [];
  if (recurrences.length) {
    actions.push(`More practice on ${recurrences[0].label.toLowerCase()} — it came back this week`);
  } else if (needsAttention) {
    actions.push(`Keep ${needsAttention.label.toLowerCase()} in your sessions`);
  }
  if (speakingMinutes < 15) actions.push('More spontaneous speaking');
  if (practisedSeconds > 0 && practisedSeconds / 60 < 60) actions.push('Two short sessions beat one long one');
  if (!actions.length) actions.push('One delayed check on what you improved recently');
  return actions.slice(0, 3);
}

/**
 * The learner-facing text for the summary — concise, no charts.
 * Example: "Practised: 142 minutes · Speaking: 38 minutes".
 */
export function weeklyReviewLines(summary) {
  if (!summary) return [];
  if (summary.empty) {
    return [
      'No practice recorded this week — a short session today starts it off.',
      'Even five minutes counts.',
    ];
  }
  const lines = [
    `Practised: ${summary.practisedMinutes} minutes`,
    `Speaking: ${summary.speakingMinutes} minutes`,
    `Skills demonstrated: ${summary.skillsDemonstrated}`,
    `Weaknesses improved: ${summary.weaknessesImproved}`,
    `Weaknesses recurred: ${summary.weaknessesRecurred}`,
  ];
  return lines;
}
