// Typed-shape contract tests for the domain model.
//
// This suite is the reason `npm run type-check` is worth running even though
// the project's JavaScript is not annotated: instead of inferring types from
// unannotated source, it executes the real modules against realistic learner
// state and pins the shapes, types and invariants the rest of the app depends
// on. It catches what tsc cannot see here — a renamed field, a category that
// stops being a string, a score that becomes NaN, an evidence rule that
// quietly regresses — without a 230-error implicit-any cleanup of every
// callback in the model.
//
// The evidence rules asserted here are load-bearing and must never be
// weakened: one correct answer never implies mastery, assisted evidence counts
// less than independent evidence, repeats are deduplicated, null follow-ups
// stay null, and missing evidence stays missing.
//
// NOTE ON DATES: learningEvidence decays evidence strength with age (evidence
// from months ago correctly stops counting). Every timestamp below is derived
// from Date.now(), so these assertions test the RULES rather than decaying into
// false negatives as the suite ages.

import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { test } from 'node:test';

import {
  LEARNER_ERROR_CATEGORIES,
  createLearnerErrorModel,
  recordLearnerError,
  learnerErrorPriority,
  prioritiseLearnerErrors,
  recoveryHistory,
  learnerErrorSummary,
} from '../src/lib/learnerErrors.js';
import {
  LEARNING_STATES,
  EVIDENCE_PHASES,
  createLearningEvidenceState,
  normaliseLearningEvidenceEvent,
  recordLearningEvidence,
  learningEvidenceOverview,
  learningCycleSummary,
  dueLearningChecks,
  evidenceStrengthScore,
  learningCycleStatus,
} from '../src/lib/learningEvidence.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** ISO timestamp `offsetMs` before "now". */
const ago = (offsetMs) => new Date(Date.now() - offsetMs).toISOString();
const NOW = () => Date.now();

// ---- learnerErrors: the model the whole product hangs off ------------------

test('every learner-error category is a non-empty string', () => {
  ok(Array.isArray(LEARNER_ERROR_CATEGORIES) && LEARNER_ERROR_CATEGORIES.length > 0);
  for (const category of LEARNER_ERROR_CATEGORIES) {
    strictEqual(typeof category, 'string');
    ok(category.length > 0, 'a category must not be an empty string');
  }
});

test('a recorded mistake becomes an active weakness with numeric priorities', () => {
  // recordLearnerError is immutable: it returns a NEW model rather than
  // mutating the one passed in.
  const model = recordLearnerError(createLearnerErrorModel(), {
    category: 'grammar',
    key: 'passe-compose',
    label: 'Passé composé vs imparfait',
    detail: 'Used the imparfait for a completed action',
    severity: 'major',
  });

  const ranked = prioritiseLearnerErrors(model);
  strictEqual(ranked.length, 1, 'one mistake should produce one weakness');

  const weakness = ranked[0];
  strictEqual(weakness.category, 'grammar');
  strictEqual(weakness.key, 'passe-compose');
  strictEqual(typeof weakness.errorCount, 'number', 'the entry must carry a numeric error count');
  strictEqual(typeof weakness.lastSeen, 'string');
  ok(Number.isFinite(learnerErrorPriority(weakness)), 'priority must be a finite number');
  strictEqual(weakness.status, 'active', 'a freshly recorded mistake is an active weakness');
});

test('an unknown category is still stored without crashing the model', () => {
  const model = recordLearnerError(createLearnerErrorModel(), {
    category: 'nonsense',
    key: 'x',
    detail: 'weird input',
  });
  strictEqual(prioritiseLearnerErrors(model).length, 1, 'the model must tolerate malformed input');
});

test('repeated misses on one key stay a single weakness and are counted', () => {
  let model = createLearnerErrorModel();
  for (let i = 0; i < 3; i += 1) {
    model = recordLearnerError(model, {
      category: 'grammar',
      key: 'articles',
      detail: 'Missing definite article',
      encounterId: `enc-${i}`,
      at: ago(i * HOUR),
    });
  }
  strictEqual(model.entries.length, 1, 'three misses on one key stay one weakness');
  strictEqual(model.entries[0].errorCount, 3, 'every miss is counted');
  ok(Array.isArray(recoveryHistory(model)), 'recovery history must be an array');
  const summary = learnerErrorSummary(model);
  strictEqual(typeof summary, 'object');
  ok(summary !== null);
});

// ---- learningEvidence: the evidence rules are the contract ----------------

// A phase is mandatory: an event without one is not evidence at all, and the
// normaliser must refuse it rather than invent a phase.
const EVIDENCE = {
  skill: 'grammar',
  key: 'passe-compose',
  label: 'Passé composé vs imparfait',
};

test('the documented phases and learner-facing states are stable strings', () => {
  deepStrictEqual(EVIDENCE_PHASES, ['baseline', 'intervention', 'transfer', 'delayed', 'recurrence']);
  for (const value of Object.values(LEARNING_STATES)) {
    strictEqual(typeof value, 'string');
    ok(value.length > 0);
  }
  strictEqual(
    LEARNING_STATES.DEMONSTRATED,
    'demonstrated',
    'the learner-facing terminal state must stay named "demonstrated"',
  );
});

