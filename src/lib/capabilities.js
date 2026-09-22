// The ONE authoritative language capability registry.
//
// Every gate that decides "can this language offer this surface?" reads THIS
// matrix — never its own copy. A surface moves between languages by editing a
// row here, never by chasing booleans across components.
//
// Rows are derived from ACTUAL CONTENT AVAILABILITY, not marketing labels —
// the comment on each row names the content module that backs it:
//
//   conversation         lib/data.js per-language scenario registries + AI conversation
//   vocabulary           lib/vocab.js per-language pack registries (fr full, de/es packs)
//   dictation            lib/sentences.js — per-language sentence pool (scenarios + vocab examples)
//   pronunciation        lib/sentences.js — per-language read-aloud pool + TTS/STT
//   scenario-speaking    lib/data.js per-language scenario registries
//   reading-library      lib/reading.js — French-authored graded texts ONLY
//   writing-authored     lib/writing.js — French prompt banks + accent retype ONLY
//   listening-library    lib/listening.js — French-authored track library ONLY
//   grammar              lib/grammar.js — 60 CEFR topics authored in French ONLY
//   conjugation          lib/conjugationTrainer.js — French verb tables ONLY
//   culture              lib/culture.js — customs/food/regions/history essays, French ONLY
//   exams                lib/exams/* — UK exam boards + DELF papers, French ONLY
//   learning-path        lib/path.js — 12 French-authored units ONLY
//   number-listening     NumberDash — French number/price/time word strings ONLY
//   conditions-listening ConditionsGym — French LISTENING_TRACKS corpus ONLY
//   sentence-completion  lib/writing.js COMPLETION_STARTERS, French ONLY
//   free-writing-prompts lib/writing.js WRITING_PROMPTS, French ONLY
//   essay-prompts        lib/writing.js ESSAY_PROMPTS, French ONLY
//   accent-trainer       French accent-pair retyping ONLY
//   field-notes          language-neutral capture-and-recall (learner's own material)
//
// The conversation core (Today sessions, Speak, Review, field notes, AI tutor)
// is genuinely per-language; everything authored as French content is not, and
// this registry is what keeps beta languages honest about that.

import { contentLang } from './content/active.js';

export const CAPABILITIES = Object.freeze({
  conversation: { languages: ['fr', 'de', 'es'] },
  vocabulary: { languages: ['fr', 'de', 'es'] },
  dictation: { languages: ['fr', 'de', 'es'] },
  pronunciation: { languages: ['fr', 'de', 'es'] },
  'scenario-speaking': { languages: ['fr', 'de', 'es'] },
  'field-notes': { languages: ['fr', 'de', 'es'] },
  typing: { languages: ['fr', 'de', 'es'] },         // Writing typing drill — sentences.js pool is language-aware
  translation: { languages: ['fr', 'de', 'es'] },    // TranslateDrill — vocab packs exist per language
  'audio-course': { languages: ['fr', 'de', 'es'] }, // AudioCourse — builds from the active language's content
  'reading-library': { languages: ['fr'] },
  'writing-authored': { languages: ['fr'] },
  'listening-library': { languages: ['fr'] },
  grammar: { languages: ['fr'] },
  conjugation: { languages: ['fr'] },
  culture: { languages: ['fr'] },
  exams: { languages: ['fr'] },
  'learning-path': { languages: ['fr'] },
  // Listening/writing SUBMODES. Genuinely multilingual submodes (dictée,
  // typing, translation, the audio course) have NO row here — they ride the
  // core rows above. Each row below is content authored only in French:
  'number-listening': { languages: ['fr'] },       // NumberDash — French number/price/time strings
  'conditions-listening': { languages: ['fr'] },   // ConditionsGym — French LISTENING_TRACKS corpus
  'sentence-completion': { languages: ['fr'] },    // Writing Completion — French COMPLETION_STARTERS
  'free-writing-prompts': { languages: ['fr'] },   // WritingStudio quick — French WRITING_PROMPTS
  'essay-prompts': { languages: ['fr'] },          // WritingStudio essay — French ESSAY_PROMPTS
  'accent-trainer': { languages: ['fr'] },         // AccentDrill — French accent-pair retyping
});

export const CAPABILITY_IDS = Object.freeze(Object.keys(CAPABILITIES));

/** Which languages offer `capability` — the authoritative row. */
export const capabilityLanguages = (capability) =>
  (CAPABILITIES[String(capability)] || { languages: [] }).languages;

/** True when language `id` genuinely offers `capability`. */
export const hasCapability = (capability, id) =>
  capabilityLanguages(capability).includes(id);

/** Same, for the language currently being studied (lib/content/active.js). */
export const hasCapabilityNow = (capability) =>
  hasCapability(capability, contentLang());

// ---- UI surface ids → capability rows --------------------------------------
// Hubs and cards are keyed by short feature ids. This map is the single
// translation layer between those ids and the matrix, so a hub section, a
// deep link and a recommendation all resolve to the SAME row.
export const FEATURE_CAPABILITY = Object.freeze({
  grammar: 'grammar',
  culture: 'culture',
  exams: 'exams',
  path: 'learning-path',
  reading: 'reading-library',
  listening: 'listening-library',
  writing: 'writing-authored',
  dictation: 'dictation',
  pronunciation: 'pronunciation',
  conjugation: 'conjugation',
  skills: 'dictation', // Skills hub: dictée is the minimum it can offer
  'field-notes': 'field-notes',
  ai: 'conversation',
  reference: 'vocabulary',
  realworld: 'scenario-speaking',
  cards: 'vocabulary',
  speak: 'conversation',
  today: 'conversation',
  // Submode surface ids → their submode rows (deep links and mode pickers
  // resolve through the SAME matrix as the hub cards).
  numbers: 'number-listening',
  conditions: 'conditions-listening',
  completion: 'sentence-completion',
  free: 'free-writing-prompts',
  essay: 'essay-prompts',
  accents: 'accent-trainer',
});

/** Legacy-compatible: does feature id `feature` exist for language `id`? */
export const featureOffered = (feature, id) => {
  const cap = FEATURE_CAPABILITY[String(feature)];
  // An unregistered feature id is core-loop by definition — hiding an unknown
  // surface would need an explicit row, not a silent default.
  return cap ? hasCapability(cap, id) : true;
};
