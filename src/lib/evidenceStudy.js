// Evidence Study — a longitudinal, two-arm study over the adaptive Today
// loop. Assignment is already deterministic per sync id (lib/assignment.js);
// this module turns that into a real study protocol:
//
//   Assign → Practise → Retest → Transfer → Compare → Calibrate → Improve
//
// On enrolment the learner gets an anonymous participant id, a frozen
// starting CEFR estimate, a locked arm (never revealed in the UI), and a
// deterministic per-participant schedule of held-out transfer checks.
//
// PROTOCOL INTEGRITY: methodology constants live in studyProtocol.js (frozen,
// versioned). This module imports them — the numbers here are references to
// the protocol, not independent definitions.
//
// PRIVACY / LOCAL-FIRST: everything lives in localStorage under fp.studyKeys
// below. Nothing leaves the device except through the existing opt-in
// validation-bundle export (now v2), which carries only the anonymised
// participant id, the CEFR band, and outcome rows — never transcripts, names
// or raw conversation content.

import { PROTOCOL_VERSION, PROTOCOL } from './studyProtocol.js';

export const STUDY_ENGINE_VERSION = 1;
export { PROTOCOL_VERSION } from './studyProtocol.js';

// ── schedule knobs ──────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH: these are DERIVED from the frozen protocol
// (studyProtocol.js) — no methodology number is defined here. The legacy
// names stay exported for compatibility, but they are protocol views, not
// independent constants: change the protocol, and every one of them moves.

export const CHECK_EVERY_DAYS = PROTOCOL.duration.checkEveryDays;      // a held-out check every Nth study day
export const FIRST_CHECK_DAY = PROTOCOL.duration.firstCheckDay;        // skip the warm-up days
export const MIN_MINUTES = PROTOCOL.duration.minSessionMinutes;        // sessions below this don't freeze records

// Delayed-recall windows (days). Only outcomes from the graph's DELAYED
// evidence classes can ever fall in them; immediate retries never qualify.
// Shapes: protocol uses minDays/maxDays; runtime legacy keys are min/max.
export const SHORT_DELAY_DAYS = { min: PROTOCOL.delayedWindows.short.minDays, max: PROTOCOL.delayedWindows.short.maxDays };
export const LONG_DELAY_DAYS = { min: PROTOCOL.delayedWindows.long.minDays, max: PROTOCOL.delayedWindows.long.maxDays };

// ── aggregate reporting gates (mirroring the app's honesty rules) ──────────
export const MIN_N_PER_ARM = PROTOCOL.minSamples.participantsPerArm;   // participants before an arm compares
export const MIN_TRANSFER_N = PROTOCOL.minSamples.scoredParticipantsPerMetric; // scored participants before a metric prints

const ARMS = ['adaptive', 'balanced'];
const STUDY_WEEKS_DEFAULT = PROTOCOL.duration.defaultWeeks;

function hash01(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761);
  h ^= h >>> 13;
  h = Math.imul(h, 1597334677);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function randomId(prefix) {
  const buf = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of buf) s += b.toString(16).padStart(2, '0');
  return `${prefix}-${s}`;
}

// ── enrolment ──────────────────────────────────────────────────────────────

/**
 * Enrol the current installation. Pure except for the injected id/now.
 * Active and WITHDRAWN states are returned unchanged — a double-tap can
 * never fork a participant, and a withdrawal cannot be silently undone.
 * Rejoining after withdrawal is explicit: clear the record, then enrol.
 */
export function enrolStudy(prev, { syncId = '', startLevel = null, startTheta = null, weeks = STUDY_WEEKS_DEFAULT, seed = null, baseline = null, now = Date.now() } = {}) {
  if (prev?.status === 'active' || prev?.status === 'withdrawn') return prev;
  const pid = seed ? `${seed}` : randomId('participant');
  const band = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(startLevel) ? startLevel : null;
  const assignment = assignArm(pid, syncId);
  return {
    schemaVersion: 1,
    engineVersion: STUDY_ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    participantId: pid,
    arm: assignment.arm,             // LOCKED; the dashboard never prints it
    armSource: assignment.source,    // 'saved-override' | 'sync-id-hash'
    enrolledAt: new Date(now).toISOString(),
    startLevel: band,
    startTheta: Number.isFinite(Number(startTheta)) ? Number(startTheta) : null,
    weeks: Math.max(4, Math.min(26, Math.round(weeks))),
    // BASELINE (study-start state, for change-from-baseline reporting):
    // whatever the caller measured at enrolment — retention proxy, speaking
    // average, transfer probe score, proficiency. Nulls mean "not measured",
    // never zero.
    baseline: cleanBaseline(baseline),
    status: 'active',
  };
}

/** Baseline shape: numeric-or-null on every key, stamped when captured. */
export function cleanBaseline(baseline, now = Date.now()) {
  const b = baseline && typeof baseline === 'object' ? baseline : {};
  const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    capturedAt: b.capturedAt || new Date(now).toISOString(),
    delayedShortRecall: num(b.delayedShortRecall),   // % correct on recent 1–3d retests
    transferScore: num(b.transferScore),             // held-out probe score 0–100
    speakingAverage: num(b.speakingAverage),         // session-report overall avg
    recurrenceRate: num(b.recurrenceRate),           // % recurring after delayed success
    proficiency: num(b.proficiency),                 // proficiency score if present
  };
}

/**
 * Change-from-baseline: per-participant, per-metric deltas (post − baseline).
 * DESCRIPTIVE ONLY — raw post-study percentages alone never claim causal
 * superiority, and neither do these deltas; they exist so a researcher can
 * see movement within arms before any cross-arm comparison.
 */
