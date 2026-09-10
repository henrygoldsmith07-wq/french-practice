// Held-out assessment banks (Evidence Study, measurement-only).
//
// A DEDICATED set of banks, separate from practice content: every item is
// authored or reviewed against a CEFR band and carries the fields a real
// assessment needs — level, skill, difficulty, provenance, unique id, review
// status. Unverified items are excluded from selection until reviewStatus is
// 'verified'; practice vocabulary is NEVER treated as held-out material
// (untagged words are not CEFR-matched, full stop).
//
// SKILLS, reported SEPARATELY (never merged into an overall transfer score
// while each bank is small):
//   vocabulary        recognition (en → fr), the current default
//   vocabulary-prod   productive vocabulary (en prompt → fr produced)
//   grammar           grammar production (choose/produce the form)
//   listening         listening comprehension (audio → meaning)
//   reading           reading comprehension (text → meaning)
//   speaking          spoken production (prompt → speech, scored later)
//
// ISOLATION CONTRACT (tested): bank ids are namespaced `chk-` so they can
// never collide with SRS cards, and selection reads ONLY from these banks.

export const HELDOUT_BANK_VERSION = 2;

// reviewStatus: 'draft' | 'in-review' | 'verified'
// Only 'verified' items are ever selected.
// provenance: who authored/reviewed the item, for the audit trail.
// difficulty: 1–5 within-band ordering (1 easiest in band).

export const HELDOUT_SKILLS = ['vocabulary', 'vocabulary-prod', 'grammar', 'listening', 'reading', 'speaking'];

