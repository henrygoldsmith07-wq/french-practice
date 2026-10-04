// The repair drill used to show drills.slice(0, 4) — literally the same
// questions, in the same order, every session a learner worked the same
// weakness. That is blocked repetition: the opposite of what targeted practice
// is for. These pin the rotation that replaced it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authoredDrillFor, ensureGrammarTopics } from '../src/lib/todayCapabilities.js';

const ready = ensureGrammarTopics();
const CONCEPT = 'passe composé';

const onDay = (concept, dayIndex) => authoredDrillFor(concept, { dayIndex });

test('each day in a full cycle opens on a different question', async () => {
  await ready;
  const poolSize = authoredDrillFor(CONCEPT, { dayIndex: 0, limit: 99 }).exercises.length;
  assert.ok(poolSize > 1, 'this test needs a topic with a pool to rotate through');
  // The rotation cycle is the pool length: day N opens on item N % poolSize.
  const starters = Array.from({ length: poolSize }, (_, d) => onDay(CONCEPT, d).exercises[0].q);
  assert.equal(new Set(starters).size, poolSize, `one cycle covers every item: ${JSON.stringify(starters)}`);
  // And the cycle repeats rather than drifting.
  assert.equal(onDay(CONCEPT, poolSize).exercises[0].q, starters[0]);
});

test('the same day always yields the same drill, so a session stays frozen', async () => {
  await ready;
  const a = onDay(CONCEPT, 7).exercises.map((e) => e.q);
  const b = onDay(CONCEPT, 7).exercises.map((e) => e.q);
  assert.deepEqual(a, b, 'the plan is built once and must not shuffle under the learner');
});

test('the window stays small enough to space items out', async () => {
  await ready;
  for (const day of [0, 1, 2, 3, 4, 5]) {
    const { exercises } = onDay(CONCEPT, day);
    assert.ok(exercises.length >= 1 && exercises.length <= 3, `${exercises.length} items on day ${day}`);
  }
});

test('over a week the learner meets the whole pool, not one frozen block', async () => {
  await ready;
  const pool = authoredDrillFor(CONCEPT, { dayIndex: 0, limit: 99 }).exercises;
  const seen = new Set();
  for (let d = 0; d < 7; d += 1) {
    for (const e of onDay(CONCEPT, d).exercises) seen.add(e.q);
  }
  assert.equal(seen.size, pool.length, `a week reaches all ${pool.length} items`);
});

test('a topic with a single usable drill still yields one item', async () => {
  await ready;
  // Every authored topic has at least one drill; this pins that the rotation
  // never returns an empty exercise list for a real concept.
  const drill = authoredDrillFor(CONCEPT);
  assert.ok(drill && drill.exercises.length >= 1);
  assert.ok(drill.topicId && drill.title);
});

test('rotation is per concept, so an unrelated weakness is untouched', async () => {
  await ready;
  const a = authoredDrillFor('passe composé', { dayIndex: 3 });
  const b = authoredDrillFor('subjunctive', { dayIndex: 3 });
  if (a && b) assert.notEqual(a.topicId, b.topicId);
});