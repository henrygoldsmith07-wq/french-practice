// Learner-facing learning-effectiveness evidence.
//
// This is deliberately separate from XP/streak/activity counters and from the
// opt-in Evidence Study. It answers one product question for ordinary local
// learners: did a real weakness improve, transfer to a new situation, and
// survive a delay?
//
// Canonical loop:
//   baseline weakness → intervention → unseen transfer → delayed retest
//
// Practice modes feed the same event shape. The model never manufactures a
// result: missing transfer/delayed evidence remains missing, not zero.

export const LEARNING_EVIDENCE_VERSION = 1;
export const LEARNING_STATES = Object.freeze({
  ACTIVE: 'active-weakness',
  IMPROVING: 'improving',
  NEEDS_CONFIRMATION: 'needs-confirmation',
  DEMONSTRATED: 'demonstrated',
  RECURRED: 'recurred',
});

export const LEARNING_STATE_LABELS = Object.freeze({
  [LEARNING_STATES.ACTIVE]: 'Active weakness',
  [LEARNING_STATES.IMPROVING]: 'Improving',
  [LEARNING_STATES.NEEDS_CONFIRMATION]: 'Needs confirmation',
  [LEARNING_STATES.DEMONSTRATED]: 'Demonstrated',
  [LEARNING_STATES.RECURRED]: 'Recurred',
});

export const EVIDENCE_PHASES = Object.freeze(['baseline', 'intervention', 'transfer', 'delayed', 'recurrence']);
const PHASE_SET = new Set(EVIDENCE_PHASES);
const MAX_CYCLES = 240;
const MAX_EVENTS_PER_PHASE = 24;
const DAY = 86400000;
const DELAYED_MIN_HOURS = 20;
const SOURCE_RELIABILITY = { high: 1, medium: 0.82, low: 0.62, unknown: 0.72 };
const ASSISTANCE_WEIGHT = { none: 1, scaffolded: 0.68, assisted: 0.38 };
const PHASE_WEIGHT = { baseline: 0.75, intervention: 0.72, transfer: 1.18, delayed: 1.28, recurrence: 1.2 };

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value)));
const finite = (value) => Number.isFinite(Number(value));
const iso = (value, fallback = new Date().toISOString()) => {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};
const text = (value, max = 120) => {
  const str = String(value || '').trim();
  return str ? str.slice(0, max) : null;
};

function assistanceOf(event = {}) {
  if (event.assistance === 'assisted' || event.assisted === true) return 'assisted';
  if (event.assistance === 'scaffolded' || event.hinted === true) return 'scaffolded';
  return 'none';
}

function reliabilityOf(value) {
  return Object.hasOwn(SOURCE_RELIABILITY, value) ? value : 'unknown';
}

function targetOf(event = {}) {
  const skill = text(event.skill || event.category || 'general', 40) || 'general';
  const key = text(event.targetKey || event.key || event.topicId || event.itemId || 'general', 120) || 'general';
  return {
    id: `${skill}:${key}`,
    skill,
    key,
    label: text(event.label || event.targetLabel || key, 140) || key,
  };
}

export function normaliseLearningEvidenceEvent(input = {}, fallbackAt = new Date().toISOString()) {
  if (!input || typeof input !== 'object') return null;
  const phase = PHASE_SET.has(input.phase) ? input.phase : null;
  if (!phase) return null;
  const target = targetOf(input);
  const at = iso(input.at, fallbackAt);
  const assistance = assistanceOf(input);
  const score = finite(input.score) ? Math.round(clamp(input.score, 0, 100)) : null;
  const correct = typeof input.correct === 'boolean'
    ? input.correct
    : score == null ? null : score >= 70;
  const difficulty = finite(input.difficulty) ? clamp(input.difficulty, 1, 5) : null;
  const markerConfidence = finite(input.markerConfidence ?? input.confidence)
    ? clamp(input.markerConfidence ?? input.confidence)
    : null;
  const promptNovelty = finite(input.promptNovelty) ? clamp(input.promptNovelty) : null;
  const independent = input.independent === false ? false : assistance === 'none' && Boolean(input.encounterId || input.independent === true);
  const modality = text(input.modality || input.mode || target.skill, 40) || target.skill;
  const sourceModality = text(input.sourceModality, 40);
  const delayHours = finite(input.delayHours) ? Math.max(0, Number(input.delayHours)) : null;
  return {
    id: text(input.id, 100) || `${target.id}:${phase}:${at}:${text(input.encounterId, 50) || 'unknown'}`,
    phase,
    targetId: target.id,
    skill: target.skill,
    targetKey: target.key,
    label: target.label,
    at,
    modality,
    sourceModality,
    score,
    correct,
    assistance,
    independent,
    heldOut: input.heldOut === true,
    promptNovelty,
    difficulty,
    markerConfidence,
    sourceReliability: reliabilityOf(input.sourceReliability),
    source: text(input.source, 80),
    sessionId: text(input.sessionId, 80),
    encounterId: text(input.encounterId, 80),
    activityId: text(input.activityId, 80),
    delayHours,
    detail: text(input.detail, 180),
  };
}

