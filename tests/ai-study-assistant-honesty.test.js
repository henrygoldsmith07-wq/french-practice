// The AI Study Assistant must advise from the learner's own record.
//
// The panel was handed a fixed object by App.jsx — 450 XP, a 12-day streak,
// three hard-coded "weak" words, a table of practice hours — so every learner
// on every device saw the same personalised advice. This test pins the
// behaviour that replaced it: no streak alarm without activity, no "peak
// learning hour" without a history to point at, and weak words that come
// from the learner's own tracked mistakes.
//
// Run: node --test tests/ai-study-assistant-honesty.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';

function memoryStorage(seed) {
  return memoryStorageDouble(seed);
}

const emptyState = {
  weeklyXP: 0,
  streakCount: 0,
  sessionsCompleted: 0,
  lastActivity: null,
  activityByHour: {},
  lowAccuracyWords: [],
  weakestArea: null,
  vocabulary: [],
  momentum: 1,
  recentAverageMinutes: 0,
  minutesByWeekday: [0, 0, 0, 0, 0, 0, 0],
  accuracy: null,
  cefrLevel: 'B1',
  weaknessesResolved: 0,
  weaknessesActive: 0,
  dailyGoalXP: 30,
  activitySample: 0,
  hasEvidence: false,
};

async function loadLib() {
  globalThis.localStorage = memoryStorage();
  const lib = await import(`../src/lib/aiStudyAssistant.js?h-${Date.now()}-${Math.random()}`);
  return lib;
}

test('a learner with no practice on record is not told their streak is at risk', async () => {
  const { generateAIRecommendations } = await loadLib();
  const recommendations = generateAIRecommendations(emptyState);
  const streakAlarm = recommendations.find((r) => r.type === 'motivation');
  assert.equal(
    streakAlarm, undefined,
    'a brand-new learner must not be told their streak is at risk — there is no streak to lose',
  );
});

test('a learner who has not practised for a day IS told, and the day count is real', async () => {
  const { generateAIRecommendations } = await loadLib();
  const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
  const recommendations = generateAIRecommendations({
    ...emptyState,
    lastActivity: twoDaysAgo,
    streakCount: 9,
    hasEvidence: true,
  });
  const alarm = recommendations.find((r) => r.type === 'motivation');
  assert.ok(alarm, 'a lapsed streak is worth an urgent card');
  assert.match(alarm.description, /2 days/, 'the day count comes from the real gap');
  assert.ok(alarm.target, 'the card points somewhere the learner can act');
});

test('a broken streak is not offered as one that can still be saved', async () => {
  const { generateAIRecommendations } = await loadLib();
  const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
  const recommendations = generateAIRecommendations({
    ...emptyState,
    lastActivity: twoDaysAgo,
    streakCount: 0,      // getStreak() has already reset it
    streakLost: 6,       // the six-day streak that was lost
    hasEvidence: true,
  });
  const card = recommendations.find((r) => r.type === 'motivation');
  assert.ok(card, 'a practice break is worth an urgent card');
  assert.doesNotMatch(card.description, /keep your streak alive/i, 'the streak is already gone');
  assert.match(card.description, /starts a new streak/i);
});

test('"best practice time" is not claimed without a history to point at', async () => {
  const { generateAIRecommendations } = await loadLib();
  const withoutSample = generateAIRecommendations({
    ...emptyState,
    activityByHour: { 7: 2, 19: 1 },
    activitySample: 3,
  });
  assert.equal(
    withoutSample.find((r) => r.type === 'timing'), undefined,
    'three records are not a pattern',
  );

  const withSample = generateAIRecommendations({
    ...emptyState,
    activityByHour: { 7: 2, 19: 9, 20: 6 },
    activitySample: 17,
    lastActivity: Date.now() - 60_000,
  });
  const timing = withSample.find((r) => r.type === 'timing');
  assert.ok(timing, 'with a real history the panel can name a good hour');
  assert.match(timing.description, /practised most often around 7:00PM/);
});

