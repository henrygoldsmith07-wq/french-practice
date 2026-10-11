// The spoken diagnostic's re-check — the last link the diagnostic owes.
//
// The diagnostic names a weakness from ONE sample and promises a future
// re-check. Until now that promise was never kept: the diagnostic records a
// baseline, and dueLearningChecks only owes a check once an intervention
// exists, so the first named weakness never became a runnable task and the
// loop never started. These tests pin the fix — a fresh baseline with no later
// success now owes a re-check, delayed past the floor, built from the same
// honest runners the repair loop uses — and the honesty it must preserve:
// pronunciation (spoken, no offline grader) promises nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followUpTask, FOLLOW_UP_KINDS } from '../src/lib/followUp.js';
import { ensureGrammarTopics } from '../src/lib/todayCapabilities.js';
import { DELAYED_MIN_HOURS } from '../src/lib/learningEvidence.js';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';

const ready = ensureGrammarTopics();
const HOUR = 3600000;

async function fresh() {
  globalThis.localStorage = memoryStorageDouble();
  const stamp = `${Date.now()}.${Math.random()}`;
  const storage = await import(`../src/lib/storage.js?v=${stamp}`);
  return storage;
}

const unheardTrack = (id) => ({
  id, title: `Track ${id}`, cefr: 'B1',
  questions: [{ q: 'Is the rent inclusive of bills?', options: ['No', 'Yes'], answer: 1 }],
});

// The diagnostic's own finding shape (src/lib/diagnostic.js DIMENSIONS): a
// grammar weakness keyed `diagnostic:accuracy`, labelled plainly, from a
// spoken sample. The learner-error store collapses the `diagnostic:` prefix
// into the category, so the cycle is keyed by category+dimension.
const diagnosticError = (category, dim, label) => ({
  category,
  key: `diagnostic:${dim}`,
  label,
  mode: 'diagnostic',
  source: 'spoken-diagnostic',
  score: 40,
  sessionId: 's-diag',
  encounterId: 'diag-1',
});

test('a fresh diagnostic weakness owes a re-check once the floor has passed', async () => {
  const storage = await fresh();
  const t0 = Date.now();
  storage.recordLearnerError(diagnosticError('grammar', 'accuracy', 'grammar and verb accuracy'));

  // Immediately: nothing is owed — the sample is too fresh to re-check.
  const nowDue = storage.getLearningEvidenceOverview(t0).due;
  assert.ok(!nowDue.some((d) => d.recheck), 'no re-check before the delay floor: a same-day retake is not a retest');

  // Past the floor, with nothing but the baseline recorded: the re-check is due.
  const later = t0 + (DELAYED_MIN_HOURS + 1) * HOUR;
  const due = storage.getLearningEvidenceOverview(later).due.find((d) => d.recheck);
  assert.ok(due, 'a fresh baseline with no later success owes a re-check after the floor');
  assert.equal(due.target.skill, 'grammar');
  // The evidence layer keys the cycle by the finding's key verbatim — the
  // diagnostic owns its own namespace (`diagnostic:accuracy`) so it never
  // silently collides with a different grammar weakness.
  assert.equal(due.target.key, 'diagnostic:accuracy');
  assert.equal(due.target.id, 'grammar:diagnostic:accuracy');
});

test('the re-check owes NOTHING once the learner has repaired the weakness', async () => {
  const storage = await fresh();
  const t0 = Date.now();
  storage.recordLearnerError(diagnosticError('grammar', 'accuracy', 'grammar and verb accuracy'));
  // A repair: the learner shows a sign of improvement. The normal repair loop
  // now owns the cycle; the fresh-baseline re-check must stand down.
  storage.recordLearnerSuccess({
    category: 'grammar', key: 'diagnostic:accuracy', label: 'grammar and verb accuracy',
    mode: 'drill', score: 80, encounterId: 'repair-1', sessionId: 's1',
  });
  const later = t0 + (DELAYED_MIN_HOURS + 1) * HOUR;
  const due = storage.getLearningEvidenceOverview(later).due;
  assert.ok(!due.some((d) => d.recheck), 'no re-check once there is positive evidence — the repair loop owns it now');
  assert.ok(due.some((d) => d.type === 'transfer'), 'the ordinary transfer check is what is owed instead');
});

