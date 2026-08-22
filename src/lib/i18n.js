// One switch for the whole app's language. Points the content layer, the
// speech engine and the AI prompt layer at the chosen target language so a
// single call flips French → German → Spanish everywhere.

import { setContentLanguage, contentLang } from './content/active.js';
import { setSpeechLanguage } from './tts.js';
import { getLanguage } from './languages.js';

// The AI prompt layer (groq.js) is heavy and only needed before the first
// model call — load it lazily so importing i18n stays cheap for the eager
// bundle. The switch is fire-and-forget: it lands long before any request.
let aiLangModule = null;
function pushAiLanguage(id) {
  if (!aiLangModule) {
    aiLangModule = import('./groq.js').catch(() => { aiLangModule = null; return null; });
  }
  aiLangModule.then((m) => m?.setLanguage(id));
}

// The active target-language config, for UI copy ("Speak German out loud…").
export const activeLanguage = () => getLanguage(contentLang());
// Convenience for the very common "…French…" → "…German…" swaps in copy.
export const langName = () => activeLanguage().name;

export function syncLanguage(id) {
  const lang = getLanguage(id);
  setContentLanguage(lang.id);
  setSpeechLanguage(lang.id);
  pushAiLanguage(lang.id);
  // Screen readers must pronounce target-language content correctly: the UI
  // chrome stays English, so elements carry their own lang attributes.
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang.id;
  }
  return lang;
}
