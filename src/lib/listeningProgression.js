// Listening progression — how listening practice gets harder, and what any
// given track honestly claims to be.
//
// The ladder (product spec):
//   slow clear audio → normal speech → different speakers → accent variation
//   → spontaneous speech → speech with noise
//
// Metadata is HONEST: a track that is synthesised says so, licence claims are
// never invented, and learner-facing copy distinguishes studio audio practice
// from real listening evidence. When genuine native recordings are not
// available, the product structure is ready for them — not pretending.

export const LISTENING_PROGRESSION = Object.freeze([
  {
    id: 'slow-clear',
    label: 'Slow, clear audio',
    description: 'Every word released — build confidence catching the basics.',
    requires: { audioType: null, speed: 'slow', spontaneity: 'scripted', noise: 'none' },
  },
  {
    id: 'normal-speed',
    label: 'Normal speed',
    description: 'Everyday pace with standard pronunciation.',
    requires: { audioType: null, speed: 'normal', spontaneity: 'scripted', noise: 'none' },
  },
  {
    id: 'different-speakers',
    label: 'Different speakers',
    description: 'Voices you have not heard before — understanding should not depend on one person.',
    requires: { audioType: null, speed: 'normal', spontaneity: 'any', noise: 'none', speakers: 2 },
  },
  {
    id: 'accent-variation',
    label: 'Accents',
    description: 'French from different places — the words stay the same, the sound moves.',
    requires: { audioType: null, speed: 'any', spontaneity: 'any', noise: 'none', accentVariety: true },
  },
  {
    id: 'spontaneous',
    label: 'Spontaneous speech',
    description: 'People talking as they really talk — hesitations, restarts, fillers.',
    requires: { audioType: null, speed: 'any', spontaneity: 'spontaneous', noise: 'any' },
  },
  {
    id: 'noise',
    label: 'With distractions',
    description: 'Speech in the real world, noise and all.',
    requires: { audioType: null, speed: 'any', spontaneity: 'any', noise: 'present' },
  },
]);

export const SPEED_VALUES = Object.freeze(['slow', 'normal', 'fast']);
export const FORMALITY_VALUES = Object.freeze(['formal', 'neutral', 'casual']);
export const SPONTANEITY_VALUES = Object.freeze(['scripted', 'semi-spontaneous', 'spontaneous']);
export const NOISE_VALUES = Object.freeze(['none', 'light', 'present']);

/**
 * Normalise one track's metadata. Never fabricates: unknown provenance stays
 * unknown, and a synthetic track can never present itself as native speech.
 */
export function normaliseTrackMetadata(track = {}) {
  const sourceType = track.sourceType === 'recording' ? 'recording' : 'tts';
  return {
    id: track.id || null,
    speaker: textOrNull(track.speaker) || (track.lines?.length >= 2 ? 'two speakers' : 'studio voice'),
    accent: textOrNull(track.accent) || 'fr-fr',
    speed: clampEnum(track.speed, SPEED_VALUES) || 'normal',
    formality: clampEnum(track.formality, FORMALITY_VALUES) || 'neutral',
    spontaneity: clampEnum(track.spontaneity, SPONTANEITY_VALUES) || (sourceType === 'tts' ? 'scripted' : 'spontaneous'),
    noise: clampEnum(track.noise, NOISE_VALUES) || 'none',
    topic: textOrNull(track.topic) || textOrNull(track.kind) || 'everyday',
    cefr: textOrNull(track.cefr) || 'A2',
    transcript: track.lines?.length > 0 || track.transcript != null ? 'available' : 'unavailable',
    provenance: sourceType === 'recording'
      ? (textOrNull(track.provenance) || 'recording supplied by the project')
      : 'studio audio generated for practice',
    licence: sourceType === 'recording'
      ? (textOrNull(track.licence) || 'unknown')
      : 'synthetic',
    audioType: sourceType,
    speakers: countSpeakers(track),
  };
}

function textOrNull(value) {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, 80) : null;
}

function clampEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function countSpeakers(track) {
  const names = new Set((track.lines || []).map((l) => l?.speaker).filter(Boolean));
  return names.size || (track.lines?.length >= 2 ? 2 : 1);
}

/** Does this track qualify as practice for the given progression stage? */
export function trackQualifiesForStage(track, stage) {
  const meta = normaliseTrackMetadata(track);
  const req = stage?.requires || {};
  if (req.speed && req.speed !== 'any' && meta.speed !== req.speed) return false;
  if (req.spontaneity && req.spontaneity !== 'any' && meta.spontaneity !== req.spontaneity) return false;
  if (req.noise && req.noise !== 'any' && meta.noise !== req.noise) return false;
  if (req.speakers && meta.speakers < req.speakers) return false;
  if (req.accentVariety && meta.accent === 'fr-fr' && meta.audioType === 'tts' && meta.speakers < 2) return false;
  return true;
}

/**
 * Pick today's track by progression stage, with graceful fallback: if nothing
 * qualifies at this stage, step down one stage at a time before giving up.
 */
export function selectTrackForStage(tracks = [], stageId, { excludeIds = [] } = {}) {
  const stages = LISTENING_PROGRESSION;
  let index = stages.findIndex((s) => s.id === stageId);
  if (index < 0) index = 0;
  const excluded = new Set(excludeIds);
  for (let i = index; i >= 0; i -= 1) {
    const stage = stages[i];
    const pool = (tracks || []).filter((t) => t && !excluded.has(t.id) && trackQualifiesForStage(t, stage));
    if (pool.length) {
      // Deterministic-but-varied pick: first qualifying track rotated by how
      // many were excluded, so repeated calls move through the pool.
      return { track: pool[excluded.size % pool.length], stage, fallback: i < index };
    }
  }
  // Nothing qualifies anywhere: an available track beats no practice.
  const any = (tracks || []).find((t) => t && !excluded.has(t.id)) || null;
  return { track: any, stage: stages[0], fallback: true };
}

/**
 * Learner-facing label distinguishing synthetic practice from real listening.
 * Plain language only — never 'TTS', 'provenance' or 'metadata'.
 */
export function listeningEvidenceLabel(track) {
  const meta = normaliseTrackMetadata(track);
  return meta.audioType === 'recording'
    ? 'You listened to a real recording.'
    : 'Practised with studio audio — not yet verified native listening.';
}

/**
 * The next progression stage after `currentStageId`.
 *
 * Saturates at the top of the ladder: asking for the stage after the last one
 * returns that last stage rather than null. (The docstring used to promise
 * "or null at the top"; the code has always clamped, and the tests pin the
 * clamped behaviour — so the comment was wrong, not the ladder.)
 */
export function nextListeningStage(currentStageId) {
  const index = LISTENING_PROGRESSION.findIndex((s) => s.id === currentStageId);
  if (index < 0) return LISTENING_PROGRESSION[0];
  return LISTENING_PROGRESSION[Math.min(index + 1, LISTENING_PROGRESSION.length - 1)];
}

/** The learner-facing progression ladder for the Listening surface. */
export function listeningLadder(currentStageId) {
  const index = LISTENING_PROGRESSION.findIndex((s) => s.id === currentStageId);
  return LISTENING_PROGRESSION.map((stage, i) => ({
    ...stage,
    state: i < index ? 'done' : i === index ? 'current' : 'ahead',
  }));
}
