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
  const assignment = await import('../src/lib/assignment.js');
  const bank = await import(`../src/lib/heldOutBank.js?hb=${stamp}`);
  const aggregation = await import(`../src/lib/researchAggregation.js?ra=${stamp}`);
  const evidenceStudy = await import('../src/lib/evidenceStudy.js');
  return { storage, studyFlow, assignment, bank, aggregation, evidenceStudy };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

// ── one authoritative treatment ────────────────────────────────────────────

test('effectiveVariant: study arm wins when active; everything else is adaptive', async () => {
  const { assignment } = await fresh();
  assert.equal(assignment.effectiveVariant({ study: null }), 'adaptive', 'not enrolled → adaptive');
  assert.equal(assignment.effectiveVariant({ study: { status: 'withdrawn', arm: 'balanced' } }), 'adaptive', 'withdrawn → adaptive');
  assert.equal(assignment.effectiveVariant({ study: { status: 'active', arm: 'adaptive' } }), 'adaptive');
  assert.equal(assignment.effectiveVariant({ study: { status: 'active', arm: 'balanced' } }), 'balanced');
  assert.equal(assignment.effectiveVariant({ study: { status: 'active', arm: 'chaos' } }), 'adaptive', 'corrupt arm falls safe');
});

test('nonparticipants always receive adaptive — even with a stale legacy pin', async () => {
  const f = await fresh();
  const { assignment, studyFlow, storage } = f;
  // Decline: the sticky refusal path.
  studyFlow.recordStudyConsent('declined');
  assert.equal(assignment.effectiveVariant({ study: storage.getStudyState() }), 'adaptive', 'declined → adaptive');
  // Never asked: also adaptive.
  assert.equal(assignment.effectiveVariant({ study: null }), 'adaptive');
  // A stale legacy pin (operator override from a previous install) must NOT
  // flip a nonparticipant into balanced.
  assignment.setPracticeAssignment('balanced');
  assert.equal(assignment.effectiveVariant({ study: null }), 'adaptive', 'legacy pin alone never assigns balanced');
});

test('treatment consistency invariant flags mismatched records', async () => {
  const { assignment } = await fresh();
  const study = { status: 'active', arm: 'balanced' };
  assert.equal(assignment.verifyTreatmentConsistency({ deliveredVariant: 'balanced', study }).ok, true);
  const bad = assignment.verifyTreatmentConsistency({ deliveredVariant: 'adaptive', study });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /implies 'balanced'/);
  assert.equal(assignment.verifyTreatmentConsistency({ deliveredVariant: null, study }).ok, false);
});

test('outcome rows carry a treatment-consistency audit trail', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  const consistent = studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 1, consistency: { ok: true, expected: s.arm, reason: null } });
  assert.equal(consistent.treatmentConsistency.ok, true);
  const mismatched = studyFlow.startOutcomeRecord({
    trial: { ...trial, at: new Date(Date.now() + 1000).toISOString() },
    graph: [], arm: s.arm, day: 1,
    consistency: { ok: false, expected: 'adaptive', reason: "delivered 'balanced' but study arm implies 'adaptive'" },
  });
  assert.equal(mismatched.treatmentConsistency.ok, false, 'mismatch flagged, never relabelled');
});

// ── participant-level sample gates ─────────────────────────────────────────

function mkRows(pid, arm, n, { delayed = true } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `out-${pid}-${i}`,
    at: new Date(Date.now() - i * 1000).toISOString(),
    variant: arm,
    participantId: pid,
    selectedId: `mg-${i}`,
    day: i,
    delayedShort: delayed ? { correct: true, at: new Date().toISOString(), delayDays: 2 } : null,
    delayedLong: null,
    transfer: null,
    recurred: null,
    completed: i % 2 === 0,
  }));
}

test('participant summaries: one learner, many sessions, n=1', async () => {
  const { evidenceStudy } = await fresh();
  const rows = mkRows('participant-solo', 'adaptive', 25);
  const summaries = evidenceStudy.participantSummaries(rows);
  assert.equal(summaries.length, 1, '25 rows collapse to ONE participant');
  assert.equal(summaries[0].sessions, 25, 'all sessions retained in the summary');
  assert.equal(summaries[0].arm, 'adaptive');
  assert.equal(summaries[0].delayedShort.n, 25, 'observations counted');
  assert.ok(summaries[0].durationDays >= 0, 'study duration derived');
});

test('arm comparison gates on PARTICIPANTS per arm, never sessions', async () => {
  const { evidenceStudy } = await fresh();
  // 2 participants with 50 sessions each — row-level gates would call this comparable.
  const rows = [...mkRows('participant-a', 'adaptive', 50), ...mkRows('participant-b', 'balanced', 50)];
  const cmp = evidenceStudy.armComparison(evidenceStudy.participantSummaries(rows));
  assert.equal(cmp.adaptive.participants, 1);
  assert.equal(cmp.balanced.participants, 1);
  assert.equal(cmp.comparison.comparable, false, '1 participant per arm cannot compare, however many sessions');
  assert.match(cmp.comparison.message, /PARTICIPANTS per arm/);
  // 8 participants per arm with one session each — comparable.
  const rows2 = [];
  for (let p = 0; p < 8; p++) rows2.push(...mkRows(`participant-a${p}`, 'adaptive', 1));
  for (let p = 0; p < 8; p++) rows2.push(...mkRows(`participant-b${p}`, 'balanced', 1));
  const cmp2 = evidenceStudy.armComparison(evidenceStudy.participantSummaries(rows2));
  assert.equal(cmp2.comparison.comparable, true, '8 participants per arm clears the gate');
});

