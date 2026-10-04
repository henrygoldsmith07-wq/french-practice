// Session planner — "what is the most useful practice for this learner
// RIGHT NOW?", as ONE coherent adaptive session.
//
// Pure and injectable: plannerState.js assembles the raw learner state from
// storage; this module scores candidates, applies session constraints, and
// returns an ordered session in the product's narrative shape:
//
//   Warm-up → Input → Speaking → Targeted repair → Transfer → Retrieval
//
// Every selection decision goes through a transparent scoring model
// (SCORE_FACTORS): each candidate accumulates named factors, so the choice
// is explainable and testable. Learner-facing copy stays simple — the score
// itself is never shown.
//
// Controlled variety is a first-class requirement: the planner consults
// recentPlans/recentActivity so consecutive sessions do not repeat the same
// weakness, the same activity type three times running, or neglect speaking
// and listening.

import { WEAKNESS_LIFECYCLE, weaknessLifecycle } from './weaknessLifecycle.js';

export const SEGMENT_KINDS = Object.freeze([
  'warmup', 'input', 'speak', 'repair', 'transfer', 'retrieve', 'review',
]);

/** Narrative order of the session. Segments absent from a plan are skipped. */
export const SESSION_ARC = Object.freeze(['warmup', 'input', 'speak', 'repair', 'transfer', 'retrieve']);

export const SCORE_FACTORS = Object.freeze({
  recurrence: 'recurrence',
  activeWeakness: 'active-weakness',
  dueRetest: 'due-retest',
  dueVocabulary: 'due-vocabulary',
  independenceGap: 'independence-gap',
  skillImbalance: 'skill-imbalance',
  goalAlignment: 'goal-alignment',
  transferDue: 'transfer-due',
  delayedDue: 'delayed-due',
  repetitionPenalty: 'repetition-penalty',
  easyWin: 'easy-win',
  fluencyBoost: 'fluency-boost',
  listeningStarved: 'listening-starved',
  speakingStarved: 'speaking-starved',
});

const round2 = (n) => Math.round(n * 100) / 100;

// Human-readable factor explanations — the internal/dev inspection surface.
// Learners only ever see the concise copy in segmentExplain.js; this is what
// makes a planner decision auditable ("why THIS segment, today?").
const FACTOR_REASON = {
  [SCORE_FACTORS.recurrence]: 'has recurred after improving',
  [SCORE_FACTORS.activeWeakness]: 'is an open weakness in recent work',
  [SCORE_FACTORS.dueRetest]: 'a delayed retest is due on it',
  [SCORE_FACTORS.dueVocabulary]: 'vocabulary is due for recall',
  [SCORE_FACTORS.independenceGap]: 'has only been used correctly with help so far',
  [SCORE_FACTORS.skillImbalance]: 'the skill has fallen behind the others',
  [SCORE_FACTORS.goalAlignment]: 'matches what the learner said they want',
  [SCORE_FACTORS.transferDue]: 'is ready to be tested in a new situation',
  [SCORE_FACTORS.delayedDue]: 'is due for a check after the delay',
  [SCORE_FACTORS.easyWin]: 'easy material for fluency and confidence',
  [SCORE_FACTORS.fluencyBoost]: 'a confidence-building win is due',
  [SCORE_FACTORS.listeningStarved]: 'listening practice has been quiet lately',
  [SCORE_FACTORS.speakingStarved]: 'speaking time has been low lately',
};
const FACTOR_PENALTY = {
  [SCORE_FACTORS.repetitionPenalty]: 'the same mode or target was used recently',
};

/**
 * What a clean pass on this segment would PROVE — the planner's forward
 * claim, kept with the plan for research/development inspection. Learners
 * only ever see the concise `why`.
 */
