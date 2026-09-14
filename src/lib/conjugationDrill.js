// Conjugation drill — production practice over the hand-verified tables in
// `reference.js`.
//
// The app has full conjugation *tables*, but reading a table is recognition;
// the exam and the conversation both demand production. This turns the same
// authored data into typed recall, with three properties French specifically
// needs:
//
// 1. **Accents are graded, not ignored.** `mange` for `mangé` is a real error
//    and is marked as one — but it is a *different* error from writing the
//    wrong verb, and the learner is told which they made. Silently accepting
//    unaccented input teaches a habit that costs marks in every written paper.
// 2. **Optional agreement is optional.** `passé composé` forms in the tables
//    carry written agreement as `allé(e)s`. Every reading of those brackets is
//    accepted, because the drill cannot know the subject's gender or number.
// 3. **Selection is by difficulty, not by order.** Irregular stems and the
//    tenses learners avoid (subjunctive, conditional) carry more weight, so a
//    session does not fill up with `parler` at the présent.
//
// Everything here is pure and offline: no model call, no network. Scheduling
// is left to the existing FSRS entry points — this module only produces items,
// grades answers, and says why an answer was wrong.

import { CONJUGATIONS, PERSONS, TENSES } from './reference.js';

/** Verbs whose stems change rather than following the -er/-ir/-re patterns. */
const IRREGULAR = new Set(['être', 'avoir', 'aller', 'faire', 'prendre', 'pouvoir', 'vouloir', 'venir']);

/**
 * Relative difficulty of each tense, used only for selection weighting.
 * Présent is the baseline; the subjunctive is where learners actually lose
 * marks, and the drill should reach it rather than orbit the easy tenses.
 */
const TENSE_WEIGHT = {
  present: 1,
  passe: 1.2,
  imparfait: 1.3,
  futur: 1.4,
  cond: 1.6,
  subj: 2,
};

export const DRILL_PREFIX = 'conj';

const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Loose comparison key: lowercase, unaccented, punctuation- and
 * whitespace-normalised. Two forms sharing this key differ only in accents.
 */
