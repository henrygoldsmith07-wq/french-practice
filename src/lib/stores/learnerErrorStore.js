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
  assistanceTier,
  evidenceStrength,
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
      // Same card key as logReview writes today, so migrated legacy misses
      // merge into the live gap instead of duplicating it.
      key: event.mode === 'productive' ? `${event.itemId}::productive` : event.itemId,
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
    // Support is classified by the SAME rule the success path uses. Deriving it
    // here from `assisted`/`hinted` alone read a different vocabulary from the
    // one `learningEvidence.assistanceOf` and `assistanceTier` understand, so an
    // event labelled `assistance: 'scaffolded'` was filed as assistance 'none'
    // with independent: true — a mistake the learner made WITH help recorded as
    // a fully independent baseline. One concept, one classifier.
    const tier = assistanceTier(error);
    recordLearningEvidence({
      phase: 'baseline',
      skill: error.category,
      targetKey: error.key || error.topicId || error.itemId,
      label: error.label,
      modality: error.mode || error.category,
      score: error.score,
      correct: false,
      assistance: tier,
      independent: Boolean(error.encounterId) && tier === 'none',
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
    // The phase and independence of this success come from the SAME rules
    // the recovery model uses — never from the caller's mode label. A label
    // is a claim about intent; the clock decides "delayed", actual support
    // decides "assisted". (A retype, for example, is structurally assisted:
    // the answer was on screen, and it must never read as independent mastery
    // evidence just because its mode name looked innocuous.)
    const entry = model.entries.find((e) => (
      e.category === success.category && e.key === (success.key || success.topicId || success.itemId)
    )) || null;
    // The clock decides "delayed", so the clock must actually reach it: the
    // event's timestamp travels with the success (callers may pin it through
    // options.at for back-dated evidence).
    const at = options.at || success.at || new Date().toISOString();
    // "delayed" is decided by evidenceStrength — the same rule the delayed
    // check is scheduled by, including the real delay floor for anything
    // inferred rather than clock-verified by its caller.
    const strength = evidenceStrength({ ...success, at }, entry || {});
    const delayHours = entry?.lastErrorAt
      ? Math.max(0, (Date.parse(at) - Date.parse(entry.lastErrorAt)) / 3600000)
      : null;
    // "transfer" means a new-context use, and only the runner that ACTUALLY
    // administered and graded a fresh task can assert that — `transferVerified`
    // is set by the follow-up check, which builds unseen material and checks
    // it. A mode name never can: the old `mode: 'held-out…'` prefix trusted a
    // string, which is why the transfer lane stayed empty for every learner who
    // did not join the opt-in study.
    const phase = strength === 'delayed'
      ? 'delayed'
      : success.transferVerified === true
        ? 'transfer'
        : 'intervention';
    const assistance = assistanceTier(success);
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
      heldOut: success.heldOut === true,
      promptNovelty: success.promptNovelty,
      difficulty: success.difficulty,
      delayHours: strength === 'delayed' && delayHours != null ? Math.round(delayHours) : undefined,
      assistance,
      // Independent means: the learner's own production, no support, and a
      // real encounter identity. Structurally-assisted modes (retype, choice)
      // can never claim independence, whatever the caller believed.
      independent: assistance === 'none' && Boolean(success.encounterId) && !success.assisted && !success.hinted,
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
