// Learner capability model — "what can this learner actually DO with the
// language?", derived from real performance, never from XP or ticked boxes.
//
// Pure and injectable. Inputs are the shapes the app already persists:
// learner-error entries (per skill/key with mistakes, modes, independence),
// learning-evidence cycles (transfer/delayed proof), sessions (speaking
// reports), metrics (pronunciation scores) and FSRS state (vocabulary).
//
// Output is a list of learner-friendly capability statements, each in one of
// three honest states:
//   demonstrated     — seen used independently, in more than one situation
//   developing       — some real performance, not reliable yet
//   insufficient     — not enough attempts yet ("keep practising" copy)
//
// A capability never claims more than the evidence supports.

export const CAPABILITY_STATE = Object.freeze({
  DEMONSTRATED: 'demonstrated',
  DEVELOPING: 'developing',
  INSUFFICIENT: 'insufficient',
});

const CAPABILITY_DEFS = [
  {
    id: 'personal-questions',
    statement: 'answer simple personal questions',
    category: 'speaking',
    needs: { errors: (e) => e.category === 'speaking', minSessions: 2 },
  },
  {
    id: 'past-narration',
    statement: 'describe what you did last weekend',
    category: 'speaking',
    keys: ['past', 'passe', 'imparfait', 'narration', 'narrative'],
  },
  {
    id: 'opinion',
    statement: 'give simple opinions with reasons',
    category: 'speaking',
    keys: ['opinion', 'justif', 'reason', 'because', 'parce que'],
  },
  {
    id: 'compare',
    statement: 'compare two options',
    category: 'speaking',
    keys: ['compar', 'plutôt que', 'than'],
  },
  {
    id: 'explain-problem',
    statement: 'explain a problem and ask for help',
    category: 'speaking',
    keys: ['problem', 'problème', 'help', 'aide'],
  },
  {
    id: 'unexpected',
    statement: 'respond to unexpected questions',
    category: 'speaking',
    keys: ['unexpected', 'curveball', 'improvis'],
  },
  {
    id: 'sustain',
    statement: 'keep a conversation going',
    category: 'speaking',
    keys: ['follow-up', 'sustain', 'conversation'],
  },
  {
    id: 'repair-understanding',
    statement: 'repair a misunderstanding when speaking',
    category: 'speaking',
    keys: ['repair', 'clarif', 'misunderstanding'],
  },
  {
    id: 'tense-variety',
    statement: 'move between tenses naturally when you speak',
    category: 'grammar',
    keys: ['tense', 'imparfait', 'conditional', 'conditionnel', 'futur', 'subjonctif'],
  },
  {
    id: 'listen-normal',
    statement: 'understand French spoken at normal speed',
    category: 'listening',
    keys: ['listening', 'dictation', 'dictée', 'comprehension'],
  },
  {
    id: 'numbers',
    statement: 'catch numbers, times and prices when you hear them',
    category: 'listening',
    keys: ['number', 'numbers', 'time', 'price'],
  },
  {
    id: 'everyday-vocab',
    statement: 'use everyday vocabulary in conversation',
    category: 'vocabulary',
    keys: ['vocabulary', 'vocab', 'phrase'],
  },
  {
    id: 'present-accuracy',
    statement: 'speak accurately in the present tense',
    category: 'grammar',
    keys: ['present', 'présent', 'agreement', 'accord'],
  },
  {
    id: 'clear-pronunciation',
    statement: 'make yourself understood when speaking',
    category: 'pronunciation',
    keys: ['pronunciation', 'intelligib', 'accent'],
  },
  {
    id: 'write-correctly',
    statement: 'write short texts with control of the basics',
    category: 'writing',
    keys: ['writing', 'spelling', 'orthographe'],
  },
];

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round2 = (n) => Math.round(n * 100) / 100;

function matchesKey(def, text) {
  const haystack = String(text || '').toLowerCase();
  return (def.keys || []).some((k) => haystack.includes(String(k).toLowerCase()));
}

/**
 * Score one capability from observed performance.
 * @param {object} def capability definition
 * @param {{
 *   errorEntries?: Array<object>,   // learnerErrors entries
 *   cycles?: Array<object>,         // learningEvidence cycles
 *   sessions?: Array<object>,       // saved sessions (speaking reports)
 *   metrics?: Array<object>,        // recorded skill scores
 * }} evidence
 */