function successProof(kind) {
  switch (kind) {
    case 'repair': return 'a clean pass shows the repaired form works under guided practice; the delayed retest decides whether it sticks';
    case 'transfer': return 'an independent pass in a NEW situation proves the skill, not the sentence, was learned';
    case 'speak': return 'speaking without correction shows the form survives real-time production';
    case 'retrieve': return 'recall without the answer on screen shows the memory exists; it is not yet productive use';
    case 'input': return 'understanding at speed shows the ear holds up; it proves comprehension, not production';
    case 'warmup': return 'an easy success builds fluency and confidence — it proves nothing about mastery, by design';
    case 'review': return 'a due retest passed on time confirms an earlier repair actually held';
    default: return 'practice only; no mastery claim is made from this segment';
  }
}

/**
 * One candidate segment. `kind` is a SESSION_ARC slot; `target` names what it
 * practises (a weakness id/concept, a skill, or 'general').
 *
 * Every candidate carries its full reasoning so a planner decision can be
 * inspected and validated without guessing:
 *   · `reasons` / `penalties` — the named scoring factors in plain language
 *   · `evidence` — what concrete state triggered each factor (counts, due
 *     retests, recent sessions), separate from the interpretation of it
 *   · `successProof` — what a clean pass on this segment would prove
 * The nearest losing competitor and the constraint that bound the choice are
 * attached at plan-build time in `buildSessionPlan`, where the whole field of
 * candidates is known. Learners only ever see the concise `why` line.
 */
function candidate(kind, target, factors, evidence = []) {
  const entries = Object.entries(factors).filter(([, v]) => Number.isFinite(v) && v !== 0);
  const score = round2(entries.reduce((sum, [, v]) => sum + v, 0));
  const reasons = [];
  const penalties = [];
  for (const [k, v] of entries) {
    const text = v < 0 ? FACTOR_PENALTY[k] : FACTOR_REASON[k];
    if (!text) continue;
    const line = v < 0 ? text : `${target || kind} ${text}`;
    (v < 0 ? penalties : reasons).push(line);
  }
  return {
    kind,
    target,
    score,
    factors: Object.fromEntries(entries.map(([k, v]) => [k, round2(v)])),
    reasons,
    penalties,
    evidence: Array.isArray(evidence) ? evidence : [],
    successProof: successProof(kind),
  };
}

/**
 * Score the practice candidates for today. Every input is optional; missing
 * signals simply contribute nothing, so a new learner gets a sane session.
 *
 * @param {{
 *   weaknesses?: Array<object>,          // prioritised learner-error entries
 *   weaknessLifecycle?: Map<string,object|null>, // id → weaknessLifecycle result
 *   srsDue?: number,
 *   dueRetests?: Array<object>,          // mistake-graph retests due
 *   evidenceDue?: Array<{type:'transfer'|'delayed', target?:{skill?:string,label?:string}}>,
 *   skillNeeds?: {listen?:number, speak?:number, retrieve?:number},
 *   goals?: string[],
 *   recentPlans?: Array<{kind:string, target?:string|null, at?:string}>,
 *   assistanceDependence?: number,       // 0..1 recent assisted share
 *   speakingMinutes7d?: number,
 *   listeningMinutes7d?: number,
 *   easyWinEligible?: boolean,           // occasionally inject easy material
 *   hasListeningContent?: boolean,
 *   hasScenario?: boolean,
 *   fieldNoteDue?: number,
 * }} state
 */
