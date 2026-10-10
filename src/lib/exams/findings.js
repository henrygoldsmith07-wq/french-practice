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

import { TIER } from './boards.js';

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
 * @param {string|Date|null} examDate
 * @param {object} [options] { now }
 * @returns {{days:number, band:string, speakWeight:number, note:string}|null}
 */
export function examCountdown(examDate, { now = Date.now() } = {}) {
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

  return { days, band, speakWeight, note };
}

export { CRITERION_LABEL, TIER };
