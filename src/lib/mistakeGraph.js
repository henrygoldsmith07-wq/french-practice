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
    schemaVersion: 1,
    engineVersion: EVIDENCE_ENGINE_VERSION,
  });
  return list;
}

// ── Evidence model (formal) ────────────────────────────────────────────────
//
// A retest is EVIDENCE toward retirement only when ALL of these hold:
//   1. not immediate (the correction was not just on screen);
//   2. correct;
//   3. spacingQualified — ≥ SPACING_MIN_DAYS (1 day) since the previous
//      piece of retained-knowledge evidence for this node;
//   4. contextNovel — a context was supplied and differs from the previous
//      qualifying evidence's context (first evidence with a context counts
//      as novel).
//
// evidenceClass (stored per retest, for audit):
//   'immediate'            seen-the-answer rehearsal — never evidence
//   'clustered'            correct, but too soon after prior evidence
//   'spaced-same-context'  spaced, correct, context repeated
//   'spaced-new-context'   spaced, correct, new context — the strongest class
//
// RETIREMENT (formal): retire iff
//   mastery >= MASTER_THRESHOLD
//   AND qualifying evidence count >= QUALIFYING_RETESTS (2)
//   AND distinct contexts among qualifying evidence >= 2
//   AND no recurrence after the newest qualifying evidence
//   AND no wrong non-immediate retest after the newest qualifying evidence.
//
// Engine version stamps every mutated node so later rule changes never
// ── Evidence model (formal, engine v3) ─────────────────────────────────────
//
// Contexts are grouped into FAMILIES so 'conversation:market' and
// 'conversation:bistro' are different communicative contexts, while
// 'drill' re-uses stay comparable.
//
// Delay is measured in DAYS since the node's last DELAYED-class evidence —
// or, for a first retest, since the mistake itself (createdAt/lastSeenAt).
// A first non-immediate retest is NOT automatically delayed: a retest two
// hours after the mistake is a SHORT_DELAY, full stop.
//
// Classes (stored per retest as evidenceClass):
//   REHEARSAL            correction was just on screen — never evidence,
//                        never raises mastery
//   SHORT_DELAY          correct, but < DELAYED_MIN_DAYS since the baseline —
//                        weak positive signal, never counts toward retirement
//   DELAYED              correct, >= DELAYED_MIN_DAYS, same context family
//   DELAYED_NEW_CONTEXT  correct, >= DELAYED_MIN_DAYS, new context family —
//                        strongest class
//
// RETIREMENT (formal, conservative): retire iff
//   mastery >= MASTER_THRESHOLD
//   AND delayed successes >= QUALIFYING_RETESTS (2)
//   AND >= 2 distinct context families among those delayed successes
//   AND no recurrence after the newest delayed success
//   AND no wrong retest after the newest delayed success.
//
// Held-out transfer checks ('transfer' family) are MEASUREMENT events:
// they are recorded but excluded from retirement evidence, so transfer
// tasks can never be taught-to-the-test into retirement.
//
// ASR-uncertain observations never LOWER language mastery by themselves.
//
// Every mutated node is stamped with engineVersion so later rule changes
// never silently reinterpret historical learning.
export const EVIDENCE_ENGINE_VERSION = 3;
export const DELAYED_MIN_DAYS = 1;
export const DELAYED_MIN_HOURS = 20; // crossing the day boundary counts early
export const QUALIFYING_RETESTS = 2;
const RETEST_HISTORY_CAP = 12;
const MASTER_THRESHOLD = 80;

// Context strings map to families: conversation contexts are per-scenario,
// practice surfaces have fixed families, 'transfer' is measurement-only.
export function contextFamily(context) {
  const c = String(context || '');
  if (!c) return null;
  if (c === 'transfer' || c.startsWith('transfer:')) return 'transfer';
  if (c === 'srs-recall' || c.startsWith('srs')) return 'srs';
  if (c === 'targeted-drill' || c === 'drill') return 'drill';
  if (c === 'delayed-review' || c === 'review') return 'review';
  if (c.startsWith('conversation')) return 'conversation';
  return 'other';
}
const MEASUREMENT_FAMILIES = new Set(['transfer']);

