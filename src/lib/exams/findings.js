// Exam findings → the shared error model.
//
// Exam Speaking Mode used to be a silo: a paper produced a percentage and a
// band, and the learner's weakness model never learned anything from it. So a
// candidate who repeatedly loses marks on tense accuracy in the exam room would
// still get a Today session built from conversation mistakes alone.
//
// This module is the bridge. It translates an exam task's per-criterion
// sub-scores into the SAME weakness records that conversation, writing and
// drills produce, so every mode feeds one model.
//
// Honesty rules — these are the point of the module, not decoration:
//   - A criterion only becomes a weakness when its score is genuinely weak.
//     "Indicative practice" marking is not precise enough to justify a weakness
//     from a borderline 55.
//   - Unmarked criteria are skipped, never assumed to be poor.
//   - A strength is recorded as SUCCESS evidence with the same identity rules as
//     any other mode, so one good exam answer cannot resolve a weakness.
//   - Every record carries `source: 'exam'` and the paper's `official: false`
//     provenance, so nothing here can be mistaken for an official result.

// NOTE: deliberately NO import of boards.js here. boards.js is ~25 KB of board
// registry data the exam simulator already owns; importing it (even just to
// re-export TIER) would drag the whole registry into Today's load graph —
// todayPlan imports examCountdown — and blow Today's 100 KB surface budget. The
// board's oracy weight is resolved through an injectable lookup instead, so the
// registry only loads where a board is actually being edited.

/** A criterion below this is a weakness worth feeding the model. */
export const EXAM_WEAKNESS_FLOOR = 45;

/** A criterion at or above this is genuine success evidence. */
export const EXAM_STRENGTH_FLOOR = 70;

/**
 * Exam criterion → error-model category.
 *
 * The error model's categories are the shared vocabulary every mode already
 * writes to (see lib/learnerErrors.js). Mapping rather than inventing new
 * categories is what makes exam findings show up in Today.
 */
export const CRITERION_TO_CATEGORY = Object.freeze({
  accuracy: 'grammar',
  range: 'vocabulary',
  communication: 'speaking',
  pronunciation: 'pronunciation',
  spontaneity: 'speaking',
  comprehension: 'listening',
  content: 'writing',
  organisation: 'writing',
});

/**
 * Human-readable reason a criterion became a weakness. Kept here so the copy
 * is identical wherever a finding is shown.
 */
const CRITERION_LABEL = Object.freeze({
  accuracy: 'grammar and verb accuracy',
  range: 'range of language',
  communication: 'getting your message across',
  pronunciation: 'pronunciation and delivery',
  spontaneity: 'responding spontaneously',
  comprehension: 'understanding',
  content: 'content and ideas',
  organisation: 'structure and organisation',
});

/**
 * Turn one scored exam task into weakness/success findings for the error model.
 *
 * @param {object} args
 * @param {string} args.taskId       e.g. 'roleplay' | 'photocard' | 'conversation'
 * @param {Array<{criterion:string, score:number}>} args.criteria marked sub-scores
 * @param {object} [args.context]    provenance: boardId, tier, paperId, official
 * @returns {{weaknesses: Array, successes: Array, skipped: Array}}
 */
export function findingsFromTask({ taskId, criteria = [], context = {} }) {
  const weaknesses = [];
  const successes = [];
  const skipped = [];

  for (const row of Array.isArray(criteria) ? criteria : []) {
    const criterion = String(row?.criterion || '');
    const score = Number(row?.score);
    if (!CRITERION_TO_CATEGORY[criterion] || !Number.isFinite(score)) {
      skipped.push(criterion || '(unmarked)');
      continue;
    }
    const bounded = Math.max(0, Math.min(100, score));
    const category = CRITERION_TO_CATEGORY[criterion];
    const finding = {
      category,
      // The criterion is the key: 'accuracy' in a role-play and 'accuracy' in a
      // photo card are the SAME weakness, so they must collide in the model
      // rather than accumulating as two unrelated gaps.
      key: criterion,
      label: CRITERION_LABEL[criterion] || criterion,
      mode: 'exam',
      taskId: String(taskId || ''),
      source: 'exam',
      official: context.official === true,
      boardId: context.boardId || null,
      tier: context.tier || null,
      criterion,
    };

    if (bounded < EXAM_WEAKNESS_FLOOR) {
      weaknesses.push({ ...finding, score: Math.round(bounded), kind: 'error' });
    } else if (bounded >= EXAM_STRENGTH_FLOOR) {
      successes.push({ ...finding, score: Math.round(bounded), kind: 'success' });
    } else {
      // The honest middle: not evidence either way. Recording it as a weakness
      // would nag; recording it as success would flatter.
      skipped.push(criterion);
    }
  }

  return { weaknesses, successes, skipped };
}

/**
 * Apply a whole paper's findings. `record` is injected so this module stays
 * pure and testable — the caller supplies the storage-backed recorder.
 *
 * @param {Array} tasks  [{ taskId, criteria: [{criterion, score}] }]
 * @param {object} options
 * @param {Function} options.recordError   (finding) => void
 * @param {Function} options.recordSuccess (finding) => void
 * @returns {{weaknesses:number, successes:number, skipped:Array}}
 */
