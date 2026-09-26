// Persistence boundary for the learner-facing baseline → intervention →
// transfer → delayed-retest model. Pure rules live in learningEvidence.js.

import { KEYS, read, write } from '../storageCore.js';
import {
  createLearningEvidenceState,
  learningEvidenceOverview,
  recordLearningEvidence as applyLearningEvidence,
  skillEvidenceQuality,
} from '../learningEvidence.js';

export function getLearningEvidenceState() {
  return createLearningEvidenceState(read(KEYS.learningEvidence, {}));
}

export function saveLearningEvidenceState(state) {
  const clean = createLearningEvidenceState(state);
  write(KEYS.learningEvidence, clean);
  return clean;
}

export function recordLearningEvidence(event, options = {}) {
  const next = applyLearningEvidence(getLearningEvidenceState(), event, options);
  write(KEYS.learningEvidence, next);
  return next.cycles.find((cycle) => cycle.target.id === `${event.skill || event.category || 'general'}:${event.targetKey || event.key || event.topicId || event.itemId || 'general'}`) || next.cycles[0] || null;
}

export const getLearningEvidenceOverview = (now = Date.now()) => learningEvidenceOverview(getLearningEvidenceState(), now);
export const getSkillEvidenceQuality = (now = Date.now()) => skillEvidenceQuality(getLearningEvidenceState(), now);

