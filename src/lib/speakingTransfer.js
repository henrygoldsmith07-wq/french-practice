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
  // Structured metadata first: the AI contract now classifies each
  // correction's impact (validated in aiValidate.js). Only a well-formed
  // value is trusted; anything else falls through to the heuristics below,
  // which stay as the defensive path for legacy/malformed model output.
  const declared = String(correction.impact || '');
  if (declared === 'meaning' || declared === 'grammar' || declared === 'vocabulary'
    || declared === 'intelligibility' || declared === 'style') {
    return declared;
  }
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
  // The model's LEVEL verdict outranks its impact field: a correction it
  // labels stylistic_suggestion or acceptable_alternative is valid language
  // the model is merely preferring over — that is style whatever impact it
  // claims, and style never interrupts fluent conversation.
  if (correction.level === 'acceptable_alternative' || correction.level === 'stylistic_suggestion'
    || correction.level === 'style') return false;
  const impact = correctionImpact(correction);
  // Style is not a mistake: it never interrupts, however often it repeats.
  // The learner's fluency matters more than polishing phrasing.
  if (impact === 'style') return false;
  // A recurring slip is worth surfacing whatever its category — the same form
  // tripping the learner twice is exactly what the coach exists to fix.
  if (Number(correction.recurrences) > 1) return true;
  // Conservative on uncertainty: the model's own "not sure" never interrupts,
  // and its interruptRecommendation is honoured only when it agrees with the
  // classification — a model asking to interrupt over style is overruled.
  if (correction.level === 'uncertain' && correction.interruptRecommended !== true) return false;
  if (correction.interruptRecommended === false) return false;
  return true;
}

/**
 * The structured target a correction is really about: the underlying ability
 * the transfer step must retest in a NEW sentence, not the corrected phrase
 * itself. Falls back to the textual form when the model supplied no
 * targetSkill/targetForm (legacy output), which the transfer generator
 * degrades honestly rather than pretending phrase reuse is transfer.
 */
export function correctionTarget(correction = {}) {
  const impact = correctionImpact(correction);
  const skill = typeof correction.targetSkill === 'string' && correction.targetSkill.trim()
    ? correction.targetSkill.trim().slice(0, 80)
    : null;
  const form = typeof correction.targetForm === 'string' && correction.targetForm.trim()
    ? correction.targetForm.trim().slice(0, 160)
    : null;
  return {
    impact,
    skill,
    form,
    // What the learner must be able to do again: the rule when we know it,
    // otherwise the corrected wording as a stand-in (a weaker target).
    requirement: form || String(correction.correction || '').trim() || null,
    structured: Boolean(skill || form),
  };
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
  const target = correctionTarget(correction);
  const structure = String(correction.correction || '').trim();
  if (!target.requirement) return null;
  const contexts = Array.isArray(options.contexts) && options.contexts.length
    ? options.contexts
    : DEFAULT_CONTEXTS;
  const originalContext = options.originalContext || null;
  // Pick the first context that is genuinely different from the one the
  // mistake happened in.
  const context = contexts.find((c) => c.id !== originalContext) || contexts[0];
  const difficulty = Math.max(1, Math.min(3, Number(options.difficulty) || 1));
  // Surface features the learner must change: everything except the target.
  // A learner who only memorised the corrected phrase cannot satisfy this —
  // the prompt demands the same rule in a new sentence.
  const framing = FRAMINGS[hash(target.requirement + context.id) % FRAMINGS.length];
  return {
    id: `transfer:${hash(target.requirement + context.id)}`,
    kind: 'transfer',
    impact: target.impact,
    targetSkill: target.skill,
    targetForm: target.form,
    structured: target.structured,
    contextId: context.id,
    prompt: transferPrompt(target, context, difficulty, framing),
    // No hint at higher difficulty: a hint turns the task into phrase copying.
    // At lower difficulty the hint names the RULE — and for a vocabulary
    // target it never contains the phrase itself, because there the phrase
    // IS the answer the learner must retrieve.
    hint: difficulty >= 2
      ? null
      : target.impact === 'vocabulary'
        ? 'Think of the phrase you saved or fixed — say it in your own sentence.'
        : target.form
          ? `Remember the rule: ${target.form}.`
          : `Try to work in: «${structure}»`,
    successCriteria: 'Your sentence uses the repaired form correctly, in your own words and a new situation.',
    requiresIndependence: difficulty >= 2,
    // The corrected wording is kept only as fallback vocabulary for
    // unstructured corrections; the task checks the target, not repetition.
    structure: target.requirement,
    changesRequired: ['subject', 'vocabulary', 'situation', 'framing'],
  };
}