export function changeFromBaseline(summaries, { studiesById = {} } = {}) {
  return summaries.map((s) => {
    const study = studiesById[s.participantId] || null;
    const b = study?.baseline || null;
    const delta = (post, pre) => (post == null || pre == null ? null : Math.round((post - pre) * 1000) / 1000);
    return {
      participantId: s.participantId,
      arm: s.arm,
      baseline: b,
      delta: {
        delayedShort: delta(s.delayedShort.rate, b?.delayedShortRecall != null ? b.delayedShortRecall / 100 : null),
        transfer: delta(s.transfer.mean, b?.transferScore),
        speaking: delta(s.speakingAverage ?? null, b?.speakingAverage),
        recurrence: delta(s.recurrence.rate, b?.recurrenceRate != null ? b.recurrenceRate / 100 : null),
      },
    };
  });
}

/** Deterministic arm from participant id (override wins — study operators only). */
export function assignArm(participantId, syncId = '') {
  const saved = readArmOverride();
  if (saved) return { arm: saved, source: 'saved-override' };
  const h = hash01(`${participantId}|${syncId}`);
  return { arm: ARMS[Math.floor(h * ARMS.length) % ARMS.length], source: 'sync-id-hash' };
}

// Operator override plumbing (injected by storage.js; set here so the pure
// lib owns the protocol while storage owns persistence).
let _readArmOverride = () => null;
export function setArmOverrideReader(fn) { _readArmOverride = typeof fn === 'function' ? fn : () => null; }
function readArmOverride() {
  try { return _readArmOverride(); } catch { return null; }
}

/** Withdraw: keeps the record (research value) but stops collection. */
export function withdrawStudy(state, { now = Date.now() } = {}) {
  if (!state || state.status !== 'active') return state || null;
  const lastActivityAt = state.lastActivityAt || state.enrolledAt || null;
  return { ...state, status: 'withdrawn', withdrawnAt: new Date(now).toISOString(), lastActivityAt };
}

export function isEnrolled(state) { return state?.status === 'active'; }

