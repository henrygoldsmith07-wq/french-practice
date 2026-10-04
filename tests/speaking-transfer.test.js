import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  correctionImpact, shouldCorrectNow, freshContextChallenge,
  evaluateTransfer, transferResultCopy, CORRECTION_PRIORITY, correctionTarget,
  assessTransferNovelty,
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

  it('a recurring REAL slip is worth surfacing; a repeated style note still is not', () => {
    // Recurrence escalates mistakes — meaning/grammar slip twice and the
    // coach speaks up. But style is never a mistake, so its repetition buys
    // it nothing: fluent phrasing polish must not interrupt the conversation.
    assert.equal(shouldCorrectNow({ why: 'negation missing', recurrences: 2, original: 'x', correction: 'y' }), true);
    assert.equal(shouldCorrectNow({ why: 'stylistic', recurrences: 2, original: 'x', correction: 'y' }), false);
    assert.equal(shouldCorrectNow({ why: 'a slightly more elegant word choice', recurrences: 3, original: 'x', correction: 'y' }), false);
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
  const structured = {
    ...correction,
    impact: 'grammar',
    targetSkill: 'past-tense',
    targetForm: 'passé composé with être',
  };

  it('builds a genuinely new situation for the same structure', () => {
    const challenge = freshContextChallenge(correction, { originalContext: 'travel' });
    assert.ok(challenge, 'challenge exists');
    assert.notEqual(challenge.contextId, 'travel', 'context differs from the mistake context');
    assert.ok(challenge.prompt.toLowerCase().includes('new sentence'), 'prompt demands a NEW sentence');
    assert.ok(challenge.prompt.toLowerCase().includes('different subject'), 'prompt demands a new subject');
    assert.deepEqual(challenge.changesRequired, ['subject', 'vocabulary', 'situation', 'framing']);
  });

  it('retains the target rule but never demands the corrected sentence', () => {
    const challenge = freshContextChallenge(structured, {});
    assert.ok(challenge.prompt.includes('passé composé with être'), 'the RULE is retained');
    assert.ok(!challenge.prompt.includes('Je suis allé au marché'),
      'the corrected sentence itself must not be demanded — that measures memorisation');
    assert.equal(challenge.targetSkill, 'past-tense');
    assert.equal(challenge.structured, true);
  });

  it('demands independence at higher difficulty', () => {
    const easy = freshContextChallenge(structured, { difficulty: 1 });
    const hard = freshContextChallenge(structured, { difficulty: 3 });
    assert.ok(easy.hint, 'easy challenge offers a hint');
    assert.ok(easy.hint.includes('passé composé with être'), 'the hint names the rule, never the sentence');
    assert.ok(!easy.hint.includes('Je suis allé au marché'), 'a hint must not hand over the sentence');
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

describe('speaking transfer — phrase reuse is not transfer', () => {
  const correction = {
    original: "J'ai allé au marché",
    correction: 'Je suis allé au marché',
    impact: 'grammar',
    targetSkill: 'past-tense',
    targetForm: 'passé composé with être',
  };

  it('copying the corrected sentence verbatim earns no transfer evidence', () => {
    const result = evaluateTransfer({
      correct: true,
      independent: true,
      novelContext: true,
      attemptText: 'Je suis allé au marché.',
      correction,
    });
    assert.equal(result.countsAsTransfer, false, 'verbatim phrase reuse must not count');
    assert.equal(result.novelty, 'repeated-correction');
  });

  it('near-verbatim reuse (light rewording) also earns nothing', () => {
    const result = evaluateTransfer({
      correct: true,
      independent: true,
      novelContext: true,
      attemptText: 'je suis allé au marché hier',
      correction,
    });
    assert.equal(result.countsAsTransfer, false);
  });

  it('repeating the original mistake is not transfer either', () => {
    const result = evaluateTransfer({
      correct: true,
      independent: true,
      novelContext: true,
      attemptText: "J'ai allé au marché",
      correction,
    });
    assert.equal(result.countsAsTransfer, false);
    assert.equal(result.novelty, 'repeated-original');
  });

  it('a genuinely new sentence using the rule DOES earn transfer', () => {
    const result = evaluateTransfer({
      correct: true,
      independent: true,
      novelContext: true,
      attemptText: 'Elle est arrivée à Paris la semaine dernière.',
      correction,
    });
    assert.equal(result.countsAsTransfer, true, 'new subject, new words, same rule');
    assert.equal(result.independent, true);
    assert.equal(result.nextStep, 'delayed-retest', 'mastery is still not claimed');
  });

  it('the learner is told to rephrase, not to repair, after phrase reuse', () => {
    const reused = evaluateTransfer({
      correct: true,
      independent: true,
      novelContext: true,
      attemptText: 'Je suis allé au marché.',
      correction,
    });
    const copy = transferResultCopy(reused);
    assert.ok(copy.toLowerCase().includes('own words'), copy);
    assert.ok(!copy.toLowerCase().includes('repair it once more'),
      'phrase reuse is not a wrong answer — the copy must not send them to repair');
  });

  // ---- adversarial novelty: superficial changes are still memorisation -----

  it('a punctuation-only change is still the corrected sentence', () => {
    const result = assessTransferNovelty('Je suis allé au marché?', correction);
    assert.equal(result.transferred, false);
    assert.equal(result.reason, 'repeated-correction');
  });

  it('a capitalisation-only change is still the corrected sentence', () => {
    assert.equal(assessTransferNovelty('je SUIS allé au MARCHÉ.', correction).transferred, false);
  });

  it('a synonym swap over an unchanged skeleton is not transfer', () => {
    // "Je suis allé au marché" → "Je suis allé au supermarché": one word
    // swapped, everything else in order — a paraphrase of the sentence, not
    // use of the rule.
    const result = assessTransferNovelty('Je suis allé au supermarché', correction);
    assert.equal(result.transferred, false);
    assert.equal(result.reason, 'repeated-correction');
  });

  it('a subject swap with the identical phrase skeleton is not transfer', () => {
    // "J'ai acheté le pain" → "Il a acheté le pain": the pronoun changed, the
    // skeleton did not. This is the brief's "changed subject, identical
    // phrase skeleton" case.
    const pronounSwap = { original: "J'ai acheté le pain", correction: 'J\'ai acheté le pain', impact: 'grammar' };
    const result = assessTransferNovelty('Il a acheté le pain', pronounSwap);
    assert.equal(result.transferred, false);
  });

  it('material bolted onto the corrected sentence is not transfer', () => {
    // The corrected sentence appears verbatim inside a longer attempt —
    // that is recall of the sentence, not use of the rule in a new one.
    const result = assessTransferNovelty(
      'Hier soir, je suis allé au marché et j\'ai acheté des fleurs pour ma mère.',
      correction,
    );
    assert.equal(result.transferred, false);
    assert.equal(result.reason, 'repeated-correction');
  });

  it('a genuinely new valid sentence passes', () => {
    assert.equal(assessTransferNovelty('Elle est arrivée à Paris la semaine dernière.', correction).transferred, true);
    assert.equal(assessTransferNovelty('Nous sommes partis avant la pluie.', correction).transferred, true);
    assert.equal(assessTransferNovelty('Tu es monté dans le train à Lyon.', correction).transferred, true);
  });

  it('an alternative valid grammatical construction passes', () => {
    // Same target (past with être), different valid surface: "C\'est à Paris
    // qu\'elle est arrivée" or a reflexive form — both legitimate French.
    assert.equal(assessTransferNovelty('C\'est à Paris qu\'elle est arrivée.', correction).transferred, true);
    assert.equal(assessTransferNovelty('Elle s\'est levée tôt ce matin-là.', correction).transferred, true);
  });

  it('a vocabulary target MAY contain the corrected phrase in a new sentence', () => {
    // For a vocabulary fix the word must appear — the task is a new sentence
    // with it, so embedding the phrase is expected, not memorisation. Short
    // corrections reused in a new sentence are legitimate French too.
    const vocabFix = {
      original: 'Ça dépend',
      correction: 'Ça dépend',
      impact: 'vocabulary',
      targetSkill: 'word-choice',
      targetForm: 'Ça dépend',
    };
    assert.equal(assessTransferNovelty('Ça dépend de la météo, en fait.', vocabFix).transferred, true);
    // But a verbatim sentence is still repetition, even for vocabulary.
    assert.equal(assessTransferNovelty('Ça dépend', vocabFix).transferred, false);
  });

  it('a short correction used in a brand-new sentence is legitimate', () => {
    // "le pain" is a short fix; requiring a restructure would reject valid
    // French. The bar is only near-copies of SUBSTANTIAL sentences.
    const shortFix = { original: 'la pain', correction: 'le pain', impact: 'grammar' };
    assert.equal(assessTransferNovelty('Le pain est bon aujourd\'hui.', shortFix).transferred, true);
    assert.equal(assessTransferNovelty('J\'aime le pain.', shortFix).transferred, true);
  });

  it('an alternative valid construction with some shared words still passes', () => {
    // "Elle est arrivée à Paris" shares function words with the correction
    // but restructures the verb phrase — real production, not recall.
    assert.equal(assessTransferNovelty('Quand elle est arrivée, il pleuvait.', correction).transferred, true);
  });
});

describe('speaking transfer — structured correction metadata', () => {
  it('prefers the model impact over the text heuristics', () => {
    // The heuristic would call this "style" (a tone note), but the contract's
    // structured field wins when valid.
    assert.equal(correctionImpact({ impact: 'grammar', why: 'tone could be warmer' }), 'grammar');
    assert.equal(correctionImpact({ impact: 'meaning', why: 'stylistic' }), 'meaning');
  });

  it('ignores out-of-contract impact values and falls back to heuristics', () => {
    assert.equal(correctionImpact({ impact: 'catastrophic', why: 'negation missing' }), 'meaning');
    assert.equal(correctionImpact({ impact: 42, why: 'tone could be warmer' }), 'style');
  });

  it('exposes the target abstraction for repair and retest', () => {
    const target = correctionTarget({
      impact: 'grammar',
      targetSkill: 'adjective-agreement',
      targetForm: 'noun-adjective gender agreement',
      correction: 'la petite maison',
    });
    assert.equal(target.skill, 'adjective-agreement');
    assert.equal(target.form, 'noun-adjective gender agreement');
    assert.equal(target.requirement, 'noun-adjective gender agreement',
      'the requirement is the RULE, not the corrected phrase');
    assert.equal(target.structured, true);
  });

  it('degrades honestly when the model supplied no target', () => {
    const target = correctionTarget({ correction: 'la petite maison' });
    assert.equal(target.structured, false);
    assert.equal(target.requirement, 'la petite maison', 'the corrected form stands in as the weaker target');
  });

  it('style never interrupts; uncertainty is conservative', () => {
    assert.equal(shouldCorrectNow({ impact: 'style', correction: 'x', original: 'y', interruptRecommended: true }), false,
      'a model asking to interrupt on style is overruled');
    assert.equal(shouldCorrectNow({ level: 'uncertain', correction: 'x', original: 'y' }), false);
    assert.equal(shouldCorrectNow({ level: 'uncertain', correction: 'x', original: 'y', interruptRecommended: true }), true);
    assert.equal(shouldCorrectNow({ impact: 'meaning', correction: 'x', original: 'y', interruptRecommended: true }), true);
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