function classifyRetest({ correct, immediate, delayDays, contextFamily: fam, priorDelayedFamilies }) {
  if (immediate) return 'REHEARSAL';
  if (!correct) return 'REHEARSAL'; // wrong answers are never evidence
  const delayed = delayDays >= DELAYED_MIN_DAYS || (delayDays >= DELAYED_MIN_HOURS / 24 && fam !== null && !priorDelayedFamilies.includes(fam));
  if (!delayed) return 'SHORT_DELAY';
  if (MEASUREMENT_FAMILIES.has(fam)) return 'MEASUREMENT';
  return priorDelayedFamilies.includes(fam) ? 'DELAYED' : 'DELAYED_NEW_CONTEXT';
}

/**
 * Record a retest outcome, classify it as evidence, update mastery.
 * immediate = the correction was just on screen (same session).
 */
export function recordRetest(graph, { id, at, correct, context = null, immediate = false }) {
  const m = (Array.isArray(graph) ? graph : []).find((x) => x.id === id);
  if (!m) return graph;
  const now = at || new Date().toISOString();
  const nowMs = Date.parse(now);
  m.engineVersion = EVIDENCE_ENGINE_VERSION;

  const fam = contextFamily(context);
  const priorDelayed = (m.retests || []).filter(
    (r) => r.evidenceClass === 'DELAYED' || r.evidenceClass === 'DELAYED_NEW_CONTEXT'
  );
  const lastDelayed = priorDelayed[priorDelayed.length - 1] || null;
  // Baseline for a FIRST retest is the mistake itself (spec: a first
  // non-immediate retest must earn its delay, not inherit it).
  const baselineMs = Math.max(
    Date.parse(m.createdAt || 0),
    Date.parse(m.lastSeenAt || 0),
    lastDelayed ? Date.parse(lastDelayed.at) : 0
  );
  const delayMs = Math.max(0, nowMs - baselineMs);
  const delayDays = Math.round((delayMs / 86400000) * 100) / 100;
  const delayHours = Math.round((delayMs / 3600000) * 10) / 10;
  const priorDelayedFamilies = priorDelayed.map((r) => r.contextFamily).filter(Boolean);
  const contextNovel = Boolean(fam) && (!lastDelayed || lastDelayed.contextFamily !== fam);
  const evidenceClass = classifyRetest({
    correct: Boolean(correct),
    immediate: Boolean(immediate),
    delayDays,
    contextFamily: fam,
    priorDelayedFamilies,
  });

  m.lastRetestAt = now;
  m.retests = [...(m.retests || []), {
    at: now,
    correct: Boolean(correct),
    context,
    contextFamily: fam,
    immediate: Boolean(immediate),
    delayDays,
    delayHours,
    spacingQualified: evidenceClass.startsWith('DELAYED'),
    contextNovel,
    evidenceClass,
  }].slice(-RETEST_HISTORY_CAP);

  // ASR-uncertain observations never lower language mastery by themselves.
  if (m.asrUncertain && !correct) return graph;

  if (evidenceClass === 'REHEARSAL') {
    m.mastery = clamp(m.mastery + (correct ? 0 : -10));
    return graph;
  }
  if (evidenceClass === 'MEASUREMENT') {
    // Transfer checks measure; they do not teach or retire.
    return graph;
  }
  if (!correct) {
    m.mastery = clamp(m.mastery - 20);
    return graph;
  }
  if (evidenceClass === 'SHORT_DELAY') {
    m.mastery = clamp(m.mastery + 12); // weak signal, never retirement evidence
    return graph;
  }

  // DELAYED / DELAYED_NEW_CONTEXT: genuine delayed evidence.
  const contextNoveltyBonus = evidenceClass === 'DELAYED_NEW_CONTEXT' ? 5 : 0;
  m.mastery = clamp(m.mastery + 30 + contextNoveltyBonus);
  m.lastDelayedAt = now;
  m.delayedSuccesses = priorDelayed.length + 1;
  m.delayedFamilies = [...new Set([...priorDelayedFamilies, fam])];

  // No recurrence or wrong retest after the newest delayed success.
  const recurredAfter = m.lastSeenAt && Date.parse(m.lastSeenAt) > nowMs ? false : Boolean(
    m.lastSeenAt && Date.parse(m.lastSeenAt) > Date.parse(m.lastDelayedAt || 0)
  );
  const wrongAfter = m.retests.some(
    (r) => !r.correct && Date.parse(r.at) > Date.parse(m.lastDelayedAt || 0)
  );
  if (
    m.mastery >= MASTER_THRESHOLD &&
    m.delayedSuccesses >= QUALIFYING_RETESTS &&
    m.delayedFamilies.length >= 2 &&
    !recurredAfter &&
    !wrongAfter
  ) {
    m.status = 'retired';
    m.mastery = 100;
  }
  return graph;
}

