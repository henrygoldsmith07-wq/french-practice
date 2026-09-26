// Learner-error store — the persistence boundary for the cross-mode recovery
// model: persistent gaps (grammar, vocabulary, listening, pronunciation) with
// their evidence-weighted lifecycle (active → recovering → resolved →
// recurrence). The RULES live in ../learnerErrors.js (pure, no storage); this
// store owns only loading, migration from legacy sources, and writing back.
//
// Extracted from storage.js (stores pattern — settingsStore, studyStore,
// researchStore). Keys, shapes, caps and learner-namespacing behaviour are
// byte-identical: storageCore owns the key map and the learner-routing
// read/write primitives.
//
// Import policy: this module never imports storage.js (a cycle would make
// the facade fragile); it talks to storageCore directly, exactly like every
// other domain store.

import { read, write, KEYS } from '../storageCore.js';
import {
  createLearnerErrorModel,
  recordLearnerError as applyLearnerError,
  recordLearnerSuccess as applyLearnerSuccess,
  skillNeedsFromModel,
  prioritiseLearnerErrors,
  learnerErrorSummary,
  canonicaliseModel,
} from '../learnerErrors.js';
import { recordLearningEvidence } from './learningEvidenceStore.js';

// Legacy sources the one-time migration folds into the unified model. These
// read/write helpers live here (not storage.js) so the store is the single
// owner of the migration path; the legacy keys themselves are untouched —
// the originals stay on disk for export compatibility.
const legacyGrammarErrors = () => {
  const v = read(KEYS.grammarErrors, {});
  return v && typeof v === 'object' ? v : {};
};
const legacyWeaknessMemory = () => {
  const v = read(KEYS.weaknessMemory, []);
  return Array.isArray(v) ? v : [];
};
const legacyReviewEvents = () => {
  const v = read(KEYS.reviewEvents, []);
  return Array.isArray(v) ? v : [];
};
const legacyMetrics = () => {
  const v = read(KEYS.metrics, []);
  return Array.isArray(v) ? v : [];
};

function migrateLearnerErrors() {
  let model = createLearnerErrorModel();
  for (const [topicId, count] of Object.entries(legacyGrammarErrors() || {})) {
    if (Number(count) > 0) model = applyLearnerError(model, {
      category: 'grammar',
      key: topicId,
      label: topicId,
      mode: 'conversation',
      source: 'legacy-grammar-errors',
      count: Number(count),
    });
  }
  for (const weakness of legacyWeaknessMemory()) {
    if (!weakness?.topicId || Number(weakness.errorCount) <= 0) continue;
    model = applyLearnerError(model, {
      category: 'grammar',
      key: weakness.topicId,
      label: weakness.topicId,
      mode: 'conversation',
      source: 'legacy-weakness-memory',
      count: Number(weakness.errorCount),
      recurrenceCount: Number(weakness.recurrenceCount) || 0,
    });
  }
  for (const event of legacyReviewEvents()) {
    if (event.rating !== 'again' && event.correct !== false) continue;
    model = applyLearnerError(model, {
      category: 'vocabulary',
      key: `item:${event.itemId}`,
      label: event.itemLabel || event.itemId,
      mode: event.mode || 'cards',
      source: 'legacy-review-events',
      score: 0,
    });
  }
  const metricGaps = new Map();
  for (const metric of legacyMetrics()) {
    const skill = metric?.skill;
    if ((skill !== 'listening' && skill !== 'pronunciation') || Number(metric.score) >= 70) continue;
    const category = skill === 'pronunciation' ? 'pronunciation' : 'listening';
    const current = metricGaps.get(category) || { count: 0, score: 100 };
    current.count += 1;
    current.score = Math.min(current.score, Number(metric.score));
    metricGaps.set(category, current);
  }
  for (const [category, gap] of metricGaps) {
    model = applyLearnerError(model, {
      category,
      key: `skill:${category}`,
      label: category === 'pronunciation' ? 'Pronunciation clarity' : 'Listening accuracy',
      mode: category,
      source: 'legacy-skill-metrics',
      count: gap.count,
      score: gap.score,
    });
  }
  return model;
}

