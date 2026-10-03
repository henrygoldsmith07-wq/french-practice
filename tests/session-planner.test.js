import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCandidates, applySessionConstraints, buildSessionPlan, sessionBrief,
  activityTypeOf, SESSION_ARC, SCORE_FACTORS,
} from '../src/lib/sessionPlanner.js';

const weakness = (over = {}) => ({
  id: 'grammar:adjective-agreement', category: 'grammar', key: 'adjective-agreement',
  label: 'adjective agreement', errorCount: 2, successCount: 0, recurrenceCount: 0,
  independentPasses: 0, status: 'active', modes: ['conversation'], ...over,
});

describe('session planner scoring', () => {
  it('prioritises recurrence over one-off mistakes', () => {
    const cands = scoreCandidates({
      weaknesses: [
        weakness({ id: 'grammar:a', key: 'a', label: 'A', recurrenceCount: 2, errorCount: 3 }),
        weakness({ id: 'grammar:b', key: 'b', label: 'B', errorCount: 1, recurrenceCount: 0 }),
      ],
      hasListeningContent: false, hasScenario: false,
    });
    const a = cands.find((c) => c.target === 'grammar:a');
    const b = cands.find((c) => c.target === 'grammar:b');
    assert.ok(a.score > b.score, `recurrence candidate ${a.score} should outrank one-off ${b.score}`);
  });

  it('prioritises independent evidence over assisted performance', () => {
    const cands = scoreCandidates({
      weaknesses: [weakness({ successCount: 3, errorCount: 2, independentPasses: 0 })],
      hasListeningContent: false, hasScenario: false,
    });
    const repair = cands.find((c) => c.kind === 'repair');
    assert.ok(repair.factors[SCORE_FACTORS.independenceGap] > 0);
  });

  it('speaking rises when speaking time is starved', () => {
    const starved = scoreCandidates({ speakingMinutes7d: 0, hasListeningContent: false });
    const fed = scoreCandidates({ speakingMinutes7d: 120, hasListeningContent: false });
    const score = (cands) => cands.find((c) => c.kind === 'speak')?.score ?? 0;
    assert.ok(score(starved) > score(fed));
  });

  it('listening exposure is not neglected', () => {
    const starved = scoreCandidates({ listeningMinutes7d: 0 });
    const input = starved.find((c) => c.kind === 'input');
    assert.ok(input && input.factors[SCORE_FACTORS.listeningStarved] > 0);
  });

  it('a repeated target gets a repetition penalty', () => {
    const cands = scoreCandidates({
      weaknesses: [weakness()],
      recentPlans: [
        { kind: 'repair', target: 'grammar:adjective-agreement' },
        { kind: 'repair', target: 'grammar:adjective-agreement' },
      ],
      hasListeningContent: false, hasScenario: false,
    });
    const repair = cands.find((c) => c.kind === 'repair');
    assert.ok(repair.factors[SCORE_FACTORS.repetitionPenalty] < 0);
  });

  it('due vocabulary is a real candidate', () => {
    const cands = scoreCandidates({ srsDue: 8, hasListeningContent: false, hasScenario: false });
    const retrieve = cands.find((c) => c.kind === 'retrieve');
    assert.ok(retrieve && retrieve.factors[SCORE_FACTORS.dueVocabulary] > 0);
  });

  it('transfer checks surface when the model owes one', () => {
    const cands = scoreCandidates({
      evidenceDue: [{ type: 'transfer', target: { skill: 'grammar', label: 'adjective agreement' } }],
      hasListeningContent: false, hasScenario: false,
    });
    const transfer = cands.find((c) => c.kind === 'transfer');
    assert.ok(transfer && transfer.factors[SCORE_FACTORS.transferDue] > 0);
  });

  it('occasionally includes easy material for fluency', () => {
    const cands = scoreCandidates({ easyWinEligible: true, hasListeningContent: false, hasScenario: false });
    assert.ok(cands.some((c) => c.kind === 'warmup'));
    assert.ok(!scoreCandidates({ easyWinEligible: false, hasListeningContent: false, hasScenario: false }).some((c) => c.kind === 'warmup'));
  });

  it('goal-aligned weaknesses get a boost', () => {
    const withGoal = scoreCandidates({
      weaknesses: [weakness({ label: 'travel french' })], goals: ['travel french'],
      hasListeningContent: false, hasScenario: false,
    });
    const withoutGoal = scoreCandidates({
      weaknesses: [weakness({ label: 'travel french' })], goals: [],
      hasListeningContent: false, hasScenario: false,
    });
    const grab = (c) => c.find((x) => x.kind === 'repair')?.score ?? 0;
    assert.ok(grab(withGoal) > grab(withoutGoal));
  });
});

