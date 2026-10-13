// The board's oracy weight must reach the LIVE session, not only the preview.
//
// The dashboard brief (todayBrief → buildSessionPlan) applies
// resolveExamWeighting; the live session (TodaySession → buildTodayPlan →
// dailyCurriculum) shapes the real time split. They are deliberately distinct
// planners, but a candidate must not be shown a speak-leaning preview and then
// sit a session that ignores their qualification.
//
// The regression this guards: buildTodayPlan's examCountdown call omitted the
// board entirely (it resolved the board from boards.js in the original design,
// which was correctly kept off Today's load graph). Once ExamSetup began
// persisting settings.examSpeakingWeight as a plain number, the weight could
// reach the session at zero bundle cost — and until it did, the preview and the
// session disagreed about every oracy-heavy paper.
//
// These tests drive buildTodayPlan itself, so they fail if the wiring is
// dropped anywhere between the caller and the countdown.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryStorage } from './helpers/memory-storage.js';

globalThis.localStorage = memoryStorage();

const { buildTodayPlan } = await import('../src/lib/todayPlan.js');
const { ensureGrammarTopics } = await import('../src/lib/todayCapabilities.js');
await ensureGrammarTopics();

// A plan with every modality available, so the split is not capped by a missing
// source. `entries`/`scenariosReg`/`listeningTracks` must be arrays (not null,
// which buildTodayPlan reads as "still loading").
const base = {
  open: true,
  minutes: 20,
  apiKey: null,
  mockMode: false,
  level: 'B1',
  entries: [],
  scenariosReg: [{ id: 'sc-1', title: 'Au café', level: 'B1', theme: 'food' }],
  grammarReady: true,
  listeningTracks: [{ id: 't1', title: 'Une interview', level: 'B1', sourceType: 'tts' }],
  studyFailed: true, // no study module → the degraded path still builds a plan
  now: Date.now(),
};

const dayIn = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const speakMinutes = (input) => {
  const plan = buildTodayPlan({ ...base, ...input });
  assert.ok(plan, 'a plan was built');
  return plan.segments.find((s) => s.id === 'speak')?.minutes ?? 0;
};

test('an oracy-heavy board gives the live session more speaking time', () => {
  // 10 days out is the final-weeks band, where the countdown has real
  // granularity. The only difference between the two calls is the stored board
  // weight, so any change in the split is attributable to the board.
  const date = dayIn(10);
  const light = speakMinutes({ examDate: date, examSpeakingWeight: 0.25 });
  const heavy = speakMinutes({ examDate: date, examSpeakingWeight: 0.30 });

  assert.ok(
    heavy > light,
    `a 30% oracy board must buy more speaking than a 25% one (${light} → ${heavy} minutes)`,
  );
});

test('no stored board weight leaves the live session byte-identical', () => {
  // A learner with no board, or one chosen before examSpeakingWeight existed,
  // must get exactly the session they got before this wiring existed.
  const date = dayIn(10);
  const without = buildTodayPlan({ ...base, examDate: date });
  const explicitNull = buildTodayPlan({ ...base, examDate: date, examSpeakingWeight: null });
  const nonsense = buildTodayPlan({ ...base, examDate: date, examSpeakingWeight: 'lots' });

  const shape = (plan) => plan.segments.map((s) => `${s.id}:${s.minutes}`).join('|');
  assert.equal(shape(explicitNull), shape(without), 'an explicit null weight is neutral');
  assert.equal(shape(nonsense), shape(without), 'an unusable weight is ignored, never guessed');
});

test('the board weight does nothing without an exam date', () => {
  // The weight scales the countdown band; with no date there is no band, so the
  // session is the standard mix. This is why the two inputs are separate.
  const noDate = buildTodayPlan({ ...base, examSpeakingWeight: 0.30 });
  const noDatePlain = buildTodayPlan({ ...base });
  const shape = (plan) => plan.segments.map((s) => `${s.id}:${s.minutes}`).join('|');
  assert.equal(shape(noDate), shape(noDatePlain),
    'a board weight without an exam date must not reshape the session');
});
