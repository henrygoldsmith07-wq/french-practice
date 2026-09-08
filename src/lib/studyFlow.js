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
  applyRetestToOutcome, applyRecurrenceToOutcome,
} from './evidenceStudy.js';

// Re-exports for components: the study glue is the single study surface.
export { buildHeldOutPool, makeCheckRecord } from './evidenceStudy.js';
import {
  getStudyState, saveStudyState, getStudyChecks, saveStudyChecks,
  getStudyOutcomes, saveStudyOutcomes, getSyncId, getLastPlacement,
} from './storage.js';

/** Enrol (idempotently) using the placement result as the starting band. */
export function enrolStudyState({ startLevel = null, now = Date.now() } = {}) {
  try {
    const current = getStudyState();
    if (isEnrolled(current)) return current;
    const placement = getLastPlacement();
    const band = startLevel || placement?.level || null;
    const next = enrolStudy(current, {
      syncId: getSyncId(),
      startLevel: band,
      startTheta: placement?.theta ?? null,
      now,
    });
    saveStudyState(next);
    return next;
  } catch {
    return null;
  }
}

/** The arm that owns this session — study-locked when enrolled, else default. */
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
export function startOutcomeRecord({ trial, graph = [], arm, day = null }) {
  try {
    const list = getStudyOutcomes();
    const node = trial?.selectedId ? graph.find((m) => m.id === trial.selectedId) : null;
    const record = makeOutcomeRecord({ trial, graphNode: node });
    record.variant = arm || trial?.variant || null;
    record.day = Number.isFinite(day) ? day : null;
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