test('the weak words are the learner\'s own tracked mistakes', async () => {
  const { generateAIRecommendations } = await loadLib();
  const recommendations = generateAIRecommendations({
    ...emptyState,
    lowAccuracyWords: ['récupérer', 'guillotiner'],
    hasEvidence: true,
  });
  const vocab = recommendations.find((r) => r.title === 'Vocabulary Accuracy');
  assert.ok(vocab, 'a tracked vocabulary mistake is worth a card');
  assert.match(vocab.description, /2 words still to repair/);
  assert.equal(vocab.target.type, 'cards', 'and the card leads to the review deck');
});

test('the weekly plan is sized from the learner\'s own practice', async () => {
  const { generateWeeklyPlan } = await loadLib();
  const plan = generateWeeklyPlan({
    ...emptyState,
    recentAverageMinutes: 12,
    minutesByWeekday: [30, 0, 0, 0, 0, 0, 0],
  });
  assert.equal(plan[0].targetMinutes, 30, 'Monday follows the learner\'s own Monday');
  assert.equal(plan[3].targetMinutes, 12, 'a day with no pattern falls back to their average');
  assert.ok(plan[0].maxTargetMinutes >= plan[0].targetMinutes);

  const noHistory = generateWeeklyPlan(emptyState);
  assert.equal(noHistory[0].targetMinutes, 20, 'with no history the plan starts at the app\'s own session length');
  assert.equal(
    noHistory[0].targetMinutes, noHistory[6].targetMinutes,
    'the plan does not pretend to know a pattern it has not seen',
  );
});

test('the plan never asks for more than an hour a day', async () => {
  const { generateWeeklyPlan } = await loadLib();
  const plan = generateWeeklyPlan({
    ...emptyState,
    recentAverageMinutes: 240,
    minutesByWeekday: [240, 240, 240, 240, 240, 240, 240],
    momentum: 2,
  });
  for (const day of plan) {
    assert.ok(day.targetMinutes <= 60, `a day asked for ${day.targetMinutes} minutes`);
  }
});

test('the state builder reads the learner\'s own record', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?s-${Date.now()}`);
  const { buildStudyState } = await import(`../src/lib/studyAssistantState.js?b-${Date.now()}`);

  // An empty device has no record to advise on.
  const empty = buildStudyState();
  assert.equal(empty.hasEvidence, false);
  assert.equal(empty.weeklyXP, 0);
  assert.equal(empty.streakCount, 0);
  assert.equal(empty.lastActivity, null);
  assert.deepEqual(empty.lowAccuracyWords, []);
  assert.equal(empty.weakestArea, null);

  // Now the learner does something and the builder sees it.
  storage.addStudyTime(600); // 10 minutes today
  const after = buildStudyState();
  assert.equal(after.hasEvidence, true, 'ten minutes of practice is evidence');
  assert.ok(after.recentAverageMinutes >= 10, 'the builder counts the minutes actually studied');
});

test('the hour pattern counts real moments, not days practised', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?s2-${Date.now()}`);
  const { buildStudyState } = await import(`../src/lib/studyAssistantState.js?b2-${Date.now()}`);

  // Three study days, all logged as seconds (no hour in the time log).
  for (let i = 0; i < 3; i += 1) storage.addStudyTime(300);

  const state = buildStudyState();
  assert.equal(state.hasEvidence, true);
  // The time log has no hour in it, so it cannot claim to be a pattern.
  assert.equal(state.activitySample, 0, 'three days of time logged is not an hour pattern');
  assert.deepEqual(state.activityByHour, {}, 'and no hour is invented from it');
});

test('a sound the learner keeps missing produces a pronunciation card', async () => {
  const { generateAIRecommendations } = await loadLib();
  assert.equal(
    generateAIRecommendations(emptyState).find((r) => r.target?.type === 'speaking'), undefined,
    'no pronunciation attempts, no pronunciation card',
  );
  // The shape recordPhonemeAttempt writes: one bucket per content language.
  globalThis.localStorage.setItem('fp.phonemeProfile', JSON.stringify({
    byLang: { fr: { r: { attempts: 4, correct: 1, misses: 3, avgConf: 0.4, lastAt: null, weak: true } } },
  }));
  const card = generateAIRecommendations(emptyState).find((r) => r.target?.type === 'speaking');
  assert.ok(card, 'the weak uvular r reaches the panel');
  assert.match(card.description, /1 sound contrast needs practice/);
});
