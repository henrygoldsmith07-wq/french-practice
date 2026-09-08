// Selection calibration (P2) — measures whether the adaptive curriculum's
// chosen activities actually improved later performance, and feeds that
// evidence back into selection CONSERVATIVELY.
//
// The join: a selection-trial record (frozen by Today BEFORE any practice)
// is joined, by mistake id, against the mistake graph's retest history that
// happened AFTER the trial. Per trial we measure:
//
//   selectedId        the weakness that was chosen
//   activity          what was actually assigned (ai-drill | authored-drill |
//                     retype | srs-retrieval | listen | review | speak)
//   immediateResult   the same-session post-practice retest — REHEARSAL by
//                     definition; tracked but NEVER counted as mastery
//   delayedResult     the first non-immediate retest after the trial
//   newContextResult  the first DELAYED_NEW_CONTEXT retest after the trial
//   recurred          a fresh mistake occurrence or a wrong retest after a
//                     delayed success
//   timeSpent/completed  delivery facts recorded by the session runner
//
// CONSERVATIVE FEEDBACK: selection weights per mistake TYPE move by at most
// one bounded step and only when the per-type sample clears a floor. Below
// the floors the calibration reports 'not ready' and selection is unchanged.
// Immediate success never raises a weight: it is rehearsal, not transfer.

import { contextFamily } from './mistakeGraph.js';

export const CALIBRATION_ENGINE_VERSION = 1;

// Sample floors. Nothing below these changes selection or prints a rate.
export const MIN_TRIALS_READY = 10;       // before the calibration acts at all
export const MIN_PER_TYPE = 6;            // before one type's rate moves a weight
export const MIN_VARIANT_N = 8;           // before an adaptive-vs-balanced rate prints
export const MIN_TRANSFER_N = 5;          // before a new-context rate prints

// Weight bounds and step: selection stays recognisably the overdue-urgency
// order; calibration only nudges it. Movement is capped at 2 steps, so the
// effective band is [0.9, 1.1]; the clamp is kept as a hard guard.
export const WEIGHT_MIN = 0.9;
export const WEIGHT_MAX = 1.1;
export const WEIGHT_STEP = 0.05;
const RATE_GAP_FOR_STEP = 0.1; // 10pp better/worse than the all-trials rate

function retestsAfter(node, afterIso) {
  const t = Date.parse(afterIso);
  if (!Number.isFinite(t)) return [];
  return (node?.retests || []).filter((r) => Date.parse(r.at) >= t);
}

/**
 * Classify one trial against the graph node it selected.
 *
 * NOTE: the mistake graph classes wrong retests as 'REHEARSAL' because they
 * are never mastery EVIDENCE — but for OUTCOME measurement a wrong delayed
 * retest is exactly the signal we need. So immediacy is read from the retest
 * record's own `immediate` flag, not the evidence class.
 */
export function trialOutcome(trial, node) {
  const after = retestsAfter(node, trial.at);
  const immediate = after.find((r) => r.immediate) || null;
  const delayedList = after.filter((r) => !r.immediate);
  const delayed = delayedList[0] || null;
  const novelList = delayedList.filter((r) => r.contextNovel);
  const newContext = novelList[0] || null;
  const wrongAfterSuccess = delayedList.some(
    (r, i) => !r.correct && delayedList.slice(0, i).some((p) => p.correct)
  );
  // Recurrence: the node was seen again as a mistake after the trial, or a
  // delayed success was later contradicted by a wrong retest.
  const recurred = Boolean(
    (node?.lastSeenAt && Date.parse(node.lastSeenAt) > Date.parse(trial.at) + 60000) ||
    wrongAfterSuccess
  );
  return {
    immediateResult: immediate ? immediate.correct : null,
    delayedResult: delayed ? delayed.correct : null,
    delayedClass: delayed?.evidenceClass || null,
    newContextResult: newContext ? newContext.correct : null,
    transferObserved: Boolean(
      delayedList.some((r) => contextFamily(r.context) === 'transfer') || newContext
    ),
    recurred,
  };
}

/**
 * Join every trial with its graph node. Trials without a node (balanced
 * rotation topics that never became graph nodes) count for delivery stats
 * only — their outcome columns stay null.
 */
export function joinTrials(trials, graph) {
  const list = Array.isArray(graph) ? graph : [];
  return (Array.isArray(trials) ? trials : []).map((trial) => {
    const node = trial.selectedId ? list.find((m) => m.id === trial.selectedId) : null;
    return {
      at: trial.at,
      variant: trial.variant || null,
      selectedId: trial.selectedId || null,
      concept: node?.concept || trial.selectedConcept || null,
      type: node?.type || null,
      activity: trial.activity || (Array.isArray(trial.segments) ? trial.segments[0]?.id : null) || null,
      timeSpent: Number.isFinite(trial.timeSpent) ? trial.timeSpent : null,
      completed: typeof trial.completed === 'boolean' ? trial.completed : null,
      masteryBefore: trial.masteryBefore ?? null,
      ...(node ? trialOutcome(trial, node) : {
        immediateResult: null, delayedResult: null, delayedClass: null,
        newContextResult: null, transferObserved: false, recurred: null,
      }),
    };
  });
}

