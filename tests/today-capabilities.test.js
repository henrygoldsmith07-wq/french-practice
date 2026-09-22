import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  conceptToTopicId, authoredDrillFor, probeCapabilities,
  drillChain, nextFallback, resolvePlanCapabilities, DRILL_FALLBACK_ORDER,
  trainerDrillFor, buildDrillSlot, dictationDrillFor, accentDrillFor,
} from '../src/lib/todayCapabilities.js';
import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';
// The grammar topic index is a lazy chunk now (boot-size), so node tests
// bootstrap it explicitly and await readiness before capability assertions.
import { ensureGrammarTopics, grammarTopicsReady } from '../src/lib/todayCapabilities.js';
const __topicsReady = ensureGrammarTopics();
test('grammar topic index is loaded for capability matching', async () => {
  await __topicsReady;
  assert.ok(grammarTopicsReady(), 'topic index injected');
});

test('fallback order matches the product spec', () => {
  assert.deepEqual(DRILL_FALLBACK_ORDER,
    ['conj-drill', 'dictation-drill', 'accent-drill', 'ai-drill', 'authored-drill', 'retype', 'srs-retrieval', 'listen', 'review']);
});

test('trainer-gap concepts get a conj-drill link; ordinary concepts do not', () => {
  // The trainer gap concept shape: "conjugating <verb> (<tense>)".
  assert.deepEqual(trainerDrillFor('conjugating parler (present)'), { verb: 'parler', tense: 'present', personIndex: null });
  assert.deepEqual(trainerDrillFor('conjugating parler (present · je)'), { verb: 'parler', tense: 'present', personIndex: 0 }, 'the exact missed cell parses too');
  assert.equal(trainerDrillFor('passe-compose'), null, 'ordinary grammar concepts never get a trainer link');
  // Gating is by concept shape: an unknown verb still parses (the focused
  // pool just comes back empty and the session segment ends gracefully).
  assert.deepEqual(trainerDrillFor('conjugating nonsense (present)'), { verb: 'nonsense', tense: 'present', personIndex: null });
  assert.equal(trainerDrillFor(''), null);

  const caps = probeCapabilities({ hasAi: true, concept: 'conjugating finir (passe)', hasScenario: true });
  const chain = drillChain(caps);
  assert.deepEqual(chain.map((p) => p.kind), ['conj-drill', 'ai-drill'], 'the focused trainer leads; the generic AI drill falls back');
  assert.equal(chain[0].verb, 'finir');
  assert.equal(chain[0].tense, 'passe');
  assert.deepEqual(chain[0].fallbacks, ['ai-drill']);

  const offline = probeCapabilities({ hasAi: false, concept: 'conjugating finir (passe)' });
  assert.deepEqual(drillChain(offline).map((p) => p.kind), ['conj-drill'], 'the trainer link works fully offline');
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
  assert.deepEqual(plan.segments.map((s) => s.id), ['speak', 'retrieve', 'drill', 'review', 'listen']);
  assert.equal(plan.totalMinutes, 20);
  const drill = plan.segments.find((s) => s.id === 'drill');
  assert.equal(drill.payload.kind, 'ai-drill');
  assert.equal(drill.payload.chain[0].kind, 'ai-drill');
  assert.equal(drill.payload.chain[1].kind, 'authored-drill');
});