function emptyCycle(target, at) {
  return {
    id: `cycle:${target.id}`,
    target,
    startedAt: at,
    updatedAt: at,
    baseline: [],
    interventions: [],
    transfers: [],
    delayed: [],
    recurrences: [],
  };
}

function normaliseCycle(input, fallbackAt) {
  if (!input || typeof input !== 'object') return null;
  const target = targetOf(input.target || input);
  const cycle = emptyCycle(target, iso(input.startedAt, fallbackAt));
  cycle.id = text(input.id, 180) || cycle.id;
  cycle.updatedAt = iso(input.updatedAt, cycle.startedAt);
  const lanes = [
    ['baseline', 'baseline'],
    ['interventions', 'intervention'],
    ['transfers', 'transfer'],
    ['delayed', 'delayed'],
    ['recurrences', 'recurrence'],
  ];
  for (const [field, phase] of lanes) {
    cycle[field] = (Array.isArray(input[field]) ? input[field] : [])
      .map((e) => normaliseLearningEvidenceEvent({ ...e, phase, skill: e.skill || target.skill, targetKey: e.targetKey || target.key, label: e.label || target.label }, cycle.updatedAt))
      .filter(Boolean)
      .slice(-MAX_EVENTS_PER_PHASE);
  }
  return cycle;
}

export function createLearningEvidenceState(input = {}) {
  const updatedAt = iso(input?.updatedAt, new Date().toISOString());
  const cycles = (Array.isArray(input?.cycles) ? input.cycles : [])
    .map((cycle) => normaliseCycle(cycle, updatedAt))
    .filter(Boolean);
  const newest = new Map();
  for (const cycle of cycles) {
    const current = newest.get(cycle.target.id);
    if (!current || current.updatedAt < cycle.updatedAt) newest.set(cycle.target.id, cycle);
  }
  return { version: LEARNING_EVIDENCE_VERSION, updatedAt, cycles: [...newest.values()].slice(-MAX_CYCLES) };
}

function eventLane(phase) {
  if (phase === 'baseline') return 'baseline';
  if (phase === 'intervention') return 'interventions';
  if (phase === 'transfer') return 'transfers';
  if (phase === 'delayed') return 'delayed';
  return 'recurrences';
}

function sameEncounter(a, b) {
  return Boolean(a?.encounterId && b?.encounterId && a.encounterId === b.encounterId && a.phase === b.phase);
}

export function recordLearningEvidence(state, event = {}, { at = null } = {}) {
  const base = createLearningEvidenceState(state);
  const evidence = normaliseLearningEvidenceEvent({ ...event, at: at || event.at }, base.updatedAt);
  if (!evidence) return base;
  const target = targetOf(evidence);
  const existing = base.cycles.find((cycle) => cycle.target.id === target.id);
  const cycle = existing ? { ...existing } : emptyCycle(target, evidence.at);
  cycle.target = { ...cycle.target, ...target, label: target.label || cycle.target.label };

  // A fresh weakness after meaningful positive evidence is recurrence even if
  // the producer only knows it observed another baseline miss.
  let phase = evidence.phase;
  if (phase === 'baseline' && existing && (existing.interventions.length || existing.transfers.length || existing.delayed.length)) {
    phase = 'recurrence';
  }
  const lane = eventLane(phase);
  const item = { ...evidence, phase };
  const current = Array.isArray(cycle[lane]) ? cycle[lane] : [];
  // Double-fire / re-submit of the same presentation must not inflate evidence
  // depth. Keep one audit row for that encounter+phase.
  cycle[lane] = current.some((row) => sameEncounter(row, item))
    ? current
    : [...current, item].slice(-MAX_EVENTS_PER_PHASE);
  cycle.updatedAt = evidence.at;
  const cycles = [cycle, ...base.cycles.filter((row) => row.target.id !== target.id)]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, MAX_CYCLES);
  return { version: LEARNING_EVIDENCE_VERSION, updatedAt: evidence.at, cycles };
}

