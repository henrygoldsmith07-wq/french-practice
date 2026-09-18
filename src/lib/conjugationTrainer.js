// Conjugation trainer engine — produce forms on demand, entirely offline.
//
// The reference tables (reference.js) are hand-verified because irregular
// verbs cannot be generated reliably. The three REGULAR families can be:
// every clean -er, -ir and -re verb follows one ending table per tense, so
// this module generates those forms from (stem, family, tense, person) and
// the test suite cross-checks every generated cell against the authored
// parler/finir/attendre tables (see tests/conjugation-trainer.test.js).
//
// Irregular verbs are served verbatim from the authored tables — never
// guessed. Verbs whose stems shift (manger→mangeons, lever→lèverai,
// appeler→appelle) are deliberately excluded: a generated form must never
// be silently wrong.

import { CONJUGATIONS, PERSONS, TENSES } from './reference.js';

// Ending tables, indexed by person (order = PERSONS: je tu il/elle nous vous ils/elles).
const ENDINGS = {
  er: {
    present: ['e', 'es', 'e', 'ons', 'ez', 'ent'],
    imparfait: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
    cond: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    subj: ['e', 'es', 'e', 'ions', 'iez', 'ent'],
  },
  ir: {
    present: ['is', 'is', 'it', 'issons', 'issez', 'issent'],
    imparfait: ['issais', 'issais', 'issait', 'issions', 'issiez', 'issaient'],
    futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
    cond: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    subj: ['isse', 'isses', 'isse', 'issions', 'issiez', 'issent'],
  },
  re: {
    present: ['s', 's', '', 'ons', 'ez', 'ent'],
    imparfait: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    futur: ['ai', 'as', 'a', 'ons', 'ez', 'ont'],
    cond: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    subj: ['e', 'es', 'e', 'ions', 'iez', 'ent'],
  },
};

// Clean, invariable-stem regulars that extend the authored three. Family is
// derivable from the infinitive for every entry here.
const REGULAR_EXTRAS = {
  er: [
    { inf: 'aimer', ipa: '/eme/', en: 'to love / like' },
    { inf: 'jouer', ipa: '/ʒue/', en: 'to play' },
    { inf: 'écouter', ipa: '/ekute/', en: 'to listen' },
    { inf: 'travailler', ipa: '/tʁavaje/', en: 'to work' },
    { inf: 'habiter', ipa: '/abite/', en: 'to live' },
  ],
  ir: [
    { inf: 'choisir', ipa: '/ʃwaziʁ/', en: 'to choose' },
    { inf: 'réussir', ipa: '/ʁeysiʁ/', en: 'to succeed' },
    { inf: 'remplir', ipa: '/ʁɑ̃pliʁ/', en: 'to fill' },
    { inf: 'grandir', ipa: '/ɡʁɑ̃diʁ/', en: 'to grow up' },
  ],
  re: [
    { inf: 'attendre', ipa: '/atɑ̃dʁ/', en: 'to wait' },
    { inf: 'vendre', ipa: '/vɑ̃dʁ/', en: 'to sell' },
    { inf: 'entendre', ipa: '/ɑ̃tɑ̃dʁ/', en: 'to hear' },
    { inf: 'répondre', ipa: '/ʁepɔ̃dʁ/', en: 'to answer' },
    { inf: 'perdre', ipa: '/pɛʁdʁ/', en: 'to lose' },
  ],
};

const familyOf = (inf) =>
  inf.endsWith('er') && !inf.endsWith('yer') ? 'er'
    : inf.endsWith('ir') ? 'ir'
      : inf.endsWith('re') ? 're'
        : null;

// Stems used by the generated tenses. `futurStem` is the infinitive minus the
// final -e for -re verbs (attendre → attendr-), the infinitive otherwise.
/** Generated forms for a clean regular verb; null if the infinitive is not one. */
export function regularForms(inf) {
  const family = familyOf(inf);
  if (!family) return null;
  const stem = inf.slice(0, -2); // parl-, fin-, attend-
  const futurStem = family === 're' ? inf.slice(0, -1) : inf; // attendr-, parler, finir
  const participle = family === 'er' ? `${stem}é` : family === 'ir' ? `${stem}i` : `${stem}u`;
  const tenses = {};

  // present / imparfait / subj come straight from the ending table.
  tenses.present = ENDINGS[family].present.map((e) => stem + e);
  tenses.imparfait = ENDINGS[family].imparfait.map((e) => stem + e);
  tenses.subj = ENDINGS[family].subj.map((e) => stem + e);
  // futur / cond hang off the future stem.
  tenses.futur = ENDINGS[family].futur.map((e) => futurStem + e);
  tenses.cond = ENDINGS[family].cond.map((e) => futurStem + e);
  // passé composé: avoir + participle (all verbs here take avoir).
  tenses.passe = ['ai', 'as', 'a', 'avons', 'avez', 'ont'].map((aux) => `${aux} ${participle}`);
  return { family, stem, participle, tenses };
}

/**
 * The full trainer verb pool: the 10 authored irregulars (verbatim tables)
 * plus the generated regulars. Each entry: { inf, ipa, en, family, generated,
 * tenses, minLevel }.
 */
export function trainerVerbs() {
  const authored = CONJUGATIONS.map((v) => ({
    inf: v.inf, ipa: v.ipa, en: v.en, family: familyOf(v.inf), generated: false, tenses: v.tenses,
  }));
  const generated = [];
  for (const [family, list] of Object.entries(REGULAR_EXTRAS)) {
    for (const { inf, ipa, en } of list) {
      const forms = regularForms(inf);
      if (forms) generated.push({ inf, ipa, en, family, generated: true, tenses: forms.tenses });
    }
  }
  return [...authored, ...generated];
}

