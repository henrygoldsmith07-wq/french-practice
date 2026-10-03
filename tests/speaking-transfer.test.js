import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  correctionImpact, shouldCorrectNow, freshContextChallenge,
  evaluateTransfer, transferResultCopy, CORRECTION_PRIORITY,
} from '../src/lib/speakingTransfer.js';

describe('speaking transfer — correction triage', () => {
  it('meaning and grammar mistakes interrupt the conversation', () => {
    assert.equal(shouldCorrectNow({ original: 'je ne pas', correction: 'je ne sais pas', why: 'negation word order' }), true);
    assert.equal(shouldCorrectNow({ topic: 'past tense narration', original: 'x', correction: 'y' }), true);
    assert.equal(shouldCorrectNow({ type: 'vocabulary', original: 'x', correction: 'y' }), true);
    assert.equal(shouldCorrectNow({ why: 'pronunciation — liaison', original: 'x', correction: 'y' }), true);
  });

  it('stylistic detail is left alone', () => {
    assert.equal(shouldCorrectNow({ why: 'a slightly more elegant word choice', original: 'x', correction: 'y' }), false);
    assert.equal(shouldCorrectNow({ level: 'acceptable_alternative', original: 'x', correction: 'y' }), false);
    assert.equal(correctionImpact({ why: 'tone could be warmer' }), 'style');
  });

  it('a recurring slip is always worth surfacing', () => {
    assert.equal(shouldCorrectNow({ why: 'stylistic', recurrences: 2, original: 'x', correction: 'y' }), true);
  });

  it('classifies impact conservatively', () => {
    assert.equal(correctionImpact({ original: 'je ne pas comprends', correction: 'je ne comprends pas' }), 'meaning');
    assert.equal(correctionImpact({ original: 'le pain', correction: 'la pain' }), 'style');
    assert.equal(correctionImpact({ why: 'wrong word for this context' }), 'vocabulary');
    assert.equal(correctionImpact({ why: 'misheard because of liaison' }), 'intelligibility');
    assert.equal(CORRECTION_PRIORITY.meaning > CORRECTION_PRIORITY.style, true);
  });
});

describe('speaking transfer — fresh-context challenge', () => {
  const correction = {
    original: "J'ai allé au marché",
    correction: 'Je suis allé au marché',
    why: 'past tense with être',
    topic: 'past tense',
    type: 'grammar',
  };

  it('builds a genuinely new situation for the same structure', () => {
    const challenge = freshContextChallenge(correction, { originalContext: 'travel' });
    assert.ok(challenge, 'challenge exists');
    assert.notEqual(challenge.contextId, 'travel', 'context differs from the mistake context');
    assert.ok(challenge.prompt.includes('Je suis allé au marché'), 'prompt demands the repaired form');
    assert.ok(challenge.prompt.toLowerCase().includes('change the topic entirely'));
  });

  it('demands independence at higher difficulty', () => {
    const easy = freshContextChallenge(correction, { difficulty: 1 });
    const hard = freshContextChallenge(correction, { difficulty: 3 });
    assert.ok(easy.hint, 'easy challenge offers the form');
    assert.equal(hard.hint, null, 'hard challenge offers no hint');
    assert.equal(hard.requiresIndependence, true);
    assert.ok(hard.prompt.includes('without planning'));
  });

  it('never invents a challenge from nothing', () => {
    assert.equal(freshContextChallenge({}, {}), null);
    assert.equal(freshContextChallenge({ correction: '   ' }, {}), null);
  });

  it('challenge copy is plain language', () => {
    const challenge = freshContextChallenge(correction, {});
    for (const bad of ['evidence', 'fp.', 'engine', 'candidate', 'transfer evidence', 'cycle']) {
      assert.ok(!challenge.prompt.toLowerCase().includes(bad), `prompt leaks "${bad}"`);
    }
  });
});

describe('speaking transfer — what a transfer proves', () => {
  it('one clean pass proves transfer, never mastery', () => {
    const result = evaluateTransfer({ correct: true, independent: true, novelContext: true });
    assert.equal(result.countsAsTransfer, true);
    assert.equal(result.independent, true);
    assert.equal(result.nextStep, 'delayed-retest', 'a delayed check is still owed');
  });

  it('an assisted pass needs an independent retry', () => {
    const result = evaluateTransfer({ correct: true, hinted: true, novelContext: true });
    assert.equal(result.independent, false);
    assert.equal(result.nextStep, 'retry-independent');
  });

  it('a re-answer of the same situation is not transfer', () => {
    const result = evaluateTransfer({ correct: true, independent: true, novelContext: false });
    assert.equal(result.countsAsTransfer, false);
    assert.equal(result.nextStep, 'delayed-retest');
  });

  it('a miss sends the learner back to repair', () => {
    assert.equal(evaluateTransfer({ correct: false }).nextStep, 'repair-again');
  });

  it('result copy is honest about independence', () => {
    const independent = transferResultCopy(evaluateTransfer({ correct: true, independent: true, novelContext: true }));
    const hinted = transferResultCopy(evaluateTransfer({ correct: true, hinted: true, novelContext: true }));
    const missed = transferResultCopy(evaluateTransfer({ correct: false }));
    assert.ok(independent.toLowerCase().includes('on your own'));
    assert.ok(hinted.toLowerCase().includes('without the hint'));
    assert.ok(missed.toLowerCase().includes('repair'));
  });
});
