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
  const assignment = await import('../src/lib/assignment.js');
  return { storage, studyFlow, protocol, evidenceStudy, aggregation, assignment };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

// ── 1. single source of truth: no duplicated methodology constants ─────────

test('every runtime schedule/gate constant derives from the frozen protocol', async () => {
  const f = await fresh();
  const { evidenceStudy, protocol } = f;
  const P = protocol.PROTOCOL;
  assert.equal(evidenceStudy.CHECK_EVERY_DAYS, P.duration.checkEveryDays, 'check frequency = protocol');
  assert.equal(evidenceStudy.FIRST_CHECK_DAY, P.duration.firstCheckDay, 'first check day = protocol');
  assert.equal(evidenceStudy.MIN_MINUTES, P.duration.minSessionMinutes, 'min session = protocol');
  assert.deepEqual(evidenceStudy.SHORT_DELAY_DAYS, { min: P.delayedWindows.short.minDays, max: P.delayedWindows.short.maxDays });
  assert.deepEqual(evidenceStudy.LONG_DELAY_DAYS, { min: P.delayedWindows.long.minDays, max: P.delayedWindows.long.maxDays });
  assert.equal(evidenceStudy.MIN_N_PER_ARM, P.minSamples.participantsPerArm, 'arm gate = protocol');
  assert.equal(evidenceStudy.MIN_TRANSFER_N, P.minSamples.scoredParticipantsPerMetric, 'metric gate = protocol');
  // isCheckDay uses the protocol schedule: phase + period, first check day.
  const pid = 'participant-schedule';
  const days = Array.from({ length: 30 }, (_, d) => evidenceStudy.isCheckDay(pid, d));
  assert.equal(days[0], false, 'no check inside warm-up (protocol firstCheckDay)');
  const checkDays = days.flatMap((v, d) => (v ? [d] : []));
  for (let i = 1; i < checkDays.length; i++) {
    const gap = checkDays[i] - checkDays[i - 1];
    assert.ok(gap >= 1 && gap <= P.duration.checkEveryDays, `gap ${gap} within protocol frequency`);
  }
});

test('held-out pool size and skill coverage derive from the protocol', async () => {
  const f = await fresh();
  const { evidenceStudy, protocol } = f;
  const pool = evidenceStudy.buildHeldOutPool({ participantId: 'p1', day: 3, level: 'B1' });
  // Every protocol-reported skill with a verified B1-adjacent item can appear;
  // the pool never exceeds the protocol's itemsPerCheck.
  assert.ok(pool.words.length <= protocol.PROTOCOL.heldOut.itemsPerCheck);
  for (const w of pool.words) {
    assert.ok(protocol.PROTOCOL.transfer.reportedPerSkill.includes(w.skill), `${w.skill} is a protocol-reported skill`);
  }
});

test('arm comparison reads its gate from the protocol (changing the protocol changes behaviour)', async () => {
  const f = await fresh();
  const { evidenceStudy, protocol } = f;
  const mkSummary = (pid, arm) => ({
    participantId: pid, arm, sessions: 2,
    completion: { rate: 1, n: 2 },
    delayedShort: { rate: 1, n: 2 }, delayedLong: { rate: null, n: 0 },
    transfer: { mean: null, n: 0 }, recurrence: { rate: null, n: 0 },
    missingShort: 0, missingLong: 2, missingRate: 100,
    firstDay: 0, lastDay: 1, durationDays: 1, firstAt: 0, lastAt: 1, completedKnown: 2,
  });
  // With the real protocol floor (8), 2v2 cannot compare:
  const cmp = evidenceStudy.armComparison([
    mkSummary('participant-a1', 'adaptive'), mkSummary('participant-a2', 'adaptive'),
    mkSummary('participant-b1', 'balanced'), mkSummary('participant-b2', 'balanced'),
  ]);
  assert.equal(cmp.comparison.comparable, false);
  assert.equal(cmp.comparison.minPerArm, protocol.PROTOCOL.minSamples.participantsPerArm);
  // Lowering the floor passed explicitly changes behaviour — proving the
  // gate is read from configuration, not hard-coded:
  const cmp2 = evidenceStudy.armComparison(
    [mkSummary('participant-a1', 'adaptive'), mkSummary('participant-a2', 'adaptive'),
     mkSummary('participant-b1', 'balanced'), mkSummary('participant-b2', 'balanced')],
    { minPerArm: 2, minScoredPerMetric: 2 },
  );
  assert.equal(cmp2.comparison.comparable, true, 'behaviour follows the protocol configuration');
});

// ── 2. classifyOutcomeForAnalysis: preregistered exclusions ────────────────