export function scoreCandidates(state = {}) {
  const out = [];
  const weaknesses = Array.isArray(state.weaknesses) ? state.weaknesses : [];
  const lifecycleOf = state.weaknessLifecycle instanceof Map
    ? state.weaknessLifecycle
    : new Map();
  const recent = Array.isArray(state.recentPlans) ? state.recentPlans : [];
  const recentTargets = new Map();
  for (const p of recent.slice(0, 14)) {
    if (p?.target) recentTargets.set(p.target, (recentTargets.get(p.target) || 0) + 1);
  }
  // Per-modality practice need (0..1) from the evidence-weighted pressure of
  // OPEN weaknesses — the same number the curriculum uses to size segments
  // (learnerErrors.skillNeedsFromModel). The factor was declared and explained
  // but never read, so a learner with a corroborated listening weakness and one
  // with none at all were offered the same session. It now steers which
  // modality gets the minutes, and only where the modality is runnable.
  const need = state.skillNeeds && typeof state.skillNeeds === 'object' ? state.skillNeeds : {};
  const needOf = (id) => {
    const value = Number(need[id]);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  };

  // ── Repair candidates: one per active weakness, recurrence-aware ───────
  for (const entry of weaknesses.slice(0, 6)) {
    const life = lifecycleOf.get(entry.id) || weaknessLifecycle(entry, {});
    const factors = {};
    const evidence = [];
    const recurrences = Number(entry.recurrenceCount) || 0;
    if (recurrences > 0) {
      factors[SCORE_FACTORS.recurrence] = 1.2 + Math.min(1, recurrences / 3);
      evidence.push(`${recurrences} recurrence${recurrences === 1 ? '' : 's'} after improving`);
    }
    if (entry.errorCount > 1) {
      factors[SCORE_FACTORS.activeWeakness] = 1.0;
      evidence.push(`${entry.errorCount} recorded mistakes on this form`);
    } else {
      factors[SCORE_FACTORS.activeWeakness] = 0.4; // one-off slips stay visible but quiet
      evidence.push('1 recorded mistake (treated as a possible slip)');
    }
    if (entry.independentPasses === 0 && entry.successCount > 0) {
      factors[SCORE_FACTORS.independenceGap] = 0.8; // improves only with help so far
      evidence.push(`${entry.successCount} correct attempt${entry.successCount === 1 ? '' : 's'} so far, none without help`);
    }
    if (life?.state === WEAKNESS_LIFECYCLE.RECURRED) {
      factors[SCORE_FACTORS.recurrence] += 0.6;
      evidence.push('lifecycle state: it came back after improving');
    }
    if (life?.state === WEAKNESS_LIFECYCLE.TRANSFER_CHECK || life?.state === WEAKNESS_LIFECYCLE.DELAYED_CONFIRMATION) {
      factors[SCORE_FACTORS.independenceGap] = (factors[SCORE_FACTORS.independenceGap] || 0) + 0.5;
      evidence.push(`lifecycle state: ${life.state === WEAKNESS_LIFECYCLE.TRANSFER_CHECK ? 'ready for a fresh-context check' : 'holding up, one confirmation left'}`);
    }
    // Controlled variety: targeting the same weakness session after session
    // earns a decaying penalty so one loud weakness cannot own every day.
    const seen = recentTargets.get(entry.id) || 0;
    if (seen > 0) {
      factors[SCORE_FACTORS.repetitionPenalty] = -0.5 * seen;
      evidence.push(`targeted in ${seen} recent session${seen === 1 ? '' : 's'}`);
    }
    // Aligned with the learner's stated goals.
    const goalHit = (state.goals || []).some((g) => String(entry.label || '').toLowerCase().includes(String(g).toLowerCase()));
    if (goalHit) {
      factors[SCORE_FACTORS.goalAlignment] = 0.5;
      evidence.push('matches a stated goal');
    }
    out.push(candidate('repair', entry.id, factors, evidence));
  }

  // ── Speak: regular, goal-aligned, and pushed when speaking is starved ──
  if (state.hasScenario !== false) {
    const factors = {};
    const evidence = [];
    factors[SCORE_FACTORS.activeWeakness] = 0.6; // production is always worth something
    evidence.push('productive practice always scores a base value');
    if ((state.speakingMinutes7d || 0) < 20) {
      factors[SCORE_FACTORS.speakingStarved] = 1.0;
      evidence.push(`${Math.round(state.speakingMinutes7d || 0)} min of speaking in the last 7 days`);
    }
    if ((state.assistanceDependence || 0) > 0.5) {
      factors[SCORE_FACTORS.independenceGap] = 0.6;
      evidence.push(`${Math.round(state.assistanceDependence * 100)}% of recent successes needed help`);
    }
    const dueTransfer = (state.evidenceDue || []).find((e) => e.type === 'transfer');
    if (dueTransfer) {
      factors[SCORE_FACTORS.transferDue] = 1.0;
      evidence.push('a repaired weakness is ready for an independent check');
    }
    // Open speaking/pronunciation pressure outranks the base value, so a
    // corroborated speaking weakness actually buys the session's speech.
    const speakNeed = needOf('speak');
    if (speakNeed > 0) {
      factors[SCORE_FACTORS.skillImbalance] = 1.2 * speakNeed;
      evidence.push(`open speaking and pronunciation weaknesses are worth ${Math.round(speakNeed * 100)}% of their usual pull`);
    }
    const seen = recentTargets.get('speak') || 0;
    if (seen >= 2) {
      factors[SCORE_FACTORS.repetitionPenalty] = -0.4 * (seen - 1);
      evidence.push(`speaking ran in ${seen} recent sessions`);
    }
    out.push(candidate('speak', 'speak', factors, evidence));
  }

  // ── Transfer: periodic fresh-context testing, not constant training ───
  const dueTransfer = (state.evidenceDue || []).find((e) => e.type === 'transfer');
  const dueDelayed = (state.evidenceDue || []).find((e) => e.type === 'delayed');
  if (dueTransfer || dueDelayed) {
    const factors = {};
    const evidence = [];
    if (dueTransfer) {
      factors[SCORE_FACTORS.transferDue] = 1.6;
      evidence.push(`fresh-context check due for ${dueTransfer.target?.label || 'a repaired weakness'}`);
    }
    if (dueDelayed) {
      factors[SCORE_FACTORS.delayedDue] = 1.4;
      evidence.push(`delayed retest due for ${dueDelayed.target?.label || 'a repaired weakness'}`);
    }
    if ((state.assistanceDependence || 0) > 0.3) {
      factors[SCORE_FACTORS.independenceGap] = 0.5;
      evidence.push(`${Math.round(state.assistanceDependence * 100)}% of recent successes needed help`);
    }
    out.push(candidate('transfer', dueDelayed?.target?.skill || dueTransfer?.target?.skill || 'transfer', factors, evidence));
  }

  // ── Retrieve: due vocabulary, weighted for high-frequency words ────────
  if ((state.srsDue || 0) > 0) {
    const factors = {};
    const evidence = [`${state.srsDue} word${state.srsDue === 1 ? '' : 's'} due for recall`];
    factors[SCORE_FACTORS.dueVocabulary] = Math.min(1.4, 0.5 + (state.srsDue / 20));
    // Open vocabulary pressure: a word family that keeps slipping is worth more
    // than another turn of the ordinary due queue.
    const retrieveNeed = needOf('retrieve');
    if (retrieveNeed > 0) {
      factors[SCORE_FACTORS.skillImbalance] = 1.2 * retrieveNeed;
      evidence.push(`open vocabulary weaknesses are worth ${Math.round(retrieveNeed * 100)}% of their usual pull`);
    }
    if (state.fieldNoteDue > 0) {
      factors[SCORE_FACTORS.goalAlignment] = 0.4; // the learner's own words
      evidence.push(`${state.fieldNoteDue} of them are the learner's own saved phrases`);
    }
    const seen = recentTargets.get('retrieve') || 0;
    if (seen >= 2) {
      factors[SCORE_FACTORS.repetitionPenalty] = -0.3 * (seen - 1);
      evidence.push(`recall ran in ${seen} recent sessions`);
    }
    out.push(candidate('retrieve', 'retrieve', factors, evidence));
  }

  // ── Due retests: delayed reviews owed to earlier repairs ──────────────
  for (const retest of (state.dueRetests || []).slice(0, 3)) {
    const factors = {};
    const evidence = [`retest of ${retest.concept || retest.id} is due`];
    factors[SCORE_FACTORS.dueRetest] = 1.3;
    if (retest.recurrence > 0) {
      factors[SCORE_FACTORS.recurrence] = 0.6;
      evidence.push(`${retest.recurrence} recurrenc${retest.recurrence === 1 ? 'y' : 'ies'} on record`);
    }
    const seen = recentTargets.get(retest.id) || 0;
    if (seen > 0) {
      factors[SCORE_FACTORS.repetitionPenalty] = -0.3 * seen;
      evidence.push(`targeted in ${seen} recent session${seen === 1 ? '' : 's'}`);
    }
    out.push(candidate('review', retest.id, factors, evidence));
  }

  // ── Input/listening: exposure that must not be neglected ───────────────
  if (state.hasListeningContent !== false) {
    const factors = {};
    const evidence = [];
    if ((state.listeningMinutes7d || 0) < 15) {
      factors[SCORE_FACTORS.listeningStarved] = 1.1;
      evidence.push(`${Math.round(state.listeningMinutes7d || 0)} min of listening in the last 7 days`);
    }
    factors[SCORE_FACTORS.activeWeakness] = 0.3;
    evidence.push('comprehension exposure keeps the ear in the language');
    // Open listening pressure: a corroborated listening weakness outranks the
    // "don't neglect exposure" floor, so the ear gets real work.
    const listenNeed = needOf('listen');
    if (listenNeed > 0) {
      factors[SCORE_FACTORS.skillImbalance] = 1.2 * listenNeed;
      evidence.push(`open listening weaknesses are worth ${Math.round(listenNeed * 100)}% of their usual pull`);
    }
    const seen = recentTargets.get('input') || 0;
    if (seen >= 2) {
      factors[SCORE_FACTORS.repetitionPenalty] = -0.3 * (seen - 1);
      evidence.push(`listening ran in ${seen} recent sessions`);
    }
    out.push(candidate('input', 'listening', factors, evidence));
  }

  // ── Occasional easy material: fluency and confidence ──────────────────
  if (state.easyWinEligible) {
    out.push(candidate('warmup', 'fluency', {
      [SCORE_FACTORS.easyWin]: 0.9,
      [SCORE_FACTORS.fluencyBoost]: 0.4,
    }, ['an easy success is due for fluency and confidence (every third day)']));
  }

  return out.sort((a, b) => b.score - a.score);
}

