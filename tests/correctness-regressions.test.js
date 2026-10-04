// Regression tests for a code-review pass over src/lib.
//
// Each test here pins a defect that shipped and was fixed. They are grouped
// by the failure mode, not by file, because the shared theme is the same:
// a rule that LOOKED enforced but wasn't — a day boundary computed in two
// timezones, a help flag read under a different name, a guard whose two
// branches tested the same condition.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// ── Calendar days: one identity, one timezone ───────────────────────────────
//
// storage.js persists timestamps as UTC ISO strings. weeklyReview sliced the
// first 10 characters — the UTC date — while comparing them against window
// bounds built from localDayKey(). Every learner west of UTC practising in
// the evening had their sessions fall on the far side of midnight and vanish.

test('the weekly window counts an evening session instead of reporting an empty week', async () => {
  const { buildWeeklyReview } = await import('../src/lib/weeklyReview.js');
  const evening = new Date();
  evening.setHours(21, 30, 0, 0);
  // Only assert the containment fact when this host is actually far enough
  // east of UTC for the old slice to disagree — otherwise the bug is invisible.
  const storedDay = new Date(evening.toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  const localDay = new Date(evening.getFullYear(), evening.getMonth(), evening.getDate()).getTime();
  const review = buildWeeklyReview({
    sessions: [{ date: evening.toISOString(), minutes: 10, kind: 'conversation', turns: 6, scenarioId: 'cafe' }],
    timeLog: {},
    reviewEvents: [],
    learnerErrorModel: { entries: [] },
  });
  assert.equal(review.empty, false, `a session recorded tonight is never "no practice this week" (UTC day ${storedDay !== localDay ? 'differs from' : 'matches'} local day)`);
  assert.ok(review.speakingMinutes > 0, 'the session is counted');
});

test('weeklyReview agrees with the app-wide local day identity', async () => {
  const [{ buildWeeklyReview }, { localDayKey }] = await Promise.all([
    import('../src/lib/weeklyReview.js'),
    import('../src/lib/localDay.js'),
  ]);
  const night = new Date();
  night.setHours(23, 45, 0, 0);
  const review = buildWeeklyReview({
    sessions: [{ date: night.toISOString(), minutes: 8, kind: 'conversation', turns: 4, scenarioId: 'cafe' }],
    timeLog: {},
    reviewEvents: [],
    learnerErrorModel: { entries: [] },
  });
  assert.ok(review.weekEnd <= localDayKey(night), 'the window never ends beyond the local day');
  assert.ok(review.weekEnd >= localDayKey(new Date(night.getTime() - 6 * 86400000)));
});

test('todayOutcome uses the local day, like every other Today surface', async () => {
  const [{ todayOutcome }] = await Promise.all([import('../src/lib/todayBrief.js')]);
  const late = new Date();
  late.setHours(22, 0, 0, 0);
  // An evening event, stored in the UTC form storage.js writes. Under the old
  // `toISOString().slice(0,10)` this compared a UTC day against a UTC "today"
  // while every other Today surface used the local day — so the outcome line
  // and the streak could disagree about which day it was.
  const out = todayOutcome({
    now: late.getTime(),
    events: [{ type: 'segment-completed', segment: 'speak', at: late.toISOString() }],
  });
  assert.equal(out, '1 skill practised', 'an event from tonight counts as tonight');
});

// ── Support labels: one vocabulary, read everywhere ─────────────────────────
//
// Three functions classified "how much help did the learner get" and two of
// them read a different field name than the producers wrote. The result was an
// error made WITH a hint stored as assistance 'none', independent: true.

test('an assisted MISTAKE is not stored as an independent baseline', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
    key: (i) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  };
  const { recordLearnerError } = await import(`../src/lib/stores/learnerErrorStore.js?v=${Date.now()}`);
  recordLearnerError({
    category: 'grammar', key: 'subjunctive', label: 'subjunctive',
    mode: 'retype', assistance: 'scaffolded', encounterId: 'e1', sessionId: 's1', score: 0,
  });
  const raw = [...values.entries()].find(([k]) => k.includes('vidence'));
  assert.ok(raw, 'evidence was recorded');
  const baseline = JSON.parse(raw[1]).cycles[0].baseline[0];
  assert.equal(baseline.assistance, 'scaffolded', 'the support label survives the trip');
  assert.equal(baseline.independent, false, 'a mistake made with help is never independent evidence');
});

