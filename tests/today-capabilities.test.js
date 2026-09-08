import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  conceptToTopicId, authoredDrillFor, probeCapabilities,
  drillChain, nextFallback, resolvePlanCapabilities, DRILL_FALLBACK_ORDER,
} from '../src/lib/todayCapabilities.js';
import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';

test('fallback order matches the product spec', () => {
  assert.deepEqual(DRILL_FALLBACK_ORDER,
    ['ai-drill', 'authored-drill', 'retype', 'srs-retrieval', 'listen', 'review']);
});

test('concept strings resolve to library topics, including aliases and free text', () => {
  assert.equal(conceptToTopicId('passe-compose'), 'passe-compose');
  assert.equal(conceptToTopicId('futur-simple'), 'futur-conditionnel', 'alias resolves');
  assert.equal(conceptToTopicId('passé composé'), 'passe-compose', 'accented free text');
  assert.equal(conceptToTopicId('something-never-authored'), null);
  assert.equal(conceptToTopicId(''), null);
});

test('authored drill only exists where the library really has questions', () => {
  const hit = authoredDrillFor('passe-compose');
  assert.ok(hit);
  assert.ok(hit.exercises.length >= 1);
  assert.ok(hit.exercises.every((e) => e.q && Array.isArray(e.options)));
  assert.equal(authoredDrillFor('something-never-authored'), null);
});

test('probe capabilities gate on environment, not wishes', () => {
  const caps = probeCapabilities({
    hasAi: false, hasScenario: true, concept: 'passe-compose',
    pendingRetypes: 0, srsDue: 0, listeningTrack: null, recentCorrections: 0,
  });
  assert.equal(caps['ai-drill'], false, 'no AI → no AI drill');
  assert.equal(caps['authored-drill'], true, 'library is always available');
  assert.equal(caps['speak'], true);
  const caps2 = probeCapabilities({ hasAi: true, concept: 'passe-compose', hasScenario: false });
  assert.equal(caps2['ai-drill'], true);
  assert.equal(caps2['speak'], false);
});

test('drill chain follows the spec order and every link knows its fallbacks', () => {
  const caps = probeCapabilities({
    hasAi: true, concept: 'passe-compose', hasScenario: true,
    pendingRetypes: 2, srsDue: 8,
    listeningTrack: { id: 't1', title: 'News' },
    recentCorrections: 3,
  });
  const chain = drillChain(caps);
  assert.deepEqual(chain.map((p) => p.kind),
    ['ai-drill', 'authored-drill', 'retype', 'srs-retrieval', 'listen', 'review']);
  assert.deepEqual(chain[0].fallbacks,
    ['authored-drill', 'retype', 'srs-retrieval', 'listen', 'review']);
  assert.equal(chain[0].concept, 'passe-compose');
  assert.deepEqual(chain[chain.length - 1].fallbacks, []);
});

test('nextFallback walks the chain at runtime', () => {
  const caps = probeCapabilities({ hasAi: true, concept: 'passe-compose' });
  const chain = drillChain(caps);
  assert.equal(nextFallback(chain, 'ai-drill').kind, 'authored-drill');
  assert.equal(nextFallback(chain, 'authored-drill'), null);
  assert.equal(nextFallback(chain, 'nonexistent'), null);
});

const fullPlan = () => buildDailyCurriculum({
  minutes: 20, srsDue: 10,
  topMistake: { id: 'mg-1', concept: 'passe-compose', type: 'tense', mastery: 30, recurrence: 3 },
  pendingRetypes: 2, recentCorrections: 2,
  suggestedScenarioId: 'cafe',
  listeningTrack: { id: 't1', title: 'Track', audioSrc: null },
  dayIndex: 3,
});

test('a fully capable plan keeps every segment and sums to the budget', () => {
  const caps = probeCapabilities({
    hasAi: true, concept: 'passe-compose', hasScenario: true,
    pendingRetypes: 2, srsDue: 10, recentCorrections: 2,
    listeningTrack: { id: 't1', title: 'Track' },
  });
  const plan = resolvePlanCapabilities(fullPlan(), caps);
  assert.deepEqual(plan.segments.map((s) => s.id), ['speak', 'retrieve', 'drill', 'review']);
  assert.equal(plan.totalMinutes, 20);
  const drill = plan.segments.find((s) => s.id === 'drill');
  assert.equal(drill.payload.kind, 'ai-drill');
  assert.equal(drill.payload.chain[0].kind, 'ai-drill');
  assert.equal(drill.payload.chain[1].kind, 'authored-drill');
});

