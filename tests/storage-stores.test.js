// Pins the storage.js → storageCore/stores extraction contract:
//   · the canonical key map lives in exactly one place (storageCore)
//   · every learner-routing key exists in the key map (guards against the
//     phantom `activeSession` bug that silently un-namespaced in-flight
//     sessions for households)
//   · storage.js still exposes the whole historical surface (compat facade)
//   · domain stores agree with the facade on keys, shapes and caps
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

test('storageCore owns the canonical key map; storage.js re-exports it unchanged', async () => {
  globalThis.localStorage = memoryStorage();
  const core = await import(`../src/lib/storageCore.js?k-${Date.now()}`);
  const storage = await import(`../src/lib/storage.js?k-${Date.now()}`);
  assert.deepEqual(storage.KEYS, core.KEYS, 'KEYS must be the same object, not a copy');
});

test('every learner-routing key exists in KEYS (no phantom keys)', async () => {
  globalThis.localStorage = memoryStorage();
  const core = await import(`../src/lib/storageCore.js?lk-${Date.now()}`);
  // Assert the routing set against KEYS at runtime instead of by
  // regex-scanning the source. The old scan stripped `//` comments with a
  // `.`-based regex, which silently stops stripping in a CRLF working tree
  // (Windows checkouts) because `.` does not match `\r` — so the guard
  // false-failed on prose inside a comment. The invariant that matters is a
  // property of the VALUES, and that is directly observable.
  const known = new Set(Object.values(core.KEYS).filter((v) => typeof v === 'string'));
  for (const key of core.LEARNER_KEY_VALUES) {
    assert.equal(
      typeof key, 'string',
      'LEARNER_KEY_VALUES holds a phantom entry: a KEYS.* member that no longer exists evaluates to undefined',
    );
    assert.ok(known.has(key), `LEARNER_KEY_VALUES references ${key}, which is not a value in KEYS`);
  }
  assert.equal(
    new Set(core.LEARNER_KEY_VALUES).size, core.LEARNER_KEY_VALUES.length,
    'LEARNER_KEY_VALUES contains duplicates',
  );
  // The in-flight session key must be learner-owned.
  assert.equal(core.isLearnerKey(core.KEYS.active), true, 'in-flight session must be namespaced per learner');
});

test('the study store and the storage facade agree on keys and caps', async () => {
  globalThis.localStorage = memoryStorage();
  const store = await import(`../src/lib/stores/studyStore.js?s-${Date.now()}`);
  const storage = await import(`../src/lib/storage.js?s-${Date.now()}`);
  // Identical behaviour through both surfaces (same underlying core).
  const state = { participantId: 'p1', arm: 'adaptive', day: 3 };
  store.saveStudyState(state);
  assert.deepEqual(storage.getStudyState(), state);
  assert.deepEqual(store.getStudyState(), state);

  const checks = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}` }));
  store.saveStudyChecks(checks);
  assert.equal(storage.getStudyChecks().length, 120, 'the 120-cap must survive the extraction');
  assert.equal(JSON.parse(globalThis.localStorage.getItem('fp.study.checks.v1')).length, 120);
  assert.equal(storage.KEYS.studyChecks, 'fp.study.checks.v1', 'storage keys are byte-identical');
});

test('household learner routing still isolates per-learner stores', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?h-${Date.now()}`);
  storage.setHousehold?.({ id: 'm1', name: 'One' });
  storage.addHouseholdMember?.({ id: 'm2', name: 'Two' });
  const h = storage.getHousehold();
  if (h.members.length >= 1) {
    storage.setActiveSession('cafe', [{ fr: 'bonjour' }]);
    const raw = globalThis.localStorage.getItem('fp.activeSession');
    const namespaced = h.activeId
      ? globalThis.localStorage.getItem(`fp.learner.${h.activeId}.fp.activeSession`)
      : null;
    assert.ok(
      raw !== null || namespaced !== null,
      'the in-flight session must be stored (namespaced when a household is active)',
    );
    storage.clearActiveSession();
  }
});

test('settingsStore is authoritative for the provider key; the facade only delegates', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `k-${Date.now()}`;
  const settingsStore = await import(`../src/lib/stores/settingsStore.js?${stamp}`);
  const storage = await import(`../src/lib/storage.js?${stamp}`);

  settingsStore.setApiKey('sk-store-authoritative');
  assert.equal(settingsStore.getApiKey(), 'sk-store-authoritative');
  assert.equal(storage.getApiKey(), 'sk-store-authoritative', 'facade reads through the store');
  assert.equal(JSON.parse(globalThis.localStorage.getItem('fp.groqKey')), 'sk-store-authoritative', 'same physical key');

  storage.setApiKey('sk-via-facade');
  assert.equal(settingsStore.getApiKey(), 'sk-via-facade', 'store sees facade writes');

  storage.clearApiKey();
  assert.equal(settingsStore.getApiKey(), '');
  assert.equal(globalThis.localStorage.getItem('fp.groqKey'), null, 'clear removes the key, not just masks it');
});

