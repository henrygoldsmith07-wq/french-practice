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
  const assignment = await import('../src/lib/assignment.js');
  const evidenceStudy = await import('../src/lib/evidenceStudy.js');
  const bank = await import(`../src/lib/heldOutBank.js?hb=${stamp}`);
  return { storage, studyFlow, protocol, assignment, evidenceStudy, bank };
}

const consentAndEnrol = (f, opts = {}) => {
  f.studyFlow.recordStudyConsent('accepted', { enrol: opts });
  return f.studyFlow.enrolStudyState(opts);
};

// ── 1. assignment algorithm fidelity ───────────────────────────────────────

test('ordinary enrolment follows the frozen algorithm exactly (no override seeding)', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy, protocol } = f;
  // The frozen algorithm (PROTOCOL.assignment.algorithm) is implemented by
  // evidenceStudy.assignArm — ordinary enrolment must land on ITS arm.
  for (let i = 0; i < 30; i++) {
    const pid = `participant-alg${i}`;
    const syncId = 'device-x';
    const expected = evidenceStudy.assignArm(pid, syncId);
    assert.ok(['adaptive', 'balanced'].includes(expected.arm), 'algorithm draws a valid arm');
    // Deterministic: same inputs, same arm.
    assert.equal(evidenceStudy.assignArm(pid, syncId).arm, expected.arm);
  }
  // And the actual enrolment (no operator pin set) lands on the algorithm's arm.
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const expected = evidenceStudy.assignArm(s.participantId, storage.getSyncId());
  assert.equal(s.arm, expected.arm, 'enrolment arm = frozen algorithm output');
  assert.equal(s.armSource, 'sync-id-hash', 'ordinary enrolment: no override source');
  assert.equal(storage.getStudyArmOverride(), null, 'enrolment never creates a legacy override');
  void protocol;
});

test('explicit researcher override is respected and its source recorded; UI never sets one', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  storage.setStudyArmOverride('balanced'); // study tooling only
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  assert.equal(s.arm, 'balanced');
  assert.equal(s.armSource, 'saved-override');
  // No UI path writes the override: the only writers are setStudyArmOverride
  // (study tooling) — the app's enrolment flow must not touch it (previous test).
});

test('the legacy practice-assignment pin does not leak into the study', async () => {
  const f = await fresh();
  const { studyFlow, storage, assignment } = f;
  assignment.setPracticeAssignment('balanced'); // legacy key — irrelevant now
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  assert.equal(s.armSource, 'sync-id-hash', 'legacy pin is not the study assignment');
  assert.equal(storage.getStudyArmOverride(), null);
  // effectiveVariant reads only the study record.
  assert.equal(assignment.effectiveVariant({ study: s }), s.arm);
});

// ── 2/3. per-skill scheduling + per-skill storage ──────────────────────────

test('check days administer ONE protocol-scheduled skill on a deterministic rotation', async () => {
  const f = await fresh();
  const { evidenceStudy, protocol } = f;
  const P = protocol.PROTOCOL;
  const schedule = P.transfer.skillSchedule;
  const pid = 'participant-sched';
  const seen = [];
  for (let ordinal = 0; ordinal < 6; ordinal++) {
    const day = P.duration.firstCheckDay + ordinal * P.duration.checkEveryDays;
    const pool = evidenceStudy.buildHeldOutPool({ participantId: pid, day, level: 'B1', limit: P.heldOut.itemsPerCheck });
    if (pool.words.length) seen.push({ ordinal, day, skill: pool.scheduledSkill, poolSkills: pool.skills });
  }
  assert.ok(seen.length >= 4, 'schedule produces checks across the rotation');
  // Deterministic: same days → same scheduled skills.
  const again = seen.map(({ day }) => evidenceStudy.buildHeldOutPool({ participantId: pid, day, level: 'B1' }).scheduledSkill);
  assert.deepEqual(seen.map((s) => s.skill), again, 'rotation is deterministic per participant');
  // The rotation cycles through protocol skills without merging.
  for (const s of seen) {
    assert.ok(schedule.includes(s.skill), `scheduled skill ${s.skill} is protocol-listed`);
    assert.equal(s.poolSkills.length, 1, 'a check administers exactly ONE skill');
  }
});

