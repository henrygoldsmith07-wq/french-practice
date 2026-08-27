// Field Notes turn a line the learner met in real life into a small,
// evidence-aware transfer loop. The model is deliberately local and honest:
// saving a phrase is not the same as being able to use it spontaneously.

export const FIELD_NOTE_STAGES = [
  {
    id: 'captured',
    label: 'Captured',
    shortLabel: 'Capture',
    description: 'A real French line is saved with the situation that gave it meaning.',
    cta: 'Say it now',
    prompt: 'Read the meaning, then say the French line out loud once.',
  },
  {
    id: 'rehearsed',
    label: 'Rehearsed',
    shortLabel: 'Rehearse',
    description: 'You have practised the line once, while it is still fresh.',
    cta: 'I recalled it',
    prompt: 'Cover the French line if you can. Rebuild it from the meaning.',
  },
  {
    id: 'recalled',
    label: 'Recalled later',
    shortLabel: 'Recall later',
    description: 'You brought it back after a break instead of relying on immediate repetition.',
    cta: 'Use a new context',
    prompt: 'Say the line again after a pause, then change one detail for a new situation.',
  },
  {
    id: 'reused',
    label: 'Reused in life',
    shortLabel: 'Reuse',
    description: 'The line has crossed from a note into a different moment of French.',
    cta: 'Keep it alive',
    prompt: 'Use it once more when the same kind of moment appears.',
  },
];

export const FIELD_NOTE_CONTEXTS = [
  { id: 'message', label: 'A message or conversation' },
  { id: 'street', label: 'A sign, menu or shop' },
  { id: 'work', label: 'Work or study' },
  { id: 'travel', label: 'Travel or a service' },
  { id: 'media', label: 'A podcast, film or song' },
  { id: 'other', label: 'Somewhere else' },
];

export const FIELD_NOTE_LIMIT = 100;
export const FIELD_NOTE_ATTEMPT_LIMIT = 40;

const DAY = 86400000;
const SUCCESS_DELAYS = [DAY, 3 * DAY, 7 * DAY, 14 * DAY];
const CONTEXT_IDS = new Set(FIELD_NOTE_CONTEXTS.map((context) => context.id));

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function validDate(value, fallback) {
  if (typeof value === 'string' && Number.isFinite(new Date(value).getTime())) return value;
  return new Date(fallback).toISOString();
}

