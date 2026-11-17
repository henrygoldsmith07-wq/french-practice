// Experiment report — the honest comparison between Adaptive Today and
// Balanced Today.
//
// Adaptive Today uses learner-specific weaknesses, transfer evidence and due
// retests; Balanced Today draws from the same activity pool without
// learner-specific targeting. This module turns the recorded outcome rows
// into a comparison a researcher can actually read:
//
//   · every metric carries its sample size
//   · every rate carries a 95% interval on the PARTICIPANT-WEIGHTED mean,
//     estimated across participants (never a pooled item-level Wilson interval)
//   · below its floor a metric is PROVISIONAL, never presented as a finding
//   · tiny samples produce no numbers at all, not misleading ones
//   · raw event definitions travel with the report
//
// Descriptive only: these are participant-weighted summaries, never causal
// claims. Missing measures stay missing — they are never assumed 0.

// No import from evidenceUncertainty.js: a Wilson interval is for a SINGLE
// pooled proportion (k of n items). Rates here are means of per-participant
// rates, so their interval is estimated across participants instead — pooling
// items is prohibited for arm comparisons by the frozen protocol.

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

// Two-sided 95% t critical values, indexed by degrees of freedom (df = n - 1).
// Beyond df=30 the normal approximation (1.96) is close enough.
const T975 = [
  null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080,
  2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
];
const t975 = (df) => (df >= 1 && T975[df] != null ? T975[df] : 1.96);

/** 95% t interval on the mean of per-participant rates.
 *
 *  Each participant contributes ONE rate, so the uncertainty is the variance
 *  ACROSS participants (SE = s / sqrt(n)), not a binomial Wilson interval on a
 *  pooled item count. Pooling items would weight a participant by their trial
 *  count and can produce an interval that excludes the displayed mean — which
 *  the frozen protocol forbids for arm comparisons. Returns null for fewer
 *  than two participants, where no variance can be estimated at all. */
export function participantMeanInterval(values) {
  const rates = (Array.isArray(values) ? values : [])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  const n = rates.length;
  if (n < 2) return null;
  // Match the displayed mean's 3-decimal rounding so the interval is centred
  // on exactly the number shown beside it.
  const mean = Math.round((rates.reduce((a, b) => a + b, 0) / n) * 1000) / 1000;
  const variance = rates.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  const half = t975(n - 1) * Math.sqrt(variance / n);
  // Round bounds to 6dp so identical rates give a clean [mean, mean] rather
  // than an artifact like 0.7999999999999998 from floating-point noise.
  const bound = (v) => Math.round(v * 1e6) / 1e6;
  return {
    lower: bound(Math.max(0, mean - half)),
    upper: bound(Math.min(1, mean + half)),
    level: 0.95,
    method: 'participant-mean-t',
  };
}

