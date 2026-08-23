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

test('a fresh install reports honest zeros across every study stream', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?study-zero-${Date.now()}`);
  const p = storage.getStudyProgress();
  assert.equal(p.totalN, 0);
  assert.ok(p.totalTarget >= 1000);
  for (const row of p.rows) {
    assert.equal(row.n, 0, `${row.key} must ship empty`);
    assert.equal(row.met, false);
  }
});

test('bundle export → ingest round-trips entries and skips duplicates', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?study-roundtrip-${Date.now()}`);

  // Seed one of each stream through the genuine record paths.
  storage.recordPlacementValidation({ knownLevel: 'B1', placedLevel: 'B1', theta: 0.2, se: 0.4, itemsAsked: 12, rater: 'M. Leroy' });
  storage.recordCorpusEntry({ id: 'sp-1', mode: 'speaking', prompt: 'Au café', response: 'Je voudrais un café', aiScore: 70 });
  storage.recordComprehensionValidation({ skill: 'listening', itemId: 't1', aiScore: 80, humanScore: 78 });

  const bundle = storage.buildValidationBundle();
  assert.equal(bundle.format, 'le-studio.validation-study');
  assert.equal(bundle.stores.placementValidations.length, 1);
  assert.equal(bundle.stores.writingSpeakingCorpus.length, 1);
  assert.equal(bundle.stores.comprehensionValidations.length, 1);

  // Dry run against the still-seeded store: everything is a known duplicate,
  // so nothing would be added and nothing is written.
  const dry = storage.ingestValidationBundle(bundle, { dryRun: true });
  assert.equal(dry.ok, true);
  assert.equal(dry.added.placementValidations, 0);
  assert.equal(dry.skipped, 3);
  assert.equal(storage.getPlacementValidations().length, 1, 'dry run must not write');

  // Wipe, then import into the empty store.
  for (const key of ['fp.placementValidations.v1', 'fp.writingSpeakingCorpus.v1', 'fp.comprehensionValidations.v1']) {
    globalThis.localStorage.removeItem(key);
  }
  const report = storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(report.ok, true);
  assert.equal(report.added.placementValidations, 1);
  assert.equal(report.added.writingSpeakingCorpus, 1);
  assert.equal(report.added.comprehensionValidations, 1);
  assert.equal(storage.getStudyProgress().totalN, 3);

  // Re-import: every entry carries an id, so all three are skipped.
  const again = storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(again.added.placementValidations, 0);
  assert.equal(again.skipped, 3);
});

test('ingest rejects foreign bundles and schema-invalid entries', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?study-reject-${Date.now()}`);

  const bad = storage.ingestValidationBundle({ format: 'something-else', stores: {} });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /Not a Le Studio validation bundle/);

  const broken = storage.ingestValidationBundle('{not json');
  assert.equal(broken.ok, false);
  assert.match(broken.errors[0], /Not valid JSON/);

  const report = storage.ingestValidationBundle({
    format: 'le-studio.validation-study',
    version: 1,
    stores: {
      placementValidations: [
        { knownLevel: 'B1', placedLevel: 'B1', theta: 0.1, se: 0.4, itemsAsked: 10 }, // valid
        { knownLevel: 'Z9', placedLevel: 'B1', theta: 0.1, se: 0.4, itemsAsked: 10 }, // invalid level
        'not an object',
      ],
    },
  });
  assert.equal(report.added.placementValidations, 1);
  assert.equal(report.errors.length, 2);
  assert.equal(storage.getPlacementValidations().length, 1);
});

test('progress counts double-marked and per-skill streams correctly', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?study-counts-${Date.now()}`);
  const entry = storage.recordCorpusEntry({ id: 'w-1', mode: 'writing', prompt: 'P', response: 'R', aiScore: 60 });
  storage.updateCorpusHumanMark(entry.id, { humanScore: 62, rater: 'A' });
  storage.updateCorpusSecondMark(entry.id, { humanScore2: 64, rater2: 'B' });

  const p = storage.getStudyProgress();
  const writing = p.rows.find((r) => r.key === 'writingCorpus');
  const doubleMarked = p.rows.find((r) => r.key === 'writingDoubleMarked');
  assert.equal(writing.n, 1);
  assert.equal(doubleMarked.n, 1);
});
