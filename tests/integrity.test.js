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
  const evidenceStudy = await import('../src/lib/evidenceStudy.js');
  const bank = await import(`../src/lib/heldOutBank.js?hb=${stamp}`);
  return { storage, studyFlow, evidenceStudy, bank };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

const STUDY_KEYS = ['fp.study.state.v1', 'fp.study.outcomes.v1', 'fp.study.checks.v1'];

// ── consent gating: no consent → no study data, period ─────────────────────

test('never-joined learner: repeated Today runs write ZERO study data', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  // Five Today sessions without ever touching the study panel.
  for (let i = 0; i < 5; i++) {
    const trial = { at: new Date(Date.now() + i).toISOString(), activity: 'ai-drill', variant: 'adaptive', selectedId: 'mg-1', selectedConcept: 'passe-compose' };
    studyFlow.startOutcomeRecord({ trial, graph: [], arm: 'adaptive', day: i });
    studyFlow.linkRetestToOutcomes({ mistakeId: 'mg-1', retest: { at: new Date().toISOString(), correct: true, evidenceClass: 'DELAYED' } });
    studyFlow.markOutcomeRecurrence({ mistakeId: 'mg-1' });
    studyFlow.updateOutcomeDelivery({ trialAt: trial.at, timeSpent: 300, completed: true, delivered: [] });
    studyFlow.attachTransferToOutcomes({ day: i, score: 80 });
    studyFlow.saveCheckRecord({ id: `chk-x-${i}`, participantId: 'participant-none', day: i, level: 'B1', at: '', wordIds: [], trackId: null, results: null, skills: [], engineVersion: 1 });
    studyFlow.recordCheckOutcome(`chk-x-${i}`, { correct: 2, total: 2 });
  }
  for (const key of STUDY_KEYS) {
    assert.deepEqual(JSON.parse(localStorage.getItem(key) || '[]'), [], `${key} must stay empty`);
  }
  assert.equal(storage.getStudyState(), null, 'no participant record');
  assert.equal(studyFlow.canRecordStudyData(), false);
});

test('declined learner: same guarantee, and the guard stays false after refusal', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.recordStudyConsent('declined');
  assert.equal(studyFlow.canRecordStudyData(), false, 'declined is never writable');
  studyFlow.startOutcomeRecord({ trial: { at: new Date().toISOString(), variant: 'adaptive', selectedId: 'mg-1' }, graph: [], arm: 'adaptive' });
  assert.deepEqual(JSON.parse(localStorage.getItem('fp.study.outcomes.v1') || '[]'), []);
});

test('every research write path honours the guard after withdrawal mid-study', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  assert.equal(studyFlow.canRecordStudyData(), true, 'fixture sanity');
  studyFlow.withdrawStudyState({ deleteData: true });
  assert.equal(studyFlow.canRecordStudyData(), false, 'withdrawn is not writable');
  // Attempt every write path post-withdrawal.
  studyFlow.startOutcomeRecord({ trial: { at: new Date().toISOString(), variant: s.arm, selectedId: 'mg-9' }, graph: [], arm: s.arm });
  studyFlow.linkRetestToOutcomes({ mistakeId: 'mg-9', retest: { at: new Date().toISOString(), correct: true } });
  studyFlow.markOutcomeRecurrence({ mistakeId: 'mg-9' });
  studyFlow.updateOutcomeDelivery({ trialAt: new Date().toISOString(), timeSpent: 100, completed: true });
  studyFlow.attachTransferToOutcomes({ day: 1, score: 90 });
  studyFlow.saveCheckRecord({ id: 'chk-post', participantId: s.participantId, day: 1, level: 'B1', at: '', wordIds: [], trackId: null, results: null, skills: [], engineVersion: 1 });
  assert.deepEqual(storage.getStudyOutcomes(), [], 'no outcome writes after withdrawal');
  assert.deepEqual(storage.getStudyChecks(), [], 'no check writes after withdrawal');
});

