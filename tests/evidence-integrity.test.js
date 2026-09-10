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
  const aggregation = await import(`../src/lib/researchAggregation.js?ra=${stamp}`);
  return { storage, studyFlow, evidenceStudy, aggregation };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

const DAY = 86400000;

function vocabCheck(pid, day) {
  return {
    id: `chk-${pid}-${day}`, participantId: pid, day, level: 'B1',
    at: new Date().toISOString(),
    wordIds: ['chk-b1-001', 'chk-b1-002'],
    items: [
      { assessmentId: 'as-chk-b1-001', sourceItemId: 'chk-b1-001', skill: 'vocabulary', cefr: 'B1', content: { prompt: 'x' }, options: [{ id: 'as-chk-b1-001', text: 'y' }], correctOptionId: 'as-chk-b1-001', accept: null },
      { assessmentId: 'as-chk-b1-002', sourceItemId: 'chk-b1-002', skill: 'vocabulary', cefr: 'B1', content: { prompt: 'x' }, options: [{ id: 'as-chk-b1-002', text: 'y' }], correctOptionId: 'as-chk-b1-002', accept: null },
    ],
    skills: ['vocabulary'], scheduledSkill: 'vocabulary', trackId: null, results: null,
    engineVersion: 1, protocolVersion: 1,
  };
}

// ── per-item evidence survives the full pipeline ───────────────────────────

test('perItem evidence survives record → storage → export → import → pool unchanged', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const chk = studyFlow.saveCheckRecord(vocabCheck(s.participantId, 3));
  const perItem = [
    { sourceItemId: 'chk-b1-001', skill: 'vocabulary', cefr: 'B1', status: 'scored', correct: true, aiScore: null, asrConfidence: null, confidence: 'managed', reason: null, matchedAccept: null, at: new Date().toISOString() },
    { sourceItemId: 'chk-b1-002', skill: 'vocabulary', cefr: 'B1', status: 'unavailable', correct: null, aiScore: null, asrConfidence: null, confidence: null, reason: 'audio-missing', matchedAccept: null, at: new Date().toISOString() },
  ];
  const finished = { correct: 1, total: 2, quizScore: 100, unscored: 1, secondsSpent: 60, perItem };
  const saved = studyFlow.recordCheckOutcome(chk.id, finished);
  assert.deepEqual(saved.results.perItem, perItem.map((p) => ({ ...p })), 'local storage keeps full per-item evidence');

  const bundle = storage.buildStudyBundle();
  const exported = bundle.studyChecks[0].results.perItem;
  assert.deepEqual(exported, saved.results.perItem, 'export is lossless');

  const f2 = await fresh();
  const report = f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  const imported = f2.storage.getImportedStudyBundles()[0];
  assert.deepEqual(imported.checks[0].results.perItem, exported, 'import is lossless');

  const pool = f2.aggregation.poolStudyData({ imports: f2.storage.getImportedStudyBundles() });
  assert.equal(pool.rejected.length, 0, 'valid per-item evidence passes schema validation');
  // Speaking evidence keeps its numeric shape end to end.
  const spk = {
    id: `chk-${s.participantId}-4`, participantId: s.participantId, day: 4, level: 'B1', at: new Date().toISOString(),
    wordIds: [], items: [{ assessmentId: 'as-1', sourceItemId: 'chk-sp-1', skill: 'speaking', cefr: 'B1', content: { prompt: 'parlez' }, options: [], correctOptionId: null, accept: null }],
    skills: ['speaking'], scheduledSkill: 'speaking', trackId: null, results: null, engineVersion: 1, protocolVersion: 1,
  };
  const spkSaved = studyFlow.recordCheckResult(spk, {
    correct: 0, total: 1, quizScore: null, secondsSpent: 30,
    perItem: [{ sourceItemId: 'chk-sp-1', skill: 'speaking', cefr: 'B1', status: 'scored', correct: null, aiScore: 71, asrConfidence: 'usable', confidence: 'unsure', reason: null, matchedAccept: null, at: new Date().toISOString() }],
  });
  assert.equal(spkSaved.results.perItem[0].aiScore, 71);
  assert.equal(spkSaved.results.perItem[0].confidence, 'unsure');
  void evidenceStudy; void storage;
});

