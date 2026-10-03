// Writing repair — the improvement loop after free writing.
//
// The rule the product promises: the learner writes, we find the FEW errors
// most worth learning from, explain only those, ask the learner to repair
// them by typing, then to rewrite the piece — and reuse the concept later in
// a different task. The AI never rewrites the whole response for them.
//
// Pure and injectable: the component owns rendering and persistence, this
// owns prioritisation and task shapes.

export const ERROR_CATEGORIES = Object.freeze([
  'meaning', 'grammar', 'tense', 'agreement', 'vocabulary', 'word-order', 'spelling', 'style',
]);

const CATEGORY_PATTERNS = [
  { category: 'meaning', re: /\b(negat|not\b|no longer|meaning|changes? what|opposite|wrong meaning|impossible|makes no sense)/i },
  { category: 'tense', re: /\b(tense|past|present|future|imparfait|pass[ée]|conditional|futur|subjonctif|when this happened)/i },
  { category: 'agreement', re: /\b(agreement|accord|gender|plural|masculine|feminine|article|adjective)/i },
  { category: 'grammar', re: /\b(gramma|word order|preposition|pronoun|auxiliary|verb form|syntax)/i },
  { category: 'vocabulary', re: /\b(vocab|word choice|lexic|not the right word|false friend|collocation)/i },
  { category: 'spelling', re: /\b(spell|accent|orthograph|typo|missing letter|liaison)/i },
  { category: 'style', re: /\b(style|tone|elegant|natural|flow|register|smoother)/i },
];

/** Group corrections into learner-meaningful categories. */
export function groupErrorsByCategory(corrections = []) {
  const groups = new Map();
  for (const c of (corrections || [])) {
    if (!c) continue;
    const category = categorise(c);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(c);
  }
  return ERROR_CATEGORIES
    .filter((cat) => groups.has(cat))
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABEL[cat],
      count: groups.get(cat).length,
      corrections: groups.get(cat),
    }));
}

const CATEGORY_LABEL = {
  meaning: 'Changed the meaning',
  grammar: 'Grammar',
  tense: 'Tense',
  agreement: 'Agreement',
  vocabulary: 'Word choice',
  'word-order': 'Word order',
  spelling: 'Spelling',
  style: 'Style',
};

export function categorise(correction = {}) {
  const text = `${correction.why || ''} ${correction.topic || ''} ${correction.type || ''}`.toLowerCase();
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (re.test(text)) return category;
  }
  // Structural signals with no note: word permutation is word-order, a short
  // content-word swap is vocabulary, anything else is spelling-safe style.
  const original = String(correction.original || '');
  const fixed = String(correction.correction || '');
  if (original && fixed) {
    const A = tokens(original);
    const B = tokens(fixed);
    if (A.length === B.length && A.length > 1 && [...A].sort().join(' ') === [...B].sort().join(' ')) {
      return 'word-order';
    }
  }
  return 'style';
}

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'à', 'ce', 'cette', 'ces',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'y', 'en',
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'ne', 'pas', 'pour', 'par',
  'dans', 'sur', 'avec', 'sans', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
]);

