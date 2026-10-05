// Frequency lexicon → vocabulary packs.
//
// The high-frequency dictionaries used to live as JavaScript modules (about
// 44 KB of object literals for French alone), which every chunk importing
// vocab.js had to parse before it could do anything. They are data assets now
// — `frequency-fr.tsv` / -de / -es — loaded on demand in the same shape the
// DE/ES dictionaries already used, so application-JS stays lean and the word
// lists download once through the service worker's cache (offline-safe like
// every other content asset). Packs are built from the dictionary after the
// load: no hand-written card literals.
//
// Node (tests, content scripts) has no fetch for file: URLs, so the loader
// falls back to reading the asset from disk — the browser path is unchanged
// and the tests need no shims.

const ASSET_URLS = {
  fr: new URL('../assets/content/frequency-fr.tsv', import.meta.url),
  de: new URL('../assets/content/frequency-de.tsv', import.meta.url),
  es: new URL('../assets/content/frequency-es.tsv', import.meta.url),
};

// Worked example sentences live in their own asset rather than as extra columns
// on the frequency lexicon: the lexicon is a word list, the examples are prose,
// and the two are authored at very different rates. A language with no
// examples yet simply has no entry here, and loadExamples yields an empty map
// for it — a missing example file is never a load failure.
const EXAMPLE_URLS = {
  de: new URL('../assets/content/examples-de.tsv', import.meta.url),
  es: new URL('../assets/content/examples-es.tsv', import.meta.url),
};

// Map a coarse frequency band (rank 1–10) onto the card's freq label bucket
// (FREQ_LABELS in vocab.js: 1 Top 100 · 2 Top 500 · 3 Top 1000 · 4 Top 5000 · 5 Niche).
const freqBucket = (rank) => (rank <= 1 ? 1 : rank <= 3 ? 2 : rank <= 5 ? 3 : rank <= 8 ? 4 : 5);

// One deck per this many words — small enough to finish in a sitting, and the
// array is roughly frequency-ordered so lower packs are the more useful words.
const CHUNK = 150;

export function parseFrequencyAsset(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      // rank \t term \t gloss, with an optional 4th column for IPA. Parse by
      // explicit columns: a 3-column row must NOT be read as carrying IPA in
      // its gloss (that was the bug this shape change fixed).
      const cells = line.split('\t');
      if (cells.length < 3) return null;
      const rank = Number(cells[0]);
      if (!Number.isInteger(rank) || rank < 1 || rank > 10) return null;
      return {
        rank,
        fr: cells[1],
        en: cells[2],
        ipa: cells[3] || undefined,
      };
    })
    .filter((row) => row?.fr && row.en);
}

async function fetchAssetText(url) {
  // Node: fetch cannot read file: URLs (tests and content scripts run here).
  // Read the file directly so the asset is the single source of truth in both
  // environments — no duplicated JS copy to drift. The specifier is indirect
  // on purpose: the bundler must not chase 'node:fs' into the browser graph.
  // globalThis, not bare `process`: the browser lint surface has no Node globals.
  const nodeRuntime = globalThis.process?.versions?.node;
  if (nodeRuntime && url.protocol === 'file:') {
    const nodeFs = 'node:fs/promises';
    const { readFile } = await import(/* @vite-ignore */ nodeFs);
    return readFile(url, 'utf8');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load frequency dictionary');
  return response.text();
}

async function loadFrequencyAsset(lang) {
  const url = ASSET_URLS[lang];
  if (!url) return [];
  return parseFrequencyAsset(await fetchAssetText(url));
}

// Drop repeated head-words so a term that recurs across bands doesn't appear
// twice in the decks or the dictionary — but MERGE their glosses rather than
// discarding the later ones.
//
// Dropping was lossy in a way that mattered: German `sein` appears twice, as
// the possessive "his / its" and as the verb "to be", and the second meaning
// was being thrown away entirely. A learner seeing only "his / its" has no way
// to learn the verb, which is the use they meet first. Identical glosses (most
// repeats are just the source listing a word in two bands) collapse to one, so
// the common case is unchanged.
export function dedupeByTerm(words) {
  const byTerm = new Map();
  const out = [];
  for (const wd of words) {
    const seen = byTerm.get(wd.fr);
    if (seen) {
      if (wd.en && !seen.en.includes(wd.en)) seen.en = `${seen.en}; ${wd.en}`;
      // Keep the earliest (most frequent) rank; examples are attached later.
      continue;
    }
    byTerm.set(wd.fr, wd);
    out.push(wd);
  }
  return out;
}

// A themed pack teaches its head-word properly — article, a worked example
// sentence, sometimes a `note` with the conjugated forms. The frequency deck
// teaches the same word as a bare gloss with no example at all. Shipping both
// means the learner meets the word twice, and the bare copy is always the
// weaker card, so the themed pack wins.
//
// Comparison is exact first, then a second pass that ignores a leading definite
// article, because themed entries carry "der/die/das" or "el/la/los/las" while
// the frequency dictionary stores the bare stem.
const LEADING_ARTICLE = {
  de: /^(der|die|das)\s+/i,
  es: /^(el|la|los|las)\s+/i,
};

export function dropThemedDuplicates(themedPacks, freqPacks, lang) {
  const themed = themedPacks.flatMap((p) => p.entries || []);
  const exact = new Set(themed.map((e) => e.fr));
  const article = LEADING_ARTICLE[lang];
  const stemmed = article
    ? new Set(themed.map((e) => e.fr.replace(article, '').toLowerCase()))
    : null;
  const isDuplicate = (term) => (
    exact.has(term) || Boolean(stemmed && stemmed.has(term.replace(article, '').toLowerCase()))
  );

  return freqPacks
    .map((pack) => {
      const entries = (pack.entries || []).filter((e) => !isDuplicate(e.fr));
      return entries.length === pack.entries.length ? pack : { ...pack, entries };
    })
    // A deck can lose its last word once the overlap is removed; drop the shell
    // rather than ship an empty "Frequency 151–150" card list.
    .filter((pack) => pack.entries.length > 0);
}

// Parse `term \t example \t exampleEn`. Both languages are required to give an
// example in BOTH — a target sentence with no translation (or the reverse) is
// worse than no example, because the card then teaches something the learner
// cannot check.
export function parseExamplesAsset(text) {
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const cells = line.split('\t');
    if (cells.length < 3) continue;
    const [term, example, exampleEn] = cells;
    if (!term || !example || !exampleEn) continue;
    if (!out.has(term)) out.set(term, { example: example.trim(), exampleEn: exampleEn.trim() });
  }
  return out;
}