function normalisePhrase(value) {
  return cleanText(value, 240)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function phraseHash(value) {
  let hash = 2166136261;
  for (const char of normalisePhrase(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function clampFieldNoteStage(value) {
  const stage = Number(value);
  return Number.isFinite(stage)
    ? Math.max(0, Math.min(FIELD_NOTE_STAGES.length - 1, Math.round(stage)))
    : 0;
}

function normaliseAttempt(attempt, index = 0) {
  if (!attempt || typeof attempt !== 'object') return null;
  const outcome = attempt.outcome === 'slip' ? 'slip' : 'success';
  return {
    id: cleanText(attempt.id, 80) || `attempt:${index}`,
    stage: clampFieldNoteStage(attempt.stage),
    mode: cleanText(attempt.mode, 40) || 'practice',
    outcome,
    variant: cleanText(attempt.variant, 240),
    at: validDate(attempt.at, Date.now()),
  };
}

export function normaliseFieldNote(note, index = 0) {
  if (!note || typeof note !== 'object') return null;
  const french = cleanText(note.french ?? note.fr, 240);
  if (!french) return null;
  const createdAt = validDate(note.createdAt ?? note.addedAt, Date.now());
  const attempts = (Array.isArray(note.attempts) ? note.attempts : [])
    .map(normaliseAttempt)
    .filter(Boolean)
    .slice(-FIELD_NOTE_ATTEMPT_LIMIT);
  const successes = Math.max(0, Number(note.successes) || attempts.filter((a) => a.outcome === 'success').length);
  const slips = Math.max(0, Number(note.slips) || attempts.filter((a) => a.outcome === 'slip').length);
  const lastOutcome = note.lastOutcome === 'slip' ? 'slip' : note.lastOutcome === 'success' ? 'success' : attempts.at(-1)?.outcome || null;
  return {
    id: cleanText(note.id, 80) || `field:migrated:${index}:${phraseHash(french)}`,
    french,
    meaning: cleanText(note.meaning ?? note.en, 240),
    context: CONTEXT_IDS.has(note.context) ? note.context : 'other',
    source: cleanText(note.source, 100),
    stage: clampFieldNoteStage(note.stage),
    attempts,
    successes,
    slips,
    lastOutcome,
    lastMode: cleanText(note.lastMode, 40) || attempts.at(-1)?.mode || null,
    lastVariant: cleanText(note.lastVariant, 240) || attempts.at(-1)?.variant || '',
    createdAt,
    lastAt: note.lastAt ? validDate(note.lastAt, createdAt) : attempts.at(-1)?.at || null,
    nextReviewAt: note.nextReviewAt ? validDate(note.nextReviewAt, createdAt) : createdAt,
  };
}

export function normaliseFieldNotes(notes = []) {
  const seenIds = new Set();
  const seenPhrases = new Set();
  return (Array.isArray(notes) ? notes : [])
    .map(normaliseFieldNote)
    .filter((note) => {
      if (!note) return false;
      const phrase = normalisePhrase(note.french);
      if (seenIds.has(note.id) || !phrase || seenPhrases.has(phrase)) return false;
      seenIds.add(note.id);
      seenPhrases.add(phrase);
      return true;
    })
    .slice(0, FIELD_NOTE_LIMIT);
}

export function createFieldNote(input = {}, now = Date.now()) {
  const source = input && typeof input === 'object' ? input : {};
  const french = cleanText(source.french ?? source.fr, 240);
  if (!french) return null;
  const atMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const createdAt = new Date(atMs).toISOString();
  return normaliseFieldNote({
    id: cleanText(source.id, 80) || `field:${atMs.toString(36)}:${phraseHash(french)}`,
    french,
    meaning: source.meaning ?? source.en ?? '',
    context: source.context,
    source: source.source,
    stage: 0,
    attempts: [],
    successes: 0,
    slips: 0,
    createdAt,
    nextReviewAt: createdAt,
  });
}

/** Add a note without silently creating duplicate copies of the same line. */
export function addFieldNote(notes = [], input = {}, now = Date.now()) {
  const current = normaliseFieldNotes(notes);
  const candidate = createFieldNote(input, now);
  if (!candidate) return { notes: current, note: null, added: false, duplicate: false };
  const key = normalisePhrase(candidate.french);
  const duplicate = current.find((note) => normalisePhrase(note.french) === key) || null;
  if (duplicate) return { notes: current, note: duplicate, added: false, duplicate: true };
  return {
    notes: [candidate, ...current].slice(0, FIELD_NOTE_LIMIT),
    note: candidate,
    added: true,
    duplicate: false,
  };
}

export function isFieldNoteDue(note, now = Date.now()) {
  const dueAt = new Date(note?.nextReviewAt || 0).getTime();
  return !Number.isFinite(dueAt) || dueAt <= now;
}

export function fieldNoteStats(notes = [], now = Date.now()) {
  const list = normaliseFieldNotes(notes);
  const counts = Object.fromEntries(FIELD_NOTE_STAGES.map((stage) => [stage.id, 0]));
  list.forEach((note) => { counts[FIELD_NOTE_STAGES[note.stage].id] += 1; });
  return {
    total: list.length,
    due: list.filter((note) => isFieldNoteDue(note, now)).length,
    active: list.filter((note) => note.stage < FIELD_NOTE_STAGES.length - 1).length,
    reused: counts.reused,
    ...counts,
  };
}

/** Pick due notes first, then the least-developed/oldest note. */
export function nextFieldNote(notes = [], now = Date.now()) {
  const list = normaliseFieldNotes(notes);
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const dueDelta = Number(isFieldNoteDue(b, now)) - Number(isFieldNoteDue(a, now));
    if (dueDelta) return dueDelta;
    return a.stage - b.stage
      || new Date(a.nextReviewAt || a.createdAt).getTime() - new Date(b.nextReviewAt || b.createdAt).getTime()
      || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

/**
 * Record one honest practice event. Success advances at most one rung; a slip
 * never erases previous work, but keeps the note due for another pass.
 */
export function practiceFieldNote(notes = [], id, event = {}, now = Date.now()) {
  const list = normaliseFieldNotes(notes);
  const index = list.findIndex((note) => note.id === id);
  if (index < 0) return list;
  const previous = list[index];
  const details = event && typeof event === 'object' ? event : {};
  const atMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const at = new Date(atMs).toISOString();
  const outcome = details.outcome === 'slip' ? 'slip' : 'success';
  const stage = outcome === 'success'
    ? Math.min(FIELD_NOTE_STAGES.length - 1, previous.stage + 1)
    : previous.stage;
  const mode = cleanText(details.mode, 40) || FIELD_NOTE_STAGES[stage].id;
  const attempt = {
    id: `attempt:${atMs.toString(36)}:${previous.attempts.length}`,
    stage,
    mode,
    outcome,
    variant: cleanText(details.variant, 240),
    at,
  };
  const nextReviewAt = outcome === 'slip'
    ? at
    : new Date(atMs + SUCCESS_DELAYS[stage]).toISOString();
  const updated = {
    ...previous,
    stage,
    attempts: [...previous.attempts, attempt].slice(-FIELD_NOTE_ATTEMPT_LIMIT),
    successes: previous.successes + (outcome === 'success' ? 1 : 0),
    slips: previous.slips + (outcome === 'slip' ? 1 : 0),
    lastOutcome: outcome,
    lastMode: mode,
    lastVariant: attempt.variant,
    lastAt: at,
    nextReviewAt,
  };
  return list.map((note, noteIndex) => (noteIndex === index ? updated : note));
}

export function fieldNoteStage(note) {
  return FIELD_NOTE_STAGES[clampFieldNoteStage(note?.stage)];
}

export function contextLabel(id) {
  return FIELD_NOTE_CONTEXTS.find((context) => context.id === id)?.label || 'Somewhere else';
}
