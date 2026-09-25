// Evidence-strength invariants — the assistance tier of the learner-error
// model. The recovery loop's core honesty rule: a correct answer produced
// WITH support (copied, hinted, scaffolded mode) is real progress but never
// independent evidence. Mastery must be earned by the learner's own
// production — delayed, or across distinct unassisted encounters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLearnerErrorModel, recordLearnerError, recordLearnerSuccess,
  assistanceTier, prioritiseLearnerErrors,
} from '../src/lib/learnerErrors.js';

const day = (n) => new Date(Date.UTC(2026, 0, 1 + n, 12)).toISOString();

function seededModel() {
  let model = createLearnerErrorModel();
  model = recordLearnerError(model, {
    category: 'grammar', key: 'passe-compose', label: 'passé composé',
  }, { at: day(0) });
  return model;
}

test('a supported success counts as progress but never resolves the weakness', () => {
  const model = recordLearnerSuccess(seededModel(), {
    category: 'grammar', key: 'passe-compose',
    mode: 'conversation', assisted: true, score: 80,
    sessionId: 's1', encounterId: 's1:enc1',
  }, { at: day(1) });
  const entry = model.entries.find((e) => e.id === 'grammar:passe-compose');
  assert.equal(entry.status, 'recovering', 'assisted success leaves the weakness open');
  assert.equal(entry.independentPasses, 0, 'assisted success never advances independence');
  assert.equal(entry.successCount, 1, 'it is still a success');
  assert.equal(entry.evidence.at(-1).assisted, true, 'assistance provenance is persisted');
});

test('delayed unassisted recall resolves; the same recall assisted does not', () => {
  const unassisted = recordLearnerSuccess(seededModel(), {
    category: 'grammar', key: 'passe-compose', mode: 'weakness-retest', score: 90,
    sessionId: 's2', encounterId: 's2:enc1',
  }, { at: day(2) });
  assert.equal(unassisted.entries[0].status, 'resolved', 'a delayed independent recall resolves on its own');

  const assisted = recordLearnerSuccess(seededModel(), {
    category: 'grammar', key: 'passe-compose', mode: 'weakness-retest',
    assisted: true, score: 90,
    sessionId: 's2', encounterId: 's2:enc1',
  }, { at: day(2) });
  assert.equal(assisted.entries[0].status, 'recovering', 'the same recall with support does not resolve');
});

test('scaffolded answers extend recovery but do not resolve, even delayed', () => {
  let model = seededModel();
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'passe-compose', mode: 'weakness-retest',
    hinted: true, score: 75, sessionId: 's2', encounterId: 's2:enc1',
  }, { at: day(2) });
  assert.equal(model.entries[0].status, 'recovering');
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'passe-compose', mode: 'weakness-retest',
    hinted: true, score: 85, sessionId: 's3', encounterId: 's3:enc1',
  }, { at: day(3) });
  assert.equal(model.entries[0].status, 'recovering', 'two scaffolded passes still do not resolve');
  assert.equal(model.entries[0].successCount, 2, 'scaffolded work still counts as progress');
});

test('an assisted success cannot ride in on independence earned before it', () => {
  // One unassisted distinct encounter, then a copied answer on a second
  // encounter: the copy must not complete the pair.
  let model = seededModel();
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'passe-compose', mode: 'conversation', score: 70,
    sessionId: 's1', encounterId: 's1:enc1',
  }, { at: day(0) });
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'passe-compose', mode: 'conversation',
    assisted: true, score: 90, sessionId: 's1', encounterId: 's1:enc2',
  }, { at: day(0) });
  const entry = model.entries.find((e) => e.id === 'grammar:passe-compose');
  assert.equal(entry.status, 'recovering', 'one independent + one copied answer is not mastery');
});

test('recurrence after an assisted success still reopens the weakness', () => {
  let model = seededModel();
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'passe-compose', mode: 'weakness-retest', score: 90,
    sessionId: 's2', encounterId: 's2:enc1',
  }, { at: day(2) });
  assert.equal(model.entries[0].status, 'resolved');
  model = recordLearnerError(model, {
    category: 'grammar', key: 'passe-compose', mode: 'conversation', score: 20,
  }, { at: day(5) });
  const entry = model.entries.find((e) => e.id === 'grammar:passe-compose');
  assert.equal(entry.status, 'active', 'the mistake reopens the weakness');
  assert.equal(entry.independentPasses, 0);
  assert.equal(entry.recurrenceCount, 1, 'the recurrence is recorded');
  assert.ok(prioritiseLearnerErrors(model)[0].id === 'grammar:passe-compose');
});

test('assistanceTier classifies structurally scaffolded modes without flags', () => {
  assert.equal(assistanceTier({ mode: 'conversation' }), 'none');
  assert.equal(assistanceTier({ mode: 'retype' }), 'assisted', 'the answer was just shown');
  assert.equal(assistanceTier({ mode: 'multiple-choice' }), 'scaffolded');
  assert.equal(assistanceTier({ mode: 'conversation', hinted: true }), 'scaffolded');
  assert.equal(assistanceTier({}), 'none');
});

test('legacy success evidence without assistance fields keeps its exact old semantics', () => {
  const model = recordLearnerSuccess(seededModel(), {
    category: 'grammar', key: 'passe-compose', mode: 'weakness-retest', score: 88,
  }, { at: day(2) });
  assert.equal(model.entries[0].status, 'resolved', 'legacy delayed success still resolves');
  assert.equal(model.entries[0].evidence[0].assisted, undefined, 'no fabricated assistance flag');
});

test('distinct unassisted encounters still resolve across two days', () => {
  let model = seededModel();
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'passe-compose', mode: 'conversation', score: 70,
    sessionId: 's1', encounterId: 's1:enc1',
  }, { at: day(0) });
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'passe-compose', mode: 'conversation', score: 80,
    sessionId: 's1', encounterId: 's1:enc2',
  }, { at: day(1) });
  assert.equal(model.entries[0].status, 'resolved');
});