test('a grammar re-check is built from the honest authored quiz lane', async () => {
  await ready;
  const storage = await fresh();
  storage.recordLearnerError(diagnosticError('grammar', 'accuracy', 'passe compose'));
  const later = Date.now() + (DELAYED_MIN_HOURS + 1) * HOUR;
  const due = storage.getLearningEvidenceOverview(later).due.find((d) => d.recheck);
  const task = followUpTask(due, { dayIndex: 0 });
  assert.ok(task, 'a concrete, runnable task is built for the re-check');
  assert.equal(task.kind, FOLLOW_UP_KINDS.DIAGNOSTIC);
  // It reuses the authored runner underneath — same held-out, unseen material
  // as any grammar follow-up — but wears the diagnostic label and prompt.
  assert.equal(task.heldOut, true, 'unseen sentences: the re-check is not a replay of the sample');
  assert.match(task.prompt, /first thing we flagged/i);
  assert.ok(task.encounterId.startsWith('diagnostic:'), 'a diagnostic-scoped encounter id');
});

test('a vocabulary re-check is productive use of the flagged word', async () => {
  const storage = await fresh();
  storage.recordLearnerError(diagnosticError('vocabulary', 'vocabulary', 'manger'));
  const later = Date.now() + (DELAYED_MIN_HOURS + 1) * HOUR;
  const due = storage.getLearningEvidenceOverview(later).due.find((d) => d.recheck);
  const task = followUpTask(due, { dayIndex: 0 });
  assert.ok(task, 'a runnable re-check is built for the vocabulary dimension');
  assert.equal(task.kind, FOLLOW_UP_KINDS.DIAGNOSTIC);
  assert.equal(task.word, 'manger', 'the exact word the diagnostic flagged');
});

test('a listening re-check is a fresh, unseen track', async () => {
  const storage = await fresh();
  storage.recordLearnerError(diagnosticError('listening', 'comprehension', 'Listening accuracy'));
  const later = Date.now() + (DELAYED_MIN_HOURS + 1) * HOUR;
  const due = storage.getLearningEvidenceOverview(later).due.find((d) => d.recheck);
  const task = followUpTask(due, { tracks: [unheardTrack('pod-boulot')], heardTrackIds: ['dl-colocation'], dayIndex: 0 });
  assert.ok(task, 'a runnable re-check is built for the listening dimension');
  assert.equal(task.kind, FOLLOW_UP_KINDS.DIAGNOSTIC);
  assert.equal(task.track.id, 'pod-boulot', 'a track the learner has not heard');
});

test('a pronunciation re-check promises NOTHING when it cannot be graded', async () => {
  const storage = await fresh();
  storage.recordLearnerError(diagnosticError('pronunciation', 'pronunciation', 'pronunciation'));
  const later = Date.now() + (DELAYED_MIN_HOURS + 1) * HOUR;
  const due = storage.getLearningEvidenceOverview(later).due.find((d) => d.recheck);
  assert.ok(due, 'the re-check is owed — the weakness is real');
  // But no honest offline task exists for spoken pronunciation, so the session
  // must be told to promise nothing rather than fake a check.
  assert.equal(followUpTask(due, { dayIndex: 0 }), null, 'no task it cannot grade: honesty over a manufactured pass');
});

test('the re-check result is recorded against the same weakness it names', async () => {
  await ready;
  const storage = await fresh();
  storage.recordLearnerError(diagnosticError('grammar', 'accuracy', 'passe compose'));
  const later = Date.now() + (DELAYED_MIN_HOURS + 1) * HOUR;
  const due = storage.getLearningEvidenceOverview(later).due.find((d) => d.recheck);
  const task = followUpTask(due, { dayIndex: 0 });
  // A pass, recorded exactly as FollowUpCheck would for a graded transfer.
  storage.recordLearnerSuccess({
    category: task.skill, key: task.key, label: task.label,
    mode: 'followup', source: 'followup-transfer', score: 100,
    sessionId: 's-followup', encounterId: task.encounterId,
    activityId: `followup:${task.targetId}`, detail: '3/3 on unseen items',
    transferVerified: true, heldOut: task.heldOut === true, promptNovelty: 1,
  });
  const cycle = storage.getLearningEvidenceState().cycles.find((c) => c.target.id === task.targetId);
  assert.ok(cycle, 'the pass lands on the weakness the diagnostic named');
  assert.ok(cycle.transfers.some((t) => t.correct), 'a clean re-check is real transfer evidence');
});

// ── the one clock: copy and scheduler agree by construction ─────────────────
//
// The onboarding copy used to say "3 days" while the scheduler fired at its own
// 20h floor — a promise the engine ignored. The horizon is now derived ONCE, by
// urgency, and both the displayed date and the fired date come from it.

