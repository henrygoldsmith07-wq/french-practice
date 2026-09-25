// A small, pure learner-error model shared by every practice mode.
// Storage owns persistence; this module owns normalisation, recurrence and
// prioritisation so the rules stay testable without a browser.
//
// The recovery loop every mode feeds:
//   mistake → classify (category+key) → prioritise → targeted repair
//   → clean success → delayed retest → improving → resolved → recurrence
// Evidence rules encoded here:
//   · one correct answer never implies mastery
//   · same-session success is weaker evidence than delayed recall — a
//     delayed clean pass resolves on its own; same-session passes need
//     INDEPENDENT encounters (see below)
//   · success carries evidence identity (sessionId / encounterId /
//     activityId, lib/evidenceIdentity.js): same-session passes resolve
//     only from DISTINCT encounters — re-answering the same drill (same
//     encounterId) never increments independent mastery twice, and
//     identity-less (legacy/unknown) evidence can extend "improving" but
//     must never invent the independence a resolution requires
//   · a mistake after a repair reactivates the entry and tallies recurrence

import { evidenceIdentity, encounterKeyOf } from './evidenceIdentity.js';

export const LEARNER_ERROR_CATEGORIES = ['grammar', 'vocabulary', 'listening', 'pronunciation', 'reading', 'speaking', 'writing'];

// Canonical category+key for every tracked skill. Older builds wrote some
// skills under surrogate categories (reading under 'listening', writing under
// 'grammar') or mode-specific keys (pronunciation per mode); canonicaliseModel
// folds those legacy entries into these canonical ids without fabricating
// recovery evidence.
const CANONICAL_KEYS = {
  pronunciation: new Set(['pronunciation']),
  speaking: new Set(['speaking']),
  reading: new Set(['reading']),
  writing: new Set(['writing']),
};
const LEGACY_ID_FOLDS = [
  // [legacy id prefix, canonical category, canonical key]
  [/^listening:reading:/, 'reading', 'reading'],
  [/^grammar:writing:/, 'writing', 'writing'],
  [/^pronunciation:mode:/, 'pronunciation', 'pronunciation'],
  [/^pronunciation:speaking$/, 'speaking', 'speaking'],
];

// Fold legacy surrogate entries into canonical ids. Errors (and recurrence
// history) survive the fold — they are real dated mistakes — but clean
// passes do NOT carry over: recovery must be re-earned under the canonical
// entry so no migration can inflate mastery. Idempotent: canonical ids and
// unknown shapes pass through untouched.
export function canonicaliseModel(model) {
  if (!model || !Array.isArray(model.entries)) return model;
  let changed = false;
  const folded = new Map();
  const entries = [];
  for (const entry of model.entries) {
    const fold = LEGACY_ID_FOLDS.find(([re]) => re.test(entry.id));
    if (!fold) { entries.push(entry); continue; }
    changed = true;
    const [, category, key] = fold;
    const target = folded.get(`${category}:${key}`) || {
      ...entry, id: `${category}:${key}`, category, key,
      errorCount: 0, successCount: 0, recurrenceCount: 0, cleanPasses: 0,
      status: 'active', lastEvidence: null, lastScore: null,
      evidence: [], modes: [],
    };
    target.errorCount += entry.errorCount || 0;
    target.recurrenceCount += entry.recurrenceCount || 0;
    target.label = entry.label || target.label;
    // Keep the most recent activity timestamps; the earliest mistake date.
    if (!target.lastErrorAt || (entry.lastErrorAt && entry.lastErrorAt > target.lastErrorAt)) target.lastErrorAt = entry.lastErrorAt || target.lastErrorAt;
    if (!target.lastSeen || (entry.lastSeen && entry.lastSeen > target.lastSeen)) target.lastSeen = entry.lastSeen || target.lastSeen;
    target.evidence = [...(target.evidence || []), ...(entry.evidence || [])]
      .sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
    for (const mode of entry.modes || []) if (!target.modes.includes(mode)) target.modes.push(mode);
    folded.set(target.id, target);
  }
  // Same reference when nothing folded, so callers can skip the write-back.
  return changed ? { ...model, entries: [...entries, ...folded.values()] } : model;
}