test('corrupted study state (bad arm / bad participant id) fails the guard', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  studyFlow.recordStudyConsent('accepted');
  localStorage.setItem('fp.study.state.v1', JSON.stringify({ status: 'active', participantId: 'participant-ok', arm: 'chaos-arm' }));
  assert.equal(studyFlow.canRecordStudyData(), false, 'invalid arm blocks writes');
  localStorage.setItem('fp.study.state.v1', JSON.stringify({ status: 'active', participantId: 'not-anonymous', arm: 'adaptive' }));
  assert.equal(studyFlow.canRecordStudyData(), false, 'invalid participant id blocks writes');
  localStorage.setItem('fp.study.state.v1', JSON.stringify({ status: 'active', participantId: 'participant-ok', arm: 'balanced' }));
  assert.equal(studyFlow.canRecordStudyData(), true, 'valid state passes');
});

test('study exports are consent-gated too', async () => {
  const f = await fresh();
  const { storage, studyFlow } = f;
  // Declined learner exporting: bundle carries NO study streams.
  studyFlow.recordStudyConsent('declined');
  const b1 = storage.buildStudyBundle();
  assert.equal(b1.study, null);
  assert.deepEqual(b1.studyOutcomes, []);
  assert.match(b1.studyExportNote, /withheld/i);
  // Consent + enrol → streams present.
  consentAndEnrol(f, { startLevel: 'B1' });
  const b2 = storage.buildStudyBundle();
  assert.ok(b2.study.participantId.startsWith('participant-'));
});

// ── participant weighting: heavy practice cannot dominate ──────────────────

test('participant-weighted arm mean: 1 heavy + 4 light learners = mean of 5 equal contributions', async () => {
  const { evidenceStudy } = await fresh();
  const mk = (pid, sessions, correctRate) => {
    const rows = Array.from({ length: sessions }, (_, i) => ({
      id: `${pid}-${i}`, participantId: pid, variant: 'adaptive', arm: 'adaptive',
      at: new Date().toISOString(), day: i, selectedId: `mg-${i}`,
      delayedShort: { correct: i < sessions * correctRate, at: '', delayDays: 2 },
      delayedLong: null, transfer: null, recurred: null, completed: true,
    }));
    return evidenceStudy.participantSummaries(rows)[0];
  };
  const heavy = mk('participant-heavy', 40, 0.5);  // 20/40 correct
  const lights = Array.from({ length: 4 }, (_, p) => mk(`participant-light${p}`, 1, 1)); // all correct
  const cmp = evidenceStudy.armComparison([heavy, ...lights], { minPerArm: 2, minScoredPerMetric: 2 });
  // Participant-weighted: (0.5 + 1 + 1 + 1 + 1) / 5 = 0.9
  // Pooled observation-level would be (20 + 4) / 44 ≈ 0.545 — the bug this prevents.
  assert.equal(cmp.adaptive.participants, 5);
  assert.equal(cmp.adaptive.delayedShort.mean, 0.9, 'one contribution per participant');
  assert.equal(cmp.adaptive.delayedShort.scoredParticipants, 5);
  assert.equal(cmp.adaptive.delayedShort.median, 1, 'median across participant estimates');
  assert.ok(cmp.adaptive.delayedShort.spread.range > 0, 'spread reflects the heavy/light gap');
});

test('pooled observation-level rates are NOT reconstructed in the comparison', async () => {
  const { evidenceStudy } = await fresh();
  const rows = [
    ...Array.from({ length: 40 }, (_, i) => ({ id: `a-${i}`, participantId: 'participant-a', variant: 'adaptive', arm: 'adaptive', at: '', day: i, selectedId: `mg-${i}`, delayedShort: { correct: i % 2 === 0, at: '', delayDays: 2 }, delayedLong: null, transfer: null, recurred: null, completed: true })),
    ...Array.from({ length: 1 }, (_, i) => ({ id: `b-${i}`, participantId: 'participant-b', variant: 'balanced', arm: 'balanced', at: '', day: i, selectedId: `mg-${i}`, delayedShort: { correct: true, at: '', delayDays: 2 }, delayedLong: null, transfer: null, recurred: null, completed: true })),
  ];
  const cmp = evidenceStudy.armComparison(evidenceStudy.participantSummaries(rows), { minPerArm: 1, minScoredPerMetric: 1 });
  assert.equal(cmp.adaptive.participants, 1);
  // Pooled would be 0.5; participant-weighted is exactly 0.5 for the one participant.
  assert.equal(cmp.adaptive.delayedShort.mean, 0.5);
  assert.equal(cmp.weighting, 'participant');
});