const DEFAULT_CONTEXTS = [
  { id: 'everyday', label: 'an everyday chat' },
  { id: 'travel', label: 'a travel situation' },
  { id: 'work', label: 'a work or study moment' },
  { id: 'message', label: 'a message to a friend' },
  { id: 'unexpected', label: 'an unexpected question' },
];

// Sentence framings the new attempt must NOT reuse from the original attempt:
// these make the surface genuinely different while the target stays fixed.
const FRAMINGS = [
  'a statement about yourself',
  'a question to someone else',
  'a sentence about other people',
  'a sentence about something that already happened',
  'a sentence about what you would do',
  'a sentence explaining something to a friend',
];

function transferPrompt(target, context, difficulty, framing) {
  const harder = difficulty >= 3 ? ' Answer naturally, without planning first.' : '';
  const rule = target.form || target.skill;
  const framingLine = ` Change the subject, the words and the way you frame it — ${framing}.`;
  switch (target.impact) {
    case 'meaning':
      return `In ${context.label}, say something where the meaning only works if you get this right${rule ? ` (keep to: ${rule})` : ''} — but say it in your own words, not the sentence you corrected.${framingLine}${harder}`;
    case 'grammar':
      return `In ${context.label}, build a new sentence that needs the same rule you just repaired${rule ? `: ${rule}` : ''} — about a different subject and a different topic.${framingLine}${harder}`;
    case 'vocabulary':
      return `Use the word or phrase you corrected in ${context.label}, but in a new sentence with a different purpose — not the one you just said.${framingLine}${harder}`;
    case 'intelligibility':
      return `Say one clear sentence for ${context.label} that uses the same sound${rule ? ` (${rule})` : ''} in a different word — aim for being understood.${framingLine}${harder}`;
    default:
      return `In ${context.label}, say something that uses the same rule you repaired${rule ? `: ${rule}` : ''} — in your own words, not the corrected sentence.${framingLine}${harder}`;
  }
}

/**
 * Does a transfer attempt actually exercise the target rather than repeat the
 * corrected phrase? A submission that copies the correction (or the original
 * mistake) near-verbatim is memorisation, not transfer — it must not earn
 * transfer evidence. Returns { transferred, reason }.
 *
 * Three signals, strongest first:
 *   1. normalised identity — catches verbatim copies and punctuation-only
 *      "changes" (punctuation is stripped by normalisation);
 *   2. order-sensitive word-sequence similarity (LCS ratio) — catches synonym
 *      swaps over an unchanged skeleton and a subject swap that leaves the
 *      phrase skeleton identical;
 *   3. verbatim embedding — a substantial corrected sentence with material
 *      bolted on is still that sentence. Skipped for vocabulary targets (the
 *      task requires the word to appear) and for short corrections (a short
 *      phrase reused inside a new sentence is exactly the task).
 *
 * The threshold is deliberately permissive below the near-copy band: a
 * genuinely different sentence, or the same target expressed through a
 * different valid construction, shares few ordered words and passes. A short
 * correction reused in a new sentence ("Le pain est bon" after fixing
 * "le pain") is legitimate French and must pass.
 */
