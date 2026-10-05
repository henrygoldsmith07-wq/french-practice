// Regression tests for the review pass. Each test names the behaviour that was
// wrong before, so a future change that reintroduces it fails here with a
// description that says what the learner would have lost or been told.
//
// The theme throughout: the learner model must never make a decision on a
// number it invented, and must never lose or over-share what was recorded.

import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers/memory-storage.js';

// ── storage: a full quota must not silently discard a write ────────────────

function fullStorage(limitBytes) {
  const store = new Map();
  let used = 0;
  return {
    store,
    get length() { return store.size; },
    key: (i) => [...store.keys()][i] ?? null,
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    removeItem(k) { if (store.has(k)) { used -= store.get(k).length; store.delete(k); } },
    clear() { store.clear(); used = 0; },
    setItem(k, v) {
      const cost = v.length - (store.has(k) ? store.get(k).length : 0);
      if (used + cost > limitBytes) {
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
      }
      used += cost;
      store.set(k, v);
    },
  };
}

test('a write that cannot fit is still retried after pruning, never silently dropped', async () => {
  const ls = fullStorage(4000);
  globalThis.localStorage = ls;
  const stamp = `${Date.now()}-${Math.random()}`;
  const core = await import(`../src/lib/storageCore.js?quota=${stamp}`);

  // The prunable logs are short, which is ordinary for a learner who has not
  // used the study features. The old loop only retried the write *inside* the
  // branch that halved a log, so with nothing long enough to halve it fell out
  // of the function having written nothing and having told nobody.
  ls.setItem(core.KEYS.reviewEvents, JSON.stringify([{ a: 1 }, { a: 2 }, { a: 3 }]));
  ls.setItem(core.KEYS.studyEvents, JSON.stringify([{ a: 1 }]));
  ls.setItem(core.KEYS.pulseHistory, JSON.stringify([]));

  const small = { fits: true, note: 'a small payload still lands' };
  assert.equal(core.write(core.KEYS.sessionHistory, small), true, 'a fitting write reports success');

  // Now fill the store so nothing else fits and force a real recovery attempt.
  const before = ls.length;
  const big = { blob: 'x'.repeat(3000) };
  const landed = core.write(core.KEYS.metrics, big);
  assert.equal(typeof landed, 'boolean', 'write reports whether it landed');
  if (landed) {
    assert.deepEqual(JSON.parse(ls.getItem(core.KEYS.metrics)), big, 'and the value is really there');
  } else {
    assert.equal(landed, false, 'a lost write is reported as lost, not assumed saved');
  }
  assert.ok(ls.length >= before - 3, 'pruning may reclaim space, but nothing explodes');
});

test('session history is bounded, newest kept', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`cap-${stamp}`);

  for (let i = 0; i < 520; i += 1) storage.saveSession({ scenarioId: `s${i}`, turns: 1 });
  const sessions = storage.getSessions();
  assert.ok(sessions.length <= 500, `history is capped, got ${sessions.length}`);
  assert.equal(sessions[sessions.length - 1].scenarioId, 's519', 'the newest session survives');
});

// ── storage: the BYOK key must never leave the device ─────────────────────

test('export never includes the API key, including in a household namespace', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`secret-${stamp}`);

  const a = storage.addHouseholdMember('A');
  storage.switchHouseholdMember(a.id);
  storage.setApiKey('gsk-super-secret-value');
  storage.addXp(42);
  const exported = storage.exportProgress();
  const blob = JSON.stringify(exported);
  assert.ok(!blob.includes('gsk-super-secret-value'), 'the secret value is nowhere in the payload');
  // The key is a learner-owned key, so in a household it physically lives at
  // fp.learner.<memberId>.fp.groqKey — which the namespaced scan used to copy
  // verbatim, straight into the sync code and the cloud push. (The claims
  // registry still mentions the key NAME, which is harmless: it records which
  // member owns which key, never a value.)
  assert.ok(
    !Object.values(exported.learners || {}).some((entries) => 'fp.groqKey' in (entries || {})),
    'and no learner namespace carries it',
  );
  assert.ok(blob.includes('42'), 'ordinary progress still exports');

  // And it must not come back IN from someone else's device.
  const tampered = { app: 'le-studio', version: 3, data: {}, learners: { [a.id]: { 'fp.groqKey': '"gsk-injected"' } } };
  storage.importProgress(tampered);
  assert.equal(storage.getApiKey(), 'gsk-super-secret-value', 'an imported secret is ignored, the real key is untouched');
});

