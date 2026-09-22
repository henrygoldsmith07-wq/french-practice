import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLearnerErrorModel,
  recordLearnerError,
  recordLearnerSuccess,
  prioritiseLearnerErrors,
  learnerErrorSummary,
  recoveryHistory,
  evidenceStrength,
  canonicaliseModel,
  LEARNER_ERROR_CATEGORIES,
} from '../src/lib/learnerErrors.js';

test('same-session success is weaker evidence: two DISTINCT encounters to resolve, one is only improving', () => {
  let model = createLearnerErrorModel();
  const at = (day, hour) => `2026-08-0${day}T1${hour}:00:00.000Z`;
  model = recordLearnerError(model, {
    category: 'grammar', key: 'articles', label: 'Articles & partitives',
    mode: 'conversation', score: 45, detail: 'Conversation classification',
  }, { at: at(1, 0) });
  // One clean pass IN THE SAME SESSION (same day, drill after the slip):
  // one correct answer must never imply mastery → recovering, not resolved.
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'articles', mode: 'targeted-drill', score: 82, delayed: false,
    sessionId: 'ses_a', encounterId: 'ses_a:enc1', activityId: 'drill-1',
  }, { at: at(1, 2) });
  let entry = model.entries[0];
  assert.equal(entry.status, 'recovering', 'a single same-session pass is only Improving');
  assert.equal(entry.lastEvidence, 'same-session');
  assert.equal(entry.cleanPasses, 1);
  assert.equal(entry.independentPasses, 1);

  // Re-answering the SAME drill (same encounter) adds no independent evidence.
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'articles', mode: 'grammar', score: 91, delayed: false,
    sessionId: 'ses_a', encounterId: 'ses_a:enc1', activityId: 'drill-1',
  }, { at: at(1, 3) });
  entry = model.entries[0];
  assert.equal(entry.status, 'recovering', 'the same encounter twice is still only one encounter');
  assert.equal(entry.independentPasses, 1, 'a repeated answer never increments independence');

  // A second clean pass from a DIFFERENT encounter resolves it.
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'articles', mode: 'grammar', score: 91, delayed: false,
    sessionId: 'ses_a', encounterId: 'ses_a:enc2', activityId: 'drill-2',
  }, { at: at(1, 4) });
  entry = model.entries[0];
  assert.equal(entry.status, 'resolved');
  assert.equal(entry.cleanPasses, 3);
  assert.equal(entry.independentPasses, 2);
});

test('identity-less same-session passes can extend improving but never resolve', () => {
  let model = createLearnerErrorModel();
  const at = (day, hour) => `2026-08-0${day}T1${hour}:00:00.000Z`;
  model = recordLearnerError(model, {
    category: 'grammar', key: 'verbs', label: 'Verb agreement', mode: 'conversation', score: 40,
  }, { at: at(1, 0) });
  // Unknown provenance (e.g. legacy evidence or a caller that cannot know the
  // encounter): real successes, but independence is unknown — never invented.
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'verbs', mode: 'targeted-drill', score: 80, delayed: false,
  }, { at: at(1, 2) });
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'verbs', mode: 'grammar', score: 90, delayed: false,
  }, { at: at(1, 3) });
  const entry = model.entries[0];
  assert.equal(entry.status, 'recovering', 'identity-less passes cannot prove independence');
  assert.equal(entry.independentPasses, 0);
  assert.equal(entry.successCount, 2, 'the successes are still counted, honestly');
  // A later delayed recall (structurally independent — a scheduled retest)
  // still resolves it: delayed evidence remains the strong path.
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'verbs', mode: 'weakness-retest', score: 92,
  }, { at: at(4, 0) });
  assert.equal(model.entries[0].status, 'resolved');
});

test('a delayed clean recall is strong evidence: it resolves on its own', () => {
  let model = createLearnerErrorModel();
  model = recordLearnerError(model, {
    category: 'grammar', key: 'negation', label: 'Negation', mode: 'conversation', score: 40,
  }, { at: '2026-08-01T10:00:00.000Z' });
  // Recalled cleanly the NEXT DAY (no answer on screen): the retention
  // evidence the loop asks for — resolved without a second same-session pass.
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'negation', mode: 'cards', score: 90,
  }, { at: '2026-08-03T10:00:00.000Z' });
  const entry = model.entries[0];
  assert.equal(entry.lastEvidence, 'delayed');
  assert.equal(entry.status, 'resolved', 'delayed recall is the strong evidence');
  assert.equal(entry.cleanPasses, 1);
});

