// Single source of truth for which language's *content* (vocab packs,
// scenarios, sentence pool) is live. Kept in its own tiny module so both
// vocab.js and data.js can read it without importing each other.
//
// Language changes also notify subscribers (a tiny pub/sub): the vocab
// library is a lazy chunk, and React hooks (useAllEntries) need a signal to
// reload it after the learner switches language mid-session.

let active = 'fr';
const listeners = new Set();

export const setContentLanguage = (id) => {
  const next = ['fr', 'de', 'es'].includes(id) ? id : 'fr';
  if (next === active) return;
  active = next;
  for (const fn of listeners) {
    try { fn(next); } catch { /* a broken subscriber must not break the switch */ }
  }
};
export const contentLang = () => active;

/** Subscribe to language switches; returns an unsubscribe function. */
export const onContentLanguageChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
