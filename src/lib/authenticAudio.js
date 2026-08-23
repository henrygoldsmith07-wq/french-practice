/**
 * Authentic-audio library — real recorded native French, legally sourced.
 *
 * GOAL: learners understand people, not speech engines. This module models
 * licensed recordings (LibriVox/public-domain readings, CC-BY, or direct
 * consenting-speaker uploads) across regions, speeds and registers, and maps
 * every asset onto a 7-stage listening progression:
 *
 *   S1 slow TTS + transcript          S5 accent variation
 *   S2 normal TTS                     S6 spontaneous speech
 *   S3 clear native recording         S7 realistic noise / interruptions
 *   S4 natural native recording
 *
 * HONESTY RULES:
 *  - An asset without license + source + consent basis is REJECTED, not
 *    warned about.
 *  - Metadata the importer cannot know (speaker age, exact region) is simply
 *    absent — never guessed. Unverified-but-plausible tags carry `taggedBy`.
 */

// ── Stage model ──────────────────────────────────────────────────────────────

export const STAGES = {
  1: { id: 1, label: 'Slow TTS + transcript', source: 'tts', rateMax: 0.75 },
  2: { id: 2, label: 'Normal TTS', source: 'tts', rateMax: 1.0 },
  3: { id: 3, label: 'Clear native recording', source: 'recording', register: ['clear-read'] },
  4: { id: 4, label: 'Natural native recording', source: 'recording', register: ['natural-read', 'radio'] },
  5: { id: 5, label: 'Accent variation', source: 'recording', accentsMin: 2 },
  6: { id: 6, label: 'Spontaneous speech', source: 'recording', register: ['spontaneous', 'conversation', 'interview'] },
  7: { id: 7, label: 'Realistic background noise / interruptions', source: 'recording', noise: ['ambient', 'busy'], overlap: true },
};

export const MAX_STAGE = 7;
const STAGE_UNLOCK_MIN_ITEMS = 5;
const STAGE_UNLOCK_ACCURACY = 0.8;

export const REGIONS = ['france', 'quebec', 'belgium', 'switzerland', 'francophone-other'];
export const LICENSES = ['public-domain', 'cc-by', 'cc-by-sa', 'licensed-consent'];
export const CONSENT_BASES = ['public-domain-recording', 'written-consent', 'cc-license-terms'];
export const REGISTERS = ['clear-read', 'natural-read', 'spontaneous', 'conversation', 'interview', 'announcement', 'radio'];
export const NOISE_LEVELS = ['quiet', 'ambient', 'busy'];

// ── Validation ───────────────────────────────────────────────────────────────