test('evidence strength: spaced recalls are delayed, same-day drills are not', () => {
  const entry = { lastErrorAt: '2026-08-01T10:00:00.000Z' };
  // Scheduled weakness retests are spaced by design, whatever the calendar says.
  assert.equal(evidenceStrength({ mode: 'weakness-retest' }, entry), 'delayed');
  assert.equal(evidenceStrength({ mode: 'targeted-drill', delayed: true }, entry), 'delayed');
  assert.equal(evidenceStrength({ mode: 'targeted-drill', delayed: false }, entry), 'same-session');
  // SRS reviews are delayed because they happen LATER — a same-day re-rate
  // of a just-lapsed card is not real spacing, so dates must decide.
  assert.equal(evidenceStrength({ mode: 'cards', at: '2026-08-03T10:00:00.000Z' }, entry), 'delayed');
  assert.equal(evidenceStrength({ mode: 'cards', at: '2026-08-01T11:00:00.000Z' }, entry), 'same-session');
  assert.equal(evidenceStrength({ mode: 'retype', at: '2026-08-05T10:00:00.000Z' }, entry), 'delayed');
  // Inferred from dates for unlabeled modes too.
  assert.equal(evidenceStrength({ mode: 'grammar', at: '2026-08-02T10:00:00.000Z' }, entry), 'delayed');
  assert.equal(evidenceStrength({ mode: 'grammar', at: '2026-08-01T18:00:00.000Z' }, entry), 'same-session');
});

test('recurrence reactivates a resolved weakness and tallies itself', () => {
  // (Two DISTINCT encounters resolve, as above; the recurrence rules are
  // unchanged — see below.)
  let model = createLearnerErrorModel();
  model = recordLearnerError(model, {
    category: 'grammar', key: 'articles', label: 'Articles & partitives',
    mode: 'conversation', score: 45,
  }, { at: '2026-08-01T10:00:00.000Z' });
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'articles', mode: 'grammar', score: 82, delayed: false,
    sessionId: 'ses_a', encounterId: 'ses_a:enc1',
  }, { at: '2026-08-01T11:00:00.000Z' });
  model = recordLearnerSuccess(model, {
    category: 'grammar', key: 'articles', mode: 'grammar', score: 91, delayed: false,
    sessionId: 'ses_a', encounterId: 'ses_a:enc2',
  }, { at: '2026-08-01T12:00:00.000Z' });
  assert.equal(model.entries[0].status, 'resolved');

  // The weakness comes back in a later session → active again, counted.
  model = recordLearnerError(model, {
    category: 'grammar', key: 'articles', label: 'Articles & partitives',
    mode: 'writing', score: 55,
  }, { at: '2026-08-04T10:00:00.000Z' });
  const entry = model.entries[0];
  assert.equal(entry.status, 'active');
  assert.equal(entry.recurrenceCount, 1);
  assert.deepEqual(entry.modes, ['conversation', 'grammar', 'writing']);
  assert.equal(entry.cleanPasses, 0, 'the old clean passes cannot paper over a fresh slip');
  assert.equal(entry.independentPasses, 0, 'recurrence restarts recovery from zero');
  assert.deepEqual(entry.encounterKeys, [], 'the encounter tally restarts with the recovery');
});