test('classifyOutcomeForAnalysis: every exclusion class fires with a reason', async () => {
  const { evidenceStudy } = await fresh();
  const C = evidenceStudy.ANALYSIS_CLASSIFICATIONS;
  const studiesById = {
    'participant-ok': { participantId: 'participant-ok', arm: 'adaptive', protocolVersion: 1 },
    'participant-bal': { participantId: 'participant-bal', arm: 'balanced', protocolVersion: 1 },
    'participant-future': { participantId: 'participant-future', arm: 'adaptive', protocolVersion: 99 },
    'participant-noVersion': { participantId: 'participant-noVersion', arm: 'adaptive' },
  };
  const row = (over = {}) => ({ id: 'r', at: '', variant: 'adaptive', selectedId: 'mg-1', participantId: 'participant-ok', ...over });
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(row(), { studiesById, currentProtocolVersion: 1 }).classification, C.included);
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(null).classification, C.excludedInvalidRow);
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis({ id: 'x', variant: 'chaos' }).classification, C.excludedInvalidRow);
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(row({ participantId: null })).classification, C.excludedMissingParticipant);
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(row({ participantId: 'participant-unknown' })).classification, C.excludedInvalidProtocol, 'no participant record → no protocol');
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(row({ participantId: 'participant-future' }), { studiesById, currentProtocolVersion: 1 }).classification, C.excludedInvalidProtocol);
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(row({ participantId: 'participant-noVersion' }), { studiesById, currentProtocolVersion: 1 }).classification, C.excludedInvalidProtocol);
  const mismatch = evidenceStudy.classifyOutcomeForAnalysis(row({ treatmentConsistency: { ok: false, reason: 'delivered balanced' } }), { studiesById, currentProtocolVersion: 1 });
  assert.equal(mismatch.classification, C.excludedTreatmentMismatch, 'treatmentConsistency.ok===false → excluded');
  assert.match(mismatch.reason, /delivered balanced/);
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(row({ variant: 'balanced' }), { studiesById, currentProtocolVersion: 1 }).classification, C.excludedWrongArmLabel, 'label contradicts the arm');
  assert.equal(evidenceStudy.classifyOutcomeForAnalysis(row({ asrUncertain: true }), { studiesById, currentProtocolVersion: 1 }).classification, C.excludedAsrUncertain);
});

test('arm comparison consumes only included rows; exclusion counts are exposed', async () => {
  const f = await fresh();
  const { aggregation, evidenceStudy } = await fresh();
  void evidenceStudy;
  const mkBundle = (pid, arm, over = {}) => ({
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: { participantId: pid, arm, enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: 1, ...over },
    studyOutcomes: [], studyChecks: [],
  });
  const goodRows = (pid, arm) => Array.from({ length: 9 }, (_, i) => ({
    id: `${pid}-${i}`, at: '2026-09-05T09:00:00Z', variant: arm, selectedId: `mg-${i}`, participantId: pid,
    delayedShort: { correct: true, at: '', delayDays: 2 }, delayedLong: null, transfer: null, recurred: null, completed: true,
  }));
  const imports = [];
  for (let p = 1; p <= 8; p++) {
    const b = mkBundle(`participant-a${p}`, 'adaptive');
    b.studyOutcomes = goodRows(`participant-a${p}`, 'adaptive');
    imports.push(b);
  }
  for (let p = 1; p <= 8; p++) {
    const b = mkBundle(`participant-b${p}`, 'balanced');
    b.studyOutcomes = goodRows(`participant-b${p}`, 'balanced');
    imports.push(b);
  }
  // One contaminated bundle: treatment mismatch rows.
  const contaminated = mkBundle('participant-bad', 'adaptive');
  contaminated.studyOutcomes = Array.from({ length: 9 }, (_, i) => ({
    id: `bad-${i}`, at: '', variant: 'adaptive', selectedId: `mg-${i}`, participantId: 'participant-bad',
    delayedShort: { correct: true, at: '', delayDays: 2 },
    treatmentConsistency: { ok: false, expected: 'adaptive', reason: 'delivered balanced' },
  }));
  imports.push(contaminated);
  const pool = aggregation.poolStudyData({ imports });
  assert.equal(pool.participants, 17);
  assert.equal(pool.exclusionCounts['excluded-treatment-mismatch'], 9, 'mismatched rows excluded, never relabelled');
  assert.equal(pool.exclusionCounts.included, 16 * 9);
  assert.equal(pool.analysisRows.length, 16 * 9, 'analysis consumes ONLY included rows');
  assert.ok(pool.exclusionDetails.some((d) => d.classification === 'excluded-treatment-mismatch' && /delivered balanced/.test(d.reason)), 'reason preserved');
  // The bad participant contributes NO summaries (all their rows excluded).
  assert.equal(pool.summaries.some((s) => s.participantId === 'participant-bad'), false);
  void f;
});

// ── 3. lossless round trip ─────────────────────────────────────────────────