export function looseKey(s) {
  return stripDiacritics(String(s == null ? '' : s))
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact comparison key: accents preserved, only spacing and quotes settled. */
export function strictKey(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every reading of a form containing optional agreement brackets.
 * `allé(e)s` -> allés, allées; `êtes allé(e)(s)` -> allé, allée, allés, allées.
 * A form with no brackets yields itself, so callers need no special case.
 */
export function agreementVariants(form) {
  let out = [String(form == null ? '' : form)];
  // Expand one bracket group at a time so nested/repeated groups all resolve.
  for (let guard = 0; guard < 6; guard += 1) {
    if (!out.some((v) => v.includes('('))) break;
    out = out.flatMap((v) => {
      const at = v.indexOf('(');
      if (at === -1) return [v];
      const close = v.indexOf(')', at);
      if (close === -1) return [v.replace('(', '')];
      const inner = v.slice(at + 1, close);
      const without = v.slice(0, at) + v.slice(close + 1);
      const with_ = v.slice(0, at) + inner + v.slice(close + 1);
      return [without, with_];
    });
  }
  return [...new Set(out.map((v) => v.replace(/\s+/g, ' ').trim()))];
}

/** Stable id for one cell of one table. */
export function itemId(inf, tenseId, personIndex) {
  return `${DRILL_PREFIX}:${inf}:${tenseId}:${personIndex}`;
}

/**
 * Every drillable cell across every authored verb.
 * A missing tense on a verb is skipped rather than invented.
 */
export function conjugationItems() {
  const items = [];
  for (const verb of CONJUGATIONS) {
    for (const tense of TENSES) {
      const forms = verb.tenses?.[tense.id];
      if (!Array.isArray(forms)) continue;
      forms.forEach((form, personIndex) => {
        if (!form) return;
        items.push({
          id: itemId(verb.inf, tense.id, personIndex),
          inf: verb.inf,
          en: verb.en,
          ipa: verb.ipa,
          tenseId: tense.id,
          tenseLabel: tense.label,
          personIndex,
          person: PERSONS[personIndex],
          answer: form,
          irregular: IRREGULAR.has(verb.inf),
          weight: (TENSE_WEIGHT[tense.id] || 1) * (IRREGULAR.has(verb.inf) ? 1.4 : 1),
        });
      });
    }
  }
  return items;
}

/**
 * Grade one typed answer.
 *
 * Verdicts:
 *   correct       exactly the authored form (any valid agreement reading)
 *   accent-error  the right word, written without or with the wrong accents
 *   incorrect     a different form
 *   empty         nothing typed
 *
 * `accent-error` is deliberately not folded into `correct`: it is wrong, and
 * the caller is expected to mark it wrong. Naming it separately is what lets
 * the UI say *which* accent was missed instead of a bare cross.
 */
export function gradeAnswer(input, expected) {
  const typed = String(input == null ? '' : input).trim();
  if (!typed) return { verdict: 'empty', correct: false, expected };

  const variants = agreementVariants(expected);
  const strict = new Set(variants.map(strictKey));
  const loose = new Set(variants.map(looseKey));
  const typedStrict = strictKey(typed);
  const typedLoose = looseKey(typed);

  if (strict.has(typedStrict)) return { verdict: 'correct', correct: true, expected };
  if (loose.has(typedLoose)) {
    return {
      verdict: 'accent-error',
      correct: false,
      expected,
      // The reading they were closest to, so the UI can diff against it.
      nearest: variants.find((v) => looseKey(v) === typedLoose) || variants[0],
    };
  }
  return { verdict: 'incorrect', correct: false, expected };
}

/**
 * Session queue, hardest-first with a stable tiebreak.
 *
 * `stats` maps item id -> { seen, wrong, accentWrong }. A cell the learner has
 * got wrong outranks an untouched one; a cell they have only ever got right
 * sinks. Accent errors count, at half the weight of a wrong form — they are
 * real, but they are closer to knowing it.
 *
 * `filter` narrows to a verb or tense; passing neither drills everything.
 */
export function buildQueue(stats = {}, { verbs = null, tenses = null, limit = 20 } = {}) {
  const wanted = (item) => (!verbs || verbs.includes(item.inf))
    && (!tenses || tenses.includes(item.tenseId));

  const scored = conjugationItems().filter(wanted).map((item) => {
    const st = stats[item.id] || {};
    const seen = Number(st.seen) || 0;
    const wrong = Number(st.wrong) || 0;
    const accentWrong = Number(st.accentWrong) || 0;
    // Unseen cells sit above mastered ones but below known problems.
    const trouble = wrong + accentWrong * 0.5;
    const mastery = seen > 0 ? Math.max(0, (seen - trouble) / seen) : 0;
    const priority = item.weight * (1 + trouble * 2) * (seen === 0 ? 1.5 : 1 - mastery * 0.6);
    return { item, priority };
  });

  scored.sort((a, b) => b.priority - a.priority || a.item.id.localeCompare(b.item.id));
  return scored.slice(0, Math.max(0, limit)).map((s) => s.item);
}

/** Fold one graded answer into the stats map. Returns a new map. */
export function recordResult(stats, itemIdValue, result) {
  const prev = stats?.[itemIdValue] || { seen: 0, right: 0, wrong: 0, accentWrong: 0 };
  const next = {
    seen: (prev.seen || 0) + 1,
    right: (prev.right || 0) + (result.verdict === 'correct' ? 1 : 0),
    wrong: (prev.wrong || 0) + (result.verdict === 'incorrect' || result.verdict === 'empty' ? 1 : 0),
    accentWrong: (prev.accentWrong || 0) + (result.verdict === 'accent-error' ? 1 : 0),
  };
  return { ...(stats || {}), [itemIdValue]: next };
}

/**
 * What the learner is actually getting wrong, as evidence rather than a score.
 * Returns null below `minAnswers` — a handful of answers cannot distinguish a
 * weak tense from a bad afternoon.
 */
export function weakestAreas(stats = {}, { minAnswers = 15 } = {}) {
  const byTense = new Map();
  const byVerb = new Map();
  let answers = 0;
  let accentErrors = 0;

  for (const [id, st] of Object.entries(stats)) {
    const [prefix, inf, tenseId] = id.split(':');
    if (prefix !== DRILL_PREFIX) continue;
    const seen = Number(st.seen) || 0;
    if (!seen) continue;
    const wrong = (Number(st.wrong) || 0) + (Number(st.accentWrong) || 0);
    answers += seen;
    accentErrors += Number(st.accentWrong) || 0;
    for (const [map, key] of [[byTense, tenseId], [byVerb, inf]]) {
      const acc = map.get(key) || { key, seen: 0, wrong: 0 };
      acc.seen += seen;
      acc.wrong += wrong;
      map.set(key, acc);
    }
  }

  if (answers < minAnswers) {
    return { ready: false, answers, needed: minAnswers - answers, tenses: [], verbs: [], accentShare: null };
  }

  const rank = (map) => [...map.values()]
    .map((a) => ({ ...a, errorRate: a.wrong / a.seen }))
    .sort((a, b) => b.errorRate - a.errorRate || b.seen - a.seen || a.key.localeCompare(b.key));

  return {
    ready: true,
    answers,
    needed: 0,
    tenses: rank(byTense),
    verbs: rank(byVerb),
    // How much of the trouble is purely written accents — a different fix
    // from not knowing the form.
    accentShare: answers ? accentErrors / answers : 0,
  };
}