test('error prioritisation and category summaries expose the reusable gap model', () => {
  let model = createLearnerErrorModel();
  model = recordLearnerError(model, { category: 'vocabulary', key: 'item:bonjour', label: 'bonjour', mode: 'cards', count: 3 }, { at: '2026-08-01T10:00:00.000Z' });
  model = recordLearnerError(model, { category: 'listening', key: 'dictation', label: 'Dictée', mode: 'dictation' }, { at: '2026-08-02T10:00:00.000Z' });
  model = recordLearnerError(model, { category: 'pronunciation', key: 'mode:pronunciation', label: 'Read-aloud clarity', mode: 'pronunciation' }, { at: '2026-08-03T10:00:00.000Z' });

  const prioritised = prioritiseLearnerErrors(model, { limit: 10 });
  assert.equal(prioritised[0].category, 'vocabulary');
  assert.deepEqual(new Set(prioritised.slice(1).map((entry) => entry.category)), new Set(['listening', 'pronunciation']));
  const summary = learnerErrorSummary(model);
  assert.equal(summary.totalEntries, 3);
  assert.equal(summary.totalErrors, 5);
  assert.equal(summary.byCategory.listening.active, 1);
  assert.equal(summary.byCategory.pronunciation.entries, 1);
});

test('recovery history is dated, human-readable and free of internal identifiers', () => {
  let model = createLearnerErrorModel();
  model = recordLearnerError(model, {
    category: 'vocabulary', key: 'item:chat', label: 'chat', mode: 'cards', score: 0,
  }, { at: '2026-08-01T10:00:00.000Z' });
  model = recordLearnerSuccess(model, {
    category: 'vocabulary', key: 'item:chat', mode: 'cards', score: 95,
  }, { at: '2026-08-05T10:00:00.000Z' });
  const history = recoveryHistory(model);
  assert.equal(history.length, 2);
  assert.equal(history[0].kind, 'success', 'newest first');
  assert.equal(history[0].label, 'chat');
  assert.equal(history[0].status, 'resolved');
  assert.ok(history[0].at.startsWith('2026-08-05'));
  const blob = JSON.stringify(history);
  assert.ok(!blob.includes('item:'), 'no storage keys or ids in learner-facing history');
  assert.ok(!blob.includes('fp.'), 'no storage keys in learner-facing history');
  // Mistake row explains itself without research vocabulary.
  const mistake = history.find((e) => e.kind === 'mistake');
  assert.ok(mistake.detail.length > 0);
  assert.ok(!/arm|calibration|variant|engine|P1|P2/i.test(mistake.detail));
});

test('every tracked skill has a canonical category; surrogate keys normalise, per-item keys survive', () => {
  // Reading/speaking/writing are first-class categories, not surrogates of
  // listening/grammar: a weakness surfaced there targets its own repair.
  for (const category of ['reading', 'speaking', 'writing']) {
    assert.ok(LEARNER_ERROR_CATEGORIES.includes(category));
    const model = recordLearnerError(createLearnerErrorModel(), {
      category, key: category, label: `${category} check`, mode: category, score: 40,
    }, { at: '2026-08-01T10:00:00.000Z' });
    assert.equal(model.entries[0].category, category, `${category} is not coerced to grammar`);
  }
  // Aggregate skills canonicalise their key so Today's drill producers can
  // hunt a stable id (a per-mode key could never match a producer).
  const pronunciation = recordLearnerError(createLearnerErrorModel(), {
    category: 'pronunciation', key: 'mode:shadowing', label: 'Shadowing clarity', mode: 'shadowing', score: 30,
  }, { at: '2026-08-01T10:00:00.000Z' });
  assert.equal(pronunciation.entries[0].id, 'pronunciation:pronunciation');
  // Per-item targeting keeps its own key: vocabulary items, grammar topics,
  // listening tracks and dictée are individually addressable.
  const item = recordLearnerError(createLearnerErrorModel(), {
    category: 'vocabulary', key: 'item:bonjour', label: 'bonjour', mode: 'cards', score: 0,
  }, { at: '2026-08-01T10:00:00.000Z' });
  assert.equal(item.entries[0].id, 'vocabulary:item:bonjour');
  const track = recordLearnerError(createLearnerErrorModel(), {
    category: 'listening', key: 'track:metro-1', label: 'Metro quiz', mode: 'listening', score: 20,
  }, { at: '2026-08-01T10:00:00.000Z' });
  assert.equal(track.entries[0].id, 'listening:track:metro-1');
});