/** Days since enrolment (the "Study day N" headline). */
export function studyDay(state, now = Date.now()) {
  if (!state?.enrolledAt) return null;
  const t = Date.parse(state.enrolledAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

// ── held-out checks: per-participant deterministic schedule ────────────────

/**
 * Is a held-out check scheduled for this study day? Deterministic from the
 * participant id so the schedule survives reload and can be audited.
 */
export function isCheckDay(participantId, day, { first = FIRST_CHECK_DAY, every = CHECK_EVERY_DAYS } = {}) {
  if (!participantId || !Number.isFinite(day) || day < first) return false;
  const h = hash01(`${participantId}|day-phase`);
  return (day + Math.floor(h * every)) % every === 0;
}

/**
 * The held-out pool for a check day: CEFR-matched material the learner has
 * NOT met yet. Vocabulary: unbanded words (word cards) whose ids are absent
 * from the SRS map; listening: tracks at the level never played. Selection
 * is deterministic per (participant, day) so reloads cannot reshuffle.
 */
/**
 * The held-out pool for a check day, built ONLY from the dedicated verified
 * assessment bank (heldOutBank.js) — never from practice vocabulary. Every
 * returned item is CEFR-matched (own band or tightly adjacent), verified,
 * unseen by this participant, and carries level/skill/difficulty/provenance.
 * Unverified bank items and untagged practice words are excluded by design.
 * Deterministic per (participant, day) so reloads cannot reshuffle.
 */
/**
 * The held-out pool for a check day, built ONLY from the dedicated verified
 * assessment bank (heldOutBank.js) — never from practice content. The check
 * day administers ONE protocol-scheduled skill (deterministic rotation over
 * PROTOCOL.transfer.skillSchedule), so each skill is assessed with its own
 * runner and never merged into a generic score. Every returned item is
 * CEFR-matched (own band or tightly adjacent), verified, unseen by this
 * participant, and carries level/skill/difficulty/provenance.
 * Deterministic per (participant, day) so reloads cannot reshuffle.
 */
export function buildHeldOutPool({ participantId, day, level = 'B1', vocabEntries = [], srsMap = {}, listeningTracks = [], limit = PROTOCOL.heldOut.itemsPerCheck, skills = null, seenIds = new Set() } = {}) {
  void vocabEntries; void srsMap; void listeningTracks; // practice content is never held-out material
  if (!participantId) return { words: [], track: null, skills: [] };
  const { selectHeldOutItems, buildHeldOutAssessmentItem, HELDOUT_BANK } = requireBank();
  // Protocol skill schedule: the check day's single skill (rotation index by
  // check ordinal, not calendar day, so every scheduled skill gets assessed).
  const schedule = PROTOCOL.transfer.skillSchedule;
  const checkOrdinal = Math.floor((day - FIRST_CHECK_DAY) / CHECK_EVERY_DAYS);
  const scheduledSkill = schedule[((checkOrdinal % schedule.length) + schedule.length) % schedule.length];
  const wanted = skills || [scheduledSkill];
  const words = selectHeldOutItems({ participantId, day, level, limit, skills: wanted, seenIds });
  // FROZEN ASSESSMENT PAYLOADS: each bank item becomes a complete, persisted
  // assessment item — content, option ids/text, explicit correctOptionId —
  // generated deterministically before storage. Renderers never infer
  // correctness from option ids.
  const distractorPool = HELDOUT_BANK.filter((i) => i.reviewStatus === 'verified' && wanted.includes(i.skill));
  const items = words
    .map((w) => buildHeldOutAssessmentItem(w, { distractorPool, participantId, day }))
    .filter(Boolean);
  return {
    words: items,
    track: null,
    skills: [...new Set(items.map((w) => w.skill))],
    scheduledSkill,
  };
}

function requireBank() {
  // eslint-disable-next-line import/no-cycle
  return { selectHeldOutItems: __selectHeldOutItems, buildHeldOutAssessmentItem: __buildHeldOutAssessmentItem, HELDOUT_BANK: __HELDOUT_BANK };
}
import { selectHeldOutItems as __selectHeldOutItems, buildHeldOutAssessmentItem as __buildHeldOutAssessmentItem, HELDOUT_BANK as __HELDOUT_BANK } from './heldOutBank.js';

/**
 * A check record, frozen the moment the check renders. Mastery/FSRS state
 * must NEVER be updated from these items — they are measurement-only.
 */
export function makeCheckRecord({ participantId, day, level = 'B1', pool = { words: [], track: null }, now = Date.now() } = {}) {
  return {
    id: `chk-${participantId}-${day}`,
    participantId,
    day,
    level,
    at: new Date(now).toISOString(),
    wordIds: (pool.words || []).map((w) => w.sourceItemId ?? w.id),
    // FROZEN ASSESSMENT PAYLOADS: complete render+score data per item
    // (content, options with ids/text, explicit correctOptionId, skill,
    // cefr, sourceItemId) — persisted so replays and scoring never depend
    // on live lookups or id inference.
    items: (pool.words || []).map((w) => ({
      assessmentId: w.assessmentId ?? `as-${w.id}`,
      sourceItemId: w.sourceItemId ?? w.id,
      skill: w.skill,
      cefr: w.cefr ?? null,
      content: w.content ?? null,
      options: w.options ?? [],
      correctOptionId: w.correctOptionId ?? null,
      accept: w.accept ?? null,
    })),
    // Per-skill accounting: which banks were sampled, so results can be
    // reported per skill (vocabulary / vocabulary-prod / grammar / listening
    // / reading / speaking) and never merged into an overall score.
    skills: pool.skills || [...new Set((pool.words || []).map((w) => w.skill).filter(Boolean))],
    scheduledSkill: pool.scheduledSkill || null, // the protocol-scheduled skill for this check day
    trackId: pool.track?.id || null,
    results: null,          // filled by recordCheckResult
    engineVersion: STUDY_ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  };
}

/**
 * Fold a finished check into its record. Pure. `perItem` is the
 * modality-specific evidence backbone: every item ends as exactly one of
 * scored / unscored / unavailable — never a silent coercion between them.
 */
export function recordCheckResult(check, { correct = 0, total = 0, quizScore = null, secondsSpent = null, perItem = null, now = Date.now() } = {}) {
  if (!check) return null;
  return {
    ...check,
    results: {
      correct: Math.max(0, Math.round(Number(correct) || 0)),
      total: Math.max(0, Math.round(Number(total) || 0)),
      quizScore: quizScore != null && Number.isFinite(Number(quizScore)) ? Math.max(0, Math.min(100, Math.round(Number(quizScore)))) : null,
      secondsSpent: secondsSpent != null && Number.isFinite(Number(secondsSpent)) ? Math.max(0, Math.round(Number(secondsSpent))) : null,
      perItem: Array.isArray(perItem) ? perItem.map((p) => sanitizePerItemEntry(p, now)) : [],
      at: new Date(now).toISOString(),
    },
  };
}

export const checkScore = (check) => {
  const r = check?.results;
  if (!r || !r.total) return null;
  return Math.round((r.correct / r.total) * 100);
};

// ── per-item evidence schema (modality-specific, validated not coerced) ───

export const EVIDENCE_STATUSES = ['scored', 'unscored', 'unavailable'];
export const ASR_CONFIDENCE_LEVELS = ['usable', 'low', 'none'];
export const LEARNER_CONFIDENCE_LEVELS = ['managed', 'unsure', 'could-not'];
// Skills whose evidence is correctness-shaped; speaking is score-shaped.
export const CORRECTNESS_SKILLS = ['vocabulary', 'vocabulary-prod', 'grammar', 'listening', 'reading'];

/** Clean one per-item entry: known fields only, null-preserving (never
 *  invents 0 for missing numbers), reasons clamped, no coercion of status. */
export function sanitizePerItemEntry(entry, now = Date.now()) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const numOrNull = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    sourceItemId: typeof e.sourceItemId === 'string' && e.sourceItemId ? e.sourceItemId : null,
    skill: PROTOCOL.transfer.reportedPerSkill.includes(e.skill) ? e.skill : null,
    cefr: e.cefr != null && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(e.cefr) ? e.cefr : null,
    status: EVIDENCE_STATUSES.includes(e.status) ? e.status : 'unavailable',
    correct: typeof e.correct === 'boolean' ? e.correct : null,
    aiScore: e.aiScore != null && Number.isFinite(Number(e.aiScore)) ? Math.max(0, Math.min(100, Math.round(Number(e.aiScore)))) : null,
    asrConfidence: ASR_CONFIDENCE_LEVELS.includes(e.asrConfidence) ? e.asrConfidence : null,
    confidence: LEARNER_CONFIDENCE_LEVELS.includes(e.confidence) ? e.confidence : null,
    reason: typeof e.reason === 'string' ? e.reason.slice(0, 240) : null,
    matchedAccept: typeof e.matchedAccept === 'string' ? e.matchedAccept.slice(0, 120) : null,
    at: typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)) ? e.at : new Date(now).toISOString(),
  };
}

/** Validate ONE per-item entry. Returns null when valid, a reason string
 *  when the record must be rejected — never coerced into validity. */
