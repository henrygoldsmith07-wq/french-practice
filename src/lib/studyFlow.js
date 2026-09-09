// Evidence Study — storage glue between the pure protocol (evidenceStudy.js)
// and the components. Every function here is defensive: the study must never
// break the Today session, and missing study state degrades to a no-op.
//
// Isolation guarantee (tested): held-out check results are measurement-only.
// Nothing in this module touches the mistake graph, FSRS/SRS state, or any
// mastery lifecycle, and nothing about check items ever steers selection.

import {
  enrolStudy, isEnrolled, studyDay, isCheckDay, buildHeldOutPool,
  makeCheckRecord, recordCheckResult, makeOutcomeRecord, withdrawStudy,
  applyRetestToOutcome, applyRecurrenceToOutcome, cleanBaseline,
} from './evidenceStudy.js';
import { mayEnrol, hasDeclined, makeConsentRecord, consentGuardOk } from './studyConsent.js';
import { getPracticeAssignment } from './assignment.js';
import {
  getStudyState, saveStudyState, getStudyConsent, saveStudyConsent,
  getStudyChecks, saveStudyChecks,
  getStudyOutcomes, saveStudyOutcomes, getSyncId, getLastPlacement,
  setStudyArmOverride, getStudyArmOverride, getSessions,
} from './storage.js';

// Re-exports for components: the study glue is the single study surface.
export { buildHeldOutPool, makeCheckRecord } from './evidenceStudy.js';
export { effectiveVariant, verifyTreatmentConsistency } from './assignment.js';

/** Enrol (idempotently) using the placement result as the starting band.
 *  REQUIRES EXPLICIT CONSENT: without an accepted consent record nothing is
 *  created — no participant id, no arm, no study rows. Refusal is sticky.
 *  The operator override (getPracticeAssignment's legacy pin) seeds the arm
 *  at enrolment time ONLY — effectiveVariant reads the study arm alone. */
export function enrolStudyState({ startLevel = null, now = Date.now() } = {}) {
  try {
    const current = getStudyState();
    if (current?.status === 'active') return current;
    const consent = getStudyConsent();
    if (!mayEnrol(consent, current)) return current; // never asked, or declined
    const placement = getLastPlacement();
    const band = startLevel || placement?.level || null;
    // Operator pin (if any) seeds the participant's arm at enrolment. An
    // existing pin wins — seeding never overwrites an operator decision.
    if (!getStudyArmOverride()) setStudyArmOverride(getPracticeAssignment(getSyncId()));
    const next = enrolStudy(current, {
      syncId: getSyncId(),
      startLevel: band,
      startTheta: placement?.theta ?? null,
      baseline: captureBaseline(),
      now,
    });
    saveStudyState(next);
    return next;
  } catch {
    return null;
  }
}

/** Baseline capture at enrolment: from the learner's real, existing
 *  data only — never generated, never zero-filled. Nulls mean unmeasured. */
function captureBaseline() {
  try {
    const sessions = getSessions();
    const recent = sessions.slice(-6);
    const avg = recent.length
      ? recent.reduce((a, s) => a + (s.report?.average_scores?.overall ?? 0), 0) / recent.length
      : null;
    return cleanBaseline({ speakingAverage: Number.isFinite(avg) ? Math.round(avg) : null });
  } catch {
    return cleanBaseline(null);
  }
}

/** The learner's consent state for the UI: 'accepted' | 'declined' | null. */
export function studyConsentState() {
  try {
    const c = getStudyConsent();
    return c?.decision || null;
  } catch {
    return null;
  }
}

export const learnerHasDeclined = () => {
  try { return hasDeclined(getStudyConsent()); } catch { return false; }
};

/**
 * THE central research-write guard: every write into fp.study.* must pass
 * through here. True only when ALL hold:
 *   · consent decision is 'accepted';
 *   · study status is 'active';
 *   · a participant id exists;
 *   · the study arm is valid.
 * A failing guard means "return without touching any study data" — normal
 * adaptive practice is never affected either way.
 */