/** Every candidate gets an activity type; avoid three identical kinds running. */
export function activityTypeOf(kind) {
  switch (kind) {
    case 'speak': case 'transfer': return 'speaking';
    case 'input': case 'warmup': return 'listening';
    case 'retrieve': return 'recall';
    case 'repair': return 'repair';
    case 'review': return 'review';
    default: return 'practice';
  }
}

/**
 * Session constraints. Each returns [] when satisfied, or human-readable
 * reasons when it adjusts the selection. Exposed for tests and diagnostics.
 */
export function applySessionConstraints(candidates, state = {}) {
  const chosen = [];
  const adjustments = [];
  const recent = Array.isArray(state.recentPlans) ? state.recentPlans : [];
  const recentTypes = recent.map((p) => activityTypeOf(p.kind));
  const typeRun = (type) => {
    let run = 0;
    for (let i = recentTypes.length - 1; i >= 0 && recentTypes[i] === type; i -= 1) run += 1;
    return run;
  };
  const chosenTypes = [...recentTypes];
  const targetsUsed = new Map();
  for (const p of recent.slice(0, 6)) {
    if (p?.target) targetsUsed.set(p.target, (targetsUsed.get(p.target) || 0) + 1);
  }

  for (const c of candidates) {
    const type = activityTypeOf(c.kind);
    // Do not target the same weakness excessively in one day — checked first
    // so the adjustment names the more specific reason.
    if (c.target && (targetsUsed.get(c.target) || 0) >= 2) {
      adjustments.push(`skipped:${c.kind}:target-saturation`);
      continue;
    }
    // Never the same activity type three times in a row (including what the
    // learner already did recently).
    if (typeRun(type) + chosenTypes.filter((t) => t === type).length >= 2) {
      adjustments.push(`skipped:${c.kind}:type-run`);
      continue;
    }
    chosen.push(c);
    chosenTypes.push(type);
    if (c.target) targetsUsed.set(c.target, (targetsUsed.get(c.target) || 0) + 1);
    if (chosen.length >= 5) break;
  }

  // Speaking must appear regularly. If constraints starved it out, add the
  // best speaking candidate back.
  if (state.hasScenario !== false && !chosen.some((c) => c.kind === 'speak')) {
    const speak = candidates.find((c) => c.kind === 'speak');
    if (speak && chosen.length < 6) {
      chosen.push(speak);
      adjustments.push('added:speak:regularity');
    }
  }
  // Listening exposure must not be neglected either.
  if (state.hasListeningContent !== false
    && !chosen.some((c) => c.kind === 'input' || c.kind === 'warmup')
    && (state.listeningMinutes7d || 0) < 25) {
    const input = candidates.find((c) => c.kind === 'input' || c.kind === 'warmup');
    if (input && chosen.length < 6) {
      chosen.push(input);
      adjustments.push('added:input:exposure');
    }
  }
  // Alternate receptive and productive work: sequence, not just membership.
  const ordered = [];
  const rest = [...chosen];
  while (rest.length) {
    const last = ordered.length ? activityTypeOf(ordered[ordered.length - 1].kind) : null;
    let pick = rest.findIndex((c) => activityTypeOf(c.kind) !== last);
    if (pick < 0) pick = 0;
    ordered.push(rest.splice(pick, 1)[0]);
  }
  return { chosen: ordered, adjustments };
}