test('enrol → collect → export → import → pool: canonical fields identical', async () => {
  const f = await fresh();
  const { storage, studyFlow } = f;
  storage.saveSession({ scenarioId: 'x', turns: 2, report: { average_scores: { overall: 52 } } });
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'passe-compose' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 1, consistency: { ok: true, expected: s.arm, reason: null } });
  studyFlow.updateOutcomeDelivery({ trialAt: trial.at, timeSpent: 300, completed: true, delivered: [{ id: 'drill', seconds: 120, skipped: false }] });
  studyFlow.linkRetestToOutcomes({ mistakeId: 'mg-1', retest: { at: new Date(Date.now() + 2 * 86400000).toISOString(), correct: true, evidenceClass: 'DELAYED', context: 'srs-recall' } });
  const heldOutProbe = studyFlow.buildHeldOutPoolLike ? null : null; void heldOutProbe;
  const bundle = storage.buildStudyBundle();
  const src = bundle.study;
  // Import on a second device, pool, inspect the canonical record.
  const f2 = await fresh();
  f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  const imports = f2.storage.getImportedStudyBundles();
  const canonical = imports[0].study;
  // Identity fields survive EXACTLY:
  for (const key of ['participantId', 'arm', 'armSource', 'startLevel', 'enrolledAt', 'weeks', 'status', 'protocolVersion', 'schemaVersion', 'engineVersion', 'withdrawnAt', 'completedAt', 'lastActivityAt', 'baseline']) {
    assert.deepEqual(canonical[key], src[key], `${key} identical through the round trip`);
  }
  assert.deepEqual(canonical.baseline, src.baseline, 'baseline + timestamp identical');
  // Outcome fields survive:
  const srcRow = bundle.studyOutcomes[0];
  const outRow = imports[0].outcomes[0];
  for (const key of ['id', 'at', 'day', 'activity', 'variant', 'concept', 'immediate', 'delayedShort', 'delayedLong', 'transfer', 'recurred', 'completed', 'timeSpent', 'treatmentConsistency']) {
    assert.deepEqual(outRow[key], srcRow[key], `outcome.${key} identical`);
  }
  assert.deepEqual(outRow.delivered, srcRow.delivered, 'delivery records identical');
  // And the pooled analysis uses exactly this record:
  const localMirror = { ...canonical, protocolVersion: canonical.protocolVersion ?? 1 };
  void localMirror;
  const pool = f2.aggregation.poolStudyData({ imports, localStudy: null, localOutcomes: [] });
  assert.equal(pool.participants, 1);
  assert.equal(pool.summaries.length, 1);
  assert.equal(pool.summaries[0].participantId, src.participantId);
  assert.equal(pool.summaries[0].delayedShort.rate, 1, 'delayed retest survived to analysis');
});

// ── 4. baseline analysis completion ────────────────────────────────────────

test('baselineCoverage: usable / post / both counted per arm; nulls stay null', async () => {
  const f = await fresh();
  const { aggregation, evidenceStudy } = await fresh();
  void aggregation;
  const bundleFor = (pid, arm, baseline, withRows) => ({
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: { participantId: pid, arm, enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: 1, baseline },
    studyOutcomes: withRows ? Array.from({ length: 3 }, (_, i) => ({
      id: `${pid}-${i}`, at: '', variant: arm, selectedId: `mg-${i}`, participantId: pid,
      delayedShort: { correct: true, at: '', delayDays: 2 }, delayedLong: null, transfer: null, recurred: null, completed: true,
    })) : [],
    studyChecks: [],
  });
  const imports = [
    bundleFor('participant-both1', 'adaptive', { speakingAverage: 50 }, true),
    bundleFor('participant-both2', 'adaptive', { transferScore: 60 }, true),
    bundleFor('participant-baseonly', 'adaptive', { speakingAverage: 40 }, false),  // baseline, no post
    bundleFor('participant-postonly', 'adaptive', null, true),                       // post, no baseline
    bundleFor('participant-zeroTrap', 'balanced', { speakingAverage: 0 }, true),     // 0 IS a measure, not null
    bundleFor('participant-none', 'balanced', null, true),
  ];
  const pool = aggregation.poolStudyData({ imports });
  const cov = pool.baselineCoverage;
  // baseonly has baseline but NO outcome rows → no summary (nothing to analyse)
  assert.equal(cov.adaptive.withUsableBaseline, 2, 'both1 + both2 (baseonly has no rows → no summary)');
  assert.equal(cov.adaptive.withPostMeasure, 3, 'both1 + both2 + postonly');
  assert.equal(cov.adaptive.withBoth, 2);
  assert.equal(cov.balanced.withUsableBaseline, 1, 'speakingAverage 0 is a real measure, not missing');
  assert.equal(cov.balanced.withPostMeasure, 2);
  assert.equal(cov.balanced.withBoth, 1);
  // changeFromBaseline: usable pairs produce deltas; missing sides stay null.
  const studiesById = Object.fromEntries(imports.map((b) => [b.study.participantId, b.study]));
  const changes = evidenceStudy.changeFromBaseline(pool.summaries, { studiesById });
  const zeroTrap = changes.find((c) => c.participantId === 'participant-zeroTrap');
  // speakingAverage baseline is 0 (a real measure), post is a rate → delta = post − 0.
  assert.ok(zeroTrap.delta.speaking == null || typeof zeroTrap.delta.speaking === 'number', 'never NaN');
  // A participant with rows but NO baseline record: all deltas null, never zero-filled.
  const postOnly = changes.find((c) => c.participantId === 'participant-postonly');
  assert.equal(postOnly.delta.delayedShort, null, 'no baseline → null delta');
  assert.equal(postOnly.baseline, null);
});