// Evidence strength of a success, from its timing relative to the mistake.
// 'same-session' — corrected within the same practice session (prompted,
// just seen the answer): weaker evidence. 'delayed' — recalled in a LATER
// session/day without the answer on screen: strong evidence, the closest
// local signal to a real retention test.
export const evidenceStrength = (success, entry) => {
  const mode = String(success.mode || '');
  // Modes the product only produces as spaced, independent recalls
  // (scheduled weakness retests, held-out checks): delayed by design. For
  // everything else the DATES decide — a recall on a later day than the
  // mistake is a delayed recall, even in an SRS mode.
  if (/^(weakness-retest|held-out|srs)$/i.test(mode)) return 'delayed';
  if (success.delayed === true) return 'delayed';
  if (success.delayed === false) return 'same-session';
  // Infer from the entry: a success on a different calendar day than the
  // last mistake is a delayed recall; same day is (probably) same-session.
  const lastError = entry?.lastErrorAt ? Date.parse(entry.lastErrorAt) : null;
  const at = Date.parse(success.at || success.lastSeen || '') || null;
  if (lastError && at) {
    const errorDate = new Date(lastError);
    const successDate = new Date(at);
    const sameUtcDay = successDate.getUTCFullYear() === errorDate.getUTCFullYear()
      && successDate.getUTCMonth() === errorDate.getUTCMonth()
      && successDate.getUTCDate() === errorDate.getUTCDate();
    return sameUtcDay ? 'same-session' : 'delayed';
  }
  return 'unknown';
};

const DELAYED_PASSES_TO_RESOLVE = 1; // a delayed clean recall resolves on its own
const INDEPENDENT_PASSES_TO_RESOLVE = 2; // same-session evidence needs two DISTINCT encounters
const MAX_ENCOUNTER_KEYS = 16; // bounded distinct-encounter tally per entry

const STATUSES = new Set(['active', 'recovering', 'resolved']);
const MAX_ENTRIES = 240;
const MAX_EVIDENCE = 8;
const MAX_MODES = 8;