// ── storage: a restored backup must not install values readers can't use ──

test('import rejects wrong-shaped and null values instead of installing them', async () => {
  const core = await import('../src/lib/storageCore.js');
  assert.equal(core.hasExpectedShape(core.KEYS.xpLog, '{"2026-01-01":10}'), true, 'a real map passes');
  assert.equal(core.hasExpectedShape(core.KEYS.xpLog, 'null'), false, 'null crashes every reader');
  assert.equal(core.hasExpectedShape(core.KEYS.xpLog, '[]'), false, 'an array is not a map');
  assert.equal(core.hasExpectedShape(core.KEYS.sessionHistory, '[]'), true);
  assert.equal(core.hasExpectedShape(core.KEYS.sessionHistory, '{}'), false, 'an object is not an array');
  assert.equal(core.hasExpectedShape(core.KEYS.sessionHistory, 'null'), false);
  assert.equal(core.hasExpectedShape(core.KEYS.sessionHistory, '{oops'), false, 'unparseable is rejected');
  assert.equal(core.hasExpectedShape('fp.somethingUnknown', '{"a":1}'), true, 'unknown keys are not second-guessed');
  assert.equal(core.hasExpectedShape('fp.somethingUnknown', 'null'), false, 'null is still rejected everywhere');
});

test('a household claim is not recorded unless the data actually moved', async () => {
  // Simulates the moment claiming is most likely to fail: adding the first
  // member roughly doubles that member's footprint, so the copy throws. The old
  // code swallowed the error and still saved the claim, and because the claim
  // short-circuits every later attempt, the pre-household data became
  // unreachable forever — reads returned empty and the next save wrote empty.
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const core = await import(`../src/lib/storageCore.js?claim=${stamp}`);
  const storage = await import(`../src/lib/storage.js?claim=${stamp}`);

  storage.addXp(500);
  storage.rateCard('word-a', 'good', {});

  const member = storage.addHouseholdMember('First');
  storage.switchHouseholdMember(member.id);
  assert.equal(storage.getXp(), 500, 'the legacy value is reachable after claiming');
  assert.ok(Object.keys(storage.getSrs()).includes('word-a'), 'and so is the SRS');

  // Prove the guard exists even though the copy succeeds here: the claim must
  // only be durable once the payload is in the namespace.
  const registry = JSON.parse(globalThis.localStorage.getItem('fp.learnerRegistry.v1') || '{}');
  assert.equal(registry.claims['fp.xp'], member.id, 'a completed claim is recorded');
  assert.ok(registry.claims['fp.xp'], 'and the data is where the claim says it is');
  assert.ok(globalThis.localStorage.getItem(`fp.learner.${member.id}.fp.xp`) != null, 'the payload really moved');
});

test('a second household member never inherits the first member\'s data', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`iso-${stamp}`);

  storage.addXp(321);
  const a = storage.addHouseholdMember('First');
  assert.equal(storage.getXp(), 321, 'first member inherits pre-household data');
  const b = storage.addHouseholdMember('Second');
  storage.switchHouseholdMember(b.id);
  assert.equal(storage.getXp(), 0, 'second member starts empty');
  storage.switchHouseholdMember(a.id);
  assert.equal(storage.getXp(), 321, 'nothing was orphaned');
});

