// Learner-error model persistence lives in stores/learnerErrorStore.js;
// the facade re-exports it (recordGrammarError and friends below still need
// the migration priming via getLearnerErrorModel).
import {
  getLearnerErrorModel as _storeGetLearnerErrorModel,
  getLearnerErrors, getLearnerErrorSummary,
  recordLearnerError, recordLearnerSuccess,
} from './stores/learnerErrorStore.js';
export { getLearnerErrors, getLearnerErrorSummary, recordLearnerError, recordLearnerSuccess };

import { rateFsrs as fsrsRate, migrateFromSm2 } from './fsrs.js';
import { applyLanguageEvidence, normaliseLanguageProgress } from './languageModel.js';
// Evidence identity for the recovery loop (lib/evidenceIdentity.js): the
// session/encounter provenance that makes "independent mastery evidence"
// mean one drill presentation, not one more tap.
import { currentSessionId, newEncounterId } from './evidenceIdentity.js';
import {
  addFieldNote as _addFieldNote,
  normaliseFieldNotes,
  practiceFieldNote as _practiceFieldNote,
} from './fieldNotes.js';

// Physical layer + canonical key map live in storageCore.js; storage.js is
// becoming a facade over domain stores (stores/*.js). Keys, shapes and
// learner-namespacing behaviour are unchanged.
import {
  KEYS,
  read,
  write,
  readLearnerValue,
  purgeLearnerData,
  activeLearnerId,
  isLearnerKey,
  storageFullWarning,
} from './storageCore.js';
import {
  getStudyState, saveStudyState,
  getStudyConsent, saveStudyConsent,
  getStudyChecks, saveStudyChecks,
  getStudyOutcomes, saveStudyOutcomes,
  getStudyArmOverride, setStudyArmOverride,
  getImportedStudyBundles, saveImportedStudyBundles,
} from './stores/studyStore.js';
export { KEYS, readLearnerValue, purgeLearnerData, activeLearnerId, isLearnerKey, storageFullWarning };
// Thin localStorage wrapper — the app's only persistence layer (no backend).



// A stable per-account id, created on first use. Because it exports/imports
// with the snapshot, two devices restored from the same code share one id —
// the closest thing to an "account" without a backend.
export function getSyncId() {
  let id = read(KEYS.syncId, null);
  if (!id) {
    id = 'ls-' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
    write(KEYS.syncId, id);
  }
  return id;
}

export const getLastBackup = () => read(KEYS.lastBackup, null);
export const markBackup = () => write(KEYS.lastBackup, new Date().toISOString());


export const getExamBoundarySets = () => {
  const value = read(KEYS.examBoundaries, []);
  return Array.isArray(value) ? value : [];
};

export function saveExamBoundarySet(set) {
  const current = getExamBoundarySets().filter((item) => item && item.id !== set?.id);
  const saved = {
    ...set,
    id: String(set?.id || `boundary-${Date.now()}`),
    boundaries: { ...(set?.boundaries || {}) },
    importedAt: set?.importedAt || new Date().toISOString(),
  };
  write(KEYS.examBoundaries, [...current, saved].slice(-50));
  return saved;
}

export function removeExamBoundarySet(id) {
  const next = getExamBoundarySets().filter((set) => set?.id !== id);
  write(KEYS.examBoundaries, next);
  return next;
}

// ---- first-run onboarding gate ----
// New visitors (no key, no XP, no sessions, no explicit flag) see the wizard.

export const isOnboarded = () => {
  // The flag round-trips as the string '1' when written through write(), but
  // seeds/older builds can hold the bare number 1 (JSON.parse('1')). Accept
  // both shapes: a seeded learner must never be greeted by the wizard again.
  const flag = read(KEYS.onboarded, null);
  return flag === '1' || flag === 1;
};
export const setOnboarded = () => write(KEYS.onboarded, '1');

export function shouldOnboard() {
  if (isOnboarded()) return false;
  const returning = Boolean(getApiKey()) || getXp() > 0 || getSessions().length > 0;
  return !returning;
}

// ---- data portability (manual "sync across devices", no backend) ----
// Export every fp.* key except the private API key into a portable backup,
// and restore it on another device. There is no server; this is the honest
// way to move progress between machines.

export function exportProgress() {
  const data = {};
  for (const key of Object.values(KEYS)) {
    if (key === KEYS.apiKey) continue; // never export the secret
    if (key === KEYS.sessions) continue; // legacy last-10 mirror — sessionHistory is canonical
    const raw = localStorage.getItem(key);
    if (raw != null) data[key] = raw;
  }
  // Learner namespaces: every household member's namespaced state travels
  // under `learners`, so import restores each member's ownership intact.
  const learners = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^fp\.learner\.([^]+)\.(.+)$/);
      if (!m) continue;
      const memberId = m[1];
      const rest = m[2];
      learners[memberId] = learners[memberId] || {};
      learners[memberId][rest] = localStorage.getItem(k);
    }
  } catch { /* unavailable */ }
  return {
    app: 'le-studio', version: 3, exportedAt: new Date().toISOString(), data,
    learners,
  };
}

export function importProgress(payload) {
  if (!payload || payload.app !== 'le-studio' || typeof payload.data !== 'object') {
    throw new Error('That doesn’t look like a Le Studio backup file.');
  }
  const allowed = new Set(Object.values(KEYS));
  let restored = 0;
  for (const [key, raw] of Object.entries(payload.data)) {
    if (key === KEYS.apiKey || !allowed.has(key)) continue; // ignore unknown/secret keys
    try {
      JSON.parse(raw); // validate it's the stored JSON shape
      localStorage.setItem(key, raw);
      restored += 1;
    } catch { /* skip malformed entry */ }
  }
  // v3+: restore each member's namespaced values with ownership preserved.
  if (payload.learners && typeof payload.learners === 'object') {
    for (const [memberId, entries] of Object.entries(payload.learners)) {
      if (!memberId || typeof entries !== 'object') continue;
      for (const [rest, raw] of Object.entries(entries)) {
        if (typeof raw !== 'string') continue;
        try {
          JSON.parse(raw);
          localStorage.setItem(`fp.learner.${memberId}.${rest}`, raw);
          restored += 1;
        } catch { /* skip malformed */ }
      }
    }
  }
  return restored;
}

// theme: null = follow the OS preference; 'dark' | 'light' once toggled
// level: CEFR level used to calibrate the LLM; dailyGoal: XP target per day
// Settings, prefs AND the provider key live in stores/settingsStore.js — the
// store is authoritative (env fallback included); the facade re-exports so
// every historical import keeps working without a duplicate implementation.
import {
  getSettings as _storeGetSettings, setSettings as _storeSetSettings,
  getPrefs as _storeGetPrefs, setPrefs as _storeSetPrefs,
  getApiKey as _storeGetApiKey, setApiKey as _storeSetApiKey, clearApiKey as _storeClearApiKey,
  getConversationMode as _storeGetConversationMode, setConversationMode as _storeSetConversationMode,
} from './stores/settingsStore.js';
export const getSettings = () => _storeGetSettings();
export const setSettings = (s2) => _storeSetSettings(s2);
export const getPrefs = () => _storeGetPrefs();
export const setPrefs = (p) => _storeSetPrefs(p);
export const getApiKey = () => _storeGetApiKey();
export const setApiKey = (k) => _storeSetApiKey(k);
export const clearApiKey = () => _storeClearApiKey();
export const getConversationMode = () => _storeGetConversationMode();
export const setConversationMode = (m) => _storeSetConversationMode(m);


// ---- Pulse opt-in ---------------------------------------------------------
// Pulse reads the mirror under `fp.pulse-history.v2`. Sharing is off by
// default and gated here, where the data originates: while the flag is off no
// mirror is written, and revoking deletes the mirror outright.

export const readPulseOptIn = () => read(KEYS.pulseOptIn, null) === '1';

export function setPulseOptIn(enabled) {
  if (enabled) {
    write(KEYS.pulseOptIn, '1');
  } else {
    localStorage.removeItem(KEYS.pulseOptIn);
    localStorage.removeItem(KEYS.pulseHistory);
  }
}

// ---- durable session and Pulse history ------------------------------------

function migrationState() {
  const state = read(KEYS.migrations, {});
  return state && typeof state === 'object' ? state : {};
}

function markMigration(id, detail = {}) {
  write(KEYS.migrations, { ...migrationState(), [id]: { ...detail, at: new Date().toISOString() } });
}

function normaliseSession(session, index = 0) {
  if (!session || typeof session !== 'object') return null;
  const date = typeof session.date === 'string' ? session.date : new Date().toISOString();
  return {
    ...session,
    id: String(session.id || `session:migrated:${index}:${date}`),
    date,
  };
}

function migrateSessionHistory() {
  const legacy = read(KEYS.sessions, []);
  const sessions = (Array.isArray(legacy) ? legacy : []).map(normaliseSession).filter(Boolean);
  write(KEYS.sessionHistory, sessions);
  write(KEYS.sessionHistoryMeta, {
    schemaVersion: 1,
    migratedAt: new Date().toISOString(),
    migration: 'last-10-to-durable',
    recoveredSessions: sessions.length,
    retention: 'unbounded',
    sourceKey: KEYS.sessions,
  });
  markMigration('sessions.last-10-to-full-history.v1', {
    source: KEYS.sessions,
    imported: sessions.length,
    note: 'Existing sessions were copied into the uncapped canonical history. Sessions discarded by an older last-10 build cannot be recovered.',
  });
  return sessions;
}

// New builds read the canonical history. The old key is kept as a mirror so
// an exported snapshot can still be opened by an older Le Studio build.
export const getSessions = () => {
  const sessions = read(KEYS.sessionHistory, null);
  if (Array.isArray(sessions)) return sessions.map(normaliseSession).filter(Boolean);
  return migrateSessionHistory();
};

function normaliseReviewEvent(event, index = 0) {
  if (!event || typeof event !== 'object') return null;
  const reviewedAt = typeof event.reviewedAt === 'string'
    ? event.reviewedAt
    : typeof event.at === 'string' ? event.at : new Date().toISOString();
  const rating = String(event.rating || (event.correct === false ? 'again' : 'good'));
  return {
    ...event,
    schemaVersion: 2,
    kind: 'review',
    id: String(event.id || `review:migrated:${index}:${reviewedAt}`),
    reviewedAt,
    itemId: String(event.itemId || 'unknown'),
    skill: pulseSkill(event.skill),
    mode: String(event.mode || 'receptive'),
    rating,
    correct: event.correct == null ? rating !== 'again' : Boolean(event.correct),
    elapsedMs: Number.isFinite(Number(event.elapsedMs)) ? Math.max(0, Number(event.elapsedMs)) : 0,
    source: String(event.source || 'srs'),
  };
}

