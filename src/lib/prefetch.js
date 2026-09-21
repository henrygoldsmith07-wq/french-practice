// Intelligent prefetching — the replacement for useStudioBoot's blanket
// "idle-import every screen chunk" warm-up.
//
// The old warm-up downloaded almost the whole app a few seconds after
// startup, which showed up as a large early-session transfer even though the
// first-load JS looked modest. This module replaces it with a signal-based
// policy:
//
//   · the ACTIVE LANGUAGE decides — French-only screens (grammar topics,
//     culture essays, the learning path) are never prefetched for Beta
//     languages, whatever every other signal says;
//   · the CONNECTION decides the depth — saveData or a 2G-class link
//     prefetches nothing (chunks load on demand), 3G gets only the
//     most-likely-next screens, 4G/unknown gets the full tiered plan;
//   · TIME decides the tiers — the Speak/Review dependencies land in the
//     first idle window, everything else core-loop in a later one;
//   · INTENT beats the plan — hovering/focusing a nav tab prefetches that
//     tab's chunk immediately (unless saveData, where the user explicitly
//     asked us not to speculate).
//
// The plan itself is a pure function (unit-tested without a browser); this
// module only wraps it with the real signals and the dynamic imports.

import { hasCapability } from './capabilities.js';
import { contentLang } from './content/active.js';

// Screen registry: name → { load, capability }. `capability` names the row in
// capabilities.js the screen is authored against; a screen with a capability
// the active language doesn't offer is never prefetched (it is also hidden in
// the UI — this closes the download side of the same honesty gate).
export const PREFETCH_SCREENS = {
  ChatArena: { load: () => import('../components/ChatArena'), capability: 'conversation' },
  Vocabulary: { load: () => import('../components/Vocabulary'), capability: 'vocabulary' },
  SessionDashboard: { load: () => import('../components/SessionDashboard'), capability: 'conversation' },
  GlobalSearch: { load: () => import('../components/GlobalSearch'), capability: 'vocabulary' },
  SettingsModal: { load: () => import('../components/SettingsModal'), capability: 'conversation' },
  Skills: { load: () => import('../components/Skills'), capability: 'dictation' },
  AiHub: { load: () => import('../components/AiHub'), capability: 'conversation' },
  Reference: { load: () => import('../components/Reference'), capability: 'vocabulary' },
  Analytics: { load: () => import('../components/Analytics'), capability: 'conversation' },
  Profile: { load: () => import('../components/Profile'), capability: 'conversation' },
  RealWorld: { load: () => import('../components/RealWorld'), capability: 'scenario-speaking' },
  Personalise: { load: () => import('../components/Personalise'), capability: 'conversation' },
  Offline: { load: () => import('../components/Offline'), capability: 'conversation' },
  FieldNotes: { load: () => import('../components/FieldNotes'), capability: 'field-notes' },
  Focus: { load: () => import('../components/Focus'), capability: 'conversation' },
  Grammar: { load: () => import('../components/Grammar'), capability: 'grammar' },
  Culture: { load: () => import('../components/Culture'), capability: 'culture' },
  LearningPath: { load: () => import('../components/LearningPath'), capability: 'learning-path' },
  PathSetup: { load: () => import('../components/PathSetup'), capability: 'learning-path' },
};

// Most-likely-next screens: the five-tab bar is Today | Speak | Review |
// Learn | Progress — Speak and Review are the lazy ones, and the two most
// common post-conversation flows are the session debrief and search.
export const EARLY_SCREENS = ['ChatArena', 'Vocabulary', 'SessionDashboard', 'GlobalSearch', 'SettingsModal'];

// Core-loop screens a session may reach later; lower priority than EARLY.
export const IDLE_SCREENS = ['Skills', 'AiHub', 'Reference', 'Analytics', 'Profile', 'RealWorld', 'Personalise', 'Offline', 'FieldNotes', 'Focus'];

// French-authored screens: offered for the active language only when its
// capability row says so (full support = French today).
export const FULL_ONLY_SCREENS = ['Grammar', 'Culture', 'LearningPath', 'PathSetup'];

export const screensForLanguage = (screens, languageId) =>
  screens.filter((name) => {
    const entry = PREFETCH_SCREENS[name];
    return entry && hasCapability(entry.capability, languageId);
  });

/**
 * The pure prefetch plan. `signals`:
 *   saveData      — navigator.connection?.saveData (user asked to save data)
 *   effectiveType — navigator.connection?.effectiveType ('4g', '3g', '2g', …)
 *   languageId    — the active target language ('fr' | 'de' | 'es')
 * Returns { early, idle } screen names. Never includes a screen the active
 * language doesn't offer.
 */
export function prefetchPlan({ saveData = false, effectiveType = '4g', languageId = 'fr' } = {}) {
  const offered = (names) => screensForLanguage(names, languageId);
  if (saveData) return { early: [], idle: [] };
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return { early: [], idle: [] };
  const early = offered(EARLY_SCREENS);
  if (effectiveType === '3g') return { early, idle: [] };
  return {
    early,
    idle: [...offered(IDLE_SCREENS), ...(hasCapability('grammar', languageId) ? offered(FULL_ONLY_SCREENS) : [])],
  };
}

/** The real connection signals, defensively read (API is Chromium-only). */
export function connectionProfile() {
  try {
    const c = typeof navigator !== 'undefined' ? navigator.connection : null;
    return {
      saveData: Boolean(c?.saveData),
      effectiveType: String(c?.effectiveType || '4g'),
    };
  } catch {
    return { saveData: false, effectiveType: '4g' };
  }
}

// ---- execution -------------------------------------------------------------

const started = new Set();

/** Kick off one screen chunk (idempotent). Returns the import promise. */
export function prefetchScreen(name) {
  const entry = PREFETCH_SCREENS[name];
  if (!entry || started.has(name)) return null;
  started.add(name);
  return entry.load().catch(() => { started.delete(name); }); // retriable on next intent
}

/** The tab → chunk map for intent prefetching from the nav bar. */
export const TAB_SCREENS = {
  today: [],
  speak: ['ChatArena'],
  review: ['Vocabulary'],
  learn: ['Skills'],
  progress: ['Analytics'],
};

/**
 * Intent prefetch: the user is pointing at (or focused on) a nav tab. Strong
 * enough a signal to load immediately — except under saveData, where the
 * user explicitly asked us not to download ahead of need.
 */
export function prefetchForTab(tabId) {
  if (connectionProfile().saveData) return;
  for (const name of TAB_SCREENS[tabId] || []) prefetchScreen(name);
}

/**
 * Run the plan across two idle windows (early, then idle). Returns a cancel
 * function. French-only screens drop out automatically if the language
 * switches before their window runs — each window re-derives the plan from
 * the live content language.
 */
export function scheduleBootPrefetch({ earlyDelayMs = 800, idleDelayMs = 3500 } = {}) {
  const timers = [];
  const runTier = (tier, delay) => {
    timers.push(setTimeout(() => {
      const plan = prefetchPlan({ ...connectionProfile(), languageId: contentLang() });
      for (const name of plan[tier]) prefetchScreen(name);
    }, delay));
  };
  runTier('early', earlyDelayMs);
  runTier('idle', idleDelayMs);
  return () => timers.forEach(clearTimeout);
}