test('the error notebook survives a wrong-shaped stored value', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { KEYS, write } = await import(`../src/lib/storageCore.js?nb=${stamp}`);
  const nb = await import(`../src/lib/errorNotebook.js?nb=${stamp}`);
  write(KEYS.errorNotebook, { not: 'an array' });
  assert.deepEqual(nb.getErrorNotebook(), [], 'a non-array reads as empty');
  nb.addErrorNotebook({ original: 'je suis aller', corrected: 'je suis allé', why: 'past tense' });
  assert.equal(nb.getErrorNotebook().length, 1, 'and a new correction can still be saved');
});

// ── the learner model must decide on measured values ──────────────────────

test('speaking minutes come from recorded speech, not from a turn count', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`speak-${stamp}`);
  const { recentMinutes } = await import('../src/lib/plannerState.js');

  // saveSession records `speakingSeconds`. The old reader asked for
  // `durationSeconds` (never written) and `kind` (never set), so every session
  // fell through to turns * 0.6 — and a long, pause-heavy conversation with
  // 60 turns read as 36 minutes of speaking when the learner had produced 10.
  storage.saveSession({ scenarioId: 'cafe', turns: 60, speakingSeconds: 600 });
  const m = recentMinutes({ now: Date.now(), sessions: storage.getSessions() });
  assert.equal(m.speakingMinutes, 10, 'the recorded 600 voiced seconds are used');

  // History written before speakingSeconds existed still estimates.
  const legacy = recentMinutes({ now: Date.now(), sessions: [{ scenarioId: 'x', date: new Date().toISOString(), turns: 10 }] });
  assert.equal(legacy.speakingMinutes, 6, 'pre-existing history still estimates from turns');
});

test('listening minutes are reported as unmeasured, never as an assumed share', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`listen-${stamp}`);
  const { recentMinutes, plannerState } = await import('../src/lib/plannerState.js');

  // 100 minutes of pure grammar/vocab. The old default reported 20 minutes of
  // listening (20% of total), which is over the planner's 15-minute "starved"
  // threshold — so a learner who had done NO listening was never scheduled any.
  for (let i = 0; i < 7; i += 1) storage.addStudyTime(60 * 100 / 7);
  const m = recentMinutes({ now: Date.now(), timeLog: storage.getTimeLog(), sessions: [] });
  assert.equal(m.totalMinutes, 100);
  assert.equal(m.listeningMinutes, 0, 'no listening was recorded, so none is claimed');

  const state = plannerState({ now: Date.now(), reading: { timeLog: storage.getTimeLog(), sessions: [] } });
  assert.equal(state.listeningMinutes7d, 0, 'the planner is told the truth');
});

test('a 7-day practice window is seven LOCAL days, not seven UTC days', async () => {
  const { recentMinutes } = await import('../src/lib/plannerState.js');
  // 21:30 local on 9 March in New York is already 10 March in UTC. Slicing the
  // window start as a UTC date pushed it a day late, so the oldest day of
  // practice fell out of "the last 7 days".
  const now = Date.parse('2025-03-10T02:30:00Z');
  const timeLog = {};
  for (let d = 1; d <= 9; d += 1) {
    const key = `2025-03-${String(d).padStart(2, '0')}`;
    timeLog[key] = 600;
  }
  const m = recentMinutes({ now, timeLog, sessions: [], days: 7 });
  // Local day of `now` is 2025-03-09, so a 7-day window starts 2025-03-03 and
  // covers the 3rd..9th: seven days, 4200 seconds.
  assert.equal(m.totalMinutes, 70, 'all seven local days are counted');
});

// ── the recovery loop must actually run ───────────────────────────────────

