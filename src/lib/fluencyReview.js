// Fluency mode — the conversation runs without interruptions; corrections
// arrive once, after the session, and only the highest-value 2–3.
//
// This module is the pure half: it picks which corrections are worth the
// learner's attention and how the debrief is shaped. The LLM call lives in
// groq.js (fluencyReview) and falls back to these functions when offline or
// in mock mode, so a fluency debrief always exists and always derives from
// what the learner actually said.
//
// Genuine mistakes (definite/likely errors only) feed the SAME mistake graph
// and error notebook as Coach mode — fluency practice must leave the same
// evidence trail, just without the mid-conversation noise.

import { categoryForTopic } from './errorTaxonomy.js';
import { recordMistake, typeForCategory, mistakeId as graphIdFor } from './mistakeGraph.js';
import { getMistakeGraph, saveMistakeGraph } from './storage.js';
import { addErrorNotebook } from './errorNotebook.js';

const STRONG_LEVELS = new Set(['definite_error', 'likely_error']);
const MAX_CORRECTIONS = 3;

const rankOfLevel = { definite_error: 0, likely_error: 1 };

/**
 * Pick the highest-value corrections from a finished fluency conversation.
 * Only strong (definite/likely) corrections are candidates; stylistic
 * suggestions and acceptable alternatives are advice, not mistakes.
 * Ranking: severity first, then how badly the turn scored, then recency —
 * and a concept that slipped on several turns outranks a one-off.
 */
export function pickTopCorrections(history, { max = MAX_CORRECTIONS } = {}) {
  const turns = Array.isArray(history) ? history : [];
  const candidates = [];
  turns.forEach((turn, turnIndex) => {
    const detailed = turn?.evaluation?.corrections_detailed || [];
    const scores = turn?.evaluation?.scores || {};
    const weakness = 100 - Number(scores.overall || 0);
    for (const c of detailed) {
      if (!STRONG_LEVELS.has(c.level)) continue;
      candidates.push({
        original: String(c.original || ''),
        correction: String(c.correction || ''),
        why: String(c.note || c.correction || ''),
        topic: turn?.evaluation?.grammar_topic || null,
        type: typeForCategory(categoryForTopic(turn?.evaluation?.grammar_topic || '')),
        turnIndex,
        level: c.level,
        severity: rankOfLevel[c.level] ?? 2,
        weakness,
      });
    }
  });
  // Group by concept so a recurring slip is one instruction, not three.
  const byConcept = new Map();
  for (const c of candidates) {
    const key = c.topic || c.correction.toLowerCase();
    if (!byConcept.has(key)) byConcept.set(key, { ...c, recurrences: 0 });
    const group = byConcept.get(key);
    group.recurrences += 1;
    group.severity = Math.min(group.severity, c.severity);
    group.weakness = Math.max(group.weakness, c.weakness);
  }
  return [...byConcept.values()]
    .sort((a, b) =>
      a.severity - b.severity ||
      b.recurrences - a.recurrences ||
      b.weakness - a.weakness)
    .slice(0, max)
    .map(({ severity, weakness, ...keep }) => keep);
}

/** What genuinely carried the conversation — real positives, never filler. */
export function fluencyPositives(history) {
  const turns = Array.isArray(history) ? history : [];
  const positives = [];
  const noErrorTurns = turns.filter((t) => {
    const detailed = t?.evaluation?.corrections_detailed || [];
    return !detailed.some((c) => STRONG_LEVELS.has(c.level));
  });
  if (noErrorTurns.length) {
    const best = [...noErrorTurns].sort(
      (a, b) => (b.evaluation?.scores?.overall || 0) - (a.evaluation?.scores?.overall || 0)
    )[0];
    positives.push(`Your turn "${String(best.userText || '').slice(0, 80)}" needed no correction.`);
  }
  const fluencyScores = turns.map((t) => t?.evaluation?.scores?.fluency).filter(Number.isFinite);
  if (fluencyScores.length >= 2) {
    const trend = fluencyScores[fluencyScores.length - 1] - fluencyScores[0];
    if (trend > 0) positives.push('Your flow improved as the conversation went on.');
  }
  return positives.slice(0, 2);
}

/** A normalised debrief object — the shape every caller can rely on. */
export function fluencyDebriefFromHistory(history) {
  const corrections = pickTopCorrections(history);
  return {
    mode: 'fluency',
    corrections,
    carriedWell: fluencyPositives(history),
    summary: corrections.length
      ? `${corrections.length} correction${corrections.length === 1 ? '' : 's'} worth your attention — the rest of the conversation held up.`
      : 'Nothing in that conversation needed correcting.',
    source: 'derived',
  };
}

/** Normalise an LLM review payload into the same debrief shape. */
export function normalizeFluencyReview(json, history) {
  const fallback = fluencyDebriefFromHistory(history);
  if (!json || typeof json !== 'object') return fallback;
  const corrections = (Array.isArray(json.corrections) ? json.corrections : [])
    .slice(0, MAX_CORRECTIONS)
    .map((c) => ({
      original: String(c?.original || ''),
      correction: String(c?.correction || ''),
      why: String(c?.why || ''),
      topic: c?.topic ? String(c.topic) : null,
      type: c?.topic ? typeForCategory(categoryForTopic(String(c.topic))) : 'grammar',
      turnIndex: Number.isFinite(Number(c?.turn)) ? Math.max(0, Number(c.turn) - 1) : null,
      level: 'definite_error',
      recurrences: Number.isFinite(Number(c?.recurrences)) ? Number(c.recurrences) : 1,
    }))
    .filter((c) => c.original && c.correction);
  return {
    mode: 'fluency',
    corrections,
    carriedWell: Array.isArray(json.carried_well) ? json.carried_well.map(String).slice(0, 2) : fallback.carriedWell,
    summary: String(json.summary || fallback.summary),
    source: 'llm',
  };
}

/**
 * Feed a finished fluency debrief into the SAME permanent record as Coach
 * mode: every genuine correction becomes a mistake-graph node and a notebook
 * entry (retype drill now, recurrence tracking forever). Never runs for
 * empty debriefs; bookkeeping failures never break the debrief.
 */
export function recordFluencyMistakes(debrief) {
  const corrections = Array.isArray(debrief?.corrections) ? debrief.corrections : [];
  let recorded = 0;
  for (const c of corrections) {
    try {
      const concept = c.topic || 'fluency-correction';
      const type = c.type || 'grammar';
      const graphNodeId = graphIdFor({ type, concept });
      // Mutate-then-save: the graph must be written AFTER recordMistake.
      const graph = getMistakeGraph();
      recordMistake(graph, {
        type,
        concept,
        source: 'fluency-review',
        attempt: c.original,
        corrected: c.correction,
        confidence: 0.5,
        asrUncertain: false,
        related: [c.topic].filter(Boolean),
      });
      saveMistakeGraph(graph);
      addErrorNotebook({
        original: c.original,
        corrected: c.correction,
        why: c.why || c.correction,
        ruleId: c.topic || null,
        mistakeId: graphNodeId,
      });
      recorded += 1;
    } catch { /* one bad correction never blocks the rest */ }
  }
  return recorded;
}
