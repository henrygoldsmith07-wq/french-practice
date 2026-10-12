// The learner's exam weighting, as a planner input.
//
// WHY THIS IS ITS OWN MODULE
//     The session planner is capped at 600 lines by tests/module-boundaries,
//     and the cap's message is "split the domain rather than pass the cap".
//     Board weighting is a distinct concern from session composition: it is a
//     pure function of the chosen qualification, it has its own arithmetic, and
//     it is the one place that knows what the shipped boards' weights mean.
//     Keeping it here means the planner reads one number and stays about
//     sequencing.
//
// WHY IT TAKES A WEIGHT, NOT A BOARD RECORD
//     The board registry (boards.js) is ~25 KB of spec data behind the exam
//     chunk. Today has a 100 KB surface budget and this module is on Today's
//     load path, so the weight arrives as a PLAIN NUMBER — resolved where the
//     registry already lives (ExamSetup persists it beside settings.examBoard,
//     together with the board display name). That also means a learner can hold
//     a board chosen before this field existed: it reads as "no weighting",
//     never as a wrong one, and never silently biases practice.
//
// WHAT IT IS FOR
//     A WJEC Made-for-Wales candidate sits an oracy unit worth 30% of the
//     qualification; a WJEC 3800 candidate's spoken element is 25%. Those are
//     published, board-specific facts about what the exam rewards, and a
//     speaking coach that ignores them is coaching the wrong exam. The factor
//     this produces nudges the speaking pull toward the heavier board.
//
// WHAT IT DELIBERATELY IS NOT
//     - Not a trump card: the factor is capped at ±0.4, so a corroborated,
//       evidence-backed speaking weakness (skillImbalance runs to 1.2) always
//       outranks it. The exam is context; the learner's own evidence leads.
//     - Not a guess: a missing, or non-numeric, weight yields no factor at all.
//       An exam the app cannot verify must never silently bias practice.
//     - Not absolute: the 25% baseline is the lightest shipped weight, so the
//       commonest board behaves exactly as it did before this existed.

/** The lightest speaking weight among the shipped boards — the neutral point. */
export const BASELINE_SPEAKING_WEIGHT = 0.25;

/** The span the shipped boards actually cover, used to normalise the pull. */
export const SPEAKING_WEIGHT_SPAN = 0.05;

/** Hard bound on the factor, so context can never outrank real evidence. */
export const MAX_EXAM_FACTOR = 0.4;

/**
 * Resolve the exam weighting for a chosen board's oracy weight.
 *
 * @param {number|null|undefined} speakingWeight the board's oracy share as a
 *   fraction (0.25–0.30 among the shipped boards)
 * @param {string|null} [name] the board's display name, for the reason line
 * @returns {{speakingWeight: number|null, factor: number, reason: string|null}}
 *   `factor` is 0 and `reason` null when the weight is absent or unusable —
 *   callers then add no factor at all.
 */
export function resolveExamWeighting(speakingWeight, name = null) {
  const weight = Number(speakingWeight);
  if (!Number.isFinite(weight) || weight <= 0) {
    return { speakingWeight: null, factor: 0, reason: null };
  }

  const relative = Math.max(-1, Math.min(1, (weight - BASELINE_SPEAKING_WEIGHT) / SPEAKING_WEIGHT_SPAN));
  if (relative === 0) {
    // The baseline weight adds nothing: no factor, and no reason line either,
    // so a 25% learner's brief reads exactly as it did before.
    return { speakingWeight: weight, factor: 0, reason: null };
  }
  return {
    speakingWeight: weight,
    factor: Math.round(MAX_EXAM_FACTOR * relative * 100) / 100,
    reason: `the ${name || 'chosen'} qualification weights speaking at ${Math.round(weight * 100)}%`,
  };
}