export function validatePerItemEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'entry is not an object';
  if (typeof e.sourceItemId !== 'string' || !e.sourceItemId) return 'missing sourceItemId';
  if (!PROTOCOL.transfer.reportedPerSkill.includes(e.skill)) return `unknown skill '${e.skill}'`;
  if (!EVIDENCE_STATUSES.includes(e.status)) return `impossible status '${e.status}'`;
  if (e.aiScore != null && (typeof e.aiScore !== 'number' || e.aiScore < 0 || e.aiScore > 100)) return 'aiScore outside 0-100';
  if (e.correct != null && typeof e.correct !== 'boolean') return 'correct must be boolean or null';
  if (e.asrConfidence != null && !ASR_CONFIDENCE_LEVELS.includes(e.asrConfidence)) return 'malformed ASR confidence';
  if (e.confidence != null && !LEARNER_CONFIDENCE_LEVELS.includes(e.confidence)) return 'unknown learner confidence';
  // Contradiction checks: unscored/unavailable may not carry an objective
  // result; correctness skills may not carry a speaking score.
  if (e.status === 'unscored' && (e.correct != null || e.aiScore != null)) return 'unscored carries an objective result';
  if (e.status === 'unavailable' && (e.correct != null || e.aiScore != null)) return 'unavailable carries an objective result';
  if (e.skill === 'speaking' && e.status === 'scored') {
    if (typeof e.aiScore !== 'number') return 'speaking scored without numeric aiScore';
    if (e.correct != null) return 'speaking must not claim boolean correctness';
  }
  if (CORRECTNESS_SKILLS.includes(e.skill) && e.aiScore != null) return 'correctness item carries aiScore';
  // An unavailable item must say why (infrastructure honesty).
  if (e.status === 'unavailable' && !e.reason) return 'unavailable without reason';
  return null;
}

/** Summarize a check's per-item evidence for per-skill transfer. Returns
 *  {score|null, scoredN, unscoredN, unavailableN} — never invents a score
 *  from unscored/unavailable rows. */
export function checkSkillSummary(check) {
  const perItem = Array.isArray(check?.results?.perItem) ? check.results.perItem : [];
  if (!perItem.length) return { score: null, scoredN: 0, unscoredN: 0, unavailableN: 0, skill: check?.scheduledSkill || null };
  const skill = perItem[0].skill;
  const scored = perItem.filter((p) => p.status === 'scored');
  if (skill === 'speaking') {
    const nums = scored.map((p) => p.aiScore).filter((v) => typeof v === 'number');
    return {
      score: nums.length ? Math.round(nums.reduce((a, v) => a + v, 0) / nums.length) : null,
      scoredN: nums.length,
      unscoredN: perItem.filter((p) => p.status === 'unscored').length,
      unavailableN: perItem.filter((p) => p.status === 'unavailable').length,
      skill,
    };
  }
  // Correctness domains: only objectively-scored items count.
  const meaningful = scored.filter((p) => typeof p.correct === 'boolean');
  return {
    score: meaningful.length ? Math.round((meaningful.filter((p) => p.correct).length / meaningful.length) * 100) : null,
    scoredN: meaningful.length,
    unscoredN: perItem.filter((p) => p.status === 'unscored').length,
    unavailableN: perItem.filter((p) => p.status === 'unavailable').length,
    skill,
  };
}

// ── outcome records: one per targeted selection trial ──────────────────────

/**
 * Freeze an outcome skeleton from a selection trial + capability context.
 * Called by Today at selection time; outcomes fill in as retests land.
 */
export function makeOutcomeRecord({ trial, graphNode = null, now = Date.now() } = {}) {
  return {
    id: `out-${trial?.at || new Date(now).toISOString()}-${trial?.selectedId || 'none'}`,
    participantRef: true,          // joined to the participant via the trial's variant
    day: null,                     // filled by the caller (study day)
    at: trial?.at || new Date(now).toISOString(),
    activity: trial?.activity || null,
    variant: trial?.variant || null,
    selectedId: trial?.selectedId || null,
    concept: trial?.selectedConcept || graphNode?.concept || null,
    type: graphNode?.type || null,
    masteryBefore: trial?.masteryBefore ?? null,
    immediate: null,               // same-session; NEVER retention evidence
    delayedShort: null,            // 1–3d recall { correct, at, delayDays }
    delayedLong: null,             // 7d+ recall  { correct, at, delayDays }
    transfer: null,                // held-out check performance at/after this point
    recurred: null,                // fresh occurrence after a delayed success
    hintsUsed: null,
    timeSpent: trial?.timeSpent ?? null,
    completed: trial?.completed ?? null,
  };
}

/**
 * Score a delayed retest into the outcome record's windows. Three honest
 * rules: (1) explicitly immediate retests — or ones the graph classed as
 * REHEARSAL — go to `immediate` and never to a retention window; (2) retests
 * inside the first 24h that nobody flagged immediate are IGNORED (too soon
 * to be retention, not declared rehearsal); (3) only retests at or beyond
 * SHORT_DELAY_DAYS.min count as retention evidence.
 */
