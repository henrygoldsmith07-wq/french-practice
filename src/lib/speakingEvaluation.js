// Speaking evaluation — fluency, pausing and vocabulary richness.
//
// Two inputs feed it:
// 1. Acoustic stats from useRecorder (voiced time, pauses detected between
//    phrases while the mic was open) — measured on-device, never uploaded.
// 2. The transcript produced for the same attempt.
//
// Everything here is deterministic maths over those inputs, so scores are
// reproducible and unit-testable. No model calls, no randomness.

export const PAUSE_MIN_MS = 350; // shorter gaps are word boundaries, not pauses

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const round2 = (v) => Math.round(v * 100) / 100;

// Trapezoid: 100 inside [idealLo, idealHi], falling linearly to 0 at the
// hard limits — a fair curve for pace, where both extremes hurt clarity.
function trapezoid(v, idealLo, idealHi, hardLo, hardHi) {
  if (v == null || v <= 0) return 0;
  if (v >= idealLo && v <= idealHi) return 100;
  if (v < idealLo) {
    const span = idealLo - hardLo;
    return span <= 0 ? 100 : Math.max(0, Math.round((1 - (idealLo - v) / span) * 100));
  }
  const span = hardHi - idealHi;
  return span <= 0 ? 100 : Math.max(0, Math.round((1 - (v - idealHi) / span) * 100));
}

/**
 * Acoustic pausing summary from recorder stats + attempt length.
 * @param {{voicedMs?:number,totalPauseMs?:number,pauseCount?:number,longestPauseMs?:number}} stats
 */
export function pauseAnalysis(stats = {}, durationMs = 0) {
  const voicedMs = Math.max(0, Number(stats.voicedMs) || 0);
  const totalPauseMs = Math.max(0, Number(stats.totalPauseMs) || 0);
  const pauseCount = Math.max(0, Number(stats.pauseCount) || 0);
  const longestPauseMs = Math.max(0, Number(stats.longestPauseMs) || 0);
  const total = Math.max(1, Number(durationMs) || voicedMs + totalPauseMs);
  const voicedRatio = round2(clamp01(voicedMs / total));
  // Pauses normalised per 30 s of attempt, so short and long answers compare.
  const pauseRate = round2((pauseCount / total) * 30000);
  return { voicedRatio, pauseRate, pauseCount, longestPauseMs, totalPauseMs };
}

/**
 * Vocabulary richness from the transcript: type–token ratio with the
 * root-T correction (Guiraud), which stays comparable across utterance
 * lengths. Returns null when there is too little speech to judge.
 */
export function vocabularyRichness(heard) {
  const words = String(heard || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zà-ÿ0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.replace(/['-]/g, '').length > 0);
  const tokens = words.length;
  if (tokens < 6) return null;
  const types = new Set(words).size;
  const guiraud = types / Math.sqrt(tokens);
  const level =
    guiraud >= 3 ? 'rich'
      : guiraud >= 2.4 ? 'varied'
        : guiraud >= 1.8 ? 'developing'
          : 'repetitive';
  return { tokens, types, guiraud: round2(guiraud), level };
}

/**
 * Composite fluency score (0–100) from delivery metrics, acoustic pausing
 * and richness. Components absent (e.g. too-short transcript for variety,
 * no acoustic stats) drop out with renormalised weights rather than scoring
 * as zero.
 */
export function fluencyScore(delivery = {}, stats = {}, durationMs = 0) {
  const { wpm = 0, fillers = 0, words = 0, heard = '' } = delivery;
  if (!words && !(Number(stats.voicedMs) > 0)) return null;

  const parts = [];
  parts.push({ weight: 0.35, score: trapezoid(wpm, 85, 135, 40, 185) });

  const pausing = pauseAnalysis(stats, durationMs);
  let pauseScore = 100 - pausing.pauseRate * 12;
  if (pausing.longestPauseMs > PAUSE_MIN_MS * 5) {
    pauseScore -= Math.min(25, (pausing.longestPauseMs - PAUSE_MIN_MS * 5) / 80);
  }
  parts.push({ weight: 0.3, score: Math.max(0, Math.round(pauseScore)) });

  const fillerRate = words > 0 ? (fillers / words) * 100 : 0;
  parts.push({ weight: 0.2, score: Math.max(0, Math.round(100 - fillerRate * 10)) });

  const richness = vocabularyRichness(heard);
  if (richness) parts.push({ weight: 0.15, score: trapezoid(richness.guiraud, 2.4, 3.2, 1.2, 4.2) });

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const weighted = parts.reduce((a, p) => a + p.weight * p.score, 0);
  return Math.round(weighted / totalWeight);
}

/**
 * Convenience wrapper: fluency from a transcript + duration (+ optional
 * acoustic stats). Computes delivery metrics inline so callers pass one thing.
 */
export function evaluateFluency({ heard = '', durationMs = 0, wpm = 0, fillers = 0, words = 0, stats = {} }) {
  const richness = vocabularyRichness(heard);
  const score = fluencyScore({ wpm, fillers, words, heard }, stats, durationMs);
  return { score, richness, pausing: pauseAnalysis(stats, durationMs) };
}

/**
 * Blend pronunciation clarity with fluency into one overall mark. Clarity
 * stays dominant (70/30) — being understood matters more than sounding smooth.
 */
export function combineSpeakingScore({ accuracy, fluency } = {}) {
  const a = Number(accuracy);
  if (!Number.isFinite(a)) return null;
  const f = Number(fluency);
  if (!Number.isFinite(f)) return Math.round(a);
  return Math.round(a * 0.7 + f * 0.3);
}
