// The writing history the Writing Coach analysed is learner-owned state.
//
// It used to be a raw component-level localStorage key (`writing_history`)
// written directly by AIWritingCoach.jsx, outside the storage boundary: no
// learner namespacing and no export. Moving it behind storageCore only
// becomes what the writingStore comment promises if the key joins
// LEARNER_KEY_VALUES — which it initially did not, leaving every member of a
// household sharing one history. This test pins the behaviours the comment
// claims: per-member history, the history travelling in exportProgress(),
// and the 20-entry cap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryStorage } from './helpers/memory-storage.js';

test('writing history is learner-namespaced and travels in exportProgress()', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-writing`;
  const storage = await import(`../src/lib/storage.js?${stamp}`);
  const { getWritingHistory, saveWritingHistory } = await import(`../src/lib/stores/writingStore.js?${stamp}`);
  const { KEYS } = storage;

  // No household yet: the history is saved and readable at the flat path.
  saveWritingHistory([{ exerciseId: 'e1', text: 'Bonjour.', score: 88 }]);
  assert.deepEqual(getWritingHistory(), [{ exerciseId: 'e1', text: 'Bonjour.', score: 88 }]);

  // The first household member claims the pre-household history, then writes
  // their own; a second member starts from an empty history.
  const a = storage.addHouseholdMember('First');
  storage.switchHouseholdMember(a.id);
  assert.equal(getWritingHistory().length, 1, 'the claimed history stays reachable');
  saveWritingHistory([{ exerciseId: 'e2', text: 'Je voudrais un café.', score: 71 }]);

  const b = storage.addHouseholdMember('Second');
  storage.switchHouseholdMember(b.id);
  assert.deepEqual(getWritingHistory(), [], 'a new member does not inherit the first member’s samples');
  saveWritingHistory([{ exerciseId: 'e3', text: 'Merci beaucoup.', score: 64 }]);

  // Each member's history lives under their own namespace…
  const aHistory = storage.readLearnerValue(a.id, KEYS.writingHistory, null);
  const bHistory = storage.readLearnerValue(b.id, KEYS.writingHistory, null);
  assert.equal(aHistory[0].exerciseId, 'e2');
  assert.equal(bHistory[0].exerciseId, 'e3');

  // …and exportProgress() carries both, like every other progress key.
  // Learner namespaces export as raw JSON strings per key (exportProgress()
  // copies localStorage values verbatim).
  const exported = storage.exportProgress();
  const aStored = JSON.parse((exported.learners[a.id] || {})[KEYS.writingHistory] || 'null');
  const bStored = JSON.parse((exported.learners[b.id] || {})[KEYS.writingHistory] || 'null');
  assert.ok(Array.isArray(aStored) && aStored.some((e) => e.exerciseId === 'e2'),
    'member A’s history travels in the export');
  assert.ok(Array.isArray(bStored) && bStored.some((e) => e.exerciseId === 'e3'),
    'member B’s history travels in the export');
});

test('saveWritingHistory caps the history at the same 20 entries the coach always kept', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-cap`;
  const { getWritingHistory, saveWritingHistory } = await import(`../src/lib/stores/writingStore.js?${stamp}`);
  // The coach prepends the newest entry at the head of the array
  // (`[newEntry, ...writingHistory]`), so the store keeps the head and only
  // enforces the 20-entry ceiling — the same slice the coach has always
  // applied before handing the array over.
  const entries = Array.from({ length: 25 }, (_, i) => ({ exerciseId: `e${i}`, text: `text ${i}`, score: i }));
  saveWritingHistory(entries);
  const stored = getWritingHistory();
  assert.equal(stored.length, 20);
  assert.deepEqual(stored, entries.slice(0, 20), 'the 20 newest entries (array head) survive the cap');
});