const REVIEW_EVENT_CAP = 2000;

export const getReviewEvents = () => {
  const raw = read(KEYS.reviewEvents, []);
  return (Array.isArray(raw) ? raw : []).map(normaliseReviewEvent).filter(Boolean);
};

export const getStudyEvents = () => {
  const events = read(KEYS.studyEvents, []);
  return Array.isArray(events) ? events : [];
};

export const getSessionHistoryMeta = () => read(KEYS.sessionHistoryMeta, null);

function normalisePracticeMode(value) {
  const mode = String(value || '').toLowerCase();
  if (mode === 'vocab' || mode === 'vocabulary' || mode === 'cards' || mode === 'receptive' || mode === 'productive') return 'vocabulary';
  if (mode === 'grammar') return 'grammar';
  if (mode === 'listening' || mode === 'dictation') return 'listening';
  if (mode === 'pronunciation' || mode === 'phoneme' || mode === 'shadow' || mode === 'shadowing') return 'pronunciation';
  if (mode === 'writing') return 'writing';
  if (mode === 'speaking' || mode === 'conversation') return 'speaking';
  if (mode === 'reading') return 'reading';
  return mode || 'vocabulary';
}

export function recordStudyEvent(event = {}) {
  if (!event || typeof event !== 'object') return null;
  const at = typeof event.at === 'string' ? event.at : new Date().toISOString();
  const events = getStudyEvents();
  const stored = {
    ...event,
    kind: event.kind || 'study',
    id: String(event.id || `study:${at}:${Math.random().toString(36).slice(2, 8)}`),
    at,
  };
  events.push(stored);
  write(KEYS.studyEvents, events.length > REVIEW_EVENT_CAP ? events.slice(-REVIEW_EVENT_CAP) : events);
  return stored;
}

function isoOrNow(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
    ? value
    : new Date().toISOString();
}

function pulseSkill(value) {
  const mode = normalisePracticeMode(value);
  return mode === 'grammar' || mode === 'listening' || mode === 'reading' ? mode : mode === 'pronunciation' ? 'speaking' : 'vocab';
}


export function recordReviewEvent(event = {}) {
  const reviewedAt = isoOrNow(event.reviewedAt || event.at);
  const mode = normalisePracticeMode(event.mode || event.skill);
  const itemId = String(event.itemId || event.cardId || event.gapKey || 'unknown');
  const record = {
    ...(event && typeof event === 'object' ? event : {}),
    kind: event.kind || 'review',
    id: String(event.id || `review:${Date.now()}:${itemId}:${Math.random().toString(36).slice(2, 8)}`),
    reviewedAt,
    itemId,
    mode,
    skill: event.skill || pulseSkill(mode),
  };
  const events = getReviewEvents();
  events.push(record);
  write(KEYS.reviewEvents, events);
  publishPulseHistory();
  return record;
}

// ---- persistent learner error model --------------------------------------
// One local model joins mistakes from conversation, grammar, vocabulary,
// listening, pronunciation, writing, and reading. The raw review stream keeps
// the evidence; this table keeps the durable, actionable summary.

const LEARNER_ERROR_SCHEMA = 1;
const RECYCLE_MODES = {
  grammar: ['grammar', 'speaking'],
  vocabulary: ['vocabulary', 'speaking'],
  listening: ['listening', 'dictation'],
  pronunciation: ['pronunciation', 'speaking'],
  speaking: ['speaking', 'grammar'],
  writing: ['writing', 'grammar'],
  reading: ['reading', 'vocabulary'],
};

function clampScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function compactText(value, length = 180) {
  return String(value || '').trim().slice(0, length);
}

function compactContext(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 8)) {
    if (item == null || typeof item === 'boolean' || typeof item === 'number') out[key] = item;
    else if (typeof item === 'string') out[key] = item.slice(0, 180);
    else if (Array.isArray(item)) out[key] = item.slice(0, 8).map((x) => String(x).slice(0, 80));
  }
  return Object.keys(out).length ? out : null;
}

function errorKey(mode, key) {
  return `${mode}:${compactText(key, 120)}`;
}

export const getLedgerErrors = () => {
  const raw = read(KEYS.evidenceLedger, []);
  const entries = Array.isArray(raw) ? raw : raw && Array.isArray(raw.entries) ? raw.entries : [];
  return entries.filter((entry) => entry && entry.key && entry.mode).map((entry) => ({
    schemaVersion: LEARNER_ERROR_SCHEMA,
    ...entry,
    mode: normalisePracticeMode(entry.mode),
    key: compactText(entry.key, 120),
    label: compactText(entry.label || entry.key, 180),
  }));
};

function writeLedgerErrors(entries) {
  // Error summaries are deliberately generous; unlike the old recent-session
  // window, this does not discard the learner's durable pattern history.
  write(KEYS.evidenceLedger, entries);
}

function errorPriority(entry) {
  const ageDays = Math.max(0, (Date.now() - new Date(entry.lastErrorAt || entry.lastAt || 0).getTime()) / 86400000);
  const recency = Math.max(0, 1 - ageDays / 45);
  const active = entry.status === 'active' ? 3 : entry.status === 'recovering' ? 1 : 0;
  return Math.round((entry.errorCount * 2 + entry.recurrenceCount * 3 + active + recency) * 100) / 100;
}

const ERROR_RECYCLE_DAYS = [1, 3, 7, 14, 30];
function errorRecycleAt(entry, from = entry?.lastErrorAt) {
  if (entry?.nextReviewAt) return entry.nextReviewAt;
  if (!from) return null;
  const successes = Math.max(0, Number(entry.successCount) || 0);
  const days = ERROR_RECYCLE_DAYS[Math.min(ERROR_RECYCLE_DAYS.length - 1, successes)];
  return new Date(new Date(from).getTime() + days * 86400000).toISOString();
}

export function recordLedgerError({ mode, key, label, score = 0, source = 'practice', context = null, sessionId = null, encounterId = null, activityId = null } = {}) {
  const normalisedMode = normalisePracticeMode(mode);
  const cleanKey = compactText(key, 120);
  if (!cleanKey) return null;
  const now = new Date().toISOString();
  const list = getLedgerErrors();
  let entry = list.find((item) => item.mode === normalisedMode && item.key === cleanKey);
  if (!entry) {
    entry = {
      schemaVersion: LEARNER_ERROR_SCHEMA,
      id: errorKey(normalisedMode, cleanKey),
      mode: normalisedMode,
      key: cleanKey,
      label: compactText(label || cleanKey),
      firstSeen: now,
      lastAt: now,
      lastErrorAt: now,
      lastSuccessAt: null,
      errorCount: 0,
      successCount: 0,
      attempts: 0,
      recurrenceCount: 0,
      lastScore: 0,
      lastSource: source,
      nextReviewAt: null,
      status: 'active',
      context: null,
    };
    list.unshift(entry);
  } else if (entry.lastSuccessAt && new Date(entry.lastSuccessAt).getTime() <= Date.now()) {
    entry.recurrenceCount = (entry.recurrenceCount || 0) + 1;
  }
  entry.label = compactText(label || entry.label || cleanKey);
  entry.lastAt = now;
  entry.lastErrorAt = now;
  entry.errorCount = (entry.errorCount || 0) + 1;
  entry.attempts = (entry.attempts || 0) + 1;
  entry.lastScore = clampScore(score);
  entry.lastSource = compactText(source || 'practice', 80);
  entry.context = compactContext(context);
  const delayDays = ERROR_RECYCLE_DAYS[Math.min(ERROR_RECYCLE_DAYS.length - 1, Number(entry.successCount) || 0)];
  entry.nextReviewAt = new Date(Date.now() + delayDays * 86400000).toISOString();
  entry.status = 'active';
  // Evidence provenance (optional): kept on the entry so downstream tooling
  // can audit WHERE a success/mistake came from.
  if (encounterId) entry.lastEncounterId = compactText(encounterId, 80);
  if (sessionId) entry.lastSessionId = compactText(sessionId, 80);
  if (activityId) entry.lastActivityId = compactText(activityId, 80);
  writeLedgerErrors(list);
  return entry;
}

export function recordLedgerSuccess({ mode, key, label, score = 100, source = 'practice', context = null, sessionId = null, encounterId = null, activityId = null } = {}) {
  const normalisedMode = normalisePracticeMode(mode);
  const cleanKey = compactText(key, 120);
  if (!cleanKey) return null;
  const list = getLedgerErrors();
  const entry = list.find((item) => item.mode === normalisedMode && item.key === cleanKey);
  if (!entry) return null;
  const now = new Date().toISOString();
  entry.label = compactText(label || entry.label || cleanKey);
  entry.lastAt = now;
  entry.lastSuccessAt = now;
  entry.successCount = (entry.successCount || 0) + 1;
  entry.attempts = (entry.attempts || 0) + 1;
  entry.lastScore = clampScore(score);
  entry.lastSource = compactText(source || 'practice', 80);
  entry.context = compactContext(context);
  const delayDays = ERROR_RECYCLE_DAYS[Math.min(ERROR_RECYCLE_DAYS.length - 1, Number(entry.successCount) || 0)];
  entry.nextReviewAt = new Date(Date.now() + delayDays * 86400000).toISOString();
  entry.status = entry.successCount >= 2 && entry.successCount >= entry.errorCount ? 'resolved' : 'recovering';
  if (encounterId) entry.lastEncounterId = compactText(encounterId, 80);
  if (sessionId) entry.lastSessionId = compactText(sessionId, 80);
  if (activityId) entry.lastActivityId = compactText(activityId, 80);
  writeLedgerErrors(list);
  return entry;
}

function recordGapOutcome({ mode, key, label, score = 0, source, context, event = true, sessionId = null, encounterId = null, activityId = null }) {
  const provenance = { sessionId, encounterId, activityId };
  const result = clampScore(score) >= 80
    ? recordLedgerSuccess({ mode, key, label, score, source, context, ...provenance })
    : recordLedgerError({ mode, key, label, score, source, context, ...provenance });
  if (event) {
    recordReviewEvent({
      kind: 'assessment',
      mode,
      itemId: key,
      gapKey: key,
      label: compactText(label || key),
      score: clampScore(score),
      correct: clampScore(score) >= 80,
      source,
      context: compactContext(context),
    });
  }
  return result;
}

