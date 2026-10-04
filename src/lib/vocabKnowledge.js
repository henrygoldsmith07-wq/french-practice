// Vocabulary knowledge profiles — how well does the learner know a word,
// and in WHICH direction?
//
// Three honest dimensions per entry, derived from real review state:
//   recognition  (target → meaning)   from the receptive FSRS card
//   production   (meaning → target)   from the productive FSRS card
//   listening    (heard → meaning)    from listening/dictation evidence only
//
// The listening dimension is deliberately 'unknown' rather than guessed when
// no listening evidence exists for that word. A word the learner recognises
// but cannot produce is the most valuable thing Today can find — productive
// use beats another recognition card every time.

import { fsrsKey, fsrsRetention, isProductiveUnlocked } from './fsrs.js';

export const BANDS = Object.freeze(['strong', 'medium', 'weak', 'unknown']);

const BAND_ORDER = { strong: 3, medium: 2, weak: 1, unknown: 0 };

function bandFor(card, now) {
  if (!card || !(card.reps > 0)) return { band: 'unknown', retention: null };
  const retention = fsrsRetention(card, now);
  const value = retention == null ? 0.72 : retention;
  // Retrievability right now is high for ANY freshly reviewed card, so the
  // band must also weigh how durable the memory is: stability (days) and
  // repetition. A 1-rep card with 2-day stability is weak even though today's
  // retrievability reads 0.95.
  const stability = Number(card.S) || 0;
  const reps = Number(card.reps) || 0;
  const rounded = Math.round(value * 100) / 100;
  if (reps >= 3 && stability >= 10 && value >= 0.85) return { band: 'strong', retention: rounded };
  if (reps >= 2 && stability >= 4 && value >= 0.65) return { band: 'medium', retention: rounded };
  return { band: 'weak', retention: rounded };
}

/**
 * The knowledge profile for one entry.
 * @param {object} srs FSRS map
 * @param {string} entryId
 * @param {{now?: number, listeningEvidence?: {correct?: number, attempts?: number}|null}} options
 */
export function knowledgeProfile(srs = {}, entryId, options = {}) {
  const now = options.now || Date.now();
  const receptive = srs[fsrsKey(entryId, 'receptive')] || srs[entryId] || null;
  const productive = srs[fsrsKey(entryId, 'productive')] || null;
  const listening = listeningBand(options.listeningEvidence);
  return {
    id: entryId,
    recognition: bandFor(receptive, now),
    // No productive card yet, so there is nothing to report: the band is
    // `unknown` either way. (The two branches once read the same string, so
    // the conditional said nothing — `productiveUnlocked` below is the field
    // that actually tells the UI whether production is reachable.)
    production: productive ? bandFor(productive, now) : { band: 'unknown', retention: null },
    listening,
    productiveUnlocked: isProductiveUnlocked(srs, entryId),
  };
}

function listeningBand(evidence) {
  if (!evidence || !(Number(evidence.attempts) > 0)) return { band: 'unknown', retention: null };
  const attempts = Number(evidence.attempts);
  const correct = Number(evidence.correct) || 0;
  const ratio = attempts ? correct / attempts : 0;
  if (attempts >= 3 && ratio >= 0.85) return { band: 'strong', retention: Math.round(ratio * 100) / 100 };
  if (ratio >= 0.5) return { band: 'medium', retention: Math.round(ratio * 100) / 100 };
  return { band: 'weak', retention: Math.round(ratio * 100) / 100 };
}

/** Learner-facing one-liner: 'Recognition: strong · Production: weak'. */
export function knowledgeLabel(profile) {
  if (!profile) return '';
  return `Recognition: ${profile.recognition.band} · Production: ${profile.production.band} · Listening: ${profile.listening.band}`;
}

/**
 * Words the learner recognises but cannot yet produce — the productive gap.
 * Frequency-ordered (entry.freq ascending = more frequent first).
 */
export function productiveGaps(srs = {}, entries = [], limit = 10, options = {}) {
  const now = options.now || Date.now();
  return (entries || [])
    .filter((e) => e && e.id && e.fr)
    .map((entry) => ({ entry, profile: knowledgeProfile(srs, entry.id, { now, listeningEvidence: options.listeningEvidence?.[entry.id] }) }))
    .filter(({ profile }) => (
      profile.productiveUnlocked
      && BAND_ORDER[profile.recognition.band] >= BAND_ORDER.medium
      && BAND_ORDER[profile.production.band] <= BAND_ORDER.weak
    ))
    .sort((a, b) => (Number(a.entry.freq) || 9) - (Number(b.entry.freq) || 9))
    .slice(0, Math.max(0, limit))
    .map(({ entry, profile }) => ({ id: entry.id, fr: entry.fr, en: entry.en, freq: entry.freq, profile }));
}

/**
 * The most useful next practice mode for one word. Production wins whenever
 * recognition is solid — another recognition card teaches nothing new.
 */
export function nextVocabMode(profile) {
  if (!profile) return 'recognition';
  const recog = BAND_ORDER[profile.recognition.band];
  const prod = BAND_ORDER[profile.production.band];
  if (recog >= BAND_ORDER.medium && prod < recog) return 'production';
  if (profile.listening.band === 'weak' && recog >= BAND_ORDER.medium) return 'listening';
  return 'recognition';
}

/**
 * Richer recall-mode rotation for a review queue: interleaves direction and
 * task shape instead of a single flashcard flip.
 */
export function recallModesFor(profile) {
  const modes = ['target→native'];
  if (profile && profile.productiveUnlocked) modes.push('native→target', 'sentence completion', 'spoken production');
  if (profile && profile.listening.band !== 'unknown') modes.push('listening→meaning');
  modes.push('context choice');
  return modes;
}
