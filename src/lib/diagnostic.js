// The spoken diagnostic — the first real evidence a new learner produces.
//
// Onboarding used to end by guessing a level. There was no moment where the
// learner actually SPOKE, got a named weakness back, and saw when it would be
// re-checked. This module turns one short spoken sample into that: a single
// named weakness and the date its check is scheduled, using the SAME error
// model every other mode writes to (see lib/learnerErrors.js) and the SAME
// follow-up scheduling the loop already uses (see lib/followUp.js).
//
// It is pure and storage-free: the component passes a transcript + metrics, and
// gets back a finding. Recording, transcribing and persisting are the caller's
// job, so this is unit-testable without a mic, a network, or an LLM.
//
// Honesty rules — inherited from the evidence model, not invented here:
//   - ONE spoken sample is ONE data point. It can name a *candidate* weakness
//     and schedule its check, but it can NEVER mark anything fixed. The
//     re-check is scheduled in the FUTURE; nothing here sets status past
//     "active" or claims mastery.
//   - A silent, empty or unusable sample yields no weakness. We never invent a
//     gap from nothing.
//   - The re-check is delayed by design (not "today"): a check that fires
//     immediately would be a re-take of the same attempt, not a retest.

import { recordLearnerError } from './stores/learnerErrorStore.js';

// A single spoken sample is thin evidence. The re-check must be far enough out
// that a pass means recall-after-a-gap, not an immediate re-do. 3 days is the
// floor; the caller may pass a longer horizon for a scheduled follow-up.
export const DIAGNOSTIC_RECHECK_DAYS = 3;

// The scheduler's own floor: a check must clear this much real time to count
// as retention rather than a same-day retake (lib/learningEvidence.js). It is
// the lower bound every horizon here respects, so the copy a learner reads can
// never promise something the engine would ignore.
export const RECHECK_FLOOR_HOURS = 20;

// Adaptive horizon — the ONE clock. The onboarding copy and the scheduler both
// derive the re-check date from this function, so the promise the learner sees
// and the date the engine fires are the same number by construction; they
// cannot drift.
//
// Urgency comes from the diagnostic score itself, which is the honest signal we
// have at capture time: a one-off sample that scored badly is a weak read, so
// it gets re-checked SOONER (the sooner we look again, the sooner a real
// weakness is confirmed or a one-off is cleared). A mild gap can wait longer.
// All bands are capped well above the floor and well below DIAGNOSTIC_DAYS so
// "soon" and "later" are both real gaps, never a same-day retake.
//
//   score < 30  → 2 days  (a clear gap: look again soon)
//   30 ≤ s < 55 → 3 days  (a real but moderate gap)
//   s ≥ 55      → 5 days  (mild: give it room before the next look)
// Anything unusable (non-finite) falls back to the default horizon.
const HORIZON_BANDS = [
  { max: 30, days: 2 },
  { max: 55, days: 3 },
];
const HORIZON_MILD_DAYS = 5;

/**
 * How many hours until the re-check, for a diagnostic of the given score.
 * Bounded to [RECHECK_FLOOR_HOURS, HORIZON_MILD_DAYS*24] and rounded to whole
 * hours so the displayed date and the fired date agree exactly.
 * @param {number} score the weakest dimension's score, 0–100
 * @param {object} [options]
 * @param {number} [options.defaultDays] horizon when the score is unusable
 * @returns {number} hours until the re-check
 */
export function recheckHorizonHours(score, { defaultDays = DIAGNOSTIC_RECHECK_DAYS } = {}) {
  const s = Number(score);
  let days;
  if (!Number.isFinite(s)) days = defaultDays;
  else days = s < 55
    ? (HORIZON_BANDS.find((b) => s < b.max) || { days: HORIZON_BANDS.at(-1).days }).days
    : HORIZON_MILD_DAYS;
  const hours = Math.round(days * 24);
  return Math.min(Math.max(RECHECK_FLOOR_HOURS, hours), HORIZON_MILD_DAYS * 24);
}

// The spoken dimensions a diagnostic can honestly score from one sample, with
// the error-model category each maps to. Order matters only for stable output.
const DIMENSIONS = [
  { id: 'accuracy', category: 'grammar', label: 'grammar and verb accuracy',
    why: 'Verb forms and agreement slipped in your first sentences.' },
  { id: 'fluency', category: 'speaking', label: 'smoothness and pace',
    why: 'Your speech had hesitations that broke up the message.' },
  { id: 'vocabulary', category: 'vocabulary', label: 'range of words',
    why: 'You reached for the same few words where richer ones were needed.' },
  { id: 'pronunciation', category: 'pronunciation', label: 'pronunciation',
    why: 'Some sounds were unclear enough to affect understanding.' },
];

/**
 * Pick the single weakest dimension from a diagnostic sample. Ties break by
 * the order above (accuracy first), so the output is deterministic.
 *
 * @param {object} sample
 * @param {number} [sample.accuracy]   0–100 (grammar/verb control)
 * @param {number} [sample.fluency]    0–100 (pace, pauses, fillers)
 * @param {number} [sample.vocabulary] 0–100 (lexical range)
 * @param {number} [sample.pronunciation] 0–100
 * @returns {object|null} the weakest dimension, or null if nothing is usable
 */
