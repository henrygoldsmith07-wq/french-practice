import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  trainerVerbs, regularForms, poolForLevel, makePrompt, checkForm, spokenSentence, promptableTenses, focusedPool,
} from '../src/lib/conjugationTrainer.js';
import { CONJUGATIONS, PERSONS } from '../src/lib/reference.js';

test('the generator reproduces every authored regular table exactly', () => {
  // parler (-er) and finir (-ir) are the authored regular tables; every
  // generated verb of that family must conjugate exactly like them.
  for (const inf of ['parler', 'finir']) {
    const authored = CONJUGATIONS.find((v) => v.inf === inf);
    const generated = regularForms(inf);
    assert.ok(generated, `${inf} is a clean regular`);
    for (const [tenseId, forms] of Object.entries(authored.tenses)) {
      assert.deepEqual(generated.tenses[tenseId], forms, `${inf} ${tenseId} matches the authored table`);
    }
  }
  // The -re family has no authored table (the only authored -re verb,
  // prendre, is irregular), so pin it with hand-verified vendre forms.
  const vendre = regularForms('vendre').tenses;
  assert.deepEqual(vendre.present, ['vends', 'vends', 'vend', 'vendons', 'vendez', 'vendent']);
  assert.deepEqual(vendre.passe, ['ai vendu', 'as vendu', 'a vendu', 'avons vendu', 'avez vendu', 'ont vendu']);
  assert.deepEqual(vendre.futur, ['vendrai', 'vendras', 'vendra', 'vendrons', 'vendrez', 'vendront']);
  assert.deepEqual(vendre.subj, ['vende', 'vendes', 'vende', 'vendions', 'vendiez', 'vendent']);
});

test('authored regulars are served verbatim, not regenerated', () => {
  const verbs = trainerVerbs();
  for (const inf of ['parler', 'finir']) {
    const v = verbs.find((x) => x.inf === inf);
    assert.ok(v, `${inf} is in the pool`);
    assert.equal(v.generated, false, `${inf} keeps the authored flag`);
    assert.deepEqual(v.tenses, CONJUGATIONS.find((x) => x.inf === inf).tenses);
  }
});

test('irregular verbs are never generated — always verbatim authored tables', () => {
  const verbs = trainerVerbs();
  for (const inf of ['être', 'avoir', 'aller', 'faire', 'prendre', 'pouvoir', 'vouloir', 'venir']) {
    const v = verbs.find((x) => x.inf === inf);
    assert.ok(v, `${inf} is in the pool`);
    assert.equal(v.generated, false, `${inf} comes from the authored table`);
  }
  const authored = CONJUGATIONS.find((v) => v.inf === 'venir');
  const served = verbs.find((v) => v.inf === 'venir');
  assert.deepEqual(served.tenses, authored.tenses);
});

test('regular extras stay regular: known irregular stems are excluded', () => {
  const pool = trainerVerbs().map((v) => v.inf);
  // Stem-shifting verbs a naive ending table would get wrong.
  for (const inf of ['manger', 'lever', 'appeler', 'acheter', 'payer']) {
    assert.ok(!pool.includes(inf), `${inf} is excluded`);
  }
  // And every extra really is derivable from the infinitive.
  for (const v of trainerVerbs().filter((x) => x.generated)) {
    assert.ok(v.tenses.present.every((f) => !f.includes('(')), `${v.inf} forms are typeable`);
  }
});

test('every pool verb has six forms per promptable tense and no ambiguous parentheses', () => {
  const verbs = trainerVerbs();
  assert.ok(verbs.length >= CONJUGATIONS.length, 'pool extends the authored set');
  for (const v of verbs) {
    for (const tenseId of promptableTenses(v)) {
      const forms = v.tenses[tenseId];
      assert.equal(forms.length, 6);
      assert.ok(forms.every((f) => typeof f === 'string' && f.length && !f.includes('(')), `${v.inf} ${tenseId} forms are typeable`);
    }
  }
});

test('promptable tenses exclude agreement-ambiguous cells', () => {
  const venir = trainerVerbs().find((v) => v.inf === 'venir');
  const tenses = promptableTenses(venir);
  assert.ok(tenses.includes('present') && tenses.includes('subj'), 'the teaching core is promptable');
  // venir/aller use être in the passé composé with parenthesised agreement
  // (suis venu(e)) — no single typed answer exists, so it is never prompted.
  assert.ok(!tenses.includes('passe'), 'parenthesised agreement forms are not prompted');
  // Whatever is promptable must actually be paren-free.
  for (const tenseId of tenses) {
    assert.ok(venir.tenses[tenseId].every((f) => !f.includes('(')), `${tenseId} is unambiguous`);
  }
});

