// Frequency lexicon → vocabulary packs.
//
// The high-frequency dictionaries (frequency.js for French, content/frequency-de
// and -es for German/Spanish) used to live only in the Reference tool. This
// folds every one of those words into the vocabulary packs so they are
// browsable, searchable and reviewable with the same SRS engine as the curated
// cards — without hand-writing thousands more card literals: the packs are
// built from the dictionary at module load.
//
// Each language's dictionary is loaded through its own async loader so the
// OTHER languages' dictionaries split into lazy chunks and never weigh down
// the active language's graph (getPacksFor(lang) is only called for the
// active language — the loaders for the other two never even start).

import { FREQUENCY_WORDS } from './frequency.js';

// Map a coarse frequency band (rank 1–10) onto the card's freq label bucket
// (FREQ_LABELS in vocab.js: 1 Top 100 · 2 Top 500 · 3 Top 1000 · 4 Top 5000 · 5 Niche).
const freqBucket = (rank) => (rank <= 1 ? 1 : rank <= 3 ? 2 : rank <= 5 ? 3 : rank <= 8 ? 4 : 5);

// One deck per this many words — small enough to finish in a sitting, and the
// array is roughly frequency-ordered so lower packs are the more useful words.
const CHUNK = 150;

// Drop repeated head-words (kept first, i.e. the most frequent sense) so a term
// that recurs across bands doesn't appear twice in the decks or the dictionary.
export function dedupeByTerm(words) {
  const seen = new Set();
  const out = [];
  for (const wd of words) {
    if (seen.has(wd.fr)) continue;
    seen.add(wd.fr);
    out.push(wd);
  }
  return out;
}

// Build frequency decks for one language. `adjective` names the language in the
// deck description ("the 1–150 most common German words").
function buildPacks(words, adjective, prefix) {
  const unique = dedupeByTerm(words);
  const packs = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const start = i + 1;
    const end = i + slice.length;
    packs.push({
      id: `freq-${packs.length + 1}`,
      title: `Frequency ${start}–${end}`,
      description: `The ${start}–${end} most common ${adjective} words.`,
      entries: slice.map((wd, j) => ({
        id: `${prefix}-${i + j}`,
        fr: wd.fr,
        en: wd.en,
        emoji: '',
        freq: freqBucket(wd.rank),
        example: '',
        exampleEn: '',
        syn: [],
        ant: [],
        coll: [],
        note: wd.ipa ? `IPA ${wd.ipa}` : '',
      })),
    });
  }
  return packs;
}

// French is composed eagerly — it is the default content language, so its
// dictionary is needed on the very first render and must stay synchronous.
export const FREQUENCY_PACKS = buildPacks(FREQUENCY_WORDS, 'French', 'fq');

// German and Spanish load on demand: the promise is shared per language and
// not cached on failure, so a transient error can be retried.
const loaders = {
  de: () => import('./content/frequency-de.js').then((m) => buildPacks(m.FREQUENCY_WORDS_DE, 'German', 'fqde')),
  es: () => import('./content/frequency-es.js').then((m) => buildPacks(m.FREQUENCY_WORDS_ES, 'Spanish', 'fqes')),
};
const cache = new Map();
export function getFrequencyPacksFor(lang) {
  if (lang === 'fr') return Promise.resolve(FREQUENCY_PACKS);
  if (!cache.has(lang)) {
    const p = (loaders[lang] || (() => Promise.resolve([])))().catch(() => {
      cache.delete(lang);
      return [];
    });
    cache.set(lang, p);
  }
  return cache.get(lang);
}

// The deduped word lists, for the offline dictionary (per language). French is
// synchronous; DE/ES resolve their dictionaries on demand so the Reference
// tool's German/Spanish dictionaries also stay out of the eager graph.
let deWordsPromise = null;
let esWordsPromise = null;
export function getFrequencyWordsFor(lang) {
  if (lang === 'fr') return Promise.resolve(dedupeByTerm(FREQUENCY_WORDS));
  if (lang === 'de') {
    if (!deWordsPromise) {
      deWordsPromise = import('./content/frequency-de.js').then((m) => dedupeByTerm(m.FREQUENCY_WORDS_DE));
      deWordsPromise.catch(() => { deWordsPromise = null; });
    }
    return deWordsPromise;
  }
  if (lang === 'es') {
    if (!esWordsPromise) {
      esWordsPromise = import('./content/frequency-es.js').then((m) => dedupeByTerm(m.FREQUENCY_WORDS_ES));
      esWordsPromise.catch(() => { esWordsPromise = null; });
    }
    return esWordsPromise;
  }
  return Promise.resolve([]);
}