const exampleCache = new Map();
// A language with no examples asset resolves to an EMPTY map, so the decks build
// exactly as they did before — examples are additive, never a dependency.
async function loadExamples(lang) {
  const url = EXAMPLE_URLS[lang];
  if (!url) return new Map();
  if (!exampleCache.has(lang)) {
    const p = fetchAssetText(url)
      .then((text) => parseExamplesAsset(text))
      .catch(() => new Map());
    p.catch(() => exampleCache.delete(lang));
    exampleCache.set(lang, p);
  }
  return exampleCache.get(lang);
}

// Build frequency decks for one language. `adjective` names the language in the
// deck description ("the 1–150 most common German words").
function buildPacks(words, adjective, prefix, examples = new Map()) {
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
        // A frequency card used to be a bare gloss with nothing showing how the
        // word is used. Where an example exists it is attached here, matched on
        // the exact head-word; words without one still build (example '').
        example: examples.get(wd.fr)?.example || '',
        exampleEn: examples.get(wd.fr)?.exampleEn || '',
        syn: [],
        ant: [],
        coll: [],
        note: wd.ipa ? `IPA ${wd.ipa}` : '',
      })),
    });
  }
  return packs;
}

// French frequency decks: built from the TSV asset like DE/ES. The exported
// array is MUTATED in place when the asset resolves, so every consumer that
// spread it earlier keeps one stable reference and simply sees it fill in —
// the same publish-then-serve contract the language registries use. Until it
// resolves the array is empty (resolved-empty, not an error).
export const FREQUENCY_PACKS = [];
let frPacksPromise = null;
function ensureFrenchPacks() {
  if (!frPacksPromise) {
    frPacksPromise = loadFrequencyAsset('fr')
      .then((words) => {
        const packs = buildPacks(words, 'French', 'fq');
        FREQUENCY_PACKS.push(...packs);
        return FREQUENCY_PACKS;
      })
      .catch(() => { frPacksPromise = null; return FREQUENCY_PACKS; });
  }
  return frPacksPromise;
}

// All three languages load on demand: the promise is shared per language and
// not cached on failure, so a transient error can be retried.
const loaders = {
  fr: ensureFrenchPacks,
  // Lexicon and examples resolve together, so a deck is never built half-way:
  // either the word arrives with its example or without one at all.
  de: () => Promise.all([loadFrequencyAsset('de'), loadExamples('de')])
    .then(([words, examples]) => buildPacks(words, 'German', 'fqde', examples)),
  es: () => Promise.all([loadFrequencyAsset('es'), loadExamples('es')])
    .then(([words, examples]) => buildPacks(words, 'Spanish', 'fqes', examples)),
};
const cache = new Map();
export function getFrequencyPacksFor(lang) {
  if (lang === 'fr') return ensureFrenchPacks();
  if (!cache.has(lang)) {
    const p = (loaders[lang] || (() => Promise.resolve([])))().catch(() => {
      cache.delete(lang);
      return [];
    });
    cache.set(lang, p);
  }
  return cache.get(lang);
}

// The deduped word lists, for the offline dictionary (per language). DE/ES
// resolve their dictionaries on demand so the Reference tool's dictionaries
// stay out of the eager graph; French resolves the same way now.
const wordListPromises = new Map();
export function getFrequencyWordsFor(lang) {
  if (!ASSET_URLS[lang]) return Promise.resolve([]);
  if (!wordListPromises.has(lang)) {
    const p = loadFrequencyAsset(lang).then(dedupeByTerm);
    p.catch(() => { wordListPromises.delete(lang); });
    wordListPromises.set(lang, p);
  }
  return wordListPromises.get(lang);
}
