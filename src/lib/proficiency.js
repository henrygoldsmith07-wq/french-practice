// Evidence-backed proficiency estimation.
//
// The 0–100 number is an app estimate *within the learner's current working
// CEFR level*. It is never an XP conversion and never proof that a CEFR level
// has been completed. Seven dimensions remain unknown when unmeasured.
//
// Evidence rules:
//   - recent > stale;
//   - independent > assisted;
//   - held-out > training-item;
//   - delayed > immediate correction;
//   - harder tasks contribute slightly more than easy tasks;
//   - uncertain marking / lower-reliability sources contribute less;
//   - breadth (coverage) and depth/quality (confidence) stay separate.

import { LEVELS, levelIndex, profileFor } from './cefr.js';
import { skillEvidenceQuality } from './learningEvidence.js';

export const DIMENSIONS = [
  { id: 'vocabulary', label: 'Vocabulary', weight: 0.20, blurb: 'Words held in long-term memory, weighted by how well they stick.' },
  { id: 'grammar', label: 'Grammar', weight: 0.16, blurb: 'Controlled grammar performance; independent transfer is tracked separately.' },
  { id: 'speaking', label: 'Speaking', weight: 0.20, blurb: 'Recent spoken performance, weighted by independence and evidence quality.' },
  { id: 'listening', label: 'Listening', weight: 0.12, blurb: 'Comprehension and dictation evidence; authentic and held-out evidence can carry more weight.' },
  { id: 'reading', label: 'Reading', weight: 0.10, blurb: 'Comprehension of written French in scored reading tasks.' },
  { id: 'writing', label: 'Writing', weight: 0.12, blurb: 'Composition and correction evidence, discounted when heavily scaffolded.' },
  { id: 'pronunciation', label: 'Pronunciation', weight: 0.10, blurb: 'How clearly recent spoken attempts were understood, with marking uncertainty preserved.' },
];

const HALF_LIFE_DAYS = 45;
const RELIABILITY_WEIGHT = { high: 1, medium: 0.9, low: 0.72, unknown: 0.82 };

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value)));