/**
 * Build today's session: one coherent plan the learner can understand at a
 * glance. Returns a plan object the Today screen renders directly.
 *
 * @param {{minutes?:number, durationPreference?:'short'|'medium'|'long',
 *          state?:object, dayIndex?:number, level?:string,
 *          track?:object|null, scenarioId?:string|null,
 *          repairTarget?:object|null}} input
 */
export function buildSessionPlan(input = {}) {
  const state = input.state || {};
  const minutes = Math.max(5, Math.min(45, Math.round(Number(input.minutes) || 20)));
  const candidates = scoreCandidates(state);
  const { chosen, adjustments } = applySessionConstraints(candidates, state);

  // Sequence along the narrative arc, then allocate minutes.
  const byArc = [...chosen].sort((a, b) => SESSION_ARC.indexOf(a.kind) - SESSION_ARC.indexOf(b.kind));
  const budget = {};
  for (const kind of SESSION_ARC) budget[kind] = 0;
  let remaining = minutes;
  const weights = { warmup: 0.08, input: 0.16, speak: 0.30, repair: 0.22, transfer: 0.14, retrieve: 0.16 };
  const weightTotal = byArc.reduce((sum, c) => sum + (weights[c.kind] || 0.1), 0) || 1;
  for (const c of byArc) {
    const raw = (minutes * (weights[c.kind] || 0.1)) / weightTotal;
    budget[c.kind] = Math.max(2, Math.round(raw));
    remaining -= budget[c.kind];
  }
  if (remaining > 0 && byArc.length) budget[byArc[0].kind] += remaining;

  const segments = byArc.map((c) => {
    // The nearest losing competitor: the highest-scoring candidate of the
    // same kind that did NOT make the plan, or the runner-up overall when
    // this kind had no rival. "Why THIS one" is only inspectable beside
    // "why not that one".
    const losers = candidates.filter((x) => !chosen.includes(x));
    const sameKindLoser = losers
      .filter((x) => x.kind === c.kind)
      .sort((a, b) => b.score - a.score)[0] || null;
    const runnerUp = losers.slice().sort((a, b) => b.score - a.score)[0] || null;
    const competing = sameKindLoser || (runnerUp && runnerUp.kind !== c.kind ? runnerUp : null);
    // The constraint that most affected this candidate's ranking, if any.
    const constraints = adjustments.filter((a) => a.includes(`:${c.kind}:`));
    return {
      id: c.kind,
      kind: c.kind,
      label: SEGMENT_LABEL[c.kind] || 'Practice',
      minutes: budget[c.kind] || 2,
      target: c.target,
      factors: c.factors,
      // The full reasoning, kept with the plan for dev/research inspection;
      // the learner only ever sees `why` below. No raw scoring jargon leaves
      // this object — it is internal, and it is complete.
      explain: {
        candidate: `${c.kind}${c.target ? `:${c.target}` : ''}`,
        score: c.score,
        reasons: c.reasons,
        penalties: c.penalties,
        evidence: c.evidence,
        successProof: c.successProof,
        competing: competing
          ? {
            candidate: `${competing.kind}${competing.target ? `:${competing.target}` : ''}`,
            score: competing.score,
            lostBy: round2(c.score - competing.score),
          }
          : null,
        constraints,
      },
      why: segmentWhy(c, state),
    };
  });

  const focus = segments.find((s) => s.kind === 'repair') || segments.find((s) => s.kind === 'transfer') || segments[0] || null;
  const demonstration = segments.find((s) => s.kind === 'transfer') || null;
  return {
    minutes: segments.reduce((sum, s) => sum + s.minutes, 0),
    segments,
    focus,
    demonstration,
    adjustments,
    arc: segments.map((s) => s.kind),
  };
}