/** Which tenses can actually be prompted for a verb (typing an answer must be unambiguous). */
export function promptableTenses(verb) {
  return Object.entries(verb.tenses)
    .filter(([, forms]) => forms.length === 6 && forms.every((f) => f && !f.includes('(')))
    .map(([id]) => id);
}

const LEVEL_TENSES = {
  A1: ['present'],
  A2: ['present', 'passe', 'imparfait'],
  B1: ['present', 'passe', 'imparfait', 'futur', 'cond'],
  B2: ['present', 'passe', 'imparfait', 'futur', 'cond', 'subj'],
  C1: ['present', 'passe', 'imparfait', 'futur', 'cond', 'subj'],
  C2: ['present', 'passe', 'imparfait', 'futur', 'cond', 'subj'],
};

const LEVEL_VERBS = {
  A1: ['être', 'avoir', 'aller', 'faire', 'parler', 'aimer', 'jouer', 'habiter', 'écouter'],
  A2: ['finir', 'choisir', 'travailler', 'prendre', 'pouvoir', 'vouloir', 'vendre'],
  B1: ['attendre', 'entendre', 'répondre', 'perdre', 'venir', 'réussir', 'remplir', 'grandir'],
  B2: [],
  C1: [],
  C2: [],
};

/**
 * A pool holding exactly one verb — the conjugation-trainer gap — optionally
 * narrowed to its one weak tense. Powers the Today session's conj-drill chain
 * link, which drills the exact missed form. Returns null when the verb/tense
 * cannot be prompted at all, in which case a focused session drill just ends
 * (the gap is not repairable through typed prompts).
 */
export function focusedPool(focus = {}) {
  const { verb, tense } = focus || {};
  if (!verb) return null;
  const entry = trainerVerbs().find((v) => v.inf === verb);
  if (!entry) return null;
  const tenses = promptableTenses(entry).filter((t) => !tense || t === tense);
  return tenses.length ? [{ verb: entry, tenses }] : null;
}

/** Verbs + tenses a learner at this CEFR level should drill. */
export function poolForLevel(level = 'B1') {
  const verbs = trainerVerbs();
  const tenseIds = LEVEL_TENSES[level] || LEVEL_TENSES.B1;
  const order = [...(LEVEL_VERBS[level] || []), ...(LEVEL_VERBS.A1 || []), ...(LEVEL_VERBS.A2 || []), ...(LEVEL_VERBS.B1 || [])];
  const seen = new Set();
  const pool = [];
  for (const inf of order) {
    if (seen.has(inf)) continue;
    seen.add(inf);
    const verb = verbs.find((v) => v.inf === inf);
    if (!verb) continue;
    const tenses = tenseIds.filter((t) => promptableTenses(verb).includes(t));
    if (tenses.length) pool.push({ verb, tenses });
  }
  return pool;
}

export const tenseLabel = (id) => (TENSES.find((t) => t.id === id) || {}).label || id;

/**
 * A typed answer. `avoid` keeps the same form from repeating back to back.
 * `personIndex` pins the grammatical person (0–5) — used by the focused
 * session drill to lead with the EXACT cell the learner missed.
 */
export function makePrompt(pool, { avoid = null, pick = Math.random, personIndex = null } = {}) {
  if (!pool.length) return null;
  const pinned = Number.isInteger(personIndex) && personIndex >= 0 && personIndex <= 5 ? personIndex : null;
  let combo = null;
  for (let i = 0; i < 8 && !combo; i++) {
    const { verb, tenses } = pool[Math.floor(pick() * pool.length)];
    const tenseId = tenses[Math.floor(pick() * tenses.length)];
    const personIdx = pinned ?? Math.floor(pick() * 6);
    const key = `${verb.inf}:${tenseId}:${personIdx}`;
    if (key !== avoid) combo = { verb, tenseId, personIndex: personIdx, key };
  }
  if (!combo) return null;
  const answer = combo.verb.tenses[combo.tenseId][combo.personIndex];
  return {
    inf: combo.verb.inf,
    ipa: combo.verb.ipa,
    en: combo.verb.en,
    tenseId: combo.tenseId,
    tense: tenseLabel(combo.tenseId),
    person: PERSONS[combo.personIndex],
    personIndex: combo.personIndex,
    answer,
    key: combo.key,
  };
}

/** Full sentence for TTS: «Je parle» with elision (je + ai → j'ai). */
export function spokenSentence(prompt) {
  const spoken = { je: 'Je', tu: 'Tu', 'il/elle': 'Il', nous: 'Nous', vous: 'Vous', 'ils/elles': 'Ils' }[prompt.person] || prompt.person;
  if (spoken === 'Je' && /^[aeiouéèh]/i.test(prompt.answer)) return `J'${prompt.answer}`;
  return `${spoken} ${prompt.answer}`;
}

const foldAccents = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalise = (s) => String(s).trim().toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ');

/**
 * Exact-but-humane check: case, spacing and apostrophe shape are forgiven;
 * accents are graded — a full match is 'correct', an accent-only slip is
 * 'near' (the distinction IS the lesson: parlé vs parle), anything else is
 * 'wrong'.
 */
export function checkForm(attempt, answer) {
  const a = normalise(attempt);
  const b = normalise(answer);
  if (!a) return 'blank';
  if (a === b) return 'correct';
  if (foldAccents(a) === foldAccents(b)) return 'near';
  return 'wrong';
}