function iso(value, fallback) {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function clampScore(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function categoryOf(value) {
  const category = String(value || '').toLowerCase();
  return LEARNER_ERROR_CATEGORIES.includes(category) ? category : 'grammar';
}

// Keep canonical aggregate keys stable (Today's drill producers hunt them);
// anything else passes through for per-item targeting (vocabulary items,
// conjugation forms, grammar topics).
function canonicalKey(category, value) {
  const key = keyOf(value);
  const canonical = CANONICAL_KEYS[category];
  return canonical && !canonical.has(key) ? [...canonical][0] : key;
}

function keyOf(value) {
  return String(value || 'general').trim().slice(0, 120) || 'general';
}

function entryId(category, key) {
  return `${category}:${key}`;
}

function normaliseEvidence(evidence, fallbackAt) {
  if (!evidence || typeof evidence !== 'object') return null;
  const pick = (v, max) => {
    const s = String(v || '').trim();
    return s ? s.slice(0, max) : null;
  };
  return {
    at: iso(evidence.at, fallbackAt),
    mode: String(evidence.mode || 'unknown').slice(0, 40),
    score: clampScore(evidence.score),
    source: String(evidence.source || '').slice(0, 60) || null,
    detail: String(evidence.detail || '').slice(0, 180) || null,
    // Evidence identity (lib/evidenceIdentity.js): provenance that lets the
    // model tell distinct encounters apart. Optional — legacy evidence has
    // none, and absence is treated as "independence unknown", never "independent".
    sessionId: pick(evidence.sessionId, 80),
    encounterId: pick(evidence.encounterId, 80),
    activityId: pick(evidence.activityId, 80),
  };
}

const clampEncounterKeys = (keys) =>
  [...new Set((Array.isArray(keys) ? keys : []).filter((k) => typeof k === 'string' && k).slice(-MAX_ENCOUNTER_KEYS))];

function normaliseEntry(input, fallbackAt = new Date().toISOString()) {
  if (!input || typeof input !== 'object') return null;
  const category = categoryOf(input.category);
  const key = canonicalKey(category, input.key || input.topicId || input.itemId);
  const evidence = Array.isArray(input.evidence)
    ? input.evidence.map((item) => normaliseEvidence(item, fallbackAt)).filter(Boolean).slice(-MAX_EVIDENCE)
    : [];
  const modes = Array.isArray(input.modes)
    ? [...new Set(input.modes.map((mode) => String(mode).slice(0, 40)).filter(Boolean))].slice(0, MAX_MODES)
    : [];
  const errorCount = Math.max(0, Math.floor(Number(input.errorCount) || 0));
  const successCount = Math.max(0, Math.floor(Number(input.successCount) || 0));
  const cleanPasses = Math.max(0, Math.floor(Number(input.cleanPasses) || 0));
  const status = STATUSES.has(input.status)
    ? input.status
    : cleanPasses >= 2
      ? 'resolved'
      : successCount > 0
        ? 'recovering'
        : 'active';
  return {
    id: String(input.id || entryId(category, key)).slice(0, 180),
    category,
    key,
    label: String(input.label || key).slice(0, 140),
    firstSeen: iso(input.firstSeen, fallbackAt),
    lastSeen: iso(input.lastSeen || input.lastErrorAt || input.lastSuccessAt, fallbackAt),
    lastErrorAt: input.lastErrorAt ? iso(input.lastErrorAt, fallbackAt) : null,
    lastSuccessAt: input.lastSuccessAt ? iso(input.lastSuccessAt, fallbackAt) : null,
    errorCount,
    successCount,
    recurrenceCount: Math.max(0, Math.floor(Number(input.recurrenceCount) || 0)),
    cleanPasses,
    // Independent-encounter tally since the last mistake. Legacy entries
    // (no field) default to 0: unknown legacy evidence must never invent
    // the independence a resolution requires — recovery is re-earned under
    // the identity-aware rule with fresh evidence.
    independentPasses: Math.max(0, Math.floor(Number(input.independentPasses) || 0)),
    encounterKeys: clampEncounterKeys(input.encounterKeys),
    status,
    lastEvidence: ['same-session', 'delayed', 'unknown'].includes(input.lastEvidence) ? input.lastEvidence : null,
    lastScore: clampScore(input.lastScore),
    modes,
    evidence,
  };
}

export function createLearnerErrorModel(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const fallbackAt = iso(input.updatedAt, new Date().toISOString());
  const entries = Array.isArray(input.entries)
    ? input.entries.map((entry) => normaliseEntry(entry, fallbackAt)).filter(Boolean)
    : [];
  const unique = new Map();
  for (const entry of entries) {
    const current = unique.get(entry.id);
    if (!current || current.lastSeen < entry.lastSeen) unique.set(entry.id, entry);
  }
  return {
    version: 1,
    updatedAt: fallbackAt,
    entries: [...unique.values()].slice(0, MAX_ENTRIES),
  };
}

function withEvidence(entry, error, at) {
  const nextEvidence = normaliseEvidence({
    at,
    mode: error.mode,
    score: error.score,
    source: error.source,
    detail: error.detail,
    // Provenance travels WITH the evidence — without these fields a success
    // can never prove which encounter it came from, and the recovery loop
    // correctly refuses to treat it as independent.
    sessionId: error.sessionId,
    encounterId: error.encounterId,
    activityId: error.activityId,
  }, at);
  const evidence = nextEvidence
    ? [...entry.evidence.filter((item) => (
      // Legacy heuristic: an identity-less event recorded twice in the same
      // millisecond+mode is a double-fire, not two answers. Identity-bearing
      // evidence NEVER collapses: every re-answer persists (the encounter key,
      // not evidence dropping, is what dedupes independence), so the audit
      // trail stays complete and deterministic under fast double-taps.
      nextEvidence.encounterId
        || item.at !== nextEvidence.at
        || item.mode !== nextEvidence.mode)), nextEvidence].slice(-MAX_EVIDENCE)
    : entry.evidence;
  const mode = String(error.mode || '').slice(0, 40);
  const modes = mode && !entry.modes.includes(mode) ? [...entry.modes, mode].slice(-MAX_MODES) : entry.modes;
  return { evidence, modes };
}

export function recordLearnerError(model, error = {}, { at = new Date().toISOString() } = {}) {
  const base = createLearnerErrorModel(model);
  const category = categoryOf(error.category);
  const key = keyOf(error.key || error.topicId || error.itemId);
  const id = entryId(category, key);
  const previous = base.entries.find((entry) => entry.id === id);
  const count = Math.max(1, Math.floor(Number(error.count) || 1));
  const recurrence = Math.max(0, Math.floor(Number(error.recurrenceCount) || 0));
  const wasRepaired = Boolean(previous && (previous.successCount > 0 || previous.status !== 'active'));
  const starter = previous || normaliseEntry({ category, key, label: error.label }, at);
  const { evidence, modes } = withEvidence(starter, error, at);
  const next = {
    ...starter,
    label: String(error.label || starter.label || key).slice(0, 140),
    lastSeen: at,
    lastErrorAt: at,
    errorCount: starter.errorCount + count,
    recurrenceCount: starter.recurrenceCount + recurrence + (wasRepaired && count > 0 ? 1 : 0),
    cleanPasses: 0,
    // Recurrence resets recovery: the independent-encounter tally restarts
    // so old passes can never re-resolve a weakness that just recurred.
    independentPasses: 0,
    encounterKeys: [],
    status: 'active', // recurrence reactivates a resolved/recovering weakness
    lastEvidence: null,
    lastScore: clampScore(error.score),
    evidence,
    modes,
  };
  return {
    version: 1,
    updatedAt: at,
    entries: [next, ...base.entries.filter((entry) => entry.id !== id)].slice(0, MAX_ENTRIES),
  };
}

export function recordLearnerSuccess(model, success = {}, { at = new Date().toISOString() } = {}) {
  const base = createLearnerErrorModel(model);
  const category = categoryOf(success.category);
  const key = keyOf(success.key || success.topicId || success.itemId);
  const id = entryId(category, key);
  const previous = base.entries.find((entry) => entry.id === id);
  if (!previous) return base;
  const { evidence, modes } = withEvidence(previous, success, at);
  const mode = String(success.mode || '').slice(0, 40);
  const strength = evidenceStrength({ ...success, at }, previous);
  // Independence accounting. A DELAYED clean pass is itself the retention
  // evidence the loop asks for and resolves on its own. Same-session passes  // resolve only from DISTINCT encounters: the encounter key dedupes
  // re-answers of the same drill, and identity-less evidence never advances
  // the tally — it can extend "improving" but must never imply mastery.
  const identity = evidenceIdentity(success);
  const encounterKey = encounterKeyOf(identity);
  const keys = previous.encounterKeys || [];
  const sameEncounterAgain = Boolean(encounterKey && keys.includes(encounterKey));
  let independentPasses = previous.independentPasses || 0;
  let nextKeys = keys;
  if (strength === 'delayed') {
    // Legacy delayed evidence (mode/date separation, no ids) is still
    // structurally independent — a scheduled retest is a separate encounter
    // by construction. A delayed pass whose encounter was already counted
    // adds nothing new.
    if (!sameEncounterAgain) independentPasses = INDEPENDENT_PASSES_TO_RESOLVE;
  } else if (encounterKey && !sameEncounterAgain) {
    independentPasses = Math.min(independentPasses + 1, INDEPENDENT_PASSES_TO_RESOLVE);
    nextKeys = [...keys, encounterKey].slice(-MAX_ENCOUNTER_KEYS);
  }
  // One correct answer never implies mastery: same-session passes need two
  // distinct encounters; a delayed clean pass resolves on its own.
  const cleanPasses = strength === 'delayed' ? DELAYED_PASSES_TO_RESOLVE : previous.cleanPasses + 1;
  const status = independentPasses >= INDEPENDENT_PASSES_TO_RESOLVE ? 'resolved' : 'recovering';
  return {
    version: 1,
    updatedAt: at,
    entries: [{
      ...previous,
      lastSeen: at,
      lastSuccessAt: at,
      successCount: previous.successCount + 1,
      cleanPasses,
      independentPasses,
      encounterKeys: nextKeys,
      lastEvidence: strength,
      status,
      lastScore: clampScore(success.score),
      evidence,
      modes: mode && !modes.includes(mode) ? [...modes, mode].slice(-MAX_MODES) : modes,
    }, ...base.entries.filter((entry) => entry.id !== id)],
  };
}

const STATUS_ORDER = { active: 0, recovering: 1, resolved: 2 };

export function prioritiseLearnerErrors(model, { limit = 12, includeResolved = false } = {}) {
  const entries = createLearnerErrorModel(model).entries.filter((entry) => includeResolved || entry.status !== 'resolved');
  return entries
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || b.recurrenceCount - a.recurrenceCount
      || b.errorCount - a.errorCount
      || (a.lastSeen < b.lastSeen ? 1 : -1))
    .slice(0, limit);
}

// Recovery history for Progress: the loop's recent transitions, newest
// first, from the entries' own evidence — real dated events, nothing
// fabricated, no internal ids. Learner-facing (rendered via recoveryStatus
// copy rules); storage keys, arm names and engine vocabulary stay out.
export function recoveryHistory(model, { limit = 6 } = {}) {
  const events = [];
  for (const entry of createLearnerErrorModel(model).entries) {
    if (entry.lastSuccessAt) {
      events.push({
        at: entry.lastSuccessAt,
        kind: 'success',
        label: entry.label,
        category: entry.category,
        status: entry.status,
        detail: entry.status === 'resolved'
          ? 'Recovered — a clean recall held.'
          : entry.lastEvidence === 'delayed'
            ? 'Clean delayed recall.'
            : 'Correct after a repair.',
      });
    }
    if (entry.lastErrorAt && entry.errorCount > 0) {
      events.push({
        at: entry.lastErrorAt,
        kind: 'mistake',
        label: entry.label,
        category: entry.category,
        status: entry.status,
        detail: entry.recurrenceCount > 0 && entry.status === 'active'
          ? 'Came back — practising it again.'
          : 'Slipped — added to your practice.',
      });
    }
  }
  return events
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}

export function learnerErrorSummary(model) {
  const entries = createLearnerErrorModel(model).entries;
  const byCategory = Object.fromEntries(LEARNER_ERROR_CATEGORIES.map((category) => [category, {
    entries: 0,
    errors: 0,
    active: 0,
    recovering: 0,
    resolved: 0,
  }]));
  let recurrences = 0;
  for (const entry of entries) {
    const bucket = byCategory[entry.category];
    bucket.entries += 1;
    bucket.errors += entry.errorCount;
    bucket[entry.status] += 1;
    recurrences += entry.recurrenceCount;
  }
  return {
    totalEntries: entries.length,
    totalErrors: entries.reduce((sum, entry) => sum + entry.errorCount, 0),
    active: entries.filter((entry) => entry.status === 'active').length,
    recovering: entries.filter((entry) => entry.status === 'recovering').length,
    resolved: entries.filter((entry) => entry.status === 'resolved').length,
    recurrences,
    byCategory,
  };
}