export function recordGrammarGap(topicId, { score = 0, source = 'grammar', context = null, sessionId = null, encounterId = null, activityId = null } = {}) {
  return recordGapOutcome({ mode: 'grammar', key: topicId, label: topicId, score, source, context, sessionId, encounterId, activityId });
}

export function recordVocabularyGap(itemId, { label = itemId, score = 0, source = 'vocabulary', context = null, event = false, sessionId = null, encounterId = null, activityId = null } = {}) {
  return recordGapOutcome({ mode: 'vocabulary', key: itemId, label, score, source, context, event, sessionId, encounterId, activityId });
}

export function recordListeningGap(itemId, { label = itemId, score = 0, source = 'listening', context = null, sessionId = null, encounterId = null, activityId = null } = {}) {
  return recordGapOutcome({ mode: 'listening', key: itemId, label, score, source, context, sessionId, encounterId, activityId });
}

export function recordPronunciationGap(itemId, { label = itemId, score = 0, source = 'pronunciation', context = null, sessionId = null, encounterId = null, activityId = null } = {}) {
  return recordGapOutcome({ mode: 'pronunciation', key: itemId, label, score, source, context, sessionId, encounterId, activityId });
}

export function recordSpeakingGap(itemId, { label = itemId, score = 0, source = 'speaking', context = null, sessionId = null, encounterId = null, activityId = null } = {}) {
  return recordGapOutcome({ mode: 'speaking', key: itemId, label, score, source, context, sessionId, encounterId, activityId });
}

export function recordWritingGap(itemId, { label = itemId, score = 0, source = 'writing', context = null, sessionId = null, encounterId = null, activityId = null } = {}) {
  return recordGapOutcome({ mode: 'writing', key: itemId, label, score, source, context, sessionId, encounterId, activityId });
}

export function getEvidenceLedgerModel() {
  return getLedgerErrors()
    .map((entry) => ({
      ...entry,
      priority: errorPriority(entry),
      recycleModes: RECYCLE_MODES[entry.mode] || [entry.mode],
    }))
    .sort((a, b) => b.priority - a.priority || b.errorCount - a.errorCount || (a.lastAt < b.lastAt ? 1 : -1));
}

export function getErrorModelSummary() {
  const entries = getLedgerErrors();
  const byMode = {};
  for (const entry of entries) byMode[entry.mode] = (byMode[entry.mode] || 0) + 1;
  return {
    total: entries.length,
    active: entries.filter((entry) => entry.status === 'active').length,
    recovering: entries.filter((entry) => entry.status === 'recovering').length,
    resolved: entries.filter((entry) => entry.status === 'resolved').length,
    recurrences: entries.reduce((sum, entry) => sum + (entry.recurrenceCount || 0), 0),
    byMode,
  };
}

export function getCrossModePracticeQueue(limit = 12) {
  return getEvidenceLedgerModel()
    .filter((entry) => entry.status !== 'resolved')
    .slice(0, Math.max(0, limit));
}

/** Errors become deliberate delayed retests instead of immediate recognition drills. */
export function getDelayedErrorQueue(limit = 12, nowMs = Date.now()) {
  return getEvidenceLedgerModel()
    .filter((entry) => entry.status !== 'resolved')
    .map((entry) => ({ ...entry, nextReviewAt: errorRecycleAt(entry) }))
    .filter((entry) => entry.nextReviewAt && new Date(entry.nextReviewAt).getTime() <= nowMs)
    .slice(0, Math.max(0, limit));
}

export const getCrossModeMistakeQueue = getCrossModePracticeQueue;

function speakingRecord(session, index) {
  const report = session?.report || {};
  const startedAt = session?.startedAt || session?.date;
  if (typeof startedAt !== 'string') return null;
  const durationMs = Number(report.durationMs ?? report.duration_ms ?? session.durationMs ?? 0);
  return {
    kind: 'speaking',
    id: String(session.id || `session:${session.scenarioId || 'unknown'}:${session.date || index}`),
    startedAt,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
    ...(typeof report.pronunciationScore === 'number' ? { pronunciationScore: report.pronunciationScore } : {}),
    ...(typeof report.pronunciation_score === 'number' ? { pronunciationScore: report.pronunciation_score } : {}),
    ...(typeof report.fluencyScore === 'number' ? { fluencyScore: report.fluencyScore } : {}),
    ...(typeof report.fluency_score === 'number' ? { fluencyScore: report.fluency_score } : {}),
    ...(typeof report.wordsSpoken === 'number' ? { wordsSpoken: report.wordsSpoken } : {}),
    promptCount: Number.isFinite(Number(session.turns)) ? Math.max(0, Number(session.turns)) : 0,
    ...(typeof session.topic === 'string' ? { topic: session.topic } : {}),
  };
}

function publishPulseHistory() {
  if (!readPulseOptIn()) return;
  const records = getSessions().map(speakingRecord).filter(Boolean).concat(getReviewEvents()).slice(-REVIEW_EVENT_CAP);
  write(KEYS.pulseHistory, {
    format: 'le-studio.source-history',
    schemaVersion: 2,
    source: 'le-studio-french',
    connectorVersion: '2.0.0',
    generatedAt: new Date().toISOString(),
    records,
    cursor: null,
  });
}

// ---- in-flight conversation (survives a page refresh) ----

export const getActiveSession = () => read(KEYS.active, null);
export const setActiveSession = (scenarioId, history) =>
  write(KEYS.active, { scenarioId, history });
export const clearActiveSession = () => localStorage.removeItem(KEYS.active);

// The most recent report powers the Home dashboard's "Today's focus".
export function getLastReport() {
  const sessions = getSessions();
  return sessions.length ? sessions[sessions.length - 1] : null;
}

