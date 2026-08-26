// The living-language model tracks transfer, not just declarative knowledge.
// A grammar quiz can establish recognition and controlled production, but the
// later steps must be logged after a delay and in a genuinely new context.

export const LANGUAGE_STAGES = [
  {
    id: 'recognise',
    label: 'Recognise',
    shortLabel: 'Recognise',
    description: 'I notice the structure when I hear or read it.',
    cta: 'Mark recognised',
  },
  {
    id: 'controlled',
    label: 'Produce deliberately',
    shortLabel: 'Prompted',
    description: 'I can build it when the task points me towards it.',
    cta: 'Log a deliberate rep',
  },
  {
    id: 'delayed',
    label: 'Recall after a delay',
    shortLabel: 'Delayed',
    description: 'I can retrieve it later, without an immediate rehearsal.',
    cta: 'Log a delayed rep',
  },
  {
    id: 'contextual',
    label: 'Use in a new context',
    shortLabel: 'New context',
    description: 'I can carry it into a different topic or situation.',
    cta: 'Try a new context',
  },
  {
    id: 'spontaneous',
    label: 'Use spontaneously',
    shortLabel: 'Spontaneous',
    description: 'It is available when I am speaking, without a prompt.',
    cta: 'Log spontaneous use',
  },
];

// These are the structures where transfer matters most to an intermediate
// speaker. Each points back to the existing grammar lesson, so the map never
// strands the learner in a new reporting surface.
export const LANGUAGE_STRUCTURES = [
  {
    id: 'passe-compose',
    topicId: 'passe-compose',
    title: 'Passé composé',
    cefr: 'A2',
    summary: 'Completed actions that move a story forward.',
    example: 'J’ai déjà réservé la table.',
    translation: 'I have already booked the table.',
    contexts: ['last weekend', 'a recent decision', 'a travel story'],
  },
  {
    id: 'pronoms',
    topicId: 'pronoms',
    title: 'Direct object pronouns',
    cefr: 'B1',
    summary: 'le, la, les, lui, leur, y and en without repeating the noun.',
    example: 'Je les ai vus hier, mais je lui réponds demain.',
    translation: 'I saw them yesterday, but I will reply to him tomorrow.',
    contexts: ['a plan with a friend', 'a shop return', 'explaining a choice'],
  },
  {
    id: 'si-clauses',
    topicId: 'si-clauses',
    title: 'Si + imparfait',
    cefr: 'B1',
    summary: 'Hypotheticals that make room for possibilities and advice.',
    example: 'Si j’avais le temps, je voyagerais davantage.',
    translation: 'If I had the time, I would travel more.',
    contexts: ['a wish', 'giving advice', 'imagining next year'],
  },
  {
    id: 'subjonctif',
    topicId: 'subjonctif',
    title: 'Subjunctive',
    cefr: 'B2',
    summary: 'Necessity, doubt, emotion and desire after que.',
    example: 'Il faut que tu sois là avant huit heures.',
    translation: 'You need to be there before eight.',
    contexts: ['a polite request', 'a disagreement', 'making a plan'],
  },
  {
    id: 'imparfait',
    topicId: 'imparfait',
    title: 'Imparfait',
    cefr: 'A2',
    summary: 'Background, habits and descriptions in the past.',
    example: 'Quand j’étais petit, je lisais tous les soirs.',
    translation: 'When I was little, I read every evening.',
    contexts: ['childhood memories', 'a familiar routine', 'setting a scene'],
  },
  {
    id: 'futur-conditionnel',
    topicId: 'futur-conditionnel',
    title: 'Future & conditional',
    cefr: 'B1',
    summary: 'Plans, promises and polite possibilities.',
    example: 'Je voudrais partir demain, si c’était possible.',
    translation: 'I would like to leave tomorrow, if that were possible.',
    contexts: ['a booking', 'negotiating a plan', 'a polite request'],
  },
  {
    id: 'y-en',
    topicId: 'y-en',
    title: 'Y & en',
    cefr: 'B1',
    summary: 'Replace places, quantities and de + something naturally.',
    example: 'Tu veux du pain ? Oui, j’en prends un peu.',
    translation: 'Do you want some bread? Yes, I’ll have a little.',
    contexts: ['ordering food', 'talking about plans', 'a quick reply'],
  },
];

const STAGE_COUNT = LANGUAGE_STAGES.length;
const STRUCTURE_IDS = new Set(LANGUAGE_STRUCTURES.map((structure) => structure.id));

export function clampLanguageStage(value) {
  const stage = Number(value);
  return Number.isFinite(stage) ? Math.max(0, Math.min(STAGE_COUNT, Math.round(stage))) : 0;
}

