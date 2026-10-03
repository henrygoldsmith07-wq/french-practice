import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  groupErrorsByCategory, selectImportantErrors, comparisonView,
  buildRepairTasks, isMeaningAffecting, categorise, repairSummary,
  ERROR_CATEGORIES,
} from '../src/lib/writingRepair.js';

const correction = (over = {}) => ({
  original: 'J\'ai allé au marché.',
  correction: 'Je suis allé au marché.',
  why: 'past tense with être: use être + past participle.',
  ...over,
});

describe('writing repair — grouping and selection', () => {
  it('groups errors by category with labels', () => {
    const groups = groupErrorsByCategory([
      correction(),
      correction({ original: 'le pain', correction: 'la pain', why: 'agreement: pain is masculine' }),
      correction({ original: 'je ne sais', correction: 'je ne sais pas', why: 'negation needs pas' }),
    ]);
    const cats = groups.map((g) => g.category);
    assert.ok(cats.includes('tense'), JSON.stringify(cats));
    assert.ok(cats.includes('agreement'), JSON.stringify(cats));
    for (const g of groups) assert.ok(ERROR_CATEGORIES.includes(g.category));
  });

  it('selects at most 3, meaning-affecting first', () => {
    const many = [
      correction({ original: 'un petit', correction: 'une petite', why: 'spelling: missing e' }),
      correction({ original: 'il va', correction: 'il allait', why: 'tense: use the imperfect here' }),
      correction({ original: 'bonjour', correction: 'bonsoir', why: 'style: more natural in the evening' }),
      correction({ original: 'je ne peux', correction: 'je ne peux pas', why: 'negation: missing pas' }),
      correction({ original: 'rapide', correction: 'rapidement', why: 'grammar: adverb form' }),
    ];
    const selected = selectImportantErrors(many, { max: 3 });
    assert.equal(selected.length, 3, 'never floods');
    // Meaning changes (negation, tense) lead.
    const why = selected.map((c) => c.why).join(' | ');
    assert.ok(why.includes('negation'), why);
    assert.ok(why.includes('tense'), why);
    assert.ok(!why.includes('style'), 'style loses to meaning');
  });

  it('a spelling-only error loses to a meaning error', () => {
    const [first] = selectImportantErrors([
      correction({ original: 'mange', correction: 'mangé', why: 'spelling: missing accent' }),
      correction({ original: 'je veux', correction: 'je ne veux pas', why: 'negation: meaning reversed' }),
    ]);
    assert.ok(first.why.includes('negation'));
  });

  it('recurring patterns beat one-offs of equal weight', () => {
    const [first] = selectImportantErrors([
      correction({ original: 'a', correction: 'b', why: 'grammar: one-off', recurrences: 0 }),
      correction({ original: 'c', correction: 'd', why: 'grammar: again!', recurrences: 3 }),
    ]);
    assert.ok(first.why.includes('again'));
  });

  it('the comparison view has the three product parts', () => {
    const view = comparisonView('J\'ai allé', 'Je suis allé', 'Use être with movement verbs.');
    assert.equal(view.yourVersion, 'J\'ai allé');
    assert.equal(view.improvedVersion, 'Je suis allé');
    assert.equal(view.why, 'Use être with movement verbs.');
  });

  it('categorises conservatively with style as the default', () => {
    assert.equal(categorise(correction({ why: 'the tense here is wrong' })), 'tense');
    assert.equal(categorise(correction({ why: 'agreement with the noun' })), 'agreement');
    assert.equal(categorise({ original: 'il va vite', correction: 'il vite va' }), 'word-order');
    assert.equal(categorise({ original: 'x', correction: 'y' }), 'style');
  });
});

describe('writing repair — active repair loop', () => {
  it('repair tasks demand the learner types the fix', () => {
    const tasks = buildRepairTasks([correction()]);
    assert.equal(tasks.length, 1);
    const task = tasks[0];
    assert.ok(task.repairPrompt.includes('yourself'));
    assert.ok(task.rewriteInstruction.includes('rewrite'));
    assert.deepEqual(task.accept, ['Je suis allé au marché.']);
    assert.ok(task.id.startsWith('repair:'));
  });

  it('meaning detection covers negation, tense, pronoun, number', () => {
    assert.equal(isMeaningAffecting('je ne sais pas', 'je sais'), true, 'negation');
    assert.equal(isMeaningAffecting('il est allé', 'il allait'), true, 'tense');
    assert.equal(isMeaningAffecting('je le veux', 'tu le veux'), true, 'pronoun');
    assert.equal(isMeaningAffecting('j\'ai deux chats', 'j\'ai trois chats'), true, 'number');
    assert.equal(isMeaningAffecting('la petite maison', 'la petite maison'), false, 'no change');
    assert.equal(isMeaningAffecting('', 'x'), false, 'empty input');
  });

  it('the repair summary is plain and forward-looking', () => {
    assert.ok(repairSummary([]).includes('Nothing repaired'));
    const summary = repairSummary([1, 2]);
    assert.ok(summary.includes('2 sentences repaired by you'));
    assert.ok(summary.includes('later task'));
  });

  it('never throws on junk corrections', () => {
    assert.deepEqual(selectImportantErrors([null, undefined, {}]).length > 0 ? ['x'] : [], ['x']);
    assert.deepEqual(buildRepairTasks(null), []);
    assert.deepEqual(groupErrorsByCategory(null), []);
  });
});