test('the re-check horizon is adaptive: a clear gap is looked at sooner than a mild one', async () => {
  const { recheckHorizonHours, RECHECK_FLOOR_HOURS } = await import('../src/lib/diagnostic.js');
  const clear = recheckHorizonHours(20); // a strong gap
  const moderate = recheckHorizonHours(40);
  const mild = recheckHorizonHours(70);
  assert.ok(clear < moderate, 'a clear gap is re-checked sooner than a moderate one');
  assert.ok(moderate < mild, 'a moderate gap is re-checked sooner than a mild one');
  // Every band is a real gap, never a same-day retake, and never absurdly far.
  for (const h of [clear, moderate, mild]) {
    assert.ok(h >= RECHECK_FLOOR_HOURS, 'never below the 20h floor');
    assert.ok(h <= 5 * 24, 'never beyond five days');
  }
});

test('diagnoseSpeaking schedules the horizon the copy will show, above the floor', async () => {
  globalThis.localStorage = memoryStorageDouble();
  const { diagnoseSpeaking } = await import(`../src/lib/diagnostic.js?v=${Date.now()}`);
  const { DELAYED_MIN_HOURS } = await import('../src/lib/learningEvidence.js');
  const t0 = Date.now();
  // A clear gap (accuracy 15, others high) → the "soon" band.
  const out = diagnoseSpeaking(
    { transcript: 'je suis allé', accuracy: 15, fluency: 90, vocabulary: 90, pronunciation: 90 },
    { now: t0, recordError: () => ({ id: 'x', status: 'active' }) },
  );
  assert.ok(out.finding, 'a weakness is named');
  assert.ok(out.recheckHours >= DELAYED_MIN_HOURS, 'the scheduled horizon respects the engine floor');
  // The date the learner will be told IS the date the engine fires: the delta
  // from now equals the returned horizon exactly.
  const firedMs = Date.parse(out.recheckAt) - t0;
  assert.equal(Math.round(firedMs / 3600000), out.recheckHours, 'copy date == engine date');
  assert.match(out.note, /We'll check it again in \d+ day/, 'the copy states the same horizon');
});

test('the scheduler fires the diagnostic’s scheduled date, not a re-derived one', async () => {
  const storage = await fresh();
  const t0 = Date.now();
  // A mild gap (score 70) schedules the LONG horizon (5 days). The scheduler
  // must honor that stored date, not fire at the 20h floor.
  storage.recordLearnerError({
    category: 'grammar', key: 'diagnostic:accuracy', label: 'grammar and verb accuracy',
    mode: 'diagnostic', source: 'spoken-diagnostic', score: 70,
    sessionId: 's-diag', encounterId: 'diag-1',
    detail: `recheck@${new Date(t0 + 5 * 24 * 3600000).toISOString()}`,
  });
  // Just past the 20h floor but well before the scheduled 5-day date: NOT due.
  const afterFloor = t0 + (DELAYED_MIN_HOURS + 1) * 3600000;
  assert.ok(
    !storage.getLearningEvidenceOverview(afterFloor).due.some((d) => d.recheck),
    'the mild gap is NOT owed at the floor — the scheduled 5-day date is honored',
  );
  // Past the scheduled date: now due.
  const afterScheduled = t0 + 5 * 24 * 3600000 + 3600000;
  assert.ok(
    storage.getLearningEvidenceOverview(afterScheduled).due.some((d) => d.recheck),
    'owed once the scheduled date passes',
  );
});

test('a scheduled date can never fire before the floor', async () => {
  const storage = await fresh();
  const t0 = Date.now();
  // A pathological schedule that tries to fire at 1h — clamped up to the floor.
  storage.recordLearnerError({
    category: 'grammar', key: 'diagnostic:accuracy', label: 'grammar',
    mode: 'diagnostic', source: 'spoken-diagnostic', score: 20,
    sessionId: 's-diag', encounterId: 'diag-1',
    detail: `recheck@${new Date(t0 + 3600000).toISOString()}`,
  });
  const beforeFloor = t0 + 5 * 3600000;
  assert.ok(
    !storage.getLearningEvidenceOverview(beforeFloor).due.some((d) => d.recheck),
    'a too-early schedule is clamped to the floor — never a same-day retake',
  );
  const afterFloor = t0 + (DELAYED_MIN_HOURS + 1) * 3600000;
  assert.ok(
    storage.getLearningEvidenceOverview(afterFloor).due.some((d) => d.recheck),
    'owed at the floor even if the schedule asked for sooner',
  );
});
