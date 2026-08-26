// Practice assignment — the adaptive-vs-balanced study (P1).
//
// Every installation is deterministically assigned to one variant from its
// sync id, so the split is stable and needs no account system:
//
//   adaptive  — Today's curriculum targets the learner's mistake graph
//   balanced  — identical time/modality budget, generic rotating content
//
// The variant only changes CONTENT SELECTION. Segment structure, minutes
// and recorders are identical, so time-on-task is comparable by design.
// Assignment is a study control, not a feature gate: both variants are
// first-class experiences.

const KEY = 'fp.practiceAssignment';

export const VARIANTS = ['adaptive', 'balanced'];

/** Deterministic assignment from the device sync id (persisted override wins). */
export function getPracticeAssignment(syncId = '') {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'adaptive' || saved === 'balanced') return saved;
  } catch { /* unavailable */ }
  let h = 0;
  for (const ch of String(syncId || 'le-studio')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const variant = Math.abs(h) % 2 === 0 ? 'adaptive' : 'balanced';
  try { localStorage.setItem(KEY, variant); } catch { /* unavailable */ }
  return variant;
}

/** Explicit override (study operators only). */
export function setPracticeAssignment(variant) {
  if (!VARIANTS.includes(variant)) return null;
  try { localStorage.setItem(KEY, variant); } catch { /* unavailable */ }
  return variant;
}

// Balanced rotation: generic grammar topics, same drill modality without
// learner-specific targeting. Rotation is by day so it varies but stays
// predictable.
export const BALANCED_DRILL_TOPICS = [
  'articles', 'negation', 'passe-compose', 'pronoms', 'prepositions-lieu',
  'subjonctif', 'futur-conditionnel', 'accord-participe',
];
export function balancedDrillTopic(dayIndex = 0) {
  return BALANCED_DRILL_TOPICS[((dayIndex % BALANCED_DRILL_TOPICS.length) + BALANCED_DRILL_TOPICS.length) % BALANCED_DRILL_TOPICS.length];
}