export function saveSession(summary) {
  const sessions = getSessions();
  const saved = {
    ...summary,
    id: summary.id || `session:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
  };
  sessions.push(saved);
  // Canonical history is intentionally uncapped. The legacy last-10 key is
  // NOT mirrored any more: rewriting the full history on every save doubled
  // the largest store's quota cost for a compat nobody needs (the app has
  // moved to its own repo; exports carry the canonical key).
  write(KEYS.sessionHistory, sessions);
  recordStudyEvent({
    type: 'session.completed',
    sessionId: saved.id,
    scenarioId: saved.scenarioId || null,
    turns: saved.turns || 0,
    score: saved.report?.average_scores?.overall ?? null,
  });
  publishPulseHistory();
  // Initialise the learner model before adding this report's habits, so the
  // one-time legacy import cannot count the same new habit twice.
  getLearnerErrorModel();
  recordHabits(summary.report?.stubborn_habits || []);
  for (const habit of summary.report?.stubborn_habits || []) {
    const label = String(habit || '').trim();
    if (label) recordLearnerError({
      category: 'grammar',
      key: `habit:${label.toLowerCase().replace(/\s+/g, '-').slice(0, 80)}`,
      label,
      mode: 'conversation',
      source: 'session-report',
      detail: 'Recurring habit reported at the end of a conversation.',
    });
  }
  bumpStreak();
}

// ---- last activity (Home's "continue where you left off") ----

export const getLastActivity = () => read(KEYS.lastActivity, null);

export function setLastActivity(type, id, label) {
  write(KEYS.lastActivity, { type, id: id || null, label, at: new Date().toISOString() });
}

// ---- getting-started checklist (Home) ----

export const isGettingStartedDismissed = () => read(KEYS.gettingStarted, null) === '1';
export const dismissGettingStarted = () => write(KEYS.gettingStarted, '1');

// ---- grammar-error categories (Arena classifications, for Analytics) ----

export const getGrammarErrors = () => read(KEYS.grammarErrors, {});

export function recordGrammarError(topicId, { mode = 'conversation', score = null, label = null, detail = null } = {}) {
  // See saveSession: initialise before mutating a legacy source that the
  // migration also knows how to import.
  getLearnerErrorModel();
  const all = getGrammarErrors();
  all[topicId] = (all[topicId] || 0) + 1;
  write(KEYS.grammarErrors, all);
  recordLearnerError({
    category: 'grammar',
    key: topicId,
    label: label || topicId,
    mode,
    score,
    source: 'grammar-classification',
    detail,
  });
  recordGrammarGap(topicId, { source: 'conversation' });
  recordLanguageEvidence(topicId, { outcome: 'slip', source: 'conversation' });
  return all[topicId];
}

export function recordVocabularyOutcome(cardKey, outcome, { mode = 'receptive', score = null, label = null, source = 'srs', sessionId = null, encounterId = null, activityId = null } = {}) {
  const entry = getLearnerErrors({ limit: 240 }).find((e) => e.id === `vocabulary:${cardKey}`);
  if (!entry && outcome !== 'error') return null;
  if (outcome === 'error') {
    return recordLearnerError({
      category: 'vocabulary',
      key: cardKey,
      label: label || cardKey,
      mode,
      score,
      source,
    });
  }
  return recordLearnerSuccess({
    category: 'vocabulary',
    key: cardKey,
    mode,
    score,
    source,
    // Evidence identity: distinct encounters accumulate toward resolution;
    // re-answering the same presentation never does (see learnerErrors.js).
    sessionId,
    encounterId,
    activityId: activityId || cardKey,
  });
}

export function getLearnerErrorModel() {
  return _storeGetLearnerErrorModel();
}

// ---- persistent learner weakness memory (moat) ----
// error occurs → repair → later scenario deliberately tests it → recurrence
// Each entry tracks a grammar topic that has actually been mis-used in the Arena.
// Tiny, bounded, and fully local — carries inside the fp.* snapshot export.
const WEAKNESS_CAP = 30;
const RETEST_LADDER_DAYS = [1, 3, 7, 14]; // spaced retests after a repair
function clampTopicId(id) { return String(id || '').slice(0, 64); }
export const getWeaknessMemory = () => {
  const raw = read(KEYS.weaknessMemory, []);
  if (!Array.isArray(raw)) return [];
  // Status is always DERIVED from the retest evidence at read time, never
  // trusted from storage. This is what makes the legacy migration safe: an
  // old build could store status 'resolved' from two same-session passes —
  // under the identity-aware rule that evidence is not independent, so the
  // entry reads back as 'recovering' (legacy data is preserved, but unknown
  // identity never invents independence).
  return raw.map((e) => (e && typeof e === 'object' ? { ...e, status: weaknessRecoveryStatus(e) } : e));
};
function writeWeakness(list) { write(KEYS.weaknessMemory, list.slice(0, WEAKNESS_CAP)); }
function nextRetestDelay(repairCount) {
  const i = Math.min(Math.max(0, (repairCount || 0) - 1), RETEST_LADDER_DAYS.length - 1);
  return RETEST_LADDER_DAYS[i] * 86400000;
}
// Recovery status from a weakness's retest history, under the independence
// rule: a weakness resolves only from ONE genuine delayed independent recall
// (a scheduled retest that came due) or from successful recalls of DISTINCT
// encounters (different presentations, never re-answers of the same drill).
// Legacy retest records carry no identity — they are real dated successes, so
// they keep the weakness 'recovering', but they can never be combined into a
// resolution: unknown evidence must never invent independence. `recoverySeq`
// bounds the window (a monotonic per-entry counter, immune to same-
// millisecond timestamp collisions): a recurrence restarts recovery, so only
// retests recorded AFTER the last error can count.
function weaknessRecoveryStatus(e) {
  const fromSeq = e.recoverySeq || 0;
  // Legacy records carry no seq — they predate the window counter entirely,
  // so they are always inside it (a pre-identity pass is real dated success
  // evidence; it keeps the weakness 'recovering' but can never resolve, see
  // below). Sealed windows only exclude records the counter has actually seen.
  const passes = (e.retests || []).filter((r) => r && r.passed && (r.seq == null || r.seq > fromSeq));
  if (passes.some((r) => r.delayed === true)) return 'resolved';
  const encounters = new Set(passes.map((r) => r.encounterId).filter(Boolean));
  if (encounters.size >= 2) return 'resolved';
  return passes.length ? 'recovering' : 'active';
}
export function recordWeaknessError(topicId, { scenarioId = null } = {}) {
  const id = clampTopicId(topicId);
  if (!id) return null;
  getLearnerErrorModel();
  const now = new Date().toISOString();
  const list = getWeaknessMemory();
  let e = list.find((x) => x.topicId === id);
  if (!e) {
    e = { topicId: id, firstSeen: now, lastErrorAt: now, errorCount: 1, lastRepairAt: null, repairCount: 0, retestDueAt: null, retests: [], status: 'active', lastScenarioId: scenarioId, recoveryFrom: now, recoverySeq: 0, seq: 0 };
    list.unshift(e);
  } else {
    e.lastErrorAt = now;
    e.errorCount = (e.errorCount || 0) + 1;
    e.status = 'active';
    // Recurrence: a new error after a previous repair/retest is the signal we measure
    if (e.retests && e.retests.length) {
      const last = e.retests[e.retests.length - 1];
      if (last && last.passed) e.recurrenceCount = (e.recurrenceCount || 0) + 1;
    }
    if (scenarioId) e.lastScenarioId = scenarioId;
    // A new slip cancels any scheduled retest AND restarts recovery: earlier
    // passes must never re-resolve a weakness that just recurred.
    e.recoveryFrom = now;
    e.recoverySeq = e.seq || 0;
    e.retestDueAt = null;
  }
  writeWeakness(list);
  return e;
}
export function recordWeaknessRepair(topicId, { scenarioId = null, sessionId = null, encounterId = null, activityId = null, passed = true } = {}) {
  const id = clampTopicId(topicId);
  if (!id) return null;
  const now = new Date().toISOString();
  const list = getWeaknessMemory();
  let e = list.find((x) => x.topicId === id);
  if (!e) {
    e = { topicId: id, firstSeen: now, lastErrorAt: now, errorCount: 0, lastRepairAt: now, repairCount: 1, retestDueAt: new Date(Date.now() + nextRetestDelay(1)).toISOString(), retests: [{ at: now, seq: 1, scenarioId, sessionId, encounterId, activityId, passed, delayed: false }], status: passed ? 'recovering' : 'active', recoveryFrom: now, recoverySeq: 0, seq: 1 };
    list.unshift(e);
  } else {
    e.lastRepairAt = now;
    e.repairCount = (e.repairCount || 0) + 1;
    e.retestDueAt = new Date(Date.now() + nextRetestDelay(e.repairCount)).toISOString();
    // A repair is a same-session re-answer of the drill that produced the
    // error: real success evidence (it schedules the spaced retest), but its
    // independence comes only from a DISTINCT encounterId — re-answers of
    // the same encounter dedupe in weaknessRecoveryStatus.
    e.retests = [...(e.retests || []), { at: now, seq: (e.seq || 0) + 1, scenarioId, sessionId, encounterId, activityId, passed, delayed: false }].slice(-12);
    e.seq = (e.seq || 0) + 1;
    e.status = passed ? weaknessRecoveryStatus(e) : 'active';
  }
  writeWeakness(list);
  if (passed) {
    recordLearnerSuccess({
      category: 'grammar',
      key: id,
      label: id,
      mode: 'conversation',
      source: 'weakness-retest',
      score: 80,
      detail: scenarioId ? `Repair in scenario ${scenarioId}.` : 'Repair attempt.',
      sessionId,
      encounterId,
      activityId: activityId || scenarioId,
    });
  }
  return e;
}
export function recordWeaknessRetestResult(topicId, passed, { scenarioId = null, sessionId = null, encounterId = null, activityId = null, delayed = true } = {}) {
  const id = clampTopicId(topicId);
  if (!id) return null;
  getLearnerErrorModel();
  const now = new Date().toISOString();
  const list = getWeaknessMemory();
  const e = list.find((x) => x.topicId === id);
  if (!e) return null;
  // A scheduled retest is a genuine delayed independent recall by
  // construction (delayed defaults true); callers may pass encounter identity
  // so repeated answers to the same retest presentation cannot double-count.
  e.retests = [...(e.retests || []), { at: now, seq: (e.seq || 0) + 1, scenarioId, sessionId, encounterId, activityId, passed, delayed: Boolean(delayed) }].slice(-12);
  e.seq = (e.seq || 0) + 1;
  if (passed) {
    e.repairCount = (e.repairCount || 0) + 1;
    e.lastRepairAt = now;
    e.retestDueAt = new Date(Date.now() + nextRetestDelay(e.repairCount)).toISOString();
    e.status = weaknessRecoveryStatus(e);
  } else {
    e.lastErrorAt = now;
    e.errorCount = (e.errorCount || 0) + 1;
    e.recurrenceCount = (e.recurrenceCount || 0) + 1;
    e.status = 'active';
    e.retestDueAt = null;
    e.recoveryFrom = now; // recurrence restarts recovery
    e.recoverySeq = e.seq || 0;
  }
  writeWeakness(list);
  if (passed) {
    recordLearnerSuccess({
      category: 'grammar',
      key: id,
      label: id,
      mode: 'conversation',
      source: 'weakness-retest',
      score: 80,
      delayed: Boolean(delayed),
      sessionId,
      encounterId,
      activityId: activityId || scenarioId,
    });
  } else {
    recordLearnerError({ category: 'grammar', key: id, label: id, mode: 'conversation', source: 'weakness-retest', score: 0 });
  }
  return e;
}
export function getDueWeaknesses(nowMs = Date.now()) {
  return getWeaknessMemory()
    .filter((e) => e && e.status !== 'resolved' && e.retestDueAt && new Date(e.retestDueAt).getTime() <= nowMs)
    .sort((a, b) => new Date(a.retestDueAt) - new Date(b.retestDueAt));
}
export function getWeaknessSummary() {
  const list = getWeaknessMemory();
  const byStatus = { active: 0, recovering: 0, resolved: 0 };
  let retests = 0, recurrences = 0;
  for (const e of list) {
    if (e.status in byStatus) byStatus[e.status] += 1;
    retests += (e.retests || []).length;
    recurrences += e.recurrenceCount || 0;
  }
  const recurrenceRate = retests ? Math.round((recurrences / retests) * 100) / 100 : null;
  return { total: list.length, byStatus, retests, recurrences, recurrenceRate, due: getDueWeaknesses().length };
}

// ---- recurring mistake bank ----
// Stubborn habits from each report accumulate across sessions so patterns
// ("you've hit this 4 times") become visible instead of being overwritten.

const habitKey = (text) =>
  String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);

export const getHabits = () => read(KEYS.habits, []);

// A compact profile of the learner for the AI tutor & characters — their name
// and preferences, plus the mistakes and weak grammar areas the app has
// actually observed, so replies are personal and context-aware rather than
// generic. Everything here is already stored locally.
// ---- explicit learner model (7.9 → 9+) ----
// Aggregates vocab recall, grammar, pronunciation, hesitation, sentence patterns
// into one inspectable snapshot. All pure, offline.
export function getLearnerModel() {
  const srs = getSrs();
  const habits = getHabits();
  const grammar = getGrammarProgress();
  const metrics = getMetrics();
  const xpLog = getXpLog();
  const notebook = getNotebook();
  const sessions = getSessions();
  // vocab recall buckets from memory helpers
  const vocabRecall = {
      strong: Object.values(srs).filter(s=> (s.interval||0)>=7).length,
      fading: Object.values(srs).filter(s=> (s.interval||0)>=1 && (s.interval||0)<7).length,
      atRisk: Object.values(srs).filter(s=> s.lastRating==='again').length,
      fresh: Object.values(srs).filter(s=> !s.lastReviewed).length,
    };
  const errHist = getGrammarErrors();
  const pronun = metrics.filter(m=> m.skill==='pronunciation').slice(-20);
  const avgPronun = pronun.length ? Math.round(pronun.reduce((a,b)=>a+b.score,0)/pronun.length) : null;
  const errorSummary = getLearnerErrorSummary();
  const errorGaps = getLearnerErrors({ limit: 6 });
  return {
    srsSize: Object.keys(srs).length,
    vocabRecall,
    habits: habits.slice(0,5),
    grammar,
    errHist,
    errorSummary,
    errorGaps,
    pronunciation: { avg: avgPronun, n: pronun.length },
    sessions: sessions.length,
    notebook: notebook.length,
    xpLogDays: Object.keys(xpLog).length,
  };
}
export function getLearnerBrief() {
  const mistakes = getHabits().filter((h) => (h.count || 0) > 1).slice(0, 3).map((h) => h.text);
  const weakGrammar = Object.entries(getGrammarErrors())
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topic]) => topic);
  const errorQueue = getCrossModePracticeQueue(3).map((entry) => ({
    mode: entry.mode,
    label: entry.label,
    errors: entry.errorCount,
    recurrences: entry.recurrenceCount,
    recycleModes: entry.recycleModes,
  }));
  const prefs = getPrefs();
  const settings = getSettings();
  // Retest intent: nudge the tutor toward the next due weakness (if any)
  const due = getDueWeaknesses()[0] || null;
  const memory = due ? { focusTopic: due.topicId, status: due.status, errorCount: due.errorCount } : null;
  const errorGaps = getLearnerErrors({ limit: 5 });
  return {
    name: String(getSettings().name || '').slice(0, 40),
    topics: (prefs.favouriteTopics || []).slice(0, 4),
    mistakes,
    weakGrammar,
    errorQueue,
    delayedErrorQueue: getDelayedErrorQueue(3).map((entry) => ({
      mode: entry.mode,
      label: entry.label,
      errors: entry.errorCount,
      recurrences: entry.recurrenceCount,
      recycleModes: entry.recycleModes,
    })),
    correctionFrequency: settings.correctionFrequency,
    memory,
    errorGaps: errorGaps.map((entry) => ({
      category: entry.category,
      key: entry.key,
      label: entry.label,
      status: entry.status,
      errors: entry.errorCount,
      modes: entry.modes,
    })),
    recyclingInstruction: errorGaps.length
      ? `Recycle these persistent gaps naturally across the next practice: ${errorGaps.map((entry) => `${entry.category} — ${entry.label}`).join('; ')}.`
      : null,
  };
}

function recordHabits(habitTexts) {
  const habits = getHabits();
  const now = new Date().toISOString();
  for (const text of habitTexts) {
    const key = habitKey(text);
    if (!key) continue;
    const existing = habits.find((h) => h.key === key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      existing.text = String(text); // keep the freshest wording
    } else {
      habits.push({ text: String(text), key, count: 1, lastSeen: now });
    }
  }
  habits.sort((a, b) => b.count - a.count || (a.lastSeen < b.lastSeen ? 1 : -1));
  write(KEYS.habits, habits.slice(0, 20));
}

// ---- experience points (10 XP per point of overall turn score / 10) ----

export const getXp = () => read(KEYS.xp, 0);

export function getTodayXp() {
  const d = read(KEYS.xpDay, null);
  return d && d.day === dayStamp() ? d.amount : 0;
}

export function addXp(amount) {
  const gained = Math.max(0, Math.round(amount));
  const total = getXp() + gained;
  write(KEYS.xp, total);
  write(KEYS.xpDay, { day: dayStamp(), amount: getTodayXp() + gained });
  logDailyXp(gained);
  return total;
}

// ---- daily XP history (learning calendar + weekly goal) ----

export const getXpLog = () => read(KEYS.xpLog, {});

function logDailyXp(gained) {
  if (gained <= 0) return;
  const log = getXpLog();
  const today = dayStamp();
  log[today] = (log[today] || 0) + gained;
  const cutoff = dayStamp(new Date(Date.now() - 400 * 86400000));
  for (const day of Object.keys(log)) if (day < cutoff) delete log[day];
  write(KEYS.xpLog, log);
}

// XP earned Monday→today of the current week.
export function getWeekXp() {
  const log = getXpLog();
  const now = new Date();
  const monday = new Date(now.getTime() - ((now.getDay() + 6) % 7) * 86400000);
  const start = dayStamp(monday);
  return Object.entries(log).reduce((sum, [day, xp]) => (day >= start ? sum + xp : sum), 0);
}

// ---- time studied (seconds per day; drives Analytics) ----

export const getTimeLog = () => read(KEYS.timeLog, {});

export function addStudyTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (!s) return;
  const log = getTimeLog();
  const today = dayStamp();
  log[today] = (log[today] || 0) + s;
  const cutoff = dayStamp(new Date(Date.now() - 400 * 86400000));
  for (const day of Object.keys(log)) if (day < cutoff) delete log[day];
  write(KEYS.timeLog, log);
}

// ---- scored-activity metrics (per-skill scores for Analytics) ----

export const getMetrics = () => read(KEYS.metrics, []);

export function recordSkillScore(skill, score, meta = {}) {
  const n = Math.max(0, Math.min(100, Math.round(score)));
  getLearnerErrorModel();
  const metrics = getMetrics();
  metrics.push({ skill, score: n, at: new Date().toISOString(), ...(meta && typeof meta === 'object' ? meta : {}) });
  write(KEYS.metrics, metrics.slice(-300));
  return metrics;
}

// One ingestion point for activity emitted by the UI. It keeps the raw event
// trail and turns low scores into durable, cross-mode gaps; the next mode can
// then see the same learner state instead of starting from a blank slate.
export function recordLearningActivity(event = {}) {
  if (!event || typeof event !== 'object') return null;
  const at = typeof event.at === 'string' ? event.at : new Date().toISOString();
  // The raw trail gets session provenance too (the audit story wants to know
  // WHICH visit produced an event, even when the producer could not know).
  const stored = recordStudyEvent({ ...event, sessionId: event.sessionId || currentSessionId(), at, source: event.source || 'activity' });
  const score = Number.isFinite(Number(event.score))
    ? Math.max(0, Math.min(100, Math.round(Number(event.score))))
    : Number.isFinite(Number(event.accuracy))
      ? Math.max(0, Math.min(100, Math.round(Number(event.accuracy))))
      : null;
  const signal = {
    mode: event.mode || event.type || 'practice',
    score,
    source: 'activity-event',
    detail: event.detail || null,
    // Evidence identity rides through: the activity producers stamp which
    // session/encounter/drill produced this event, and the recovery loop
    // needs that provenance intact to tell distinct encounters apart.
    sessionId: event.sessionId || currentSessionId(),
    encounterId: event.encounterId || null,
    activityId: event.activityId || null,
  };
  // Every scored skill feeds the SAME recovery loop — reading and writing
  // included — so a weakness surfaced in one mode is repaired by whichever
  // mode best targets it. Same-session outcomes are marked delayed:false;
  // spaced modes (cards, retype, weakness retests) mark themselves delayed.
  const applyGap = (category, key, label) => {
    if (score == null) return;
    // No `delayed` stamp: evidenceStrength infers same-session vs delayed
    // from the entry's last mistake date, so a same-day correction counts as
    // weaker evidence and a later-day one as the retention proof.
    const gap = { ...signal, category, key, label };
    if (score < 80) recordLearnerError(gap, { at });
    else recordLearnerSuccess(gap, { at });
  };
  if (event.type === 'dictation') {
    applyGap('listening', 'dictation', 'Dictée listening accuracy');
  } else if (event.type === 'listening') {
    applyGap('listening', `track:${event.trackId || 'listening'}`, event.label || event.trackId || 'Listening comprehension');
  } else if (event.type === 'pronunciation') {
    // Canonical aggregate key: Today's pronunciation drill producer hunts
    // 'pronunciation:pronunciation' (a per-mode key could never match).
    applyGap('pronunciation', 'pronunciation', event.label || 'Pronunciation clarity');
  } else if (event.type === 'speaking' || event.type === 'quickfire') {
    // Quickfire flows freely (no right/wrong), so it only counts when a score
    // exists; exam speaking reports come through the same branch.
    applyGap('speaking', 'speaking', event.label || 'Speaking confidence');
  } else if (event.type === 'grammar') {
    applyGap('grammar', event.topicId || 'grammar', event.label || event.topicId || 'Grammar accuracy');
  } else if (event.type === 'writing') {
    applyGap('writing', 'writing', event.label || 'Written accuracy');
  } else if (event.type === 'reading') {
    applyGap('reading', 'reading', event.label || 'Reading comprehension');
  }
  return stored;
}

// ---- habit tracker (user-defined daily habits with per-habit streaks) ----

const DEFAULT_HABITS = [
  { id: 'h-speak', name: 'Speak French out loud' },
  { id: 'h-review', name: 'Review my flashcards' },
  { id: 'h-listen', name: 'Listen to something in French' },
];

export function getHabitTracker() {
  const t = read(KEYS.habitTracker, null);
  if (t && Array.isArray(t.list)) return t;
  return { list: DEFAULT_HABITS, done: {} };
}

export function addHabit(name) {
  const t = getHabitTracker();
  const id = `h-${Date.now()}`;
  t.list.push({ id, name: String(name).slice(0, 60) });
  write(KEYS.habitTracker, t);
  return t;
}

export function removeHabit(id) {
  const t = getHabitTracker();
  t.list = t.list.filter((h) => h.id !== id);
  delete t.done[id];
  write(KEYS.habitTracker, t);
  return t;
}

export function setHabitList(names) {
  const t = getHabitTracker();
  t.list = names.map((name, i) => ({ id: `h-${Date.now()}-${i}`, name: String(name).slice(0, 60) }));
  write(KEYS.habitTracker, t);
  return t;
}

export function toggleHabit(id, day = dayStamp()) {
  const t = getHabitTracker();
  t.done[id] ||= {};
  if (t.done[id][day]) delete t.done[id][day];
  else t.done[id][day] = true;
  write(KEYS.habitTracker, t);
  return t;
}

// ---- daily streak ----

// Day key in the user's local time — streaks, XP days and challenges roll
// over at local midnight, matching Word of the Day and the calendars.
const dayStamp = (d = new Date()) => d.toLocaleDateString('en-CA');

export const getStreak = () => {
  const s = read(KEYS.streak, { count: 0, lastDay: null });
  if (!s.lastDay) return s;
  const yesterday = dayStamp(new Date(Date.now() - 86400000));
  const twoDaysAgo = dayStamp(new Date(Date.now() - 2 * 86400000));
  // A single missed day can be covered by a streak freeze (consumed once —
  // afterwards lastDay reads as yesterday, so this branch won't re-fire).
  if (s.lastDay === twoDaysAgo && getFreezes() > 0) {
    write(KEYS.freezes, getFreezes() - 1);
    const repaired = { ...s, lastDay: yesterday, frozeYesterday: true };
    write(KEYS.streak, repaired);
    return repaired;
  }
  // Vacation mode: while active, missed days never break the streak —
  // lastDay is quietly rolled forward to yesterday.
  const vac = read(KEYS.vacation, null);
  if (s.lastDay !== dayStamp() && s.lastDay !== yesterday && vac && vac >= yesterday) {
    const kept = { ...s, lastDay: yesterday };
    write(KEYS.streak, kept);
    return kept;
  }
  // A streak survives until a full day is missed. When it breaks, remember
  // what was lost so a paid repair remains possible for a few days.
  if (s.lastDay !== dayStamp() && s.lastDay !== yesterday) {
    if (s.count > 0) write(KEYS.streak, { count: 0, lastDay: null, lostCount: s.count, lostAt: dayStamp() });
    return { count: 0, lastDay: s.lastDay, lostCount: s.count, lostAt: dayStamp() };
  }
  return s;
};

// ---- vacation mode & streak repair ----

export const REPAIR_COST = 300;
export const REPAIR_WINDOW_DAYS = 3;

export const getVacationUntil = () => read(KEYS.vacation, null);

// Start (days > 0) or end (days = 0/null) vacation mode.
export function setVacationDays(days) {
  if (!days) { write(KEYS.vacation, null); return null; }
  const until = dayStamp(new Date(Date.now() + days * 86400000));
  write(KEYS.vacation, until);
  return until;
}

// A broken streak can be bought back within REPAIR_WINDOW_DAYS.
export function getRepairableStreak() {
  const s = read(KEYS.streak, {});
  if (!s.lostCount || !s.lostAt) return null;
  const ageDays = Math.floor((Date.now() - new Date(s.lostAt).getTime()) / 86400000);
  return ageDays <= REPAIR_WINDOW_DAYS ? s.lostCount : null;
}

/** ISO week key (YYYY-Www) for free repair quota. */
function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** One free streak repair per calendar week (Plan 1 A2.2). */
export function canFreeRepairThisWeek() {
  const used = read('fp.freeRepairWeek', null);
  return used !== isoWeekKey();
}

export function repairStreak({ free = false } = {}) {
  const lost = getRepairableStreak();
  if (!lost) return null;
  if (free) {
    if (!canFreeRepairThisWeek()) return null;
    write('fp.freeRepairWeek', isoWeekKey());
  } else if (spendCoins(REPAIR_COST) == null) {
    return null;
  }
  const restored = { count: lost, lastDay: dayStamp(new Date(Date.now() - 86400000)) };
  write(KEYS.streak, restored);
  return restored;
}

// ---- streak freezes (bought with coins, max 2, auto-used) ----

export const FREEZE_COST = 150;
export const MAX_FREEZES = 2;

export const getFreezes = () => read(KEYS.freezes, 0);

export function buyFreeze() {
  if (getFreezes() >= MAX_FREEZES) return null;
  if (spendCoins(FREEZE_COST) == null) return null;
  const total = getFreezes() + 1;
  write(KEYS.freezes, total);
  return total;
}

function bumpStreak() {
  const today = dayStamp();
  const s = getStreak();
  if (s.lastDay === today) return;
  write(KEYS.streak, { count: s.count + 1, lastDay: today });
  bumpHouseholdStreak(today);
}

// ---- weekly practice target (Habit-style: a missed day never breaks this) ----

// Same rule as Habit's weeklyStreak: weeks that meet the days-per-week target
// extend the run, whatever the days. The current week is alive until it ends,
// so an unmet current week simply isn't counted yet — never a break, never a
// reset-to-zero. This is the product's headline rhythm; the daily count is
// just a number underneath it.

export const WEEKLY_DAYS_DEFAULT = 3;

export const getWeeklyDaysTarget = () => {
  const n = read(KEYS.weeklyDays, WEEKLY_DAYS_DEFAULT);
  return Number.isInteger(n) ? Math.max(1, Math.min(7, n)) : WEEKLY_DAYS_DEFAULT;
};

export function setWeeklyDaysTarget(n) {
  const num = Number(n);
  const v = Math.max(1, Math.min(7, Math.round(Number.isFinite(num) ? num : WEEKLY_DAYS_DEFAULT)));
  write(KEYS.weeklyDays, v);
  return v;
}

// Active days: any local-calendar day with real practice (XP earned, reviews
// done, or a saved session). Sorted unique YYYY-MM-DD.
export function getActiveDays() {
  const days = new Set();
  try {
    for (const [day, xp] of Object.entries(getXpLog())) {
      if (xp > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
    }
  } catch { /* logs unreadable — sessions below still count */ }
  try {
    for (const [day, count] of Object.entries(read(KEYS.reviewLog, {}))) {
      if (count > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
    }
  } catch { /* review log unreadable */ }
  try {
    for (const s of getSessions()) {
      const at = s?.date || s?.at || null;
      if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(at)) days.add(at.slice(0, 10));
    }
  } catch { /* sessions unreadable */ }
  return [...days].sort();
}

// Sunday-start week of a YYYY-MM-DD day — the same week rule as Habit, so the
// "same weekly-target rule" claim is literally the same arithmetic.
function sundayWeekStart(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const anchor = Date.UTC(y, m - 1, d);
  return new Date(anchor - new Date(anchor).getUTCDay() * 86400000).toISOString().slice(0, 10);
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}

export function getWeeklyPractice(targetPerWeek, todayIso) {
  const raw = targetPerWeek == null ? getWeeklyDaysTarget() : Number(targetPerWeek);
  const needed = Number.isFinite(raw) ? Math.max(1, Math.min(7, Math.round(raw))) : WEEKLY_DAYS_DEFAULT;
  const today = typeof todayIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayIso) ? todayIso : dayStamp();
  const active = getActiveDays().filter((d) => d <= today);
  const thisWeek = sundayWeekStart(today);
  const daysThisWeek = active.filter((d) => sundayWeekStart(d) === thisWeek).length;
  if (!active.length) return { daysThisWeek, target: needed, met: false, current: 0, best: 0 };

  const perWeek = new Map();
  for (const day of active) {
    const ws = sundayWeekStart(day);
    perWeek.set(ws, (perWeek.get(ws) ?? 0) + 1);
  }
  const earliest = [...perWeek.keys()].sort()[0];
  const met = [];
  for (let ws = sundayWeekStart(earliest); ws <= thisWeek; ws = addDaysIso(ws, 7)) {
    met.push((perWeek.get(ws) ?? 0) >= needed);
  }
  let best = 0;
  let run = 0;
  for (const m of met) {
    run = m ? run + 1 : 0;
    if (run > best) best = run;
  }
  // Grace mirrors the daily rule: the current week is still in progress, so
  // an unmet current week doesn't break the run — it just isn't counted yet.
  let i = met.length - 1;
  if (i >= 0 && !met[i]) i -= 1;
  let current = 0;
  while (i >= 0 && met[i]) {
    current += 1;
    i -= 1;
  }
  return { daysThisWeek, target: needed, met: daysThisWeek >= needed, current, best };
}

// ---- family mode: one household, separate streaks, no comparison ----

// One install, one household, one active learner at a time. Each member keeps
// their own consecutive-day streak. Deliberately there is no ranking, no
// total, no side-by-side score anywhere: switching shows only that member's
// practice. Comparison is a feature this product refuses.
//
// ISOLATION BOUNDARY (honest scope): today ONLY the streak is per-member.
// The rest of the learner state (SRS, notebook, mistake graph, XP, grammar,
// etc.) lives under shared fp.* keys and is therefore SHARED across household
// members on this install. Fully namespacing every learner key by member —
// with a safe migration that preserves existing single-user data and keeps
// export/import working — is a deliberate, larger change tracked separately,
// NOT something to bolt on silently (a naive re-key would orphan existing
// users' data and break exportProgress/importProgress). Until then, household
// mode is honest about being "separate streaks on a shared device", which is
// exactly what the UI copy says.

const MAX_HOUSEHOLD_MEMBERS = 6;

const blankHousehold = () => ({ members: [], activeId: null });

function cleanHousehold(h) {
  if (!h || !Array.isArray(h.members)) return blankHousehold();
  const members = h.members
    .filter((m) => m && typeof m.id === 'string' && m.id)
    .map((m) => ({
      id: m.id,
      name: String(m.name || '').trim().slice(0, 40) || 'Learner',
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : null,
      streak: m.streak && Number.isInteger(m.streak.count) && m.streak.count >= 0
        ? { count: m.streak.count, lastDay: typeof m.streak.lastDay === 'string' ? m.streak.lastDay : null }
        : { count: 0, lastDay: null },
    }));
  const activeId = members.some((m) => m.id === h.activeId) ? h.activeId : (members[0]?.id || null);
  return { members, activeId };
}

export function getHousehold() {
  return cleanHousehold(read(KEYS.household, null));
}

export function getActiveMember() {
  const h = getHousehold();
  return h.members.find((m) => m.id === h.activeId) || null;
}

export function addHouseholdMember(name) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return null;
  const h = getHousehold();
  if (h.members.length >= MAX_HOUSEHOLD_MEMBERS) return null;
  if (h.members.some((m) => m.name.toLowerCase() === clean.toLowerCase())) return null;
  const member = {
    id: `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    createdAt: new Date().toISOString(),
    streak: { count: 0, lastDay: null },
  };
  h.members.push(member);
  if (!h.activeId) h.activeId = member.id;
  write(KEYS.household, h);
  return member;
}

