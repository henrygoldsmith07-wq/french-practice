// Listening conditions gym — synthetic training for the hardest stages.
//
// Stages 6–7 of the authentic-audio ladder (spontaneous speech, background
// noise / overlapping dialogue) need real recordings that the pack does not
// have yet. This module builds HONEST approximations from what exists:
//
//   • hesitation  — the transcript is split at phrase boundaries, filler
//                   words («euh», «ben») are injected and gaps are scheduled
//                   between utterances  → trains S6 recognition skills
//   • overlap     — two voices read alternating lines with a stagger
//                  → trains S7 dialogue-tracking skills
//   • noise beds  — a generated noise layer plays at a set intensity under
//                   the audio → trains S7 noise tolerance
//
// Everything here is clearly labelled synthetic in the UI. No function
// claims to be a native recording, and none of this feeds provenance
// metadata for the authentic-audio catalog.

// Filler words actually used by French speakers (short, unstressed).
export const HESITATION_FILLERS = ['euh', 'ben', 'bah', 'hein', 'eh bien'];

// Condition presets. `stage` is the ladder stage whose skills it trains;
// `synthetic: true` is non-negotiable labelling.
export const CONDITIONS = {
  normal: { id: 'normal', label: 'Clear read', stage: 2, synthetic: false },
  hesitation: { id: 'hesitation', label: 'Hesitations & fillers', stage: 6, synthetic: true },
  overlap: { id: 'overlap', label: 'Overlapping voices', stage: 7, synthetic: true },
  'noise-ambient': { id: 'noise-ambient', label: 'Café-level noise', stage: 7, synthetic: true },
  'noise-busy': { id: 'noise-busy', label: 'Busy-street noise', stage: 7, synthetic: true },
};

// Noise-bed presets: filter type and gain shape for the WebAudio layer.
export function noiseBedConfig(conditionId) {
  switch (conditionId) {
    case 'noise-ambient': return { type: 'pink', gain: 0.05, lowpassHz: 1200 };
    case 'noise-busy': return { type: 'brown', gain: 0.11, lowpassHz: 800 };
    default: return null;
  }
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/**
 * Inject hesitations into a transcript. Deterministic for a given text +
 * seeded rng. Returns the spoken script: segments to speak in order, with a
 * filler sometimes prefixed and a thinking-gap after most segment breaks.
 */
export function hesitationScript(text, rng = Math.random) {
  const raw = String(text || '').trim();
  if (!raw) return { segments: [], totalGapMs: 0 };
  // Split on sentence/phrase ends, keeping the punctuation.
  const parts = raw.split(/(?<=[.!?…])\s+|,\s+/).filter(Boolean);
  const segments = [];
  let totalGapMs = 0;
  parts.forEach((part, i) => {
    const roll = rng();
    let spoken = part;
    if (roll < 0.3 && i > 0) spoken = `${pick(rng, HESITATION_FILLERS)}, ${spoken}`;
    // Thinking gaps: 350–900ms after most segments (never after the last).
    const gap = i < parts.length - 1 && rng() < 0.7 ? Math.round(350 + rng() * 550) : 0;
    totalGapMs += gap;
    segments.push({ text: spoken, gapAfterMs: gap, voiceIndex: 0 });
  });
  return { segments, totalGapMs };
}

/**
 * Overlapping-dialogue script: alternating lines read by two different
 * voices, the second voice entering 600ms after the first (real
 * conversations rarely wait for a clean handover).
 */
export function overlapScript(lines) {
  const list = (Array.isArray(lines) ? lines : [])
    .map((l) => (typeof l === 'string' ? { fr: l } : l))
    .filter((l) => l && l.fr);
  if (!list.length) return { segments: [], totalGapMs: 0 };
  const segments = [];
  let totalGapMs = 0;
  list.forEach((line, i) => {
    const gap = i === 0 ? 0 : 600; // stagger: next voice enters quickly
    totalGapMs += gap;
    segments.push({ text: line.fr, gapAfterMs: gap, voiceIndex: i % 2 });
  });
  return { segments, totalGapMs };
}

/**
 * Unified playback script for a condition. `lines` is the transcript pool
 * (array of {fr} or strings); a single long text is split for hesitation.
 */
export function playbackScript(conditionId, lines, rng = Math.random) {
  const list = (Array.isArray(lines) ? lines : [])
    .map((l) => (typeof l === 'string' ? { fr: l } : l))
    .filter((l) => l && l.fr);
  if (conditionId === 'hesitation') {
    return hesitationScript(list.map((l) => l.fr).join(' '), rng);
  }
  if (conditionId === 'overlap') return overlapScript(list);
  // normal (and noise beds, which only add a layer, not a script)
  return {
    segments: list.map((l) => ({ text: l.fr, gapAfterMs: 350, voiceIndex: 0 })),
    totalGapMs: Math.max(0, list.length - 1) * 350,
  };
}

/** Which ladder stage a condition trains, with honest labelling. */
export function conditionStage(conditionId) {
  const c = CONDITIONS[conditionId];
  return c ? { stage: c.stage, synthetic: Boolean(c.synthetic), label: c.label } : null;
}
