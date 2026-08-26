import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  recordMistake, recordRetest, dueRetests, weakestMistakes,
  mistakeId, isAsrUncertain, typeForCategory,
} from '../src/lib/mistakeGraph.js';
import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T09:00:00Z');

function fresh() { return []; }

// ── the longitudinal script ────────────────────────────────────────────────

test('day 1: repeated error X is one node with rising recurrence', () => {
  let g = fresh();
  const mk = (attempt) => recordMistake(g, {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt, corrected: 'Hier je suis allé au cinéma',
    confidence: 0.8, at: new Date(T0).toISOString(),
  });
  g = mk('Hier je vais au cinéma');
  g = recordMistake(g, {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'Hier je vais au marché', corrected: 'Hier je suis allé au marché',
    confidence: 0.8, at: new Date(T0 + 3600000).toISOString(),
  });
  g = mk('Hier je vais au parc');
  assert.equal(g.length, 1, 'same concept+type merges into one node');
  assert.equal(g[0].recurrence, 3);
  assert.equal(g[0].mastery, 10);
  assert.equal(g[0].status, 'active');
});

test('day 1: immediate retry after seeing the correction proves nothing', () => {
  let g = recordMistake(fresh(), {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'Hier je vais', corrected: 'Hier je suis allé', confidence: 0.8,
    at: new Date(T0).toISOString(),
  });
  const id = g[0].id;
  // Learner hits "Redo" seconds later and says it right.
  g = recordRetest(g, { id, at: new Date(T0 + 120000).toISOString(), correct: true, immediate: true });
  assert.equal(g[0].mastery, 10, 'mastery must not rise on an immediate retry');
});

test('day 2 retest: partial success moves mastery partway', () => {
  let g = recordMistake(fresh(), {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'Hier je vais', corrected: 'Hier je suis allé', confidence: 0.8,
    at: new Date(T0).toISOString(),
  });
  const id = g[0].id;
  // Day 2, one hour apart: wrong first (rehearsal-class drop), then a
  // correct retry 25h after the mistake itself — genuinely DELAYED.
  g = recordRetest(g, { id, at: new Date(T0 + DAY).toISOString(), correct: false, context: 'drill' });
  assert.equal(g[0].mastery, 0, 'wrong retest drops mastery');
  g = recordRetest(g, { id, at: new Date(T0 + DAY + 3600000).toISOString(), correct: true, context: 'drill' });
  assert.equal(g[0].mastery, 35, 'delayed success 25h after the mistake counts fully');
  assert.equal(g[0].retests[1].evidenceClass, 'DELAYED_NEW_CONTEXT');
});

test('day 5 new-context success, then spontaneous conversation: mastery rises to retirement', () => {
  let g = recordMistake(fresh(), {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'Hier je vais', corrected: 'Hier je suis allé', confidence: 0.8,
    at: new Date(T0).toISOString(),
  });
  const id = g[0].id;
  // Day 2: drill retest, correct.
  g = recordRetest(g, { id, at: new Date(T0 + 1 * DAY).toISOString(), correct: true, context: 'drill' });
  // Day 5: different context (reading), correct.
  g = recordRetest(g, { id, at: new Date(T0 + 4 * DAY).toISOString(), correct: true, context: 'reading' });
  assert.ok(g[0].mastery >= 80, `mastery ${g[0].mastery}`);
  // Later spontaneous conversation uses it correctly — retirement.
  g = recordRetest(g, { id, at: new Date(T0 + 6 * DAY).toISOString(), correct: true, context: 'conversation' });
  assert.equal(g[0].status, 'retired');
  assert.equal(g[0].mastery, 100);
  assert.ok(!dueRetests(g, T0 + 7 * DAY).some((m) => m.id === id), 'retired nodes leave the due queue');
});

test('a recurring mistake after retirement reactivates at half mastery', () => {
  let g = recordMistake(fresh(), {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'x', corrected: 'y', confidence: 0.8, at: new Date(T0).toISOString(),
  });
  const id = g[0].id;
  g = recordRetest(g, { id, at: new Date(T0 + DAY).toISOString(), correct: true, context: 'drill' });
  g = recordRetest(g, { id, at: new Date(T0 + 3 * DAY).toISOString(), correct: true, context: 'reading' });
  g = recordRetest(g, { id, at: new Date(T0 + 5 * DAY).toISOString(), correct: true, context: 'conversation' });
  assert.equal(g[0].status, 'retired');
  // Weeks later the same slip resurfaces in real speech.
  g = recordMistake(g, {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'x', corrected: 'y', confidence: 0.8, at: new Date(T0 + 30 * DAY).toISOString(),
  });
  assert.equal(g[0].status, 'active');
  assert.ok(g[0].mastery <= 50, `reactivated at half mastery, got ${g[0].mastery}`);
  assert.equal(g[0].recurrence, 2);
});

// ── ASR uncertainty ────────────────────────────────────────────────────────

