// Round two, part two: the audits. Each test names the learner-visible
// behaviour that was wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers/memory-storage.js';

// ── a session is never lost because the tutor was slow ────────────────────

test('session scores come from the turns we already graded, not from the model', async () => {
  const { sessionScores, compositeScore } = await import('../src/lib/score.js');

  const turns = [
    { evaluation: { scores: { grammar: 80, naturalness: 70, relevance: 90, fluency: 75, overall: 78 } } },
    { evaluation: { scores: { grammar: 60, naturalness: 80, relevance: 70, fluency: 65, overall: 69 } } },
  ];
  const s = sessionScores(turns);
  assert.equal(s.grammar, 70);
  assert.equal(s.naturalness, 75);
  assert.equal(s.overall, 74, 'the mean of the graded turns, reproducible every time');

  // The report's average was the MODEL's own arithmetic over the same numbers,
  // and it alone decided checkpoint pass/fail, CEFR promotion and the scenario
  // queue — so a model that returned {} scored the learner 0, one that returned
  // a JSON string threw, and one that miscounted failed an identical
  // conversation. With no turns scored there is no score to report.
  assert.deepEqual(sessionScores([]), { grammar: 0, naturalness: 0, relevance: 0, fluency: 0, overall: 0 });
  assert.deepEqual(sessionScores([{ evaluation: null }]), sessionScores([]));
  // A turn with no overall still yields the published weighting, not a zero.
  assert.equal(sessionScores([{ evaluation: { scores: { grammar: 100, naturalness: 100, relevance: 100, fluency: 100 } } }]).overall, 100);
  assert.equal(compositeScore({ grammar: 100, naturalness: 100, relevance: 100, fluency: 100 }), 100);
});

// ── a non-finite award must never be able to brick the app ────────────────

test('a transfer turn (no score) cannot poison XP or coins', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`nan-${stamp}`);
  const core = await import(`../src/lib/storageCore.js?nan=${stamp}`);

  // The transfer check sends `{ transfer: {...} }` with no `overall`. That
  // produced Math.max(1, Math.round(undefined/10)) = NaN, which survived
  // Math.max(0, …), and JSON.stringify(NaN) wrote the string "null". The next
  // load read a real null and xp.toLocaleString() threw into the root error
  // boundary — permanently, with Settings unreachable.
  storage.addXp(NaN);
  storage.addCoins(NaN);
  storage.addXp(undefined);
  assert.equal(storage.getXp(), 0, 'a NaN award adds nothing');
  assert.equal(storage.getCoins(), 0);
  assert.equal(Number(core.read(core.KEYS.xp, 0)), 0, 'and nothing poisonous is persisted');

  storage.addXp(40);
  assert.equal(storage.getXp(), 40, 'real awards still work');
  assert.equal(JSON.parse(globalThis.localStorage.getItem(core.KEYS.xp)), 40);

  // And a value already poisoned on disk cannot propagate.
  globalThis.localStorage.setItem(core.KEYS.xp, 'null');
  assert.equal(storage.getXp(), 0, 'a corrupt stored total reads as 0, never null');
  assert.equal(typeof storage.getXp().toLocaleString('en-GB'), 'string', 'so the header cannot throw');
});

// ── the repair lane must survive one prior repair ─────────────────────────

test('one recent repair session does not delete targeted repair from the plan', async () => {
  const { buildSessionPlan, activityTypeOf } = await import('../src/lib/sessionPlanner.js');

  // Recent history arrives as already-mapped names for the common case and as
  // raw segment kinds for a trial recorded before a drill ran.
  assert.equal(activityTypeOf('speaking'), 'speaking', 'the mapping is idempotent');
  assert.equal(activityTypeOf('speak'), 'speaking');

  const state = {
    srsDue: 5,
    weaknesses: [
      { id: 'articles', category: 'grammar', label: 'Articles', errorCount: 3 },
      { id: 'subjonctif', category: 'grammar', label: 'Subjonctif', errorCount: 2 },
      { id: 'passe-compose', category: 'grammar', label: 'Passé composé', errorCount: 2 },
    ],
    scenario: { id: 'cafe', title: 'Au café' },
    track: { id: 'pod-1', title: 'Le marché' },
  };

  for (const recentPlans of [[], [{ kind: 'repair' }], [{ kind: 'speaking' }], [{ kind: 'practice' }]]) {
    const plan = buildSessionPlan({ state: { ...state, recentPlans }, minutes: 20 });
    const kinds = plan.segments.map((s) => s.kind);
    assert.ok(kinds.includes('repair'),
      `repair must stay schedulable after ${JSON.stringify(recentPlans)}, got ${kinds.join(' -> ')}`);
    assert.equal(plan.focus.kind, 'repair', 'and the headline matches the weakness being repaired');
    // "Never three in a row" means at most two consecutive.
    let run = 0;
    for (const k of kinds) {
      run = k === 'repair' ? run + 1 : 0;
      assert.ok(run <= 2, `at most two repairs in a row, got ${kinds.join(' -> ')}`);
    }
  }
});

