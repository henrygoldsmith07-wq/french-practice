// Target-language registry. The app teaches one of these to an English
// speaker; everything language-specific (TTS voice, speech-recognition code,
// AI prompt language, branding, CEFR level titles) is looked up from here so
// the whole studio can switch between French, German and Spanish.
import { contentLang } from './content/active.js';

export const LANGUAGES = {
  fr: {
    id: 'fr',
    name: 'French',
    nativeName: 'Français',
    adjective: 'French',
    speechLang: 'fr-FR',
    whisper: 'fr',
    flag: '🇫🇷',
    studio: 'Le Studio',
    hello: 'Bonjour',
    voiceHint: /natural|premium|enhanced|amélior/i,
    // Content maturity: 'full' = the complete studio (grammar topics, culture,
    // exam boards, verb tables, learning path). 'beta' = core loop (Today,
    // conversations, vocab library, dictée, phrasebook, AI tutor) with
    // French-only tools honestly hidden rather than half-translated.
    maturity: 'full',
    // CEFR title ladder (levels 1-3 share the first, 4-6 the second, …).
    levelTitles: ['Débutant', 'Apprenti', 'Étudiant', 'Causeur', 'Bavard', 'Orateur', 'Éloquent', 'Francophone', 'Maître', 'Légende'],
  },
  de: {
    id: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    adjective: 'German',
    speechLang: 'de-DE',
    whisper: 'de',
    flag: '🇩🇪',
    studio: 'Das Studio',
    hello: 'Hallo',
    voiceHint: /natural|premium|enhanced/i,
    maturity: 'beta',
    levelTitles: ['Anfänger', 'Lehrling', 'Schüler', 'Sprecher', 'Redner', 'Rhetoriker', 'Gewandt', 'Kenner', 'Meister', 'Legende'],
  },
  es: {
    id: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    adjective: 'Spanish',
    speechLang: 'es-ES',
    whisper: 'es',
    flag: '🇪🇸',
    studio: 'El Estudio',
    hello: 'Hola',
    voiceHint: /natural|premium|enhanced/i,
    maturity: 'beta',
    levelTitles: ['Principiante', 'Aprendiz', 'Estudiante', 'Hablante', 'Conversador', 'Orador', 'Elocuente', 'Hispanohablante', 'Maestro', 'Leyenda'],
  },
};

export const LANGUAGE_LIST = Object.values(LANGUAGES);
export const DEFAULT_LANG = 'fr';
export const getLanguage = (id) => LANGUAGES[id] || LANGUAGES[DEFAULT_LANG];

// Honest support labels: French is the complete studio; German and Spanish
// are the core loop in beta. Surfaces that are authored in French only
// (grammar topics, culture, exam boards, conjugation tables, the learning
// path) check this and hide themselves for beta languages instead of showing
// half-working content.
export const isFullSupport = (id) => getLanguage(id).maturity === 'full';
export const maturityLabel = (id) => (getLanguage(id).maturity === 'full' ? 'Full' : 'Beta');

// Surfaces authored for the full studio only (French today). Every gate —
// hub cards, onboarding, deep links, search — checks THIS list instead of
// re-declaring its own, so a feature moves to beta coverage by editing one
// set, never by chasing copies across components.
//   grammar     — 60 CEFR topics authored in French
//   culture     — customs/food/regions/history essays
//   exams       — UK exam boards + DELF papers
//   path        — the 12-unit Learning Path (French-authored content)
export const FULL_ONLY_FEATURES = Object.freeze(new Set(['grammar', 'culture', 'exams', 'path']));

/** True when `feature` (a FULL_ONLY_FEATURES id) is offered for language `id`. */
export const featureAvailable = (feature, id) =>
  !(FULL_ONLY_FEATURES.has(String(feature)) && !isFullSupport(id));

/** Same, for the language currently being studied (content/active.js). */
export const featureAvailableNow = (feature) => featureAvailable(feature, contentLang());

// The honest one-liner beta learners see where a French-only surface would
// have been: what IS available now, and what is still being built — never a
// dead end, never a claim that a French-only feature is ready.
export const betaAlternativeCopy = 'The core studio — Today sessions, conversation practice, vocabulary, dictée and the AI tutor — is ready for this language. Still coming: grammar topics, culture and exam preparation.';

// A learner signs up for one or more languages and studies one at a time.
// This keeps that pair honest wherever it is edited (onboarding, Settings):
// the list is deduped and free of unknown ids, never empty, and the active
// language is always a member of it.
export function normaliseLanguages(list, active) {
  const languages = [...new Set((Array.isArray(list) ? list : []).filter((id) => id in LANGUAGES))];
  if (!languages.length) languages.push(active in LANGUAGES ? active : DEFAULT_LANG);
  return { languages, language: languages.includes(active) ? active : languages[0] };
}