test('canonicaliseModel folds legacy surrogate entries; errors survive, clean passes do not', () => {
  // Two legacy per-mode pronunciation entries + reading filed under listening
  // + writing filed under grammar: exactly what older builds stored.
  const raw = {
    version: 1,
    updatedAt: '2026-08-10T10:00:00.000Z',
    entries: [
      {
        id: 'pronunciation:mode:read-aloud', category: 'pronunciation', key: 'mode:read-aloud',
        label: 'Read-aloud clarity', errorCount: 2, successCount: 1, cleanPasses: 1,
        status: 'recovering', lastErrorAt: '2026-08-01T10:00:00.000Z', lastSeen: '2026-08-01T10:00:00.000Z',
        modes: ['read-aloud'], evidence: [{ at: '2026-08-01T10:00:00.000Z', mode: 'read-aloud', score: 55 }],
      },
      {
        id: 'pronunciation:mode:shadowing', category: 'pronunciation', key: 'mode:shadowing',
        label: 'Shadowing clarity', errorCount: 3, recurrenceCount: 1,
        status: 'active', lastErrorAt: '2026-08-05T10:00:00.000Z', lastSeen: '2026-08-05T10:00:00.000Z',
        modes: ['shadowing'], evidence: [{ at: '2026-08-05T10:00:00.000Z', mode: 'shadowing', score: 40 }],
      },
      {
        id: 'listening:reading:cafe-1', category: 'listening', key: 'reading:cafe-1',
        label: 'Reading comprehension', errorCount: 2,
        status: 'active', lastErrorAt: '2026-08-06T10:00:00.000Z', lastSeen: '2026-08-06T10:00:00.000Z',
        modes: ['reading'], evidence: [],
      },
      {
        id: 'grammar:writing:free', category: 'grammar', key: 'writing:free',
        label: 'Written accuracy', errorCount: 1,
        status: 'active', lastErrorAt: '2026-08-07T10:00:00.000Z', lastSeen: '2026-08-07T10:00:00.000Z',
        modes: ['writing'], evidence: [],
      },
      {
        id: 'pronunciation:speaking', category: 'pronunciation', key: 'speaking',
        label: 'Speaking confidence', errorCount: 2,
        status: 'active', lastErrorAt: '2026-08-08T10:00:00.000Z', lastSeen: '2026-08-08T10:00:00.000Z',
        modes: ['speaking'], evidence: [],
      },
    ],
  };
  const folded = canonicaliseModel(raw);
  assert.notEqual(folded, raw, 'a fold happened');
  const byId = new Map(folded.entries.map((e) => [e.id, e]));
  // Per-mode entries merged into one canonical pronunciation entry — counts
  // added, newest label and timestamps kept, recurrence preserved.
  const pron = byId.get('pronunciation:pronunciation');
  assert.ok(pron, 'per-mode pronunciation entries fold into the canonical id');
  assert.equal(pron.errorCount, 5, 'no mistake is lost in the fold');
  assert.equal(pron.recurrenceCount, 1);
  assert.equal(pron.label, 'Shadowing clarity', 'newest label wins');
  assert.equal(pron.lastErrorAt, '2026-08-05T10:00:00.000Z');
  assert.deepEqual(pron.modes, ['read-aloud', 'shadowing']);
  assert.equal(pron.evidence.length, 2);
  assert.equal(pron.status, 'active', 'recovery is NOT inherited — no clean passes carried over');
  assert.equal(pron.successCount, 0, 'a migration must never fabricate mastery');
  // Reading and writing become first-class canonical entries.
  assert.ok(byId.get('reading:reading'), 'reading filed under listening becomes reading:reading');
  assert.equal(byId.get('reading:reading').errorCount, 2);
  assert.ok(byId.get('writing:writing'), 'writing filed under grammar becomes writing:writing');
  assert.ok(byId.get('speaking:speaking'), 'speaking confidence becomes its own category');
  // Untouched entries and the legacy raw model are not disturbed.
  assert.equal(canonicaliseModel(folded), folded, 'idempotent: canonical ids pass through');
  const plain = { version: 1, entries: [{ id: 'grammar:articles', category: 'grammar', key: 'articles' }] };
  assert.equal(canonicaliseModel(plain), plain, 'no fold → same model reference (no write-back)');
});

