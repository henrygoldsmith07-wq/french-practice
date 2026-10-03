// Experiment report — the honest comparison between Adaptive Today and
// Balanced Today.
//
// Adaptive Today uses learner-specific weaknesses, transfer evidence and due
// retests; Balanced Today draws from the same activity pool without
// learner-specific targeting. This module turns the recorded outcome rows
// into a comparison a researcher can actually read:
//
//   · every metric carries its sample size
//   · every rate carries a 95% Wilson score interval
//   · below its floor a metric is PROVISIONAL, never presented as a finding
//   · tiny samples produce no numbers at all, not misleading ones
//   · raw event definitions travel with the report
//
// Descriptive only: these are participant-weighted summaries, never causal
// claims. Missing measures stay missing — they are never assumed 0.

import { wilsonInterval } from './evidenceUncertainty.js';

// Sample floors: participants per arm before any cross-arm number prints,
// and scored participants per metric before that metric prints.
export const MIN_PER_ARM = 8;
export const MIN_SCORED_PER_METRIC = 5;

// What each metric actually counts — shipped with the report so nobody has
// to guess what "delayedShort" means.
export const EVENT_DEFINITIONS = Object.freeze({
  completionRate: 'Share of planned Today sessions the learner actually finished (per participant, then averaged across participants).',
  timeOnTask: 'Mean minutes per finished session, measured at the session boundary — not self-reported.',
  immediateSuccess: 'Share of same-session retest answers that were correct. Never retention evidence: the answer was still on screen.',
  transferSuccess: 'Share of held-out transfer checks passed — material the learner had not practised, answered without hints.',
  delayedRecall: 'Share of delayed retests passed 1–3 days after the original mistake.',
  delayedRecallLong: 'Share of delayed retests passed 7+ days after the original mistake.',
  recurrence: 'Share of repaired weaknesses that reappeared after a delayed success.',
  assistanceDependence: 'Share of successes that needed a hint or retry rather than being independent.',
  speakingTime: 'Mean minutes of spoken production per session.',
  usefulness: 'Learner-reported usefulness of the session, 1–5, collected at session end (opt-in only).',
});

const PROVISIONAL_BELOW = MIN_SCORED_PER_METRIC;

/** Participant-weighted mean of per-participant means; null when empty. */
function meanOf(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000;
}

/** One metric cell: value, sample size, interval, and an honest state. */
function cell({ values = [], rateValues = null, participants = 0 }) {
  const scored = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  const mean = meanOf(values);
  // Rates get a Wilson interval over the per-participant success counts;
  // continuous measures get no interval (means of means, not proportions).
  let interval = null;
  if (rateValues) {
    const successes = rateValues.reduce((a, r) => a + (r.successes || 0), 0);
    const trials = rateValues.reduce((a, r) => a + (r.trials || 0), 0);
    interval = wilsonInterval(successes, trials);
  }
  let state = 'reportable';
  if (participants === 0 || scored === 0) state = 'no-data';
  else if (participants < MIN_PER_ARM || scored < PROVISIONAL_BELOW) state = 'provisional';
  return {
    mean,
    scoredParticipants: scored,
    participants,
    interval,
    // Below the floor the number is withheld entirely: a rate on two people
    // is not information, it is noise dressed as a finding.
    display: state === 'no-data' ? null : mean,
    state,
  };
}

/**
 * Build the per-metric comparison from pooled study data.
 *
 * @param {{summaries?: Array<object>, outcomes?: Array<object>,
 *          participantsByArm?: object}} pooled  researchAggregation.poolStudyData output
 * @returns {{definitions, floors, metrics, arms, state}}
 */
