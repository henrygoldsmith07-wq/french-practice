import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getPracticeAssignment, setPracticeAssignment, balancedDrillTopic, VARIANTS } from '../src/lib/assignment.js';
import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

function withStorage(fn) {
  const prev = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  try { return fn(); } finally { globalThis.localStorage = prev; }
}

// ── P0.3: assignment must be deterministic per learner ─────────────────────
// getPracticeAssignment must derive a stable variant from the learner's sync
// id — not collapse to a single default for every install.

test('P0.3: assignment is deterministic for the same sync id', () => {
  withStorage(() => {
    const a1 = getPracticeAssignment('ls-learner-alpha');
    const a2 = getPracticeAssignment('ls-learner-alpha');
    assert.equal(a1, a2, 'same learner must always get the same variant');
    assert.ok(VARIANTS.includes(a1));
  });
});

test('P0.3: distinct sync ids can diverge (not a single global default)', () => {
  withStorage(() => {
    // Hash enough ids that a single hard-coded default would be exposed.
    const seen = new Set();
    for (let i = 0; i < 40; i += 1) {
      globalThis.localStorage.clear();
      seen.add(getPracticeAssignment(`ls-learner-${i}`));
    }
    assert.ok(seen.size > 1, 'all learners collapsing to one variant means the sync id is ignored');
  });
});

test('P0.3: explicit override beats the derived variant', () => {
  withStorage(() => {
    setPracticeAssignment('balanced');
    assert.equal(getPracticeAssignment('ls-anything'), 'balanced');
    setPracticeAssignment('adaptive');
    assert.equal(getPracticeAssignment('ls-anything'), 'adaptive');
    assert.equal(setPracticeAssignment('nonsense'), null, 'invalid variant rejected');
  });
});

// ── P0.4: balanced arm must not be contaminated by learner-specific state ──
// In the balanced variant the mistake graph / weakness / recent corrections
// are stripped so the control arm has the same burden without targeting.

const contaminated = {
  minutes: 20,
  srsDue: 10,
  topMistake: { id: 'mg-1', concept: 'passe-compose', label: 'passé composé', type: 'tense', mastery: 30, recurrence: 4 },
  recentCorrections: 3,
  weaknessScenarioId: 'cafe',
  suggestedScenarioId: 'market',
  balancedDrillTopic: 'articles',
};

test('P0.4: balanced arm never drills the learner-specific top mistake', () => {
  const plan = buildDailyCurriculum({ ...contaminated, balanced: true });
  const drill = plan.segments.find((s) => s.id === 'drill');
  assert.ok(drill, 'balanced arm still has a drill segment (rotation)');
  // It must be the generic rotation topic, NOT the learner's topMistake.
  assert.equal(drill.payload.concept, 'articles');
  assert.equal(drill.payload.mistakeId, undefined, 'no learner mistake id leaks into the balanced drill');
  assert.match(drill.why, /Balanced rotation/);
});

test('P0.4: balanced arm has no weakness-targeted speak reason and no recent-correction review', () => {
  const plan = buildDailyCurriculum({ ...contaminated, balanced: true });
  const speak = plan.segments.find((s) => s.id === 'speak');
  assert.ok(speak);
  assert.doesNotMatch(speak.why, /slipped on/, 'balanced speak must not claim to retest a slip');
  assert.equal(plan.segments.some((s) => s.id === 'review'), false, 'balanced arm strips recent-correction review');
});

test('P0.4: adaptive arm DOES use the learner-specific mistake (control for the test)', () => {
  const plan = buildDailyCurriculum({ ...contaminated, balanced: false });
  const drill = plan.segments.find((s) => s.id === 'drill');
  assert.equal(drill.payload.mistakeId, 'mg-1', 'adaptive arm targets the real top mistake');
  const review = plan.segments.find((s) => s.id === 'review');
  assert.ok(review, 'adaptive arm keeps the recent-correction review');
});

test('P0.4: balanced and adaptive keep identical total minutes (burden parity)', () => {
  const a = buildDailyCurriculum({ ...contaminated, balanced: true });
  const b = buildDailyCurriculum({ ...contaminated, balanced: false });
  assert.equal(a.totalMinutes, b.totalMinutes, 'both arms spend the same time budget');
});

// ── balancedDrillTopic rotation sanity ──────────────────────────────────────
test('balancedDrillTopic rotates through the topic list and wraps', () => {
  const topics = new Set();
  for (let d = 0; d < 8; d += 1) topics.add(balancedDrillTopic(d));
  assert.ok(topics.size > 1, 'rotation must vary by day');
  assert.equal(balancedDrillTopic(0), balancedDrillTopic(8), 'rotation wraps after a full cycle');
});