export function applyRetestToOutcome(outcome, retest, { trialAt = null } = {}) {
  if (!outcome || !retest) return outcome;
  const base = Date.parse(trialAt || outcome.at);
  const at = Date.parse(retest.at);
  if (!Number.isFinite(base) || !Number.isFinite(at)) return outcome;
  const delayDays = (at - base) / 86400000;
  if (retest.immediate === true || retest.evidenceClass === 'REHEARSAL') {
    if (outcome.immediate == null) outcome.immediate = { correct: Boolean(retest.correct), at: retest.at, delayDays };
    return outcome;
  }
  if (delayDays < SHORT_DELAY_DAYS.min) return outcome; // too soon; not evidence
  const entry = { correct: Boolean(retest.correct), at: retest.at, delayDays: Math.round(delayDays * 100) / 100, context: retest.context || null };
  if (delayDays >= SHORT_DELAY_DAYS.min && delayDays <= SHORT_DELAY_DAYS.max) {
    if (outcome.delayedShort == null) outcome.delayedShort = entry;
  }
  if (LONG_DELAY_DAYS.min != null && delayDays >= LONG_DELAY_DAYS.min) {
    if (outcome.delayedLong == null) outcome.delayedLong = entry;
  }
  return outcome;
}

/** Mark recurrence (fresh mistake occurrence after a delayed success). */
export function applyRecurrenceToOutcome(outcome, { recurred = false } = {}) {
  if (!outcome) return outcome;
  outcome.recurred = Boolean(recurred);
  return outcome;
}

// ── aggregates: sample-gated, never significant-sounding ───────────────────

function rowsFor(outcomes, variant) {
  return (outcomes || []).filter((o) => o.variant === variant);
}

// A per-row rate prints only when the ARM itself is big enough (MIN_N_PER_ARM)
// AND the sub-metric's own floor is met. Sub-arm floors can be lower
// (MIN_TRANSFER_N for transfer) but never bypass the arm gate.
function gatedRate(rows, pick, floor) {
  if (rows.length < MIN_N_PER_ARM) return { rate: null, n: 0 };
  const withM = rows.map(pick).filter((v) => v != null);
  if (withM.length < floor) return { rate: null, n: withM.length };
  if (typeof withM[0] === 'boolean') {
    return { rate: withM.filter(Boolean).length / withM.length, n: withM.length };
  }
  return { rate: withM.reduce((a, v) => a + v, 0) / withM.length, n: withM.length };
}

function delayedRate(rows, key) {
  return gatedRate(rows, (o) => (o[key] && typeof o[key].correct === 'boolean' ? o[key].correct : null), MIN_N_PER_ARM);
}

function transferRate(rows) {
  return gatedRate(rows, (o) => (o.transfer && typeof o.transfer.score === 'number' ? o.transfer.score / 100 : null), MIN_TRANSFER_N);
}

function recurrenceRate(rows) {
  return gatedRate(rows, (o) => (typeof o.recurred === 'boolean' ? o.recurred : null), MIN_N_PER_ARM);
}

/**
 * ROW-LEVEL aggregate (convenience for the single-participant dashboard).
 * Research comparisons must use participantSummaries + armComparison instead:
 * this function treats each row as an observation of ONE participant, which
 * is exactly right for the local panel and exactly wrong for arm comparisons.
 */
export function studyAggregates(outcomes, { now = Date.now() } = {}) {
  void now;
  const adaptive = rowsFor(outcomes, 'adaptive');
  const balanced = rowsFor(outcomes, 'balanced');
  const arm = (rows) => ({
    n: rows.length, // ROWS, not participants — do not use for arm gates
    delayedShort: delayedRate(rows, 'delayedShort'),
    delayedLong: delayedRate(rows, 'delayedLong'),
    transfer: transferRate(rows),
    recurrence: recurrenceRate(rows),
    completedRate: gatedRate(rows, (o) => (typeof o.completed === 'boolean' ? o.completed : null), MIN_N_PER_ARM),
  });
  const a = arm(adaptive);
  const b = arm(balanced);
  const comparable = a.delayedShort.rate != null && b.delayedShort.rate != null;
  return {
    adaptive: a,
    balanced: b,
    comparison: {
      comparable,
      message: comparable
        ? 'Rates below are descriptive only, not significance claims.'
        : `Comparing arms needs at least ${MIN_N_PER_ARM} scored delayed outcomes per arm (adaptive ${a.delayedShort.n}, balanced ${b.delayedShort.n}).`,
    },
  };
}

// ── analysis inclusion: every row gets ONE explicit classification ─────────

export const ANALYSIS_CLASSIFICATIONS = {
  included: 'included',
  excludedTreatmentMismatch: 'excluded-treatment-mismatch',
  excludedMissingParticipant: 'excluded-missing-participant',
  excludedInvalidProtocol: 'excluded-invalid-protocol',
  excludedInvalidRow: 'excluded-invalid-row',
  excludedAsrUncertain: 'excluded-asr-uncertain',
  excludedWrongArmLabel: 'excluded-wrong-arm-label',
};

/**
 * Pre-registered inclusion logic (protocol.analysis/exclusions) applied
 * row-by-row. Arm comparisons consume ONLY 'included' rows; contaminated
 * records are flagged with a reason — never repaired or relabelled.
 *
 * Classifications (mutually exclusive, first failure wins):
 *   excluded-invalid-row            not an object / no id / no variant label
 *   excluded-missing-participant    no participant id on the row
 *   excluded-invalid-protocol       protocol version missing, unknown or future
 *   excluded-treatment-mismatch     treatmentConsistency.ok === false
 *   excluded-wrong-arm-label        variant label disagrees with the participant's arm
 *   excluded-asr-uncertain          recognition, not language, likely failed
 *   included                        eligible for arm comparison
 */
