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

const DAY_MS = 86_400_000;

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
 * @param {number} [options.recheckDays]   days until the check (default 3)
 * @param {Function} [options.recordError] injectable recorder; defaults to the
 *   storage-backed recordLearnerError. Tests pass a spy so no localStorage is
 *   touched and the pure finding logic can be asserted in isolation.
 * @returns {{
 *   finding: object|null, recheckAt: string|null, note: string,
 *   recorded: object|null
 * }} finding is null when the sample names no usable weakness.
 */
export function diagnoseSpeaking(sample = {}, { now = Date.now(), recheckDays = DIAGNOSTIC_RECHECK_DAYS, recordError } = {}) {
  const transcript = String(sample.transcript || '').trim();
  // A silent or empty recording is not a weakness — it is a setup problem the
  // caller surfaces. We never manufacture a gap from nothing.
  if (!transcript) {
    return { finding: null, recheckAt: null, note: 'No speech was captured, so there is nothing to diagnose yet.', recorded: null };
  }

  const weakest = weakestDimension(sample);
  if (!weakest) {
    return {
      finding: null, recheckAt: null,
      note: 'Solid first sample — nothing needs urgent repair. Your session will still build on what you say.',
      recorded: null,
    };
  }

  const days = Math.max(1, Number(recheckDays) || DIAGNOSTIC_RECHECK_DAYS);
  const recheckAt = new Date(Number(now) + days * DAY_MS).toISOString();

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
    note: `First gap to work on: ${weakest.label.toLowerCase()}. ${weakest.why} We'll check it again in ${days} day${days === 1 ? '' : 's'}.`,
    recorded: recorded ? { id: recorded.id, status: recorded.status } : null,
  };
}

export { DIMENSIONS };
