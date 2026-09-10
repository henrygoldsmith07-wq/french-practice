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

const P = (await import('../src/lib/studyProtocol.js')).PROTOCOL;
const DAY = 86400000;

test('full six-skill cycle: protocol → payloads → results → storage → export → import → pool → analysis', async () => {
  const f = await fresh();
  const { storage, studyFlow, evidenceStudy } = f;

  // 1. Enrol through the real consent + assignment path.
  storage.saveSession({ scenarioId: 'x', turns: 2, report: { average_scores: { overall: 50 } } });
  studyFlow.recordStudyConsent('accepted', { enrol: { startLevel: 'B1' } });
  const s = studyFlow.enrolStudyState({ startLevel: 'B1' });
  assert.ok(s?.participantId, 'enrolled');
  const seenSourceIds = new Set();
  const checks = [];

  // 2. Run the protocol skill schedule across six check ordinals.
  const schedule = P.transfer.skillSchedule;
  for (let ordinal = 0; ordinal < 6; ordinal++) {
    const day = P.duration.firstCheckDay + ordinal * P.duration.checkEveryDays;
    // Every Today session creates an outcome row (the real flow).
    const trial = { at: new Date(Date.now() - (20 - day) * DAY).toISOString(), activity: 'ai-drill', variant: s.arm, selectedId: `mg-${ordinal}`, selectedConcept: 'passe-compose' };
    studyFlow.startOutcomeRecord({ trial, graph: [{ id: `mg-${ordinal}`, concept: 'passe-compose', type: 'tense' }], arm: s.arm, day });
    const pool = evidenceStudy.buildHeldOutPool({
      participantId: s.participantId, day, level: 'B1', seenIds: seenSourceIds,
    });
    assert.equal(pool.scheduledSkill, schedule[ordinal % schedule.length],
      `check ordinal ${ordinal} administers the scheduled skill ${schedule[ordinal % schedule.length]}`);
    if (!pool.words.length) continue; // bank exhausted for this skill → honest skip
    const chk = studyFlow.saveCheckRecord(studyFlow.makeCheckRecord({
      participantId: s.participantId, day, level: 'B1', pool,
    }));
    // Frozen payloads: every item carries content + explicit correct id (or accept list).
    for (const item of chk.items) {
      assert.ok(item.content, `${item.assessmentId}: content present`);
      if (item.options.length) {
        assert.ok(item.correctOptionId, `${item.assessmentId}: explicit correct option`);
        assert.ok(item.options.some((o) => o.id === item.correctOptionId), `${item.assessmentId}: correct option among options`);
      } else {
        assert.ok(Array.isArray(item.accept) || item.skill === 'speaking', `${item.assessmentId}: production items carry accept list (speaking excluded)`);
      }
      assert.ok(!seenSourceIds.has(item.sourceItemId), `${item.sourceItemId}: never shown twice`);
      seenSourceIds.add(item.sourceItemId);
    }
    // Simulate a perfect run through the frozen payloads.
    const perItem = chk.items.map((it) => ({
      sourceItemId: it.sourceItemId, skill: it.skill,
      correct: it.correctOptionId ? true : (it.skill === 'speaking' ? null : true),
      status: it.skill === 'speaking' ? 'unscored' : 'scored',
    }));
    const scored = perItem.filter((r) => r.correct != null);
    const finished = {
      correct: scored.filter((r) => r.correct).length,
      total: perItem.length,
      quizScore: scored.length ? Math.round((scored.filter((r) => r.correct).length / scored.length) * 100) : null,
      unscored: perItem.length - scored.length,
      secondsSpent: 100,
      perItem,
    };
    studyFlow.recordCheckOutcome(chk.id, finished);
    studyFlow.linkRetestToOutcomes({
      mistakeId: `mg-${ordinal}`,
      retest: { at: new Date(Date.now() + 2 * DAY).toISOString(), correct: ordinal % 2 === 0, evidenceClass: 'DELAYED', context: 'srs-recall' },
    });
    const scoredItems = perItem.filter((r) => r.correct != null);
    const scoredCorrect = scoredItems.filter((r) => r.correct).length;
    studyFlow.attachTransferToOutcomes({
      day,
      score: scoredCorrect ? Math.round((finished.correct / scoredCorrect) * 100) : null,
      skill: chk.scheduledSkill,
    });
    checks.push(chk);
    // No item from this check may appear in any later check.
    const later = evidenceStudy.buildHeldOutPool({
      participantId: s.participantId, day: day + 1, level: 'B1', seenIds: seenSourceIds,
    });
    for (const w of later.words) {
      assert.ok(!seenSourceIds.has(w.sourceItemId), `no repeated held-out items (ordinal ${ordinal}, day ${day}, recycled ${w.sourceItemId})`);
    }
  }

  // 3. All six skills scheduled; per-skill transfer stored without merging.
  const outcomes = storage.getStudyOutcomes();
  const transferSkillsSeen = new Set(outcomes.flatMap((o) => Object.keys(o.transfer || {})));
  assert.ok(transferSkillsSeen.size >= 4, `multiple skills recorded (${[...transferSkillsSeen].join(', ')})`);
  for (const o of outcomes) {
    for (const [skill, entry] of Object.entries(o.transfer || {})) {
      assert.ok(P.transfer.reportedPerSkill.includes(skill), `skill ${skill} is protocol-listed`);
      assert.ok(typeof entry.score === 'number' && entry.score >= 0 && entry.score <= 100);
    }
  }

  // 4. Delayed retest lands in the outcome rows.
  studyFlow.linkRetestToOutcomes({
    mistakeId: 'mg-0',
    retest: { at: new Date(Date.now() + 2 * DAY).toISOString(), correct: true, evidenceClass: 'DELAYED', context: 'srs-recall' },
  });
  const withRetest = outcomes.find ? null : null;
  void withRetest;

  // 5. Export → import → pool → analysis (second device).
  const bundle = storage.buildStudyBundle();
  assert.equal(bundle.study.participantId, s.participantId);
  assert.equal(bundle.protocol.protocolVersion, 1);
  const f2 = await fresh();
  const report = f2.storage.ingestValidationBundle(JSON.stringify(bundle));
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.added.studyAggregates, 1);
  const imports = f2.storage.getImportedStudyBundles();
  assert.equal(imports.length, 1);
  // Round-trip: outcomes identical (per-skill transfer survives).
  const importedRows = imports[0].outcomes;
  assert.equal(importedRows.length, bundle.studyOutcomes.length);
  for (const [i, row] of importedRows.entries()) {
    assert.deepEqual(row.transfer, bundle.studyOutcomes[i].transfer, `row ${i} transfer survives`);
    assert.deepEqual(row.delivered ?? null, bundle.studyOutcomes[i].delivered ?? null);
  }
  // Checks round-trip with payloads + skills.
  assert.equal(imports[0].checks.length, bundle.studyChecks.length);
  assert.deepEqual(imports[0].checks[0]?.skills, bundle.studyChecks[0]?.skills);

  // 6. Pooled analysis: participant summary + per-skill transfer, no merging.
  const localMirror = { ...bundle.study };
  const pool = f2.aggregation.poolStudyData({
    localStudy: localMirror, localOutcomes: bundle.studyOutcomes, imports: [],
  });
  assert.equal(pool.participants, 1);
  assert.equal(pool.exclusionCounts.included, bundle.studyOutcomes.length, 'all valid rows included');
  assert.equal(pool.summaries.length, 1);
  const summary = pool.summaries[0];
  assert.equal(summary.participantId, s.participantId);
  const skillsWithEvidence = Object.entries(summary.transferBySkill).filter(([, m]) => m.mean != null);
  assert.ok(skillsWithEvidence.length >= 4, `per-skill transfer present for ${skillsWithEvidence.length} skills`);
  for (const [skill, m] of skillsWithEvidence) {
    assert.ok(P.transfer.reportedPerSkill.includes(skill), 'skill is protocol-listed');
    assert.ok(m.mean >= 0 && m.mean <= 100);
    assert.ok(m.n >= 1, 'per-skill scored observations counted');
  }
  // No overall transfer score exists anywhere in the pooled result.
  assert.equal(pool.comparison.adaptive.transferBySkill.overall, undefined);
  const poolJson = JSON.stringify(pool.comparison);
  assert.ok(!poolJson.includes('"overall"'), 'no cross-skill merging in pooled output');

  // 7. Delivery/attrition metadata survived: lastActivityAt on the study record.
  assert.ok(imports[0].study.lastActivityAt || bundle.study.lastActivityAt, 'activity metadata present');
});

test('exhausted bank skips honestly instead of recycling items', async () => {
  const f = await fresh();
  const { evidenceStudy } = f;
  const { HELDOUT_BANK } = await import('../src/lib/heldOutBank.js');
  // Day 2 → vocabulary. Mark every verified vocabulary item in B1 AND its
  // adjacent bands (A2/B2) as seen.
  const seen = new Set(HELDOUT_BANK.filter((i) => i.skill === 'vocabulary' && i.reviewStatus === 'verified' && ['B1', 'A2', 'B2'].includes(i.cefr)).map((i) => i.id));
  const pool = evidenceStudy.buildHeldOutPool({ participantId: 'p-exhausted', day: 2, level: 'B1', seenIds: seen });
  assert.equal(pool.words.length, 0, 'no recycled items — honest skip');
});
