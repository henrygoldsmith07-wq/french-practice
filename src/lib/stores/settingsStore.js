// Settings store — learner preferences and provider-key management:
// app settings (tts, theme, level, daily goal…), personalisation prefs, and
// the AI provider key with its env fallback.
//
// Extracted from storage.js (stores pattern). Keys, shapes and behaviour are
// byte-identical — storageCore owns the key map and the learner-routing
// primitives.
import { read, write, KEYS } from '../storageCore.js';

// Key resolution: a key saved in Settings wins; otherwise a build-time env
// key (VITE_AI_API_KEY in .env.local) pre-configures the studio so the app
// is AI-ready out of the box. The env key is never written to localStorage
// and never included in exports.
export const getApiKey = () => {
  const stored = read(KEYS.apiKey, '');
  if (stored) return stored;
  try {
    return import.meta.env?.VITE_AI_API_KEY || import.meta.env?.VITE_OPENROUTER_API_KEY || '';
  } catch {
    return '';
  }
};
export const setApiKey = (k) => write(KEYS.apiKey, k);
export const clearApiKey = () => localStorage.removeItem(KEYS.apiKey);

const DEFAULT_SETTINGS = {
  ttsRate: 1,
  mockMode: false,
  devPanel: false,
  theme: null,
  level: 'B1',
  dailyGoal: 30,
  weeklyGoal: 150,
  smartReminders: false,
  name: '',
  language: 'fr', // the language being studied right now: fr | de | es
  // Every language the learner signed up for. Empty means "derive from
  // `language`", which is what settings saved before multi-language look
  // like — normaliseLanguages() does that, so upgrading never reassigns
  // someone studying German to the French default.
  languages: [],
  timezone: null, // IANA tz, detected at onboarding — frames reminder copy
  // accessibility preferences (applied as classes on <html>)
  reduceMotion: false,
  largeText: false,
  dyslexiaFont: false,
  highContrast: false,
  examBoard: null, // null | gcse-aqa | gcse-edexcel | a-level-aqa | delf-b1 | delf-b2
  correctionFrequency: 'adaptive', // adaptive | every-turn | important | end | off
};
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) });
export const setSettings = (s) => write(KEYS.settings, s);

// ---- personalisation preferences ----

const DEFAULT_PREFS = {
  learningStyle: 'balanced', // balanced | conversation | grammar | vocabulary | immersion
  lessonLength: 'medium', // short | medium | long
  adaptiveDifficulty: true, // nudge effective difficulty from recent scores
  favouriteTopics: [], // subset of TOPIC ids
};
export const getPrefs = () => ({ ...DEFAULT_PREFS, ...read(KEYS.prefs, {}) });
export const setPrefs = (p) => write(KEYS.prefs, { ...getPrefs(), ...p });