import assert from 'node:assert/strict';
import { test } from 'node:test';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('a vocabulary lapse enters the model; two clean recalls resolve it; one does not', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?loop-test-${Date.now()}`);

  // Lapse: the card joins the model as an active vocabulary gap.
  storage.rateCard('livre', 'again', { itemLabel: 'livre', source: 'test' });
  let gap = storage.getLearnerErrors({ limit: 50 }).find((e) => e.id === 'vocabulary:item:livre');
  assert.ok(gap, 'a lapse must produce a vocabulary gap');
  assert.equal(gap.status, 'active');

  // First clean recall: improving, NOT resolved — one answer never grants mastery.
  storage.rateCard('livre', 'good', { itemLabel: 'livre', source: 'test' });
  gap = storage.getLearnerErrors({ limit: 50 }).find((e) => e.id === 'vocabulary:item:livre');
  assert.equal(gap.status, 'recovering');
  assert.equal(gap.successCount, 1);

  // Second clean recall: resolved (prioritise filters resolved by default —
  // assert through the raw model).
  storage.rateCard('livre', 'good', { itemLabel: 'livre', source: 'test' });
  const model = storage.getLearnerErrorModel();
  gap = model.entries.find((e) => e.id === 'vocabulary:item:livre');
  assert.equal(gap.status, 'resolved');

  // A healthy card that never lapsed never fabricates an entry.
  storage.rateCard('maison', 'good', { itemLabel: 'maison', source: 'test' });
  assert.equal(storage.getLearnerErrors({ limit: 50 }).some((e) => e.id === 'vocabulary:item:maison'), false);
});

test('a productive-mode lapse tracks its own gap key', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?loop-test-${Date.now()}`);
  storage.rateCard('livre', 'again', { itemLabel: 'livre', mode: 'productive', source: 'test' });
  assert.ok(storage.getLearnerErrors({ limit: 50 }).some((e) => e.id === 'vocabulary:item:livre::productive'));
});