// ── speaking: objective vs confidence vs infrastructure ────────────────────

test('speaking scored requires a numeric score; success alone never scores', async () => {
  const f = await fresh();
  const { studyFlow } = f;
  consentAndEnrol(f, { startLevel: 'B1' });
  const base = { participantId: 'participant-x', day: 9, level: 'B1', at: new Date().toISOString(), wordIds: [], items: [], skills: ['speaking'], scheduledSkill: 'speaking', trackId: null, results: null, engineVersion: 1, protocolVersion: 1, id: 'chk-x-9' };
  // AI returned but non-numeric → unscored, aiScore null.
  const unscored = studyFlow.recordCheckResult(base, {
    correct: 1, total: 1, quizScore: 100, perItem: [
      { sourceItemId: 'chk-sp-9', skill: 'speaking', status: 'unscored', aiScore: 'oops', correct: null, at: new Date().toISOString() },
    ],
  });
  assert.equal(unscored.results.perItem[0].aiScore, null, 'non-numeric never becomes a score');
  assert.equal(unscored.results.perItem[0].status, 'unscored');
  // Mic failure → unavailable with reason.
  const unavailable = studyFlow.recordCheckResult(base, {
    correct: 0, total: 1, perItem: [
      { sourceItemId: 'chk-sp-9', skill: 'speaking', status: 'unavailable', reason: 'microphone-denied', at: new Date().toISOString() },
    ],
  });
  assert.equal(unavailable.results.perItem[0].status, 'unavailable');
  assert.equal(unavailable.results.perItem[0].correct, null, 'infrastructure failure never marked incorrect');
});

test('learner confidence never contaminates objective correctness', async () => {
  const f = await fresh();
  const { studyFlow } = f;
  consentAndEnrol(f, {});
  const chk = studyFlow.saveCheckRecord(vocabCheck('participant-c', 3));
  const perItem = [
    { sourceItemId: 'chk-b1-001', skill: 'vocabulary', status: 'scored', correct: false, confidence: 'managed', at: new Date().toISOString() },
  ];
  const saved = studyFlow.recordCheckOutcome(chk.id, { correct: 0, total: 1, perItem });
  assert.equal(saved.results.perItem[0].correct, false, 'managed confidence does not flip correctness');
  assert.equal(saved.results.perItem[0].confidence, 'managed', 'confidence stored separately');
});

test('checkSkillSummary: speaking from aiScore only; correctness excludes unscored/unavailable', async () => {
  const { evidenceStudy } = await fresh();
  const spk = {
    results: { perItem: [
      { skill: 'speaking', status: 'scored', aiScore: 80 },
      { skill: 'speaking', status: 'scored', aiScore: 60 },
      { skill: 'speaking', status: 'unscored', aiScore: null },
      { skill: 'speaking', status: 'unavailable', aiScore: null },
    ] },
  };
  const s = evidenceStudy.checkSkillSummary(spk);
  assert.equal(s.skill, 'speaking');
  assert.equal(s.score, 70, 'mean of valid numeric scores only');
  assert.equal(s.scoredN, 2);
  const v = {
    results: { perItem: [
      { skill: 'vocabulary', status: 'scored', correct: true },
      { skill: 'vocabulary', status: 'scored', correct: false },
      { skill: 'vocabulary', status: 'unavailable', correct: null },
    ] },
  };
  const vs = evidenceStudy.checkSkillSummary(v);
  assert.equal(vs.score, 50, 'unavailable excluded from the denominator');
  assert.equal(vs.unavailableN, 1);
});

test('a fully-unavailable check attaches NO transfer evidence (never 0)', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 3 });
  const chk = studyFlow.saveCheckRecord(vocabCheck(s.participantId, 3));
  studyFlow.recordCheckOutcome(chk.id, {
    correct: 0, total: 2, perItem: [
      { sourceItemId: 'chk-b1-001', skill: 'vocabulary', status: 'unavailable', reason: 'tts-failed', at: new Date().toISOString() },
      { sourceItemId: 'chk-b1-002', skill: 'vocabulary', status: 'unavailable', reason: 'tts-failed', at: new Date().toISOString() },
    ],
  });
  const summary = studyFlow.attachTransferFromCheck(chk.id);
  assert.equal(summary.score, null);
  const o = storage.getStudyOutcomes()[0];
  assert.equal(o.transfer?.vocabulary, undefined, 'no evidence, not a fake zero');
});

