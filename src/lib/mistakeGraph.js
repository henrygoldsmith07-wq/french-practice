// Mistake graph — a mistake from a real interaction never disappears; it
// becomes a node with a mastery lifecycle until it earns retirement.
//
// Node shape (structural, per product spec):
//   concept     what the mistake is about (grammar topic / phoneme / word)
//   type        grammar | vocabulary | tense | agreement | word-order |
//               pronunciation | comprehension | fluency
//   source      where it surfaced (conversation, dictation, quiz, ...)
//   attempt     the learner's exact words, where appropriate
//   corrected   the target form
//   confidence  0..1 — AI marking calibration or ASR certainty. Low
//               confidence mistakes are kept but NEVER force a category
//               or drive mastery down on their own.
//   asrUncertain true when speech recognition, not language, likely failed.
//   createdAt / lastSeenAt / lastRetestAt / recurrence
//   retests[]   { at, correct, context, immediate } — capped history
//   mastery     0..100
//   status      'active' | 'retired'
//
// MASTERY RULES (deliberately strict):
//   - A correct retry immediately after seeing the correction proves
//     nothing: mastery does not rise on `immediate` retests.
//   - A correct retest in a NEW context (different day, different task)
//     raises mastery. Retirement requires mastery >= 80 across >= 2 such
//     context-separated successes.
//   - A wrong retest drops mastery; a fresh occurrence of a retired
//     mistake reactivates it at half mastery — recurrence is the strongest
//     evidence a previous retirement was premature.

export const MISTAKE_TYPES = [
  'grammar', 'vocabulary', 'tense', 'agreement', 'word-order',
  'pronunciation', 'comprehension', 'fluency',
];

const RETEST_HISTORY_CAP = 12;
const MASTER_THRESHOLD = 80;
const CLEAN_CONTEXT_RETESTS = 2;

export function mistakeId({ type, concept }) {
  let h = 0;
  const seed = `${type}|${concept}`;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `mg-${Math.abs(h).toString(36)}`;
}

/** Map an error-taxonomy category to a mistake type. */
export function typeForCategory(category) {
  const map = {
    tense: 'tense',
    agreement: 'agreement',
    'word-order': 'word-order',
    pronouns: 'grammar',
    preposition: 'grammar',
    negation: 'grammar',
    mood: 'grammar',
    articles: 'grammar',
    liaison: 'pronunciation',
    register: 'fluency',
    vocab: 'vocabulary',
    spelling: 'grammar',
  };
  return map[category] || 'grammar';
}

/**
 * Record (or merge) a mistake. Returns the updated graph.
 * @param {Array} graph
 * @param {{type, concept, source?, attempt?, corrected?, confidence?,
 *          asrUncertain?, related?: Array, at?}} entry
 */
export function recordMistake(graph, entry) {
  const list = Array.isArray(graph) ? graph : [];
  const type = MISTAKE_TYPES.includes(entry.type) ? entry.type : 'grammar';
  const concept = String(entry.concept || 'unknown');
  // Low-confidence mistakes keep their attempt text but must not masquerade
  // as a precise category.
  const confidence = Number.isFinite(Number(entry.confidence))
    ? Math.max(0, Math.min(1, Number(entry.confidence)))
    : 0.5;
  const id = mistakeId({ type, concept });
  const at = entry.at || new Date().toISOString();
  const existing = list.find((m) => m.id === id);
  if (existing) {
    existing.recurrence += 1;
    existing.lastSeenAt = at;
    if (entry.corrected) existing.corrected = entry.corrected;
    if (Number.isFinite(entry.confidence)) existing.confidence = confidence;
    if (existing.status === 'retired') {
      existing.status = 'active';
      existing.mastery = Math.min(existing.mastery, 50);
    }
    return list;
  }
  list.push({
    id,
    type,
    concept,
    source: entry.source || 'conversation',
    attempt: entry.attempt || null,
    corrected: entry.corrected || null,
    confidence,
    asrUncertain: Boolean(entry.asrUncertain),
    related: Array.isArray(entry.related) ? entry.related.slice(0, 6) : [],
    createdAt: at,
    lastSeenAt: at,
    lastRetestAt: null,
    recurrence: 1,
    retests: [],
    mastery: 10,
    status: 'active',
  });
  return list;
}