test('transfer evidence is stored per skill and never merged while overallScoreAllowed=false', async () => {
  const f = await fresh();
  const { studyFlow, storage, protocol, evidenceStudy } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 0 });
  studyFlow.attachTransferToOutcomes({ day: 0, score: 70, skill: 'vocabulary' });
  studyFlow.attachTransferToOutcomes({ day: 0, score: 55, skill: 'grammar' });
  const o = storage.getStudyOutcomes()[0];
  assert.equal(o.transfer.vocabulary.score, 70);
  assert.equal(o.transfer.grammar.score, 55);
  assert.equal(o.transfer.listening, undefined, 'unassessed skills stay absent');
  // Participant summary exposes per-skill estimates:
  const [summary] = evidenceStudy.participantSummaries(storage.getStudyOutcomes());
  assert.equal(summary.transferBySkill.vocabulary.mean, 70);
  assert.equal(summary.transferBySkill.grammar.mean, 55);
  assert.equal(summary.transferBySkill.listening.mean, null, 'unassessed skill: null, never zero');
  assert.equal(protocol.PROTOCOL.transfer.overallScoreAllowed, false);
  // Legacy scalar rows read as vocabulary.
  const legacyRow = { ...o, transfer: { score: 80 } };
  const [legacySummary] = evidenceStudy.participantSummaries([legacyRow]);
  assert.equal(legacySummary.transferBySkill.vocabulary.mean, 80, 'legacy shape maps to vocabulary');
});

// ── 4. renderer/modality matching ──────────────────────────────────────────

test('the bank carries the payload each skill renderer needs (modality match)', async () => {
  const { bank, protocol } = await fresh();
  for (const item of bank.HELDOUT_BANK.filter((i) => i.reviewStatus === 'verified')) {
    switch (item.skill) {
      case 'vocabulary':
        assert.ok(item.fr && item.en, `${item.id}: recognition needs fr+en`);
        break;
      case 'vocabulary-prod':
      case 'grammar':
        assert.ok(Array.isArray(item.accept) && item.accept.length, `${item.id}: production needs accepted answers`);
        assert.ok(item.en || item.prompt, `${item.id}: production needs a prompt`);
        break;
      case 'listening':
        assert.ok(item.audio && !item.fr, `${item.id}: listening is audio-first (no written French before answering)`);
        break;
      case 'reading':
        assert.ok(item.text && item.en, `${item.id}: reading needs a passage + meaning`);
        break;
      case 'speaking':
        assert.ok(item.prompt && !item.accept, `${item.id}: speaking is an independent production task`);
        break;
      default:
        assert.fail(`${item.id}: unknown skill ${item.skill}`);
    }
  }
  // Every protocol skill has a renderer (RUNNERS map is the component's —
  // asserted via the module's exported bank coverage here).
  for (const skill of protocol.PROTOCOL.transfer.reportedPerSkill) {
    assert.ok(bank.HELDOUT_BANK.some((i) => i.skill === skill), `bank has ${skill} items`);
  }
});

// ── 5. lastActivityAt ──────────────────────────────────────────────────────

test('genuine study activity updates lastActivityAt; it round-trips through export', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const before = s.lastActivityAt ?? null;
  await new Promise((r) => setTimeout(r, 15));
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 0 });
  const after = storage.getStudyState().lastActivityAt;
  assert.ok(after, 'activity stamped');
  assert.ok(!before || new Date(after) >= new Date(before), 'stamp moves forward');
  // Export → import carries it.
  const bundle = storage.buildStudyBundle();
  assert.equal(bundle.study.lastActivityAt, after, 'attrition metadata round-trips');
});

test('withdrawal preserves lastActivityAt (never inferred from missing data)', async () => {
  const f = await fresh();
  const { studyFlow, storage } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date().toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-1', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 0 });
  const last = storage.getStudyState().lastActivityAt;
  studyFlow.withdrawStudyState({ deleteData: true });
  const w = storage.getStudyState();
  assert.equal(w.status, 'withdrawn');
  assert.ok(w.withdrawnAt, 'withdrawal timestamped');
  assert.equal(w.lastActivityAt, last, 'activity preserved through withdrawal');
});

// ── 7. ASR uncertainty propagation ─────────────────────────────────────────