describe('session constraints', () => {
  it('never schedules the same activity type three times in a row', () => {
    const state = {
      weaknesses: [weakness({ id: 'g:a', key: 'a' }), weakness({ id: 'g:b', key: 'b' }), weakness({ id: 'g:c', key: 'c' })],
      hasListeningContent: false, hasScenario: false,
    };
    const { chosen } = applySessionConstraints(scoreCandidates(state), state);
    const kinds = chosen.map((c) => activityTypeOf(c.kind));
    for (let i = 2; i < kinds.length; i += 1) {
      assert.ok(!(kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2]),
        `three ${kinds[i]} segments in a row at ${i}`);
    }
  });

  it('does not target the same weakness excessively in one day', () => {
    const state = {
      weaknesses: [weakness()],
      recentPlans: [
        { kind: 'repair', target: 'grammar:adjective-agreement' },
        { kind: 'repair', target: 'grammar:adjective-agreement' },
      ],
      hasListeningContent: false, hasScenario: false,
    };
    const { chosen, adjustments } = applySessionConstraints(scoreCandidates(state), state);
    const hits = chosen.filter((c) => c.target === 'grammar:adjective-agreement').length;
    assert.ok(hits <= 1, `same weakness scheduled ${hits} more times`);
    assert.ok(adjustments.some((a) => a.includes('target-saturation')));
  });

  it('ensures speaking appears regularly', () => {
    const state = {
      weaknesses: [weakness({ id: 'g:a', key: 'a' }), weakness({ id: 'g:b', key: 'b' })],
      recentPlans: [{ kind: 'repair', target: 'g:a' }, { kind: 'retrieve', target: 'retrieve' }],
    };
    const { chosen } = applySessionConstraints(scoreCandidates(state), state);
    assert.ok(chosen.some((c) => c.kind === 'speak'), 'speaking missing from plan');
  });

  it('alternates receptive and productive work', () => {
    const state = {
      weaknesses: [weakness()], srsDue: 5,
      hasListeningContent: true, hasScenario: true,
    };
    const { chosen } = applySessionConstraints(scoreCandidates(state), state);
    const kinds = chosen.map((c) => activityTypeOf(c.kind));
    for (let i = 1; i < kinds.length; i += 1) {
      assert.ok(kinds[i] !== kinds[i - 1] || kinds.length <= 2, `same type twice in a row: ${kinds}`);
    }
  });
});