export function switchHouseholdMember(id) {
  const h = getHousehold();
  if (!h.members.some((m) => m.id === id)) return null;
  h.activeId = id;
  write(KEYS.household, h);
  return getActiveMember();
}

// Advances the active member's own streak on a newly-active day. Called from
// bumpStreak, so every saved practice counts for exactly one member. Exported
// for tests; the optional day override is an ISO YYYY-MM-DD label.
export function bumpHouseholdStreak(today) {
  try {
    const h = getHousehold();
    if (!h.activeId) return;
    const day = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : dayStamp();
    const m = h.members.find((x) => x.id === h.activeId);
    if (!m || m.streak.lastDay === day) return;
    const yesterday = addDaysIso(day, -1);
    m.streak = { count: m.streak.lastDay === yesterday ? m.streak.count + 1 : 1, lastDay: day };
    write(KEYS.household, h);
  } catch { /* household bookkeeping must never break practice */ }
}

// ---- vocabulary notebook (one-click saved words) ----

export const getNotebook = () => read(KEYS.notebook, []);

export const isInNotebook = (id) => getNotebook().some((e) => e.id === id);

const normFr = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export function saveToNotebook({ id, fr, en, note = '' }) {
  const nb = getNotebook();
  // Dedupe on id *and* on normalised French text — manual adds mint fresh
  // ids each time, so text is the only reliable duplicate signal.
  const frKey = normFr(fr);
  if (nb.some((e) => e.id === id || (frKey && normFr(e.fr) === frKey))) return nb;
  nb.unshift({ id, fr, en, note, addedAt: new Date().toISOString() });
  const capped = nb.slice(0, 200);
  write(KEYS.notebook, capped);
  return capped;
}

