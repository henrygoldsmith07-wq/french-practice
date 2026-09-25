// Per-language pronunciation profiles + learner-routed persistence.
//
// Pronunciation is offered to fr/de/es, so the phoneme catalogue, the tips,
// the minimal pairs and the persisted weakness stats must all follow the
// ACTIVE content language — French phonology (/ʁ/, nasals, liaison) must
// never surface as German or Spanish training. Stats live under
// KEYS.phonemeProfile through storageCore, which is learner-routed, so
// household members never share pronunciation weaknesses.
//
// Run: node --test tests/pronunciation-profiles.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PHONEMES, PHONEMES_DE, PHONEMES_ES,
  phonemesFor, getPhonemeProfile, recordPhonemeAttempt,
  weakestPhonemes, nextMinimalPair,
} from '../src/lib/phonemeProfile.js';
import { analyzePhonology, analyzeTargetText } from '../src/lib/phonologicalScore.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

// Fresh profile/score module graph per test. NOTE: content/active.js is a
// STATEFUL SINGLETON — it is deliberately NOT cache-busted, because the
// profile and score modules resolve their own `./content/active.js` import
// to exactly this un-cached instance. Setting the language here therefore
// governs what the fresh profile modules see; each test restores 'fr' after
// itself so other test files sharing the process keep the default.
const active = await import('../src/lib/content/active.js');

async function freshModules(lang) {
  globalThis.localStorage = memoryStorage();
  const q = `pron-${lang}-${Date.now()}-${Math.random()}`;
  active.setContentLanguage(lang);
  const profile = await import(`../src/lib/phonemeProfile.js?${q}`);
  const score = await import(`../src/lib/phonologicalScore.js?${q}`);
  return { active, profile, score };
}

test('each language has its own phoneme catalogue with distinct ids', () => {
  const frIds = new Set(PHONEMES.map((p) => p.id));
  const deIds = new Set(PHONEMES_DE.map((p) => p.id));
  const esIds = new Set(PHONEMES_ES.map((p) => p.id));
  assert.ok(frIds.has('r') && frIds.has('nasal-an') && frIds.has('liaison'), 'French profile keeps its classic contrasts');
  assert.ok(deIds.has('de-ich-ach') && deIds.has('de-devoicing') && deIds.has('de-u-u'), 'German profile: ich/ach, devoicing, ü');
  assert.ok(esIds.has('es-r') && esIds.has('es-bv') && esIds.has('es-vowels'), 'Spanish profile: r, b/v, vowels');
  for (const id of [...deIds, ...esIds]) {
    assert.ok(!frIds.has(id), `French-only id ${id} must not collide across profiles`);
  }
  assert.equal(phonemesFor('de'), PHONEMES_DE);
  assert.equal(phonemesFor('es'), PHONEMES_ES);
  assert.equal(phonemesFor('fr'), PHONEMES);
});

test('the active language picks the catalogue, weaknesses and minimal pairs', async () => {
  const { active, profile } = await freshModules('de');
  profile.recordPhonemeAttempt('de-ich-ach', { correct: false, confidence: 0.3 });
  profile.recordPhonemeAttempt('de-ich-ach', { correct: false, confidence: 0.3 });
  profile.recordPhonemeAttempt('de-ich-ach', { correct: false, confidence: 0.3 });

  // German attempt → German catalogue, German weakness, German pair.
  const weak = profile.weakestPhonemes(3);
  assert.ok(weak.length === 1 && weak[0].id === 'de-ich-ach', 'the German miss lands in the German bucket');
  const pair = profile.nextMinimalPair('de-ich-ach');
  assert.ok(pair, 'a German pair exists');
  assert.ok(!/roux|tu|vent|bon/.test(pair.join(' ')), 'no French words in a German minimal pair');

  // The French profile is untouched by German practice — the stats are
  // stored per language, so switching content language never mixes them.
  active.setContentLanguage('fr');
  assert.deepEqual(profile.weakestPhonemes(3), [], 'French weaknesses stay empty after German attempts');
});

test('phonological analysis speaks the active language, never French labels for German/Spanish', async () => {
  // Tone-burst audio so the acoustic components actually engage.
  const RATE = 16000;
  const sine = (hz, sec, amp = 0.3) => {
    const out = new Float32Array(Math.round(RATE * sec));
    for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / RATE);
    return out;
  };
  const silence = (sec) => new Float32Array(Math.round(RATE * sec));
  const concat = (...parts) => {
    const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const audio = (bursts) => {
    const parts = [];
    for (let i = 0; i < bursts; i++) { parts.push(sine(220, 0.18, 0.4)); parts.push(silence(0.12)); }
    const pcm = concat(...parts);
    return { pcm, sampleRate: RATE, durationSec: pcm.length / RATE };
  };

  const { active, score } = await freshModules('de');
  // Rad/Tag-style final devoicing site + enough syllables for rhythm.
  const de = score.analyzePhonology({ target: 'Ich habe den Tag und den Rad gesehen', accuracy: 80, audio: audio(5) });
  const deIds = de.components.map((c) => c.id);
  assert.ok(!deIds.includes('liaison') && !deIds.includes('nasal') && !deIds.includes('u-ou'), 'no French components on a German attempt');
  assert.ok(deIds.includes('de-devoicing'), 'German devoicing site detected');
  if (de.weakest) {
    assert.match(de.weakest.id, /^(de-|rhythm|intonation|voicing|intelligibility)/, 'weakest component is a German or universal one');
  }

  active.setContentLanguage('es');
  const es = score.analyzePhonology({ target: 'El perro de Roque corre por la roca', accuracy: 80, audio: audio(5) });
  const esIds = es.components.map((c) => c.id);
  assert.ok(!esIds.includes('liaison') && !esIds.includes('nasal'), 'no French components on a Spanish attempt');
  assert.ok(esIds.includes('es-r') || esIds.includes('es-vowels'), 'Spanish-specific or universal components only');

  active.setContentLanguage('fr');
  const fr = score.analyzePhonology({ target: 'les amis arrivent ce soir', accuracy: 80, audio: audio(4) });
  assert.ok(fr.components.some((c) => c.id === 'liaison'), 'French keeps its liaison analysis');
});

test('profile persistence is learner-routed through storageCore', async () => {
  const core = await import('../src/lib/storageCore.js');
  assert.equal(core.isLearnerKey(core.KEYS.phonemeProfile), true, 'phoneme profile must be learner-owned');
  assert.equal(core.isLearnerKey(core.KEYS.path), true, 'learning path must be learner-owned');
});

test('legacy flat French profile is adopted, not lost', async () => {
  globalThis.localStorage = memoryStorage();
  const q = `legacy-${Date.now()}-${Math.random()}`;
  globalThis.localStorage.setItem('fp.phonemeProfile', JSON.stringify({ 'r': { attempts: 4, correct: 1, misses: 3, avgConf: 0.4, lastAt: '2025-01-01T00:00:00.000Z', weak: true } }));
  active.setContentLanguage('fr');
  const profile = await import(`../src/lib/phonemeProfile.js?${q}`);
  const fr = profile.getPhonemeProfile('fr');
  assert.equal(fr.r.misses, 3, 'legacy French stats survive the per-language migration');
  // A new attempt lands in the per-language shape alongside the legacy one.
  profile.recordPhonemeAttempt('r', { correct: true, confidence: 0.9 });
  const after = profile.getPhonemeProfile('fr');
  assert.equal(after.r.attempts, 5, 'new attempts continue the legacy counters');
});
