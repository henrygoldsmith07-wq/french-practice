// Every writer of fp.reviewEvents must respect the same cap. An unbounded
// writer forces localStorage quota pruning that drops half the learner's
// history at once instead of keeping the newest events.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers/memory-storage.js';

globalThis.localStorage = memoryStorage();
const stamp = `${Date.now()}-review-cap`;
const storage = await import(`../src/lib/storage.js?${stamp}`);

test('recordReviewEvent keeps only the newest events at the shared cap', () => {
  const cap = 2000;
  for (let i = 0; i < cap + 25; i += 1) {
    storage.recordReviewEvent({ mode: 'grammar', itemId: `item-${i}`, reviewedAt: new Date(Date.now() + i).toISOString() });
  }
  const events = storage.getReviewEvents();
  assert.equal(events.length, cap, `expected the ${cap}-event cap`);
  assert.equal(events[events.length - 1].itemId, `item-${cap + 24}`, 'the newest event survives');
  assert.equal(events[0].itemId, 'item-25', 'only the oldest events were dropped');
});