test('an event with no phase is refused, not defaulted', () => {
  // Manufacturing a phase would fabricate evidence — the worst thing this
  // model could do.
  strictEqual(
    normaliseLearningEvidenceEvent({ ...EVIDENCE, correct: true }),
    null,
    'an event without a recognised phase must be dropped',
  );
});

test('one correct answer never implies mastery', () => {
  // The single most important rule in the product: a learner who gets it right
  // once must NOT be shown as having fixed it.
  let state = createLearningEvidenceState();
  state = recordLearningEvidence(state, {
    ...EVIDENCE,
    phase: 'intervention',
    correct: true,
    encounterId: 'enc-1',
    activityId: 'act-1',
    at: ago(2 * HOUR),
  });
  const cycle = learningEvidenceOverview(state, NOW()).cycles[0];
  ok(cycle, 'the cycle must exist');
  // One pass buys "improving" — it can never reach the terminal state.
  strictEqual(
    cycle.status,
    LEARNING_STATES.IMPROVING,
    'a single independent success may only reach "improving", never "demonstrated"',
  );
  strictEqual(
    cycle.status === LEARNING_STATES.DEMONSTRATED || cycle.status === LEARNING_STATES.NEEDS_CONFIRMATION,
    false,
    'a single correct answer must never imply mastery or confirmation',
  );
  strictEqual(cycle.transferSamples ?? 0, 0, 'transfer evidence must not be assumed to exist');
  strictEqual(cycle.delayedSamples ?? 0, 0, 'delayed evidence must not be assumed to exist');
});

test('assisted success counts for less than independent success', () => {
  const base = { ...EVIDENCE, phase: 'intervention', correct: true, at: ago(2 * HOUR) };
  const assisted = recordLearningEvidence(createLearningEvidenceState(), {
    ...base,
    assisted: true,
    encounterId: 'enc-1',
  });
  const independent = recordLearningEvidence(createLearningEvidenceState(), {
    ...base,
    encounterId: 'enc-1',
  });
  const a = learningEvidenceOverview(assisted, NOW()).cycles[0];
  const i = learningEvidenceOverview(independent, NOW()).cycles[0];
  ok(
    a.meanStrength < i.meanStrength,
    'assisted evidence must be weaker than independent evidence',
  );
});

test('repeated submission of one encounter cannot inflate evidence', () => {
  const once = {
    ...EVIDENCE,
    phase: 'intervention',
    correct: true,
    encounterId: 'enc-1',
    at: ago(2 * HOUR),
  };
  const single = recordLearningEvidence(createLearningEvidenceState(), once);
  let repeated = single;
  for (let i = 0; i < 5; i += 1) repeated = recordLearningEvidence(repeated, once);
  strictEqual(
    learningEvidenceOverview(repeated, NOW()).cycles[0].samples,
    learningEvidenceOverview(single, NOW()).cycles[0].samples,
    're-submitting the same encounter must not add evidence',
  );
});

test('a null follow-up stays null instead of being invented', () => {
  let state = createLearningEvidenceState();
  state = recordLearningEvidence(state, {
    ...EVIDENCE,
    phase: 'intervention',
    correct: true,
    encounterId: 'enc-1',
    at: ago(3 * HOUR),
  });
  const summary = learningCycleSummary(state.cycles[0], NOW());
  strictEqual(summary.latestTransferScore, null, 'a missing transfer must read null, not 0 or a guess');
  strictEqual(summary.latestDelayedScore, null, 'a missing delayed retest must read null');
});