export function canRecordStudyData() {
  try {
    return consentGuardOk(getStudyConsent(), getStudyState());
  } catch {
    return false;
  }
}

/** Record an explicit consent decision (the only path that sets one). */
export function recordStudyConsent(decision, { now = Date.now(), enrol = {} } = {}) {
  try {
    const record = makeConsentRecord({ decision, now });
    if (!record) return null;
    saveStudyConsent(record);
    // Accepting consent may immediately enrol; declining never does.
    if (decision === 'accepted') enrolStudyState({ ...enrol, now });
    return record;
  } catch {
    return null;
  }
}

/** The arm that owns this session — study-locked when enrolled, else 'adaptive'.
 *  SUPERSEDED by effectiveVariant (assignment.js): kept only for callers that
 *  predate the single-source refactor. */
export function enrolArm(study, fallbackVariant) {
  try {
    if (isEnrolled(study) && (study.arm === 'adaptive' || study.arm === 'balanced')) {
      return study.arm;
    }
  } catch { /* fall through */ }
  return fallbackVariant;
}

/** Clear the study record entirely (explicit rejoin path after withdrawal). */
export function clearStudyState() {
  try {
    saveStudyState(null);
    return true;
  } catch {
    return false;
  }
}

/** Withdraw + delete study data (consent & deletion control). */
export function withdrawStudyState({ deleteData = true } = {}) {
  try {
    const current = getStudyState();
    saveStudyState(withdrawStudy(current));
    if (deleteData) {
      saveStudyChecks([]);
      saveStudyOutcomes([]);
    }
    return true;
  } catch {
    return false;
  }
}

export const studyStatus = (now = Date.now()) => {
  try {
    const state = getStudyState();
    return { state, enrolled: isEnrolled(state), day: studyDay(state, now) };
  } catch {
    return { state: null, enrolled: false, day: null };
  }
};

export const daySinceEnrolment = (study, now = Date.now()) => (study ? studyDay(study, now) : null);

export const isCheckScheduled = (study, day) => {
  try {
    if (!isEnrolled(study) || !Number.isFinite(day)) return false;
    return isCheckDay(study.participantId, day);
  } catch {
    return false;
  }
};

/** Build AND persist the frozen check record for today (idempotent by id). */
export function saveCheckRecord(check) {
  // Research-write guard: no consent/active study, no fp.study.* write.
  if (!canRecordStudyData()) return null;
  try {
    const list = getStudyChecks();
    if (list.some((c) => c.id === check.id)) return list.find((c) => c.id === check.id);
    list.push(check);
    saveStudyChecks(list);
    return check;
  } catch {
    return check;
  }
}

/** Fold finished check results in (measurement-only, never mastery). */
export function recordCheckOutcome(checkId, finished) {
  // Research-write guard: no consent/active study, no fp.study.* write.
  if (!canRecordStudyData()) return null;
  try {
    if (!finished) return null;
    const list = getStudyChecks();
    const idx = list.findIndex((c) => c.id === checkId);
    if (idx < 0) return null;
    list[idx] = recordCheckResult(list[idx], {
      correct: finished.correct,
      total: finished.total,
      quizScore: finished.quizScore ?? null,
      secondsSpent: finished.secondsSpent ?? null,
    });
    saveStudyChecks(list);
    return list[idx];
  } catch {
    return null;
  }
}