// ── preregistered per-item schema validation ───────────────────────────────

test('validatePerItemEntry rejects malformed evidence without coercion', async () => {
  const { evidenceStudy } = await fresh();
  const v = evidenceStudy.validatePerItemEntry;
  const ok = { sourceItemId: 'a', skill: 'vocabulary', status: 'scored', correct: true };
  assert.equal(v(ok), null);
  assert.match(v({ ...ok, sourceItemId: null }), /sourceItemId/);
  assert.match(v({ ...ok, skill: 'telepathy' }), /unknown skill/);
  assert.match(v({ ...ok, status: 'probably' }), /impossible status/);
  assert.match(v({ sourceItemId: 'a', skill: 'speaking', status: 'scored', aiScore: 130 }), /0-100/);
  assert.match(v({ sourceItemId: 'a', skill: 'vocabulary', status: 'unscored', correct: true }), /objective result/);
  assert.match(v({ sourceItemId: 'a', skill: 'speaking', status: 'scored', aiScore: 70, correct: true }), /boolean correctness/);
  assert.match(v({ ...ok, asrConfidence: 'vibes' }), /ASR confidence/);
  assert.match(v({ sourceItemId: 'a', skill: 'vocabulary', status: 'unavailable' }), /without reason/);
});

test('bundled checks with invalid per-item evidence are rejected at import', async () => {
  const f = await fresh();
  const { storage } = f;
  const bad = {
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: { participantId: 'participant-bad', arm: 'adaptive', enrolledAt: new Date().toISOString(), status: 'active', protocolVersion: 1 },
    studyOutcomes: [],
    studyChecks: [{
      id: 'chk-bad', day: 1, level: 'B1', at: new Date().toISOString(), items: [], skills: ['vocabulary'], results: {
        correct: 1, total: 1, perItem: [{ sourceItemId: 'x', skill: 'vocabulary', status: 'scored', correct: true, aiScore: 999 }],
      },
    }],
  };
  const report = storage.ingestValidationBundle(JSON.stringify(bad));
  assert.equal(report.ok, false, 'impossible score rejects the whole stream');
  assert.ok(report.errors.some((e) => /studyChecks/.test(e)), 'rejection names the stream');
  assert.equal(storage.getImportedStudyBundles().length, 0, 'never half-imported');
});

// ── attrition metadata: exact round trip ───────────────────────────────────

test('attrition metadata round-trips exactly through export → import → pool', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 1 });
  storage.saveStudyState({ ...storage.getStudyState(), completedAt: new Date().toISOString() });
  const bundle = storage.buildStudyBundle();
  const src = bundle.study;
  const f2 = await fresh();
  f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  const imported = f2.storage.getImportedStudyBundles()[0].study;
  for (const key of ['participantId', 'arm', 'armSource', 'startLevel', 'enrolledAt', 'status', 'weeks', 'protocolVersion', 'engineVersion', 'schemaVersion', 'withdrawnAt', 'completedAt', 'lastActivityAt', 'baseline']) {
    assert.deepEqual(imported[key], src[key] ?? null, `${key} identical after round trip`);
  }
  const pool = f2.aggregation.poolStudyData({ imports: f2.storage.getImportedStudyBundles() });
  assert.equal(pool.participants, 1, 'pooled cohort sees the metadata');
  // Withdrawn participants keep their timestamp through the same pipeline.
  const f3 = await fresh();
  const s3 = consentAndEnrol(f3, { startLevel: 'A2' });
  f3.studyFlow.withdrawStudyState({ deleteData: true });
  const bundle3 = f3.storage.buildStudyBundle();
  assert.equal(bundle3.study.status, 'withdrawn');
  assert.ok(bundle3.study.withdrawnAt);
  const f4 = await fresh();
  f4.storage.ingestValidationBundle(JSON.stringify(bundle3));
  const im3 = f4.storage.getImportedStudyBundles()[0].study;
  assert.equal(im3.status, 'withdrawn');
  assert.equal(im3.withdrawnAt, bundle3.study.withdrawnAt);
  void s3; void s; void DAY;
});
