// Writing content: sentence-completion starters and free-writing / essay
// prompts. Starters target specific structures; prompts scale by length.
//
// Every item carries a `cefr` tag saying how hard it is. The tag is what
// lets the writing surface offer a prompt at the learner's own level instead
// of whatever the pool hands over first — and it is shown on the card, so a
// learner can see why they were given this one.
//
// The tags are our own judgement about the grammar each item asks for, using
// the same level spine as the rest of the app (lib/cefr.js):
//
//   A1  a single familiar structure, mostly present tense
//   A2  past tense and simple future, everyday subjects
//   B1  the subjunctive in its common triggers, connected narrative
//   B2  argument and opinion, subordinate clauses with contrast
//   C1  open essay, sustained argument about society
//
// A starter is tagged for the STRUCTURE it asks the learner to produce, not
// for the sentence itself: "Il faut que tu" is a B1 item because the answer
// has to be in the subjunctive.

// Personal error notebook: auto-log corrections with explanation rather than bare replacement
// Each idea: every correction is stored as { id, original, corrected, why, at } and surfaced as drills.
export function explainCorrection(original, corrected){
  if(!original || !corrected || original===corrected) return "No change needed.";
  return `“${original}” → “${corrected}” — corrected form is more natural/grammatical here. Try reusing “${corrected}” in your next turn.`;
}

export const COMPLETION_STARTERS = [
  { fr: "Si j'avais le temps,", en: 'If I had the time,', hint: 'conditionnel expected', cefr: 'B1' },
  { fr: 'Quand je suis arrivé(e),', en: 'When I arrived,', hint: 'past narration', cefr: 'A2' },
  { fr: 'Il faut que tu', en: 'You have to', hint: 'subjonctif expected', cefr: 'B1' },
  { fr: 'Ce que je préfère, c’est', en: 'What I prefer is', hint: 'noun or infinitive', cefr: 'B1' },
  { fr: "Avant d'aller au travail, je", en: 'Before going to work, I', hint: 'daily routine', cefr: 'A2' },
  { fr: 'Je ne pense pas que ce', en: "I don't think that this", hint: 'subjonctif expected', cefr: 'B1' },
  { fr: "L'année prochaine, nous", en: 'Next year, we', hint: 'futur expected', cefr: 'A2' },
  { fr: 'Bien que ce soit difficile,', en: 'Although it is difficult,', hint: 'contrast', cefr: 'B2' },
  { fr: "Ce week-end, j'ai envie de", en: 'This weekend, I feel like', hint: 'infinitive', cefr: 'A2' },
  { fr: 'Quand j’étais petit(e),', en: 'When I was little,', hint: 'imparfait expected', cefr: 'B1' },
];

// Personal error notebook: auto-log corrections with explanation rather than bare replacement
// Each idea: every correction is stored as { id, original, corrected, why, at } and surfaced as drills.

export const WRITING_PROMPTS = [
  { fr: 'Décrivez votre journée idéale, du matin au soir.', en: 'Describe your ideal day, morning to night.', cefr: 'A2' },
  { fr: 'Écrivez un court message pour annuler un dîner poliment.', en: 'Write a short message politely cancelling a dinner.', cefr: 'B1' },
  { fr: "Racontez un voyage qui ne s'est pas passé comme prévu.", en: "Tell of a trip that didn't go as planned.", cefr: 'B1' },
  { fr: 'Décrivez votre plat préféré à quelqu’un qui ne le connaît pas.', en: "Describe your favourite dish to someone who doesn't know it.", cefr: 'A2' },
  { fr: 'Écrivez une critique (positive ou négative) du dernier film que vous avez vu.', en: 'Write a review of the last film you watched.', cefr: 'B1' },
  { fr: 'Convainquez un ami de visiter votre ville.', en: 'Convince a friend to visit your town.', cefr: 'B2' },
];

// Personal error notebook: auto-log corrections with explanation rather than bare replacement
// Each idea: every correction is stored as { id, original, corrected, why, at } and surfaced as drills.

export const ESSAY_PROMPTS = [
  { fr: 'Les réseaux sociaux rapprochent-ils les gens ou les isolent-ils ?', en: 'Do social networks bring people together or isolate them?', cefr: 'B2' },
  { fr: 'Faut-il apprendre une langue étrangère dès l’école primaire ?', en: 'Should a foreign language be learned from primary school?', cefr: 'B2' },
  { fr: 'Le télétravail est-il un progrès pour tout le monde ?', en: 'Is remote work progress for everyone?', cefr: 'B2' },
  { fr: 'La cuisine d’un pays raconte-t-elle son histoire ?', en: "Does a country's cuisine tell its history?", cefr: 'C1' },
];

// Personal error notebook: auto-log corrections with explanation rather than bare replacement
// Each idea: every correction is stored as { id, original, corrected, why, at } and surfaced as drills.

// The level spine, in order. Kept as a local list rather than importing
// lib/cefr.js: this module is on the writing chunk's load path and the
// canonical file carries the whole grammar inventory, which writing does not
// need. The order is the app's, and the test pins it to lib/cefr.js so the
// two cannot drift apart silently.
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const levelRank = (level) => LEVEL_ORDER.indexOf(level);

/**
 * Pick an item at the learner's level.
 *
 * The learner's own level first. If the pool has nothing at that level, the
 * nearest level below is used (stretching is better than being asked for
 * something far out of reach), and failing that the nearest one above.
 *
 * There is always an item: an empty writing screen would be worse than a
 * prompt one band off, so the pool is never allowed to come up empty.
 *
 * @param {Array<{cefr?: string}>} items the pool
 * @param {string} [level] the learner's CEFR level
 * @param {object} [exclude] an item to leave out (the one on screen)
 * @returns {object|undefined} the chosen item
 */
export function pickForLevel(items, exclude, level) {
  const pool = items.filter((x) => x !== exclude);
  if (!pool.length) return undefined;
  const target = levelRank(level);
  const at = (rank) => pool.filter((x) => levelRank(x.cefr) === rank);
  const pick = (group) => group[Math.floor(Math.random() * group.length)];
  // The learner's own level first.
  const exact = at(target);
  if (exact.length) return pick(exact);
  // Then the nearest level below: stretching is better than being asked for
  // something far out of reach.
  for (let rank = target - 1; rank >= 0; rank -= 1) {
    const group = at(rank);
    if (group.length) return pick(group);
  }
  // Then the nearest level above — the only thing left to offer.
  for (let rank = target + 1; rank < LEVEL_ORDER.length; rank += 1) {
    const group = at(rank);
    if (group.length) return pick(group);
  }
  // No tagged item matched (an untagged pool): fall back to the plain pool.
  return pick(pool);
}
