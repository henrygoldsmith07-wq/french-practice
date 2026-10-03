// Field Note activities — turns a phrase the learner met in real life into
// personalised practice.
//
// A saved note is the most personal curriculum material Le Studio has: the
// learner personally encountered this phrase in a real situation. These
// generators turn it into recognition, recall, sentence completion, speaking
// prompts, pronunciation work and — most importantly — fresh-context usage.
//
// Example: the learner saves «Ça dépend.» → a speaking prompt like
// "Your friend asks whether you want to go out this weekend. Give a natural
// answer using the phrase you saved."
//
// All pure: the component owns rendering and persistence, this owns ideas.

import { isFieldNoteDue, FIELD_NOTE_CONTEXTS } from './fieldNotes.js';

export const ACTIVITY_TYPES = Object.freeze([
  'recognition',
  'recall',
  'completion',
  'speaking',
  'pronunciation',
  'fresh-context',
]);

const CONTEXT_OTHERNESS = {
  // Fresh-context prompts must genuinely differ from the saved context: this
  // matrix maps each saved context to the contexts that read as "new".
  message: ['street', 'travel', 'work', 'media'],
  street: ['message', 'work', 'travel', 'media'],
  work: ['message', 'street', 'travel', 'media'],
  travel: ['message', 'street', 'work', 'media'],
  media: ['message', 'street', 'work', 'travel'],
  other: ['message', 'street', 'work', 'travel'],
};

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function contextLabelById(id) {
  return FIELD_NOTE_CONTEXTS.find((c) => c.id === id)?.label || 'somewhere new';
}

/**
 * Generate the practice activities for ONE saved note. Deterministic given
 * the note; interleaves types so no two consecutive activities for the same
 * note feel the same.
 *
 * @param {object} note a normalised field note (lib/fieldNotes.js)
 * @param {{ now?: number, excludeTypes?: string[] }} options
 */
export function generateFieldNoteActivities(note, options = {}) {
  if (!note || !note.french) return [];
  const phrase = clean(note.french);
  const meaning = clean(note.meaning) || '(your saved meaning)';
  const excluded = new Set(options.excludeTypes || []);
  const others = CONTEXT_OTHERNESS[note.context] || CONTEXT_OTHERNESS.other;
  const freshContext = contextLabelById(others[0]);

  const activities = [
    {
      id: `${note.id}:recognition`,
      type: 'recognition',
      skill: 'reading',
      prompt: `What does this mean?`,
      display: { target: phrase },
      answer: meaning,
      hint: 'Think about where you first saw it.',
    },
    {
      id: `${note.id}:recall`,
      type: 'recall',
      skill: 'writing',
      prompt: `Say it in ${note.context === 'other' ? 'the language you saved' : contextLabelById(note.context)} — how did the phrase go?`,
      display: { meaning },
      answer: phrase,
      hint: 'Cover the phrase and rebuild it from the meaning.',
    },
    {
      id: `${note.id}:completion`,
      type: 'completion',
      skill: 'writing',
      prompt: `Complete the sentence with your saved phrase.`,
      display: { meaning },
      answer: phrase,
      sentence: completionSentence(note, phrase),
      hint: `It means: ${meaning}`,
    },
    {
      id: `${note.id}:speaking`,
      type: 'speaking',
      skill: 'speaking',
      prompt: speakingPrompt(note, phrase),
      display: { target: phrase, meaning },
      answer: phrase,
      hint: `Work in: «${phrase}»`,
    },
    {
      id: `${note.id}:pronunciation`,
      type: 'pronunciation',
      skill: 'pronunciation',
      prompt: `Say your saved phrase out loud — aim for being understood.`,
      display: { target: phrase, meaning },
      answer: phrase,
      hint: 'Listen once, then say it in one breath.',
    },
    {
      id: `${note.id}:fresh-context`,
      type: 'fresh-context',
      skill: 'speaking',
      prompt: `Use it in a new situation: ${freshContext}. Say a full sentence that works there — not the situation you saved.`,
      display: { target: phrase, meaning, freshContext },
      answer: phrase,
      hint: `Same phrase, different moment. Keep: «${phrase}»`,
    },
  ];
  return activities.filter((a) => !excluded.has(a.type));
}

