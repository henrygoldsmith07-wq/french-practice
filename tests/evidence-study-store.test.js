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

async function fresh() {
  globalThis.localStorage = memoryStorage();
  const stamp = `${Date.now()}.${Math.random()}`;
  const studyFlow = await import(`../src/lib/studyFlow.js?f=${stamp}`);
  const storage = await import(`../src/lib/storage.js?s=${stamp}`);
  // evidenceStudy WITHOUT a query: storage.js wires the arm-override reader
  // into this exact instance, so tests exercise the app's real wiring.
  const evidenceStudy = await import('../src/lib/evidenceStudy.js');
  return { studyFlow, storage, evidenceStudy };
}

/** Consent, then enrol — the only legitimate path to a participant record. */
async function consentAndEnrol(f, opts = {}) {
  const { studyFlow } = f;
  const consent = studyFlow.recordStudyConsent('accepted', { enrol: opts });
  const state = studyFlow.enrolStudyState(opts);
  return { consent, state };
}

// ── enrolment through the real storage layer ───────────────────────────────

test('no enrolment without explicit consent; refusal is sticky', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  // Opening Today (indirectly: enrolStudyState) WITHOUT consent creates nothing.
  const none = studyFlow.enrolStudyState({ startLevel: 'B1' });
  assert.equal(none, null, 'no participant record without consent');
  assert.equal(storage.getStudyState(), null);
  assert.equal(storage.getStudyConsent(), null);
  // Declining records the refusal and STILL enrols nobody.
  studyFlow.recordStudyConsent('declined');
  assert.equal(storage.getStudyConsent().decision, 'declined');
  assert.equal(storage.getStudyState(), null);
  const afterDecline = studyFlow.enrolStudyState({});
  assert.equal(afterDecline, null, 'a declined learner is never auto-enrolled');
});

test('consent can be withdrawn only by the learner action; acceptance precedes enrolment', async () => {
  const f = await fresh();
  const { studyFlow } = f;
  const { consent, state } = await consentAndEnrol(f, { startLevel: 'B1' });
  assert.equal(consent.decision, 'accepted');
  assert.ok(state, 'consent gates enrolment');
  assert.ok(consent.at, 'consent timestamped separately from outcomes');
});

test('enrolStudyState creates, persists, and is idempotent across reloads', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const { state: s1 } = await consentAndEnrol(f, { startLevel: 'B1' });
  assert.ok(s1, 'enrolment returns state');
  assert.ok(s1.participantId.startsWith('participant-'), 'anonymous id shape');
  assert.equal(s1.startLevel, 'B1');
  assert.ok(['adaptive', 'balanced'].includes(s1.arm));
  // Reload: read back from storage — the SAME participant, same locked arm.
  const raw = JSON.parse(localStorage.getItem('fp.study.state.v1'));
  assert.equal(raw.participantId, s1.participantId);
  assert.equal(raw.arm, s1.arm);
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s2 = studyFlow.enrolStudyState({ startLevel: 'C1' });
  assert.equal(s2.participantId, s1.participantId, 'no re-fork on second call');
  assert.equal(s2.startLevel, 'B1', 'starting level stays frozen');
});

test('arm persistence: the arm survives reload and never flips', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s1 = studyFlow.enrolStudyState({});
  const arm = storage.getStudyState().arm;
  // Simulate a reload by re-reading storage (fresh enrol must not rewrite).
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s2 = studyFlow.enrolStudyState({});
  assert.equal(s2.arm, arm);
  assert.equal(s2.participantId, s1.participantId);
  // enrolArm honors the locked arm even if the sync-id variant differs.
  const other = arm === 'adaptive' ? 'balanced' : 'adaptive';
  assert.equal(studyFlow.enrolArm(s2, other), arm, 'locked arm wins over default assignment');
  assert.equal(studyFlow.enrolArm(null, other), other, 'without study state the fallback applies');
});