test('ASR uncertainty: retest flags the outcome row and the classifier excludes it', async () => {
  const f = await fresh();
  const { studyFlow, storage, evidenceStudy } = f;
  const s = consentAndEnrol(f, { startLevel: 'B1' });
  const trial = { at: new Date(Date.now() - 3 * 86400000).toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: 'mg-asr', selectedConcept: 'c' };
  studyFlow.startOutcomeRecord({ trial, graph: [], arm: s.arm, day: 0 });
  // An uncertain recognition arrives with the retest.
  studyFlow.linkRetestToOutcomes({ mistakeId: 'mg-asr', retest: { at: new Date().toISOString(), correct: false, evidenceClass: 'REHEARSAL', asrUncertain: true } });
  const row = storage.getStudyOutcomes()[0];
  assert.equal(row.asrUncertain, true, 'flag propagated speech → transcription → outcome row');
  // The preregistered classifier excludes it from arm comparisons.
  const studiesById = { [s.participantId]: { ...s, protocolVersion: 1 } };
  const cls = evidenceStudy.classifyOutcomeForAnalysis(row, { studiesById, currentProtocolVersion: 1 });
  assert.equal(cls.classification, 'excluded-asr-uncertain');
  // And a pooled analysis excludes it too (participant contributes no summaries).
  const bundleRow = { ...row };
  const aggregation = await import(`../src/lib/researchAggregation.js?ra=${Date.now()}`);
  const bundle = {
    format: 'le-studio.validation-study', version: 2, stores: {},
    study: { participantId: s.participantId, arm: s.arm, enrolledAt: s.enrolledAt, status: 'active', protocolVersion: 1 },
    studyOutcomes: [bundleRow], studyChecks: [],
  };
  const pool = aggregation.poolStudyData({ imports: [bundle] });
  assert.equal(pool.exclusionCounts['excluded-asr-uncertain'], 1);
  assert.equal(pool.summaries.length, 0);
});

test('ASR-uncertain mastery rule unchanged: recognition failure never lowers language mastery', async () => {
  const { recordMistake, recordRetest } = await import('../src/lib/mistakeGraph.js');
  let g = recordMistake([], { type: 'vocabulary', concept: 'mot', source: 'conversation', attempt: 'a', corrected: 'b', confidence: 0.5, asrUncertain: true });
  const id = g[0].id;
  g = recordRetest(g, { id, correct: false });
  assert.ok(g[0].mastery >= 10, 'mastery not lowered by an uncertain recognition');
});

// ── protocol-only constants ────────────────────────────────────────────────

test('attrition thresholds live only in the protocol', async () => {
  const { protocol, evidenceStudy } = await fresh();
  const now = Date.now();
  // 14d = protocol.inactiveAfterDays: quiet 13d → active; 15d → inactive.
  // Enrolment 30d ago (below the 8-week completion window) so the only
  // discriminator is the inactivity threshold.
  const rec = (daysAgo) => ({ participantId: 'participant-t', arm: 'adaptive', status: 'active', enrolledAt: new Date(now - 30 * 86400000).toISOString(), lastActivityAt: new Date(now - daysAgo * 86400000).toISOString() });
  const active = evidenceStudy.attritionByArm([rec(13)], { now });
  assert.equal(active.adaptive.active, 1, '13d quiet is still active');
  const inactive = evidenceStudy.attritionByArm([rec(15)], { now });
  assert.equal(inactive.adaptive.inactive, 1, '15d quiet is inactive');
  assert.equal(protocol.PROTOCOL.attrition.inactiveAfterDays, 14);
  // Behaviour tracks the protocol: pass an explicit override and it moves.
  const overridden = evidenceStudy.attritionByArm([rec(13)], { now, inactiveAfterDays: 10 });
  assert.equal(overridden.adaptive.inactive, 1, 'configuration change moves behaviour');
});

test('per-skill metrics keep separate scored-participant counts (no cross-skill merge)', async () => {
  const { evidenceStudy } = await fresh();
  const mk = (pid, arm, skill, score) => {
    const rows = [{
      id: `${pid}-0`, participantId: pid, variant: arm, arm, at: '', day: 0, selectedId: 'mg-0',
      delayedShort: null, delayedLong: null,
      transfer: { [skill]: { score, source: 'held-out-check' } },
      recurred: null, completed: true,
    }];
    return evidenceStudy.participantSummaries(rows)[0];
  };
  const summaries = [
    mk('participant-v', 'adaptive', 'vocabulary', 80),
    mk('participant-g', 'adaptive', 'grammar', 40),
  ];
  const cmp = evidenceStudy.armComparison(summaries, { minPerArm: 1, minScoredPerMetric: 1 });
  assert.equal(cmp.adaptive.transferBySkill.vocabulary.mean, 0.8);
  assert.equal(cmp.adaptive.transferBySkill.grammar.mean, 0.4);
  assert.equal(cmp.adaptive.transferBySkill.listening.mean, null, 'no cross-skill borrowing');
  assert.equal(cmp.adaptive.transferBySkill.vocabulary.scoredParticipants, 1, 'per-skill participant count');
  assert.equal(cmp.adaptive.transferBySkill.grammar.scoredParticipants, 1);
});
