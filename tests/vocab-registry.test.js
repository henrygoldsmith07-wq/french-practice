// Per-language vocab registry: the split that keeps DE/ES dictionaries out of
// the French graph (and vice versa). These tests pin the contract:
//   - each registry composes themed packs + frequency decks
//   - the sync facade warms after one async resolve (lazy screens unchanged)
//   - entry ids stay unique across languages (SRS ids must never collide)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setContentLanguage, contentLang } from '../src/lib/content/active.js';
import {
  getVocabPacks, getVocabPacksAsync, allEntries, allEntriesAsync,
} from '../src/lib/vocab.js';
import { getDePacks } from '../src/lib/content/de-packs.js';
import { getEsPacks } from '../src/lib/content/es-packs.js';
import { dedupeByTerm } from '../src/lib/vocab-frequency.js';
import {
  getScenarios, getScenariosAsync, getSituations,
} from '../src/lib/data.js';

// Browser builds fetch the lazy TSV assets normally. Node's native fetch does
// not implement file: URLs, so make that one transport available in this test
// process without changing the production loader contract.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input : new URL(input);
  if (url.protocol === 'file:') {
    const body = await readFile(url, 'utf8');
    return { ok: true, text: async () => body };
  }
  return nativeFetch(input, init);
};

describe('per-language vocab registries', () => {
  it('de/es registries compose themed packs plus frequency decks', async () => {
    const de = await getDePacks();
    const es = await getEsPacks();
    for (const [lang, packs] of [['de', de], ['es', es]]) {
      assert.ok(packs.length > 3, `${lang} has themed packs`);
      assert.ok(packs.some((p) => p.id.startsWith(`freq-${lang === 'de' ? 'de' : 'es'}`) || p.id.startsWith('freq-')),
        `${lang} has frequency decks`);
      const entries = packs.flatMap((p) => p.entries);
      assert.ok(entries.length > 100, `${lang} carries a real dictionary (${entries.length} entries)`);
      for (const e of entries.slice(0, 50)) {
        assert.ok(e.id && e.fr && typeof e.en === 'string', `${lang} entry ${e.id} is well-formed`);
      }
    }
  });

  it('de and es registries do not share entry ids (SRS ids must never collide)', async () => {
    const [de, es] = await Promise.all([getDePacks(), getEsPacks()]);
    const deIds = new Set(de.flatMap((p) => p.entries.map((e) => e.id)));
    const esIds = es.flatMap((p) => p.entries.map((e) => e.id));
    const clash = esIds.filter((id) => deIds.has(id));
    assert.deepEqual(clash, [], `DE/ES id collisions: ${clash.slice(0, 5).join(', ')}`);
  });

  it('sync facade serves [] for a registry language before warm-up', () => {
    setContentLanguage('de');
    assert.equal(contentLang(), 'de');
    // Cold start: the registry chunk has not been imported on this path —
    // the sync facade must return an array (never throw, never undefined).
    assert.deepEqual(getVocabPacks(), []);
    setContentLanguage('fr');
  });

  it('after one async resolve the sync facade serves the registry language', async () => {
    setContentLanguage('es');
    const asyncPacks = await getVocabPacksAsync();
    assert.ok(asyncPacks.length > 0, 'async path resolves packs');
    const syncPacks = getVocabPacks();
    assert.equal(syncPacks.length, asyncPacks.length, 'sync facade warmed');
    assert.deepEqual(allEntries().map((e) => e.id), (await allEntriesAsync()).map((e) => e.id),
      'sync and async entry views agree after warm-up');
    setContentLanguage('fr');
  });

  it('the French sync library never changes shape across language switches', () => {
    const before = allEntries().length;
    assert.ok(before > 100, `French library is real (${before} entries)`);
    setContentLanguage('de');
    setContentLanguage('fr');
    assert.equal(allEntries().length, before, 'switching away and back preserves the French library');
  });

  it('frequency dictionaries dedupe repeated head-words per language', () => {
    // dedupeByTerm keeps the first (most frequent) sense; every language's
    // buildPacks depends on this, so pin it once here.
    const deduped = dedupeByTerm([
      { fr: 'der', en: 'the', rank: 1 },
      { fr: 'der', en: 'the (rel.)', rank: 4 },
      { fr: 'und', en: 'and', rank: 2 },
    ]);
    assert.deepEqual(deduped.map((w) => w.fr), ['der', 'und']);
  });

  it('scenario registry: sync facade serves [] for every language before warm-up', async () => {
    assert.equal(contentLang(), 'fr');
    assert.deepEqual(await getScenariosAsync().then((s) => s.length > 5), true, 'FR registry resolves real scenarios');
    assert.ok(getScenarios().length > 5, 'FR sync facade warmed by the async resolve');
    setContentLanguage('de');
    assert.deepEqual(getScenarios(), [], 'DE cold start: resolved-empty, never a throw');
    setContentLanguage('es');
    assert.deepEqual(getScenarios(), [], 'ES cold start: resolved-empty');
    setContentLanguage('fr');
  });

  it('scenario registry: async resolve warms the sync facade (same contract as vocab)', async () => {
    setContentLanguage('de');
    const asyncScenarios = await getScenariosAsync();
    assert.ok(asyncScenarios.length > 5, 'DE registry resolves real scenarios');
    assert.equal(getScenarios().length, asyncScenarios.length, 'sync facade warmed by the async resolve');
    const ids = asyncScenarios.map((s) => s.id);
    assert.ok(ids.every((id) => id.startsWith('de-')), 'DE scenario ids are namespaced');
    setContentLanguage('fr');
    // ES resolves from its own registry — not DE's.
    setContentLanguage('es');
    const esIds = (await getScenariosAsync()).map((s) => s.id);
    assert.ok(esIds.every((id) => id.startsWith('es-')), 'ES scenario ids are namespaced');
    assert.equal(new Set(ids).intersection(new Set(esIds)).size, 0, 'no DE/ES scenario id collisions');
    setContentLanguage('fr');
  });

  it('scenario registry: getSituations filters to scenarios that exist in the active language', async () => {
    setContentLanguage('de');
    await getScenariosAsync();
    const situations = getSituations();
    assert.ok(situations.length > 0, 'DE resolves at least one of the four situations');
    for (const sit of situations) {
      assert.ok(sit.scenario, `situation ${sit.id} resolved to a real scenario`);
      assert.ok(sit.scenario.id.startsWith('de-'));
    }
    setContentLanguage('fr');
    assert.ok(getSituations().every((sit) => sit.scenario), 'French resolves all four situations');
  });
});