/** Validate one catalog asset. Returns {ok, errors[]} — strict on provenance. */
export function validateAsset(a) {
  const errors = [];
  if (!a || typeof a !== 'object') return { ok: false, errors: ['asset is not an object'] };
  if (!a.id || typeof a.id !== 'string') errors.push('missing id');
  if (!a.title) errors.push('missing title');
  if (!LICENSES.includes(a.license)) errors.push(`license must be one of ${LICENSES.join(', ')}`);
  if (!a.sourceUrl || !/^https?:\/\//.test(a.sourceUrl)) errors.push('sourceUrl must be an http(s) URL');
  if (!a.audioSrc) errors.push('missing audioSrc (streamed URL or /audio/<file>)');
  if (!a.consentBasis || !CONSENT_BASES.includes(a.consentBasis)) {
    errors.push(`consentBasis must be one of ${CONSENT_BASES.join(', ')}`);
  }
  if (a.region && !REGIONS.includes(a.region)) errors.push(`region must be one of ${REGIONS.join(', ')}`);
  if (a.register && !REGISTERS.includes(a.register)) errors.push(`register must be one of ${REGISTERS.join(', ')}`);
  if (a.noise && !NOISE_LEVELS.includes(a.noise)) errors.push(`noise must be one of ${NOISE_LEVELS.join(', ')}`);
  return { ok: errors.length === 0, errors };
}

/** Classify which progression stage an asset belongs to. */
export function stageFor(asset) {
  if (!asset) return null;
  if (asset.sourceType === 'tts' || !asset.audioSrc) {
    const rate = asset.rate ?? 1.0;
    return rate <= STAGES[1].rateMax ? 1 : 2;
  }
  if (asset.overlap || (asset.noise && asset.noise !== 'quiet')) return 7;
  if (asset.register === 'spontaneous' || asset.register === 'conversation' || asset.register === 'interview') return 6;
  if (asset.accentVariety || (Array.isArray(asset.regions) && new Set(asset.regions).size >= 2)) return 5;
  if (asset.register === 'announcement' || asset.register === 'radio' || asset.register === 'natural-read') return 4;
  return 3; // default for a clean native recording
}

// ── Progression ──────────────────────────────────────────────────────────────

export function emptyProgression() {
  return { currentStage: 1, attempts: [], unlockedAt: {} };
}

/**
 * Recompute progression from attempt history.
 * attempts: [{itemId, stage, correct:boolean|0|1, at}]
 * A stage is unlocked after ≥5 attempts at that stage with ≥80% correct.
 */
export function progressionFrom(attempts, prev = {}) {
  const byStage = new Map();
  for (const a of Array.isArray(attempts) ? attempts : []) {
    const stage = a.stage;
    if (!(stage >= 1 && stage <= MAX_STAGE)) continue;
    if (!byStage.has(stage)) byStage.set(stage, { n: 0, correct: 0 });
    const b = byStage.get(stage);
    b.n += 1;
    if (a.correct) b.correct += 1;
  }
  let unlockedAt = { ...(prev.unlockedAt || {}) };
  // Current working stage = highest PASSED stage + 1 (floor 1, cap MAX_STAGE).
  let currentStage = 1;
  for (let s = MAX_STAGE; s >= 1; s--) {
    if (stagePassed(byStage, s)) { currentStage = Math.min(s + 1, MAX_STAGE); break; }
  }
  // Record unlock timestamps for every newly passed stage.
  for (let s = 2; s <= MAX_STAGE; s++) {
    if (stagePassed(byStage, s) && unlockedAt[s] == null) unlockedAt[s] = new Date().toISOString();
  }
  return {
    currentStage,
    unlockedAt,
    attempts: attempts || [],
    stageStats: [...byStage.entries()].map(([stage, b]) => ({
      stage,
      n: b.n,
      accuracy: b.n ? +(b.correct / b.n).toFixed(3) : 0,
      passed: stagePassed(byStage, stage),
    })),
  };
}

function stagePassed(byStage, s) {
  const b = byStage.get(s);
  return !!b && b.n >= STAGE_UNLOCK_MIN_ITEMS && b.correct / b.n >= STAGE_UNLOCK_ACCURACY;
}

/** Record one listening attempt against a stage-tagged item. */
export function recordAttempt(progression, { itemId, stage, correct }) {
  const attempts = [...(progression.attempts || []), { itemId, stage, correct: !!correct, at: new Date().toISOString() }];
  return progressionFrom(attempts, progression);
}

// ── Catalog ──────────────────────────────────────────────────────────────────

import { AUTHENTIC_AUDIO_SEED } from './content/authenticAudioSeed.js';

/** Merge built-in seed + imported packs; validates every entry. Returns {assets, rejected}. */
export function mergeCatalogs(...catalogs) {
  // Each argument is one catalog (an array of assets) — normalize defensively.
  const cats = catalogs.map((c) => (Array.isArray(c) ? c : [])).flat();
  const seen = new Set();
  const assets = [];
  const rejected = [];
  for (const a of cats) {
      const v = validateAsset(a);
      if (!v.ok) {
        rejected.push({ id: a?.id || '(no id)', errors: v.errors });
        continue;
      }
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      assets.push({ stage: stageFor(a), ...a });
    }
  return { assets, rejected };
}

/** Playback plan for a listening track: prefer real audio, fall back to TTS. */
export function playbackPlan(track, catalogAssets = []) {
  const asset = track.audioId ? catalogAssets.find((a) => a.id === track.audioId) : null;
  if (asset && asset.audioSrc) {
    return { type: 'recording', audioSrc: asset.audioSrc, stage: asset.stage ?? stageFor(asset), attribution: `${asset.title} — ${asset.license}` };
  }
  if (track.audioSrc) {
    return { type: 'recording', audioSrc: track.audioSrc, stage: stageFor(track), attribution: track.attribution || null };
  }
  const rate = track.ttsRate ?? 1.0;
  return { type: 'tts', rate, stage: rate <= STAGES[1].rateMax ? 1 : 2 };
}
