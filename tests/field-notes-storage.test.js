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

test('field notes persist, emit study evidence, and travel in backups', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?field-note-storage=${Date.now()}`);
  const created = storage.saveFieldNote({
    id: 'storage-note',
    french: 'Je vous en prie.',
    meaning: 'You’re welcome.',
    context: 'street',
    source: 'bakery',
  }, Date.parse('2026-08-27T09:00:00.000Z'));

  assert.equal(created.added, true);
  assert.equal(storage.getFieldNotes()[0].id, 'storage-note');
  assert.ok(storage.getStudyEvents().some((event) => event.type === 'field-note.capture'));

  const practised = storage.practiceFieldNote('storage-note', { mode: 'rehearse' }, Date.parse('2026-08-28T09:00:00.000Z'));
  assert.equal(practised.stage, 1);
  assert.ok(storage.getStudyEvents().some((event) => event.type === 'field-note.practice'));
  assert.ok(storage.exportProgress().data[storage.KEYS.fieldNotes]);

  storage.removeFieldNote('storage-note');
  assert.equal(storage.getFieldNotes().length, 0);
});