function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

export function dueRetests(graph, now = Date.now(), limit = 5) {
  // Accept ms or ISO string — callers pass both.
  const nowMs = Number.isFinite(now) ? now : Date.parse(now);
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
    const elapsed = (nowMs - Date.parse(m.lastRetestAt)) / 86400000;
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

/**
 * P2 retention analytics over GENUINE graph data — empty-safe, never
 * synthesises. Recurrence here = a wrong retest or a fresh occurrence
 * after prior delayed evidence; delay = time since that evidence.
 * Constants like +35/+12/-20 are hypotheses until these curves justify them.
 */
export function mistakeGraphStats(graph, now = Date.now()) {
  const nodes = (Array.isArray(graph) ? graph : []).filter((m) => !m.asrUncertain);
  const n = nodes.length;
  if (!n) return { n: 0, message: 'No mistake-graph data yet — stats populate from genuine use.' };

  const recurrencesByDelay = { '0-1d': [0, 0], '1-3d': [0, 0], '3-7d': [0, 0], '7d+': [0, 0] };
  const bucketOf = (days) => (days < 1 ? '0-1d' : days < 3 ? '1-3d' : days < 7 ? '3-7d' : '7d+');
  const successByType = {};
  const successByContexts = {};

  let delayedRetests = 0;
  for (const m of nodes) {
    const retests = m.retests || [];
    for (let i = 0; i < retests.length; i++) {
      const r = retests[i];
      if (r.immediate || r.evidenceClass === 'REHEARSAL') continue;
      if (!r.evidenceClass.startsWith('DELAYED')) continue;
      delayedRetests += 1;
      // Recurrence = the NEXT non-immediate observation of this node was
      // wrong (or the node re-occurred as a mistake afterwards).
      const next = retests[i + 1];
      const recurred = next ? !next.correct : m.recurrence > (m.retests.filter((x) => x.correct).length ? 1 : 0) && m.status === 'active' && m.mastery < 80;
      const bucket = bucketOf(r.delayDays || 0);
      if (recurrencesByDelay[bucket]) {
        recurrencesByDelay[bucket][0] += recurred ? 1 : 0;
        recurrencesByDelay[bucket][1] += 1;
      }
      successByType[m.type] ||= [0, 0];
      successByType[m.type][0] += r.correct ? 1 : 0;
      successByType[m.type][1] += 1;
      const famCount = new Set(retests.slice(0, i + 1).map((x) => x.contextFamily).filter(Boolean)).size || 1;
      const ctxBucket = famCount >= 3 ? '3+' : String(famCount);
      successByContexts[ctxBucket] ||= [0, 0];
      successByContexts[ctxBucket][0] += r.correct ? 1 : 0;
      successByContexts[ctxBucket][1] += 1;
    }
  }
  const rate = ([ok, total]) => (total >= 5 ? Math.round((ok / total) * 100) : null);
  const toRows = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, { rate: rate(v), n: v[1] }]),
  );
  return {
    n,
    delayedRetests,
    recurrenceByDelay: Object.fromEntries(
      Object.entries(recurrencesByDelay).map(([k, [rec, tot]]) => [k, { rate: tot >= 5 ? Math.round((rec / tot) * 100) : null, n: tot }]),
    ),
    successByType: Object.fromEntries(Object.entries(successByType).map(([k, v]) => [k, { rate: rate(v), n: v[1] }])),
    successByContexts: toRows(successByContexts),
    message: delayedRetests < 5
      ? `Only ${delayedRetests} delayed retests — curves need genuine volume before revising mastery increments.`
      : `${delayedRetests} delayed retests across ${n} mistakes.`,
  };
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