export function classifyOutcomeForAnalysis(row, { studiesById = {}, currentProtocolVersion = PROTOCOL_VERSION } = {}) {
  const C = ANALYSIS_CLASSIFICATIONS;
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id) {
    return { classification: C.excludedInvalidRow, reason: 'row missing or has no id' };
  }
  if (row.variant !== 'adaptive' && row.variant !== 'balanced') {
    return { classification: C.excludedInvalidRow, reason: `invalid variant label '${row.variant}'` };
  }
  const pid = typeof row.participantId === 'string' && row.participantId ? row.participantId : null;
  if (!pid) return { classification: C.excludedMissingParticipant, reason: 'no participant id' };
  const study = studiesById[pid] || null;
  if (!study || !Number.isInteger(study.protocolVersion)) {
    return { classification: C.excludedInvalidProtocol, reason: 'participant record has no protocol version' };
  }
  if (study.protocolVersion > currentProtocolVersion) {
    return { classification: C.excludedInvalidProtocol, reason: `protocol v${study.protocolVersion} newer than analysis build (v${currentProtocolVersion})` };
  }
  if (row.treatmentConsistency && row.treatmentConsistency.ok === false) {
    return { classification: C.excludedTreatmentMismatch, reason: row.treatmentConsistency.reason || 'delivered treatment disagrees with study arm' };
  }
  if (row.variant !== study.arm) {
    return { classification: C.excludedWrongArmLabel, reason: `row variant '${row.variant}' vs participant arm '${study.arm}'` };
  }
  if (row.asrUncertain === true) {
    return { classification: C.excludedAsrUncertain, reason: 'ASR uncertainty: recognition, not language, likely failed' };
  }
  return { classification: C.included, reason: null };
}

/** Classify a whole outcome set; returns included rows + per-class counts. */
export function classifyOutcomesForAnalysis(outcomes, opts = {}) {
  const included = [];
  const counts = {};
  const details = [];
  for (const row of Array.isArray(outcomes) ? outcomes : []) {
    const v = classifyOutcomeForAnalysis(row, opts);
    counts[v.classification] = (counts[v.classification] || 0) + 1;
    if (v.classification !== ANALYSIS_CLASSIFICATIONS.included) {
      details.push({ id: row?.id ?? null, classification: v.classification, reason: v.reason });
    } else {
      included.push(row);
    }
  }
  return { included, counts, details, total: Array.isArray(outcomes) ? outcomes.length : 0 };
}

/**
 * PARTICIPANT-LEVEL ANALYSIS — the unit of the experiment is the
 * participant, never the session row.
 *
 *   raw outcome rows → group by participantId → participant summary → arm comparison
 *
 * Repeated sessions improve a participant's own estimate (weighted means by
 * scored observations) but must never inflate the participant count. Arm
 * gates therefore use PARTICIPANTS PER ARM.
 */
export function participantSummaries(outcomes) {
  const byId = new Map();
  for (const o of Array.isArray(outcomes) ? outcomes : []) {
    if (!o || typeof o !== 'object') continue;
    const pid = o.participantId || null;
    if (!pid) continue; // rows without a participant can't enter the analysis
    if (!byId.has(pid)) byId.set(pid, []);
    byId.get(pid).push(o);
  }
  const summaries = [];
  for (const [participantId, rows] of [...byId.entries()].sort()) {
    const arm = rows.find((r) => r.variant === 'adaptive' || r.variant === 'balanced')?.variant || null;
    if (!arm) continue; // unlabelled rows cannot be analysed
    const sessions = rows.length;
    const completedKnown = rows.filter((o) => typeof o.completed === 'boolean');
    const days = rows.map((o) => o.day).filter(Number.isFinite);
    const ats = rows.map((o) => Date.parse(o.at)).filter(Number.isFinite);
    const summary = {
      participantId,
      arm,
      sessions,
      completion: rate(rows, (o) => (typeof o.completed === 'boolean' ? o.completed : null)),
      delayedShort: rate(rows, (o) => (o.delayedShort && typeof o.delayedShort.correct === 'boolean' ? o.delayedShort.correct : null)),
      delayedLong: rate(rows, (o) => (o.delayedLong && typeof o.delayedLong.correct === 'boolean' ? o.delayedLong.correct : null)),
      // PER-SKILL transfer: one estimate per protocol-reported skill; domains
      // are never merged (protocol.transfer.overallScoreAllowed === false).
      // Legacy rows with a single scalar transfer.score read as 'vocabulary'.
      transferBySkill: Object.fromEntries(PROTOCOL.transfer.reportedPerSkill.map((skill) => [
        skill,
        mean(rows, (o) => {
          const t = o.transfer;
          if (!t) return null;
          if (t[skill] && typeof t[skill].score === 'number') return t[skill].score;
          if (skill === 'vocabulary' && typeof t.score === 'number') return t.score; // legacy shape
          return null;
        }),
      ])),
      // Legacy aggregate view (vocabulary only) for existing consumers.
      transfer: mean(rows, (o) => {
        const t = o.transfer;
        if (!t) return null;
        if (t.vocabulary && typeof t.vocabulary.score === 'number') return t.vocabulary.score;
        if (typeof t.score === 'number') return t.score;
        return null;
      }),
      recurrence: rate(rows, (o) => (typeof o.recurred === 'boolean' ? o.recurred : null)),
      missingShort: rows.filter((o) => o.delayedShort == null).length,
      missingLong: rows.filter((o) => o.delayedLong == null).length,
      missingRate: sessions ? Math.round((rows.filter((o) => o.delayedShort == null && o.delayedLong == null).length / sessions) * 100) : null,
      firstDay: days.length ? Math.min(...days) : null,
      lastDay: days.length ? Math.max(...days) : null,
      durationDays: days.length ? Math.max(...days) - Math.min(...days) : null,
      firstAt: ats.length ? Math.min(...ats) : null,
      lastAt: ats.length ? Math.max(...ats) : null,
      // Research-honesty flags: withdrawn participants stop contributing new
      // rows, but their existing rows stay analysable unless excluded upstream.
      completedKnown: completedKnown.length,
    };
    summaries.push(summary);
  }
  return summaries;
}