/** Start (or refresh) the longitudinal outcome row for a selection trial. */
export function startOutcomeRecord({ trial, graph = [], arm, day = null, consistency = null }) {
  // Research-write guard: no consent/active study, no fp.study.* write.
  if (!canRecordStudyData()) return null;
  try {
    const list = getStudyOutcomes();
    const node = trial?.selectedId ? graph.find((m) => m.id === trial.selectedId) : null;
    const record = makeOutcomeRecord({ trial, graphNode: node });
    record.variant = arm || trial?.variant || null;
    record.day = Number.isFinite(day) ? day : null;
    // Validity audit trail: what the study arm implied vs what was delivered.
    record.treatmentConsistency = consistency
      ? { ok: Boolean(consistency.ok), expected: consistency.expected ?? null, reason: consistency.reason ?? null }
      : null;
    const existing = list.findIndex((o) => o.id === record.id);
    if (existing >= 0) list[existing] = record;
    else list.push(record);
    saveStudyOutcomes(list);
    return record;
  } catch {
    return null;
  }
}

/**
 * Join any later retest of the selected node into its outcome row. Called
 * from the real retest recorders so retention evidence accrues passively.
 * Immediate retries are sorted by evidenceStudy.applyRetestToOutcome and can
 * never reach the retention windows.
 */
export function linkRetestToOutcomes({ mistakeId, retest, trialAt = null }) {
  // Research-write guard: no consent/active study, no fp.study.* write.
  if (!canRecordStudyData()) return;
  try {
    if (!mistakeId || !retest) return;
    const list = getStudyOutcomes();
    let touched = false;
    for (const o of list) {
      if (o.selectedId !== mistakeId) continue;
      const before = JSON.stringify(o.delayedShort) + JSON.stringify(o.delayedLong) + JSON.stringify(o.immediate);
      applyRetestToOutcome(o, retest, { trialAt: trialAt || o.at });
      if (before !== JSON.stringify(o.delayedShort) + JSON.stringify(o.delayedLong) + JSON.stringify(o.immediate)) {
        o.transferScored = o.transferScored || false;
        touched = true;
      }
    }
    if (touched) saveStudyOutcomes(list);
  } catch { /* outcome bookkeeping must never break practice */ }
}

/** Recurrence: fresh occurrence after a delayed success, per outcome row. */
export function markOutcomeRecurrence({ mistakeId, trialAt = null, recurred = true }) {
  // Research-write guard: no consent/active study, no fp.study.* write.
  if (!canRecordStudyData()) return;
  try {
    const list = getStudyOutcomes();
    let touched = false;
    for (const o of list) {
      if (o.selectedId !== mistakeId) continue;
      if (o.recurred === recurred) continue;
      applyRecurrenceToOutcome(o, { recurred });
      touched = true;
    }
    if (touched) saveStudyOutcomes(list);
  } catch { /* noop */ }
}

/** Delivery facts recorded when the Today session finishes. */
export function updateOutcomeDelivery({ trialAt, timeSpent, completed, delivered }) {
  // Research-write guard: no consent/active study, no fp.study.* write.
  if (!canRecordStudyData()) return;
  try {
    if (!trialAt) return;
    const list = getStudyOutcomes();
    const idx = list.findIndex((o) => o.at === trialAt || (o.id && trialAt && o.id.includes(trialAt)));
    if (idx < 0) return;
    list[idx].timeSpent = Number.isFinite(timeSpent) ? timeSpent : list[idx].timeSpent;
    list[idx].completed = typeof completed === 'boolean' ? completed : list[idx].completed;
    if (Array.isArray(delivered)) list[idx].delivered = delivered;
    saveStudyOutcomes(list);
  } catch { /* noop */ }
}

/** Held-out check accuracy folded onto outcome rows of the same study day. */
export function attachTransferToOutcomes({ day, score }) {
  // Research-write guard: no consent/active study, no fp.study.* write.
  if (!canRecordStudyData()) return;
  try {
    if (!Number.isFinite(score)) return;
    const list = getStudyOutcomes();
    let touched = false;
    for (const o of list) {
      if (o.day !== day || o.transfer) continue;
      o.transfer = { score, source: 'held-out-check' };
      touched = true;
    }
    if (touched) saveStudyOutcomes(list);
  } catch { /* noop */ }
}
