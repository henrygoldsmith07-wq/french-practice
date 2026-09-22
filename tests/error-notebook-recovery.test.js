import assert from 'node:assert/strict';
import { test } from 'node:test';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (i) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  };
}

async function freshNotebook() {
  globalThis.localStorage = memoryStorage();
  return import(`../src/lib/errorNotebook.js?notebook-${Date.now()}-${Math.random()}`);
}

test('a recurring notebook mistake reopens the correction loop', async () => {
  const notebook = await freshNotebook();
  const t0 = Date.parse('2026-09-01T09:00:00Z');

  let list = notebook.addErrorNotebook({
    original: 'Je aller au parc.',
    corrected: 'Je vais au parc.',
    why: 'Conjugate aller.',
    ruleId: 'present-aller',
  });
  const id = list[0].id;

  assert.equal(notebook.markCorrectedByLearner(id, 'Je vais au parc.', t0), 'rehearsed');
  assert.equal(
    notebook.markCorrectedByLearner(id, 'Je vais au parc.', t0 + notebook.REHEARSE_GAP_MS + 1),
    'retired',
  );
  assert.equal(notebook.getErrorNotebook()[0].correctedByLearner, true);

  list = notebook.addErrorNotebook({
    original: 'Je aller au parc.',
    corrected: 'Je vais au parc.',
    why: 'Conjugate aller.',
    ruleId: 'present-aller',
  });
  assert.equal(list[0].recurrence, 1);
  assert.equal(list[0].correctedByLearner, false, 'recurrence must require repair again');
  assert.equal(list[0].rehearsedAt, null, 'old delayed-proof timestamp cannot shortcut the new recurrence');
});

test('retype eligibility matches the 24-hour delayed-proof gate', async () => {
  const notebook = await freshNotebook();
  const t0 = Date.parse('2026-09-20T09:00:00Z');
  const entries = [
    { id: 'fresh', correctedByLearner: false },
    { id: 'rehearsed-recently', correctedByLearner: false, rehearsedAt: t0 },
    { id: 'legacy-iso-recent', correctedByLearner: false, rehearsedAt: new Date(t0).toISOString() },
    { id: 'rehearsed-yesterday', correctedByLearner: false, rehearsedAt: t0 - notebook.REHEARSE_GAP_MS - 1 },
    { id: 'retired', correctedByLearner: true, rehearsedAt: t0 - 2 * notebook.REHEARSE_GAP_MS },
  ];
  assert.deepEqual(
    notebook.selectDueRetypes(entries, t0).map((entry) => entry.id),
    ['fresh', 'rehearsed-yesterday'],
  );
});

test('legacy ISO rehearsal timestamps can still retire after the delay', async () => {
  const notebook = await freshNotebook();
  const now = Date.parse('2026-09-22T12:00:00Z');
  const seeded = notebook.addErrorNotebook({
    original: 'Je aller au parc.',
    corrected: 'Je vais au parc.',
    why: 'Conjugate aller.',
  });
  const id = seeded[0].id;
  const rows = notebook.getErrorNotebook();
  rows[0].rehearsedAt = new Date(now - notebook.REHEARSE_GAP_MS - 1000).toISOString();
  // Persist through the public first pass: this keeps the fixture at the same
  // storage boundary as a restored legacy backup.
  localStorage.setItem('fp.errorNotebook', JSON.stringify(rows));

  assert.equal(
    notebook.markCorrectedByLearner(id, 'Je vais au parc.', now),
    'retired',
    'an ISO rehearsal timestamp proves the delayed interval correctly',
  );
  const retired = notebook.getErrorNotebook()[0];
  assert.equal(retired.correctedByLearner, true);
  assert.equal(retired.rehearsedAt, now, 'retirement normalises the timestamp to numeric epoch ms');
});

test('corrected errors are selected by repair activity, not original creation time', async () => {
  const notebook = await freshNotebook();
  const old = '2026-08-01T09:00:00Z';
  const recent = '2026-09-22T12:00:00Z';
  const middle = '2026-09-21T12:00:00Z';

  const entries = [
    { id: 'old-created-repaired-now', correctedByLearner: true, at: old, rehearsedAt: recent },
    { id: 'created-yesterday', correctedByLearner: true, at: middle },
    { id: 'stale', correctedByLearner: true, at: old },
    { id: 'pending', correctedByLearner: false, at: recent },
  ];

  const selected = notebook.selectCorrectedErrors(entries, {
    since: Date.parse('2026-09-20T00:00:00Z'),
    limit: 5,
  });
  assert.deepEqual(selected.map((entry) => entry.id), [
    'old-created-repaired-now',
    'created-yesterday',
  ]);
});