test('listen survives when it can run (speak absent, minutes remain)', () => {
  // No scenario → the curriculum hands speak's minutes to listen.
  const plan0 = buildDailyCurriculum({
    minutes: 30, srsDue: 10,
    topMistake: { id: 'mg-1', concept: 'passe-compose', type: 'tense', mastery: 30, recurrence: 2 },
    recentCorrections: 3,
    listeningTrack: { id: 't1', title: 'Track' },
  });
  assert.ok(plan0.segments.some((s) => s.id === 'listen'), 'fixture sanity: listen present without speak');
  const caps = probeCapabilities({
    hasAi: true, concept: 'passe-compose', hasScenario: false,
    srsDue: 10, recentCorrections: 3, listeningTrack: { id: 't1', title: 'Track' },
  });
  const plan = resolvePlanCapabilities(plan0, caps);
  assert.ok(plan.segments.some((s) => s.id === 'listen'), 'listen survives when it can run');
  const drill = plan.segments.find((s) => s.id === 'drill');
  assert.ok(drill.payload.chain.some((p) => p.kind === 'listen'));
});

test('offline session: no AI, no scenario → speak becomes the authored drill, plan stays complete', () => {
  const caps = probeCapabilities({
    hasAi: false, concept: 'passe-compose', hasScenario: false,
    pendingRetypes: 0, srsDue: 10, recentCorrections: 2, listeningTrack: { id: 't1', title: 'T' },
  });
  const plan = resolvePlanCapabilities(fullPlan(), caps);
  const ids = plan.segments.map((s) => s.id);
  assert.ok(!ids.includes('speak'), 'speak without a scenario is dropped, not shown broken');
  const drill = plan.segments.find((s) => s.id === 'drill');
  assert.equal(drill.payload.kind, 'authored-drill', 'fallback picks the authored drill');
  assert.equal(plan.totalMinutes, 20, 'minutes re-flow; the session stays complete');
  assert.ok(plan.skipped.includes('speak'));
});

test('no AI and no authored match falls through to retype', () => {
  const caps = probeCapabilities({ hasAi: false, concept: 'unknown-concept', pendingRetypes: 1 });
  const chain = drillChain(caps);
  assert.deepEqual(chain.map((p) => p.kind), ['retype']);
});

test('nothing available → SRS retrieval, then listen fallback; empty state stays runnable', () => {
  const caps = probeCapabilities({ hasAi: false, concept: 'unknown', pendingRetypes: 0, srsDue: 5 });
  let chain = drillChain(caps);
  assert.deepEqual(chain.map((p) => p.kind), ['srs-retrieval']);
  const caps2 = probeCapabilities({
    hasAi: false, concept: 'unknown', pendingRetypes: 0, srsDue: 0,
    listeningTrack: { id: 't1', title: 'T' },
  });
  chain = drillChain(caps2);
  assert.deepEqual(chain.map((p) => p.kind), ['listen']);
  // A bare plan with only an unreachable speak segment collapses to the chain.
  const bare = { totalMinutes: 20, segments: [{ id: 'speak', label: 'Speak', minutes: 20, payload: { scenarioId: 'x' }, why: 'w' }], skipped: [] };
  const plan = resolvePlanCapabilities(bare, probeCapabilities({}));
  assert.ok(plan.segments.length === 0 || plan.segments.every((s) => s.payload), 'no unreachable segments');
});

test('listen segment without a track is dropped and minutes re-flow', () => {
  // No scenario → the curriculum hands speak's minutes to listen.
  const withListen = buildDailyCurriculum({
    minutes: 30, srsDue: 10,
    topMistake: { id: 'mg-1', concept: 'passe-compose', type: 'tense', mastery: 30, recurrence: 3 },
    recentCorrections: 3,
    listeningTrack: { id: 't1', title: 'Track' },
    dayIndex: 3,
  });
  assert.ok(withListen.segments.some((s) => s.id === 'listen'), 'fixture sanity');
  const caps = probeCapabilities({
    hasAi: true, concept: 'passe-compose', hasScenario: false, srsDue: 10,
    listeningTrack: null, recentCorrections: 3,
  });
  const plan = resolvePlanCapabilities(withListen, caps);
  assert.ok(!plan.segments.some((s) => s.id === 'listen'));
  assert.equal(plan.totalMinutes, 30, 'minutes re-flow; the session stays complete');
  const biggest = plan.segments.reduce((a, b) => ((b.minutes || 0) > (a.minutes || 0) ? b : a));
  assert.ok(biggest.minutes > 8, 'spare minutes re-flow into the biggest segment');
});