export function evidenceStrengthScore(event, now = Date.now()) {
  const e = normaliseLearningEvidenceEvent(event, new Date(now).toISOString());
  if (!e) return 0;
  const ageDays = Math.max(0, (now - Date.parse(e.at)) / DAY);
  const recency = Math.pow(0.5, ageDays / 90);
  const assistance = ASSISTANCE_WEIGHT[e.assistance] || ASSISTANCE_WEIGHT.assisted;
  const independent = e.independent ? 1 : 0.72;
  const heldOut = e.heldOut ? 1.18 : 1;
  const novelty = e.promptNovelty == null ? 0.9 : 0.72 + e.promptNovelty * 0.28;
  const difficulty = e.difficulty == null ? 0.9 : 0.78 + ((e.difficulty - 1) / 4) * 0.22;
  const marker = e.markerConfidence == null ? 0.82 : 0.55 + e.markerConfidence * 0.45;
  const reliability = SOURCE_RELIABILITY[e.sourceReliability] || SOURCE_RELIABILITY.unknown;
  const delayedBonus = e.phase === 'delayed' || (e.delayHours != null && e.delayHours >= DELAYED_MIN_HOURS) ? 1.12 : 1;
  return Math.round(clamp(
    (PHASE_WEIGHT[e.phase] || 0.7) * assistance * independent * heldOut * novelty * difficulty * marker * reliability * delayedBonus * recency,
    0,
    1.5,
  ) * 1000) / 1000;
}

function after(events, at) {
  const t = Date.parse(at || 0);
  return (events || []).filter((e) => Date.parse(e.at) >= t);
}

function independentSuccesses(events, { heldOut = false, minStrength = 0.45, now = Date.now() } = {}) {
  const seen = new Set();
  return (events || []).filter((e) => {
    if (e.correct !== true || !e.independent) return false;
    if (heldOut && !e.heldOut) return false;
    if (evidenceStrengthScore(e, now) < minStrength) return false;
    if (!e.encounterId) return false;
    if (seen.has(e.encounterId)) return false;
    seen.add(e.encounterId);
    return true;
  });
}

export function learningCycleStatus(cycle, now = Date.now()) {
  const c = normaliseCycle(cycle, new Date(now).toISOString());
  if (!c) return LEARNING_STATES.ACTIVE;
  const lastRecurrence = c.recurrences.at(-1)?.at || null;
  const floorAt = lastRecurrence || c.startedAt;
  const interventions = after(c.interventions, floorAt);
  const transfers = after(c.transfers, floorAt);
  const delayed = after(c.delayed, floorAt);
  const independentIntervention = independentSuccesses(interventions, { minStrength: 0.3, now });
  const independentTransfer = independentSuccesses(transfers, { heldOut: true, minStrength: 0.5, now });
  const independentDelayed = independentSuccesses(delayed, { minStrength: 0.5, now });
  const positiveAfterRecurrence = [...independentIntervention, ...independentTransfer, ...independentDelayed]
    .some((e) => Date.parse(e.at) > Date.parse(lastRecurrence || 0));

  if (lastRecurrence && !positiveAfterRecurrence) return LEARNING_STATES.RECURRED;
  if (independentTransfer.length && independentDelayed.length) return LEARNING_STATES.DEMONSTRATED;
  if (independentTransfer.length || independentDelayed.length || independentIntervention.length >= 2) return LEARNING_STATES.NEEDS_CONFIRMATION;
  if (interventions.some((e) => e.correct === true)) return LEARNING_STATES.IMPROVING;
  return LEARNING_STATES.ACTIVE;
}

export function learningCycleSummary(cycle, now = Date.now()) {
  const c = normaliseCycle(cycle, new Date(now).toISOString());
  if (!c) return null;
  const all = [...c.baseline, ...c.interventions, ...c.transfers, ...c.delayed, ...c.recurrences]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const independent = all.filter((e) => e.independent);
  const assisted = all.filter((e) => e.assistance !== 'none');
  const heldOut = all.filter((e) => e.heldOut);
  const delayed = all.filter((e) => e.phase === 'delayed' || (e.delayHours != null && e.delayHours >= DELAYED_MIN_HOURS));
  const meanStrength = all.length
    ? Math.round((all.reduce((sum, e) => sum + evidenceStrengthScore(e, now), 0) / all.length) * 100) / 100
    : 0;
  return {
    id: c.id,
    target: c.target,
    status: learningCycleStatus(c, now),
    statusLabel: LEARNING_STATE_LABELS[learningCycleStatus(c, now)],
    samples: all.length,
    independentSamples: independent.length,
    assistedSamples: assisted.length,
    heldOutSamples: heldOut.length,
    delayedSamples: delayed.length,
    modalities: [...new Set(all.map((e) => e.modality).filter(Boolean))],
    meanStrength,
    firstAt: all[0]?.at || c.startedAt,
    lastAt: all.at(-1)?.at || c.updatedAt,
    baselineScore: c.baseline.find((e) => e.score != null)?.score ?? null,
    latestInterventionScore: [...c.interventions].reverse().find((e) => e.score != null)?.score ?? null,
    latestTransferScore: [...c.transfers].reverse().find((e) => e.score != null)?.score ?? null,
    latestDelayedScore: [...c.delayed].reverse().find((e) => e.score != null)?.score ?? null,
  };
}