test('ASR uncertainty: empty or near-empty recognition of clear speech', () => {
  assert.equal(isAsrUncertain({ heardWords: 0, targetWords: 8, voicedRatio: 0.7 }), true);
  assert.equal(isAsrUncertain({ heardWords: 1, targetWords: 8, voicedRatio: 0.7 }), true);
  assert.equal(isAsrUncertain({ heardWords: 6, targetWords: 8, voicedRatio: 0.7 }), false);
  // No voicing information: fall back to recognition alone.
  assert.equal(isAsrUncertain({ heardWords: 1, targetWords: 8 }), true);
});

test('low-confidence mistakes are tracked but flagged uncertain', () => {
  let g = recordMistake(fresh(), {
    type: 'pronunciation', concept: 'u-ou', source: 'read-aloud',
    attempt: 'Une rue', corrected: null, confidence: 0.3,
    asrUncertain: true, at: new Date(T0).toISOString(),
  });
  assert.equal(g[0].asrUncertain, true);
  assert.equal(dueRetests(g).length, 0, 'uncertain nodes never enter the retest queue');
  assert.equal(weakestMistakes(g).length, 0, 'uncertain nodes never drive drills');
});

// ── taxonomy mapping ───────────────────────────────────────────────────────

test('taxonomy categories map to mistake types', () => {
  assert.equal(typeForCategory('tense'), 'tense');
  assert.equal(typeForCategory('agreement'), 'agreement');
  assert.equal(typeForCategory('word-order'), 'word-order');
  assert.equal(typeForCategory('liaison'), 'pronunciation');
  assert.equal(typeForCategory('vocab'), 'vocabulary');
  assert.equal(typeForCategory('unknown-thing'), 'grammar');
});

test('ids are stable per concept and distinct across concepts', () => {
  const a = mistakeId({ type: 'tense', concept: 'pc', attempt: 'Hier je vais' });
  const b = mistakeId({ type: 'tense', concept: 'pc', attempt: 'Hier je pars' });
  const c = mistakeId({ type: 'tense', concept: 'futur', attempt: 'Hier je vais' });
  // Attempts differ; the CONCEPT is the identity — they must merge.
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ── daily curriculum scheduler ─────────────────────────────────────────────

test('the 20-minute reference split balances retrieve/speak/drill/review', () => {
  const plan = buildDailyCurriculum({
    minutes: 20, srsDue: 12,
    topMistake: { id: 'mg-1', concept: 'passe-compose', label: 'passé composé', type: 'tense', mastery: 30, recurrence: 3 },
    pendingRetypes: 0, recentCorrections: 2,
    weaknessScenarioId: 'cafe', suggestedScenarioId: 'market',
  });
  assert.equal(plan.totalMinutes, 20);
  const byId = Object.fromEntries(plan.segments.map((s) => [s.id, s]));
  assert.equal(byId.speak.minutes, 7);
  assert.equal(byId.retrieve.minutes, 5);
  assert.equal(byId.drill.minutes, 5);
  assert.equal(byId.review.minutes, 3);
  // Every segment can explain itself.
  for (const s of plan.segments) assert.ok(s.why && s.why.length > 10, `${s.id} lacks a why`);
  // Weakness targeting wins over the rotation suggestion.
  assert.equal(byId.speak.payload.scenarioId, 'cafe');
  assert.match(byId.drill.why, /passe-compose/);
});

test('empty state collapses to speak-only without empty filler segments', () => {
  const plan = buildDailyCurriculum({ minutes: 20, suggestedScenarioId: 'cafe' });
  assert.deepEqual(plan.segments.map((s) => s.id), ['speak']);
  assert.equal(plan.segments[0].minutes, 20);
  assert.ok(plan.skipped.includes('retrieve'));
  assert.ok(plan.skipped.includes('drill'));
});

test('shorter and longer sessions keep the shape', () => {
  const short = buildDailyCurriculum({
    minutes: 10, srsDue: 4, topMistake: { id: 'm', concept: 'c', type: 'grammar', mastery: 40, recurrence: 1 },
    suggestedScenarioId: 'cafe',
  });
  assert.equal(short.totalMinutes, 10);
  assert.ok(short.segments.some((s) => s.id === 'speak'));
  const long = buildDailyCurriculum({
    minutes: 30, srsDue: 30,
    topMistake: { id: 'm', concept: 'c', type: 'grammar', mastery: 40, recurrence: 2 },
    recentCorrections: 3, suggestedScenarioId: 'cafe',
    listeningTrack: { id: 't1', title: 'Track' },
  });
  assert.equal(long.totalMinutes, 30);
  for (const id of ['speak', 'retrieve', 'drill', 'review']) {
    assert.ok(long.segments.some((s) => s.id === id), `${id} present in long session`);
  }
});

test('exam pressure routes speak through the exam-style note', () => {
  const plan = buildDailyCurriculum({
    minutes: 20, examSoon: true, suggestedScenarioId: 'cafe',
  });
  const speak = plan.segments.find((s) => s.id === 'speak');
  assert.match(speak.why, /Exam-style/);
});

test('retype-only repair state still produces a drill segment', () => {
  const plan = buildDailyCurriculum({
    minutes: 20, pendingRetypes: 2, suggestedScenarioId: 'cafe',
  });
  const drill = plan.segments.find((s) => s.id === 'drill');
  assert.ok(drill);
  assert.equal(drill.payload.kind, 'retype');
});