export function weakestDimension(sample = {}) {
  let worst = null;
  for (const dim of DIMENSIONS) {
    const score = Number(sample[dim.id]);
    if (!Number.isFinite(score)) continue;
    if (worst === null || score < worst.score) {
      worst = { ...dim, score: Math.max(0, Math.min(100, Math.round(score))) };
    }
  }
  // A sample that scored well on everything is not a weakness. Below 80 means
  // there is a real, nameable gap to work on; at or above it the diagnostic
  // says "solid start" rather than manufacturing a problem.
  if (worst && worst.score >= 80) return null;
  return worst;
}

/**
 * Turn a first spoken sample into a diagnostic finding: the named weakness,
 * the re-check date, and the plain-language explanation the learner sees.
 *
 * @param {object} sample  { transcript, accuracy?, fluency?, vocabulary?, pronunciation? }
 * @param {object} [options]
 * @param {number} [options.now]           injectable clock (tests)
 * @param {number} [options.recheckDays]   explicit horizon override in DAYS
 *   (tests/back-compat). Omit to use the adaptive horizon.
 * @param {number} [options.recheckHours]  explicit horizon override in HOURS
 *   (wins over recheckDays when both given).
 * @param {Function} [options.recordError] injectable recorder; defaults to the
 *   storage-backed recordLearnerError. Tests pass a spy so no localStorage is
 *   touched and the pure finding logic can be asserted in isolation.
 * @returns {{
 *   finding: object|null, recheckAt: string|null, note: string,
 *   recorded: object|null, recheckHours: number|null
 * }} finding is null when the sample names no usable weakness.
 */
export function diagnoseSpeaking(sample = {}, {
  now = Date.now(), recheckDays = null, recheckHours = null, recordError,
} = {}) {
  const transcript = String(sample.transcript || '').trim();
  // A silent or empty recording is not a weakness — it is a setup problem the
  // caller surfaces. We never manufacture a gap from nothing.
  if (!transcript) {
    return { finding: null, recheckAt: null, recheckHours: null, note: 'No speech was captured, so there is nothing to diagnose yet.', recorded: null };
  }

  const weakest = weakestDimension(sample);
  if (!weakest) {
    return {
      finding: null, recheckAt: null, recheckHours: null,
      note: 'Solid first sample — nothing needs urgent repair. Your session will still build on what you say.',
      recorded: null,
    };
  }

  // The horizon comes from the ONE adaptive clock. An explicit override (tests,
  // back-compat) still wins; otherwise the score decides — a clear gap is
  // looked at sooner, a mild one later. Always ≥ the 20h floor, so the engine
  // will actually fire it and the copy never promises what the scheduler skips.
  // Guard against the null→0 coercion trap: Number(null) is 0, which is finite,
  // so a naive Number.isFinite check would treat "no override" as "0 hours" and
  // fire the check immediately. Test the RAW value for finiteness instead.
  const explicitHours = recheckHours == null ? null : Number(recheckHours);
  const explicitDays = recheckDays == null ? null : Number(recheckDays);
  const horizonHours = explicitHours != null && Number.isFinite(explicitHours)
    ? Math.round(explicitHours)
    : explicitDays != null && Number.isFinite(explicitDays)
      ? Math.round(explicitDays * 24)
      : recheckHorizonHours(weakest.score);
  const recheckAt = new Date(Number(now) + horizonHours * 3_600_000).toISOString();
  // Days shown in copy, derived from the SAME number the engine fires: round up
  // so "in 3 days" is never shown for a 2.1-day gap the engine treats as 3.
  const horizonDays = Math.max(1, Math.ceil(horizonHours / 24));

  const finding = {
    category: weakest.category,
    // The dimension is the key so the diagnostic weakness is the SAME node a
    // later conversation/drill weakness with the same category/rule collides
    // with — one model, not a diagnostic-only silo.
    key: `diagnostic:${weakest.id}`,
    label: weakest.label,
    why: weakest.why,
    score: weakest.score,
    mode: 'diagnostic',
    source: 'spoken-diagnostic',
    // The scheduled re-check date, carried into the model so the scheduler
    // fires the SAME date the learner was shown, rather than re-deriving one
    // from the event timestamp. Compact token: the baseline event's `detail`
    // is the only free-text field that persists, so the horizon rides here.
    // `RECHECK_SCHEDULE_PREFIX` in learningEvidence.js reads it back.
    detail: `recheck@${recheckAt}`,
  };

  // Feed the shared error model exactly as conversation/writing do, so this
  // first weakness is visible to Today and the follow-up scheduler. One sample
  // = one error event; it can only create/refresh an ACTIVE weakness, never
  // resolve one.
  const recorder = recordError || recordLearnerError;
  let recorded = null;
  try {
    recorded = recorder(finding, { at: new Date(Number(now)).toISOString() });
  } catch {
    recorded = null; // storage unavailable — the finding is still returned
  }

  return {
    finding,
    recheckAt,
    recheckHours: horizonHours,
    note: `First gap to work on: ${weakest.label.toLowerCase()}. ${weakest.why} We'll check it again in ${horizonDays} day${horizonDays === 1 ? '' : 's'}.`,
    recorded: recorded ? { id: recorded.id, status: recorded.status } : null,
  };
}

export { DIMENSIONS };