export function removeFromNotebook(id) {
  const nb = getNotebook().filter((e) => e.id !== id);
  write(KEYS.notebook, nb);
  return nb;
}

// ---- starred survival lines (real-world / phrase drills) ----

export const getStarredLines = () => read(KEYS.starred, []);

export const isStarredLine = (id) => getStarredLines().some((e) => e.id === id);

export function toggleStarredLine({ id, fr, en, source = '' }) {
  const list = getStarredLines();
  const idx = list.findIndex((e) => e.id === id);
  if (idx >= 0) {
    list.splice(idx, 1);
    write(KEYS.starred, list);
    return { list, starred: false };
  }
  list.unshift({ id, fr, en, source, addedAt: new Date().toISOString() });
  write(KEYS.starred, list.slice(0, 100));
  return { list: getStarredLines(), starred: true };
}

// ---- tap-to-translate word cache ----

export const getCachedWord = (word) => read(KEYS.wordCache, {})[word] ?? null;

export function cacheWord(word, translation) {
  const cache = read(KEYS.wordCache, {});
  cache[word] = translation;
  const keys = Object.keys(cache);
  if (keys.length > 500) delete cache[keys[0]]; // crude LRU-ish cap
  write(KEYS.wordCache, cache);
}

// ---- living language transfer -------------------------------------------