export function experimentComparison(pooled = {}) {
  const summaries = Array.isArray(pooled.summaries) ? pooled.summaries : [];
  const outcomes = Array.isArray(pooled.outcomes) ? pooled.outcomes : [];
  const armNames = ['adaptive', 'balanced'];

  const forArm = (arm) => summaries.filter((s) => s.arm === arm);
  const rowsForArm = (arm) => outcomes.filter((o) => o.variant === arm);

  const metric = (pickPerParticipant, pickRate = null) => Object.fromEntries(
    armNames.map((arm) => {
      const rows = forArm(arm);
      return [arm, cell({
        values: rows.map(pickPerParticipant).filter((v) => v != null),
        rateValues: pickRate ? rows.map(pickRate).filter((r) => r && r.trials > 0) : null,
        participants: rows.length,
      })];
    }),
  );

  // Per-participant extracts straight from the summaries and raw rows.
  const completion = metric(
    (s) => s.completion?.rate ?? null,
    (s) => (s.completion?.n ? { successes: Math.round((s.completion.rate || 0) * s.completion.n), trials: s.completion.n } : null),
  );
  const timeOnTask = metric((s) => meanOf(rowsForArm(s.arm)
    .filter((o) => o.participantId === s.participantId && typeof o.timeSpent === 'number')
    .map((o) => o.timeSpent / 60)));
  const immediateSuccess = metric(
    (s) => {
      const rows = rowsForArm(s.arm).filter((o) => o.participantId === s.participantId && o.immediate && typeof o.immediate.correct === 'boolean');
      return rows.length ? rows.filter((o) => o.immediate.correct).length / rows.length : null;
    },
    (s) => {
      const rows = rowsForArm(s.arm).filter((o) => o.participantId === s.participantId && o.immediate && typeof o.immediate.correct === 'boolean');
      return rows.length ? { successes: rows.filter((o) => o.immediate.correct).length, trials: rows.length } : null;
    },
  );
  const delayedRecall = metric(
    (s) => s.delayedShort?.rate ?? null,
    (s) => (s.delayedShort?.n ? { successes: Math.round((s.delayedShort.rate || 0) * s.delayedShort.n), trials: s.delayedShort.n } : null),
  );
  const delayedRecallLong = metric(
    (s) => s.delayedLong?.rate ?? null,
    (s) => (s.delayedLong?.n ? { successes: Math.round((s.delayedLong.rate || 0) * s.delayedLong.n), trials: s.delayedLong.n } : null),
  );
  const recurrence = metric(
    (s) => s.recurrence?.rate ?? null,
    (s) => (s.recurrence?.n ? { successes: Math.round((s.recurrence.rate || 0) * s.recurrence.n), trials: s.recurrence.n } : null),
  );
  // Per-skill transfer, kept separate — domains never merge. The headline
  // `transferSuccess` cell is arm-keyed like every other metric (its value is
  // the mean across protocol skills); the per-skill detail lives beside it.
  const transferBySkill = {};
  const skills = Object.keys(summaries[0]?.transferBySkill || { vocabulary: null });
  for (const skill of skills) {
    transferBySkill[skill] = metric((s) => {
      const t = s.transferBySkill?.[skill];
      return t && t.mean != null ? t.mean / 100 : null;
    });
  }
  const transferSuccess = metric((s) => {
    const t = s.transferBySkill?.[skills[0]];
    return t && t.mean != null ? t.mean / 100 : null;
  });

  // Assistance dependence: hints/retries per recorded attempt, from the raw
  // rows (a null hintsUsed means "not recorded", not zero).
  const assistanceDependence = metric((s) => {
    const rows = rowsForArm(s.arm).filter((o) => o.participantId === s.participantId && typeof o.hintsUsed === 'number');
    return rows.length ? meanOf(rows.map((o) => o.hintsUsed)) : null;
  });

  const metrics = {
    completionRate: completion,
    timeOnTask,
    immediateSuccess,
    transferSuccess,
    delayedRecall,
    delayedRecallLong,
    recurrence,
    assistanceDependence,
    // Not yet captured on outcome rows: reported as no-data rather than
    // invented. See the capture gaps below.
    speakingTime: metric(() => null),
    usefulness: metric(() => null),
  };

  const arms = Object.fromEntries(armNames.map((arm) => [arm, {
    participants: forArm(arm).length,
    sessions: rowsForArm(arm).length,
  }]));

  const anyReportable = Object.values(metrics).some((m) => (
    armNames.some((arm) => m?.[arm]?.state === 'reportable')
  ));
  return {
    definitions: EVENT_DEFINITIONS,
    floors: { minPerArm: MIN_PER_ARM, minScoredPerMetric: MIN_SCORED_PER_METRIC },
    metrics,
    // Per-skill transfer detail beside the headline cell: domains never merge,
    // so each skill keeps its own sample size and state.
    transferBySkill,
    arms,
    state: anyReportable ? 'provisional' : 'no-data',
    note: 'Participant-weighted and descriptive: a difference here is not a significance claim, and a small sample is reported as provisional rather than as a result.',
    captureGaps: [
      'speakingTime — spoken-production duration is not yet written to study outcome rows; it is collected in local instrumentation only.',
      'usefulness — learner-reported usefulness has no UI prompt yet, so no data exists and none is invented.',
    ],
  };
}

/**
 * The compact learner/operator-facing line for one metric cell, or an honest
 * placeholder. Sample size always travels with the number.
 */
export function formatMetricCell(label, cellValue) {
  if (!cellValue || cellValue.state === 'no-data' || cellValue.display == null) return `${label}: no data yet`;
  const pct = typeof cellValue.display === 'number' && cellValue.display <= 1
    ? `${Math.round(cellValue.display * 100)}%`
    : String(Math.round(cellValue.display * 100) / 100);
  const ci = cellValue.interval
    ? ` (${Math.round(cellValue.interval.lower * 100)}–${Math.round(cellValue.interval.upper * 100)}%)`
    : '';
  const provisional = cellValue.state === 'provisional' ? ' — provisional, sample too small' : '';
  return `${label}: ${pct}${ci} · n=${cellValue.scoredParticipants}${provisional}`;
}
