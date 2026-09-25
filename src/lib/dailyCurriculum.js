import { localDayKey } from './localDay.js';

// Daily curriculum — answers "what is the most valuable French practice for
// this learner TODAY?" and can explain why.
//
// Input is the learner's state (injected, pure function): due retrieval,
// mistake graph urgency, weakness targeting, listening stage, pending
// repairs. Output is an ordered segment plan with minutes and a WHY line
// per segment. Deterministic: same state, same day shape.
//
// The reference split at 20 minutes mirrors the product spec:
//   ~5 min retrieval · ~7 min speaking · ~5 min targeted drill · ~3 min review
// Shorter/longer sessions scale the same ratios with floors.

export const SEGMENT_WEIGHTS = {
  retrieve: 0.25,
  speak: 0.35,
  drill: 0.25,
  review: 0.15,
  listen: 0.15,
};

const MIN_SEGMENT_MINUTES = 3;

// When a short session cannot fit every eligible activity at a meaningful
// length, keep the highest-value session roles instead of creating 1-minute
// context switches. Listening outranks delayed review because it is a core
// modality; review is the first optional segment to yield.
const SEGMENT_KEEP_PRIORITY = ['speak', 'retrieve', 'drill', 'listen', 'review'];

function allocateMinutes(sources, total) {
  if (!sources.length) return [];

  const maxSegments = Math.max(1, Math.floor(total / MIN_SEGMENT_MINUTES));
  let active = sources;
  if (active.length > maxSegments) {
    const keep = new Set(
      [...active]
        .sort((a, b) => SEGMENT_KEEP_PRIORITY.indexOf(a.id) - SEGMENT_KEEP_PRIORITY.indexOf(b.id))
        .slice(0, maxSegments)
        .map((s) => s.id),
    );
    active = active.filter((s) => keep.has(s.id));
  }

  // Water-fill the requested weights with a hard minimum. This preserves the
  // 20-minute reference split exactly when no constraint binds, while a plan
  // with more active modalities gets normalized rather than over-allocating.
  const target = new Map();
  let remaining = [...active];
  let remainingMinutes = total;

  while (remaining.length) {
    const weightTotal = remaining.reduce((sum, s) => sum + s.weight, 0);
    const under = remaining.filter(
      (s) => (remainingMinutes * s.weight) / Math.max(weightTotal, Number.EPSILON) < MIN_SEGMENT_MINUTES,
    );
    if (!under.length) {
      for (const s of remaining) {
        target.set(s.id, (remainingMinutes * s.weight) / Math.max(weightTotal, Number.EPSILON));
      }
      break;
    }

    // With maxSegments applied above, there is always enough budget to pin
    // every constrained segment to the minimum.
    for (const s of under) target.set(s.id, MIN_SEGMENT_MINUTES);
    remainingMinutes -= under.length * MIN_SEGMENT_MINUTES;
    const underIds = new Set(under.map((s) => s.id));
    remaining = remaining.filter((s) => !underIds.has(s.id));
  }

  const allocated = active.map((s) => {
    const raw = target.get(s.id) ?? MIN_SEGMENT_MINUTES;
    const floor = Math.floor(raw);
    return { ...s, raw, floor, frac: raw - floor };
  });
  let used = allocated.reduce((sum, s) => sum + s.floor, 0);
  const remainderOrder = [...allocated].sort(
    (a, b) => b.frac - a.frac
      || b.weight - a.weight
      || SEGMENT_KEEP_PRIORITY.indexOf(a.id) - SEGMENT_KEEP_PRIORITY.indexOf(b.id),
  );
  let i = 0;
  while (used < total && remainderOrder.length) {
    remainderOrder[i % remainderOrder.length].floor += 1;
    used += 1;
    i += 1;
  }
  return allocated;
}

/**
 * @param {{
 *   minutes?: number,
 *   srsDue?: number,
 *   topMistake?: {id,concept,label?,type,mastery,recurrence}|null,
 *   pendingRetypes?: number,
 *   recentCorrections?: number,     // corrected sentences from last ~48h
 *   weaknessScenarioId?: string|null,
 *   suggestedScenarioId?: string|null,
 *   examSoon?: boolean,
 *   listeningTrack?: {id,title,audioSrc?}|null,
 *   dayIndex?: number,
 * }} input
 */
