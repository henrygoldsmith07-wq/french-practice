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
// PRIVACY / LOCAL-FIRST: everything lives in localStorage under fp.studyKeys
// below. Nothing leaves the device except through the existing opt-in
// validation-bundle export (now v2), which carries only the anonymised
// participant id, the CEFR band, and outcome rows — never transcripts, names
// or raw conversation content.

export const STUDY_ENGINE_VERSION = 1;

// ── schedule knobs (deterministic, versioned) ──────────────────────────────
export const CHECK_EVERY_DAYS = 3;      // a held-out check every 3rd study day
export const FIRST_CHECK_DAY = 2;       // skip day 0-1: let the loop warm up
export const MIN_MINUTES = 10;          // sessions below this don't freeze records

// Delayed-recall windows (days). Only outcomes from the graph's DELAYED
// evidence classes can ever fall in them; immediate retries never qualify.
export const SHORT_DELAY_DAYS = { min: 1, max: 3 };
export const LONG_DELAY_DAYS = { min: 7, max: null };

// ── aggregate reporting gates (mirroring the app's honesty rules) ──────────
export const MIN_N_PER_ARM = 8;         // before an arm's rate prints at all
export const MIN_TRANSFER_N = 5;        // before a new-context rate prints

const ARMS = ['adaptive', 'balanced'];
const STUDY_WEEKS_DEFAULT = 8;

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
export function enrolStudy(prev, { syncId = '', startLevel = null, startTheta = null, weeks = STUDY_WEEKS_DEFAULT, seed = null, now = Date.now() } = {}) {
  if (prev?.status === 'active' || prev?.status === 'withdrawn') return prev;
  const pid = seed ? `${seed}` : randomId('participant');
  const band = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(startLevel) ? startLevel : null;
  const assignment = assignArm(pid, syncId);
  return {
    schemaVersion: 1,
    engineVersion: STUDY_ENGINE_VERSION,
    participantId: pid,
    arm: assignment.arm,             // LOCKED; the dashboard never prints it
    armSource: assignment.source,    // 'saved-override' | 'sync-id-hash'
    enrolledAt: new Date(now).toISOString(),
    startLevel: band,
    startTheta: Number.isFinite(Number(startTheta)) ? Number(startTheta) : null,
    weeks: Math.max(4, Math.min(26, Math.round(weeks))),
    status: 'active',
  };
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
  return { ...state, status: 'withdrawn', withdrawnAt: new Date(now).toISOString() };
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
export function buildHeldOutPool({ participantId, day, level = 'B1', vocabEntries = [], srsMap = {}, listeningTracks = [], limit = 6, skills = ['vocabulary'] } = {}) {
  void vocabEntries; void srsMap; void listeningTracks; // practice content is never held-out material
  if (!participantId) return { words: [], track: null };
  const { selectHeldOutItems } = requireBank();
  const words = selectHeldOutItems({ participantId, day, level, limit, skills });
  return { words, track: null, skills: [...new Set(words.map((w) => w.skill))] };
}

function requireBank() {
  // eslint-disable-next-line import/no-cycle
  return { selectHeldOutItems: __selectHeldOutItems };
}
import { selectHeldOutItems as __selectHeldOutItems } from './heldOutBank.js';

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
    wordIds: (pool.words || []).map((w) => w.id),
    // Per-skill accounting: which banks were sampled, so results can be
    // reported per skill (vocabulary / vocabulary-prod / grammar / listening
    // / reading / speaking) and never merged into an overall score.
    skills: pool.skills || [...new Set((pool.words || []).map((w) => w.skill).filter(Boolean))],
    trackId: pool.track?.id || null,
    results: null,          // filled by recordCheckResult
    engineVersion: STUDY_ENGINE_VERSION,
  };
}

/** Fold a finished check into its record. Pure. */
export function recordCheckResult(check, { correct = 0, total = 0, quizScore = null, secondsSpent = null, now = Date.now() } = {}) {
  if (!check) return null;
  return {
    ...check,
    results: {
      correct: Math.max(0, Math.round(Number(correct) || 0)),
      total: Math.max(0, Math.round(Number(total) || 0)),
      quizScore: quizScore != null && Number.isFinite(Number(quizScore)) ? Math.max(0, Math.min(100, Math.round(Number(quizScore)))) : null,
      secondsSpent: secondsSpent != null && Number.isFinite(Number(secondsSpent)) ? Math.max(0, Math.round(Number(secondsSpent))) : null,
      at: new Date(now).toISOString(),
    },
  };
}

export const checkScore = (check) => {
  const r = check?.results;
  if (!r || !r.total) return null;
  return Math.round((r.correct / r.total) * 100);
};

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
      transfer: mean(rows, (o) => (o.transfer && typeof o.transfer.score === 'number' ? o.transfer.score : null)),
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
 * Arm-level comparison over PARTICIPANT SUMMARIES. n = participants; the
 * comparison gate is participants per arm, and every rate averages the
 * participants' own estimates (weighted by each participant's observation
 * count in the message copy as "scored outcomes", never sessions).
 */
export function armComparison(summaries, { minPerArm = MIN_N_PER_ARM } = {}) {
  const armStats = (arm) => {
    const rows = summaries.filter((s) => s.arm === arm);
    const participants = rows.length;
    // Pool each participant's boolean observations for arm-level rates, but
    // report n as PARTICIPANTS.
    const obs = (pick) => {
      let ok = 0; let n = 0;
      for (const s of rows) {
        const v = pick(s);
        if (v == null) continue;
        ok += v.ok; n += v.n;
      }
      return n >= minPerArm ? { rate: ok / n, n: participants } : { rate: null, n: participants };
    };
    const transferObs = () => {
      let sum = 0; let n = 0;
      for (const s of rows) {
        if (s.transfer.mean == null) continue;
        sum += s.transfer.mean * s.transfer.n;
        n += s.transfer.n;
      }
      return n >= MIN_TRANSFER_N ? { rate: sum / n / 100, n: participants } : { rate: null, n: participants };
    };
    return {
      participants,
      delayedShort: obs((s) => (s.delayedShort.rate == null ? null : { ok: s.delayedShort.rate * s.delayedShort.n, n: s.delayedShort.n })),
      delayedLong: obs((s) => (s.delayedLong.rate == null ? null : { ok: s.delayedLong.rate * s.delayedLong.n, n: s.delayedLong.n })),
      transfer: transferObs(),
      recurrence: obs((s) => (s.recurrence.rate == null ? null : { ok: s.recurrence.rate * s.recurrence.n, n: s.recurrence.n })),
      completion: obs((s) => (s.completion.rate == null ? null : { ok: s.completion.rate * s.completion.n, n: s.completion.n })),
      sessions: rows.reduce((a, s) => a + s.sessions, 0),
      missingShort: rows.reduce((a, s) => a + s.missingShort, 0),
      missingLong: rows.reduce((a, s) => a + s.missingLong, 0),
    };
  };
  const adaptive = armStats('adaptive');
  const balanced = armStats('balanced');
  const comparable = adaptive.participants >= minPerArm
    && balanced.participants >= minPerArm
    && adaptive.delayedShort.rate != null
    && balanced.delayedShort.rate != null;
  return {
    adaptive,
    balanced,
    comparison: {
      comparable,
      minPerArm,
      message: comparable
        ? `Both arms reached ${minPerArm}+ participants — rates below are descriptive only, not significance claims.`
        : `Comparing arms needs at least ${minPerArm} PARTICIPANTS per arm (adaptive ${adaptive.participants}, balanced ${balanced.participants}); sessions never count as participants.`,
    },
  };
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
