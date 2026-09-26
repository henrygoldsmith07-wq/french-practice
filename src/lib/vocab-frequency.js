// Frequency lexicon → vocabulary packs.
//
// The high-frequency dictionaries (frequency.js for French, content/frequency-de
// and -es for German/Spanish) used to live only in the Reference tool. This
// folds every one of those words into the vocabulary packs so they are
// browsable, searchable and reviewable with the same SRS engine as the curated
// cards — without hand-writing thousands more card literals: the packs are
// built from the dictionary at module load.
//
// The Beta-language dictionaries are data assets, not JavaScript modules.
// They still load lazily for the active language, but keeping ~90 KB of static
// word lists out of executable JS creates real application-JS headroom and
// avoids parsing thousands of object literals before those languages are used.

import { FREQUENCY_WORDS } from './frequency.js';

// Map a coarse frequency band (rank 1–10) onto the card's freq label bucket
// (FREQ_LABELS in vocab.js: 1 Top 100 · 2 Top 500 · 3 Top 1000 · 4 Top 5000 · 5 Niche).
const freqBucket = (rank) => (rank <= 1 ? 1 : rank <= 3 ? 2 : rank <= 5 ? 3 : rank <= 8 ? 4 : 5);

// One deck per this many words — small enough to finish in a sitting, and the
// array is roughly frequency-ordered so lower packs are the more useful words.
const CHUNK = 150;

const ASSET_URLS = {
  de: new URL('../assets/content/frequency-de.tsv', import.meta.url),
  es: new URL('../assets/content/frequency-es.tsv', import.meta.url),
};

export function parseFrequencyAsset(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const first = line.indexOf('\t');
      const second = first < 0 ? -1 : line.indexOf('\t', first + 1);
      if (first <= 0 || second <= first + 1) return null;
      const rank = Number(line.slice(0, first));
      if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null;
      return {
        rank,
        fr: line.slice(first + 1, second),
        en: line.slice(second + 1),
      };
    })
    .filter((row) => row?.fr && row.en);
}

async function loadFrequencyAsset(lang) {
  const url = ASSET_URLS[lang];
  if (!url) return [];
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${lang} frequency dictionary`);
  return parseFrequencyAsset(await response.text());
}

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
  de: () => loadFrequencyAsset('de').then((words) => buildPacks(words, 'German', 'fqde')),
  es: () => loadFrequencyAsset('es').then((words) => buildPacks(words, 'Spanish', 'fqes')),
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
      deWordsPromise = loadFrequencyAsset('de').then(dedupeByTerm);
      deWordsPromise.catch(() => { deWordsPromise = null; });
    }
    return deWordsPromise;
  }
  if (lang === 'es') {
    if (!esWordsPromise) {
      esWordsPromise = loadFrequencyAsset('es').then(dedupeByTerm);
      esWordsPromise.catch(() => { esWordsPromise = null; });
    }
    return esWordsPromise;
  }
  return Promise.resolve([]);
}