// ── scored-participant gates ───────────────────────────────────────────────

test('each metric is gated on its own scored-participant count', async () => {
  const { evidenceStudy } = await fresh();
  const summaries = [];
  // 8 adaptive participants, but only 2 have 7d+ evidence.
  for (let p = 0; p < 8; p++) {
    const rows = Array.from({ length: 2 }, (_, i) => ({
      id: `a${p}-${i}`, participantId: `participant-a${p}`, variant: 'adaptive', arm: 'adaptive',
      at: '', day: i, selectedId: `mg-${i}`,
      delayedShort: { correct: true, at: '', delayDays: 2 },
      delayedLong: p < 2 ? { correct: true, at: '', delayDays: 9 } : null,
      transfer: null, recurred: null, completed: true,
    }));
    summaries.push(...evidenceStudy.participantSummaries(rows));
  }
  for (let p = 0; p < 8; p++) {
    const rows = Array.from({ length: 2 }, (_, i) => ({
      id: `b${p}-${i}`, participantId: `participant-b${p}`, variant: 'balanced', arm: 'balanced',
      at: '', day: i, selectedId: `mg-${i}`,
      delayedShort: { correct: false, at: '', delayDays: 2 },
      delayedLong: p < 2 ? { correct: false, at: '', delayDays: 9 } : null,
      transfer: null, recurred: null, completed: true,
    }));
    summaries.push(...evidenceStudy.participantSummaries(rows));
  }
  const cmp = evidenceStudy.armComparison(summaries);
  // Arm participants clear the floor...
  assert.equal(cmp.adaptive.participants, 8);
  assert.equal(cmp.comparison.comparable, true);
  // ...but 7d+ has only 2 scored participants per arm → hidden.
  assert.equal(cmp.adaptive.delayedLong.mean, null, '2 scored < floor of 5');
  assert.equal(cmp.adaptive.delayedLong.scoredParticipants, 2);
  // 1–3d has 8 scored participants → visible.
  assert.equal(cmp.adaptive.delayedShort.mean, 1);
  assert.equal(cmp.adaptive.delayedShort.scoredParticipants, 8);
});

test('the dashboard exposes evidence counts per arm: enrolled / eligible / scored', async () => {
  const { evidenceStudy } = await fresh();
  const rows = Array.from({ length: 3 }, (_, i) => ({
    id: `x-${i}`, participantId: 'participant-e', variant: 'adaptive', arm: 'adaptive',
    at: '', day: i, selectedId: `mg-${i}`,
    delayedShort: i < 2 ? { correct: true, at: '', delayDays: 2 } : null,
    delayedLong: null, transfer: null, recurred: null, completed: true,
  }));
  const [summary] = evidenceStudy.participantSummaries(rows);
  assert.equal(summary.sessions, 3, 'eligible sessions');
  assert.equal(summary.missingShort, 1, 'missing outcomes counted');
  const cmp = evidenceStudy.armComparison([summary]);
  assert.equal(cmp.adaptive.participants, 1);
  assert.equal(cmp.adaptive.eligibleParticipants, 1);
  assert.equal(cmp.adaptive.evidenceShort, 1);
  assert.equal(cmp.adaptive.evidenceLong, 0);
  assert.equal(cmp.adaptive.evidenceTransfer, 0);
});

// ── extreme session imbalance ──────────────────────────────────────────────