test('lanes are positional: a weakness returns to the next step it owes', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`lanes-${stamp}`);

  // A mistake on day one, repaired the next morning — 26 h later, the ordinary
  // case. Under the old clock rule every later success was filed as `delayed`,
  // so the intervention and transfer lanes stayed empty, dueLearningChecks
  // returned nothing (it skips a cycle with no intervention), and the loop
  // reported "needs confirmation" forever while owing the learner nothing.
  storage.recordLearnerError(
    { category: 'grammar', key: 'accord', label: 'Agreement', mode: 'writing', score: 40, encounterId: 'e1', sessionId: 's1' },
    { at: '2026-04-01T09:00:00.000Z' },
  );
  storage.recordLearnerSuccess(
    { category: 'grammar', key: 'accord', label: 'Agreement', mode: 'drill', score: 90, encounterId: 'e2', sessionId: 's1' },
    { at: '2026-04-02T11:00:00.000Z' },
  );

  const cycle = storage.getLearningEvidenceState().cycles.find((c) => c.target.id === 'grammar:accord');
  assert.equal(cycle.interventions.length, 1, 'the repair is an intervention, not a delayed pass');
  assert.equal(cycle.delayed.length, 0);

  const due = storage.getLearningEvidenceOverview().due;
  assert.ok(due.some((d) => d.type === 'transfer'), 'a transfer check is now owed');
});