export function assessTransferNovelty(attempt, correction = {}) {
  const said = normaliseWords(String(attempt || ''));
  const corrected = normaliseWords(String(correction.correction || ''));
  const original = normaliseWords(String(correction.original || ''));
  if (!said) return { transferred: false, reason: 'empty' };
  if (!corrected && !original) return { transferred: true, reason: 'no-target' };
  if (corrected && said === corrected) return { transferred: false, reason: 'repeated-correction' };
  if (original && said === original) return { transferred: false, reason: 'repeated-original' };

  const impact = correctionImpact(correction);
  const saidTokens = tokens(said);
  const nearCopy = (referenceTokens, reason) => {
    if (sequenceSimilarity(referenceTokens, saidTokens) >= NEAR_COPY_RATIO) {
      return { transferred: false, reason };
    }
    // Embedding: the attempt IS the reference sentence with something bolted
    // on. Only meaningful for substantial references — and never for a
    // vocabulary target, where the phrase showing up is the task itself.
    if (impact !== 'vocabulary'
      && referenceTokens.length >= MIN_EMBED_TOKENS
      && containsSequence(saidTokens, referenceTokens)) {
      return { transferred: false, reason };
    }
    return null;
  };

  if (corrected) {
    const hit = nearCopy(tokens(corrected), 'repeated-correction');
    if (hit) return hit;
  }
  if (original) {
    const hit = nearCopy(tokens(original), 'repeated-original');
    if (hit) return hit;
  }
  return { transferred: true, reason: 'novel' };
}

// Order-sensitive similarity: longest common subsequence over the max length.
// Synonym swaps keep nearly every surrounding token in order and score high;
// a genuinely new sentence shares only stray function words.
const NEAR_COPY_RATIO = 0.55;
// Embedding only counts as repetition for references long enough that a
// learner following "say it differently" would have restructured them.
const MIN_EMBED_TOKENS = 4;

function sequenceSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length] / Math.max(a.length, b.length);
}

function containsSequence(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

// NOTE: the module's word tokenizer above (`tokens`) is reused by the novelty
// checks — it accepts raw or normalised text, so there is one tokenizer here.

function normaliseWords(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Score a transfer attempt and decide what it proves. One clean pass is real
 * evidence of transfer but NOT of mastery — the delayed retest is still owed.
 *
 * Transfer evidence counts only when:
 *   · the context is genuinely novel,
 *   · the answer was independent (no hint, no assistance),
 *   · the underlying target was required (not phrase repetition),
 *   · the task was not effectively a repetition of the correction.
 *
 * @param {{correct: boolean, assisted?: boolean, hinted?: boolean,
 *          novelContext?: boolean, attemptText?: string,
 *          correction?: object}} attempt
 */
export function evaluateTransfer(attempt = {}) {
  const independent = attempt.correct && !attempt.assisted && !attempt.hinted;
  // Phrase memorisation is not transfer: copying the corrected sentence (or
  // the original mistake) into the new slot reuses memory, not the skill.
  const novelty = assessTransferNovelty(attempt.attemptText ?? '', attempt.correction || {});
  const repeated = novelty.transferred === false && novelty.reason !== 'empty' && novelty.reason !== 'no-target';
  return {
    phase: 'transfer',
    correct: Boolean(attempt.correct),
    independent,
    novelty: novelty.reason,
    // Never claim transfer evidence from a re-answer of the same situation
    // or a verbatim repeat of the correction itself.
    countsAsTransfer: Boolean(attempt.correct && attempt.novelContext !== false && !repeated),
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
    // Phrase reuse is not the same as a wrong answer: say which it is so the
    // learner knows whether to rephrase or to repair.
    if (result.novelty === 'repeated-correction' || result.novelty === 'repeated-original') {
      return 'That’s the same sentence we just corrected — say it in your own words instead. New subject, new situation.';
    }
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