test('level pools respect the CEFR ladder', () => {
  const a1 = poolForLevel('A1');
  assert.ok(a1.length >= 5);
  assert.ok(a1.every(({ tenses }) => tenses.every((t) => t === 'present')), 'A1 drills the present only');
  assert.ok(a1.some(({ verb }) => verb.inf === 'être'), 'core verbs are in every pool');
  const b2 = poolForLevel('B2');
  assert.ok(b2.some(({ tenses }) => tenses.includes('subj')), 'B2 adds the subjunctive');
  assert.ok(b2.length >= a1.length, 'higher levels never drill less');
  const b1 = poolForLevel('B1');
  assert.ok(b1.some(({ verb }) => verb.inf === 'attendre'), 'regular -re verbs appear from B1');
  // Every pool entry only offers tenses that are actually promptable.
  for (const { verb, tenses } of [...a1, ...b1, ...b2]) {
    const promptable = promptableTenses(verb);
    assert.ok(tenses.every((t) => promptable.includes(t)), `${verb.inf} pool tenses are all promptable`);
  }
});

test('makePrompt always points at a real cell and honours avoid', () => {
  const pool = poolForLevel('B1');
  const p = makePrompt(pool, { pick: () => 0 });
  assert.ok(p && p.answer.length);
  assert.equal(p.person, PERSONS[p.personIndex]);
  assert.ok(p.tense && p.tense.length);
  // avoid: with a single-verb/single-tense pool, a second pick lands on the
  // next person instead of repeating the avoided cell.
  const single = poolForLevel('A1').slice(0, 1);
  const p0 = makePrompt(single, { pick: () => 0 });
  const p1 = makePrompt(single, { avoid: p0.key, pick: () => 0.17 });
  assert.ok(p1, 'a prompt exists despite the avoid');
  assert.notEqual(p1.key, p0.key, 'avoid respected');
});

test('checkForm grades accents, forgives case and apostrophe shape', () => {
  assert.equal(checkForm('parle', 'parle'), 'correct');
  assert.equal(checkForm('  Parle ', 'parle'), 'correct');
  assert.equal(checkForm("j'ai", 'j’ai'), 'correct', 'typographic apostrophes are forgiven');
  assert.equal(checkForm('parlé', 'parle'), 'near', 'accent-only slip is near, not wrong');
  assert.equal(checkForm('parlent', 'parle'), 'wrong');
  assert.equal(checkForm('', 'parle'), 'blank');
  assert.equal(checkForm('avons  ete', 'avons été'), 'near');
});

test('focusedPool narrows to one verb (and one tense) for the session drill link', () => {
  // The Today session's conj-drill chain link drills the exact weak form.
  const pool = focusedPool({ verb: 'finir', tense: 'passe' });
  assert.equal(pool.length, 1, 'exactly the weak verb');
  assert.equal(pool[0].verb.inf, 'finir');
  assert.deepEqual(pool[0].tenses, ['passe'], 'narrowed to the weak tense');
  const p = makePrompt(pool);
  assert.equal(p.inf, 'finir');
  assert.equal(p.tenseId, 'passe');

  // No tense filter → the verb's full promptable range.
  const wide = focusedPool({ verb: 'finir' });
  assert.ok(wide[0].tenses.length > 1, 'without a tense the pool spans the verb');

  // Unknown verb or unpromptable tense → null, which ends the drill segment.
  assert.equal(focusedPool({ verb: 'nonsense' }), null);
  assert.equal(focusedPool({ verb: 'finir', tense: 'not-a-tense' }), null);
  assert.equal(focusedPool(null), null);
});

test('spokenSentence elides je before a vowel sound', () => {
  const s = spokenSentence({ person: 'je', answer: 'ai été' });
  assert.equal(s, "J'ai été");
  assert.equal(spokenSentence({ person: 'nous', answer: 'avons' }), 'Nous avons');
  const pool = poolForLevel('A1');
  const p = makePrompt(pool, { pick: () => 0 });
  const sentence = spokenSentence(p);
  assert.ok(sentence.includes(p.answer), 'sentence contains the answer');
});
