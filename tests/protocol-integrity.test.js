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
  const protocol = await import('../src/lib/studyProtocol.js');
  const evidenceStudy = await import('../src/lib/evidenceStudy.js');
  const aggregation = await import(`../src/lib/researchAggregation.js?ra=${stamp}`);
  const bank = await import(`../src/lib/heldOutBank.js?hb=${stamp}`);
  return { storage, studyFlow, protocol, evidenceStudy, aggregation, bank };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

// ── protocol integrity ─────────────────────────────────────────────────────

test('the protocol is complete, versioned, and internally consistent', async () => {
  const { protocol, bank } = await fresh();
  assert.equal(protocol.PROTOCOL_VERSION, 1);
  const p = protocol.PROTOCOL;
  assert.equal(p.outcomes.primary, 'delayedShort');
  assert.equal(p.outcomes.immediateCountsAsEvidence, false);
  assert.equal(p.delayedWindows.short.minDays, 1);
  assert.equal(p.delayedWindows.short.maxDays, 3);
  assert.equal(p.delayedWindows.long.minDays, 7);
  assert.equal(p.minSamples.participantsPerArm, 8);
  assert.equal(p.analysis.unit, 'participant');
  assert.equal(p.transfer.measurementOnly, true);
  assert.equal(p.transfer.overallScoreAllowed, false);
  assert.equal(p.heldOutBankVersion, bank.HELDOUT_BANK_VERSION, 'protocol pins the bank version');
  assert.ok(p.exclusions.length >= 3, 'exclusion rules pre-registered');
  const rec = protocol.protocolRecord();
  assert.equal(rec.protocolVersion, protocol.PROTOCOL_VERSION);
  assert.equal(rec.frozen, true);
});

test('every enrolment records the protocol version it was collected under', async () => {
  const f = await fresh();
  const { storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  assert.equal(s.protocolVersion, 1);
  assert.equal(storage.getStudyState().protocolVersion, 1);
});

test('protocolCompatibility: records from future protocols pause collection', async () => {
  const { protocol } = await fresh();
  assert.equal(protocol.protocolCompatible({ protocolVersion: 1 }).ok, true);
  assert.equal(protocol.protocolCompatible({ protocolVersion: 2 }).ok, false, 'newer than this build');
  assert.equal(protocol.protocolCompatible({}).ok, false, 'missing version');
  assert.equal(protocol.protocolCompatible(null).ok, false);
});

test('writes stop when the study record carries an unknown/future protocol', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.recordStudyConsent('accepted');
  // Simulate a participant enrolled under a NEWER protocol (e.g. downgraded app).
  localStorage.setItem('fp.study.state.v1', JSON.stringify({
    status: 'active', participantId: 'participant-future', arm: 'adaptive', protocolVersion: 99,
  }));
  assert.equal(studyFlow.canRecordStudyData(), true, 'consent layer alone would pass');
  studyFlow.startOutcomeRecord({ trial: { at: new Date().toISOString(), variant: 'adaptive', selectedId: 'mg-1' }, graph: [], arm: 'adaptive' });
  assert.deepEqual(JSON.parse(localStorage.getItem('fp.study.outcomes.v1') || '[]'), [], 'future protocol blocks research writes');
  // A KNOWN older protocol still collects (backwards compatible).
  localStorage.setItem('fp.study.state.v1', JSON.stringify({
    status: 'active', participantId: 'participant-old', arm: 'adaptive', protocolVersion: 1,
  }));
  studyFlow.startOutcomeRecord({ trial: { at: new Date().toISOString(), variant: 'adaptive', selectedId: 'mg-2' }, graph: [], arm: 'adaptive' });
  assert.equal(JSON.parse(localStorage.getItem('fp.study.outcomes.v1')).length, 1);
});

