import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_STATES,
  createLearningEvidenceState,
  dueLearningChecks,
  evidenceStrengthScore,
  learningCycleStatus,
  learningEvidenceOverview,
  recordLearningEvidence,
  skillEvidenceQuality,
} from '../src/lib/learningEvidence.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 8, 1, 10);
const at = (days = 0, hours = 0) => new Date(T0 + days * DAY + hours * 3600000).toISOString();

const target = { skill: 'grammar', targetKey: 'si-clauses', label: 'Si clauses' };
const ev = (phase, extra = {}) => ({
  phase,
  ...target,
  at: extra.at || at(),
  modality: extra.modality || 'writing',
  encounterId: extra.encounterId || `${phase}-${extra.at || at()}`,
  sessionId: extra.sessionId || `session-${phase}`,
  sourceReliability: 'high',
  markerConfidence: 0.9,
  difficulty: 3,
  ...extra,
});

describe('learning-effectiveness loop', () => {
  it('requires intervention, held-out transfer and delayed independent recall before Demonstrated', () => {
    let state = createLearningEvidenceState();
    state = recordLearningEvidence(state, ev('baseline', { correct: false, score: 35, at: at(0) }));
    let cycle = state.cycles[0];
    assert.equal(learningCycleStatus(cycle, T0), LEARNING_STATES.ACTIVE);

    state = recordLearningEvidence(state, ev('intervention', { correct: true, score: 90, at: at(0, 1) }));
    cycle = state.cycles[0];
    assert.equal(learningCycleStatus(cycle, T0 + 2 * 3600000), LEARNING_STATES.IMPROVING);

    state = recordLearningEvidence(state, ev('transfer', {
      correct: true, score: 82, at: at(0, 2), heldOut: true,
      promptNovelty: 1, modality: 'speaking', sourceModality: 'writing',
    }));
    cycle = state.cycles[0];
    assert.equal(learningCycleStatus(cycle, T0 + 3 * 3600000), LEARNING_STATES.NEEDS_CONFIRMATION);

    state = recordLearningEvidence(state, ev('delayed', {
      correct: true, score: 86, at: at(2), delayHours: 46,
      modality: 'speaking', encounterId: 'delayed-fresh', sessionId: 'session-later',
    }));
    cycle = state.cycles[0];
    assert.equal(learningCycleStatus(cycle, T0 + 2 * DAY), LEARNING_STATES.DEMONSTRATED);
  });

  it('does not let assisted success prove independent mastery', () => {
    let state = createLearningEvidenceState();
    state = recordLearningEvidence(state, ev('baseline', { correct: false, at: at(0) }));
    state = recordLearningEvidence(state, ev('intervention', { correct: true, assisted: true, at: at(0, 1) }));
    state = recordLearningEvidence(state, ev('transfer', { correct: true, assisted: true, heldOut: true, at: at(0, 2) }));
    state = recordLearningEvidence(state, ev('delayed', { correct: true, assisted: true, at: at(2), delayHours: 46 }));
    assert.notEqual(learningCycleStatus(state.cycles[0], T0 + 2 * DAY), LEARNING_STATES.DEMONSTRATED);
  });

  it('dedupes repeated submission of the same encounter', () => {
    let state = createLearningEvidenceState();
    const one = ev('intervention', { correct: true, encounterId: 'same-presentation', at: at(0, 1) });
    state = recordLearningEvidence(state, one);
    state = recordLearningEvidence(state, one);
    assert.equal(state.cycles[0].interventions.length, 1);
  });

  it('reopens demonstrated learning when the weakness recurs', () => {
    let state = createLearningEvidenceState();
    for (const event of [
      ev('baseline', { correct: false, at: at(0) }),
      ev('intervention', { correct: true, at: at(0, 1) }),
      ev('transfer', { correct: true, heldOut: true, promptNovelty: 1, at: at(0, 2) }),
      ev('delayed', { correct: true, delayHours: 46, at: at(2) }),
    ]) state = recordLearningEvidence(state, event);
    assert.equal(learningCycleStatus(state.cycles[0], T0 + 2 * DAY), LEARNING_STATES.DEMONSTRATED);

    state = recordLearningEvidence(state, ev('baseline', { correct: false, score: 20, at: at(5), encounterId: 'recurrence' }));
    assert.equal(state.cycles[0].recurrences.length, 1);
    assert.equal(learningCycleStatus(state.cycles[0], T0 + 5 * DAY), LEARNING_STATES.RECURRED);
  });
});

describe('evidence strength and scheduling', () => {
  it('weights held-out delayed independent evidence above assisted training repetition', () => {
    const strong = evidenceStrengthScore(ev('delayed', {
      correct: true, heldOut: true, promptNovelty: 1, difficulty: 5,
      markerConfidence: 1, sourceReliability: 'high', delayHours: 48,
      at: at(2),
    }), T0 + 2 * DAY);
    const weak = evidenceStrengthScore(ev('intervention', {
      correct: true, assisted: true, difficulty: 1, markerConfidence: 0.5,
      sourceReliability: 'medium', at: at(2),
    }), T0 + 2 * DAY);
    assert.ok(strong > weak, `${strong} should exceed ${weak}`);
  });

  it('schedules unseen transfer after repair, then delayed confirmation after transfer', () => {
    let state = createLearningEvidenceState();
    state = recordLearningEvidence(state, ev('baseline', { correct: false, at: at(0) }));
    state = recordLearningEvidence(state, ev('intervention', { correct: true, at: at(0, 1) }));
    let due = dueLearningChecks(state, T0 + 2 * 3600000);
    assert.equal(due[0].type, 'transfer');

    state = recordLearningEvidence(state, ev('transfer', { correct: true, heldOut: true, promptNovelty: 1, at: at(0, 2) }));
    assert.equal(dueLearningChecks(state, T0 + 10 * 3600000).length, 0, 'delayed check is not due too early');
    due = dueLearningChecks(state, T0 + 2 * DAY);
    assert.equal(due[0].type, 'delayed');
  });

  it('keeps missing evidence missing and exposes evidence quality by skill', () => {
    let state = createLearningEvidenceState();
    state = recordLearningEvidence(state, ev('baseline', { correct: false, score: null, at: at(0) }));
    const overview = learningEvidenceOverview(state, T0);
    assert.equal(overview.cycles[0].latestTransferScore, null);
    assert.equal(overview.cycles[0].latestDelayedScore, null);
    const quality = skillEvidenceQuality(state, T0);
    assert.equal(quality.grammar.samples, 1);
    assert.equal(quality.grammar.heldOut, 0);
    assert.ok(quality.grammar.confidence < 0.5);
  });
});

