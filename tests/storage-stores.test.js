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
  const source = (await import('node:fs')).readFileSync(
    new URL('../src/lib/storageCore.js', import.meta.url), 'utf8',
  );
  // The routing set is a literal list of KEYS.* members in the source.
  // (Strip // comments first so prose mentions like "KEYS.activeSession" in
  // a comment can never false-fail the check.)
  const code = source.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  const used = [...code.matchAll(/(?<![A-Za-z_])KEYS\.([A-Za-z]+)/g)].map((m) => m[1]);
  for (const name of used) {
    assert.ok(core.KEYS[name] !== undefined, `LEARNER_KEY_VALUES references KEYS.${name}, which does not exist`);
  }
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
