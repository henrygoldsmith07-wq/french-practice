// Practice assignment — ONE authoritative treatment assignment.
//
//   Not enrolled            → adaptive (the best product experience)
//   Study arm adaptive      → adaptive
//   Study arm balanced      → balanced
//
// Balanced exists ONLY as the control condition for consented study
// participants — declining or ignoring the study can never reduce
// personalisation. Every consumer (curriculum, calibration, trials,
// outcomes, exports, analytics) must read the same effectiveVariant, so
// assigned arm = delivered curriculum = outcome label = exported record.
//
// `getPracticeAssignment` remains only as a LEGACY OPERATOR OVERRIDE input
// (study ops pinning an arm pre-enrolment); it no longer decides anything
// on its own.

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

/**
 * THE authoritative treatment: one function every consumer reads.
 *
 *   effectiveVariant({ study }) → 'adaptive' | 'balanced'
 *
 *   Not enrolled (no study, declined, withdrawn)  → 'adaptive'
 *   Enrolled, arm adaptive                        → 'adaptive'
 *   Enrolled, arm balanced                        → 'balanced'
 *
 * `legacyOverride` is the pre-enrolment operator pin (getPracticeAssignment's
 * value): it seeds the arm at enrolment time via studyFlow, never here.
 */
export function effectiveVariant({ study = null } = {}) {
  if (study
    && study.status === 'active'
    && (study.arm === 'adaptive' || study.arm === 'balanced')) {
    return study.arm;
  }
  return 'adaptive';
}

/**
 * Validity invariant: does the actually-delivered treatment match the
 * study arm it would be labelled with? Returns a verdict the caller must
 * honour — flag (or reject) mismatched records rather than silently
 * relabelling them.
 */
export function verifyTreatmentConsistency({ deliveredVariant = null, study = null } = {}) {
  const expected = effectiveVariant({ study });
  if (deliveredVariant == null) return { ok: false, expected, reason: 'no delivery label' };
  if (deliveredVariant !== expected) {
    return { ok: false, expected, reason: `delivered '${deliveredVariant}' but study arm implies '${expected}'` };
  }
  return { ok: true, expected, reason: null };
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