export function getLanguageModelProgress() {
  return normaliseLanguageProgress(read(KEYS.languageModel, {}));
}

/**
 * Persist one learner-reported transfer step. This is separate from grammar
 * quiz progress because a high quiz score must not silently become a claim of
 * spontaneous speaking ability.
 */
export function recordLanguageEvidence(structureId, event = {}) {
  const current = getLanguageModelProgress();
  const next = applyLanguageEvidence(current, structureId, event);
  write(KEYS.languageModel, next);
  const saved = next[structureId] || null;
  if (saved) {
    recordStudyEvent({
      type: 'language-transfer',
      structureId,
      stage: saved.stage,
      outcome: event.outcome === 'slip' ? 'slip' : 'success',
      context: event.context || null,
      source: event.source || 'language-map',
    });
  }
  return saved;
}

// ---- field notes: real-world phrases turned into transfer evidence --------

export const getFieldNotes = () => normaliseFieldNotes(read(KEYS.fieldNotes, []));

export function saveFieldNote(input = {}, now = Date.now()) {
  const result = _addFieldNote(getFieldNotes(), input, now);
  write(KEYS.fieldNotes, result.notes);
  if (result.added && result.note) {
    recordStudyEvent({
      type: 'field-note.capture',
      noteId: result.note.id,
      context: result.note.context,
      source: result.note.source || 'field-notes',
      stage: result.note.stage,
      at: result.note.createdAt,
    });
  }
  return { ...result, notes: getFieldNotes() };
}

export function practiceFieldNote(id, event = {}, now = Date.now()) {
  const next = _practiceFieldNote(getFieldNotes(), id, event, now);
  write(KEYS.fieldNotes, next);
  const saved = next.find((note) => note.id === id) || null;
  if (saved) {
    recordStudyEvent({
      type: 'field-note.practice',
      noteId: id,
      stage: saved.stage,
      outcome: event?.outcome === 'slip' ? 'slip' : 'success',
      mode: event?.mode || null,
      context: saved.context,
      at: saved.lastAt || new Date(now).toISOString(),
    });
  }
  return saved;
}

export function removeFieldNote(id) {
  const next = getFieldNotes().filter((note) => note.id !== id);
  write(KEYS.fieldNotes, next);
  return next;
}

// ---- grammar quiz progress ----

export const getGrammarProgress = () => read(KEYS.grammar, {});

export function recordGrammarQuiz(topicId, score) {
  const scoreValue = clampScore(score);
  const all = getGrammarProgress();
  const prev = all[topicId] || { best: 0, attempts: 0 };
  all[topicId] = {
    best: Math.max(prev.best, scoreValue),
    attempts: prev.attempts + 1,
    lastAt: new Date().toISOString(),
  };
  write(KEYS.grammar, all);
  recordGrammarGap(topicId, { score: scoreValue, source: 'grammar-quiz' });
  if (scoreValue >= 60) {
    // Recognition and controlled production are the only stages a quiz can
    // justify. Delayed/contextual/spontaneous use still needs transfer data.
    recordLanguageEvidence(topicId, {
      stage: scoreValue >= 80 ? 2 : 1,
      allowJump: true,
      source: 'grammar-quiz',
    });
  } else {
    recordLanguageEvidence(topicId, { outcome: 'slip', source: 'grammar-quiz' });
  }
  return all[topicId];
}

// ---- spaced repetition: the SM-2 algorithm (SuperMemo / Anki) ----
// The evidence-based scheduler: each card carries an ease factor (EF) that
// grows when recall is easy and shrinks when it's hard, and the interval
// compounds by EF once a card has graduated. This spaces reviews to land
// just as a memory is about to fade — the most efficient way to retain.

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
// Map the four rating buttons to SM-2 quality grades (0–5).
const QUALITY = { again: 2, hard: 3, good: 4, easy: 5 };
const VOCAB_SCORE = { again: 0, hard: 60, good: 85, easy: 100 };

export const getSrs = () => read(KEYS.srs, {});
export const getFsrs = () => read(KEYS.srs, {});
export function getReceptiveSrs(){ const s=getSrs(); const out={}; for(const[k,v] of Object.entries(s)) if(!k.includes('::')) out[k]=v; return out; }


// A card is due if it was never reviewed, or its due date has passed.
export const isCardDue = (srsEntry) =>
  !srsEntry || !srsEntry.due || new Date(srsEntry.due) <= new Date();

export function getDueCardIds(allIds) {
  const srs = getSrs();
  return allIds.filter((id) => isCardDue(srs[id]));
}

export function rateCard(cardId, rating, opts={}) {
  const mode = opts.mode || 'receptive';
  const key = mode==='productive' ? `${cardId}::productive` : cardId;
  // Encounter identity: ONE presentation of a card is one encounter. The
  // caller may pin a presentation (retrying the same card must dedupe); by
  // default each rateCard call for a card the learner is looking at is a
  // fresh encounter, but a true re-answer of the SAME presentation must pass
  // the SAME encounterId through so the model can dedupe it.
  const identity = {
    sessionId: opts.sessionId || currentSessionId(),
    encounterId: opts.encounterId || newEncounterId(),
    activityId: opts.activityId || cardId,
  };
  const srs = getSrs();
  const existing = srs[key];
  // FSRS is the scheduler. It used to be gated on `existing?.S != null` — a
  // condition only an FSRS card could satisfy — with every call site passing
  // that same condition back in as `opts.fsrs`. Nothing ever set S for the
  // first time, so the branch was unreachable and every card in the app was
  // silently scheduled by the SM-2 fallback below. Legacy SM-2 rows convert on
  // their next review via migrateFromSm2.
  const useFsrs = opts.fsrs !== false;
  if(useFsrs){
    const prev = migrateFromSm2(existing);
    const next = fsrsRate(prev, rating);
    srs[key] = next;
    write(KEYS.srs, srs);
    logReview({
      cardId,
      rating,
      elapsedMs: opts.elapsedMs,
      skill: opts.skill || 'vocabulary',
      intervalDays: existing?.interval,
      mode,
      itemLabel: opts.itemLabel,
      source: opts.source || 'srs',
      ...identity,
    });
    // The vocabulary loop's producer AND consumer, in one place: a lapse is
    // a mistake (enters the learner-error model); a later clean recall of a
    // card that has an active gap is its success evidence. The success call
    // is a no-op for cards without a gap, so ordinary reviews never create
    // entries — and resolving still requires two independent clean passes,
    // never one lucky answer.
    recordVocabularyOutcome(key, rating === 'again' ? 'error' : 'success', {
      mode,
      score: rating === 'again' ? 0 : null,
      label: opts.itemLabel || cardId,
      source: 'srs',
      // Evidence identity: the caller's encounter for this one presentation
      // (or a fresh one when the caller doesn't track presentations).
      ...identity,
    });
    return next;
  }
  const prev = srs[key] || { interval: 0, reps: 0, lapses: 0, ease: DEFAULT_EASE };
  let ease = prev.ease || DEFAULT_EASE;
  let reps = prev.reps || 0;
  let interval;

  if (rating === 'again') {
    // Lapse: relearn today, drop the ease, and restart the interval ladder.
    reps = 0;
    interval = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else {
    // SM-2 ease update: EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)).
    const q = QUALITY[rating];
    ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round((prev.interval || 1) * ease);
    // "Hard" still advances, but by less than a full ease step.
    if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.6));
  }

  srs[key] = {
    interval,
    reps,
    ease: Math.round(ease * 100) / 100,
    lapses: (prev.lapses || 0) + (rating === 'again' ? 1 : 0),
    due: new Date(Date.now() + interval * 86400000).toISOString(),
    lastRating: rating,
    lastReviewed: new Date().toISOString(),
  };
  write(KEYS.srs, srs);
  logReview({
    cardId,
    rating,
    elapsedMs: opts.elapsedMs,
    skill: opts.skill || 'vocabulary',
    intervalDays: existing?.interval,
    mode,
    itemLabel: opts.itemLabel,
    source: opts.source || 'srs',
    ...identity,
  });
  return srs[key];
}

// ---- review activity log (per-day counts; feeds the heatmap) ----

export const getReviewLog = () => read(KEYS.reviewLog, {});

