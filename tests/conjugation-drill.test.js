import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agreementVariants,
  buildQueue,
  conjugationItems,
  gradeAnswer,
  itemId,
  looseKey,
  recordResult,
  strictKey,
  weakestAreas,
} from '../src/lib/conjugationDrill.js';

describe('comparison keys', () => {
  it('loose key drops accents, case and punctuation', () => {
    assert.equal(looseKey('  Parlé, '), 'parle');
    assert.equal(looseKey('êtes allé(e)'), 'etes alle(e)');
  });

  it('strict key keeps accents but settles spacing and quotes', () => {
    assert.equal(strictKey('  Parlé '), 'parlé');
    assert.equal(strictKey('j’ai'), "j'ai");
  });

  it('handles empty and nullish input', () => {
    assert.equal(looseKey(null), '');
    assert.equal(strictKey(undefined), '');
  });
});

describe('agreementVariants', () => {
  it('returns a bracket-free form unchanged', () => {
    assert.deepEqual(agreementVariants('parle'), ['parle']);
  });

  it('expands a single optional group', () => {
    assert.deepEqual(agreementVariants('allé(e)').sort(), ['allé', 'allée']);
  });

  it('expands every combination of repeated groups', () => {
    const variants = agreementVariants('êtes allé(e)(s)').sort();
    assert.deepEqual(variants, ['êtes allé', 'êtes allée', 'êtes allées', 'êtes allés']);
  });

  it('expands a group followed by a fixed letter', () => {
    assert.deepEqual(agreementVariants('sommes allé(e)s').sort(), ['sommes allées', 'sommes allés']);
  });
});

describe('gradeAnswer', () => {
  it('accepts the exact authored form', () => {
    assert.equal(gradeAnswer('parle', 'parle').verdict, 'correct');
    assert.equal(gradeAnswer('  Parlé  ', 'parlé').verdict, 'correct');
  });

  it('accepts any valid reading of an optional agreement', () => {
    for (const answer of ['allé', 'allée', 'allés', 'allées']) {
      assert.equal(gradeAnswer(answer, 'allé(e)(s)').verdict, 'correct', answer);
    }
  });

  it('marks a missing accent wrong, but names it as an accent error', () => {
    const r = gradeAnswer('parle', 'parlé');
    assert.equal(r.verdict, 'accent-error');
    assert.equal(r.correct, false, 'an accent error is still wrong');
    assert.equal(r.nearest, 'parlé');
  });

  it('treats a wrong accent the same as a missing one', () => {
    assert.equal(gradeAnswer('parlè', 'parlé').verdict, 'accent-error');
  });

  it('finds the agreement reading the learner was closest to', () => {
    const r = gradeAnswer('allees', 'allé(e)(s)');
    assert.equal(r.verdict, 'accent-error');
    assert.equal(r.nearest, 'allées');
  });

  it('marks a different form incorrect, not an accent error', () => {
    const r = gradeAnswer('parlons', 'parlé');
    assert.equal(r.verdict, 'incorrect');
    assert.equal(r.correct, false);
  });

  it('reports an empty answer separately', () => {
    assert.equal(gradeAnswer('', 'parlé').verdict, 'empty');
    assert.equal(gradeAnswer('   ', 'parlé').verdict, 'empty');
    assert.equal(gradeAnswer(null, 'parlé').verdict, 'empty');
  });
});

describe('conjugationItems', () => {
  const items = conjugationItems();

  it('covers every authored cell', () => {
    // 10 verbs x 6 tenses x 6 persons, with no invented forms.
    assert.equal(items.length, 360);
    assert.ok(items.every((i) => typeof i.answer === 'string' && i.answer.length > 0));
  });

  it('gives every cell a stable, unique id', () => {
    assert.equal(new Set(items.map((i) => i.id)).size, items.length);
    assert.equal(items[0].id, itemId(items[0].inf, items[0].tenseId, items[0].personIndex));
  });

  it('carries the person and tense a prompt needs', () => {
    const item = items.find((i) => i.id === itemId('être', 'present', 0));
    assert.equal(item.person, 'je');
    assert.equal(item.answer, 'suis');
    assert.equal(item.tenseLabel, 'Présent');
    assert.equal(item.irregular, true);
  });

  it('weights irregular verbs and harder tenses above the baseline', () => {
    const easy = items.find((i) => i.id === itemId('parler', 'present', 0));
    const hard = items.find((i) => i.id === itemId('être', 'subj', 0));
    assert.ok(hard.weight > easy.weight);
    assert.equal(easy.weight, 1);
  });
});