describe('buildSessionPlan', () => {
  it('builds one coherent session inside the requested minutes', () => {
    const plan = buildSessionPlan({
      minutes: 14,
      state: {
        weaknesses: [weakness()], srsDue: 3,
        hasListeningContent: true, hasScenario: true,
      },
    });
    assert.ok(plan.segments.length >= 2);
    assert.ok(plan.minutes >= 10 && plan.minutes <= 22, `minutes ${plan.minutes}`);
    assert.ok(plan.focus, 'plan has a focus');
    for (const seg of plan.segments) {
      assert.ok(SESSION_ARC.includes(seg.kind));
      assert.ok(seg.minutes >= 2);
      assert.ok(typeof seg.why === 'string' && seg.why.length > 0);
    }
  });

  it('follows the narrative arc order', () => {
    const plan = buildSessionPlan({
      minutes: 20,
      state: {
        weaknesses: [weakness()], srsDue: 5, easyWinEligible: true,
        evidenceDue: [{ type: 'transfer', target: { skill: 'grammar' } }],
        hasListeningContent: true, hasScenario: true,
      },
    });
    const order = plan.segments.map((s) => SESSION_ARC.indexOf(s.kind));
    const sorted = [...order].sort((a, b) => a - b);
    assert.deepEqual(order, sorted, 'segments follow the warm-up → … → retrieval arc');
  });

  it('avoids near-identical sessions across days via variety signals', () => {
    const state = {
      weaknesses: [weakness()], srsDue: 3,
      hasListeningContent: true, hasScenario: true,
      recentPlans: [
        { kind: 'repair', target: 'grammar:adjective-agreement' },
        { kind: 'retrieve', target: 'retrieve' },
      ],
    };
    const plan = buildSessionPlan({ minutes: 15, state });
    assert.ok(!plan.adjustments.includes('skipped:repair:type-run') || plan.segments.every((s) => s.target !== 'grammar:adjective-agreement' || plan.segments.filter((x) => x.target === 'grammar:adjective-agreement').length <= 1));
  });

  it('works for a brand-new learner without errors', () => {
    const plan = buildSessionPlan({ minutes: 10, state: {} });
    assert.ok(plan.segments.length >= 1);
    assert.ok(plan.minutes > 0);
    assert.ok(plan.demonstration !== undefined);
  });

  it('sessionBrief presents one dominant CTA and short reasons', () => {
    const plan = buildSessionPlan({ minutes: 14, state: { weaknesses: [weakness()], srsDue: 2 } });
    const brief = sessionBrief(plan, {
      minutes: 14, dueCount: 2,
      skillLabel: 'speaking confidence', weaknessLabel: 'adjective agreement',
    });
    assert.match(brief.cta, /Start today's session — 14 min/);
    assert.equal(brief.lines.length, 3);
    assert.ok(brief.lines.some((l) => l.includes('2 items due')));
    assert.ok(brief.lines.some((l) => l.includes('speaking confidence')));
    assert.ok(brief.lines.some((l) => l.includes('adjective agreement')));
    assert.ok(brief.demonstrate.length > 0);
  });

  it('brief copy never leaks engine terminology', () => {
    const plan = buildSessionPlan({ minutes: 10, state: { weaknesses: [weakness()] } });
    const brief = sessionBrief(plan, { minutes: 10, dueCount: 1 });
    const all = `${brief.cta} ${brief.lines.join(' ')} ${brief.demonstration}`;
    for (const bad of ['fp.', 'producer', 'calibration', 'candidate', 'engine', 'variant', 'arm', 'evidence']) {
      assert.ok(!all.toLowerCase().includes(bad), `brief leaks "${bad}"`);
    }
  });

  it('every planned segment carries inspectable reasons', () => {
    const plan = buildSessionPlan({
      minutes: 18,
      state: {
        weaknesses: [weakness({ recurrenceCount: 2 })], srsDue: 4,
        evidenceDue: [{ type: 'delayed', target: { skill: 'grammar' } }],
        hasListeningContent: true, hasScenario: true,
      },
    });
    for (const seg of plan.segments) {
      assert.ok(seg.explain, `segment ${seg.kind} lacks its explanation`);
      assert.equal(typeof seg.explain.score, 'number');
      assert.ok(Array.isArray(seg.explain.reasons));
      assert.ok(Array.isArray(seg.explain.penalties));
      assert.ok(seg.explain.reasons.length > 0 || seg.explain.penalties.length > 0,
        `segment ${seg.kind} has no stated reason at all`);
    }
    // The reasons read as plain language, never raw factor keys.
    const repair = plan.segments.find((s) => s.kind === 'repair');
    if (repair) {
      assert.ok(repair.explain.reasons.some((r) => r.includes('recurred') || r.includes('open weakness')),
        JSON.stringify(repair.explain.reasons));
    }
  });

  it('a due delayed retest outranks low-value novelty', () => {
    const cands = scoreCandidates({
      weaknesses: [],
      dueRetests: [{ id: 'mg-1', concept: 'past-tense', type: 'tense', recurrence: 1 }],
      easyWinEligible: true,
      hasListeningContent: true,
      hasScenario: false,
    });
    const review = cands.find((c) => c.kind === 'review');
    const warmup = cands.find((c) => c.kind === 'warmup');
    assert.ok(review && warmup, 'both candidates exist');
    assert.ok(review.score > warmup.score,
      `a due retest (${review.score}) must outrank an easy win (${warmup.score})`);
  });

  it('productive skills are not starved by receptive work', () => {
    const state = {
      weaknesses: [weakness()], srsDue: 12,
      hasListeningContent: true, hasScenario: true,
      speakingMinutes7d: 5,
    };
    const { chosen } = applySessionConstraints(scoreCandidates(state), state);
    const types = chosen.map((c) => activityTypeOf(c.kind));
    assert.ok(types.includes('speaking'), 'a starved productive skill still appears');
    assert.ok(types.includes('recall') || types.includes('repair'), 'receptive work still happens');
  });

  it('speaking and listening minimums hold even when weaknesses dominate', () => {
    const manyWeak = [1, 2, 3, 4, 5].map((n) => weakness({ id: `g:${n}`, key: `k${n}`, label: `w${n}`, errorCount: 5 }));
    const { chosen } = applySessionConstraints(scoreCandidates({
      weaknesses: manyWeak,
      speakingMinutes7d: 0,
      listeningMinutes7d: 0,
      hasListeningContent: true,
      hasScenario: true,
    }), { weaknesses: manyWeak, hasListeningContent: true, hasScenario: true, listeningMinutes7d: 0 });
    assert.ok(chosen.some((c) => c.kind === 'speak'), 'speaking floor holds under weakness pressure');
    assert.ok(chosen.some((c) => c.kind === 'input' || c.kind === 'warmup'), 'listening floor holds');
  });

  it('degraded/offline environments still generate a useful session', () => {
    // No scenario, no listening content, no AI: the plan must still contain
    // real work (recall/repair) rather than collapsing to nothing.
    const plan = buildSessionPlan({
      minutes: 10,
      state: {
        weaknesses: [weakness()], srsDue: 3,
        hasScenario: false, hasListeningContent: false,
      },
    });
    assert.ok(plan.segments.length >= 1, 'a degraded plan still has segments');
    assert.ok(plan.segments.every((s) => ['repair', 'retrieve', 'review', 'transfer'].includes(s.kind)),
      `degraded plan scheduled an unavailable modality: ${plan.segments.map((s) => s.kind)}`);
    assert.ok(plan.minutes > 0);
  });

  it('a recent repeated activity gets a diversity penalty', () => {
    const cands = scoreCandidates({
      weaknesses: [weakness()],
      recentPlans: [
        { kind: 'repair', target: 'grammar:adjective-agreement' },
        { kind: 'retrieve', target: 'retrieve' },
        { kind: 'retrieve', target: 'retrieve' },
      ],
      srsDue: 6,
      hasListeningContent: false,
      hasScenario: false,
    });
    const retrieve = cands.find((c) => c.kind === 'retrieve');
    assert.ok(retrieve.factors[SCORE_FACTORS.repetitionPenalty] < 0,
      'recently repeated activity is penalised');
  });
});