function latestSuccessful(events) {
  return [...(events || [])].reverse().find((e) => e.correct === true) || null;
}

export function dueLearningChecks(state, now = Date.now()) {
  const base = createLearningEvidenceState(state);
  const due = [];
  for (const cycle of base.cycles) {
    const status = learningCycleStatus(cycle, now);
    if (status === LEARNING_STATES.DEMONSTRATED) continue;
    const lastRecurrence = cycle.recurrences.at(-1)?.at || cycle.startedAt;
    const intervention = latestSuccessful(after(cycle.interventions, lastRecurrence));
    if (!intervention) continue;
    const transfer = latestSuccessful(after(cycle.transfers, intervention.at));
    if (!transfer) {
      due.push({
        type: 'transfer',
        target: cycle.target,
        cycleId: cycle.id,
        dueAt: intervention.at,
        overdueHours: Math.max(0, (now - Date.parse(intervention.at)) / 3600000),
        sourceModality: intervention.modality,
      });
      continue;
    }
    const delayed = latestSuccessful(after(cycle.delayed, transfer.at));
    const dueAt = Date.parse(transfer.at) + DELAYED_MIN_HOURS * 3600000;
    if (!delayed && now >= dueAt) {
      due.push({
        type: 'delayed',
        target: cycle.target,
        cycleId: cycle.id,
        dueAt: new Date(dueAt).toISOString(),
        overdueHours: Math.max(0, (now - dueAt) / 3600000),
        sourceModality: transfer.modality,
      });
    }
  }
  return due.sort((a, b) => (a.type === 'delayed' ? -1 : 1) - (b.type === 'delayed' ? -1 : 1) || b.overdueHours - a.overdueHours);
}

export function learningEvidenceOverview(state, now = Date.now()) {
  const base = createLearningEvidenceState(state);
  const cycles = base.cycles.map((cycle) => learningCycleSummary(cycle, now)).filter(Boolean);
  const byStatus = Object.fromEntries(Object.values(LEARNING_STATES).map((status) => [status, cycles.filter((c) => c.status === status)]));
  const due = dueLearningChecks(base, now);
  return {
    cycles,
    byStatus,
    due,
    nextAction: due[0] || cycles.find((c) => c.status === LEARNING_STATES.RECURRED) || cycles.find((c) => c.status === LEARNING_STATES.ACTIVE) || null,
  };
}

export function skillEvidenceQuality(state, now = Date.now()) {
  const overview = learningEvidenceOverview(state, now);
  const groups = {};
  for (const cycle of overview.cycles) {
    const skill = cycle.target.skill;
    const row = groups[skill] || { cycles: 0, samples: 0, independent: 0, heldOut: 0, delayed: 0, demonstrated: 0, strengthTotal: 0 };
    row.cycles += 1;
    row.samples += cycle.samples;
    row.independent += cycle.independentSamples;
    row.heldOut += cycle.heldOutSamples;
    row.delayed += cycle.delayedSamples;
    row.demonstrated += cycle.status === LEARNING_STATES.DEMONSTRATED ? 1 : 0;
    row.strengthTotal += cycle.meanStrength;
    groups[skill] = row;
  }
  return Object.fromEntries(Object.entries(groups).map(([skill, row]) => [skill, {
    ...row,
    meanStrength: row.cycles ? Math.round((row.strengthTotal / row.cycles) * 100) / 100 : 0,
    confidence: Math.round(clamp(
      Math.min(1, row.independent / 4) * 0.35
      + Math.min(1, row.heldOut / 2) * 0.3
      + Math.min(1, row.delayed / 2) * 0.25
      + Math.min(1, row.samples / 8) * 0.1,
    ) * 100) / 100,
  }])) ;
}

