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

async function fresh() {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}.${Math.random()}`;
  const storage = await import(`../src/lib/storage.js?v=${stamp}`);
  const studyFlow = await import(`../src/lib/studyFlow.js?sf=${stamp}`);
  const consent = await import(`../src/lib/studyConsent.js?sc=${stamp}`);
  const bank = await import(`../src/lib/heldOutBank.js?hb=${stamp}`);
  const aggregation = await import(`../src/lib/researchAggregation.js?ra=${stamp}`);
  const evidenceStudy = await import('../src/lib/evidenceStudy.js');
  return { storage, studyFlow, consent, bank, aggregation, evidenceStudy };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

// ── consent: refusal, acceptance, withdrawal ───────────────────────────────

test('nothing is created before explicit consent — no id, no arm, no rows', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.enrolStudyState({ startLevel: 'B1' }); // Today opens — no consent yet
  assert.equal(storage.getStudyState(), null, 'no participant record');
  assert.equal(storage.getStudyConsent(), null, 'no consent record');
  assert.deepEqual(storage.getStudyOutcomes(), [], 'no outcome rows');
  assert.deepEqual(storage.getStudyChecks(), [], 'no check records');
});

test('refusal is recorded, sticky, and never enrols', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.recordStudyConsent('declined');
  assert.equal(storage.getStudyConsent().decision, 'declined');
  assert.equal(studyFlow.enrolStudyState({}), null);
  assert.equal(storage.getStudyState(), null);
  assert.equal(studyFlow.learnerHasDeclined(), true);
});

test('malformed consent decisions are rejected at the source', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  assert.equal(studyFlow.recordStudyConsent('sure-why-not'), null);
  assert.equal(storage.getStudyConsent(), null);
});

test('withdrawal deletes outcomes+checks, keeps consent trail, blocks silent re-enrol', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'A2' });
  studyFlow.startOutcomeRecord({ trial: { at: new Date().toISOString(), variant: s.arm, selectedId: 'mg-1' }, graph: [], arm: s.arm, day: 1 });
  studyFlow.withdrawStudyState({ deleteData: true });
  assert.equal(storage.getStudyState().status, 'withdrawn');
  assert.deepEqual(storage.getStudyOutcomes(), []);
  assert.equal(storage.getStudyConsent().decision, 'accepted', 'consent trail preserved');
  // And the withdrawn record blocks silent re-enrolment.
  const again = studyFlow.enrolStudyState({});
  assert.equal(again.status, 'withdrawn');
  assert.equal(studyFlow.studyConsentState(), 'accepted', 'consent state separate from study state');
});

// ── learner isolation (household namespaces) ───────────────────────────────

test('household members have fully independent learner state', async () => {
  const f = await fresh();
  const { storage } = f;
  const a = storage.addHouseholdMember('Amélie');
  const b = storage.addHouseholdMember('Benoît');
  // Amélie is active (first member): her XP write lands in her namespace.
  storage.addXp(50);
  storage.switchHouseholdMember(b.id);
  storage.addXp(7);
  // Switch back to Amélie: her XP is intact, and she can't see Ben's.
  storage.switchHouseholdMember(a.id);
  assert.equal(storage.getXp(), 50, 'Amélie keeps her own XP');
  storage.switchHouseholdMember(b.id);
  assert.equal(storage.getXp(), 7, 'Benoît has his own XP, no bleed');
  assert.notEqual(storage.getXp(), 50);
});

test('SRS, mistake graph, notebook and study state are per-member', async () => {
  const f = await fresh();
  const { storage, studyFlow } = f;
  const a = storage.addHouseholdMember('A');
  const b = storage.addHouseholdMember('B');
  storage.addXp(10);
  storage.rateCard('word-1', 'good', {});
  studyFlow.recordStudyConsent('accepted', { enrol: { startLevel: 'B1' } });
  const aState = storage.getStudyState();
  storage.switchHouseholdMember(b.id);
  // Ben starts empty: no XP, no SRS card, no study state.
  assert.equal(storage.getXp(), 0);
  assert.deepEqual(storage.getSrs(), {});
  assert.equal(storage.getStudyState(), null, 'study state is per-learner');
  // Ben consents separately — separate participant record.
  const bState = (() => { studyFlow.recordStudyConsent('accepted', { enrol: {} }); return storage.getStudyState(); })();
  assert.ok(bState);
  assert.notEqual(bState.participantId, aState.participantId, 'independent participants');
  void a; void b;
});

test('migration: the first member inherits existing single-user data; later members start empty', async () => {
  const f = await fresh();
  const { storage } = f;
  // Pre-household single-user data:
  storage.addXp(123);
  storage.rateCard('legacy-word', 'good', {});
  const xpBefore = 123;
  const srsBefore = Object.keys(storage.getSrs());
  // A household appears:
  const a = storage.addHouseholdMember('First');
  assert.equal(storage.getXp(), xpBefore, 'first member inherits the legacy XP');
  assert.deepEqual(Object.keys(storage.getSrs()), srsBefore, 'first member inherits the SRS');
  // A second member starts empty — and the first member keeps everything.
  const b = storage.addHouseholdMember('Second');
  storage.switchHouseholdMember(b.id);
  assert.equal(storage.getXp(), 0, 'second member does not inherit');
  storage.switchHouseholdMember(a.id);
  assert.equal(storage.getXp(), xpBefore, 'nothing orphaned from the first member');
  void a; void b;
});

test('purgeLearnerData removes only that member\'s namespace', async () => {
  const f = await fresh();
  const { storage } = f;
  const a = storage.addHouseholdMember('A');
  storage.addXp(11);
  const b = storage.addHouseholdMember('B');
  storage.switchHouseholdMember(b.id);
  storage.addXp(22);
  const purged = storage.purgeLearnerData(b.id);
  assert.ok(purged > 0);
  assert.equal(storage.getXp(), 0, 'B wiped');
  storage.switchHouseholdMember(a.id);
  assert.equal(storage.getXp(), 11, 'A untouched');
});

// ── CEFR-matched held-out bank ─────────────────────────────────────────────

test('the bank validates: every item tagged, provenance and review status present', async () => {
  const f = await fresh();
  const { bank } = f;
  const v = bank.validateBank();
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.ok(v.n >= 20, 'bank has a usable item count');
});

test('held-out selection is CEFR-matched, verified-only, and excludes drafts', async () => {
  const f = await fresh();
  const { bank } = f;
  const seen = new Set();
  const items = bank.selectHeldOutItems({ participantId: 'p1', day: 2, level: 'B1', seenIds: seen, limit: 4 });
  assert.equal(items.length, 4);
  for (const item of items) {
    assert.equal(item.reviewStatus, 'verified', 'drafts/in-review never selected');
    assert.ok(['B1', 'A2', 'B2'].includes(item.cefr), 'own band or ONE adjacent band');
    assert.ok(item.provenance && item.difficulty >= 1 && item.difficulty <= 5, 'full assessment metadata');
  }
  // B1 with every B1 item seen: adjacent fallback only (A2/B2), never A1/C1.
  const allB1 = bank.HELDOUT_BANK.filter((i) => i.cefr === 'B1').map((i) => i.id);
  const items2 = bank.selectHeldOutItems({ participantId: 'p2', day: 3, level: 'B1', seenIds: new Set(allB1), limit: 6 });
  for (const item of items2) assert.ok(['A2', 'B2'].includes(item.cefr), 'tight adjacency only');
});

test('contamination prevention: held-out items are namespaced away from practice content', async () => {
  const f = await fresh();
  const { bank, storage, studyFlow, evidenceStudy } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const pool = evidenceStudy.buildHeldOutPool({ participantId: s.participantId, day: 3, level: 'B1' });
  const chk = studyFlow.saveCheckRecord(studyFlow.makeCheckRecord({ participantId: s.participantId, day: 3, level: 'B1', pool }));
  studyFlow.recordCheckOutcome(chk.id, { correct: 3, total: 4 });
  // Every held-out id is bank-namespaced; none can enter SRS or the graph.
  for (const id of chk.wordIds) {
    assert.ok(id.startsWith('chk-'), `${id} is a bank id`);
    assert.equal(storage.getSrs()[id], undefined, 'held-out id never in SRS');
    assert.equal(storage.getMistakeGraph().some((m) => m.id === id), false, 'held-out id never in graph');
  }
  // Selection inputs are empty — the engine cannot learn from held-out items.
  const { dueRetests } = await import(`../src/lib/mistakeGraph.js?mg=${Date.now()}`);
  assert.equal(dueRetests(storage.getMistakeGraph()).length, 0);
});

// ── research aggregation ───────────────────────────────────────────────────

function mkBundle(pid, arm, { outcomes = [], version = 2, corruptOutcome = null, wrongArm = null } = {}) {
  return {
    format: 'le-studio.validation-study',
    version,
    exportedAt: new Date().toISOString(),
    stores: {},
    study: wrongArm
      ? { participantId: pid, arm: wrongArm, startLevel: 'B1', enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: 1 }
      : { participantId: pid, arm, startLevel: 'B1', enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: 1 },
    studyOutcomes: corruptOutcome ? [corruptOutcome] : outcomes,
    studyChecks: [],
  };
}

test('pooled aggregation: dedupe, schema validation, malformed rejection', async () => {
  const f = await fresh();
  const { aggregation } = f;
  const goodOutcome = (i, arm) => ({
    id: `out-${i}`, at: new Date().toISOString(), variant: arm, selectedId: `mg-${i}`,
    immediate: null, delayedShort: { correct: true, at: new Date().toISOString(), delayDays: 2 },
    delayedLong: null, transfer: null, recurred: null,
  });
  const local = { participantId: 'participant-local', arm: 'adaptive', startLevel: 'B1', enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: 1 };
  // 8 adaptive + 8 balanced participants (multi-session each) — powered pool.
  const armBundle = (pid, arm) => mkBundle(pid, arm, {
    outcomes: Array.from({ length: 9 }, (_, i) => goodOutcome(`${pid}-${i}`, arm)),
  });
  const imports = [];
  for (let p = 1; p <= 7; p++) imports.push(armBundle(`participant-a${p}`, 'adaptive'));
  for (let p = 1; p <= 8; p++) imports.push(armBundle(`participant-b${p}`, 'balanced'));
  const pool = aggregation.poolStudyData({
    localStudy: local,
    localOutcomes: Array.from({ length: 9 }, (_, i) => goodOutcome(`local-${i}`, 'adaptive')),
    imports,
  });
  assert.equal(pool.participants, 16, 'local + 8 imported adaptive + 8 balanced (1 adaptive imported duplicates local? no — distinct ids)');
  assert.equal(pool.participantsByArm.adaptive, 8);
  assert.equal(pool.participantsByArm.balanced, 8);
  assert.equal(pool.outcomes.length, 16 * 9);
  // Participant-level gates: comparable requires participants per arm, not rows.
  assert.equal(pool.comparison.comparison.comparable, true, 'both arms clear the participant floor');
  assert.equal(pool.comparison.adaptive.participants, 8);
  assert.equal(pool.comparison.balanced.participants, 8);
  // One learner with many sessions must NOT inflate the participant count.
  const oneBusy = aggregation.poolStudyData({
    localStudy: null, localOutcomes: [],
    imports: [armBundle('participant-solo', 'adaptive')],
  });
  assert.equal(oneBusy.comparison.adaptive.participants, 1, 'many sessions, ONE participant');
  assert.equal(oneBusy.comparison.adaptive.sessions, 9, 'sessions counted separately');
  // Identical re-import dedupes; conflicting arm is rejected.
  const balancedImports = imports.filter((b) => b.study.arm === 'balanced');
  const pool2 = aggregation.poolStudyData({
    localStudy: null, localOutcomes: [],
    imports: [...balancedImports, armBundle('participant-b1', 'balanced'), mkBundle('participant-b1', 'adaptive', { outcomes: [] })],
  });
  assert.equal(pool2.participants, 8, 'no duplicate participants');
  assert.equal(pool2.rejected.length, 1, 'conflicting duplicate rejected');
  assert.match(pool2.rejected[0].errors[0], /conflicting/);
});

test('malformed and version-mismatched bundles are rejected, never merged', async () => {
  const f = await fresh();
  const { aggregation, storage } = f;
  const badVersion = mkBundle('participant-v1', 'adaptive', { version: 1 });
  const badOutcome = mkBundle('participant-bad', 'adaptive', {
    corruptOutcome: { id: 'out-x', variant: 'chaos-arm' },
  });
  const noThetaLeak = mkBundle('participant-theta', 'adaptive');
  noThetaLeak.study.startTheta = 0.4; // theta must never leave a device
  const r1 = aggregation.validateImportedBundle(badVersion);
  assert.equal(r1.ok, false);
  assert.match(r1.errors[0], /version/);
  const r2 = aggregation.validateImportedBundle(badOutcome);
  assert.equal(r2.ok, false);
  const r3 = aggregation.validateImportedBundle(noThetaLeak);
  assert.equal(r3.ok, false, 'theta-bearing bundles rejected');
  // And none of it lands in the local learner's practice stores.
  aggregation.poolStudyData({ localStudy: null, localOutcomes: [], imports: [badVersion, badOutcome, noThetaLeak] });
  assert.deepEqual(storage.getStudyOutcomes(), []);
});

test('imported bundles never write into learner practice stores', async () => {
  const f = await fresh();
  const { storage } = f;
  const bundle = mkBundle('participant-imp', 'balanced', {
    outcomes: [{ id: 'out-imp-1', at: new Date().toISOString(), variant: 'balanced', selectedId: 'mg-imp' }],
  });
  const report = storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(report.ok, true);
  assert.equal(report.added.studyAggregates, 1);
  // The import goes to the aggregation store only.
  assert.equal(storage.getStudyOutcomes().length, 0, 'local outcomes untouched');
  assert.deepEqual(storage.getMistakeGraph(), [], 'graph untouched');
  assert.deepEqual(storage.getSrs(), {}, 'SRS untouched');
  assert.equal(storage.getImportedStudyBundles().length, 1);
});

// ── household switching mid-study ──────────────────────────────────────────

test('switching household members switches study participants with them', async () => {
  const f = await fresh();
  const { storage, studyFlow } = f;
  const a = storage.addHouseholdMember('A');
  studyFlow.recordStudyConsent('accepted', { enrol: { startLevel: 'B1' } });
  const aStudy = storage.getStudyState();
  storage.switchHouseholdMember(storage.addHouseholdMember('B').id);
  studyFlow.recordStudyConsent('accepted', { enrol: { startLevel: 'A2' } });
  const bStudy = storage.getStudyState();
  assert.notEqual(aStudy.participantId, bStudy.participantId);
  assert.equal(bStudy.startLevel, 'A2', "B's own starting band");
  storage.switchHouseholdMember(a.id);
  assert.equal(storage.getStudyState().participantId, aStudy.participantId, 'A returns to their own study');
});