const SEGMENT_LABEL = {
  warmup: 'Warm-up',
  input: 'Listening',
  speak: 'Speaking',
  repair: 'Targeted repair',
  transfer: 'Use it in a new situation',
  retrieve: 'Recall',
  review: 'Quick review',
};

function segmentWhy(c, state) {
  switch (c.kind) {
    case 'warmup': return 'A short easy warm-up — confidence first, then we push.';
    case 'input': return (state.listeningMinutes7d || 0) < 15
      ? 'Your listening has been quiet lately, so today gives your ears real work.'
      : 'Listening at your level keeps your ear in the language.';
    case 'speak': return 'Productive speaking: say things, get corrected, keep going.';
    case 'repair': return c.factors?.[SCORE_FACTORS.recurrence] > 0
      ? 'This keeps coming back, so today repairs it properly.'
      : 'Your most useful fix right now.';
    case 'transfer': return 'Now prove it somewhere new — no prompt, no help.';
    case 'retrieve': return 'Pull words back out at the forgetting point.';
    case 'review': return 'A repair you owe another look at.';
    default: return 'Practice chosen for you.';
  }
}

/**
 * The learner-facing session brief: one dominant CTA line plus three short
 * reason lines. No engine terminology, no scores.
 */
export function sessionBrief(plan, { minutes, dueCount = 0, weaknessLabel = null, skillLabel = null } = {}) {
  const total = minutes || plan?.minutes || 0;
  const lines = [];
  if (dueCount > 0) lines.push(`${dueCount} item${dueCount === 1 ? '' : 's'} due`);
  if (skillLabel) lines.push(`${skillLabel} needs work`);
  if (weaknessLabel) lines.push(`${weaknessLabel} recently recurred`);
  if (!lines.length && plan?.segments?.length) {
    lines.push(plan.segments.map((s) => s.label.toLowerCase()).slice(0, 3).join(' · '));
  }
  return {
    cta: `Start today's session — ${total} min`,
    lines: lines.slice(0, 3),
    demonstrate: plan?.demonstration
      ? 'At the end, you will use what you practised in a new situation.'
      : 'At the end, a quick recall check.',
  };
}