test('demonstrated requires a held-out transfer AND a genuinely delayed retest', () => {
  // "Demonstrated" is the claim the learner is shown as proof, so it must be
  // the hardest state to reach — never granted on a single pass.
  //
  // markerConfidence/sourceReliability are included because real producers
  // (the learner-error store, Listening) supply them: an AI-marked transfer
  // carries marking confidence, and evidence strength is derived from it.
  const MARKED = { markerConfidence: 0.9, sourceReliability: 'high' };
  let state = createLearningEvidenceState();
  state = recordLearningEvidence(state, {
    ...EVIDENCE, ...MARKED, phase: 'baseline', correct: false, encounterId: 'b1', at: ago(30 * HOUR),
  });
  // Two independent interventions are the floor before a transfer confirms.
  state = recordLearningEvidence(state, {
    ...EVIDENCE, ...MARKED, phase: 'intervention', correct: true, encounterId: 'i1', at: ago(20 * HOUR),
  });
  state = recordLearningEvidence(state, {
    ...EVIDENCE, ...MARKED, phase: 'intervention', correct: true, encounterId: 'i2', at: ago(10 * HOUR),
  });

  // A transfer without a delayed retest is only "needs confirmation".
  state = recordLearningEvidence(state, {
    ...EVIDENCE, ...MARKED, phase: 'transfer', correct: true, heldOut: true, encounterId: 't1', at: ago(2 * HOUR),
  });
  let cycle = learningEvidenceOverview(state, NOW()).cycles[0];
  strictEqual(
    cycle.status,
    LEARNING_STATES.NEEDS_CONFIRMATION,
    'a transfer without a delayed retest needs confirmation, not mastery',
  );

  // A retest that is NOT actually delayed must not count: the delay is the
  // whole point of the evidence.
  state = recordLearningEvidence(state, {
    ...EVIDENCE, ...MARKED, phase: 'delayed', correct: true, heldOut: true, encounterId: 'd0',
    delayHours: 1, at: ago(1 * HOUR),
  });
  cycle = learningEvidenceOverview(state, NOW()).cycles[0];
  strictEqual(
    cycle.status,
    LEARNING_STATES.NEEDS_CONFIRMATION,
    'a retest that is not actually delayed must not demonstrate mastery',
  );

  // A genuinely delayed retest (well past the 20h floor) closes the loop.
  state = recordLearningEvidence(state, {
    ...EVIDENCE, ...MARKED, phase: 'delayed', correct: true, heldOut: true, encounterId: 'd1',
    delayHours: 48, at: ago(0.5 * HOUR),
  });
  cycle = learningEvidenceOverview(state, NOW()).cycles[0];
  strictEqual(
    cycle.status,
    LEARNING_STATES.DEMONSTRATED,
    'a held-out transfer plus a genuinely delayed retest demonstrates the fix',
  );
});

test('a new mistake after positive evidence is recurrence, not a fresh weakness', () => {
  let state = createLearningEvidenceState();
  state = recordLearningEvidence(state, {
    ...EVIDENCE, phase: 'intervention', correct: true, encounterId: 'i1', at: ago(10 * HOUR),
  });
  state = recordLearningEvidence(state, {
    ...EVIDENCE, phase: 'baseline', correct: false, encounterId: 'b2', at: ago(2 * HOUR),
  });
  const cycle = state.cycles[0];
  strictEqual(
    cycle.recurrences.length,
    1,
    'a baseline miss after positive evidence must be classified as recurrence',
  );
  strictEqual(learningCycleStatus(cycle, NOW()), LEARNING_STATES.RECURRED);
});

test('old evidence stops counting rather than proving mastery forever', () => {
  // Recency decay is a correctness rule: a transfer from a year ago must not
  // still demonstrate a weakness as fixed.
  const stale = {
    ...EVIDENCE, phase: 'delayed', correct: true, heldOut: true, encounterId: 'd1', delayHours: 48,
    at: new Date(Date.now() - 400 * DAY).toISOString(),
  };
  const strength = evidenceStrengthScore(stale, NOW());
  ok(strength < 0.5, 'evidence from over a year ago must fall below the confirmation floor');
});

test('evidence strength is bounded, finite and ordered by quality', () => {
  const weak = evidenceStrengthScore({
    ...EVIDENCE, phase: 'baseline', correct: false, assisted: true, encounterId: 'x', at: ago(HOUR),
  }, NOW());
  const strong = evidenceStrengthScore({
    ...EVIDENCE, phase: 'delayed', correct: true, heldOut: true, encounterId: 'y',
    delayHours: 40, at: ago(HOUR),
  }, NOW());
  ok(Number.isFinite(weak) && weak >= 0, 'strength must be a finite non-negative number');
  ok(strong > weak, 'stronger evidence must score higher than weaker evidence');
});

test('an overview of empty state is well-formed, not a crash', () => {
  const overview = learningEvidenceOverview(createLearningEvidenceState(), NOW());
  deepStrictEqual(overview.cycles, []);
  deepStrictEqual(overview.due, []);
  strictEqual(overview.nextAction, null);
  deepStrictEqual(dueLearningChecks(createLearningEvidenceState(), NOW()), []);
});

test('a due transfer check is scheduled once an intervention succeeds', () => {
  let state = createLearningEvidenceState();
  state = recordLearningEvidence(state, {
    ...EVIDENCE, phase: 'baseline', correct: false, encounterId: 'b1', at: ago(30 * HOUR),
  });
  state = recordLearningEvidence(state, {
    ...EVIDENCE, phase: 'intervention', correct: true, encounterId: 'i1', at: ago(2 * HOUR),
  });
  const due = dueLearningChecks(state, NOW());
  strictEqual(due.length, 1, 'a successful repair must schedule its unseen transfer');
  strictEqual(due[0].type, 'transfer');
  strictEqual(due[0].target.key, 'passe-compose', 'the due check must name the real weakness');
});

test('a cycle summary is null for an unusable cycle, not a half-built object', () => {
  strictEqual(learningCycleSummary(null, NOW()), null);
  strictEqual(learningCycleSummary(undefined, NOW()), null);
  strictEqual(learningCycleStatus(null, NOW()), LEARNING_STATES.ACTIVE);
});