describe('buildQueue', () => {
  it('returns the requested number of items', () => {
    assert.equal(buildQueue({}, { limit: 12 }).length, 12);
    assert.equal(buildQueue({}, { limit: 0 }).length, 0);
  });

  it('filters to a verb and a tense', () => {
    const q = buildQueue({}, { verbs: ['être'], tenses: ['subj'], limit: 50 });
    assert.equal(q.length, 6, 'six persons');
    assert.ok(q.every((i) => i.inf === 'être' && i.tenseId === 'subj'));
  });

  it('puts a cell the learner gets wrong ahead of an untouched one', () => {
    const target = itemId('parler', 'present', 0); // the lowest-weight cell there is
    const stats = { [target]: { seen: 4, right: 0, wrong: 4, accentWrong: 0 } };
    const q = buildQueue(stats, { limit: 5 });
    assert.equal(q[0].id, target);
  });

  it('sinks a cell the learner always gets right', () => {
    const mastered = itemId('être', 'subj', 0); // the highest-weight cell there is
    const stats = { [mastered]: { seen: 10, right: 10, wrong: 0, accentWrong: 0 } };
    const q = buildQueue(stats, { limit: 10 });
    assert.ok(!q.some((i) => i.id === mastered));
  });

  it('counts an accent error, but at half the weight of a wrong form', () => {
    const a = itemId('parler', 'present', 0);
    const b = itemId('parler', 'present', 1);
    // Whole bank, so both cells are certainly present to compare.
    const q = buildQueue({
      [a]: { seen: 2, right: 0, wrong: 2, accentWrong: 0 },
      [b]: { seen: 2, right: 0, wrong: 0, accentWrong: 2 },
    }, { limit: 400 });
    const rank = (id) => q.findIndex((i) => i.id === id);
    assert.ok(rank(a) >= 0 && rank(b) >= 0, 'both cells are in the queue');
    assert.ok(rank(a) < rank(b), 'the wrong form outranks the accent slip');
  });

  it('is deterministic for the same stats', () => {
    const ids = () => buildQueue({}, { limit: 8 }).map((i) => i.id);
    assert.deepEqual(ids(), ids());
  });
});

describe('recordResult', () => {
  const id = itemId('parler', 'present', 0);

  it('counts each verdict in its own bucket', () => {
    let stats = {};
    stats = recordResult(stats, id, { verdict: 'correct' });
    stats = recordResult(stats, id, { verdict: 'accent-error' });
    stats = recordResult(stats, id, { verdict: 'incorrect' });
    stats = recordResult(stats, id, { verdict: 'empty' });
    assert.deepEqual(stats[id], { seen: 4, right: 1, wrong: 2, accentWrong: 1 });
  });

  it('does not mutate the map it was given', () => {
    const before = {};
    const after = recordResult(before, id, { verdict: 'correct' });
    assert.deepEqual(before, {});
    assert.equal(after[id].seen, 1);
  });

  it('copes with a missing stats map', () => {
    assert.equal(recordResult(undefined, id, { verdict: 'correct' })[id].seen, 1);
  });
});

describe('weakestAreas', () => {
  it('withholds a verdict below the evidence floor, and says how far off it is', () => {
    const stats = { [itemId('parler', 'present', 0)]: { seen: 3, right: 1, wrong: 2, accentWrong: 0 } };
    const w = weakestAreas(stats, { minAnswers: 15 });
    assert.equal(w.ready, false);
    assert.equal(w.answers, 3);
    assert.equal(w.needed, 12);
    assert.deepEqual(w.tenses, []);
    assert.equal(w.accentShare, null);
  });

  it('ranks tenses and verbs by error rate, not by raw count', () => {
    const stats = {
      // Subjonctive: 8 of 10 wrong. Présent: 4 of 20 wrong — more errors, better rate.
      [itemId('être', 'subj', 0)]: { seen: 10, right: 2, wrong: 8, accentWrong: 0 },
      [itemId('parler', 'present', 0)]: { seen: 20, right: 16, wrong: 4, accentWrong: 0 },
    };
    const w = weakestAreas(stats);
    assert.equal(w.ready, true);
    assert.equal(w.answers, 30);
    assert.equal(w.tenses[0].key, 'subj');
    assert.equal(w.tenses[0].errorRate, 0.8);
    assert.equal(w.verbs[0].key, 'être');
  });

  it('reports how much of the trouble is only written accents', () => {
    const stats = {
      [itemId('parler', 'passe', 0)]: { seen: 20, right: 10, wrong: 0, accentWrong: 10 },
    };
    const w = weakestAreas(stats);
    assert.equal(w.accentShare, 0.5);
    assert.equal(w.tenses[0].errorRate, 0.5);
  });

  it('ignores entries that are not conjugation items', () => {
    const stats = {
      'vocab:chien': { seen: 50, right: 0, wrong: 50 },
      [itemId('parler', 'present', 0)]: { seen: 20, right: 20, wrong: 0, accentWrong: 0 },
    };
    const w = weakestAreas(stats);
    assert.equal(w.answers, 20);
    assert.equal(w.verbs.length, 1);
  });

  it('is empty-safe', () => {
    const w = weakestAreas({});
    assert.equal(w.ready, false);
    assert.equal(w.answers, 0);
  });
});