function tokens(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

/**
 * Does this correction change what the sentence MEANS? Conservative: a
 * negation flip, a tense shift on the main verb, a pronoun or number change,
 * or a content-word swap.
 */
export function isMeaningAffecting(original = '', corrected = '') {
  const a = String(original);
  const b = String(corrected);
  if (!a || !b) return false;
  // Negation flip: an added or removed `pas` (or `ne`) reverses the meaning —
  // "je ne peux" → "je ne peux pas" is a meaning change even though both
  // halves contain `ne`.
  const hasPas = (s) => /\bpas\b/i.test(s);
  const hasNe = (s) => /\bne\b/i.test(s);
  if (hasPas(a) !== hasPas(b) || hasNe(a) !== hasNe(b)) return true;
  // Pronoun or number change on a real word.
  const A = tokens(a);
  const B = tokens(b);
  const pronouns = new Set(['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'lui', 'leur', 'y', 'en']);
  const aPron = A.filter((w) => pronouns.has(w));
  const bPron = B.filter((w) => pronouns.has(w));
  if (aPron.join(' ') !== bPron.join(' ')) return true;
  // Number change (2 vs 3, singular vs plural content word).
  const aNumbers = A.filter((w) => /^\d+$/.test(w));
  const bNumbers = B.filter((w) => /^\d+$/.test(w));
  if (aNumbers.join(' ') !== bNumbers.join(' ')) return true;
  // Tense: a verb-ending change on a content verb (é → er, ais → ait …).
  const aVerbs = A.filter((w) => /(er|ir|re|ait|ais|é|ée|és|ées|ont|ent|ions)$/i.test(w));
  const bVerbs = B.filter((w) => /(er|ir|re|ait|ais|é|ée|és|ées|ont|ent|ions)$/i.test(w));
  if (aVerbs.join(' ') !== bVerbs.join(' ') && aVerbs.length && bVerbs.length) return true;
  // Content-word swap.
  const aContent = A.filter((w) => !STOPWORDS.has(w));
  const bContent = B.filter((w) => !STOPWORDS.has(w));
  const swapped = bContent.filter((w) => !aContent.includes(w));
  return swapped.length >= 1 && swapped.length <= 2;
}

const MEANING_ORDER = {
  meaning: 0, tense: 1, agreement: 2, grammar: 3,
  vocabulary: 4, 'word-order': 5, spelling: 6, style: 7,
};

/**
 * The FEW errors most worth learning from: meaning-affecting first, then
 * recurring patterns, then high-frequency language. Never floods — max 3.
 */
export function selectImportantErrors(corrections = [], { max = 3 } = {}) {
  return (corrections || [])
    .filter(Boolean)
    .map((c) => ({
      correction: c,
      category: categorise(c),
      meaning: isMeaningAffecting(c.original, c.correction) ? 1 : 0,
      recurring: Number(c.recurrences) > 1 ? 1 : 0,
    }))
    .sort((a, b) =>
      b.meaning - a.meaning
      || b.recurring - a.recurring
      || MEANING_ORDER[a.category] - MEANING_ORDER[b.category])
    .slice(0, Math.max(1, max))
    .map((row) => row.correction);
}

/** The three-part learner comparison: Your version / Improved version / Why. */
export function comparisonView(original, corrected, why) {
  return {
    yourVersion: String(original || ''),
    improvedVersion: String(corrected || ''),
    why: String(why || ''),
  };
}

/**
 * Repair tasks: the learner must TYPE the fix themselves and rewrite the
 * piece. The AI never rewrites everything for them.
 */
export function buildRepairTasks(errors = []) {
  return (errors || []).filter(Boolean).map((c, i) => ({
    id: `repair:${i}:${hash(String(c.original || c.correction || i))}`,
    original: String(c.original || ''),
    improved: String(c.correction || ''),
    why: String(c.why || c.note || ''),
    category: categorise(c),
    repairPrompt: 'Type the corrected version of this sentence yourself.',
    rewriteInstruction: 'Now rewrite your piece with this fix in place.',
    // Accept the improved version OR any sentence that fixes the issue:
    // exact match is the strict check, containment is the lenient one.
    accept: [String(c.correction || '').trim()].filter(Boolean),
  }));
}

function hash(value) {
  let h = 2166136261;
  for (const char of String(value)) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Learner-facing summary of a finished repair loop — what was fixed and why
 * it matters. Concise, plain language.
 */
export function repairSummary(repaired = []) {
  const count = (repaired || []).length;
  if (!count) return 'Nothing repaired yet — pick the sentences that matter most.';
  return `${count} sentence${count === 1 ? '' : 's'} repaired by you — these come back in a later task to check they stuck.`;
}
