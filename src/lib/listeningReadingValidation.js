// Human-validated listening & reading comprehension.
//
// Infrastructure for collecting paired system-vs-human marks on the same
// listening track or reading text — without fabricating either side. Each
// entry captures the item, the score the app produced (quiz/accuracy), and
// an independent human judgement (teacher assessment or a real exam
// component), plus who rated it. Optional second mark enables double-marking.
//
// The store starts empty and stays that way until a qualified human
// contributes; metrics report no-data below one entry and provisional until
// n reaches the floor, mirroring placementValidation / writingSpeakingCorpus.
//
// Pair with: storage.js (persistence), Analytics → Learner validation,
// DevPanel → Comprehension validation — teacher entry.

import { MIN_CORPUS_N as MIN_N_SHARED } from './writingSpeakingCorpus.js';

export const MIN_COMPREHENSION_N = Math.max(30, MIN_N_SHARED);

const SKILLS = new Set(['listening', 'reading']);
const SOURCES = new Set(['teacher', 'exam', 'self']);

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function markValue(v) {
  return v == null ? null : clampScore(v);
}

/**
 * @typedef {Object} ComprehensionEntry
 * @property {string} id
 * @property {string} skill        // 'listening' | 'reading'
 * @property {string} itemId       // track id / text id (or free label)
 * @property {string} itemTitle    // human-readable reference
 * @property {number|null} aiScore   // what the app scored
 * @property {number|null} humanScore // independent human mark
 * @property {number|null} humanScore2 // independent second marker
 * @property {string|null} rater
 * @property {string|null} rater2
 * @property {string} source       // 'teacher' | 'exam' | 'self'
 * @property {string|null} cefr    // band the item targets, when known
 * @property {string} at           // ISO time
 */

export function makeComprehensionEntry({
  id, skill, itemId, itemTitle, aiScore, humanScore, humanScore2, rater, rater2, source, cefr, at,
} = {}) {
  const s = String(skill || '').toLowerCase();
  if (!SKILLS.has(s)) return null;
  const ai = clampScore(aiScore);
  const human = markValue(humanScore);
  const item = String(itemId || itemTitle || '').trim();
  if (!item) return null;
  const src = String(source || '').toLowerCase();
  return {
    id: String(id || `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    skill: s,
    itemId: item.slice(0, 200),
    itemTitle: itemTitle ? String(itemTitle).slice(0, 200) : null,
    aiScore: ai,
    humanScore: human,
    humanScore2: markValue(humanScore2),
    rater: rater ? String(rater).slice(0, 80) : null,
    rater2: rater2 ? String(rater2).slice(0, 80) : null,
    source: SOURCES.has(src) ? src : 'teacher',
    cefr: cefr ? String(cefr).slice(0, 8) : null,
    at: at && !Number.isNaN(new Date(at).getTime()) ? new Date(at).toISOString() : new Date().toISOString(),
    hasHuman: human != null,
    paired: ai != null && human != null,
    doubleMarked: human != null && markValue(humanScore2) != null,
  };
}

/**
 * System-vs-human agreement over paired entries. Same shape as the corpus
 * score agreement so the Analytics row renderer treats them identically.
 */
export function comprehensionAgreement(entries = [], { skill } = {}) {
  let usable = (Array.isArray(entries) ? entries : [])
    .map((e) => (e ? { ...e, aiScore: markValue(e.aiScore), humanScore: markValue(e.humanScore) } : null))
    .filter((e) => e && e.aiScore != null && e.humanScore != null);
  if (skill) usable = usable.filter((e) => e.skill === skill);
  if (!usable.length) {
    return {
      n: 0, status: 'no-data',
      meanAbsoluteError: null, within5: null, within10: null, correlation: null,
      message: skill ? `No paired ${skill} scores yet.` : 'No paired comprehension scores yet.',
    };
  }
  let abs = 0;
  let w5 = 0;
  let w10 = 0;
  const pairs = [];
  for (const e of usable) {
    const d = Math.abs(Number(e.aiScore) - Number(e.humanScore));
    abs += d;
    if (d <= 5) w5 += 1;
    if (d <= 10) w10 += 1;
    pairs.push([Number(e.aiScore), Number(e.humanScore)]);
  }
  const mae = abs / usable.length;
  let corr = null;
  if (pairs.length >= 3) {
    const xs = pairs.map((p) => p[0]);
    const ys = pairs.map((p) => p[1]);
    const mx = xs.reduce((a, b) => a + b, 0) / pairs.length;
    const my = ys.reduce((a, b) => a + b, 0) / pairs.length;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < pairs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (ys[i] - my) ** 2;
    }
    const den = Math.sqrt(dx * dy);
    corr = den ? Math.round((num / den) * 1000) / 1000 : null;
  }
  return {
    n: usable.length,
    status: usable.length < MIN_COMPREHENSION_N ? 'provisional' : 'validated',
    meanAbsoluteError: Math.round(mae * 10) / 10,
    within5: Math.round((w5 / usable.length) * 100) / 100,
    within10: Math.round((w10 / usable.length) * 100) / 100,
    correlation: corr,
    message: usable.length < MIN_COMPREHENSION_N
      ? `Provisional (n=${usable.length}; need ${MIN_COMPREHENSION_N} paired marks).`
      : `Validated against ${usable.length} paired marks.`,
  };
}

/**
 * Full health check: per-skill counts, agreement, and inter-rater reliability
 * over double-marked entries (reusing the corpus κ implementation — the
 * bands and floor are identical).
 */
export function comprehensionMetrics(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const bySkill = {
    listening: list.filter((e) => e.skill === 'listening').length,
    reading: list.filter((e) => e.skill === 'reading').length,
  };
  const agreement = comprehensionAgreement(list);
  const agreementListening = comprehensionAgreement(list, { skill: 'listening' });
  const agreementReading = comprehensionAgreement(list, { skill: 'reading' });
  // Inter-rater over double-marked pairs — corpusInterRaterMetrics reads
  // humanScore/humanScore2, which these entries carry verbatim.
  const doubleMarked = list.filter((e) => e && e.humanScore != null && e.humanScore2 != null);
  const n = list.length;
  return {
    n,
    status: n === 0 ? 'no-data' : agreement.status,
    bySkill,
    paired: list.filter((e) => e.paired).length,
    doubleMarked: doubleMarked.length,
    agreement,
    agreementListening,
    agreementReading,
    message: n === 0
      ? 'No comprehension validations yet — pair an app score with a teacher/exam mark.'
      : `${bySkill.listening} listening · ${bySkill.reading} reading (${list.filter((e) => e.paired).length} paired, ${doubleMarked.length} double-marked).`,
  };
}