export function buildDailyCurriculum(input = {}) {
  const {
    minutes = 20, srsDue = 0, topMistake = null, pendingRetypes = 0,
    recentCorrections = 0, weaknessScenarioId = null, suggestedScenarioId = null,
    examSoon = false, listeningTrack = null,
    balanced = false, balancedDrillTopic = null,
  } = input;
  const total = Math.max(5, Math.min(45, Math.round(minutes)));

  // BALANCED variant: identical time/modality budget, but learner-specific
  // targeting is stripped — speak uses the rotation scenario, drill uses a
  // generic rotating grammar topic. Same burden, no mistake-graph signal.
  const effTopMistake = balanced ? null : topMistake;
  const effWeaknessScenarioId = balanced ? null : weaknessScenarioId;
  const effRecentCorrections = balanced ? 0 : recentCorrections;
  const effPendingRetypes = balanced ? 0 : pendingRetypes;

  const scenarioId = effWeaknessScenarioId || suggestedScenarioId || null;

  // Build only REAL runnable candidates. Previously Speak consumed budget even
  // when no scenario existed, and listening was not a weighted source at all;
  // because the allocator always filled 100% of the budget, a normal session
  // with a valid track had zero minutes left and could never schedule Listen.
  const sources = [];
  const addSource = (id, weight, enabled) => {
    if (enabled) sources.push({ id, weight });
  };
  addSource('retrieve', SEGMENT_WEIGHTS.retrieve, srsDue > 0);
  addSource('speak', SEGMENT_WEIGHTS.speak, Boolean(scenarioId));
  addSource('drill', SEGMENT_WEIGHTS.drill, Boolean(effTopMistake || effPendingRetypes > 0 || balancedDrillTopic));
  addSource('review', SEGMENT_WEIGHTS.review, effRecentCorrections > 0);
  addSource('listen', SEGMENT_WEIGHTS.listen, Boolean(listeningTrack));

  const allocatedSources = allocateMinutes(sources, total);
  const minutesFor = (id) => allocatedSources.find((s) => s.id === id)?.floor ?? 0;
  const segments = [];
  const skipped = [];

  // ── Speak: productive use of the target language ────────────────────────
  if (scenarioId) {
    segments.push({
      id: 'speak', label: 'Speak', minutes: minutesFor('speak'),
      payload: { scenarioId },
      why: effWeaknessScenarioId
        ? 'Retests a structure you slipped on — in a fresh context.'
        : examSoon
          ? 'Exam-style speaking keeps production sharp.'
          : 'Productive speech first: say things, get corrected.',
    });
  }

  // ── Retrieve: overdue spaced retrieval ──────────────────────────────────
  if (srsDue > 0 && minutesFor('retrieve') > 0) {
    segments.push({
      id: 'retrieve', label: 'Retrieve', minutes: minutesFor('retrieve'),
      payload: { cardCap: Math.min(srsDue, minutesFor('retrieve') * 2) },
      why: `${srsDue} card${srsDue === 1 ? '' : 's'} due — recall right at the forgetting point.`,
    });
  }

  // ── Drill: the weakest mistake concept, or pending retypes ──────────────
  // Branch on the EFFECTIVE (post-balance) values. In the balanced variant
  // effTopMistake/effPendingRetypes are nulled so the balanced rotation owns
  // the drill; using the raw topMistake here would leak learner-specific
  // targeting back into the control arm.
  if (minutesFor('drill') > 0) {
    if (effTopMistake) {
      segments.push({
        id: 'drill', label: 'Targeted drill', minutes: minutesFor('drill'),
        payload: { kind: 'mistake', mistakeId: effTopMistake.id, concept: effTopMistake.concept, type: effTopMistake.type },
        why: `${effTopMistake.concept} — mastery ${effTopMistake.mastery}, slipped ${effTopMistake.recurrence}×.`,
      });
    } else if (balancedDrillTopic) {
      segments.push({
        id: 'drill', label: 'Targeted drill', minutes: minutesFor('drill'),
        payload: { kind: 'mistake', concept: balancedDrillTopic, type: 'grammar' },
        why: `Balanced rotation: ${balancedDrillTopic}.`,
      });
    } else if (effPendingRetypes > 0) {
      segments.push({
        id: 'drill', label: 'Repair', minutes: minutesFor('drill'),
        payload: { kind: 'retype' },
        why: `${effPendingRetypes} correction${effPendingRetypes === 1 ? '' : 's'} waiting to be retyped from memory.`,
      });
    }
  }

  // ── Review: delayed replay of very recent corrections ───────────────────
  if (effRecentCorrections > 0 && minutesFor('review') > 0) {
    segments.push({
      id: 'review', label: 'Delayed review', minutes: minutesFor('review'),
      payload: { count: Math.min(effRecentCorrections, 6) },
      why: 'Yesterday\'s corrections, replayed before they fade.',
    });
  }

  // ── Listen: a first-class Today modality when content exists ────────────
  if (listeningTrack && minutesFor('listen') > 0) {
    segments.push({
      id: 'listen', label: 'Listen', minutes: minutesFor('listen'),
      payload: { track: listeningTrack },
      why: listeningTrack.audioSrc
        ? 'Authentic native audio at your current stage.'
        : 'Ear training at your current stage.',
    });
  }

  for (const wouldBe of ['retrieve', 'drill', 'review', 'listen']) {
    if (!segments.some((s) => s.id === wouldBe)) skipped.push(wouldBe);
  }

  return {
    date: localDayKey(),
    totalMinutes: segments.reduce((a, s) => a + s.minutes, 0),
    segments,
    skipped,
  };
}