/**
 * Record a retest outcome and update mastery.
 * `immediate` = the learner saw the correction moments ago (same session).
 */
export function recordRetest(graph, { id, at, correct, context = null, immediate = false }) {
  const m = (Array.isArray(graph) ? graph : []).find((x) => x.id === id);
  if (!m) return graph;
  const now = at || new Date().toISOString();
  m.lastRetestAt = now;
  m.retests.push({ at: now, correct: Boolean(correct), context, immediate });
  m.retests = m.retests.slice(-RETEST_HISTORY_CAP);

  if (immediate) {
    // Seen-the-answer retries are rehearsal, not evidence of learning.
    m.mastery = clamp(m.mastery + (correct ? 0 : -10));
    return graph;
  }

  // Context-separated retest: how far apart was it from the previous one?
  const prev = [...m.retests].reverse().find((r) => !r.immediate && r.at !== now);
  let separated = true;
  if (prev?.at) {
    const gapDays = (Date.parse(now) - Date.parse(prev.at)) / 86400000;
    separated = gapDays >= 0.5; // hours later still counts as same-session-ish
  }
  const differentContext = context != null && m.retests.some(
    (r) => !r.immediate && r.context !== null && r.context !== context
  );

  if (correct) {
    m.mastery = clamp(m.mastery + (separated ? 35 : 12));
    if (differentContext && separated) m.mastery = clamp(m.mastery + 5);
  } else {
    m.mastery = clamp(m.mastery - 20);
  }
  m.lastRetestContext = context;

  const cleanSeparated = m.retests.filter(
    (r) => !r.immediate && r.correct && r.at
  ).length;
  if (m.mastery >= MASTER_THRESHOLD && cleanSeparated >= CLEAN_CONTEXT_RETESTS) {
    m.status = 'retired';
    m.mastery = 100;
  }
  return graph;
}

function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

/**
 * Retests due now, most urgent first. Spacing widens with mastery
 * (roughly: same-day follow-up, then 1d, then 2d, then 4d+).
 */
export function dueRetests(graph, now = Date.now(), limit = 5) {
  const active = (Array.isArray(graph) ? graph : []).filter(
    (m) => m.status === 'active' && !m.asrUncertain
  );
  const due = [];
  for (const m of active) {
    if (!m.lastRetestAt) {
      due.push({ ...m, overdueBy: m.recurrence }); // never retested: urgent
      continue;
    }
    const stepsSince = Math.max(0, Math.floor(m.mastery / 30));
    const waitDays = [1, 1, 2, 2, 4][Math.min(4, stepsSince)];
    const elapsed = (now - Date.parse(m.lastRetestAt)) / 86400000;
    if (elapsed >= waitDays) due.push({ ...m, overdueBy: elapsed / waitDays });
  }
  return due
    .sort((a, b) => (b.overdueBy ?? 0) - (a.overdueBy ?? 0) || b.recurrence - a.recurrence)
    .slice(0, limit);
}

/** Active mistakes weakest-first (mastery asc, recurrence desc). */
export function weakestMistakes(graph, limit = 3) {
  return (Array.isArray(graph) ? graph : [])
    .filter((m) => m.status === 'active' && !m.asrUncertain)
    .sort((a, b) => a.mastery - b.mastery || b.recurrence - a.recurrence)
    .slice(0, limit);
}

/** Heuristic: did recognition, rather than language, likely fail? */
export function isAsrUncertain({ heardWords = 0, targetWords = 0, voicedRatio = null } = {}) {
  if (heardWords === 0) return true; // nothing came back at all
  const acc = targetWords > 0 ? heardWords / targetWords : 0;
  // Audio clearly contained speech yet almost nothing was recognised — the
  // recogniser struggled; do not treat the difference as a language miss.
  if (acc < 0.25 && (voicedRatio == null || voicedRatio > 0.5)) return true;
  return false;
}
