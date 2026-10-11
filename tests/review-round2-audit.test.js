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