test('aggregation rejects bundles from newer protocols and keeps older ones', async () => {
  const f = await fresh();
  const { aggregation } = f;
  const bundle = (pid, version) => ({
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: { participantId: pid, arm: 'adaptive', enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: version },
    studyOutcomes: [], studyChecks: [],
  });
  const good = aggregation.poolStudyData({ imports: [bundle('participant-v1', 1)] });
  assert.equal(good.participants, 1, 'protocol v1 accepted');
  const bad = aggregation.poolStudyData({ imports: [bundle('participant-v9', 9)] });
  assert.equal(bad.participants, 0);
  assert.equal(bad.rejected.length, 1);
  assert.ok(bad.rejected[0].errors.some((e) => /invalid/.test(e)), 'future protocol rejected');
});

// ── export dataset contract ────────────────────────────────────────────────

test('export carries the full participant dataset contract; import preserves it', async () => {
  const f = await fresh();
  const { storage, studyFlow } = f;
  storage.saveSession({ scenarioId: 'bistro', turns: 3, report: { average_scores: { overall: 58 } } });
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({
    trial, graph: [], arm: s.arm, day: 1,
    consistency: { ok: true, expected: s.arm, reason: null },
    // delivered/consistency fields ride the outcome row
  });
  studyFlow.updateOutcomeDelivery({ trialAt: trial.at, timeSpent: 480, completed: true, delivered: [{ id: 'drill', seconds: 210, skipped: false }] });
  const bundle = storage.buildStudyBundle();
  // Contract fields:
  assert.equal(bundle.protocol.protocolVersion, 1, 'frozen protocol travels');
  const study = bundle.study;
  assert.ok(study.participantId.startsWith('participant-'));
  assert.ok(['adaptive', 'balanced'].includes(study.arm));
  assert.ok(Number.isInteger(study.protocolVersion));
  assert.ok(Number.isInteger(study.engineVersion));
  assert.ok(Number.isInteger(study.schemaVersion));
  assert.equal(study.enrolledAt, s.enrolledAt);
  assert.equal(study.startLevel, 'B1');
  assert.equal(study.status, 'active');
  assert.ok(study.baseline, 'baseline travels');
  assert.ok(study.baseline.capturedAt, 'baseline timestamped');
  assert.equal(study.startTheta, null, 'no raw ability estimate leaves the device');
  // Outcome rows: labels + delivery + consistency
  const row = bundle.studyOutcomes[0];
  assert.equal(row.variant, s.arm);
  assert.equal(row.completed, true);
  assert.equal(row.timeSpent, 480);
  assert.deepEqual(row.delivered, [{ id: 'drill', seconds: 210, skipped: false }]);
  assert.equal(row.treatmentConsistency.ok, true);
  // No personal content anywhere in the study streams:
  const blob = JSON.stringify({ study: bundle.study, outcomes: bundle.studyOutcomes, checks: bundle.studyChecks, protocol: bundle.protocol });
  assert.ok(!blob.includes('bistro'), 'scenario content never exported');
  assert.ok(!blob.includes('mg-1') === false, 'concept ids are structural, allowed');
  // Import round trip preserves contract fields.
  const f2 = await fresh();
  const report = f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  const imported = f2.storage.getImportedStudyBundles()[0];
  assert.equal(imported.study.protocolVersion, 1);
  assert.equal(imported.outcomes[0].treatmentConsistency.ok, true);
  assert.equal(imported.outcomes[0].delivered[0].seconds, 210);
  assert.ok(imported.study.baseline, 'baseline survives import');
});

// ── baseline integrity ─────────────────────────────────────────────────────

test('baselines preserve nulls: unmeasured never becomes zero', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy } = f;
  // Learner with NO sessions: speaking average must be null, not 0.
  const s = consentAndEnrol(f, { startLevel: 'A2' });
  const b = storage.getStudyState().baseline;
  assert.equal(b.speakingAverage, null, 'no sessions → null, never 0');
  assert.equal(b.transferScore, null);
  assert.equal(b.delayedShortRecall, null);
  assert.ok(b.capturedAt);
  void s;
  // cleanBaseline hard guarantee:
  const cleaned = evidenceStudy.cleanBaseline({ speakingAverage: null, transferScore: undefined, delayedShortRecall: 55 });
  assert.equal(cleaned.speakingAverage, null);
  assert.equal(cleaned.transferScore, null);
  assert.equal(cleaned.delayedShortRecall, 55);
});