test('an unassisted mistake is still independent', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
    key: (i) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  };
  const { recordLearnerError } = await import(`../src/lib/stores/learnerErrorStore.js?v=${Date.now()}b`);
  recordLearnerError({
    category: 'grammar', key: 'passe-compose', label: 'passe composé',
    mode: 'drill', encounterId: 'e2', sessionId: 's1', score: 0,
  });
  const raw = [...values.entries()].find(([k]) => k.includes('vidence'));
  const baseline = JSON.parse(raw[1]).cycles[0].baseline[0];
  assert.equal(baseline.assistance, 'none');
  assert.equal(baseline.independent, true, 'the honest case is unchanged');
});

// ── Guards that could never fire ────────────────────────────────────────────

test('content-word swaps are meaning-affecting however many there are', async () => {
  const { isMeaningAffecting } = await import('../src/lib/writingRepair.js');
  assert.equal(isMeaningAffecting('le chat', 'le chien'), true);
  // The old rule capped at two swaps, so the MORE a learner diverged the LESS
  // meaning-changing it was reported — every content word replaced was filed
  // as a style tweak.
  assert.equal(isMeaningAffecting('un petit cafe noir', 'une grande maison verte'), true);
  assert.equal(isMeaningAffecting('un petit cafe noir et calme', 'une grande maison verte et chaude'), true);
  assert.equal(isMeaningAffecting('le chat noir', 'le chat noir'), false, 'no change is not a meaning change');
});

test('retirement respects a recurrence between two delayed successes', async () => {
  const { recordMistake, recordRetest, mistakeId } = await import('../src/lib/mistakeGraph.js');
  const day = (n) => new Date(Date.UTC(2026, 0, n)).toISOString();
  const id = mistakeId({ type: 'tense', concept: 'passe-compose' });
  const base = { type: 'tense', concept: 'passe-compose', source: 'conversation', attempt: 'hier je vais', corrected: 'hier je suis allé', confidence: 0.9 };
  let graph = recordMistake([], { ...base, at: day(1) });
  // Two delayed successes in different context families, with the mistake
  // re-seen (recurred) BETWEEN them.
  graph = recordRetest(graph, { id, at: day(5), correct: true, context: 'drill' });
  graph = recordMistake(graph, { ...base, at: day(8) });
  graph = recordRetest(graph, { id, at: day(12), correct: true, context: 'conversation:cafe' });
  const node = graph.find((m) => m.id === id);
  assert.equal(node.status, 'active', 'a recurrence after the first delayed success blocks retirement');
  assert.notEqual(node.mastery, 100);
});

test('a clean run of delayed successes in two families still retires', async () => {
  const { recordMistake, recordRetest, mistakeId } = await import('../src/lib/mistakeGraph.js');
  const day = (n) => new Date(Date.UTC(2026, 0, n)).toISOString();
  const id = mistakeId({ type: 'tense', concept: 'passe-compose' });
  const base = { type: 'tense', concept: 'passe-compose', source: 'conversation', attempt: 'hier je vais', corrected: 'hier je suis allé', confidence: 0.9, at: day(1) };
  let graph = recordMistake([], base);
  graph = recordRetest(graph, { id, at: day(5), correct: true, context: 'drill' });
  graph = recordRetest(graph, { id, at: day(12), correct: true, context: 'conversation:cafe' });
  const node = graph.find((m) => m.id === id);
  assert.equal(node.status, 'retired', 'the guard must not block the honest case');
});

test('a correct sort actually orders the fluency debrief', async () => {
  const { pickTopCorrections } = await import('../src/lib/fluencyReview.js');
  const turn = (topic, overall) => ({
    evaluation: {
      reply: 'x',
      grammar_topic: topic,
      scores: { overall },
      corrections_detailed: [{ original: 'a', correction: 'b', level: 'definite_error', note: 'slip' }],
    },
  });
  const out = pickTopCorrections([turn('subjonctif', 90), turn('passé composé', 40)]);
  assert.equal(out[0].topic, 'passé composé', 'the worse-scoring correction leads');
});