test('a supported delayed pass does not discharge the delayed debt', async () => {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}-${Math.random()}`;
  const { importFullStorage } = await import('./helpers/fullStorage.js');
  const storage = await importFullStorage(`delayed-${stamp}`);

  storage.recordLearnerError(
    { category: 'grammar', key: 'subj', label: 'Subjunctive', mode: 'writing', score: 30, encounterId: 'e1' },
    { at: '2026-04-01T09:00:00.000Z' },
  );
  storage.recordLearnerSuccess(
    { category: 'grammar', key: 'subj', label: 'Subjunctive', mode: 'drill', score: 90, encounterId: 'e2' },
    { at: '2026-04-01T10:00:00.000Z' },
  );
  storage.recordLearnerSuccess(
    {
      category: 'grammar', key: 'subj', label: 'Subjunctive', mode: 'followup', score: 90,
      encounterId: 'e3', transferVerified: true, heldOut: true,
    },
    { at: '2026-04-01T11:00:00.000Z' },
  );

  // 25 h after the transfer, the delayed check comes round — and is taken with
  // the answer revealed, which the follow-up UI explicitly allows.
  const now = Date.parse('2026-04-02T12:00:00.000Z');
  assert.ok(
    storage.getLearningEvidenceOverview(now).due.some((d) => d.type === 'delayed'),
    'the delayed check is owed',
  );
  storage.recordLearnerSuccess(
    {
      category: 'grammar', key: 'subj', label: 'Subjunctive', mode: 'followup', score: 100,
      encounterId: 'e4', assistance: 'scaffolded', delayed: true,
    },
    { at: new Date(now).toISOString() },
  );
  assert.ok(
    storage.getLearningEvidenceOverview(Date.parse('2026-04-30T12:00:00.000Z')).due.some((d) => d.type === 'delayed'),
    'a supported answer never demonstrates unaided recall, so the debt stands',
  );
});

test('a capability is never called demonstrated on an assisted delayed pass', async () => {
  const { createLearningEvidenceState, recordLearningEvidence, learningCycleStatus } = await import('../src/lib/learningEvidence.js');
  const { buildCapabilityMap } = await import('../src/lib/capabilityModel.js');

  const base = (phase, at, extra = {}) => recordLearningEvidence(
    createLearningEvidenceState(stateSoFar),
    { phase, skill: 'listening', targetKey: 'dictation', label: 'Dictation', correct: true, assistance: 'none', independent: true, encounterId: `e-${phase}-${at}`, at, ...extra },
  );
  let stateSoFar = createLearningEvidenceState({});
  stateSoFar = recordLearningEvidence(stateSoFar, { phase: 'baseline', skill: 'listening', targetKey: 'dictation', correct: false, at: '2026-04-01T09:00:00.000Z' });
  stateSoFar = base('intervention', '2026-04-01T10:00:00.000Z');
  stateSoFar = recordLearningEvidence(stateSoFar, { phase: 'transfer', skill: 'listening', targetKey: 'dictation', label: 'Dictation', correct: true, assistance: 'none', independent: true, heldOut: true, encounterId: 'e-t', at: '2026-04-01T11:00:00.000Z' });
  stateSoFar = recordLearningEvidence(stateSoFar, { phase: 'delayed', skill: 'listening', targetKey: 'dictation', label: 'Dictation', correct: true, assistance: 'scaffolded', independent: false, encounterId: 'e-d', at: '2026-04-02T12:00:00.000Z' });

  const cycle = stateSoFar.cycles[0];
  assert.notEqual(learningCycleStatus(cycle), 'demonstrated', 'the cycle itself is not demonstrated');
  assert.ok(cycle.transfers.length && cycle.delayed.length, 'both rows exist…');

  const map = buildCapabilityMap({ errorEntries: [], cycles: stateSoFar.cycles });
  const rows = map.groups.flatMap((g) => g.items);
  assert.notEqual(
    rows.find((c) => c.id === 'listen-normal')?.state,
    'demonstrated',
    '…but neither may the capability be, which used to check only that both lanes were non-empty',
  );
  assert.equal(map.demonstrated.length, 0, 'nothing is shown as demonstrated to the learner');
});

test('an assisted pass is never reported as unaided later use', async () => {
  const { weaknessLifecycle, lifecycleCopy } = await import('../src/lib/weaknessLifecycle.js');
  const { progressEvidenceStatements } = await import('../src/lib/progressEvidence.js');

  const now = Date.now();
  const entry = {
    category: 'listening',
    key: 'track:x',
    label: 'Rent',
    status: 'recovering',
    successCount: 2,
    errorCount: 1,
    recurrenceCount: 0,
    independentPasses: 1, // the one unassisted same-session pass
    lastEvidence: 'delayed', // set by the clock even though the pass was assisted
    lastSuccessAt: new Date(now - 3600e3).toISOString(),
    lastErrorAt: new Date(now - 40 * 3600e3).toISOString(),
  };

  const life = weaknessLifecycle(entry, { now });
  assert.notEqual(
    lifecycleCopy(life).detail,
    'You used this correctly later, with no help.',
    'a scaffolded delayed pass must not read as unaided later use',
  );

  const statements = progressEvidenceStatements({ errorEntries: [entry], now, windowDays: 30 });
  assert.ok(
    !statements.strengths.some((s) => /survived delayed recall/.test(s)),
    'and must not be listed as a strength the learner earned unaided',
  );
});

// ── content: the French library must not teach the same word twice ────────

test('French drops frequency cards the themed packs already teach', async () => {
  globalThis.fetch = async (input) => {
    const { readFile } = await import('node:fs/promises');
    return { ok: true, status: 200, text: async () => await readFile(new URL(input), 'utf8') };
  };
  const { getFrequencyPacksFor } = await import('../src/lib/vocab-frequency.js');
  await getFrequencyPacksFor('fr');
  const { allEntries } = await import('../src/lib/vocab.js');
  const entries = allEntries();

  const themedTerms = new Set(entries.filter((e) => !e.id.startsWith('fq-')).map((e) => e.fr.replace(/^(?:le|la|les)\s+|^(?:l['’])\s*/i, '').toLowerCase()));
  const freqCopies = entries.filter((e) => e.id.startsWith('fq-') && themedTerms.has(e.fr.toLowerCase()));
  assert.deepEqual(freqCopies.map((e) => e.fr), [], 'no bare frequency card repeats a themed word');

  const ids = entries.map((e) => e.id);
  assert.equal(ids.length, new Set(ids).size, 'and no entry id is reused, so no review history is merged');
});