/** Observation-weighted rate for one participant (null below the floor). */
function rate(rows, pick, floor = 1) {
  const vals = rows.map(pick).filter((v) => typeof v === 'boolean');
  if (vals.length < floor) return { rate: null, n: vals.length };
  return { rate: vals.filter(Boolean).length / vals.length, n: vals.length };
}

function mean(rows, pick, floor = 1) {
  const vals = rows.map(pick).filter((v) => typeof v === 'number');
  if (vals.length < floor) return { mean: null, n: vals.length };
  return { mean: vals.reduce((a, v) => a + v, 0) / vals.length, n: vals.length };
}

/**
 * Arm-level comparison over PARTICIPANT SUMMARIES — participant-weighted.
 *
 *   raw observations → participant metric → ONE contribution per participant
 *   → arm aggregate (mean, median, spread)
 *
 * A participant with 50 sessions contributes exactly one 1–3d retention
 * estimate to the arm, same as a participant with one. Pooled observation-
 * level rates are deliberately NOT reconstructed. Each metric keeps its own
 * scored-participant count and stays hidden until its own floor is met.
 */
export function armComparison(summaries, { minPerArm = MIN_N_PER_ARM, minScoredPerMetric = MIN_TRANSFER_N } = {}) {
  const spread = (vals) => {
    if (vals.length < 2) return { iqr: null, range: null };
    const s = [...vals].sort((a, b) => a - b);
    const q = (p) => {
      const i = (s.length - 1) * p;
      const lo = Math.floor(i); const hi = Math.ceil(i);
      return s[lo] + (s[hi] - s[lo]) * (i - lo);
    };
    return { iqr: Math.round((q(0.75) - q(0.25)) * 1000) / 1000, range: Math.round((s[s.length - 1] - s[0]) * 1000) / 1000 };
  };
  const median = (vals) => {
    if (!vals.length) return null;
    const s = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const armStats = (arm) => {
    const rows = summaries.filter((s) => s.arm === arm);
    const participants = rows.length;
    // One contribution per participant per metric.
    const contrib = (pick) => rows.map(pick).filter((v) => v != null);
    const metric = (vals) => {
      const scored = vals.length;
      if (participants < minPerArm || scored < minScoredPerMetric) {
        return { mean: null, median: null, spread: spread([]), scoredParticipants: scored, rate: null, n: participants };
      }
      const m = vals.reduce((a, v) => a + v, 0) / scored;
      return {
        mean: Math.round(m * 1000) / 1000,
        median: Math.round(median(vals) * 1000) / 1000,
        spread: spread(vals),
        scoredParticipants: scored,
        rate: Math.round(m * 100) / 100,   // legacy 0..1 alias
        n: participants,                   // participants, always
      };
    };
    const pRate = (pick) => pick.rate == null ? null : pick.rate;
    return {
      participants,
      eligibleParticipants: rows.filter((s) => s.sessions > 0).length,
      evidenceShort: rows.filter((s) => s.delayedShort.rate != null).length,
      evidenceLong: rows.filter((s) => s.delayedLong.rate != null).length,
      evidenceTransfer: rows.filter((s) => s.transfer.mean != null).length,
      delayedShort: metric(contrib((s) => pRate(s.delayedShort))),
      delayedLong: metric(contrib((s) => pRate(s.delayedLong))),
      transfer: metric(contrib((s) => (s.transfer.mean == null ? null : s.transfer.mean / 100))),
      // PER-SKILL arm metrics: each protocol skill keeps its own scored-
      // participant count, mean, median and spread — domains never merge.
      transferBySkill: Object.fromEntries(PROTOCOL.transfer.reportedPerSkill.map((skill) => [
        skill,
        metric(contrib((s) => {
          const t = s.transferBySkill?.[skill];
          return t && t.mean != null ? t.mean / 100 : null;
        })),
      ])),
      recurrence: metric(contrib((s) => pRate(s.recurrence))),
      completion: metric(contrib((s) => pRate(s.completion))),
      sessions: rows.reduce((a, s) => a + s.sessions, 0),
      missingShort: rows.reduce((a, s) => a + s.missingShort, 0),
      missingLong: rows.reduce((a, s) => a + s.missingLong, 0),
    };
  };
  const adaptive = armStats('adaptive');
  const balanced = armStats('balanced');
  const comparable = adaptive.participants >= minPerArm
    && balanced.participants >= minPerArm
    && adaptive.delayedShort.mean != null
    && balanced.delayedShort.mean != null;
  return {
    adaptive,
    balanced,
    weighting: 'participant',
    comparison: {
      comparable,
      minPerArm,
      minScoredPerMetric,
      message: comparable
        ? `Both arms reached ${minPerArm}+ participants — participant-weighted means/medians are descriptive only, not significance claims.`
        : `Comparing arms needs at least ${minPerArm} PARTICIPANTS per arm (adaptive ${adaptive.participants}, balanced ${balanced.participants}); sessions never count as participants, and each metric needs ${minScoredPerMetric}+ scored participants.`,
    },
  };
}

/**
 * Attrition by arm, derived from STUDY RECORDS (status + last activity),
 * never from missing outcome rows — absence of data is not withdrawal.
 * Thresholds come from the frozen protocol (PROTOCOL.attrition).
 *   active                  enrolment active with recent sessions
 *   completed               reached the study's target weeks with activity
 *   withdrawn               explicit withdrawal recorded
 *   inactive                active but no sessions in the last `inactiveAfterDays`
 *   insufficientFollowUp    enrolled less than this long → nothing expected yet
 * The five categories partition the enrolled cohort.
 */
export function attritionByArm(studyRecords, { now = Date.now(), weeks = null, inactiveAfterDays = null } = {}) {
  const weekMs = (weeks || STUDY_WEEKS_DEFAULT) * 7 * 86400000;
  const inactiveMs = (inactiveAfterDays ?? PROTOCOL.attrition.inactiveAfterDays) * 86400000;
  const followUpMs = PROTOCOL.attrition.insufficientFollowUpDays * 86400000;
  const byArm = {
    adaptive: { enrolled: 0, active: 0, completed: 0, withdrawn: 0, inactive: 0, insufficientFollowUp: 0 },
    balanced: { enrolled: 0, active: 0, completed: 0, withdrawn: 0, inactive: 0, insufficientFollowUp: 0 },
  };
  for (const rec of Array.isArray(studyRecords) ? studyRecords : []) {
    if (!rec || (rec.arm !== 'adaptive' && rec.arm !== 'balanced')) continue;
    const arm = byArm[rec.arm];
    arm.enrolled += 1;
    if (rec.status === 'withdrawn') { arm.withdrawn += 1; continue; }
    const enrolledAt = Date.parse(rec.enrolledAt || 0);
    // No activity record yet: a recent enrolment is active (absence of data
    // is not withdrawal), an old enrolment with nothing ever logged is
    // inactive.
    const lastAt = rec.lastActivityAt != null ? Date.parse(rec.lastActivityAt)
      : (rec.lastAt != null ? Date.parse(rec.lastAt) : (Number.isFinite(enrolledAt) ? enrolledAt : null));
    const finished = Number.isFinite(enrolledAt) && (now - enrolledAt) >= weekMs && Number.isFinite(lastAt) && (lastAt - enrolledAt) >= weekMs * 0.75;
    if (finished) { arm.completed += 1; continue; }
    if (Number.isFinite(enrolledAt) && (now - enrolledAt) < followUpMs) { arm.insufficientFollowUp += 1; continue; }
    const quiet = !Number.isFinite(lastAt) || (now - lastAt) > inactiveMs;
    if (quiet) arm.inactive += 1;
    else arm.active += 1;
  }
  return byArm;
}

/**
 * Delivery/reporting health per arm: how many sessions were actually
 * delivered, how many outcomes are still missing their delayed window, and
 * (when enrolment day counts are supplied) dropout. These numbers are
 * descriptive — they exist so empty percentages can't masquerade as
 * findings, and so a researcher can see the data's shape before believing
 * any rate above.
 */
export function studyDeliveryStats(outcomes, { enrolledDays = null } = {}) {
  const armStats = (rows) => {
    const sessions = rows.length;
    const delivered = rows.filter((o) => Array.isArray(o.delivered) || Number.isFinite(o.timeSpent)).length;
    const completedKnown = rows.filter((o) => typeof o.completed === 'boolean');
    const completed = completedKnown.filter((o) => o.completed).length;
    const missingShort = rows.filter((o) => o.delayedShort == null && (o.day == null || (enrolledDays == null || enrolledDays - o.day >= 3))).length;
    const missingLong = rows.filter((o) => o.delayedLong == null && (o.day == null || (enrolledDays == null || enrolledDays - o.day >= 7))).length;
    return {
      sessions,
      delivered,
      completed,
      completedKnown: completedKnown.length,
      missingShort,
      missingLong,
      missingShortRate: sessions ? Math.round((missingShort / sessions) * 100) : null,
      missingLongRate: sessions ? Math.round((missingLong / sessions) * 100) : null,
    };
  };
  const enrolledDaysOf = (enrolledDays) => (enrolledDays && typeof enrolledDays === 'object' ? enrolledDays : null);
  const dayMap = enrolledDaysOf(enrolledDays) || {};
  const adaptive = armStats(rowsFor(outcomes, 'adaptive'));
  const balanced = armStats(rowsFor(outcomes, 'balanced'));
  return {
    adaptive,
    balanced,
    dropout: {
      // dropout needs cohort day counts per arm; absent them, it is null —
      // never a guessed percentage.
      adaptive: dayMap.adaptive != null && dayMap.adaptive.total > 0
        ? Math.round(((dayMap.adaptive.total - (dayMap.adaptive.active ?? dayMap.adaptive.total)) / dayMap.adaptive.total) * 100)
        : null,
      balanced: dayMap.balanced != null && dayMap.balanced.total > 0
        ? Math.round(((dayMap.balanced.total - (dayMap.balanced.active ?? dayMap.balanced.total)) / dayMap.balanced.total) * 100)
        : null,
    },
  };
}

/** Overall rates for the participant's own dashboard (not the comparison). */
export function personalOutcomes(outcomes) {
  const rows = (outcomes || []).filter((o) => o.selectedId);
  const one = (key, floor = 1) => {
    const withO = rows.filter((o) => o[key] && typeof o[key].correct === 'boolean');
    return withO.length >= floor
      ? Math.round((withO.filter((o) => o[key].correct).length / withO.length) * 100)
      : null;
  };
  const knownRec = rows.filter((o) => typeof o.recurred === 'boolean');
  const transfers = rows.filter((o) => o.transfer && typeof o.transfer.score === 'number');
  return {
    n: rows.length,
    delayedShort: one('delayedShort'),
    delayedLong: one('delayedLong'),
    transfer: transfers.length >= 3
      ? Math.round(transfers.reduce((a, o) => a + o.transfer.score, 0) / transfers.length)
      : null,
    recurrence: knownRec.length ? Math.round((knownRec.filter((o) => o.recurred).length / knownRec.length) * 100) : null,
  };
}