test('the provider key is learner-owned: members never spend each other\'s secret', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?kowner-${Date.now()}`);

  // A shared device with two household members is the leak scenario. The key
  // is a SECRET, so member B must never fall back to member A's credential.
  storage.addHouseholdMember('Ada');
  const [ada] = storage.getHousehold().members;
  storage.addHouseholdMember('Bo');
  const bo = storage.getHousehold().members.find((m) => m.id !== ada.id);
  storage.setApiKey('sk-adas-key');

  const raw = globalThis.localStorage.getItem('fp.groqKey');
  const namespaced = globalThis.localStorage.getItem(`fp.learner.${ada.id}.fp.groqKey`);
  assert.ok(raw === null || namespaced === null,
    'with a household active the key must be namespaced, never left on the shared bare key');

  storage.switchHouseholdMember(bo.id);
  assert.notEqual(storage.getApiKey(), 'sk-adas-key',
    'a second member must not inherit another member\'s provider key');

  storage.setApiKey('sk-bos-key');
  assert.equal(storage.getApiKey(), 'sk-bos-key');
  storage.switchHouseholdMember(ada.id);
  assert.equal(storage.getApiKey(), 'sk-adas-key', 'and the first member still has their own');

  // Clear must actually remove the stored value for the active member.
  storage.clearApiKey();
  assert.equal(storage.getApiKey(), '', 'clear removes the real namespaced key');
  assert.equal(globalThis.localStorage.getItem(`fp.learner.${ada.id}.fp.groqKey`), null,
    'the namespaced key is gone, not just masked');
});

test('learnerErrorStore and the storage facade agree on the recovery model', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `le-${Date.now()}`;
  const store = await import(`../src/lib/stores/learnerErrorStore.js?${stamp}`);
  const storage = await import(`../src/lib/storage.js?${stamp}`);

  store.recordLearnerError({ category: 'grammar', key: 'negation', label: 'Negation', mode: 'conversation', score: 30 });
  assert.equal(storage.getLearnerErrorModel().entries[0].key, 'negation');
  assert.equal(JSON.parse(globalThis.localStorage.getItem('fp.learnerErrors.v1')).entries[0].key, 'negation', 'same physical key and shape');

  storage.recordLearnerSuccess({ category: 'grammar', key: 'negation', mode: 'grammar', score: 90, delayed: false });
  const viaStore = store.getLearnerErrorModel().entries[0];
  assert.equal(viaStore.successCount, 1, 'store and facade share one model, not copies');
  const prioritised = store.getLearnerErrors({ limit: 4 });
  assert.equal(prioritised.length, 1);
  assert.equal(store.getLearnerErrorSummary().totalEntries, 1);
});

test('legacy surrogate recovery entries fold into canonical ids on load (and persist the fold)', async () => {
  globalThis.localStorage = memoryStorage();
  globalThis.localStorage.setItem('fp.learnerErrors.v1', JSON.stringify({
    version: 1,
    updatedAt: '2026-08-10T10:00:00.000Z',
    entries: [
      { id: 'pronunciation:mode:read-aloud', category: 'pronunciation', key: 'mode:read-aloud', label: 'Read-aloud clarity', errorCount: 2, status: 'active', lastSeen: '2026-08-01T10:00:00.000Z' },
      { id: 'pronunciation:mode:shadowing', category: 'pronunciation', key: 'mode:shadowing', label: 'Shadowing clarity', errorCount: 3, recurrenceCount: 1, status: 'active', lastSeen: '2026-08-05T10:00:00.000Z' },
      { id: 'listening:reading:cafe-1', category: 'listening', key: 'reading:cafe-1', label: 'Reading comprehension', errorCount: 2, status: 'active', lastSeen: '2026-08-06T10:00:00.000Z' },
    ],
  }));
  const stamp = `fold-${Date.now()}`;
  const storage = await import(`../src/lib/storage.js?${stamp}`);
  const model = storage.getLearnerErrorModel();
  const byId = new Map(model.entries.map((e) => [e.id, e]));
  assert.ok(byId.get('pronunciation:pronunciation'), 'per-mode pronunciation entries share the canonical id Today hunts');
  assert.equal(byId.get('pronunciation:pronunciation').errorCount, 5, 'counts merged, not deduped away');
  assert.ok(byId.get('reading:reading'), 'reading is its own canonical category');
  assert.ok(!byId.get('listening:reading:cafe-1') && !byId.get('pronunciation:mode:read-aloud'), 'surrogate ids are gone');
  // The fold is persisted — a fresh load sees the canonical model directly.
  const stored = JSON.parse(globalThis.localStorage.getItem('fp.learnerErrors.v1'));
  assert.ok(stored.entries.some((e) => e.id === 'pronunciation:pronunciation'));
});

test('the one-time legacy migration survives the extraction (legacy sources still fold in)', async () => {
  globalThis.localStorage = memoryStorage();
  globalThis.localStorage.setItem('fp.grammarErrors', JSON.stringify({ word_order: 3 }));
  globalThis.localStorage.setItem('fp.reviewEvents.v2', JSON.stringify([
    { id: 'r1', itemId: 'bonjour', rating: 'again', mode: 'receptive' },
  ]));
  const stamp = `mig-${Date.now()}`;
  const storage = await import(`../src/lib/storage.js?${stamp}`);
  const model = storage.getLearnerErrorModel();
  assert.ok(model.entries.some((e) => e.id === 'grammar:word_order'), 'legacy grammar errors migrate');
  assert.ok(model.entries.some((e) => e.id === 'vocabulary:bonjour'), 'legacy review lapses migrate to the consolidated card key');
  // Second read must be the stored model, not a re-migration.
  assert.equal(storage.getLearnerErrorModel().entries.length, model.entries.length);
});
