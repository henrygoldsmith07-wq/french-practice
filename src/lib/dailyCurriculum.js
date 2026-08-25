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
};

const MIN_SEGMENT_MINUTES = 3;

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
    examSoon = false, listeningTrack = null, dayIndex = 0,
  } = input;
  const total = Math.max(5, Math.min(45, Math.round(minutes)));

  // Largest-remainder allocation: floors first, then leftover minutes go to
  // the largest fractional shares — the segments always sum to the budget.
  const sources = [];
  const addSource = (id, weight, enabled) => {
    if (!enabled) return;
    const raw = total * weight;
    sources.push({ id, weight, raw, floor: Math.floor(raw), frac: raw - Math.floor(raw) });
  };
  addSource('retrieve', SEGMENT_WEIGHTS.retrieve, srsDue > 0);
  addSource('speak', SEGMENT_WEIGHTS.speak, true);
  addSource('drill', SEGMENT_WEIGHTS.drill, Boolean(topMistake || pendingRetypes > 0));
  addSource('review', SEGMENT_WEIGHTS.review, recentCorrections > 0);
  if (!sources.length) addSource('speak', 1, true);

  let allocated = sources.reduce((a, s) => a + s.floor, 0);
  const byFraction = [...sources].sort((a, b) => b.frac - a.frac || b.weight - a.weight);
  let gi = 0;
  while (allocated < total && byFraction.length) {
    byFraction[gi % byFraction.length].floor += 1;
    allocated += 1;
    gi += 1;
  }
  const minutesFor = (id) => sources.find((s) => s.id === id)?.floor ?? 0;
  const segments = [];
  const skipped = [];

  // ── Speak: always present; production is the point ──────────────────────
  const scenarioId = weaknessScenarioId || suggestedScenarioId || null;
  if (scenarioId) {
    segments.push({
      id: 'speak', label: 'Speak', minutes: minutesFor('speak'),
      payload: { scenarioId },
      why: weaknessScenarioId
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
  if (minutesFor('drill') > 0) {
    if (topMistake) {
      segments.push({
        id: 'drill', label: 'Targeted drill', minutes: minutesFor('drill'),
        payload: { kind: 'mistake', mistakeId: topMistake.id, concept: topMistake.concept, type: topMistake.type },
        why: `${topMistake.concept} — mastery ${topMistake.mastery}, slipped ${topMistake.recurrence}×.`,
      });
    } else if (pendingRetypes > 0) {
      segments.push({
        id: 'drill', label: 'Repair', minutes: minutesFor('drill'),
        payload: { kind: 'retype' },
        why: `${pendingRetypes} correction${pendingRetypes === 1 ? '' : 's'} waiting to be retyped from memory.`,
      });
    }
  }

  // ── Review: delayed replay of very recent corrections ───────────────────
  if (recentCorrections > 0 && minutesFor('review') > 0) {
    segments.push({
      id: 'review', label: 'Delayed review', minutes: minutesFor('review'),
      payload: { count: Math.min(recentCorrections, 6) },
      why: 'Yesterday\'s corrections, replayed before they fade.',
    });
  }

  // ── Listen: any remaining minutes ────────────────────────────────────────
  const used = segments.reduce((a, s) => a + s.minutes, 0);
  const remaining = total - used;
  if (listeningTrack && remaining >= MIN_SEGMENT_MINUTES) {
    segments.push({
      id: 'listen', label: 'Listen', minutes: remaining,
      payload: { track: listeningTrack },
      why: listeningTrack.audioSrc
        ? 'Authentic native audio at your current stage.'
        : 'Ear training while minutes remain.',
    });
  } else if (remaining > 0) {
    // Redistribute leftover minutes to speak.
    const speak = segments.find((s) => s.id === 'speak');
    if (speak) speak.minutes += remaining;
  }

  for (const wouldBe of ['retrieve', 'drill', 'review', 'listen']) {
    if (!segments.some((s) => s.id === wouldBe)) skipped.push(wouldBe);
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    totalMinutes: segments.reduce((a, s) => a + s.minutes, 0),
    segments,
    skipped,
  };
}
