// Speaking-time and usefulness capture into the study outcome model.
//
// The two experiment metrics that used to live only in local instrumentation
// now reach outcome rows. These tests pin the honesty rules:
//   · voiced production only (silence and AI playback never count)
//   · one presentation counts once, however often it is submitted
//   · abandoned sessions record what was genuinely spoken, never a guess
//   · usefulness is 1–5 or absent — absence is never a rating
import assert from 'node:assert/strict';
import { test } from 'node:test';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (i) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  };
}

async function fresh() {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}.${Math.random()}`;
  const storage = await import(`../src/lib/storage.js?v=${stamp}`);
  const studyFlow = await import(`../src/lib/studyFlow.js?sf=${stamp}`);
  const speakingTime = await import(`../src/lib/speakingTime.js?st=${stamp}`);
  return { storage, studyFlow, speakingTime };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

const rowWith = (f, trialId) => f.storage.getStudyOutcomes().find((o) => o.trialId === trialId);

test('voiced production reaches the outcome row; silence contributes nothing', async () => {
  const f = await fresh();
  const { studyFlow, speakingTime, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  studyFlow.startOutcomeRecord({
    trial: { id: 't1', at: new Date().toISOString(), activity: 'speak', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' },
    graph: [], arm: s.arm, day: 0,
  });
  // Two speaking turns: 9 s voiced, then 4 s voiced. Three silent minutes of
  // the Speak screen are NOT speech and add nothing.
  const spoken = speakingTime.spokenProduction([
    { voicedMs: 9000, encounterId: 'e1', sessionId: 's' },
    { voicedMs: 4000, encounterId: 'e2', sessionId: 's' },
    { voicedMs: 0, encounterId: 'e3', sessionId: 's' },
    { voicedMs: 0, encounterId: 'e4', sessionId: 's' },
  ]);
  studyFlow.updateOutcomeDelivery({ trialId: 't1', speakingSeconds: spoken.seconds, completed: true });
  const row = rowWith(f, 't1');
  assert.equal(row.speakingSeconds, 13, 'only voiced production is recorded');
});

test('AI playback is never learner speech — only mic attempts count', async () => {
  const f = await fresh();
  const { speakingTime } = f;
  // The module accepts mic-attempt events only; a playback window has zero
  // voiced time and is never synthesised into a duration.
  const result = speakingTime.spokenProduction([
    { voicedMs: 0, activityId: 'partner-reply' },
    { voicedMs: 0, activityId: 'partner-reply' },
  ]);
  assert.equal(result.seconds, 0);
});

test('a re-submitted presentation cannot double-count', async () => {
  const f = await fresh();
  const { studyFlow, speakingTime, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  studyFlow.startOutcomeRecord({
    trial: { id: 't2', at: new Date().toISOString(), activity: 'speak', variant: s.arm, selectedId: 'mg-2', selectedConcept: 'c' },
    graph: [], arm: s.arm, day: 0,
  });
  const spoken = speakingTime.spokenProduction([
    { voicedMs: 6000, encounterId: 'e1', sessionId: 's' },
    { voicedMs: 6000, encounterId: 'e1', sessionId: 's' }, // duplicate submit
  ]);
  assert.equal(spoken.seconds, 6);
  studyFlow.updateOutcomeDelivery({ trialId: 't2', speakingSeconds: spoken.seconds, completed: true });
  assert.equal(rowWith(f, 't2').speakingSeconds, 6, 'one presentation, one contribution');
});

test('an abandoned session records genuine speech, never a guessed total', async () => {
  const f = await fresh();
  const { studyFlow, speakingTime } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  studyFlow.startOutcomeRecord({
    trial: { id: 't3', at: new Date().toISOString(), activity: 'speak', variant: s.arm, selectedId: 'mg-3', selectedConcept: 'c' },
    graph: [], arm: s.arm, day: 0,
  });
  // The learner closed Today after two real turns of an eight-minute session.
  const spoken = speakingTime.spokenProduction([
    { voicedMs: 7000, encounterId: 'e1', sessionId: 's' },
    { voicedMs: 5000, encounterId: 'e2', sessionId: 's' },
  ]);
  studyFlow.updateOutcomeDelivery({ trialId: 't3', speakingSeconds: spoken.seconds, completed: false });
  const row = rowWith(f, 't3');
  assert.equal(row.speakingSeconds, 12);
  assert.ok(row.speakingSeconds < 480, 'no fabricated eight-minute total');
  assert.equal(row.completed, false);
});

test('usefulness is 1–5 or absent — never invented, never coerced', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  studyFlow.startOutcomeRecord({
    trial: { id: 't4', at: new Date().toISOString(), activity: 'speak', variant: s.arm, selectedId: 'mg-4', selectedConcept: 'c' },
    graph: [], arm: s.arm, day: 0,
  });
  const row0 = rowWith(f, 't4');
  assert.equal(row0.usefulness, null, 'no rating yet — never a default score');

  // A dismissed prompt passes nothing: the field stays null.
  studyFlow.updateOutcomeDelivery({ trialId: 't4', usefulness: null });
  assert.equal(rowWith(f, 't4').usefulness, null, 'dismissal stores nothing');

  // Out-of-range and non-numeric ratings are rejected, not clamped to 5.
  studyFlow.updateOutcomeDelivery({ trialId: 't4', usefulness: 9 });
  assert.equal(rowWith(f, 't4').usefulness, null, 'a 9 is not a rating');
  studyFlow.updateOutcomeDelivery({ trialId: 't4', usefulness: 'great' });
  assert.equal(rowWith(f, 't4').usefulness, null);

  // A real rating lands.
  studyFlow.updateOutcomeDelivery({ trialId: 't4', usefulness: 4 });
  assert.equal(rowWith(f, 't4').usefulness, 4);

  // A later null never erases an existing rating.
  studyFlow.updateOutcomeDelivery({ trialId: 't4', usefulness: null });
  assert.equal(rowWith(f, 't4').usefulness, 4);
});

test('the report shows these metrics as real data once rows exist, not as gaps', async () => {
  const { experimentComparison } = await import(`../src/lib/experimentReport.js?er=${Date.now()}.${Math.random()}`);
  // Real input shape: participant summaries (the weighting keys) joined with
  // their outcome rows (where the captured fields live).
  const pooled = {
    summaries: [
      { participantId: 'a0', arm: 'adaptive' },
      { participantId: 'a1', arm: 'adaptive' },
      { participantId: 'b0', arm: 'balanced' },
      { participantId: 'b1', arm: 'balanced' },
    ],
    outcomes: [
      { participantId: 'a0', variant: 'adaptive', speakingSeconds: 120, usefulness: 4 },
      { participantId: 'a1', variant: 'adaptive', speakingSeconds: 60, usefulness: 5 },
      { participantId: 'b0', variant: 'balanced', speakingSeconds: 90, usefulness: 3 },
      { participantId: 'b1', variant: 'balanced', speakingSeconds: 45, usefulness: 2 },
    ],
  };
  const report = experimentComparison(pooled);
  assert.equal(report.metrics.speakingTime.adaptive.state !== 'no-data', true);
  assert.equal(report.metrics.usefulness.balanced.state !== 'no-data', true);
  assert.ok(!report.captureGaps.some((g) => g.startsWith('speakingTime')),
    'once rows carry spoken time, it stops listing as a capture gap');
  assert.ok(!report.captureGaps.some((g) => g.startsWith('usefulness')),
    'once rows carry ratings, it stops listing as a capture gap');
});
