// A paid streak freeze must be spent by real practice, not by opening the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers/memory-storage.js';

globalThis.localStorage = memoryStorage();
const stamp = `${Date.now()}-freeze`;
const storage = await import(`../src/lib/storage.js?${stamp}`);

const dayStamp = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

test('reading the streak never spends a freeze', () => {
  globalThis.localStorage.setItem(storage.KEYS.streak, JSON.stringify({ count: 7, lastDay: dayStamp(-2) }));
  globalThis.localStorage.setItem(storage.KEYS.freezes, '1');

  for (let i = 0; i < 5; i += 1) {
    const s = storage.getStreak();
    assert.equal(s.count, 7, 'the protected streak is still shown');
    assert.ok(s.frozeYesterday, 'the protection is projected, not applied');
    assert.equal(storage.getFreezes(), 1, 'a passive read must not spend the freeze');
  }
  // The stored streak is untouched by all those reads.
  assert.equal(JSON.parse(globalThis.localStorage.getItem(storage.KEYS.streak)).lastDay, dayStamp(-2));
});

test('a freeze is spent exactly once when a real session is saved', () => {
  globalThis.localStorage.setItem(storage.KEYS.streak, JSON.stringify({ count: 7, lastDay: dayStamp(-2) }));
  globalThis.localStorage.setItem(storage.KEYS.freezes, '1');

  storage.saveSession({ scenarioId: 'x', turns: 2 });
  assert.equal(storage.getFreezes(), 0, 'practice spent the freeze');
  const s = storage.getStreak();
  assert.equal(s.count, 8, 'the streak continued through the missed day');
  assert.equal(s.lastDay, dayStamp(0));
  assert.ok(!s.frozeYesterday, 'the flag is cleared once the freeze is used');
});