test('extreme imbalance: 100:1 session ratio cannot flip the arm result', async () => {
  const { evidenceStudy } = await fresh();
  const mkSummary = (pid, arm, sessions, rate) => {
    const rows = Array.from({ length: sessions }, (_, i) => ({
      id: `${pid}-${i}`, participantId: pid, variant: arm, arm,
      at: '', day: i, selectedId: `mg-${i}`,
      delayedShort: { correct: i < sessions * rate, at: '', delayDays: 2 },
      delayedLong: null, transfer: null, recurred: null, completed: true,
    }));
    return evidenceStudy.participantSummaries(rows)[0];
  };
  // Balanced arm: 10 participants all failing everything.
  const balanced = Array.from({ length: 10 }, (_, p) => mkSummary(`participant-b${p}`, 'balanced', 1, 0));
  // Adaptive arm: 10 participants succeeding, one of them with 100 sessions.
  const adaptive = Array.from({ length: 9 }, (_, p) => mkSummary(`participant-a${p}`, 'adaptive', 1, 1));
  adaptive.push(mkSummary('participant-a-heavy', 'adaptive', 100, 0)); // heavy failure
  const cmp = evidenceStudy.armComparison([...adaptive, ...balanced], { minPerArm: 5, minScoredPerMetric: 5 });
  assert.equal(cmp.adaptive.participants, 10);
  // 9 contributions of 1.0 + 1 contribution of 0 = 0.9 — the heavy learner
  // moved the mean by exactly 1/10th, not by their 100 sessions' worth.
  assert.equal(cmp.adaptive.delayedShort.mean, 0.9);
  assert.equal(cmp.adaptive.delayedShort.median, 1, 'median resists the outlier entirely');
});

// ── missing outcomes & withdrawal in summaries ─────────────────────────────

test('missing outcomes are reported per participant and per arm without imputation', async () => {
  const { evidenceStudy } = await fresh();
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: `m-${i}`, participantId: 'participant-m', variant: 'balanced', arm: 'balanced',
    at: '', day: i, selectedId: `mg-${i}`,
    delayedShort: i === 0 ? { correct: true, at: '', delayDays: 2 } : null,
    delayedLong: null, transfer: null, recurred: null, completed: true,
  }));
  const [summary] = evidenceStudy.participantSummaries(rows);
  assert.equal(summary.missingShort, 4);
  assert.equal(summary.missingRate, 80);
  const cmp = evidenceStudy.armComparison([summary]);
  assert.equal(cmp.balanced.missingShort, 4);
  assert.equal(cmp.balanced.delayedShort.scoredParticipants, 1, 'the one scored observation counts');
});

// ── baselines ──────────────────────────────────────────────────────────────

test('enrolment persists a baseline from real data; nulls mean unmeasured, never zero', async () => {
  const f = await fresh();
  const { storage, studyFlow } = f;
  storage.saveSession({ scenarioId: 'bistro', turns: 3, report: { average_scores: { overall: 61 } } });
  consentAndEnrol(f, { startLevel: 'B1' });
  const study = storage.getStudyState();
  assert.ok(study.baseline, 'baseline recorded at enrolment');
  assert.equal(study.baseline.speakingAverage, 61, 'captured from real session history');
  assert.equal(study.baseline.transferScore, null, 'unmeasured metrics stay null');
  assert.ok(study.baseline.capturedAt);
});

