// The delayed retest must actually be DELAYED, and the whole app must ask the
// one question ("what does the model owe?") in one way.
//
// Before: evidenceStrength called any cross-midnight success "delayed", so a
// 23:50 → 00:10 repeat — answer still on screen — counted as retention and
// could resolve a weakness outright. And plannerState carried a second, looser
// derivation of the same question that could call a delayed check due with no
// delay at all. Both are pinned here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evidenceStrength, recordLearnerError, recordLearnerSuccess, createLearnerErrorModel } from '../src/lib/learnerErrors.js';
import { DELAYED_MIN_HOURS, createLearningEvidenceState, recordLearningEvidence, dueLearningChecks } from '../src/lib/learningEvidence.js';

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T09:00:00Z');

test('crossing local midnight alone is not enough to be "delayed"', () => {
  // A mistake, then a success 30 minutes later but on the next calendar day.
  let model = createLearnerErrorModel();
  model = recordLearnerError(
    model,
    { category: 'grammar', key: 'x', label: 'x', mode: 'drill' },
    { at: new Date(T0).toISOString() },
  );
  const entry = model.entries.find((e) => e.key === 'x');
  // Same-session retry that happens to be stamped the next day (23:50 → 00:10).
  const justAfter = new Date(T0 + 30 * 60000).toISOString();
  const strength = evidenceStrength({ at: justAfter, mode: 'drill' }, entry);
  assert.equal(strength, 'same-session', '30 minutes is repetition, not retention');

  // A genuine gap — far enough to be a different LOCAL day on any timezone,
  // and past the floor — is delayed.
  const muchLater = new Date(T0 + 2 * DAY).toISOString();
  assert.equal(evidenceStrength({ at: muchLater, mode: 'drill' }, entry), 'delayed');
});

test('a verified delayed flag from the clock-checked retest path is still honoured', () => {
  // The scheduled-retest path verifies the clock BEFORE setting delayed:true,
  // so that claim must not be second-guessed here.
  let model = createLearnerErrorModel();
  model = recordLearnerError(
    model,
    { category: 'grammar', key: 'x', label: 'x', mode: 'drill' },
    { at: new Date(T0).toISOString() },
  );
  const entry = model.entries.find((e) => e.key === 'x');
  const strength = evidenceStrength({ at: new Date(T0 + 60000).toISOString(), mode: 'drill', delayed: true }, entry);
  assert.equal(strength, 'delayed', 'an explicitly verified delayed pass counts');
});

test('the delayed floor is shared: the scheduler and the classifier agree', () => {
  let state = createLearningEvidenceState();
  const at = (h) => new Date(T0 + h * 3600000).toISOString();
  state = recordLearningEvidence(state, { phase: 'baseline', skill: 'grammar', targetKey: 'x', correct: false, at: at(0), encounterId: 'b' });
  state = recordLearningEvidence(state, { phase: 'intervention', skill: 'grammar', targetKey: 'x', correct: true, independent: true, at: at(1), encounterId: 'i' });
  state = recordLearningEvidence(state, { phase: 'transfer', skill: 'grammar', targetKey: 'x', correct: true, independent: true, heldOut: true, at: at(2), encounterId: 't' });
  // The floor runs from the TRANSFER pass (2h), not from the start.
  const dueFrom = 2 + DELAYED_MIN_HOURS;
  assert.equal(dueLearningChecks(state, T0 + (dueFrom - 2) * 3600000).length, 0, 'not due before the floor');
  const due = dueLearningChecks(state, T0 + (dueFrom + 1) * 3600000);
  assert.equal(due.length, 1);
  assert.equal(due[0].type, 'delayed');
});