test('baseline speaking average only averages sessions that actually have the metric', async () => {
  const f = await fresh();
  const { storage, studyFlow } = f;
  // Three sessions; two carry scores, one does not (missing report).
  storage.saveSession({ scenarioId: 'a', turns: 2, report: { average_scores: { overall: 60 } } });
  storage.saveSession({ scenarioId: 'b', turns: 2, report: { average_scores: { overall: 80 } } });
  storage.saveSession({ scenarioId: 'c', turns: 2, report: null });
  consentAndEnrol(f, { startLevel: 'B1' });
  const b = storage.getStudyState().baseline;
  assert.equal(b.speakingAverage, 70, 'mean of the two real observations only (60, 80), missing excluded');
});

test('baselines travel: enrol → export → import → pool → analysis', async () => {
  const f = await fresh();
  const { storage, studyFlow, evidenceStudy } = f;
  storage.saveSession({ scenarioId: 'x', turns: 2, report: { average_scores: { overall: 45 } } });
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 0 });
  const bundle = storage.buildStudyBundle();
  // Import into a second device and pool:
  const f2 = await fresh();
  f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  const imports = f2.storage.getImportedStudyBundles();
  assert.equal(imports.length, 1, 'fixture sanity: one imported bundle');
  const localStudy2 = { participantId: 'participant-second', arm: 'balanced', enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: 1, baseline: { speakingAverage: 70 } };
  const pool = f2.aggregation.poolStudyData({ localStudy: localStudy2, localOutcomes: [], imports });
  assert.equal(pool.participants, 2, 'imported participant + the second-device local participant');
  // The imported participant has outcome rows → its summary exists; the
  // fresh local participant has none yet (no phantom rows invented).
  assert.equal(pool.summaries.length, 1);
  // changeFromBaseline sees the imported baseline through the analysis layer:
  const changes = evidenceStudy.changeFromBaseline(pool.summaries, {
    studiesById: Object.fromEntries(pool.summaries.map((sm) => [sm.participantId, { baseline: bundle.study.baseline }])),
  });
  assert.equal(changes.length, 1);
  const importedChange = changes[0];
  assert.equal(importedChange.participantId, s.participantId);
  assert.equal(importedChange.baseline.speakingAverage, 45, 'imported baseline reached the analysis layer');
  assert.equal(importedChange.delta.speaking, null, 'no post measure yet → delta null, never zero');
});

// ── per-skill transfer separation ──────────────────────────────────────────

test('held-out checks record per-skill composition; skills never merge silently', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy, bank } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const mixedPool = evidenceStudy.buildHeldOutPool({
    participantId: s.participantId, day: 3, level: 'B1', limit: 6,
    skills: ['vocabulary', 'grammar'],
  });
  const chk = studyFlow.saveCheckRecord(studyFlow.makeCheckRecord({
    participantId: s.participantId, day: 3, level: 'B1', pool: mixedPool,
  }));
  assert.ok(chk.skills.includes('vocabulary'));
  assert.ok(chk.skills.includes('grammar'));
  assert.equal(bank.HELDOUT_SKILLS.includes('vocabulary'), true);
  // protocol declares per-skill reporting with no overall score
  const { PROTOCOL } = await import('../src/lib/studyProtocol.js');
  assert.equal(PROTOCOL.transfer.overallScoreAllowed, false);
  assert.ok(PROTOCOL.transfer.reportedPerSkill.includes('grammar'));
});

test('per-skill selection isolates skills even when the pool mixes requests', async () => {
  const { bank } = await fresh();
  const listening = bank.selectHeldOutItems({ participantId: 'p1', day: 4, level: 'B1', skills: ['listening'], limit: 4 });
  assert.ok(listening.length >= 1, 'listening bank has verified B1-adjacent items');
  assert.ok(listening.every((i) => i.skill === 'listening'));
  const reading = bank.selectHeldOutItems({ participantId: 'p2', day: 4, level: 'B1', skills: ['reading'], limit: 4 });
  assert.ok(reading.every((i) => i.skill === 'reading'));
});