function completionSentence(note) {
  const context = note.context;
  switch (context) {
    case 'message': return `Salut ! Demain, ça va ? — ${'＿'.repeat(8)}`;
    case 'street': return `Excusez-moi, c'est ouvert ? — ${'＿'.repeat(8)}`;
    case 'work': return `On fait comment pour la réunion ? — ${'＿'.repeat(8)}`;
    case 'travel': return `Le train part à quelle heure ? — ${'＿'.repeat(8)}`;
    case 'media': return `Et alors, ton avis ? — ${'＿'.repeat(8)}`;
    default: return `Alors, ton avis ? — ${'＿'.repeat(8)}`;
  }
}

const SPEAKING_SITUATIONS = [
  () => `Your friend asks whether you want to go out this weekend. Give a natural answer using the phrase you saved.`,
  (label) => `Someone in ${label} asks you a yes/no question. Answer naturally, working in your saved phrase.`,
  (label) => `You need to change the subject politely in ${label}. Use your saved phrase to do it.`,
  (label) => `A conversation in ${label} is heading somewhere you don't want. Reply using your saved phrase.`,
];

function speakingPrompt(note, phrase) {
  const candidates = CONTEXT_OTHERNESS[note.context] || CONTEXT_OTHERNESS.other;
  const label = contextLabelById(candidates[0]);
  // Short response phrases («Ça dépend.», «Bien sûr.») fit an answer-shaped
  // situation best, and the product's canonical example uses exactly that
  // shape. Longer phrases rotate through the situation bank instead of every
  // note getting the identical prompt.
  const words = String(phrase).match(/[\p{L}\p{N}]+/gu) || [];
  const seed = words.length <= 3 ? 0 : (hash(phrase) % SPEAKING_SITUATIONS.length);
  return SPEAKING_SITUATIONS[seed](label);
}

/**
 * The due activity queue across the learner's notes: personal material first,
 * never the same activity type twice in a row for one note, respecting the
 * note's own spacing (lib/fieldNotes.js).
 */
export function dueFieldNoteActivities(notes = [], now = Date.now(), limit = 6, { excludePhrases = [], lastTypeByNote = {} } = {}) {
  const excludedPhrases = new Set((excludePhrases || []).map((p) => String(p).toLowerCase()));
  const due = (Array.isArray(notes) ? notes : [])
    .filter((n) => n && n.french && !excludedPhrases.has(String(n.french).toLowerCase()))
    .filter((n) => isFieldNoteDue(n, now));
  const queue = [];
  for (const note of due) {
    if (queue.length >= limit) break;
    const lastType = lastTypeByNote[note.id] || null;
    const activities = generateFieldNoteActivities(note, { excludeTypes: lastType ? [lastType] : [] });
    if (!activities.length) continue;
    // Interleave: pick the activity type furthest from the note's last one.
    const pick = activities.find((a) => a.type !== lastType) || activities[0];
    queue.push({ note, activity: pick });
  }
  return queue.slice(0, Math.max(0, limit));
}

/**
 * Learner-facing label for an activity type — plain language for the UI.
 */
export function activityLabel(type) {
  switch (type) {
    case 'recognition': return 'Recognise it';
    case 'recall': return 'Recall it';
    case 'completion': return 'Fill the gap';
    case 'speaking': return 'Say it';
    case 'pronunciation': return 'Pronounce it';
    case 'fresh-context': return 'Use it somewhere new';
    default: return 'Practice';
  }
}

function hash(value) {
  let h = 2166136261;
  for (const char of String(value)) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}