test('canonicaliseModel removes only the historical duplicate SRS card row', () => {
  const raw = {
    version: 1,
    updatedAt: '2026-08-10T10:00:00.000Z',
    entries: [
      {
        id: 'vocabulary:bonjour', category: 'vocabulary', key: 'bonjour',
        label: 'bonjour', errorCount: 2, status: 'active',
        lastErrorAt: '2026-08-10T10:00:00.000Z', lastSeen: '2026-08-10T10:00:00.000Z',
        evidence: [{ at: '2026-08-10T10:00:00.000Z', mode: 'receptive', source: 'srs', score: 0 }],
        modes: ['receptive'],
      },
      {
        id: 'vocabulary:item:bonjour', category: 'vocabulary', key: 'item:bonjour',
        label: 'bonjour', errorCount: 2, status: 'active',
        lastErrorAt: '2026-08-10T10:00:00.000Z', lastSeen: '2026-08-10T10:00:00.000Z',
        evidence: [{ at: '2026-08-10T10:00:00.000Z', mode: 'cards', source: 'per-review-event', score: 0 }],
        modes: ['cards'],
      },
      {
        id: 'vocabulary:custom-key', category: 'vocabulary', key: 'custom-key',
        label: 'custom', errorCount: 1, status: 'active',
        lastErrorAt: '2026-08-09T10:00:00.000Z', lastSeen: '2026-08-09T10:00:00.000Z',
        evidence: [{ at: '2026-08-09T10:00:00.000Z', mode: 'writing', source: 'manual', score: 0 }],
        modes: ['writing'],
      },
    ],
  };
  const folded = canonicaliseModel(raw);
  const ids = folded.entries.map((entry) => entry.id);
  assert.ok(ids.includes('vocabulary:item:bonjour'), 'canonical SRS item row survives');
  assert.ok(!ids.includes('vocabulary:bonjour'), 'known duplicate plain SRS row is removed');
  assert.ok(ids.includes('vocabulary:custom-key'), 'unrelated plain vocabulary keys are untouched');
  assert.equal(folded.entries.find((entry) => entry.id === 'vocabulary:item:bonjour').errorCount, 2,
    'duplicate counts are not added together');
});

test('legacy models without evidence fields still normalise and stay compatible', () => {
  const legacy = createLearnerErrorModel({
    updatedAt: '2026-08-01T10:00:00.000Z',
    entries: [{
      id: 'grammar:articles', category: 'grammar', key: 'articles', label: 'Articles',
      errorCount: 2, successCount: 1, cleanPasses: 1, status: 'recovering',
      evidence: [{ at: '2026-08-01T10:00:00.000Z', mode: 'conversation', score: 44 }],
      modes: ['conversation'],
    }],
  });
  assert.equal(legacy.entries[0].lastEvidence, null, 'unknown evidence stays null, never invented');
  const next = recordLearnerSuccess(legacy, {
    category: 'grammar', key: 'articles', mode: 'grammar', score: 88, delayed: false,
  }, { at: '2026-08-01T12:00:00.000Z' });
  assert.equal(next.entries[0].status, 'recovering', 'identity-less evidence extends improving but never resolves legacy entries');
  assert.equal(next.entries[0].independentPasses, 0, 'unknown legacy evidence never invents independence');
  // Only fresh, properly identified evidence can complete the recovery.
  const resolved = recordLearnerSuccess(next, {
    category: 'grammar', key: 'articles', mode: 'grammar', score: 90, delayed: false,
    sessionId: 'ses_b', encounterId: 'ses_b:enc1',
  }, { at: '2026-08-01T13:00:00.000Z' });
  assert.equal(resolved.entries[0].status, 'recovering', 'legacy pass + one identified pass: independence still unproven');
  const resolvedTwo = recordLearnerSuccess(resolved, {
    category: 'grammar', key: 'articles', mode: 'grammar', score: 92, delayed: false,
    sessionId: 'ses_b', encounterId: 'ses_b:enc2',
  }, { at: '2026-08-01T14:00:00.000Z' });
  assert.equal(resolvedTwo.entries[0].status, 'resolved', 'two distinct identified encounters resolve');
});