test('changeFromBaseline: descriptive deltas only, null when either side is unmeasured', async () => {
  const { evidenceStudy } = await fresh();
  const rows = Array.from({ length: 4 }, (_, i) => ({
    id: `cb-${i}`, participantId: 'participant-cb', variant: 'adaptive', arm: 'adaptive',
    at: '', day: i, selectedId: `mg-${i}`,
    delayedShort: { correct: true, at: '', delayDays: 2 },
    delayedLong: null,
    transfer: { score: 72, source: 'held-out-check' },
    recurred: null, completed: true,
  }));
  const [summary] = evidenceStudy.participantSummaries(rows);
  const studiesById = {
    'participant-cb': { baseline: { delayedShortRecall: 55, transferScore: 60, speakingAverage: null, recurrenceRate: null } },
  };
  const [change] = evidenceStudy.changeFromBaseline([summary], { studiesById });
  assert.equal(change.delta.delayedShort, 0.45, '0.90 − 0.55 (baseline given as %)');
  assert.equal(change.delta.transfer, 12, '72 − 60');
  assert.equal(change.delta.speaking, null, 'either side unmeasured → null');
  // Without a baseline record: all deltas null, never zero-filled.
  const [noBaseline] = evidenceStudy.changeFromBaseline([summary], {});
  assert.equal(noBaseline.delta.delayedShort, null);
  assert.equal(noBaseline.delta.transfer, null);
});

// ── attrition from study records, never missing rows ────────────────────────

test('attritionByArm classifies active/completed/withdrawn/inactive from records', async () => {
  const { evidenceStudy } = await fresh();
  const now = Date.now();
  const rec = (pid, arm, status, enrolledDaysAgo, lastActivityDaysAgo = null) => ({
    participantId: pid, arm, status,
    enrolledAt: new Date(now - enrolledDaysAgo * 86400000).toISOString(),
    ...(lastActivityDaysAgo != null ? { lastActivityAt: new Date(now - lastActivityDaysAgo * 86400000).toISOString() } : {}),
  });
  const records = [
    rec('participant-act1', 'adaptive', 'active', 10, 1),     // active: past follow-up, recent activity
    rec('participant-act2', 'adaptive', 'active', 2),         // insufficient follow-up (2d enrolled)
    rec('participant-gone', 'adaptive', 'active', 60, 45),    // inactive: quiet 45d
    rec('participant-done', 'adaptive', 'active', 70, 5),     // completed: 10w elapsed, active through week 9
    rec('participant-wd', 'adaptive', 'withdrawn', 10, 3),    // withdrawn
    rec('participant-b1', 'balanced', 'active', 3, 1),        // insufficient follow-up
    rec('participant-bwd', 'balanced', 'withdrawn', 8, 2),
  ];
  const byArm = evidenceStudy.attritionByArm(records, { now });
  assert.equal(byArm.adaptive.enrolled, 5);
  assert.equal(byArm.adaptive.active, 1, 'act1: 10d enrolled, 1d ago activity');
  assert.equal(byArm.adaptive.insufficientFollowUp, 1, 'act2: enrolled 2d ago — nothing expected yet');
  assert.equal(byArm.adaptive.completed, 1);
  assert.equal(byArm.adaptive.inactive, 1);
  assert.equal(byArm.adaptive.withdrawn, 1);
  assert.equal(byArm.balanced.enrolled, 2);
  assert.equal(byArm.balanced.insufficientFollowUp, 1, 'b1: enrolled 3d ago');
  assert.equal(byArm.balanced.withdrawn, 1);
  // The five categories partition the enrolled cohort.
  assert.equal(byArm.adaptive.active + byArm.adaptive.insufficientFollowUp + byArm.adaptive.inactive + byArm.adaptive.withdrawn + byArm.adaptive.completed, byArm.adaptive.enrolled, 'categories partition the cohort');
});

// ── held-out skill isolation persists ──────────────────────────────────────

test('held-out selection stays skill-isolated and bank-namespaced', async () => {
  const { bank } = await fresh();
  const vocab = bank.selectHeldOutItems({ participantId: 'p1', day: 2, level: 'B1', skills: ['vocabulary'], limit: 4 });
  assert.ok(vocab.length > 0 && vocab.every((i) => i.id.startsWith('chk-') && i.skill === 'vocabulary'));
  const grammar = bank.selectHeldOutItems({ participantId: 'p2', day: 2, level: 'B1', skills: ['grammar'], limit: 4 });
  assert.ok(grammar.every((i) => i.skill === 'grammar'));
});
