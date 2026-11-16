// A relay response without quota headers must not zero the local allowance:
// Number(null) is 0, which used to look like a real server limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers/memory-storage.js';

globalThis.localStorage = memoryStorage();
const stamp = `${Date.now()}-quota-headers`;
const quota = await import(`../src/lib/quota.js?${stamp}`);
const { KEYS } = await import(`../src/lib/storage.js?${stamp}`);

const headers = (values) => ({ get: (name) => values[name.toLowerCase()] ?? null });

test('missing quota headers leave the allowance untouched', () => {
  localStorage.setItem(KEYS.quota, JSON.stringify({ day: new Date().toISOString().slice(0, 10), count: 3, limit: 80 }));
  quota.syncFromHeaders(headers({}));
  assert.deepEqual(quota.getQuota().limit, 80);
  assert.equal(quota.getQuota().count, 3);
});

test('empty header values are not treated as a zero quota', () => {
  localStorage.setItem(KEYS.quota, JSON.stringify({ day: new Date().toISOString().slice(0, 10), count: 3, limit: 80 }));
  quota.syncFromHeaders(headers({ 'x-ratelimit-limit': '', 'x-ratelimit-remaining': '' }));
  assert.equal(quota.getQuota().limit, 80);
});

test('real headers are still applied and clamped', () => {
  localStorage.setItem(KEYS.quota, JSON.stringify({ day: new Date().toISOString().slice(0, 10), count: 0, limit: 80 }));
  quota.syncFromHeaders(headers({ 'x-ratelimit-limit': '30', 'x-ratelimit-remaining': '27' }));
  assert.equal(quota.getQuota().limit, 30);
  assert.equal(quota.getQuota().count, 3);

  // A broken remaining value must not poison the count, but the new limit
  // from the server is still real.
  quota.syncFromHeaders(headers({ 'x-ratelimit-limit': '30', 'x-ratelimit-remaining': 'nonsense' }));
  assert.equal(quota.getQuota().limit, 30);
  assert.equal(quota.getQuota().count, 3);
});