/** One metric cell: value, sample size, interval, and an honest state. */
function cell({ values = [], rateValues = null, participants = 0 }) {
  const scored = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  const mean = meanOf(values);
  // Rate metrics are participant-weighted means of per-participant rates, so
  // their interval is estimated ACROSS participants from those same rates.
  // (`rateValues` only marks the metric as a rate; continuous means-of-means
  // get no interval.) A single scored participant has no variance estimate —
  // the mean is shown with an explicit note rather than a fabricated interval.
  let interval = null;
  let intervalNote = null;
  if (rateValues) {
    interval = participantMeanInterval(values);
    if (!interval) {
      intervalNote = 'No interval: at least two scored participants are needed to estimate uncertainty across participants. The participant-weighted mean is shown without a confidence interval.';
    }
  }
  let state = 'reportable';
  if (participants === 0 || scored === 0) state = 'no-data';
  else if (participants < MIN_PER_ARM || scored < PROVISIONAL_BELOW) state = 'provisional';
  return {
    mean,
    scoredParticipants: scored,
    participants,
    interval,
    intervalNote,
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
  // Per-skill transfer, kept separate — domains never merge into a misleading
  // raw item-level pool. The headline `transferSuccess` cell aggregates
  // ACROSS skills at the participant level first, then across participants:
  //
  //   1. for each participant, take the mean of every skill that participant
  //      actually measured (missing skills are EXCLUDED — never zero-filled);
  //   2. the arm value is the mean of those per-participant means, so a
  //      participant with five measured skills weighs exactly as much as one
  //      with a single skill (participant-weighted, not item-weighted);
  //   3. a participant with no measured skill contributes nothing and is
  //      excluded from the sample size rather than counted as zero.
  //
  // The skill set is the UNION across ALL summaries (not the first one's keys):
  // a skill only later participants carry is still reported, and per-skill
  // cells are computed per arm from everyone who measured that skill.
  const skills = [...new Set(
    summaries.flatMap((s) => Object.keys(s?.transferBySkill || {})),
  )].sort();
  const transferBySkill = {};
  for (const skill of skills) {
    transferBySkill[skill] = metric((s) => {
      const t = s.transferBySkill?.[skill];
      return t && t.mean != null ? t.mean / 100 : null;
    });
  }
  // Participant-level mean over their own measured skills.
  const participantTransfer = (s) => {
    const measured = (s?.transferBySkill ? Object.values(s.transferBySkill) : [])
      .map((t) => (t && t.mean != null ? t.mean / 100 : null))
      .filter((v) => typeof v === 'number' && Number.isFinite(v));
    return measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null;
  };
  const transferSuccess = metric(participantTransfer);

  // Assistance dependence: hints/retries per recorded attempt, from the raw
  // rows (a null hintsUsed means "not recorded", not zero).
  const assistanceDependence = metric((s) => {
    const rows = rowsForArm(s.arm).filter((o) => o.participantId === s.participantId && typeof o.hintsUsed === 'number');
    return rows.length ? meanOf(rows.map((o) => o.hintsUsed)) : null;
  });

  // Spoken production and usefulness are captured on outcome rows when a
  // study participant completes a session (speakingSeconds from the learner's
  // voiced mic time; usefulness from the optional 1–5 prompt). Until rows
  // exist these read no-data — never invented, and the capture-gap list below
  // narrows to whatever is genuinely still missing.
  const speakingTime = metric((s) => {
    const rows = rowsForArm(s.arm).filter((o) => o.participantId === s.participantId
      && Number.isFinite(Number(o.speakingSeconds)) && Number(o.speakingSeconds) > 0);
    return rows.length ? meanOf(rows.map((o) => Number(o.speakingSeconds) / 60)) : null;
  });
  const usefulness = metric((s) => {
    const rows = rowsForArm(s.arm).filter((o) => o.participantId === s.participantId
      && Number.isFinite(Number(o.usefulness)) && Number(o.usefulness) >= 1 && Number(o.usefulness) <= 5);
    return rows.length ? meanOf(rows.map((o) => Number(o.usefulness))) : null;
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
    speakingTime,
    usefulness,
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
      // Only genuinely-missing capture is listed. Once rows carry the field,
      // the gap disappears instead of nagging forever.
      ...(speakingTime.adaptive.state === 'no-data' && speakingTime.balanced.state === 'no-data'
        ? ['speakingTime — no study outcome rows carry spoken-production time yet; collected in local instrumentation until a participant session records it.']
        : []),
      ...(usefulness.adaptive.state === 'no-data' && usefulness.balanced.state === 'no-data'
        ? ['usefulness — no learner has rated a session yet; the optional prompt stores nothing until they do.']
        : []),
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
  // When the interval is omitted (too few participants), say so explicitly
  // rather than letting a bare number imply an unearned precision.
  const note = !cellValue.interval && cellValue.intervalNote ? ` — ${cellValue.intervalNote}` : '';
  return `${label}: ${pct}${ci} · n=${cellValue.scoredParticipants}${provisional}${note}`;
}
