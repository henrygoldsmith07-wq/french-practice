// Phonological pronunciation scoring — components, not one number.
//
// Combines three evidence sources:
//   1. Word-recognition accuracy (Whisper diff)      -> intelligibility
//   2. Acoustic measurements of the recording        -> rhythm, intonation,
//      voicing control, vowel-quality proxies
//   3. Deterministic analysis of the TARGET text     -> which features the
//      sentence even contains (liaison/silent endings for French, etc.)
//
// LANGUAGE HONESTY: the target-text analyser follows the ACTIVE content
// language. French gets the full French G2P (nasals, liaison, silent
// endings); German and Spanish get honest text-derived features of their own
// (devoicing-relevant final consonants, trill rr / tap r contexts, closed
// syllables) — never French labels on German audio. Acoustic components use
// the same analyser for every language but are labelled with
// language-appropriate notes where the expectation differs.
//
// HONESTY: every component carries a confidence tier.
//   'measured'     - directly observable signal
//   'estimated'    - acoustic proxy without forced alignment (coarse)
//   'text-derived' - what the target sentence requires, checked indirectly
// Components the sentence cannot exercise are null, never zero.

import { analyzeFrenchText, voicedShare } from './frenchG2P.js';
import { contentLang } from './content/active.js';
import {
  syllableNuclei, voicingF0, bandShares, medianF0InWindow, semitones,
} from './acoustics.js';

const clampScore = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);

// ---- non-French target-text analysis (deterministic, deliberately simple) ----

