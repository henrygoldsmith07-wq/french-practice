// Phonological pronunciation scoring — components, not one number.
//
// Combines three evidence sources:
//   1. Word-recognition accuracy (Whisper diff)      -> intelligibility
//   2. Acoustic measurements of the recording        -> rhythm, intonation,
//      voicing control, vowel-quality proxies
//   3. Deterministic analysis of the TARGET text     -> liaison, silent
//      endings, and which phoneme families the sentence even contains
//
// HONESTY: every component carries a confidence tier.
//   'measured'     - directly observable signal
//   'estimated'    - acoustic proxy without forced alignment (coarse)
//   'text-derived' - what the target sentence requires, checked indirectly
// Components the sentence cannot exercise are null, never zero.

import { analyzeFrenchText, voicedShare } from './frenchG2P.js';
import {
  syllableNuclei, voicingF0, bandShares, medianF0InWindow, semitones,
} from './acoustics.js';

const clampScore = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);

/**
 * Full phonological analysis of one attempt.
 * @param {string}   target     the sentence the learner read
 * @param {number}   accuracy   word-recognition accuracy 0..100 (existing diff)
 * @param {{pcm:Float32Array, sampleRate:number, durationSec:number}|null} audio
 */
export function analyzePhonology({ target, accuracy = null, audio = null } = {}) {
  const text = analyzeFrenchText(target);
  const components = [];

  // 1. Intelligibility — the existing word-recognition measure, reframed.
  components.push({
    id: 'intelligibility',
    label: 'Overall intelligibility',
    score: clampScore(accuracy),
    confidence: 'measured',
    note: 'Share of the sentence a listener (or recogniser) received intact.',
  });

  // 2. Rhythm — syllable-timing regularity from the energy envelope.
  if (audio) {
    const nuclei = syllableNuclei(audio.pcm, audio.sampleRate);
    if (nuclei.regularity != null && nuclei.count >= 3) {
      // French syllable timing: practiced speech lands near-regular (CV ~0.3).
      const score = clampScore(nuclei.regularity * 100 * 1.15);
      components.push({
        id: 'rhythm',
        label: 'Rhythm & syllable timing',
        score,
        confidence: 'measured',
        note: `${nuclei.count} syllable nuclei, ${Math.round(nuclei.ratePerSec * 10) / 10}/s — regularity ${(nuclei.regularity * 100).toFixed(0)}%.`,
      });
      // Syllable-count match vs the target text (liaison/enchainement proxy):
      // producing liaisons merges syllables the eye expects as two.
      if (text.syllables >= 4 && nuclei.count >= 3) {
        const ratio = nuclei.count / text.syllables;
        const liaisonScore = clampScore(100 - Math.abs(1 - ratio) * 120);
        components.push({
          id: 'liaison',
          label: 'Liaison & enchainement',
          score: liaisonScore,
          confidence: 'text-derived',
          note: `${text.liaisonOpportunities} link${text.liaisonOpportunities === 1 ? '' : 's'} available; syllables produced vs target ${nuclei.count}/${text.syllables}.`,
        });
      }
    }

    // 3. Intonation — phrase-final pitch movement.
    const { f0Series, voicedRatio: voicingRatio } = voicingF0(audio.pcm, audio.sampleRate);
    const dur = audio.durationSec || 0;
    const finalMed = medianF0InWindow(f0Series, 0.02, Math.max(0, dur - 0.6), dur);
    const bodyMed = medianF0InWindow(f0Series, 0.02, 0, Math.max(0.5, dur - 0.6));
    const movement = semitones(bodyMed, finalMed);
    if (movement != null) {
      // French declaratives end with a modest fall or slight rise; a flat
      // tail reads monotonous. Score by having a controlled movement.
      const magnitude = Math.abs(movement);
      const score = clampScore(magnitude >= 0.8 ? 100 - Math.max(0, magnitude - 5) * 8 : 55 + magnitude * 30);
      components.push({
        id: 'intonation',
        label: 'Phrase-final intonation',
        score,
        confidence: 'estimated',
        note: `Final pitch ${movement > 0 ? 'rises' : movement < 0 ? 'falls' : 'holds'} ${magnitude} semitones vs the phrase body.`,
      });
    }

    // 4. Voicing control — measured voiced share vs what the text requires.
    const expected = voicedShare(text);
    if (voicingRatio > 0) {
      const score = clampScore(100 - Math.abs(voicingRatio - expected) * 180);
      components.push({
        id: 'voicing',
        label: 'Voiced / unvoiced control',
        score,
        confidence: 'estimated',
        note: `Voiced ${(voicingRatio * 100).toFixed(0)}% of the attempt; the text implies ~${Math.round(expected * 100)}%.`,
      });
    }

    // 5. Acoustic proxies for phoneme families — only when the sentence
    //    actually contains them, and always labelled estimated.
    const shares = bandShares(audio.pcm, audio.sampleRate, [
      { name: 'front', lo: 1500, hi: 2200 },  // /y/-type high-front energy
      { name: 'back', lo: 650, hi: 1100 },    // /u/-type high-back energy
      { name: 'murmur', lo: 150, hi: 450 },   // nasal murmur region
      { name: 'frication', lo: 3000, hi: 5000 }, // /s, ʃ/ and weak uvular noise
    ]);
    if (text.has('y') && text.has('u')) {
      // A balanced /y/-/u/ contrast keeps both bands alive relative to each
      // other; collapsing one band is the classic merger signature.
      const balance = Math.min(shares.front, shares.back) / Math.max(1e-9, Math.max(shares.front, shares.back));
      components.push({
        id: 'u-ou',
        label: '/u/ vs /y/ contrast',
        score: clampScore(40 + balance * 60),
        confidence: 'estimated',
        note: 'Spectral balance of the high-front and high-back vowel bands.',
      });
    }
    if (text.has('r')) {
      // Uvular /R/ carries weak low-mid frication; a fully absent band is the
      // classic English-approximant tell.
      const rEnergy = shares.frication ?? 0;
      components.push({
        id: 'r',
        label: 'French R',
        score: clampScore(35 + Math.min(1, rEnergy * 12) * 65),
        confidence: 'estimated',
        note: 'Frication energy in the upper bands where uvular noise lives.',
      });
    }
    if (text.has('nasal')) {
      const murmur = shares.murmur ?? 0;
      components.push({
        id: 'nasal',
        label: 'Nasal vowels',
        score: clampScore(40 + Math.min(1, murmur * 14) * 60),
        confidence: 'estimated',
        note: 'Low-band murmur associated with nasal vowels.',
      });
    }
    if (text.silentEndings > 0) {
      // Text-derived: the sentence requires dropped endings; the syllable
      // match above is the only honest check without alignment.
      components.push({
        id: 'silent-endings',
        label: 'Silent endings',
        score: clampScore((components.find((c) => c.id === 'liaison')?.score ?? 70)),
        confidence: 'text-derived',
        note: `${text.silentEndings} silent ending${text.silentEndings === 1 ? '' : 's'} required; judged via syllable match.`,
      });
    }
  }

  // Weakest non-null component (excluding intelligibility itself — it is the
  // headline, and the drill should target the phonological weak spot).
  const scorable = components.filter((c) => c.score != null && c.id !== 'intelligibility');
  const weakest = scorable.length
    ? scorable.reduce((a, b) => (a.score <= b.score ? a : b))
    : null;

  // Overall: intelligibility-led blend with the acoustic components present.
  const others = scorable.map((c) => c.score);
  const overall = clampScore(
    accuracy != null && others.length
      ? accuracy * 0.6 + (others.reduce((a, b) => a + b, 0) / others.length) * 0.4
      : (accuracy ?? (others.length ? others.reduce((a, b) => a + b, 0) / others.length : null))
  );

  return {
    overall,
    components,
    weakest,
    text: {
      syllables: text.syllables,
      liaisonOpportunities: text.liaisonOpportunities,
      silentEndings: text.silentEndings,
      counts: text.counts,
    },
  };
}