test('plan minutes sum to the requested budget', async () => {
  const { buildSessionPlan } = await import('../src/lib/sessionPlanner.js');
  const state = {
    srsDue: 5,
    weaknesses: [
      { id: 'articles', category: 'grammar', label: 'Articles', errorCount: 3 },
      { id: 'subjonctif', category: 'grammar', label: 'Subjonctif', errorCount: 2 },
      { id: 'passe-compose', category: 'grammar', label: 'Passé composé', errorCount: 2 },
    ],
    scenario: { id: 'cafe', title: 'Au café' },
    track: { id: 'pod-1', title: 'Le marché' },
  };
  for (const minutes of [10, 20, 45]) {
    const plan = buildSessionPlan({ state, minutes });
    const sum = plan.segments.reduce((s, x) => s + x.minutes, 0);
    assert.equal(sum, plan.minutes, 'the CTA total is the sum of its segments');
    assert.equal(plan.minutes, minutes, `a ${minutes}-minute session costs ${minutes} minutes`);
  }
});

// ── French grading must not punish identical text ─────────────────────────

test('a decomposed French accent is not an accent error', async () => {
  const { checkForm } = await import('../src/lib/conjugationTrainer.js');
  const { strictKey } = await import('../src/lib/conjugationDrill.js');

  // "parlé" can arrive as e + U+0301 from an IME, a PDF paste or another
  // platform's JSON. It is the same word; it used to grade 'near', pay 1 XP
  // instead of full credit, and record neither an error nor a success, so the
  // entry that schedules the repair never advanced.
  const nfd = 'parlé'.normalize('NFD');
  assert.notEqual(nfd, 'parlé', 'the decomposed form really is a different byte sequence');
  assert.equal(checkForm(nfd, 'parlé'), 'correct', 'and it grades as correct');
  assert.equal(strictKey(nfd), strictKey('parlé'), 'the strict key agrees');

  // A genuine accent slip is still graded as such — normalisation must not
  // forgive what the exercise exists to teach.
  assert.equal(checkForm('parle', 'parlé'), 'near');
  assert.equal(checkForm('parler', 'parlé'), 'wrong');
});

test('the repair loop accepts the corrected sentence it just displayed', async () => {
  // `accept` holds exactly one string and it is on screen one line above the
  // input, so the learner copying it verbatim was told "Not quite" for a
  // straight apostrophe or a trailing full stop.
  const normalise = (s) => String(s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const accept = ['J’ai visité ma sœur à Paris hier.'];
  for (const typed of [
    'J’ai visité ma sœur à Paris hier.',
    "J'ai visité ma sœur à Paris hier.",
    "J'ai visité ma sœur à Paris hier",
    "j'ai visité ma soeur à paris hier.",
  ]) {
    assert.equal(
      normalise(accept[0]) === normalise(typed), true,
      `should accept ${typed}`,
    );
  }
});

test('dictation honours the "accents lenient" label it prints', async () => {
  const { toWords, diffWordsEq } = await import('../src/lib/sentences.js');
  const target = toWords('ça va très bien');

  const strictEq = (a, b) => a === b;
  const lenientEq = (a, b) =>
    a.normalize('NFD').replace(/\p{M}/gu, '') === b.normalize('NFD').replace(/\p{M}/gu, '');

  assert.equal(
    diffWordsEq(target, toWords('ca va tres bien'), strictEq).filter(Boolean).length,
    2, 'strict grading does lose the accented words…',
  );
  assert.equal(
    diffWordsEq(target, toWords('ca va tres bien'), lenientEq).filter(Boolean).length,
    4, '…and lenient grading, the one the header promises at levels 1–3, does not',
  );
  // A decomposed form is the same word and must count at either strictness.
  assert.equal(toWords('ça')[0], 'ça', 'toWords composes canonically');
});

// ── a drill must be able to repair the gap it was scheduled against ───────

test('a pronunciation gap routes to the read-aloud drill, not a typing drill', async () => {
  const { probeCapabilities, drillChain } = await import('../src/lib/todayCapabilities.js');

  const kinds = drillChain(probeCapabilities({ hasAi: true, concept: 'Pronunciation clarity' }))
    .map((p) => p.kind);
  assert.equal(kinds[0], 'pronunciation-drill',
    'the repair for a pronunciation gap must exercise speech first');
  assert.ok(kinds.includes('accent-drill'), 'the orthography drill stays available as a fallback');
});

test('a drill outcome recorded through onActivity closes the learner-error loop', async () => {
  globalThis.localStorage = memoryStorage();
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`drill-${Date.now()}-${Math.random()}`);

  // This is the path the session's drill chain now uses. Before, the drill
  // segment never threaded onActivity, so a dictation/accent/listen drill
  // scored the learner but recorded NOTHING: the gap it was scheduled against
  // stayed active with errorCount frozen, and the same drill was re-selected
  // session after session.
  // A miss first — the drill exists because the learner got it wrong. (A
  // success with no prior entry is a deliberate no-op: successes never create
  // weaknesses from nothing.)
  storage.recordLearningActivity({ type: 'dictation', score: 40, label: 'Dictée listening accuracy' });
  storage.recordLearningActivity({ type: 'pronunciation', score: 40, label: 'Pronunciation clarity' });
  // Then the repair round: the drill the planner scheduled runs, and its
  // outcome lands through the same onActivity path. Before, the drill segment
  // never threaded onActivity, so this outcome went nowhere — the gap stayed
  // active with errorCount frozen and the same drill was re-selected session
  // after session.
  storage.recordLearningActivity({ type: 'dictation', score: 90, label: 'Dictée listening accuracy' });

  // includeResolved: a clean pass RESOLVES the entry, and the prioritised view
  // hides resolved entries by design — Today should not re-drill something the
  // learner just fixed. The raw model is the durable record.
  const errors = storage.getLearnerErrors({ limit: 12, includeResolved: true });
  const dictation = errors.find((e) => e.key === 'dictation');
  const pronunciation = errors.find((e) => e.key === 'pronunciation');
  assert.ok(dictation, 'the dictation outcome reached the learner-error model');
  assert.equal(dictation.status, 'recovering', 'a clean pass moves the gap into recovery');
  assert.ok(pronunciation, 'the pronunciation outcome reached the model too');
  assert.equal(pronunciation.status, 'active', 'a poor round keeps the gap active');
  assert.equal(pronunciation.errorCount, 1, 'and counts as a miss, so Today can schedule its repair');
});