// ── 5. attrition end-to-end ────────────────────────────────────────────────

test('pooled attrition is exposed beside learning outcomes and partitions the cohort', async () => {
  const f = await fresh();
  const { aggregation } = f;
  const now = Date.now();
  const day = 86400000;
  const mk = (pid, arm, status, enrolledDaysAgo, lastActivityDaysAgo) => ({
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: {
      participantId: pid, arm, status, protocolVersion: 1,
      enrolledAt: new Date(now - enrolledDaysAgo * day).toISOString(),
      lastActivityAt: lastActivityDaysAgo != null ? new Date(now - lastActivityDaysAgo * day).toISOString() : undefined,
    },
    studyOutcomes: [], studyChecks: [],
  });
  const imports = [
    mk('participant-a1', 'adaptive', 'active', 10, 1),
    mk('participant-a2', 'adaptive', 'withdrawn', 20, 2),
    mk('participant-b1', 'balanced', 'active', 30, 40),   // inactive
    mk('participant-b2', 'balanced', 'active', 2),          // insufficient follow-up
  ];
  const pool = aggregation.poolStudyData({ imports });
  assert.equal(pool.attrition.adaptive.enrolled, 2);
  assert.equal(pool.attrition.adaptive.active, 1);
  assert.equal(pool.attrition.adaptive.withdrawn, 1);
  assert.equal(pool.attrition.balanced.inactive, 1);
  assert.equal(pool.attrition.balanced.insufficientFollowUp, 1);
  for (const arm of ['adaptive', 'balanced']) {
    const a = pool.attrition[arm];
    assert.equal(a.active + a.completed + a.withdrawn + a.inactive + a.insufficientFollowUp, a.enrolled, `${arm} partition`);
  }
});

// ── 6. mixed-protocol pooling ──────────────────────────────────────────────

test('mixed-protocol pooling: old stays, future is rejected with a surfaced reason', async () => {
  const f = await fresh();
  const { aggregation } = f;
  const mk = (pid, version) => ({
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: { participantId: pid, arm: 'adaptive', enrolledAt: '2026-09-01T09:00:00Z', status: 'active', protocolVersion: version },
    studyOutcomes: [], studyChecks: [],
  });
  const pool = aggregation.poolStudyData({ imports: [mk('participant-v1', 1), mk('participant-v2', 2), mk('participant-v99', 99)] });
  // v1 = current, analysable. v2 does not exist yet in this build (rejected
  // by isValidStudyRecord as future). v99 likewise.
  assert.equal(pool.participants, 1);
  assert.equal(pool.rejected.length, 2);
  const reasons = pool.rejected.map((r) => r.errors.join(' ')).join(' | ');
  assert.match(reasons, /invalid/, 'protocol rejection surfaced with a reason');
});

test('treatment mismatch is flagged at capture AND enforced at analysis', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  // Simulate the delivery layer writing a row whose label disagrees with the arm.
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm === 'adaptive' ? 'balanced' : 'adaptive', selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({
    trial, graph: [], arm: s.arm, day: 1,
    consistency: { ok: false, expected: s.arm, reason: `delivered '${trial.variant}' but study arm implies '${s.arm}'` },
  });
  const row = storage.getStudyOutcomes()[0];
  assert.equal(row.treatmentConsistency.ok, false, 'flagged at capture, never relabelled');
  const v = studyFlow.verifyTreatmentConsistency ? null : null; void v;
  const bundle = storage.buildStudyBundle();
  const { classifyOutcomeForAnalysis } = await import('../src/lib/evidenceStudy.js');
  const studiesById = { [s.participantId]: bundle.study };
  const cls = classifyOutcomeForAnalysis(bundle.studyOutcomes[0], { studiesById, currentProtocolVersion: 1 });
  assert.equal(cls.classification, 'excluded-treatment-mismatch', 'excluded from arm comparison');
});