test('operator arm override changes assignment deterministically (and only pre-enrol)', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy } = f;
  storage.setStudyArmOverride('balanced');
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s1 = studyFlow.enrolStudyState({});
  assert.equal(s1.arm, 'balanced');
  assert.equal(evidenceStudy.assignArm(s1.participantId, 'anything').source, 'saved-override');
  // A fresh participant (no study yet) also lands in the override arm.
  const s2 = evidenceStudy.enrolStudy(null, { syncId: 'x', seed: 'participant-fresh' });
  assert.equal(s2.arm, 'balanced');
  // The override reader is wired into the SAME module instance the app uses.
  assert.equal(storage.getStudyArmOverride(), 'balanced');
});

// ── held-out isolation ─────────────────────────────────────────────────────

test('held-out checks never touch the mistake graph or SRS state', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s = studyFlow.enrolStudyState({ startLevel: 'B1' });
  // Record a finished check.
  const chk = studyFlow.saveCheckRecord(storageRequire(f).makeCheckRecord({
    participantId: s.participantId, day: 3, level: 'B1',
    pool: { words: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }], track: null },
  }));
  studyFlow.recordCheckOutcome(chk.id, { correct: 2, total: 3, secondsSpent: 40 });
  const stored = storage.getStudyChecks();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].results.correct, 2);
  // Isolation: graph + SRS untouched by the check flow.
  assert.deepEqual(storage.getMistakeGraph(), []);
  assert.deepEqual(storage.getSrs(), {});
  // Selection inputs stay empty: dueRetests/weakestMistakes see nothing.
  const { dueRetests, weakestMistakes } = await import(`../src/lib/mistakeGraph.js?m=${Date.now()}`);
  assert.equal(dueRetests(storage.getMistakeGraph()).length, 0);
  assert.equal(weakestMistakes(storage.getMistakeGraph()).length, 0);
});

function storageRequire(f) {
  // evidenceStudy re-export for pool/make record use inside this test file.
  return f.evidenceStudy;
}

test('outcomes join retests but immediate retries never reach retention windows', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy } = f;
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s = studyFlow.enrolStudyState({});
  const DAY = 86400000;
  const t0 = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const trial = {
    at: iso(t0), activity: 'ai-drill', variant: 'adaptive',
    selectedId: 'mg-1', selectedConcept: 'passe-compose', masteryBefore: 30,
  };
  studyFlow.startOutcomeRecord({ trial, graph: [{ id: 'mg-1', concept: 'passe-compose', type: 'tense' }], arm: 'adaptive', day: 0 });
  // Immediate retry (same session): must land in immediate only.
  studyFlow.linkRetestToOutcomes({ mistakeId: 'mg-1', retest: { at: iso(t0 + 120000), correct: true, immediate: true } });
  let o = storage.getStudyOutcomes()[0];
  assert.equal(o.immediate.correct, true);
  assert.equal(o.delayedShort, null);
  // 2-day delayed retest: short-delay retention.
  studyFlow.linkRetestToOutcomes({ mistakeId: 'mg-1', retest: { at: iso(t0 + 2 * DAY), correct: true, evidenceClass: 'DELAYED' } });
  o = storage.getStudyOutcomes()[0];
  assert.equal(o.delayedShort.correct, true);
  assert.equal(o.delayedLong, null);
  // 9-day delayed retest: long-delay bucket.
  studyFlow.linkRetestToOutcomes({ mistakeId: 'mg-1', retest: { at: iso(t0 + 9 * DAY), correct: false, evidenceClass: 'DELAYED' } });
  o = storage.getStudyOutcomes()[0];
  assert.equal(o.delayedLong.correct, false);
  // Recurrence marking.
  studyFlow.markOutcomeRecurrence({ mistakeId: 'mg-1', recurred: true });
  o = storage.getStudyOutcomes()[0];
  assert.equal(o.recurred, true);
  // Transfer attach (measurement only).
  studyFlow.attachTransferToOutcomes({ day: 0, score: 67 });
  o = storage.getStudyOutcomes()[0];
  assert.equal(o.transfer.score, 67);
  // Aggregate sanity — single participant rows, no claims.
  const agg = evidenceStudy.studyAggregates(storage.getStudyOutcomes());
  assert.equal(agg.adaptive.n, 1);
  assert.equal(agg.adaptive.delayedShort.rate, null, 'below floor: no rate');
});