test('listen survives capability resolution when it can run', () => {
  const plan0 = buildDailyCurriculum({
    minutes: 30, srsDue: 10,
    topMistake: { id: 'mg-1', concept: 'passe-compose', type: 'tense', mastery: 30, recurrence: 2 },
    recentCorrections: 3,
    listeningTrack: { id: 't1', title: 'Track' },
  });
  assert.ok(plan0.segments.some((s) => s.id === 'listen'), 'fixture sanity: listen is a first-class segment');
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
// ---- the drill-slot producer registry --------------------------------------

test('registry: the trainer gap owns the slot even against a hot mistake-graph node', () => {
  // The pre-registry bug: applyCalibration's overdueBy×weight sort demoted
  // the zero-overdue trainer gap below ANY real graph node. The producer
  // order in the registry fixes that by construction.
  const ctx = {
    balanced: false,
    calibration: { ready: false, weights: {} },
    trainerGap: { id: 'le-1', concept: 'conjugating parler (present · je)', type: 'grammar', mastery: 0, recurrence: 2, source: 'learner-errors' },
    dueRetestCandidates: [
      { id: 'mg-9', concept: 'passe-compose', type: 'tense', mastery: 10, recurrence: 5, overdueBy: 7.5 },
      { id: 'mg-2', concept: 'negation', type: 'grammar', mastery: 40, recurrence: 1, overdueBy: 2.0 },
    ],
  };
  const slot = buildDrillSlot(ctx);
  assert.equal(slot.producer, 'learner-errors', 'the trainer-gap producer wins by registry order, not by accident');
  assert.equal(slot.top.id, 'le-1');
  assert.equal(slot.candidates.length, 3, 'the graph nodes still join the frozen candidate list');
  assert.ok(slot.candidates.every((c) => c.source), 'every frozen candidate names its producer');
});

test('registry: balanced arm strips every learner-specific producer', () => {
  const ctx = {
    balanced: true,
    calibration: { ready: false, weights: {} },
    trainerGap: { id: 'le-1', concept: 'conjugating parler (present)', type: 'grammar', mastery: 0, recurrence: 2 },
    dueRetestCandidates: [
      { id: 'mg-9', concept: 'passe-compose', type: 'tense', mastery: 10, recurrence: 5, overdueBy: 7.5 },
    ],
  };
  const slot = buildDrillSlot(ctx);
  assert.equal(slot.producer, null, 'no producer fires in the control arm');
  assert.deepEqual(slot.candidates, [], 'the frozen candidate list is empty — nothing learner-specific leaks into the trial');
  assert.equal(slot.top, null);
});

test('registry: mistake-graph producer keeps the urgency order and applies calibration within the producer', () => {
  // ready:true weights must reorder WITHIN the producer's list, never across
  // producers (producer order is the priority contract).
  const ctx = {
    balanced: false,
    calibration: { ready: true, weights: { tense: 1.1, grammar: 0.9 } },
    trainerGap: null,
    dueRetestCandidates: [
      { id: 'mg-a', concept: 'negation', type: 'grammar', mastery: 0, recurrence: 9, overdueBy: 0.5 },
      { id: 'mg-b', concept: 'passe-compose', type: 'tense', mastery: 0, recurrence: 1, overdueBy: 1 },
    ],
  };
  const slot = buildDrillSlot(ctx);
  assert.equal(slot.producer, 'mistake-graph');
  assert.deepEqual(slot.candidates.map((c) => c.id), ['mg-b', 'mg-a'],
    'weighted overdueBy reorders within the producer (1×1.1 beats 0.5×0.9)');
  assert.equal(slot.top.id, 'mg-b');
});test('registry: a producer that throws or returns nothing is skipped, not fatal', () => {
  // buildDrillSlot wraps each producer build in try/catch — verify via the
  // real registry with a context that yields nothing.
  const slot = buildDrillSlot({ balanced: false, trainerGap: null, dueRetestCandidates: [] });
  assert.equal(slot.producer, null);
  assert.deepEqual(slot.candidates, []);
  assert.equal(slot.top, null);
  // And the empty slot is a valid balanced-arm state too.
  const balancedEmpty = buildDrillSlot({ balanced: true, trainerGap: { id: 'x' }, dueRetestCandidates: [{ id: 'y' }] });
  assert.deepEqual(balancedEmpty.candidates, []);
});

test('dictée and pronunciation gaps get their own focused offline drills', () => {
  assert.deepEqual(dictationDrillFor('Dictée listening accuracy'), { kind: 'dictation-drill' });
  assert.deepEqual(dictationDrillFor('dictation'), { kind: 'dictation-drill' }, 'activity-record fallback label matches too');
  assert.deepEqual(accentDrillFor('Pronunciation clarity'), { kind: 'accent-drill' });
  // Cross-category: a dictée concept never gets an accent drill and vice versa.
  assert.equal(dictationDrillFor('Pronunciation clarity'), null);
  assert.equal(accentDrillFor('Dictée listening accuracy'), null);
  // Ordinary grammar concepts match neither — no accidental topic collisions.
  assert.equal(dictationDrillFor('passe-compose'), null);
  assert.equal(accentDrillFor('passe-compose'), null);
  assert.equal(dictationDrillFor(''), null);

  const caps = probeCapabilities({ hasAi: true, concept: 'Dictée listening accuracy', hasScenario: true });
  const chain = drillChain(caps);
  assert.deepEqual(chain.map((p) => p.kind), ['dictation-drill', 'ai-drill'],
    'the focused dictation drill leads; the generic AI drill is its fallback');
  assert.deepEqual(chain[0].fallbacks, ['ai-drill'], 'no authored topic matches a dictée gap');

  const prCaps = probeCapabilities({ hasAi: true, concept: 'Pronunciation clarity' });
  assert.deepEqual(drillChain(prCaps).map((p) => p.kind), ['accent-drill', 'ai-drill']);

  const offline = probeCapabilities({ hasAi: false, concept: 'Dictée listening accuracy' });
  assert.deepEqual(drillChain(offline).map((p) => p.kind), ['dictation-drill'], 'fully offline repair');
});

test('registry: learner-errors-generic producer owns the slot below the trainer gap', () => {
  const dictationGap = { id: 'le-d', concept: 'Dictée listening accuracy', type: 'listening', mastery: 0, recurrence: 2 };
  const pronunciationGap = { id: 'le-p', concept: 'Pronunciation clarity', type: 'pronunciation', mastery: 0, recurrence: 1 };
  const graphNode = { id: 'mg-1', concept: 'passe-compose', type: 'grammar', mastery: 40, recurrence: 5, overdueBy: 96 };

  // A dictée gap beats a hot (overdue) mistake-graph node: an exact-form
  // repair exists and mastery is zero.
  const slot = buildDrillSlot({ dictationGap, dueRetestCandidates: [graphNode] });
  assert.equal(slot.producer, 'learner-errors-generic');
  assert.equal(slot.top.id, 'le-d');
  assert.ok(slot.candidates.some((c) => c.id === 'mg-1'), 'graph candidates still join the frozen list for the P1 join');

  // Pronunciation only fires when dictation has no gap.
  const prSlot = buildDrillSlot({ pronunciationGap, dueRetestCandidates: [graphNode] });
  assert.equal(prSlot.producer, 'learner-errors-generic');
  assert.equal(prSlot.top.id, 'le-p');

  // And the trainer gap outranks both — its producer is first.
  const conjSlot = buildDrillSlot({
    trainerGap: { id: 'le-c', concept: 'conjugating parler (present)', type: 'grammar', mastery: 0, recurrence: 3 },
    dictationGap,
    dueRetestCandidates: [graphNode],
  });
  assert.equal(conjSlot.producer, 'learner-errors');
  assert.equal(conjSlot.top.id, 'le-c');

  // Study validity: the balanced arm strips the generic producer exactly like
  // the trainer-gap producer.
  const balanced = buildDrillSlot({ balanced: true, dictationGap, pronunciationGap, dueRetestCandidates: [graphNode] });
  assert.equal(balanced.producer, null);
  assert.deepEqual(balanced.candidates, []);
});
