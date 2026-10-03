// Speaking transfer — the step that turns a corrected phrase into an ability.
//
// The flagship speaking loop is:
//   conversation → error detection → correction → retry
//   → fresh-context use → delayed retest
//
// This module is the pure half of the last two links. It decides which
// corrections are worth interrupting for (not every stylistic detail), builds
// a fresh-context challenge that demands the SAME structure in a genuinely
// different situation, and reports the outcome so the learning-evidence store
// can schedule the delayed retest.
//
// Evidence honesty: a fresh-context success is recorded as `phase: 'transfer'`
// only when the prompt really is novel (the checker verifies the context
// differs from the original), and independence is claimed only when the
// learner produced it without a hint or retry.

export const CORRECTION_PRIORITY = Object.freeze({
  meaning: 5,
  grammar: 4,
  vocabulary: 3,
  intelligibility: 2,
  recurring: 3,
  frequency: 2,
  style: 0,
});

// Meaning-affecting categories always beat style; these tags come from the
// evaluator's correction levels and topic metadata.
// A note that explicitly describes a stylistic preference is style, full
// stop — checked first so "a more elegant word choice" never interrupts the
// conversation just because the sentence's words changed.
const STYLE_PATTERNS = [
  /\b(elegant|warmer tone|tone could|tone would|stylistic|smoother|flow better|polish|more natural|sunnier|friendlier)\b/i,
];

const MEANING_PATTERNS = [
  { re: /\b(negat|ne\b|pas\b|no longer|not\b)/i, kind: 'meaning' },
  { re: /\b(tense|past|present|future|imparfait|pass[ée]|conditional|subjonctif|futur)/i, kind: 'grammar' },
  { re: /\b(pronoun|subject|object|agreement|accord|gender|number|plural)/i, kind: 'grammar' },
  { re: /\b(vocab(?:ulary)?|wrong word|not the right word|false friend|lexic)/i, kind: 'vocabulary' },
  { re: /\b(pronunc|accent|liaison|intonation|stress|heard|misunderst)/i, kind: 'intelligibility' },
];

/**
 * Classify a correction's impact: meaning, grammar, vocabulary,
 * intelligibility or style. Conservative — unknown shapes read as style so
 * the coach stays quiet rather than nagging.
 */
export function correctionImpact(correction = {}) {
  const text = `${correction.topic || ''} ${correction.why || ''} ${correction.type || ''}`.toLowerCase();
  if (STYLE_PATTERNS.some((re) => re.test(text))) return 'style';
  for (const { re, kind } of MEANING_PATTERNS) {
    if (re.test(text)) return kind;
  }
  const original = String(correction.original || '');
  const fixed = String(correction.correction || '');
  if (!original || !fixed) return 'style';
  // A change of negation is meaning-level even without a topic label.
  if (/\bpas\b|ne\s/.test(original) !== /\bpas\b|ne\s/.test(fixed)) return 'meaning';
  // Same words in a different order is a word-order fix — grammar, not style —
  // except when the reordered words are negation, where the placement carries
  // the meaning ("je ne pas comprends" is simply wrong).
  if (sameTokensDifferentOrder(original, fixed)) {
    return /\bpas\b|\bne\b/.test(original) ? 'meaning' : 'grammar';
  }
  // A one-word swap with no explanatory note is the weakest of signals: only
  // treat it as vocabulary when the note itself is absent AND the words are
  // real words (not placeholders like "x" → "y").
  if (contentWordChanged(original, fixed)) return 'vocabulary';
  return 'style';
}

const FUNCTION_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'à', 'ce', 'cette', 'ces',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'y', 'en',
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'ne', 'pas', 'pour', 'par',
  'dans', 'sur', 'avec', 'sans', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
]);

