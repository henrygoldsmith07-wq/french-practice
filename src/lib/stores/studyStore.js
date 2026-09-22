// Evidence Study store — the persistence boundary for the longitudinal
// two-arm study: enrolment state, consent, held-out checks, per-selection
// outcomes, the operator-only arm override, and imported researcher bundles.
//
// Extracted from storage.js (architecture: storage.js is becoming a facade
// over domain stores; this is the pilot). All keys, shapes, caps and
// learner-namespacing behaviour are byte-identical — storageCore owns the
// key map and the learner-routing read/write primitives.
//
// Consent lives in its OWN store, never inside the study record: withdrawing
// or deleting study data must not erase the fact that consent was asked and
// what was agreed to (and a declined learner must never be auto-enrolled).
import { read, write, KEYS } from '../storageCore.js';
// NOTE: this store must NOT import ../evidenceStudy.js. evidenceStudy is a
// large lazy module; a static edge from this entry-graph store would drag the
// whole study protocol (and heldOutBank) onto first load. The dependency runs
// the other way: evidenceStudy (lazy) imports getStudyArmOverride from here.

export const getStudyState = () => read(KEYS.studyState, null);

export function saveStudyState(state) {
  write(KEYS.studyState, state || null);
  return state;
}

export const getStudyConsent = () => read(KEYS.studyConsent, null);

export function saveStudyConsent(record) {
  write(KEYS.studyConsent, record || null);
  return record;
}

export const getStudyChecks = () => {
  const v = read(KEYS.studyChecks, []);
  return Array.isArray(v) ? v : [];
};

export function saveStudyChecks(list) {
  write(KEYS.studyChecks, Array.isArray(list) ? list.slice(-120) : []);
  return list;
}

export const getStudyOutcomes = () => {
  const v = read(KEYS.studyOutcomes, []);
  return Array.isArray(v) ? v : [];
};

export function saveStudyOutcomes(list) {
  write(KEYS.studyOutcomes, Array.isArray(list) ? list.slice(-400) : []);
  return list;
}

// Operator-only arm override (test harness / study ops). The UI never writes
// or displays it; evidenceStudy.assignArm reads it directly via the import
// above (lazy study graph → entry store, never the reverse).
export const getStudyArmOverride = () => read(KEYS.studyArmOverride, null);
export function setStudyArmOverride(arm) {
  if (arm !== 'adaptive' && arm !== 'balanced') return null;
  write(KEYS.studyArmOverride, arm);
  return arm;
}

// Imported study bundles (researcher aggregation). These NEVER mix into the
// local participant's own outcomes — they are a read-only pool for combined
// counts across participants.
export const getImportedStudyBundles = () => {
  const v = read(KEYS.studyImported, []);
  return Array.isArray(v) ? v : [];
};

export function saveImportedStudyBundles(list) {
  write(KEYS.studyImported, Array.isArray(list) ? list.slice(-200) : []);
  return list;
}