export function applyPaperFindings(tasks = [], { recordError, recordSuccess, context = {} } = {}) {
  let weaknessCount = 0;
  let successCount = 0;
  const skipped = [];

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const { weaknesses, successes, skipped: taskSkipped } = findingsFromTask({
      taskId: task?.taskId,
      criteria: task?.criteria,
      context: { ...context, ...(task?.context || {}) },
    });
    for (const w of weaknesses) {
      recordError?.(w);
      weaknessCount += 1;
    }
    for (const s of successes) {
      recordSuccess?.(s);
      successCount += 1;
    }
    skipped.push(...taskSkipped);
  }

  return { weaknesses: weaknessCount, successes: successCount, skipped };
}

/**
 * Does an exam-date countdown reshape Today?
 *
 * Bands are deliberately coarse: within three weeks the mix leans hard on the
 * modalities the exam actually tests; further out it stays general. Returns
 * null when there is no date, so callers never invent urgency.
 *
 * The board is an OPTIONAL second signal, grounded in real spec data: each
 * board ships `speakingWeight`, the share of the paper that is oracy (GCSE
 * 0.25, A-level 0.30). An oracy-heavy paper should lean harder on speaking at
 * the SAME countdown band than a GCSE one, so the band's base weight is scaled
 * by the board's oracy weight normalised against the GCSE baseline (0.25 → no
 * change, 0.30 → a modest lift). No board, unknown board, or a board with no
 * weight leaves the weight untouched — the countdown alone still works exactly
 * as before, so this never invents urgency a board does not actually carry.
 *
 * @param {string|Date|null} examDate
 * @param {object} [options] { now, boardId, speakingWeight, speakingWeightOf }
 *   - `speakingWeight`: the board's oracy share as a PLAIN NUMBER (0.25, 0.30).
 *     This is the primary, preferred way to pass the board — one value, nothing
 *     to wire, impossible to forget. ExamSetup persists it as
 *     `settings.examSpeakingWeight`; use `resolveSpeakingWeight(settings)` to
 *     read it the same way everywhere.
 *   - `speakingWeightOf`: a `(boardId) => number|null` lookup, for a caller that
 *     already holds the board registry. Legacy/compat; prefer `speakingWeight`.
 * @returns {{days:number, band:string, speakWeight:number, note:string}|null}
 */
export function examCountdown(examDate, {
  now = Date.now(), boardId = null, speakingWeight = null, speakingWeightOf,
} = {}) {
  if (!examDate) return null;
  const at = examDate instanceof Date ? examDate.getTime() : Date.parse(examDate);
  if (!Number.isFinite(at)) return null;
  const days = Math.floor((at - Number(now)) / 86_400_000);
  // A paper in the past is not a countdown; it is history.
  if (days < 0) return null;

  let band;
  let speakWeight;
  let note;
  if (days <= 21) {
    band = 'final-weeks';
    speakWeight = 1.8;
    note = 'Three weeks or less: speaking and timed practice lead.';
  } else if (days <= 70) {
    band = 'building';
    speakWeight = 1.35;
    note = 'A couple of months out: steady exam-style speaking alongside repair.';
  } else {
    band = 'early';
    speakWeight = 1;
    note = 'Plenty of time: build the foundations the exam will test.';
  }

  // Board oracy weight: scale the band's base weight by how much of THIS paper
  // is spoken, normalised against the GCSE baseline so 0.25 is neutral and only
  // an oracy-heavier paper (e.g. A-level 0.30) lifts the weight. Bounded so a
  // stray data value can never blow the segment up; unknown/missing weight is a
  // no-op. A neutral board therefore returns the exact prior number.
  //
  // The weight arrives as a PLAIN number (`speakingWeight`, preferred — see
  // resolveSpeakingWeight) or, for a caller holding the board registry, a
  // `speakingWeightOf` lookup. A plain number needs no import, so the ~25 KB
  // registry never enters Today's load graph; an absent value reads as "no
  // board" and invents no urgency.
  const directWeight = Number(speakingWeight);
  const boardWeight = Number.isFinite(directWeight) && directWeight > 0
    ? directWeight
    : (typeof speakingWeightOf === 'function' ? speakingWeightOf(boardId) : null);
  if (Number.isFinite(boardWeight) && boardWeight > 0) {
    const scale = 0.25 / boardWeight; // GCSE 0.25 → 1; 0.30 → ~0.83
    speakWeight = Math.min(2.2, Math.max(1, speakWeight / scale));
  }

  return { days, band, speakWeight, note };
}

/**
 * Read the learner's exam oracy weight from persisted settings, the ONE way.
 *
 * ExamSetup resolves the board's `speakingWeight` where the registry lives and
 * persists it as `settings.examSpeakingWeight` (a plain number), precisely so
 * Today's load path never imports the ~25 KB board registry. Every countdown
 * call site resolves it through here, so a new call site copies one line
 * instead of reinventing the read — the footgun behind the #17/#19 divergence
 * family, where each call site forgot to pass the board and the brief and
 * session disagreed.
 *
 * @param {object|null|undefined} settings the learner's settings object
 * @returns {number|null} the oracy share (0.25, 0.30, …) or null when unset
 */
export function resolveSpeakingWeight(settings) {
  const weight = Number(settings?.examSpeakingWeight);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

export { CRITERION_LABEL };
