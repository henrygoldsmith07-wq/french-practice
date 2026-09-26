// Static content: roleplay scenarios (with 3rd-turn curveballs), daily
// challenge topics, and the filler-word flashcard deck.
// UI-facing fields (title, setup, hint scaffolding) are in English; the
// practice material itself (openers, hints' French phrases, topics,
// examples) stays in French. aiRole/curveball are model-facing prompts.
//
// Every language's scenario list loads through a per-language registry —
// dynamic imports, so only the active language's scenario corpus downloads
// (mirrors the vocab registry in vocab.js). Until a registry resolves,
// getScenarios() serves [] — a resolved-empty state, NOT a loading error.
// Callers treat it exactly like the vocabulary library's cold-start window:
// the boot prefetch warms it a beat after first paint.

import { contentLang } from './content/active.js';

const FR_SCENARIOS_URL = new URL('../assets/content/fr-scenarios.json', import.meta.url);

async function loadJsonAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Content asset failed (${response.status})`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error('Content asset is not an array');
  return body;
}

// ---- per-language scenario registries -------------------------------------
// Same contract as vocab.js's registries: one loader per registry language,
// shared promise per language (not cached on failure, so a transient error can
// be retried), and a sync facade that warms after the first resolve so lazy
// consumers can keep calling getScenarios() unchanged.
const registryLoaders = {
  // French is the largest authored scenario corpus. Keep it as a data asset so
  // ~40 KB of literal content does not count as executable JavaScript.
  fr: () => loadJsonAsset(FR_SCENARIOS_URL),
  de: () => import('./content/de.js').then((m) => m.DE_SCENARIOS),
  es: () => import('./content/es.js').then((m) => m.ES_SCENARIOS),
};
const registryCache = new Map();   // lang → promise (scenarios for that language)
const resolvedScenarios = new Map(); // lang → scenarios (once the promise lands)
function getRegisteredScenarios(lang) {
  if (!registryCache.has(lang)) {
    const loader = registryLoaders[lang] || (() => Promise.resolve([]));
    const p = loader()
      .then((scenarios) => {
        resolvedScenarios.set(lang, scenarios);
        return scenarios;
      })
      .catch(() => {
        registryCache.delete(lang);
        return [];
      });
    registryCache.set(lang, p);
  }
  return registryCache.get(lang);
}

/** Resolve the active language's scenarios lazily. */
export function getScenariosAsync() {
  return getRegisteredScenarios(contentLang());
}

export const DAILY_TOPICS = [
  { fr: "Décrivez votre petit-déjeuner idéal.", en: 'Describe your ideal breakfast.' },
  { fr: "Racontez la dernière fois que vous avez été en retard.", en: 'Tell the story of the last time you were late.' },
  { fr: "Quel est le meilleur conseil qu'on vous ait donné ?", en: "What's the best advice you've ever been given?" },
  { fr: "Décrivez votre ville à quelqu'un qui ne la connaît pas.", en: "Describe your town to someone who doesn't know it." },
  { fr: "Qu'est-ce que vous feriez avec un million d'euros ?", en: 'What would you do with a million euros?' },
  { fr: "Racontez un souvenir d'enfance.", en: 'Tell a childhood memory.' },
  { fr: "Pour ou contre les réseaux sociaux ?", en: 'For or against social media?' },
  { fr: "Décrivez votre film ou série préféré(e) sans dire le titre.", en: 'Describe your favourite film or series without saying the title.' },
  { fr: "Qu'est-ce qui vous rend heureux/heureuse un dimanche ?", en: 'What makes you happy on a Sunday?' },
  { fr: "Si vous pouviez dîner avec une personne célèbre, qui et pourquoi ?", en: 'If you could have dinner with someone famous, who and why?' },
  { fr: "Décrivez le pire repas de votre vie.", en: 'Describe the worst meal of your life.' },
  { fr: "Quelle habitude aimeriez-vous changer ?", en: 'Which habit would you like to change?' },
];

// Scenarios for the active target language. Functions (not consts) so the
// Arena, Home and search re-read them after the learner switches language.
// Every language serves [] from the sync facade until its registry resolves
// (App warms it at boot — see the useScenarios hook). French uses a JSON data
// asset; DE/ES use lazy JS registry modules.
export const getScenarios = () => resolvedScenarios.get(contentLang()) || [];
export const getScenario = (id) => getScenarios().find((s) => s.id === id) || getScenarios()[0];

// Speak is organised by situation, not chapter. Four everyday situations lead:
// café, school, directions, home. Each resolves to a full roleplay scenario.
// The scenario ids are FALLBACKS: DE/ES carry no 'bistro'/'maison' scenarios,
// so their cafés/homes resolve through these language-prefixed alternatives.
// (Before the fallbacks, getSituations() silently returned [] for DE/ES —
// the Speak tab's situation row vanished when learning German or Spanish.)
export const SITUATIONS = [
  { id: 'cafe', label: 'Au café', blurb: 'Order, ask, pay', scenarioId: 'bistro', fallbacks: ['de-cafe', 'es-cafe'] },
  { id: 'ecole', label: "À l'école", blurb: 'Ask for help in class', scenarioId: 'ecole' },
  { id: 'directions', label: 'Directions', blurb: 'Find your way in town', scenarioId: 'directions', fallbacks: ['de-directions', 'es-directions'] },
  { id: 'maison', label: 'À la maison', blurb: 'Chat at home', scenarioId: 'maison' },
];

/** Async view of getSituations — resolves the registry language first. */
export function getSituationsAsync() {
  return getScenariosAsync().then(getSituationsFrom);
}

export function getSituations() {
  return getSituationsFrom(getScenarios());
}

function getSituationsFrom(scenarios) {
  return SITUATIONS.map((sit) => {
    const ids = [sit.scenarioId, ...(sit.fallbacks || [])];
    return {
      ...sit,
      scenario: scenarios.find((s) => ids.includes(s.id)) || null,
    };
  }).filter((sit) => sit.scenario);
}

export const FLASHCARDS = [
  { id: 'du-coup', front: 'du coup', meaning: 'so / as a result', example: "Il pleuvait, du coup on est restés à la maison.", exampleTranslation: 'It was raining, so we stayed home.', register: 'Very common, informal' },
  { id: 'en-fait', front: 'en fait', meaning: 'actually / in fact', example: "En fait, je ne suis jamais allé à Paris.", exampleTranslation: "Actually, I've never been to Paris.", register: 'Universal, all registers' },
  { id: 'bref', front: 'bref', meaning: 'anyway / long story short', example: "Bref, on a raté le train.", exampleTranslation: 'Long story short, we missed the train.', register: 'Informal, wraps up a story' },
  { id: 'quand-meme', front: 'quand même', meaning: 'still / all the same', example: "C'est cher, mais c'est quand même très bon.", exampleTranslation: "It's expensive, but it's still really good.", register: 'Universal' },
  { id: 'genre', front: 'genre', meaning: 'like / kind of', example: "Il est arrivé genre deux heures en retard.", exampleTranslation: 'He arrived like two hours late.', register: 'Very informal, younger speakers' },
  { id: 'enfin', front: 'enfin', meaning: 'well / I mean', example: "Enfin, tu vois ce que je veux dire.", exampleTranslation: 'Well, you see what I mean.', register: 'Universal filler' },
  { id: 'franchement', front: 'franchement', meaning: 'honestly / frankly', example: "Franchement, c'était le meilleur concert de ma vie.", exampleTranslation: 'Honestly, it was the best concert of my life.', register: 'Informal emphasis' },
  { id: 'bah', front: 'bah', meaning: 'well / duh', example: "Bah oui, évidemment !", exampleTranslation: 'Well yes, obviously!', register: 'Very informal, spoken only' },
  { id: 'tu-vois', front: 'tu vois', meaning: 'you know / you see', example: "C'est compliqué, tu vois, il y a beaucoup d'étapes.", exampleTranslation: "It's complicated, you know, there are lots of steps.", register: 'Informal, conversational glue' },
  { id: 'carrement', front: 'carrément', meaning: 'totally / absolutely', example: "Ce resto est carrément incroyable.", exampleTranslation: 'This restaurant is totally amazing.', register: 'Informal, enthusiastic' },
];

export const randomTopic = () =>
  DAILY_TOPICS[Math.floor(Math.random() * DAILY_TOPICS.length)];
