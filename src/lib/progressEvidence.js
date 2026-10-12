// Progress evidence — the concrete statements that answer "what can I do
// now?" with what actually happened, instead of generic labels.
//
//   "Used past-tense narration correctly in two new contexts."
//   "Still missing adjective agreement in speaking."
//   "18 vocabulary items survived delayed recall."
//   "Listening accuracy improved on normal-speed audio."
//
// Every statement is derived from recorded behaviour. When the data does not
// exist the statement does not either — no zero-filled placeholders dressed
// up as findings.

import { learningCycleStatus, LEARNING_STATES } from './learningEvidence.js';

const DAY = 86400000;

function inWindow(at, now, days) {
  const t = Date.parse(at || '');
  return Number.isFinite(t) && t >= now - days * DAY;
}

/**
 * Build the evidence statements Progress shows alongside its four questions.
 *
 * @param {{
 *   learningEvidence?: {cycles?: Array<object>},
 *   errorEntries?: Array<object>,
 *   srs?: object,
 *   now?: number,
 *   windowDays?: number,
 * }} input
 * @returns {{strengths: string[], improving: string[], weak: string[], fixed: string[]}}
 */
export function progressEvidenceStatements(input = {}) {
  const now = input.now || Date.now();
  const windowDays = Number(input.windowDays) || 21;
  const cycles = input.learningEvidence?.cycles || [];
  const errorEntries = input.errorEntries || [];
  const strengths = [];
  const improving = [];
  const weak = [];
  const fixed = [];

  // 1. Independent use in new contexts, per target label.
  for (const cycle of cycles) {
    const transfers = (cycle.transfers || []).filter((e) => inWindow(e.at, now, windowDays) && e.independent !== false);
    const delayed = (cycle.delayed || []).filter((e) => inWindow(e.at, now, windowDays) && e.independent !== false);
    const label = String(cycle.target?.label || cycle.target?.key || '').trim();
    if (!label) continue;
    if (transfers.length >= 2) {
      strengths.push(`Used ${label.toLowerCase()} correctly in ${transfers.length} new contexts.`);
    } else if (transfers.length === 1 && delayed.length >= 1) {
      strengths.push(`Used ${label.toLowerCase()} in a new context and recalled it later.`);
    } else if (delayed.length >= 1) {
      improving.push(`Recalled ${label.toLowerCase()} correctly after a delay.`);
    }
  }

  // 2. Vocabulary that survived delayed recall — from the learner-error
  // model's delayed successes (one clean delayed pass is the strong signal).
  // `lastEvidence: 'delayed'` is a clock fact; a delayed pass taken with support
  // still sets it, and it was being reported to the learner as a strength they
  // had earned unaided. The sibling filter a few lines above already requires
  // `independent !== false` — this one now does too.
  const vocabDelayed = errorEntries.filter((e) => (
    e?.category === 'vocabulary'
    && e.lastEvidence === 'delayed'
    && e.independent !== false
    && inWindow(e.lastSuccessAt, now, windowDays)
  ));
  if (vocabDelayed.length >= 1) {
    strengths.push(`${vocabDelayed.length} vocabulary item${vocabDelayed.length === 1 ? '' : 's'} survived delayed recall.`);
  }

  // 3. Vocabulary production gap — recognised but not yet producible.
  const productionGaps = errorEntries.filter((e) => (
    e?.category === 'vocabulary' && String(e.key || '').endsWith('::productive') && e.status === 'active'
  ));
  if (productionGaps.length >= 1) {
    improving.push(`Working on using ${productionGaps.length} word${productionGaps.length === 1 ? '' : 's'} you already recognise.`);
  }

  // 4. Weaknesses by real category, named the way the learner talks.
  for (const entry of errorEntries) {
    if (!entry || entry.status !== 'active') continue;
    const label = String(entry.label || entry.key || '').trim();
    if (!label) continue;
    const modes = (entry.modes || []).filter(Boolean);
    const where = modes.length ? ` in ${modes[0]}` : '';
    if (entry.recurrenceCount > 0) {
      weak.push(`Still missing ${label.toLowerCase()}${where} — it came back after improving.`);
    } else if ((entry.errorCount || 0) >= 2) {
      weak.push(`Still missing ${label.toLowerCase()}${where}.`);
    }
  }

  // 5. Listening movement, when the learner-error model shows a listening
  // weakness that has just started succeeding.
  for (const entry of errorEntries) {
    if (entry?.category !== 'listening') continue;
    if (entry.status === 'recovering' && entry.lastEvidence === 'delayed') {
      improving.push('Listening accuracy is improving at normal speed.');
    }
  }

  // 6. FIXED — the headline promise, "you fixed this". A cycle the model has
  // judged DEMONSTRATED means the learner produced the target independently in
  // a NEW context AND passed an independent retest after a real gap: the
  // strongest claim the evidence model makes. This reads the canonical status
  // (learningCycleStatus) rather than re-deriving rules, so "fixed" here is
  // exactly what the engine considers demonstrated — one authority, no drift.
  // Only recent demonstrations are named, so the list is what you fixed lately,
  // not an ever-growing ledger.
  for (const cycle of cycles) {
    const label = String(cycle.target?.label || cycle.target?.key || '').trim();
    if (!label) continue;
    let status;
    try { status = learningCycleStatus(cycle, now); } catch { status = null; }
    if (status !== LEARNING_STATES.DEMONSTRATED) continue;
    const lastGood = [...(cycle.transfers || []), ...(cycle.delayed || [])]
      .map((e) => Date.parse(e.at || 0))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => b - a)[0];
    if (lastGood != null && !inWindow(new Date(lastGood).toISOString(), now, windowDays)) continue;
    fixed.push(`Fixed ${label.toLowerCase()} — you use it on your own now, and it stuck after a delay.`);
  }

  return {
    strengths: dedupe(strengths).slice(0, 4),
    improving: dedupe(improving).slice(0, 4),
    weak: dedupe(weak).slice(0, 4),
    fixed: dedupe(fixed).slice(0, 4),
  };
}

function dedupe(list) {
  return [...new Set(list.filter(Boolean))];
}