export function getLearnerErrorModel() {
  const raw = read(KEYS.learnerErrors, null);
  if (raw && typeof raw === 'object' && Array.isArray(raw.entries)) {
    // Fold legacy surrogate ids (reading under listening, pronunciation
    // per-mode, …) BEFORE normalisation: the per-mode pronunciation entries
    // (mode:read-aloud, mode:shadowing, …) share one canonical id, and
    // createLearnerErrorModel dedupes by id keeping the newest — folding
    // first MERGES their counts instead of silently dropping them. Written
    // back once; afterwards the fold is a pass-through no-op.
    const folded = canonicaliseModel(raw);
    const model = createLearnerErrorModel(folded);
    if (folded !== raw) write(KEYS.learnerErrors, model);
    return model;
  }
  const model = migrateLearnerErrors();
  write(KEYS.learnerErrors, model);
  return model;
}

export const getLearnerErrors = (options = {}) =>
  prioritiseLearnerErrors(getLearnerErrorModel(), options);

export const getLearnerErrorSummary = () => learnerErrorSummary(getLearnerErrorModel());

// Per-modality practice need for the session allocator — the storage-backed
// bridge over the pure skillNeedsFromModel rules.
export const getSkillNeeds = () => skillNeedsFromModel(getLearnerErrorModel());

export function recordLearnerError(error, options = {}) {
  const model = applyLearnerError(getLearnerErrorModel(), error, options);
  write(KEYS.learnerErrors, model);
  try {
    recordLearningEvidence({
      phase: 'baseline',
      skill: error.category,
      targetKey: error.key || error.topicId || error.itemId,
      label: error.label,
      modality: error.mode || error.category,
      score: error.score,
      correct: false,
      assistance: error.assisted ? 'assisted' : error.hinted ? 'scaffolded' : 'none',
      independent: Boolean(error.encounterId) && !error.assisted && !error.hinted,
      source: error.source || 'learner-error',
      sourceReliability: Number(error.confidence) >= 0.8 ? 'high' : Number(error.confidence) >= 0.5 ? 'medium' : 'unknown',
      markerConfidence: Number.isFinite(Number(error.confidence)) ? Number(error.confidence) : null,
      sessionId: error.sessionId,
      encounterId: error.encounterId,
      activityId: error.activityId,
      at: options.at,
      detail: error.detail,
    }, options);
  } catch { /* evidence instrumentation must never break local practice */ }
  return model.entries[0] || null;
}

export function recordLearnerSuccess(success, options = {}) {
  const model = applyLearnerSuccess(getLearnerErrorModel(), success, options);
  write(KEYS.learnerErrors, model);
  try {
    const mode = String(success.mode || '');
    const phase = /^(held-out|transfer)/i.test(mode)
      ? 'transfer'
      : /^(weakness-retest|srs)$/i.test(mode) || success.delayed === true
        ? 'delayed'
        : 'intervention';
    recordLearningEvidence({
      phase,
      skill: success.category,
      targetKey: success.key || success.topicId || success.itemId,
      label: success.label,
      modality: success.mode || success.category,
      sourceModality: success.sourceModality,
      score: success.score,
      correct: true,
      // "transfer" means a new-context use, but only an explicitly held-out
      // task can claim held-out evidence. Keeping these separate prevents a
      // normal transfer drill from accidentally satisfying the strongest
      // confirmation state.
      heldOut: success.heldOut === true || /^held-out/i.test(mode),
      promptNovelty: success.promptNovelty,
      difficulty: success.difficulty,
      assistance: success.assisted ? 'assisted' : success.hinted ? 'scaffolded' : 'none',
      independent: Boolean(success.encounterId) && !success.assisted && !success.hinted,
      source: success.source || 'learner-success',
      sourceReliability: Number(success.confidence) >= 0.8 ? 'high' : Number(success.confidence) >= 0.5 ? 'medium' : 'unknown',
      markerConfidence: Number.isFinite(Number(success.confidence)) ? Number(success.confidence) : null,
      sessionId: success.sessionId,
      encounterId: success.encounterId,
      activityId: success.activityId,
      at: options.at,
      detail: success.detail,
    }, options);
  } catch { /* evidence instrumentation must never break local practice */ }
  return model.entries[0] || null;
}
