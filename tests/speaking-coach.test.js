import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldInterrupt, rankCorrections, turnInterruptions, sessionOutlook, COACH_BUDGET,
} from '../src/lib/speakingCoach.js';

const grammar = (over = {}) => ({
  original: "J'ai allé au marché",
  correction: 'Je suis allé au marché',
  note: 'past tense with être',
  level: 'definite_error',
  impact: 'grammar',
  targetSkill: 'past-tense',
  targetForm: 'passé composé with être',
  ...over,
});

describe('speaking coach — correction budget', () => {
  it('interrupts at most once per turn', () => {
    const state = { turnCorrectionsSoFar: 1, interruptsSoFar: 0 };
    assert.equal(shouldInterrupt(grammar(), state), false);
    assert.equal(shouldInterrupt(grammar(), { turnCorrectionsSoFar: 0 }), true);
  });

  it('caps session interruptions so the learner keeps speaking', () => {
    assert.equal(shouldInterrupt(grammar(), { interruptsSoFar: COACH_BUDGET.perSession }), false);
    assert.equal(shouldInterrupt(grammar(), { interruptsSoFar: COACH_BUDGET.perSession - 1 }), true);
  });

  it('a repeated error escalates past the cap — one repeat beats three one-offs', () => {
    assert.equal(
      shouldInterrupt(grammar(), { interruptsSoFar: COACH_BUDGET.perSession, recurrences: 2 }),
      true,
      'an escalated repeat earns the extra slot',
    );
  });

  it('style never interrupts, however often it repeats', () => {
    assert.equal(shouldInterrupt({ ...grammar(), impact: 'style', recurrences: 4 }), false);
    assert.equal(shouldInterrupt({ ...grammar(), level: 'stylistic_suggestion' }), false);
    assert.equal(shouldInterrupt({ ...grammar(), level: 'acceptable_alternative' }), false);
  });

  it('an isolated stylistic slip never earns an interruption on its own', () => {
    const lone = { original: 'x', correction: 'y', level: 'definite_error', impact: 'style' };
    assert.equal(shouldInterrupt(lone, {}), false);
  });
});

describe('speaking coach — correction ranking', () => {
  it('meaning outranks grammar outranks vocabulary outranks intelligibility', () => {
    const ranked = rankCorrections([
      { ...grammar(), targetSkill: 'v1', impact: 'vocabulary' },
      { ...grammar(), targetSkill: 'm1', impact: 'meaning' },
      { ...grammar(), targetSkill: 'i1', impact: 'intelligibility' },
      { ...grammar(), targetSkill: 'g1', impact: 'grammar' },
    ]);
    assert.deepEqual(ranked.map((r) => r.impact), ['meaning', 'grammar', 'vocabulary', 'intelligibility']);
  });

  it('repeats merge into one instruction, not three', () => {
    const ranked = rankCorrections([
      grammar(),
      grammar({ original: 'bis', correction: 'Je suis allé' }),
      grammar({ original: 'ter', correction: "suis allé" }),
    ]);
    assert.equal(ranked.length, 1, 'one concept, one instruction');
    assert.equal(ranked[0].recurrences, 3);
  });

  it('a concept already seen in the session escalates', () => {
    const ranked = rankCorrections([grammar()], {
      sessionConcepts: new Set(['past-tense']),
    });
    assert.equal(ranked[0].escalated, true);
  });

  it('style drops out of the ranking entirely', () => {
    const ranked = rankCorrections([{ ...grammar(), impact: 'style' }]);
    assert.equal(ranked.length, 0);
  });
});

describe('speaking coach — turn interruptions', () => {
  it('returns at most one interruption per turn, most important first', () => {
    const out = turnInterruptions([
      { ...grammar(), targetSkill: 'a', impact: 'vocabulary' },
      { ...grammar(), targetSkill: 'b', impact: 'meaning' },
      { ...grammar(), targetSkill: 'c', impact: 'grammar' },
    ], {});
    assert.equal(out.length, COACH_BUDGET.perTurn);
    assert.equal(out[0].impact, 'meaning');
  });

  it('an empty turn stays silent', () => {
    assert.deepEqual(turnInterruptions([], {}), []);
  });
});

describe('speaking coach — session outlook', () => {
  it('summarises what carried and what to fix next, from the session itself', () => {
    const outlook = sessionOutlook({
      history: [
        { evaluation: { scores: { overall: 88 } } },
        { evaluation: { scores: { overall: 92 } } },
        { evaluation: { scores: { overall: 61 } } },
      ],
      carriedWell: ['ordered confidently', 'asked follow-up questions'],
      interruptions: [{ targetForm: 'passé composé with être', concept: 'past-tense' }],
    });
    assert.equal(outlook.communicated.length, 2);
    assert.ok(outlook.nextAction.toLowerCase().includes('passé composé'));
    assert.ok(outlook.problems.length <= 3);
  });

  it('a clean session gets an honest "keep going" action', () => {
    const outlook = sessionOutlook({ history: [], interruptions: [] });
    assert.ok(outlook.nextAction.toLowerCase().includes('fluency'));
  });
});