export function normaliseLanguageProgress(progress = {}) {
  if (!progress || typeof progress !== 'object') return {};
  return Object.fromEntries(
    Object.entries(progress)
      .filter(([id]) => STRUCTURE_IDS.has(id))
      .map(([id, entry]) => [id, {
        stage: clampLanguageStage(entry?.stage),
        successes: Math.max(0, Number(entry?.successes) || 0),
        slips: Math.max(0, Number(entry?.slips) || 0),
        attempts: Array.isArray(entry?.attempts) ? entry.attempts.slice(-40) : [],
        lastOutcome: entry?.lastOutcome === 'slip' ? 'slip' : entry?.lastOutcome === 'success' ? 'success' : null,
        lastContext: entry?.lastContext ? String(entry.lastContext).slice(0, 80) : null,
        lastAt: typeof entry?.lastAt === 'string' ? entry.lastAt : null,
      }]),
  );
}

function inferredStage(grammarEntry) {
  const best = Number(grammarEntry?.best) || 0;
  if (best >= 80) return 2;
  if (best >= 60) return 1;
  return 0;
}

function statusFor(stage, unstable) {
  if (unstable) return 'Unstable';
  if (stage >= STAGE_COUNT) return 'Spontaneous';
  if (stage > 0) return LANGUAGE_STAGES[stage - 1].shortLabel;
  return 'Not started';
}

function nextContextFor(structure, entry) {
  const contexts = structure.contexts || [];
  if (!contexts.length) return null;
  return contexts[Math.max(0, Number(entry?.successes) || 0) % contexts.length];
}

/**
 * Combine explicit transfer evidence with existing grammar quiz evidence.
 * Grammar scores are deliberately capped at controlled production: a quiz
 * cannot prove delayed recall, contextual transfer or spontaneous speech.
 */
export function buildLanguageMap({ progress = {}, grammarProgress = {}, grammarErrors = {} } = {}) {
  const explicit = normaliseLanguageProgress(progress);
  return LANGUAGE_STRUCTURES.map((structure) => {
    const entry = explicit[structure.id] || {};
    const grammarEntry = grammarProgress[structure.topicId];
    const grammarStage = inferredStage(grammarEntry);
    const stage = Math.max(grammarStage, clampLanguageStage(entry.stage));
    const errorCount = Math.max(0, Number(grammarErrors[structure.topicId]) || 0);
    const unstable = entry.lastOutcome === 'slip' || (stage >= 2 && errorCount > 0 && errorCount > (entry.successes || 0));
    const nextStage = Math.min(STAGE_COUNT, stage + 1);
    const nextContext = nextContextFor(structure, entry);
    return {
      ...structure,
      stage,
      status: statusFor(stage, unstable),
      unstable,
      errorCount,
      successes: entry.successes || 0,
      slips: entry.slips || 0,
      lastContext: entry.lastContext || null,
      lastAt: entry.lastAt || grammarEntry?.lastAt || null,
      nextStage,
      nextStageMeta: LANGUAGE_STAGES[nextStage - 1] || null,
      nextContext,
    };
  });
}

export function nextLanguageStep(entry) {
  const currentStage = clampLanguageStage(entry?.stage);
  const nextStage = entry?.nextStage == null ? Math.min(STAGE_COUNT, currentStage + 1) : clampLanguageStage(entry.nextStage);
  if (!entry || currentStage >= STAGE_COUNT) {
    return {
      stage: STAGE_COUNT,
      ...LANGUAGE_STAGES[STAGE_COUNT - 1],
      context: entry?.nextContext || null,
    };
  }
  return {
    stage: nextStage,
    ...LANGUAGE_STAGES[nextStage - 1],
    context: entry.nextContext || null,
  };
}

/** Apply one explicit learner-reported transition without mutating input. */
export function applyLanguageEvidence(progress = {}, structureId, event = {}, now = Date.now()) {
  if (!STRUCTURE_IDS.has(structureId)) return normaliseLanguageProgress(progress);
  const all = normaliseLanguageProgress(progress);
  const previous = all[structureId] || {
    stage: 0,
    successes: 0,
    slips: 0,
    attempts: [],
    lastOutcome: null,
    lastContext: null,
    lastAt: null,
  };
  const at = typeof event.at === 'string' ? event.at : new Date(now).toISOString();
  const context = event.context ? String(event.context).slice(0, 80) : null;
  const outcome = event.outcome === 'slip' ? 'slip' : 'success';
  const requested = clampLanguageStage(event.stage || previous.stage + 1);
  const allowJump = event.allowJump === true;
  const stage = outcome === 'slip'
    ? previous.stage
    : Math.max(previous.stage, allowJump ? requested : Math.min(requested, previous.stage + 1));
  const attempt = {
    stage: outcome === 'slip' ? previous.stage : stage,
    outcome,
    context,
    source: String(event.source || 'language-map').slice(0, 80),
    at,
  };
  return {
    ...all,
    [structureId]: {
      ...previous,
      stage,
      successes: previous.successes + (outcome === 'success' ? 1 : 0),
      slips: previous.slips + (outcome === 'slip' ? 1 : 0),
      attempts: [...previous.attempts, attempt].slice(-40),
      lastOutcome: outcome,
      lastContext: context || previous.lastContext,
      lastAt: at,
    },
  };
}

export { STAGE_COUNT };