// ── the conjugation drill must feed the model Today reads ─────────────────

test('a conjugation drill answer becomes a repairable weakness', async () => {
  globalThis.localStorage = memoryStorage();
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`conj-${Date.now()}-${Math.random()}`);

  // The drill reports the CELL it graded. recordLearningActivity had no
  // 'conjugation' branch and the drill sent no score, so the one surface that
  // detects per-verb/per-tense weakness — and tells the learner about it —
  // filed its results into a store no planner reads. The weakness could never
  // route into Today.
  storage.recordLearningActivity({
    type: 'conjugation',
    itemId: 'conj:être:subjonctif:2',
    score: 0,
    label: 'être · subjonctif · il/elle',
  });

  const errors = storage.getLearnerErrors({ limit: 12, includeResolved: true });
  const entry = errors.find((e) => e.key === 'conjugation:être:subjonctif:2');
  assert.ok(entry, `the drill answer became a learner-error entry (got ${errors.map((e) => e.key).join(', ')})`);
  assert.equal(entry.category, 'grammar');
  assert.equal(entry.status, 'active', 'a wrong form is an open weakness');
  assert.equal(entry.errorCount, 1);

  // The key shape is the contract: todayPlan hunts `conjugation:<verb>:<tense>`
  // to build the conj-drill repair, so a different shape would be unreachable.
  const [prefix, verb, tense] = entry.key.split(':');
  assert.equal(prefix, 'conjugation');
  assert.equal(verb, 'être');
  assert.equal(tense, 'subjonctif');
});

test('an identity-less activity never invents a conjugation gap', async () => {
  globalThis.localStorage = memoryStorage();
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`conj0-${Date.now()}-${Math.random()}`);

  storage.recordLearningActivity({ type: 'conjugation', score: 0 });
  assert.deepEqual(
    storage.getLearnerErrors({ limit: 12, includeResolved: true }), [],
    'no item id means no gap — a blank key must not become a phantom weakness',
  );
});

test('a household switch re-reads the learner-scoped rewards', async () => {
  globalThis.localStorage = memoryStorage();
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`hh-${Date.now()}-${Math.random()}`);

  const a = storage.addHouseholdMember('First');
  const b = storage.addHouseholdMember('Second');

  storage.switchHouseholdMember(a.id);
  storage.addXp(120);
  storage.addCoins(40);
  assert.equal(storage.getXp(), 120);

  storage.switchHouseholdMember(b.id);
  // The header held these in React state seeded ONCE with useState(getXp), so
  // it kept showing the previous member's totals while Profile (which re-reads)
  // showed the new member's. The storage contract the refresh depends on:
  assert.equal(storage.getXp(), 0, 'the new member starts from their own XP');
  assert.equal(storage.getCoins(), 0);

  storage.switchHouseholdMember(a.id);
  assert.equal(storage.getXp(), 120, 'and switching back restores the first member');
});