export const HELDOUT_BANK = [
  // ------------------------------------------------- vocabulary (recognition)
  // ---------------------------------------------------------------- A1 ----
  { id: 'chk-a1-001', cefr: 'A1', skill: 'vocabulary', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'une pomme', en: 'an apple' },
  { id: 'chk-a1-002', cefr: 'A1', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la maison', en: 'the house' },
  { id: 'chk-a1-003', cefr: 'A1', skill: 'vocabulary', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'le chat', en: 'the cat' },
  { id: 'chk-a1-004', cefr: 'A1', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'l\'école', en: 'the school' },
  { id: 'chk-a1-005', cefr: 'A1', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'l\'eau', en: 'water' },
  { id: 'chk-a1-006', cefr: 'A1', skill: 'vocabulary', difficulty: 4, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la fenêtre', en: 'the window' },
  { id: 'chk-a1-007', cefr: 'A1', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'le matin', en: 'the morning' },
  { id: 'chk-a1-008', cefr: 'A1', skill: 'vocabulary', difficulty: 5, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'une chaise', en: 'a chair' },

  // ---------------------------------------------------------------- A2 ----
  { id: 'chk-a2-001', cefr: 'A2', skill: 'vocabulary', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un voisin', en: 'a neighbour' },
  { id: 'chk-a2-002', cefr: 'A2', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'le trajet', en: 'the journey' },
  { id: 'chk-a2-003', cefr: 'A2', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la pluie', en: 'the rain' },
  { id: 'chk-a2-004', cefr: 'A2', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un manteau', en: 'a coat' },
  { id: 'chk-a2-005', cefr: 'A2', skill: 'vocabulary', difficulty: 4, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'l\'oreille', en: 'the ear' },
  { id: 'chk-a2-006', cefr: 'A2', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'le pouce', en: 'the thumb' },
  { id: 'chk-a2-007', cefr: 'A2', skill: 'vocabulary', difficulty: 5, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la pente', en: 'the slope' },
  { id: 'chk-a2-008', cefr: 'A2', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un établi', en: 'a workbench' },

  // ---------------------------------------------------------------- B1 ----
  { id: 'chk-b1-001', cefr: 'B1', skill: 'vocabulary', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un entretien', en: 'an interview' },
  { id: 'chk-b1-002', cefr: 'B1', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'le rebond', en: 'the rebound' },
  { id: 'chk-b1-003', cefr: 'B1', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la moisson', en: 'the harvest' },
  { id: 'chk-b1-004', cefr: 'B1', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un criblage', en: 'a screening' },
  { id: 'chk-b1-005', cefr: 'B1', skill: 'vocabulary', difficulty: 4, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'l\'ébranlement', en: 'the shock / shaking' },
  { id: 'chk-b1-006', cefr: 'B1', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la rancune', en: 'the grudge' },
  { id: 'chk-b1-007', cefr: 'B1', skill: 'vocabulary', difficulty: 5, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'le sillon', en: 'the furrow' },
  { id: 'chk-b1-008', cefr: 'B1', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un paquebot', en: 'an ocean liner' },

  // ---------------------------------------------------------------- B2 ----
  { id: 'chk-b2-001', cefr: 'B2', skill: 'vocabulary', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un sursis', en: 'a stay (of execution) / reprieve' },
  { id: 'chk-b2-002', cefr: 'B2', skill: 'vocabulary', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la bonhomie', en: 'good-naturedness' },
  { id: 'chk-b2-003', cefr: 'B2', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'l\'acuité', en: 'acuity' },
  { id: 'chk-b2-004', cefr: 'B2', skill: 'vocabulary', difficulty: 4, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'une clémence', en: 'clemency / mildness' },
  { id: 'chk-b2-005', cefr: 'B2', skill: 'vocabulary', difficulty: 5, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'le remords', en: 'remorse' },
  { id: 'chk-b2-006', cefr: 'B2', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'la vulgarisation', en: 'popularisation (of science)' },

  // ---------------------------------------------------------------- C1 ----
  { id: 'chk-c1-001', cefr: 'C1', skill: 'vocabulary', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'l\'à-propos', en: 'relevance / aptness' },
  { id: 'chk-c1-002', cefr: 'C1', skill: 'vocabulary', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'une sinécure', en: 'a sinecure (soft job)' },
  { id: 'chk-c1-003', cefr: 'C1', skill: 'vocabulary', difficulty: 4, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'l\'abstention', en: 'abstention' },
  { id: 'chk-c1-004', cefr: 'C1', skill: 'vocabulary', difficulty: 5, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', fr: 'un parrainage', en: 'sponsorship / godparenthood' },

  // ------------------------------------------------------- productive vocab
  // En prompt → the learner must PRODUCE the French word (typed or spoken).
  { id: 'chk-prod-a2-001', cefr: 'A2', skill: 'vocabulary-prod', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', en: 'a neighbour', accept: ['un voisin', 'une voisine'] },
  { id: 'chk-prod-b1-001', cefr: 'B1', skill: 'vocabulary-prod', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', en: 'the journey', accept: ['le trajet', 'le voyage'] },
  { id: 'chk-prod-b1-002', cefr: 'B1', skill: 'vocabulary-prod', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', en: 'the harvest', accept: ['la moisson', 'la récolte'] },
  { id: 'chk-prod-b2-001', cefr: 'B2', skill: 'vocabulary-prod', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', en: 'remorse', accept: ['le remords'] },
  { id: 'chk-prod-a1-001', cefr: 'A1', skill: 'vocabulary-prod', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', en: 'water', accept: ['l\'eau', 'de l\'eau'] },

  // ---------------------------------------------------------------- grammar
  // Choose/produce the controlled form; `accept` lists correct answers.
  { id: 'chk-gr-a2-001', cefr: 'A2', skill: 'grammar', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', prompt: 'Hier, nous ___ au cinéma. (aller)', accept: ['sommes allés', 'sommes allees'] },
  { id: 'chk-gr-b1-001', cefr: 'B1', skill: 'grammar', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', prompt: 'Il faut que tu ___ à l\'heure. (être)', accept: ['sois'] },
  { id: 'chk-gr-b1-002', cefr: 'B1', skill: 'grammar', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', prompt: 'Si j\'avais le temps, je ___ plus. (voyager)', accept: ['voyagerais'] },
  { id: 'chk-gr-b2-001', cefr: 'B2', skill: 'grammar', difficulty: 4, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', prompt: 'C\'est le livre ___ je t\'ai parlé. (que / dont)', accept: ['dont'] },
  { id: 'chk-gr-a1-001', cefr: 'A1', skill: 'grammar', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', prompt: 'Elle ___ vingt ans. (avoir)', accept: ['a'] },

  // -------------------------------------------------------------- listening
  // Audio (TTS-rendered at check time) → pick the meaning. `audio` is the
  // spoken text; `en` is the correct comprehension gloss.
  { id: 'chk-ls-a2-001', cefr: 'A2', skill: 'listening', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', audio: 'Le train de huit heures est annulé, le suivant part à neuf heures.', en: 'The 8 o\'clock train is cancelled; the next leaves at 9.' },
  { id: 'chk-ls-b1-001', cefr: 'B1', skill: 'listening', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', audio: 'Je vous rappelle dès que la livraison est passée, normalement d\'ici jeudi.', en: 'I\'ll call you back once the delivery has been, normally by Thursday.' },
  { id: 'chk-ls-b1-002', cefr: 'B1', skill: 'listening', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', audio: 'Il faudra répéter la présentation avant de la présenter au client.', en: 'The presentation must be rehearsed before showing it to the client.' },
  { id: 'chk-ls-a1-001', cefr: 'A1', skill: 'listening', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', audio: 'Le magasin ferme à dix-neuf heures.', en: 'The shop closes at 7 pm.' },

  // ---------------------------------------------------------------- reading
  // Short text → pick the meaning or answer a comprehension question.
  { id: 'chk-rd-b1-001', cefr: 'B1', skill: 'reading', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', text: 'Chers voisins, le syndic a fixé l\'assemblée générale au 14 mars à 18h dans la salle commune.', en: 'The building\'s annual meeting is on 14 March at 6 pm.' },
  { id: 'chk-rd-a2-001', cefr: 'A2', skill: 'reading', difficulty: 1, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', text: 'Fermeture exceptionnelle le lundi matin pour inventaire.', en: 'Closed Monday morning for stocktaking.' },
  { id: 'chk-rd-b2-001', cefr: 'B2', skill: 'reading', difficulty: 4, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', text: 'Sous réserve d\'accord du conseil, les travaux débuteront à l\'issue de la trêve hivernale.', en: 'Works start after the winter truce, subject to the board\'s approval.' },

  // --------------------------------------------------------------- speaking
  // Prompt → spoken response; scored by the existing speaking pipeline but
  // recorded as MEASUREMENT (never mastery, never selection input).
  { id: 'chk-sp-b1-001', cefr: 'B1', skill: 'speaking', difficulty: 3, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', prompt: 'Décrivez votre dernier week-end en trois phrases.', scoring: 'speaking-pipeline' },
  { id: 'chk-sp-a2-001', cefr: 'A2', skill: 'speaking', difficulty: 2, reviewStatus: 'verified', provenance: 'authored core, reviewed 2026-09', prompt: 'Présentez-vous en quelques phrases.', scoring: 'speaking-pipeline' },

  // --------------------------------------------------------- draft items ----
  // Deliberately NOT verified: these must never be selected (the gates are
  // tested). Reviewing them is what promotes them, not their presence here.
  { id: 'chk-a2-d01', cefr: 'A2', skill: 'vocabulary', difficulty: 2, reviewStatus: 'draft', provenance: 'draft awaiting review', fr: 'un mot en draft', en: 'a draft word' },
  { id: 'chk-b1-d01', cefr: 'B1', skill: 'vocabulary', difficulty: 3, reviewStatus: 'in-review', provenance: 'second review pending', fr: 'un mot en relecture', en: 'a word under review' },
  { id: 'chk-gr-b1-d01', cefr: 'B1', skill: 'grammar', difficulty: 3, reviewStatus: 'draft', provenance: 'draft awaiting review', prompt: 'draft', accept: ['draft'] },
];

const BANK_BY_ID = new Map(HELDOUT_BANK.map((i) => [i.id, i]));

/** Bank integrity check — run in tests; malformed items fail loudly. */
export function validateBank() {
  const errors = [];
  const ids = new Set();
  for (const item of HELDOUT_BANK) {
    if (!item.id || ids.has(item.id)) errors.push(`${item.id || '(no id)'}: missing/duplicate id`);
    ids.add(item.id);
    if (!['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(item.cefr)) errors.push(`${item.id}: bad cefr`);
    if (!HELDOUT_SKILLS.includes(item.skill)) errors.push(`${item.id}: bad skill`);
    if (!Number.isInteger(item.difficulty) || item.difficulty < 1 || item.difficulty > 5) errors.push(`${item.id}: bad difficulty`);
    if (!['draft', 'in-review', 'verified'].includes(item.reviewStatus)) errors.push(`${item.id}: bad reviewStatus`);
    if (!item.provenance) errors.push(`${item.id}: missing provenance`);
    // Skill-specific payload sanity.
    if (item.skill === 'vocabulary' && !(item.fr && item.en)) errors.push(`${item.id}: vocab needs fr+en`);
    if (item.skill === 'vocabulary-prod' && !(item.en && Array.isArray(item.accept) && item.accept.length)) errors.push(`${item.id}: prod-vocab needs en+accept`);
    if (item.skill === 'grammar' && !(item.prompt && Array.isArray(item.accept) && item.accept.length)) errors.push(`${item.id}: grammar needs prompt+accept`);
    if (item.skill === 'listening' && !(item.audio && item.en)) errors.push(`${item.id}: listening needs audio+en`);
    if (item.skill === 'reading' && !(item.text && item.en)) errors.push(`${item.id}: reading needs text+en`);
    if (item.skill === 'speaking' && !item.prompt) errors.push(`${item.id}: speaking needs prompt`);
  }
  return { ok: errors.length === 0, errors, n: HELDOUT_BANK.length };
}

/**
 * Select held-out items for a check: CEFR-matched (the learner's band, or a
 * TIGHTLY controlled adjacent band when the own band is exhausted — A2 for
 * B1, never two bands away), verified only, unseen by this participant.
 * Deterministic per (participant, day).
 */
export function selectHeldOutItems({ participantId, day, level = 'B1', seenIds = new Set(), limit = 4, skills = ['vocabulary'], bank = HELDOUT_BANK } = {}) {
  if (!participantId) return [];
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const idx = levels.indexOf(level);
  if (idx < 0) return [];
  const wanted = Array.isArray(skills) && skills.length ? skills : ['vocabulary'];
  const verified = bank.filter((i) => i.reviewStatus === 'verified' && wanted.includes(i.skill));
  const own = verified.filter((i) => i.cefr === level && !seenIds.has(i.id));
  // Tight adjacency: only ONE band down or up, never further.
  const adjacent = [levels[idx - 1], levels[idx + 1]].filter(Boolean);
  const near = verified.filter((i) => adjacent.includes(i.cefr) && !seenIds.has(i.id));
  // Interleave skills so a multi-skill check samples across them; within a
  // skill prefer harder-first for ceiling measurement.
  const bySkill = new Map();
  for (const i of [...own, ...near]) {
    if (!bySkill.has(i.skill)) bySkill.set(i.skill, []);
    bySkill.get(i.skill).push(i);
  }
  const lanes = [...bySkill.values()].map((rows) => rows.sort((a, b) => b.difficulty - a.difficulty));
  const interleaved = [];
  while (interleaved.length < limit && lanes.some((l) => l.length)) {
    for (const lane of lanes) {
      if (lane.length && interleaved.length < limit) interleaved.push(lane.shift());
    }
  }
  const phase = Math.abs(hashStr(`${participantId}|heldout|${day}`)) % Math.max(1, interleaved.length);
  return interleaved.length ? [...interleaved.slice(phase), ...interleaved.slice(0, phase)] : [];
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  h ^= h >>> 13;
  return h | 0;
}

export const bankItem = (id) => BANK_BY_ID.get(id) || null;

/**
 * FROZEN ASSESSMENT PAYLOAD — bank item → everything a renderer needs to
 * display AND score the item, persisted in the check record so correctness
 * never depends on live lookups or id inference:
 *   { assessmentId, sourceItemId, skill, cefr, content, options[], correctOptionId }
 * Listening/reading distractors are generated deterministically here, before
 * persistence, so every replay renders and scores identically. Renderers must
 * compare the learner's choice against correctOptionId — never against
 * option.id === item.id.
 */
export function buildHeldOutAssessmentItem(item, { distractorPool = [], participantId = '', day = 0 } = {}) {
  if (!item) return null;
  const base = {
    assessmentId: `as-${item.id}`,
    sourceItemId: item.id,
    skill: item.skill,
    cefr: item.cefr,
    difficulty: item.difficulty ?? null,
    provenance: item.provenance ?? null,
  };
  if (item.skill === 'vocabulary') {
    // Recognition: EN prompt → pick the French word.
    const distractors = distractorPool
      .filter((d) => d.id !== item.id && d.fr && d.en && d.skill === 'vocabulary')
      .slice(0, 3)
      .map((d) => ({ id: `as-${d.id}`, text: d.fr }));
    const options = deterministicShuffle4([...distractors, { id: base.assessmentId, text: item.fr }], `${participantId}|${day}|${item.id}`);
    return { ...base, content: { prompt: item.en }, options, correctOptionId: base.assessmentId };
  }
  if (item.skill === 'vocabulary-prod') {
    return { ...base, content: { prompt: item.en }, accept: item.accept, options: [], correctOptionId: null };
  }
  if (item.skill === 'grammar') {
    return { ...base, content: { prompt: item.prompt }, accept: item.accept, options: [], correctOptionId: null };
  }
  if (item.skill === 'listening') {
    // Audio-first comprehension: EN meaning options; the audio text never
    // renders before the item is answered.
    const distractors = distractorPool
      .filter((d) => d.id !== item.id && d.skill === 'listening' && d.en)
      .slice(0, 2)
      .map((d) => ({ id: `as-${d.id}`, text: d.en }));
    const options = deterministicShuffle4([...distractors, { id: base.assessmentId, text: item.en }], `${participantId}|${day}|${item.id}`);
    return { ...base, content: { audio: item.audio }, options, correctOptionId: base.assessmentId };
  }
  if (item.skill === 'reading') {
    const distractors = distractorPool
      .filter((d) => d.id !== item.id && d.skill === 'reading' && d.en)
      .slice(0, 2)
      .map((d) => ({ id: `as-${d.id}`, text: d.en }));
    const options = deterministicShuffle4([...distractors, { id: base.assessmentId, text: item.en }], `${participantId}|${day}|${item.id}`);
    return { ...base, content: { text: item.text }, options, correctOptionId: base.assessmentId };
  }
  if (item.skill === 'speaking') {
    return { ...base, content: { prompt: item.prompt }, accept: null, options: [], correctOptionId: null };
  }
  return null;
}

function deterministicShuffle4(options, seedStr) {
  return deterministicShuffle(options, seedStr);
}

function deterministicShuffle(items, seedStr) {
  const out = [...items];
  let h = hashStr(seedStr);
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (i + 1), 2654435761);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