/** Exponential recency weight — evidence halves in value every 45 days. */
export function recencyWeight(timestamp, now = Date.now()) {
  if (!timestamp) return 0.5;
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return 0.5;
  const days = Math.max(0, (now - parsed) / 86400000);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * Quality multiplier for one scored observation. Missing metadata is neutral:
 * legacy evidence keeps its old semantics rather than being guessed assisted,
 * easy, independent, or unreliable.
 */
export function taskEvidenceWeight(record = {}) {
  let weight = 1;
  const assistance = record.assistance || (record.assisted === true ? 'assisted' : record.hinted === true ? 'scaffolded' : null);
  if (assistance === 'assisted') weight *= 0.42;
  else if (assistance === 'scaffolded') weight *= 0.7;
  if (record.independent === true) weight *= 1.08;
  else if (record.independent === false) weight *= 0.86;
  if (record.heldOut === true || record.assessment === 'held-out') weight *= 1.2;
  if (record.delayed === true) weight *= 1.14;
  if (record.trainingItem === true) weight *= 0.9;
  if (Number.isFinite(Number(record.difficulty))) {
    const difficulty = clamp(record.difficulty, 1, 5);
    weight *= 0.86 + ((difficulty - 1) / 4) * 0.28;
  }
  const markerConfidence = Number(record.markerConfidence ?? record.markingConfidence);
  if (Number.isFinite(markerConfidence)) weight *= 0.58 + clamp(markerConfidence) * 0.42;
  if (record.sourceReliability) weight *= RELIABILITY_WEIGHT[record.sourceReliability] || RELIABILITY_WEIGHT.unknown;
  return Math.max(0.15, Math.min(1.65, weight));
}

export function observationWeight(record = {}, now = Date.now()) {
  return recencyWeight(record.at, now) * taskEvidenceWeight(record);
}

/** Evidence-quality + recency-weighted mean. Returns null when empty. */
export function weightedMean(records, now = Date.now()) {
  if (!records || !records.length) return null;
  let num = 0;
  let den = 0;
  for (const record of records) {
    const score = Number(record.score);
    if (!Number.isFinite(score)) continue;
    const weight = observationWeight(record, now);
    num += score * weight;
    den += weight;
  }
  return den > 0 ? num / den : null;
}

/** Inspectable uncertainty metadata for one behavioural evidence stream. */
export function evidenceStats(records = [], now = Date.now()) {
  const valid = (records || []).filter((record) => Number.isFinite(Number(record?.score)));
  if (!valid.length) return {
    samples: 0,
    effectiveSamples: 0,
    confidence: 0,
    independentSamples: 0,
    heldOutSamples: 0,
    delayedSamples: 0,
    assistedSamples: 0,
    latestAt: null,
  };
  const effectiveSamples = valid.reduce((sum, record) => sum + observationWeight(record, now), 0);
  const independentSamples = valid.filter((record) => record.independent === true).length;
  const heldOutSamples = valid.filter((record) => record.heldOut === true || record.assessment === 'held-out').length;
  const delayedSamples = valid.filter((record) => record.delayed === true).length;
  const assistedSamples = valid.filter((record) => (
    record.assisted === true || record.assistance === 'assisted' || record.assistance === 'scaffolded'
  )).length;
  const depth = Math.min(1, effectiveSamples / 6);
  const quality = Math.min(1,
    independentSamples / 3 * 0.4
    + heldOutSamples / 2 * 0.35
    + delayedSamples / 2 * 0.25,
  );
  return {
    samples: valid.length,
    effectiveSamples: Math.round(effectiveSamples * 100) / 100,
    confidence: Math.round(Math.min(1, depth * 0.72 + quality * 0.28) * 100) / 100,
    independentSamples,
    heldOutSamples,
    delayedSamples,
    assistedSamples,
    latestAt: valid.map((record) => record.at).filter(Boolean).sort().at(-1) || null,
  };
}

function scoredPart(records, now) {
  const mean = weightedMean(records, now);
  return {
    score: mean === null ? null : Math.round(clamp(mean, 0, 100)),
    ...evidenceStats(records, now),
  };
}

/**
 * Vocabulary sub-score: progress toward the level's word target, where a word
 * only counts once it has survived at least two reviews. Cards seen once are
 * recognition, not knowledge.
 */
export function vocabularyScore({ srs = {}, level = 'A1' } = {}) {
  const states = Object.values(srs);
  const target = profileFor(level).vocabTarget;
  if (!states.length) return {
    score: null, known: 0, strong: 0, target,
    samples: 0, effectiveSamples: 0, evidenceConfidence: 0,
  };

  let known = 0;
  let strong = 0;
  for (const state of states) {
    const reps = state.reps || 0;
    if (reps >= 2 && state.lastRating !== 'again') {
      known += 1;
      if (reps >= 4) strong += 1;
    }
  }
  const effective = Math.min(target, known + strong * 0.25);
  return {
    score: Math.round((effective / target) * 100),
    known,
    strong,
    target,
    samples: states.length,
    effectiveSamples: known,
    evidenceConfidence: Math.round(Math.min(1, known / Math.max(8, Math.min(target, 80))) * 100) / 100,
  };
}

/** Grammar sub-score: controlled syllabus evidence, against the level target. */
export function grammarScore({ topicScores = {}, level = 'A1' } = {}) {
  const entries = Object.values(topicScores);
  const target = profileFor(level).grammarTarget;
  if (!entries.length) return {
    score: null, mastered: 0, target,
    samples: 0, effectiveSamples: 0, evidenceConfidence: 0,
  };
  const mastered = entries.filter((value) => (typeof value === 'number' ? value : value?.best || 0) >= 80).length;
  const attempts = entries.reduce((sum, value) => sum + Math.max(1, Number(value?.attempts) || 1), 0);
  return {
    score: Math.round(Math.min(1, mastered / target) * 100),
    mastered,
    target,
    samples: attempts,
    effectiveSamples: Math.min(attempts, target * 3),
    evidenceConfidence: Math.round(Math.min(1, attempts / Math.max(4, target * 2)) * 100) / 100,
  };
}

/** Speaking sub-score from scored sessions with evidence metadata preserved. */
export function speakingScore({ sessions = [] } = {}, now = Date.now()) {
  const records = sessions
    .filter((session) => Number.isFinite(Number(session.score ?? session.overall)))
    .map((session) => ({
      ...session,
      score: Number(session.score ?? session.overall),
      at: session.at || session.date || session.endedAt,
    }));
  return scoredPart(records, now);
}

/** Listening: comprehension quizzes and dictation accuracy, pooled. */
export function listeningScore({ metrics = [] } = {}, now = Date.now()) {
  const records = metrics
    .filter((metric) => metric.skill === 'listening' || metric.skill === 'dictation')
    .map((metric) => ({ ...metric, score: Number(metric.score), at: metric.at }));
  return scoredPart(records, now);
}

/** Reading comprehension from scored reading activities. */
export function readingScore({ metrics = [] } = {}, now = Date.now()) {
  const records = metrics
    .filter((metric) => metric.skill === 'reading')
    .map((metric) => ({ ...metric, score: Number(metric.score), at: metric.at }));
  return scoredPart(records, now);
}

/** Writing: composition and correction scores. */
export function writingScore({ metrics = [] } = {}, now = Date.now()) {
  const records = metrics
    .filter((metric) => metric.skill === 'writing')
    .map((metric) => ({ ...metric, score: Number(metric.score), at: metric.at }));
  return scoredPart(records, now);
}

/** Pronunciation/intelligibility from scored spoken activities. */
export function pronunciationScore({ metrics = [] } = {}, now = Date.now()) {
  const records = metrics
    .filter((metric) => metric.skill === 'pronunciation')
    .map((metric) => ({ ...metric, score: Number(metric.score), at: metric.at }));
  return scoredPart(records, now);
}

/**
 * Composite estimate. Weights renormalise over measured dimensions, but
 * evidence coverage and evidence confidence remain explicit so a partial
 * profile cannot look fully certain.
 */
export function proficiency(evidence = {}, now = Date.now()) {
  const level = evidence.level || 'A1';
  const parts = {
    vocabulary: vocabularyScore({ srs: evidence.srs, level }),
    grammar: grammarScore({ topicScores: evidence.topicScores, level }),
    speaking: speakingScore({ sessions: evidence.sessions }, now),
    listening: listeningScore({ metrics: evidence.metrics }, now),
    reading: readingScore({ metrics: evidence.metrics }, now),
    writing: writingScore({ metrics: evidence.metrics }, now),
    pronunciation: pronunciationScore({ metrics: evidence.metrics }, now),
  };

  const present = DIMENSIONS.filter((dimension) => parts[dimension.id].score !== null);
  const totalWeight = present.reduce((sum, dimension) => sum + dimension.weight, 0);

  if (!present.length) {
    return {
      score: null,
      level,
      workingLevel: level,
      band: null,
      confidence: 0,
      evidenceCoverage: 0,
      evidenceConfidence: 0,
      benchmarkEvidence: 0,
      parts,
      covered: [],
      missing: DIMENSIONS.map((dimension) => dimension.id),
      note: 'No scored language evidence yet — unmeasured skills stay unknown rather than zero.',
    };
  }

  const score = Math.round(
    present.reduce((sum, dimension) => sum + parts[dimension.id].score * (dimension.weight / totalWeight), 0),
  );

  const coverage = totalWeight;
  const behaviouralIds = ['speaking', 'listening', 'reading', 'writing', 'pronunciation'];
  const behavioural = behaviouralIds.map((id) => parts[id]).filter((part) => part.score !== null);
  const effectiveSamples = behavioural.reduce((sum, part) => sum + (part.effectiveSamples || 0), 0);
  const streamConfidence = behavioural.length
    ? behavioural.reduce((sum, part) => sum + (part.confidence || 0), 0) / behavioural.length
    : 0;
  const knowledgeConfidence = [parts.vocabulary.evidenceConfidence, parts.grammar.evidenceConfidence]
    .filter(Number.isFinite);
  const knowledgeMean = knowledgeConfidence.length
    ? knowledgeConfidence.reduce((sum, value) => sum + value, 0) / knowledgeConfidence.length
    : 0;
  const longitudinal = skillEvidenceQuality(evidence.learningEvidence || {}, now);
  const transferRows = Object.values(longitudinal);
  const transferConfidence = transferRows.length
    ? transferRows.reduce((sum, row) => sum + row.confidence, 0) / transferRows.length
    : 0;
  const evidenceConfidence = Math.round(Math.min(1,
    streamConfidence * 0.5 + knowledgeMean * 0.25 + transferConfidence * 0.25,
  ) * 100) / 100;
  const depth = Math.min(1, effectiveSamples / 12);
  const confidence = Math.round(Math.min(1,
    coverage * 0.45 + evidenceConfidence * 0.4 + depth * 0.15,
  ) * 100) / 100;
  const benchmarkEvidence = behavioural.reduce((sum, part) => sum + (part.heldOutSamples || 0), 0)
    + transferRows.reduce((sum, row) => sum + (row.heldOut || 0), 0);

  return {
    score,
    level,
    workingLevel: level,
    band: bandFor(score, level),
    confidence,
    evidenceCoverage: Math.round(coverage * 100) / 100,
    evidenceConfidence,
    benchmarkEvidence,
    parts,
    covered: present.map((dimension) => dimension.id),
    missing: DIMENSIONS.filter((dimension) => parts[dimension.id].score === null).map((dimension) => dimension.id),
    weakest: present.slice().sort((a, b) => parts[a.id].score - parts[b.id].score)[0]?.id || null,
    strongest: present.slice().sort((a, b) => parts[b.id].score - parts[a.id].score)[0]?.id || null,
  };
}

/** Human-readable within-level band. Never claims level completion. */
export function bandFor(score, level) {
  if (score === null) return null;
  if (score < 30) return `Starting ${level}`;
  if (score < 60) return `Working through ${level}`;
  if (score < 85) return `Consolidating ${level}`;
  return `Strong evidence within ${level} — confirm with assessment`;
}

/**
 * Display-only continuous scale. It does not promote a learner and is not a
 * CEFR certification; it merely prevents progress charts resetting at a level
 * boundary.
 */
export function globalScore(score, level) {
  if (score === null) return null;
  const base = Math.max(0, levelIndex(level)) * 100;
  return base + score;
}

/** Human-readable next step from missing/weak evidence. */
export function nextFocus(result) {
  if (!result || result.score === null) return 'Do a scored lesson or conversation — the estimate needs language evidence.';
  if (result.missing.length) {
    const dimension = DIMENSIONS.find((item) => item.id === result.missing[0]);
    return `No ${dimension.label.toLowerCase()} evidence yet — one session would sharpen the estimate.`;
  }
  if (result.evidenceConfidence < 0.5) return 'Repeat skills independently and after a delay — the current estimate is still based on thin evidence.';
  const dimension = DIMENSIONS.find((item) => item.id === result.weakest);
  return dimension ? `${dimension.label} is your lowest measured component — ${dimension.blurb.toLowerCase()}` : 'Keep collecting independent evidence.';
}

/** Every level's curriculum target, for a “what is left” table. */
export function ladder() {
  return LEVELS.map((level) => {
    const profile = profileFor(level);
    return { level, label: profile.label, words: profile.vocabTarget, grammar: profile.grammarTarget };
  });
}