function rateOf(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => typeof v === 'boolean');
  if (!vals.length) return { rate: null, n: 0 };
  return { rate: vals.filter(Boolean).length / vals.length, n: vals.length };
}

/**
 * Conservative per-type selection weights from the joined outcomes.
 * Returns { ready, n, weights, rows, message }. weights maps mistake type →
 * multiplier in [WEIGHT_MIN, WEIGHT_MAX]; absent types mean 1.
 */
export function calibrateSelection(trials, graph, { now = Date.now() } = {}) {
  void now;
  const all = Array.isArray(trials) ? trials : [];
  const joined = joinTrials(all, Array.isArray(graph) ? graph : []).filter((t) => t.selectedId);
  // Readiness counts every frozen trial — delivery data is part of the
  // evidence too — but weights only move on trials that joined a graph node.
  const n = all.length;
  if (n < MIN_TRIALS_READY) {
    return {
      ready: false, n, weights: {}, rows: [],
      message: n === 0
        ? 'No selection trials yet — calibration begins after real Today sessions.'
        : `Only ${n} of ${MIN_TRIALS_READY} trials needed — selection is unchanged until then.`,
    };
  }
  const overall = rateOf(joined, 'delayedResult');
  const byType = new Map();
  for (const t of joined) {
    if (!t.type) continue;
    if (!byType.has(t.type)) byType.set(t.type, []);
    byType.get(t.type).push(t);
  }
  const weights = {};
  const rows = [];
  for (const [type, rowsForType] of [...byType.entries()].sort()) {
    const delayed = rateOf(rowsForType, 'delayedResult');
    const immediate = rateOf(rowsForType, 'immediateResult');
    const recurrence = rateOf(rowsForType, 'recurred');
    let weight = 1;
    let reason = 'too few trials to act on';
    if (delayed.n >= MIN_PER_TYPE && overall.n >= MIN_PER_TYPE) {
      const gap = delayed.rate - overall.rate;
      if (Math.abs(gap) >= RATE_GAP_FOR_STEP) {
        const steps = Math.min(2, Math.max(1, Math.round(Math.abs(gap) / RATE_GAP_FOR_STEP)));
        weight = 1 + Math.sign(gap) * steps * WEIGHT_STEP;
        weight = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, Math.round(weight * 100) / 100));
        reason = gap > 0 ? 'delayed success above average' : 'delayed success below average';
      } else {
        reason = 'within 10pp of average — no change';
      }
    }
    weights[type] = weight;
    rows.push({ type, n: rowsForType.length, delayed, immediate, recurrence, weight, reason });
  }
  return {
    ready: true,
    n,
    weights,
    rows,
    overall,
    message: `${n} trials joined — per-type weights bounded to [${WEIGHT_MIN}, ${WEIGHT_MAX}].`,
  };
}

/** Apply calibration weights to due-retest candidates (stable, pure). */
export function applyCalibration(candidates, calibration) {
  const weights = calibration?.ready ? calibration.weights : {};
  return (Array.isArray(candidates) ? candidates : [])
    .map((c) => ({ ...c, weight: weights[c.type] ?? 1 }))
    .sort((a, b) =>
      (b.overdueBy ?? 0) * b.weight - (a.overdueBy ?? 0) * a.weight ||
      b.recurrence - a.recurrence);
}

/**
 * Adaptive-vs-balanced outcome summary for reporting (Req: clearer adaptive
 * vs balanced reporting). Every rate prints '—' (null) below MIN_VARIANT_N.
 */
export function adaptiveBalancedOutcomes(trials, graph) {
  const joined = joinTrials(trials, graph).filter((t) => t.variant);
  const build = (variant) => {
    const rows = joined.filter((t) => t.variant === variant);
    const withNode = rows.filter((t) => t.selectedId);
    const delayed = rateOf(withNode, 'delayedResult');
    const immediate = rateOf(withNode, 'immediateResult');
    const recurrence = rateOf(withNode, 'recurred');
    const newContext = rateOf(withNode, 'newContextResult');
    const completedRows = rows.filter((t) => typeof t.completed === 'boolean');
    const gate = (r) => (r.n >= MIN_VARIANT_N ? Math.round(r.rate * 100) : null);
    return {
      variant,
      n: rows.length,
      joinedN: withNode.length,
      completed: completedRows.length >= MIN_VARIANT_N
        ? Math.round(completedRows.filter((t) => t.completed).length / completedRows.length * 100)
        : null,
      immediateRate: immediate.n >= MIN_VARIANT_N ? gate(immediate) : null,
      delayedRate: delayed.n >= MIN_VARIANT_N ? gate(delayed) : null,
      newContextRate: newContext.n >= MIN_TRANSFER_N ? Math.round(newContext.rate * 100) : null,
      recurrenceRate: recurrence.n >= MIN_VARIANT_N ? Math.round(recurrence.rate * 100) : null,
    };
  };
  return { adaptive: build('adaptive'), balanced: build('balanced'), minN: MIN_VARIANT_N };
}