function tokens(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function sameTokensDifferentOrder(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (A.length !== B.length || A.join(' ') === B.join(' ')) return false;
  return [...A].sort().join(' ') === [...B].sort().join(' ');
}

function contentWordChanged(a, b) {
  const A = new Set(tokens(a).filter((w) => !FUNCTION_WORDS.has(w)));
  const B = new Set(tokens(b).filter((w) => !FUNCTION_WORDS.has(w)));
  let changed = 0;
  for (const w of B) if (!A.has(w)) changed += 1;
  for (const w of A) if (!B.has(w)) changed += 1;
  return changed >= 1 && changed <= 4;
}

/**
 * Should the coach surface this correction NOW, mid-conversation? The product
 * rule: correct what affects meaning, grammar, vocabulary choice,
 * intelligibility, recurring patterns and high-frequency language — let
 * stylistic detail go.
 */
export function shouldCorrectNow(correction = {}) {
  // A recurring slip is worth surfacing whatever its category — the same form
  // tripping the learner twice is exactly what the coach exists to fix.
  if (Number(correction.recurrences) > 1) return true;
  const impact = correctionImpact(correction);
  if (impact === 'style') return false;
  if (correction.level === 'acceptable_alternative' || correction.level === 'style') return false;
  return true;
}

/**
 * Build the fresh-context challenge: the same structure, a genuinely
 * different situation. Returns null when no honest challenge can be built
 * (never invent a context unrelated to the correction).
 *
 * @param {{original?: string, correction?: string, why?: string, topic?: string, type?: string}} correction
 * @param {{originalContext?: string|null, contexts?: Array<{id:string,label:string}>, difficulty?: number}} options
 */
export function freshContextChallenge(correction = {}, options = {}) {
  const correction2 = String(correction.correction || '').trim();
  if (!correction2) return null;
  const impact = correctionImpact(correction);
  const contexts = Array.isArray(options.contexts) && options.contexts.length
    ? options.contexts
    : DEFAULT_CONTEXTS;
  const originalContext = options.originalContext || null;
  // Pick the first context that is genuinely different from the one the
  // mistake happened in.
  const context = contexts.find((c) => c.id !== originalContext) || contexts[0];
  const difficulty = Math.max(1, Math.min(3, Number(options.difficulty) || 1));
  return {
    id: `transfer:${hash(correction2 + context.id)}`,
    kind: 'transfer',
    impact,
    contextId: context.id,
    prompt: transferPrompt(impact, correction2, context, difficulty),
    hint: difficulty >= 2 ? null : `Try to work in: «${correction2}»`,
    successCriteria: 'Your sentence uses the repaired form correctly and means what you intend in this new situation.',
    requiresIndependence: difficulty >= 2,
    structure: correction2,
  };
}

const DEFAULT_CONTEXTS = [
  { id: 'everyday', label: 'an everyday chat' },
  { id: 'travel', label: 'a travel situation' },
  { id: 'work', label: 'a work or study moment' },
  { id: 'message', label: 'a message to a friend' },
  { id: 'unexpected', label: 'an unexpected question' },
];

function transferPrompt(impact, structure, context, difficulty) {
  const harder = difficulty >= 3 ? ' Answer naturally, without planning first.' : '';
  switch (impact) {
    case 'meaning':
      return `Now say something for ${context.label} where you have to get the meaning exactly right — use the form you just fixed («${structure}»).${harder}`;
    case 'grammar':
      return `In ${context.label}, build a new sentence that needs the same structure you just repaired («${structure}»). Change the topic entirely.${harder}`;
    case 'vocabulary':
      return `Use the word or phrase you just fixed («${structure}») in a completely different sentence — as if it came up in ${context.label}.${harder}`;
    case 'intelligibility':
      return `Say one clear sentence for ${context.label} containing «${structure}» — aim for being understood, not speed.${harder}`;
    default:
      return `Work «${structure}» into a natural sentence for ${context.label}.${harder}`;
  }
}

/**
 * Score a transfer attempt and decide what it proves. One clean pass is real
 * evidence of transfer but NOT of mastery — the delayed retest is still owed.
 *
 * @param {{correct: boolean, assisted?: boolean, hinted?: boolean, novelContext?: boolean}} attempt
 */
export function evaluateTransfer(attempt = {}) {
  const independent = attempt.correct && !attempt.assisted && !attempt.hinted;
  return {
    phase: 'transfer',
    correct: Boolean(attempt.correct),
    independent,
    // Never claim transfer evidence from a re-answer of the same situation.
    countsAsTransfer: Boolean(attempt.correct && attempt.novelContext !== false),
    nextStep: attempt.correct
      ? (independent
        ? 'delayed-retest'
        : 'retry-independent')
      : 'repair-again',
  };
}

/**
 * The learner-facing line after a transfer attempt. Plain language.
 */
export function transferResultCopy(result = {}) {
  if (!result.countsAsTransfer) {
    return 'Not quite — let’s repair it once more, then try again somewhere new.';
  }
  if (result.independent) {
    return 'Used it on your own in a new situation. We’ll check it again in a day or two to make sure it sticks.';
  }
  return 'Good — you used it in a new situation. Try it once more without the hint so we know it’s yours.';
}

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
