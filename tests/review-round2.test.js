// Round two of the review pass. Same rule as the first: each test names the
// behaviour that was wrong, so it fails with a description of what the learner
// would have lost or been misled about.

import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers/memory-storage.js';

function freshStorage(tag) {
  globalThis.localStorage = memoryStorage();
  return import(`./helpers/fullStorage.js`).then((m) => m.importFullStorage(tag));
}

// ── the AI allowance belongs to the key it spends ─────────────────────────

test('each household member gets their own daily AI allowance', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const core = await import(`../src/lib/storageCore.js?q=${stamp}`);
  const storage = await import(`../src/lib/storage.js?q=${stamp}`);
  const quota = await import(`../src/lib/quota.js?q=${stamp}`);

  const a = storage.addHouseholdMember('First');
  const b = storage.addHouseholdMember('Second');

  storage.switchHouseholdMember(a.id);
  for (let i = 0; i < 5; i += 1) quota.consume();
  assert.equal(quota.getQuota().count, 5, "the first learner's calls are counted");

  // The counter used to live at a bare `fp.quota`, outside KEYS, so it was one
  // shared counter per device: the second member started on the first member's
  // already-spent allowance, even though each has their own BYOK key.
  storage.switchHouseholdMember(b.id);
  assert.equal(quota.getQuota().count, 0, "the second learner starts with their own allowance");
  quota.consume();
  assert.equal(quota.getQuota().count, 1);

  storage.switchHouseholdMember(a.id);
  assert.equal(quota.getQuota().count, 5, "and the first learner's count is intact");

  // It must also be excluded from a backup: today's AI spend is device state.
  // (The claims registry still names the key, recording which member owns
  // which key — it never holds a value.)
  const exported = storage.exportProgress();
  assert.ok(
    !Object.values(exported.learners || {}).some((e) => core.KEYS.quota in (e || {})),
    'no learner namespace carries the allowance counter',
  );
  assert.ok(!(core.KEYS.quota in (exported.data || {})), 'and neither does the flat payload');
});

test('remove() deletes a device-level key even when a household member is active', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const core = await import(`../src/lib/storageCore.js?r=${stamp}`);
  const storage = await import(`../src/lib/storage.js?r=${stamp}`);

  const member = storage.addHouseholdMember('First');
  storage.switchHouseholdMember(member.id);

  // `read`/`write` route ONLY learner-owned keys, so this one always lives at
  // its flat path. `remove` namespaced it anyway and deleted
  // fp.learner.<id>.fp.quota.v1 — a key that was never written — leaving the
  // real value in place, so "clear my AI allowance" silently did nothing.
  core.write(core.KEYS.quota, { day: '2026-01-01', count: 3, limit: 80 });
  core.remove(core.KEYS.quota);
  assert.equal(core.read(core.KEYS.quota, null), null, 'the real value is gone');
});

// ── a full quota must be visible, not a silent data loss ──────────────────

test('losing a write raises a quota-loss notice', async () => {
  // A device that is genuinely full: setItem throws, and every prunable key is
  // already too short to halve, so the write really is lost. The first version
  // of this test used a store that always succeeded, so nothing was ever lost
  // and the flag correctly never tripped.
  const store = new Map();
  const ls = {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    setItem(k, v) {
      const e = new Error('quota');
      e.name = 'QuotaExceededError';
      throw e;
    },
  };
  globalThis.localStorage = ls;
  const stamp = `${Date.now()}-${Math.random()}`;
  const core = await import(`../src/lib/storageCore.js?sf=${stamp}`);

  assert.equal(core.storageFullWarning(), false, 'nothing is wrong yet');
  let seen = 0;
  const off = core.onStorageFull(() => { seen += 1; });

  const landed = core.write(core.KEYS.metrics, [{ big: true }]);
  assert.equal(landed, false, 'the write reports that it did not land');
  assert.equal(core.storageFullWarning(), true, 'the loss is recorded');
  assert.equal(seen, 1, 'and subscribers are told, so a notice can appear');
  off();
  core.write(core.KEYS.metrics, [{ again: true }]);
  assert.equal(seen, 1, 'the notice fires once, not on every later write');
});

// ── the French deck must not teach the same word as two cards ─────────────

test('a themed word carrying an indefinite article still matches its frequency twin', async () => {
  globalThis.fetch = async (input) => {
    const { readFile } = await import('node:fs/promises');
    return { ok: true, status: 200, text: async () => await readFile(new URL(String(input)), 'utf8') };
  };
  const { dropThemedDuplicates } = await import('../src/lib/vocab-frequency.js');

  const themed = [{ entries: [
    { fr: 'un bug', en: 'a bug / glitch' },
    { fr: 'une douzaine', en: 'a dozen' },
    { fr: 'pouvoir', en: 'to be able to' },
    // A multi-word phrase. The indefinite article is only stripped when a
    // SINGLE word follows, so "un petit peu" is left alone — stripping it
    // would reduce the phrase to "peu" and delete an unrelated card.
    { fr: 'un petit peu', en: 'a little bit' },
  ] }];
  const freq = [{ entries: [
    { fr: 'bug', en: 'bug' },
    { fr: 'douzaine', en: 'dozen' },
    { fr: 'pouvoir', en: 'to be able to' },
    { fr: 'petit peu', en: 'a little' },
    { fr: 'bien', en: 'well' },
  ] }];

  const kept = dropThemedDuplicates(themed, freq, 'fr').flatMap((p) => p.entries);
  assert.deepEqual(kept.map((e) => e.fr), ['petit peu', 'bien'], 'only genuinely new words survive');
});