test('rows without a participant id are excluded from analysis, not assigned to a phantom participant', async () => {
  const { evidenceStudy } = await fresh();
  const rows = [...mkRows('participant-x', 'adaptive', 3), { id: 'orphan', variant: 'adaptive', delayedShort: { correct: true } }];
  const summaries = evidenceStudy.participantSummaries(rows);
  assert.equal(summaries.length, 1, 'orphan row has no home and is not invented one');
});

// ── pooled delivery statistics ─────────────────────────────────────────────

test('pooled delivery stats come from the pooled dataset and count sessions separately from participants', async () => {
  const f = await fresh();
  const { aggregation } = f;
  const mk = (pid, arm) => ({
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: { participantId: pid, arm, enrolledAt: '2026-09-01T09:00:00Z', status: 'active' },
    studyOutcomes: mkRows(pid, arm, 5),
    studyChecks: [],
  });
  const pool = aggregation.poolStudyData({
    localStudy: { participantId: 'participant-local', arm: 'adaptive', enrolledAt: '2026-09-01T09:00:00Z', status: 'active' },
    localOutcomes: mkRows('participant-local', 'adaptive', 5),
    imports: [mk('participant-i1', 'balanced'), mk('participant-i2', 'balanced')],
  });
  assert.equal(pool.participants, 3);
  assert.equal(pool.delivery.adaptive.sessions, 5, 'local participant only adaptive participant: 5 sessions');
  assert.equal(pool.delivery.balanced.sessions, 10, 'two balanced participants × 5 sessions');
  // The comparison arm stats carry pooled sessions alongside participant gates.
  assert.equal(pool.comparison.adaptive.participants, 1);
  assert.equal(pool.comparison.balanced.participants, 2);
});

// ── withdrawals and missing outcomes ───────────────────────────────────────

test('withdrawn participants stop contributing but their rows remain analysable', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  studyFlow.startOutcomeRecord({
    trial: { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' },
    graph: [], arm: s.arm, day: 0,
  });
  studyFlow.withdrawStudyState({ deleteData: true });
  // Rows were deleted with withdrawal (deletion control) — nothing fake remains.
  assert.deepEqual(storage.getStudyOutcomes(), []);
  // But the ANALYSIS layer tolerates rows from a withdrawn participant that
  // arrived in an earlier export: they keep their arm label.
  const rows = mkRows(s.participantId, s.arm, 3);
  const summaries = evidenceStudy.participantSummaries(rows);
  assert.equal(summaries.length, 1, 'pre-withdrawal rows stay analysable');
});

test('missing delayed outcomes are counted, never imputed', async () => {
  const { evidenceStudy } = await fresh();
  const rows = mkRows('participant-m', 'adaptive', 4, { delayed: false });
  const summaries = evidenceStudy.participantSummaries(rows);
  assert.equal(summaries[0].missingShort, 4);
  assert.equal(summaries[0].delayedShort.rate, null, 'no imputation');
  const cmp = evidenceStudy.armComparison(summaries);
  assert.equal(cmp.comparison.comparable, false, 'nothing to compare on');
});

// ── held-out skill isolation ───────────────────────────────────────────────

test('held-out banks report per skill and never merge into one score', async () => {
  const { bank } = await fresh();
  const v = bank.validateBank();
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  // All six skills exist with verified items (or are honestly absent).
  const bySkill = {};
  for (const item of bank.HELDOUT_BANK) {
    if (item.reviewStatus !== 'verified') continue;
    bySkill[item.skill] = (bySkill[item.skill] || 0) + 1;
  }
  assert.ok(bySkill.vocabulary >= 10, 'vocabulary bank is the mature one');
  for (const skill of bank.HELDOUT_SKILLS) {
    if (bySkill[skill]) assert.ok(bySkill[skill] >= 1, `${skill} bank has verified items`);
  }
  // Selection with a single skill returns ONLY that skill.
  const vocabOnly = bank.selectHeldOutItems({ participantId: 'p1', day: 2, level: 'B1', skills: ['vocabulary'], limit: 4 });
  assert.ok(vocabOnly.every((i) => i.skill === 'vocabulary'));
  const grammarOnly = bank.selectHeldOutItems({ participantId: 'p2', day: 2, level: 'B1', skills: ['grammar'], limit: 4 });
  assert.ok(grammarOnly.every((i) => i.skill === 'grammar'), `grammar selection isolated, got ${grammarOnly.map((i) => i.skill)}`);
  // A multi-skill selection interleaves but each item keeps its own skill.
  const mixed = bank.selectHeldOutItems({ participantId: 'p3', day: 2, level: 'B1', skills: ['vocabulary', 'grammar'], limit: 4 });
  assert.ok(mixed.length > 0);
  for (const i of mixed) assert.ok(['vocabulary', 'grammar'].includes(i.skill));
});