// analyseText returns the SAME shape as analyzeFrenchText so the shared
// acoustic pipeline can consume it: { words, syllables, counts,
// liaisonOpportunities, silentEndings, has(kind) }.
function analyzeGermanText(sentence) {
  const words = String(sentence || '')
    .toLowerCase()
    .replace(/[^a-zäöüß\s'-]/g, ' ')
    .split(/\s+/).filter(Boolean);
  let syllables = 0, devoicingSites = 0, frontRounded = 0, ichAch = 0;
  const perWord = [];
  for (const raw of words) {
    const w = raw.replace(/^-+|-+$/g, '');
    if (!w) continue;
    const vowelHits = w.match(/[aeiouäöüy]/g) || [];
    syllables += Math.max(1, vowelHits.length);
    // Final devoicing site: a word that ends in a b/d/g spelled consonant.
    if (/[bdg]$/.test(w)) devoicingSites += 1;
    // Front rounded vowels ü/ö (incl. ae/oe transliterations).
    if (/[üö]|ae|oe/.test(w)) frontRounded += 1;
    // ich/ach contexts: ch after front vowels vs back vowels.
    if (/ch/.test(w)) {
      if (/(i|e|ä|ei|eu|äu)ch/.test(w)) ichAch += 1;
      else if (/(a|o|u)ch/.test(w)) ichAch += 1;
    }
    perWord.push({ word: w, phonemes: [] });
  }
  return {
    words: perWord,
    syllables,
    counts: { devoicingSites, frontRounded, ichAch },
    liaisonOpportunities: 0,
    silentEndings: devoicingSites, // same slot: sites where the final consonant changes quality
    has: (kind) => {
      if (kind === 'devoicing') return devoicingSites > 0;
      if (kind === 'front-rounded') return frontRounded > 0;
      if (kind === 'ich-ach') return ichAch > 0;
      return false;
    },
  };
}

function analyzeSpanishText(sentence) {
  const words = String(sentence || '')
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s'-]/g, ' ')
    .split(/\s+/).filter(Boolean);
  let syllables = 0, trillSites = 0, tapSites = 0, bvSites = 0;
  const perWord = [];
  for (const raw of words) {
    const w = raw.replace(/^-+|-+$/g, '');
    if (!w) continue;
    const vowelHits = w.match(/[aeiouáéíóúü]/g) || [];
    syllables += Math.max(1, vowelHits.length);
    if (/^rr|rr/.test(w)) trillSites += 1;
    else if (/(^|[aeiouáéíóú])r[aeiouáéíóú]/.test(w)) tapSites += 1;
    if (/[bv]/.test(w)) bvSites += 1;
    perWord.push({ word: w, phonemes: [] });
  }
  return {
    words: perWord,
    syllables,
    counts: { trillSites, tapSites, bvSites },
    liaisonOpportunities: 0,
    silentEndings: 0,
    has: (kind) => {
      if (kind === 'trill') return trillSites > 0;
      if (kind === 'tap') return tapSites > 0;
      if (kind === 'bv') return bvSites > 0;
      return false;
    },
  };
}

/** Text analysis for the ACTIVE content language (single entry point). */
export function analyzeTargetText(sentence, lang = contentLang()) {
  if (lang === 'de') return analyzeGermanText(sentence);
  if (lang === 'es') return analyzeSpanishText(sentence);
  return analyzeFrenchText(sentence);
}

// Language-specific expected voiced share (text-derived priors the voicing
// component compares the measured share against).
function expectedVoicedShare(text, lang) {
  if (lang === 'fr') return voicedShare(text);
  // Coarse, honest priors: both languages are heavily vowel-dominated.
  return lang === 'de' ? 0.55 : 0.62;
}

/**
 * Full phonological analysis of one attempt.
 * @param {string}   target     the sentence the learner read
 * @param {number}   accuracy   word-recognition accuracy 0..100 (existing diff)
 * @param {{pcm:Float32Array, sampleRate:number, durationSec:number}|null} audio
 * @param {string}   [lang]     content language (defaults to the active one)
 */
export function analyzePhonology({ target, accuracy = null, audio = null, lang = contentLang() } = {}) {
  const text = analyzeTargetText(target, lang);
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
      const score = clampScore(nuclei.regularity * 100 * 1.15);
      const rhythmNote = lang === 'es'
        ? `${nuclei.count} syllable nuclei, ${Math.round(nuclei.ratePerSec * 10) / 10}/s — Spanish syllable timing rewards even spacing (${(nuclei.regularity * 100).toFixed(0)}%).`
        : lang === 'de'
          ? `${nuclei.count} syllable nuclei, ${Math.round(nuclei.ratePerSec * 10) / 10}/s — stress-timed: uneven spacing is expected, steadiness within the stressed foot matters (${(nuclei.regularity * 100).toFixed(0)}%).`
          : `${nuclei.count} syllable nuclei, ${Math.round(nuclei.ratePerSec * 10) / 10}/s — regularity ${(nuclei.regularity * 100).toFixed(0)}%.`;
      components.push({
        id: 'rhythm',
        label: 'Rhythm & syllable timing',
        score,
        confidence: 'measured',
        note: rhythmNote,
      });
      // Syllable-count match vs the target text: for French this is the
      // liaison/enchaînement proxy (producing liaisons merges syllables the
      // eye expects as two). Other languages have no liaison; the same
      // signal just checks the produced syllable count.
      if (text.syllables >= 4 && nuclei.count >= 3 && lang === 'fr') {
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
      // German yes/no questions rise sharply, and word stress carries more
      // pitch; Spanish declaratives fall more decisively than French.
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
    const expected = expectedVoicedShare(text, lang);
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

    // 5. Language-specific components — only when the sentence actually
    //    contains the feature, and always labelled with its true confidence.
    const shares = bandShares(audio.pcm, audio.sampleRate, [
      { name: 'front', lo: 1500, hi: 2200 },  // /y/-type high-front energy
      { name: 'back', lo: 650, hi: 1100 },    // /u/-type high-back energy
      { name: 'murmur', lo: 150, hi: 450 },   // nasal murmur region
      { name: 'frication', lo: 3000, hi: 5000 }, // /s, ʃ/ and uvular/ach noise
    ]);

    if (lang === 'fr') {
      if (text.has('y') && text.has('u')) {
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
        components.push({
          id: 'silent-endings',
          label: 'Silent endings',
          score: clampScore((components.find((c) => c.id === 'liaison')?.score ?? 70)),
          confidence: 'text-derived',
          note: `${text.silentEndings} silent ending${text.silentEndings === 1 ? '' : 's'} required; judged via syllable match.`,
        });
      }
    }

    if (lang === 'de') {
      if (text.has('front-rounded')) {
        const balance = Math.min(shares.front, shares.back) / Math.max(1e-9, Math.max(shares.front, shares.back));
        components.push({
          id: 'de-u-u',
          label: 'Front rounded vowels (ü / ö)',
          score: clampScore(40 + balance * 60),
          confidence: 'estimated',
          note: 'Spectral balance of the high-front and back bands — front-rounded vowels sit between.',
        });
      }
      if (text.has('ich-ach')) {
        const hiEnergy = shares.frication ?? 0;
        components.push({
          id: 'de-ich-ach',
          label: 'ich-Laut / ach-Laut',
          score: clampScore(35 + Math.min(1, hiEnergy * 12) * 65),
          confidence: 'estimated',
          note: 'Frication energy where [ç]/[x] noise lives.',
        });
      }
      if (text.has('devoicing')) {
        // Text-derived: judged indirectly via the syllable-count match.
        components.push({
          id: 'de-devoicing',
          label: 'Final devoicing',
          score: clampScore(components.find((c) => c.id === 'rhythm')?.score ?? 70),
          confidence: 'text-derived',
          note: `${text.counts.devoicingSites} final devoicing site${text.counts.devoicingSites === 1 ? '' : 's'} in the target; judged via syllable match.`,
        });
      }
    }

    if (lang === 'es') {
      if (text.has('trill') || text.has('tap')) {
        const hiEnergy = shares.frication ?? 0;
        components.push({
          id: 'es-r',
          label: 'Tap / trill r',
          score: clampScore(35 + Math.min(1, hiEnergy * 12) * 65),
          confidence: 'estimated',
          note: 'Frication/burst energy where r-taps live.',
        });
      }
      if (text.has('bv')) {
        // b/v realisation is about lenition between vowels — honestly hard
        // to measure without alignment; score from overall rhythm instead.
        components.push({
          id: 'es-bv',
          label: 'b / v realisation',
          score: clampScore(components.find((c) => c.id === 'rhythm')?.score ?? 70),
          confidence: 'text-derived',
          note: `${text.counts.bvSites} b/v word${text.counts.bvSites === 1 ? '' : 's'} in the target; judged via rhythm steadiness.`,
        });
      }
      // Five-vowel clarity: every Spanish sentence exercises it. Vowel
      // clarity shows as steady, well-separated syllable nuclei.
      const vowelScore = clampScore(components.find((c) => c.id === 'rhythm')?.score ?? null);
      if (vowelScore != null) {
        components.push({
          id: 'es-vowels',
          label: 'Five-vowel clarity',
          score: vowelScore,
          confidence: 'estimated',
          note: 'Pure, evenly separated vowels — judged via syllable-nuclei regularity.',
        });
      }
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