// ── Paths that tests could exercise but never did ──────────────────────────

test('member removal actually removes that member\'s stored data', async () => {
  const { installMemoryStorage, freshModuleTag } = await import('./helpers/memory-storage.js');
  installMemoryStorage({
    'fp.learner.alice.settings': '{"theme":"dark"}',
    'fp.learner.alice.xp': '120',
    'fp.learner.bob.settings': '{"theme":"light"}',
    'fp.global.theme': 'light',
  });
  const { purgeLearnerData } = await import(`../src/lib/storageCore.js${freshModuleTag()}`);
  const purged = purgeLearnerData('alice');
  // The test double used across the suite implemented only getItem/setItem/
  // removeItem, so `0 < localStorage.length` was `0 < undefined` — false. The
  // loop never ran and this returned 0 while every test still passed. A GDPR
  // member-removal that removes nothing is the worst shape this bug could take.
  assert.equal(purged, 2, 'both of Alice\'s keys were removed');
  assert.equal(globalThis.localStorage.getItem('fp.learner.alice.xp'), null);
  assert.ok(globalThis.localStorage.getItem('fp.learner.bob.settings'), 'Bob is untouched');
  assert.ok(globalThis.localStorage.getItem('fp.global.theme'), 'shared keys are untouched');
});

test('a sync code round-trips the learner back to their own progress', async () => {
  const { installMemoryStorage, freshModuleTag } = await import('./helpers/memory-storage.js');
  installMemoryStorage({
    'fp.learner.carol.xp': '3450',
    'fp.learner.carol.settings': '{"theme":"sepia"}',
    'fp.learner.dave.xp': '90',
  });
  const account = await import(`../src/lib/account.js${freshModuleTag()}`);
  const storage = await import(`../src/lib/storage.js${freshModuleTag()}`);

  // Wipe, then restore from the code alone. `restoreSyncCode`'s SUCCESS path
  // had no test anywhere: `makeSyncCode` and `isEncryptedCode` were covered,
  // and restore was only reached via a wrong-passphrase failure — so the
  // make → restore round trip was never run once.
  const code = await account.makeSyncCode('', { mark: false });
  assert.equal(account.isEncryptedCode(code), false, 'an unencrypted code says so');
  for (const k of Object.keys(globalThis.localStorage._entries())) globalThis.localStorage.removeItem(k);
  assert.equal(Object.keys(storage.exportProgress().learners || {}).length, 0, 'they really did lose it');

  await account.restoreSyncCode(code, '');
  const back = storage.exportProgress();
  assert.equal(Number(back.learners.carol.xp), 3450, 'Carol came back from the code alone');
  assert.equal(Number(back.learners.dave.xp), 90, 'and so did Dave — one code carries every learner');
});

test('a sync code still refuses the codes it should refuse', async () => {
  const { installMemoryStorage, freshModuleTag } = await import('./helpers/memory-storage.js');
  installMemoryStorage();
  const account = await import(`../src/lib/account.js${freshModuleTag()}`);
  const code = await account.makeSyncCode('', { mark: false });
  await assert.rejects(() => account.restoreSyncCode('not-a-code'), /valid sync code/);
  await assert.rejects(() => account.restoreSyncCode(code.slice(0, code.length - 6)), /corrupted|incomplete|Wrong/);
});

// ── Filters that filtered nothing ───────────────────────────────────────────

test('function words contribute no syllables to the pronunciation analysis', async () => {
  const { analyzeFrenchText } = await import('../src/lib/frenchG2P.js');
  // The predicate ended in `|| true`, making the exclusion of au/aux/et dead.
  assert.equal(analyzeFrenchText('parler et manger').words.length, 2);
  assert.equal(analyzeFrenchText('maison').words.length, 1);
  assert.equal(analyzeFrenchText('parler au cafe').words.length, 2);
});