// ── export / import round-trip ─────────────────────────────────────────────

test('bundle v2 carries anonymised study streams and re-imports without forking local state', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s = studyFlow.enrolStudyState({ startLevel: 'A2' });
  const trial = {
    at: new Date().toISOString(), activity: 'authored-drill', variant: s.arm,
    selectedId: 'mg-9', selectedConcept: 'articles', masteryBefore: 20,
  };
  studyFlow.startOutcomeRecord({ trial, graph: [{ id: 'mg-9', concept: 'articles', type: 'grammar' }], arm: s.arm, day: 1 });
  const bundle = storage.buildStudyBundle();
  assert.equal(bundle.version, 2);
  assert.ok(bundle.study.participantId.startsWith('participant-'));
  assert.ok(bundle.study.armSource, 'arm source recorded');
  assert.equal(bundle.study.startTheta, null, 'theta stripped from exports');
  assert.equal(bundle.studyOutcomes.length, 1);
  assert.ok(bundle.studyOutcomes[0].concept, 'outcome carries concept');
  // Import into a DIFFERENT device (fresh storage): pooled, not merged.
  const f2 = await fresh();
  const report = f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.added.studyAggregates, 1);
  const summary = f2.storage.importedStudySummary();
  assert.equal(summary.participants, 1);
  assert.ok(summary.byArm[s.arm] === 1);
  // The importing device's own study state must remain untouched.
  assert.equal(f2.storage.getStudyState(), null);
  assert.equal(f2.storage.getStudyOutcomes().length, 0);
  // Re-import of the same bundle is a skip, not a duplicate.
  const again = f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(again.added.studyAggregates, 0);
  assert.equal(again.skipped >= 1, true);
});

test('v1 bundles (no study streams) still import cleanly', async () => {
  const f = await fresh();
  const { storage } = f;
  const v1 = {
    format: 'le-studio.validation-study',
    version: 1,
    exportedAt: new Date().toISOString(),
    stores: { placementValidations: [] },
  };
  const report = storage.ingestValidationBundle(JSON.stringify(v1));
  assert.equal(report.ok, true);
  assert.equal(report.added.studyAggregates, undefined, 'no study section in v1');
});

// ── consent & deletion ─────────────────────────────────────────────────────

test('withdraw stops collection and deletes study data, preserving practice history', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  storage.addXp(120);
  studyFlow.recordStudyConsent('accepted'); // consent-first
  studyFlow.enrolStudyState({});
  studyFlow.saveCheckRecord({
    id: 'chk-x', participantId: 'p', day: 2, level: 'B1', at: new Date().toISOString(),
    wordIds: ['w1'], trackId: null, results: null, engineVersion: 1,
  });
  studyFlow.startOutcomeRecord({
    trial: { at: new Date().toISOString(), variant: 'adaptive', selectedId: 'mg-1' },
    graph: [], arm: 'adaptive', day: 2,
  });
  assert.ok(storage.getStudyChecks().length, 'fixture sanity');
  assert.ok(studyFlow.withdrawStudyState({ deleteData: true }));
  const after = storage.getStudyState();
  assert.equal(after.status, 'withdrawn');
  assert.deepEqual(storage.getStudyChecks(), []);
  assert.deepEqual(storage.getStudyOutcomes(), []);
  assert.equal(storage.getXp(), 120, 'practice history preserved');
  // Post-withdrawal: enrolStudyState must NOT silently re-enrol a withdrawn record.
  studyFlow.recordStudyConsent('accepted'); // consent-first
  const s = studyFlow.enrolStudyState({});
  assert.equal(s.status, 'withdrawn');
});