function scoreCapability(def, evidence = {}) {
  const errors = (evidence.errorEntries || []).filter((e) => e && (
    e.category === def.category || matchesKey(def, `${e.key} ${e.label}`)
  ));
  const cycles = (evidence.cycles || []).filter((c) => c && (
    c.target?.skill === def.category || matchesKey(def, `${c.target?.key} ${c.target?.label}`)
  ));

  // Independent proof: distinct encounters or delayed recall in the cycles.
  const independentProof = cycles.reduce((sum, c) => sum + (
    (c.transfers || []).filter((e) => e.independent !== false).length
    + (c.delayed || []).filter((e) => e.independent !== false).length
  ), 0);
  const demonstratedCycles = cycles.filter((c) => (
    (c.transfers || []).length > 0 && (c.delayed || []).length > 0
  )).length;

  // Raw performance signals: successes vs mistakes, how much help was needed.
  const successes = errors.reduce((sum, e) => sum + (Number(e.successCount) || 0), 0);
  const mistakes = errors.reduce((sum, e) => sum + (Number(e.errorCount) || 0), 0);
  const independentPasses = errors.reduce((sum, e) => sum + (Number(e.independentPasses) || 0), 0);
  const openErrors = errors.filter((e) => e.status === 'active').length;

  // Speaking capabilities additionally consider session performance.
  let sessionSignal = 0;
  if (def.category === 'speaking') {
    const sessions = (evidence.sessions || []).slice(-10);
    const scored = sessions.map((s) => Number(s?.report?.average_scores?.overall)).filter(Number.isFinite);
    if (scored.length) {
      const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
      sessionSignal = clamp01((avg - 55) / 35);
    }
  }

  const attempts = successes + mistakes;
  if (demonstratedCycles > 0 || independentProof >= 2 || (independentPasses >= 3 && openErrors === 0)) {
    return { state: CAPABILITY_STATE.DEMONSTRATED, score: round2(0.8 + 0.2 * clamp01(sessionSignal)), attempts, independentProof: independentProof || independentPasses };
  }
  if (attempts >= 3 || successes >= 1 || sessionSignal > 0.4) {
    const score = round2(clamp01(
      0.25
      + (attempts ? (successes / attempts) * 0.35 : 0)
      + independentPasses * 0.1
      + sessionSignal * 0.25
      - openErrors * 0.12,
    ));
    return { state: CAPABILITY_STATE.DEVELOPING, score, attempts, independentProof: independentProof || independentPasses };
  }
  return { state: CAPABILITY_STATE.INSUFFICIENT, score: null, attempts, independentProof: 0 };
}

const STATE_PHRASE = {
  [CAPABILITY_STATE.DEMONSTRATED]: 'You can reliably',
  [CAPABILITY_STATE.DEVELOPING]: 'Still developing',
  [CAPABILITY_STATE.INSUFFICIENT]: 'Keep practising',
};

export const STATE_EXPLANATION = Object.freeze({
  [CAPABILITY_STATE.DEMONSTRATED]: 'You have used this on your own — in new situations and later on.',
  [CAPABILITY_STATE.DEVELOPING]: 'You have real attempts here, but it is not reliable yet.',
  [CAPABILITY_STATE.INSUFFICIENT]: 'Keep practising — a few more attempts and we can judge this properly.',
});

/**
 * Build the learner-facing capability map.
 * @returns {{
 *   demonstrated: Array<{id, statement, category, score}>,
 *   developing: Array<{id, statement, category, score}>,
 *   insufficient: Array<{id, statement, category}>,
 *   groups: Array<{category, items}>,
 * }}
 */
export function buildCapabilityMap(evidence = {}) {
  const rows = CAPABILITY_DEFS.map((def) => ({ ...def, ...scoreCapability(def, evidence) }));
  const demonstrated = rows.filter((r) => r.state === CAPABILITY_STATE.DEMONSTRATED)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  const developing = rows.filter((r) => r.state === CAPABILITY_STATE.DEVELOPING)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  const insufficient = rows.filter((r) => r.state === CAPABILITY_STATE.INSUFFICIENT);
  const groups = [...new Set(rows.map((r) => r.category))].map((category) => ({
    category,
    items: rows.filter((r) => r.category === category),
  }));
  return {
    demonstrated: demonstrated.map(publicRow),
    developing: developing.map(publicRow),
    insufficient: insufficient.map(publicRow),
    groups,
    phrase: STATE_PHRASE,
    explanation: STATE_EXPLANATION,
  };
}

function publicRow(row) {
  return {
    id: row.id,
    statement: row.statement,
    category: row.category,
    state: row.state,
    score: row.score,
    attempts: row.attempts,
  };
}

/**
 * The four learner questions in one place (Progress's default screen).
 * @param {{capabilityMap?: object, weaknessLifecycle?: Array<object>,
 *          nextAction?: object|null, level?: string|null, bootstrapping?: boolean}} input
 */
export function progressOverview(input = {}) {
  const map = input.capabilityMap || buildCapabilityMap(input);
  return {
    level: input.level || null,
    canDo: map.demonstrated.slice(0, 5),
    improving: map.developing.slice(0, 5),
    weak: (input.weaknessLifecycle || []).slice(0, 4).map((w) => ({
      label: w.label || w.key,
      state: w.state,
      detail: w.detail,
    })),
    next: input.nextAction || null,
    bootstrapping: Boolean(input.bootstrapping),
  };
}
