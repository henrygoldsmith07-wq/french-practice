// Strict structural validation of AI structured outputs.
//
// The model contract says "reply with ONLY a JSON object in this shape", but
// models drift: they omit scores, return empty replies, or wrap corrections
// wrongly. Silently coercing garbage to zeros/empty strings renders a blank
// partner turn that looks like an app bug. This module is the runtime
// authority: groq.js calls it before normalising, and a failure becomes a
// friendly, retryable error instead of a silent blank.
//
// Deliberately tolerant where tolerance is safe (a missing sub-score can fall
// back to `overall`), strict where it is not (an empty reply or a missing
// overall score means the turn is unusable).
//
// TypeScript consumers: see schemas.ts for the typed contract.

export const CORRECTION_LEVELS = Object.freeze([
  'definite_error',
  'likely_error',
  'stylistic_suggestion',
  'acceptable_alternative',
  'uncertain',
]);

// Structured correction metadata: the model is asked to classify each
// correction, and this module validates what it claims. Values outside the
// contract are dropped (never trusted blindly), leaving the textual
// heuristics in speakingTransfer.js to classify defensively.
export const CORRECTION_IMPACTS = Object.freeze([
  'meaning', 'grammar', 'vocabulary', 'intelligibility', 'style',
]);

// Which impacts may interrupt fluent conversation. Style never does;
// uncertain classifications are treated conservatively (no interrupt).
export const INTERRUPTING_IMPACTS = Object.freeze(['meaning', 'grammar', 'vocabulary', 'intelligibility']);

const isStr = (v) => typeof v === 'string';
const finite01to100 = (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;

/**
 * Validate a conversation-turn evaluation payload.
 * Returns { ok, error?, scores? } — on ok, `scores` carries the coerced
 * 0–100 integers (missing sub-scores fall back to `overall`).
 */
export function validateTurnEvaluation(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, error: 'payload is not an object' };
  }
  if (!isStr(json.reply) || !json.reply.trim()) {
    return { ok: false, error: 'reply is empty or missing' };
  }
  if (!isStr(json.corrections)) {
    return { ok: false, error: 'corrections is missing' };
  }
  const scores = json.scores && typeof json.scores === 'object' ? json.scores : null;
  if (!scores || !finite01to100(scores.overall)) {
    return { ok: false, error: 'scores.overall is missing or out of range' };
  }
  const coerced = { overall: Math.round(Number(scores.overall)) };
  for (const k of ['grammar', 'naturalness', 'relevance', 'fluency']) {
    coerced[k] = finite01to100(scores[k]) ? Math.round(Number(scores[k])) : coerced.overall;
  }
  return { ok: true, scores: coerced };
}

/**
 * Validate a writing-feedback payload. Corrections/strengths/suggestions must
 * exist; at least one score must be a usable 0–100 number (missing ones fall
 * back to the first valid score, then 50).
 */
export function validateWritingFeedback(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, error: 'payload is not an object' };
  }
  if (!isStr(json.corrections)) {
    return { ok: false, error: 'corrections is missing' };
  }
  if (!Array.isArray(json.strengths) || !Array.isArray(json.suggestions)) {
    return { ok: false, error: 'strengths/suggestions missing' };
  }
  const scores = json.scores && typeof json.scores === 'object' ? json.scores : {};
  const valid = Object.values(scores).filter(finite01to100);
  if (!valid.length) {
    return { ok: false, error: 'no usable scores returned' };
  }
  const fallback = Math.round(Number(valid[0]));
  const coerced = {};
  for (const [k, v] of Object.entries(scores)) {
    coerced[k] = finite01to100(v) ? Math.round(Number(v)) : fallback;
  }
  return { ok: true, scores: coerced };
}

/**
 * Normalise a corrections_detailed array: keep well-formed entries, map bad
 * levels to 'uncertain', cap length. Never throws.
 *
 * Carries the structured correction contract when the model provides it:
 *   { impact, targetSkill, targetForm, severity, confidence,
 *     interruptRecommended }
 * Every value is validated here — an out-of-contract value is dropped, not
 * coerced to something plausible. Absent fields stay absent so the heuristics
 * in speakingTransfer.js remain the defensive fallback.
 */
export function normalizeCorrectionsDetailed(list, cap = 6) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && isStr(c.original) && isStr(c.correction) && c.original.trim() && c.correction.trim())
    .slice(0, cap)
    .map((c) => {
      const out = {
        original: c.original.slice(0, 200),
        correction: c.correction.slice(0, 200),
        level: CORRECTION_LEVELS.includes(c.level) ? c.level : 'uncertain',
        note: isStr(c.note) ? c.note.slice(0, 300) : '',
      };
      // Structured metadata, only when well-formed.
      if (isStr(c.impact) && CORRECTION_IMPACTS.includes(c.impact)) out.impact = c.impact;
      if (isStr(c.targetSkill) && c.targetSkill.trim()) out.targetSkill = c.targetSkill.trim().slice(0, 80);
      if (isStr(c.targetForm) && c.targetForm.trim()) out.targetForm = c.targetForm.trim().slice(0, 160);
      if (isStr(c.explanation) && c.explanation.trim()) out.explanation = c.explanation.trim().slice(0, 300);
      if (Number.isFinite(Number(c.severity)) && Number(c.severity) >= 1 && Number(c.severity) <= 5) {
        out.severity = Math.round(Number(c.severity));
      }
      if (Number.isFinite(Number(c.confidence)) && Number(c.confidence) >= 0 && Number(c.confidence) <= 1) {
        out.confidence = Math.round(Number(c.confidence) * 100) / 100;
      }
      if (typeof c.interruptRecommended === 'boolean') out.interruptRecommended = c.interruptRecommended;
      return out;
    });
}