function logReview({ cardId, rating, elapsedMs, skill, intervalDays, mode, itemLabel, source, sessionId, encounterId, activityId } = {}) {
  // Initialise before appending the new event because the first learner-model
  // migration also imports legacy review misses.
  getLearnerErrorModel();
  const log = getReviewLog();
  const today = dayStamp();
  log[today] = (log[today] || 0) + 1;
  // keep ~6 months so the object stays small
  const cutoff = dayStamp(new Date(Date.now() - 183 * 86400000));
  for (const day of Object.keys(log)) if (day < cutoff) delete log[day];
  write(KEYS.reviewLog, log);

  const events = getReviewEvents();
  const reviewedAt = new Date().toISOString();
  const event = {
    kind: 'review',
    schemaVersion: 2,
    id: `review:${reviewedAt}:${cardId || 'unknown'}:${Math.random().toString(36).slice(2, 8)}`,
    reviewedAt,
    itemId: String(cardId || 'unknown'),
    skill: pulseSkill(skill),
    mode: String(mode || 'receptive'),
    rating: String(rating || 'again'),
    correct: rating !== 'again',
    elapsedMs: Number.isFinite(Number(elapsedMs)) ? Math.max(0, Number(elapsedMs)) : 0,
    source: String(source || 'srs'),
    ...(itemLabel ? { itemLabel: String(itemLabel).slice(0, 120) } : {}),
    ...(Number.isFinite(Number(intervalDays)) ? { intervalDays: Math.max(0, Number(intervalDays)) } : {}),
  };
  events.push(event);
  write(KEYS.reviewEvents, events.length > REVIEW_EVENT_CAP ? events.slice(-REVIEW_EVENT_CAP) : events);
  recordStudyEvent({
    type: 'review',
    reviewId: event.id,
    itemId: event.itemId,
    itemLabel: event.itemLabel || null,
    rating: event.rating,
    correct: event.correct,
    mode: event.mode,
    score: event.correct ? 100 : 0,
  });
  const learnerError = {
    category: 'vocabulary',
    key: `item:${event.itemId}`,
    label: itemLabel || event.itemId,
    mode: 'cards',
    // An SRS review is a spaced, independent recall of material the learner
    // last saw days ago — exactly the delayed evidence the recovery loop
    // treats as the strong signal (one clean delayed pass resolves).
    delayed: true,
    score: event.correct ? 100 : 0,
    source: 'per-review-event',
    detail: event.correct ? 'Successful recall.' : 'Card marked again.',
    // Provenance of the presentation that produced this review. Session id
    // anchors it to this app visit; the encounter id dedupes re-answers of
    // the same presentation so a lucky double-tap cannot mint independence.
    sessionId,
    encounterId,
    activityId,
  };
  if (event.correct) recordLearnerSuccess(learnerError);
  else recordLearnerError(learnerError);
  // The evidence ledger tracks the same miss under its own cross-mode
  // vocabulary, so the delayed-retest queue keeps seeing card reviews.
  recordVocabularyGap(cardId, {
    label: itemLabel || cardId,
    score: event.correct ? (VOCAB_SCORE[rating] ?? 100) : 0,
    source: `vocabulary-${mode}`,
    context: { rating, reviewMode: mode },
  });
  publishPulseHistory();
}

// ---- mistake review (drill the recurring-mistake bank down to zero) ----

export function reviewHabit(key, gotIt) {
  const habits = getHabits();
  const habit = habits.find((h) => h.key === key);
  if (!habit) return habits;
  if (gotIt) habit.count -= 1;
  habit.lastSeen = new Date().toISOString();
  const next = habits.filter((h) => h.count > 0);
  next.sort((a, b) => b.count - a.count || (a.lastSeen < b.lastSeen ? 1 : -1));
  write(KEYS.habits, next);
  return next;
}

// ---- smart reminders (at most one nudge per day) ----

export const shouldRemindToday = () => read(KEYS.reminderDay, null) !== dayStamp();
export const markRemindedToday = () => write(KEYS.reminderDay, dayStamp());

// ---- coins (earned alongside XP; spent on avatars) ----

export const getCoins = () => read(KEYS.coins, 0);

export function addCoins(amount) {
  const total = getCoins() + Math.max(0, Math.round(amount));
  write(KEYS.coins, total);
  return total;
}

export function spendCoins(amount) {
  const total = getCoins();
  if (total < amount) return null;
  write(KEYS.coins, total - amount);
  return total - amount;
}

// ---- achievements ----

export const getAchievements = () => read(KEYS.achievements, {});

export function unlockAchievement(id) {
  const all = getAchievements();
  if (all[id]) return false;
  all[id] = new Date().toISOString();
  write(KEYS.achievements, all);
  return true;
}

// ---- daily challenges (per-day metric counters + claimed rewards) ----

export function getChallengeState() {
  const s = read(KEYS.challenges, null);
  if (s && s.day === dayStamp()) return s;
  return { day: dayStamp(), counts: {}, claimed: [] };
}

export function bumpChallengeMetric(metric, amount = 1) {
  const s = getChallengeState();
  s.counts[metric] = (s.counts[metric] || 0) + amount;
  write(KEYS.challenges, s);
  return s;
}

export function claimChallenge(id) {
  const s = getChallengeState();
  if (s.claimed.includes(id)) return s;
  s.claimed.push(id);
  write(KEYS.challenges, s);
  return s;
}

// ---- avatars ----

export const getAvatar = () => read(KEYS.avatar, 'sourire');
export const setAvatar = (id) => write(KEYS.avatar, id);
export const getOwnedAvatars = () => read(KEYS.avatarsOwned, ['sourire', 'beret']);

export function ownAvatar(id) {
  const owned = getOwnedAvatars();
  if (!owned.includes(id)) write(KEYS.avatarsOwned, [...owned, id]);
}

// ---- collectibles ----

export const getCollectibles = () => read(KEYS.collectibles, {});

export function awardCollectible(id) {
  const all = getCollectibles();
  if (all[id]) return false;
  all[id] = new Date().toISOString();
  write(KEYS.collectibles, all);
  return true;
}

// ---- seasonal event progress ----

export const getEventXp = (eventId) => read(KEYS.eventXp, {})[eventId] || 0;

export function addEventXp(eventId, amount) {
  const all = read(KEYS.eventXp, {});
  all[eventId] = (all[eventId] || 0) + Math.max(0, Math.round(amount));
  write(KEYS.eventXp, all);
  return all[eventId];
}

// ---- mistake graph (structural mistakes with mastery lifecycle) ----

export const getMistakeGraph = () => {
  const v = read(KEYS.mistakeGraph, []);
  return Array.isArray(v) ? v : [];
};

export function saveMistakeGraph(graph) {
  const list = Array.isArray(graph) ? graph : [];
  // Cap at the active frontier: retired mistakes older than the newest 150
  // have taught their lesson; the notebook keeps the human-readable record.
  write(KEYS.mistakeGraph, list.slice(-400));
  return list;
}

// Selection-trial log (P1): freeze which weakness the curriculum picked and
// why, so later analysis can judge whether the scheduler chose right. The
// delayed retest outcome joins by mistakeId at analysis time.
export const getSelectionTrial = () => {
  const v = read(KEYS.selectionTrial, []);
  return Array.isArray(v) ? v : [];
};

export function recordSelectionTrial(record) {
  const list = getSelectionTrial();
  const at = new Date().toISOString();
  list.push({
    id: String(record?.id || `selection:${at}:${Math.random().toString(36).slice(2, 10)}`),
    at,
    engineVersion: record.engineVersion || null,
    candidates: record.candidates || [],
    selectedId: record.selectedId || null,
    selectedConcept: record.selectedConcept || null,
    activity: record.activity || null,
    masteryBefore: record.masteryBefore ?? null,
    recurrenceBefore: record.recurrenceBefore ?? null,
    why: record.why || '',
    segments: record.segments || [],
    delivered: record.delivered || [],
    calibrationReady: Boolean(record.calibrationReady),
    timeSpent: Number.isFinite(record.timeSpent) ? record.timeSpent : null,
    completed: typeof record.completed === 'boolean' ? record.completed : null,
    retestResult: null, // joined later from the graph's retest history
  });
  write(KEYS.selectionTrial, list.slice(-200));
  return list[list.length - 1];
}

/** Patch a frozen trial after delivery (time spent, completion). */
export function saveSelectionTrial(trials) {
  const list = Array.isArray(trials) ? trials : [];
  write(KEYS.selectionTrial, list.slice(-200));
  return list;
}

// ---- Evidence Study (longitudinal two-arm study) ---------------------------
// Local-first, consent-gated, anonymous. Persistence lives in its own domain
// store (stores/studyStore.js); these re-exports keep every existing import
// working while call sites migrate.
export {
  getStudyState, saveStudyState,
  getStudyConsent, saveStudyConsent,
  getStudyChecks, saveStudyChecks,
  getStudyOutcomes, saveStudyOutcomes,
  getStudyArmOverride, setStudyArmOverride,
  getImportedStudyBundles, saveImportedStudyBundles,
};

// ---- research & validation domain (stores/researchStore.js) --------------
// Only the LIGHT CRUD half is re-exported here: reading the research streams
// and the examiner/real-exam writes. The measurement-stack half (validation
// metrics, bundle export/import, benchmark/assistance writes, listening
// progression, authentic-audio packs) lives in stores/researchStoreHeavy.js
// alongside placementValidation, progressionValidation, intelligibility,
// evidenceStudy and studyProtocol — lazy screens (Analytics, DevPanel,
// StudyPanel, ExamSimulator, WritingStudio, ChatArena) import it directly so
// the measurement stack never rides the boot graph.
export {
  getExaminerScripts, recordExaminerMark,
  getRealExamResults, recordRealExamResult,
  getPlacementValidations,
  getProgressionValidations,
  getWritingSpeakingCorpus,
  getComprehensionValidations,
  getIntelligibilityBenchmark,
  getAssistanceLog,
  getAuthenticAudioPack, setAuthenticAudioPack,
} from './stores/researchStore.js';

// ---- content calibration cache ----

export const getContentCalibration = () => read(KEYS.contentCalibration, null);
export const setContentCalibration = (v) => write(KEYS.contentCalibration, v);

// ---- last adaptive placement result (input to teacher pairing) ----

export const getLastPlacement = () => read(KEYS.lastPlacement, null);

export function saveLastPlacement(result) {
  if (!result || !result.level) return null;
  const saved = {
    level: String(result.level),
    theta: Number.isFinite(Number(result.theta)) ? Number(result.theta) : null,
    se: Number.isFinite(Number(result.se)) ? Number(result.se) : null,
    itemsAsked: Number.isFinite(Number(result.itemsAsked)) ? Math.round(Number(result.itemsAsked)) : null,
    confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : null,
    range: result.range != null ? String(result.range) : null,
    at: new Date().toISOString(),
  };
  write(KEYS.lastPlacement, saved);
  return saved;
}
