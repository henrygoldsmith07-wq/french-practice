// Product instrumentation for a real learner pilot.
//
// Local-first and opt-in: events are recorded in the same local store as the
// rest of the learner's state (storage.js `recordStudyEvent`), never sent
// anywhere by default. The research export (scripts/validation-packet.mjs and
// the export flow) is how data leaves the device, and raw private transcripts
// are never part of an event unless the learner explicitly consents.
//
// Every event is small, dated and non-identifying: what happened, at what
// step, and how far through. No content payloads.

export const INSTRUMENTATION_VERSION = 1;

export const EVENT_TYPES = Object.freeze({
  SESSION_STARTED: 'today.session-started',
  SESSION_COMPLETED: 'today.session-completed',
  SESSION_ABANDONED: 'today.session-abandoned',
  SEGMENT_COMPLETED: 'today.segment-completed',
  SEGMENT_SKIPPED: 'today.segment-skipped',
  SPEAKING_DURATION: 'speaking.duration',
  REVIEW_COMPLETED: 'review.completed',
  HINT_USED: 'practice.hint-used',
  RETRY_USED: 'practice.retry-used',
  TRANSFER_RESULT: 'practice.transfer-result',
  DELAYED_RESULT: 'practice.delayed-result',
  WEAKNESS_RECURRED: 'weakness.recurred',
  FIRST_SESSION: 'onboarding.first-session',
  FEATURE_USED: 'feature.used',
});

// Drop-out point: the furthest segment reached before abandonment. This is
// the single most actionable pilot metric, so it is explicit.
export function dropoutPoint(delivered = []) {
  if (!Array.isArray(delivered) || !delivered.length) return null;
  const last = delivered[delivered.length - 1];
  return { segment: last?.id || null, index: delivered.length - 1, completed: Boolean(last && !last.skipped) };
}

/** Build one event object. Never includes learner text. */
export function makeEvent(type, payload = {}, at = new Date().toISOString()) {
  if (!Object.values(EVENT_TYPES).includes(type)) return null;
  return {
    type,
    at,
    version: INSTRUMENTATION_VERSION,
    ...sanitise(payload),
  };
}

const MAX_STRINGS = 80;
function sanitise(payload = {}) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue;
    if (typeof value === 'string') out[key] = value.slice(0, MAX_STRINGS);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 20).map((v) => (typeof v === 'string' ? v.slice(0, MAX_STRINGS) : v));
  }
  return out;
}

/**
 * Research export payload: the pilot's reviewable summary. Explicitly opt-in
 * — callers must check the learner's research consent before using it. It
 * reports counts and timings only.
 */
export function researchExport({ events = [], since = null, until = null } = {}) {
  const rows = events.filter((e) => {
    if (since && e.at < since) return false;
    if (until && e.at > until) return false;
    return true;
  });
  const count = (type) => rows.filter((e) => e.type === type).length;
  const durations = rows.filter((e) => e.type === EVENT_TYPES.SPEAKING_DURATION).map((e) => Number(e.seconds) || 0);
  const sessionStarts = rows.filter((e) => e.type === EVENT_TYPES.SESSION_STARTED);
  const sessionCompletions = rows.filter((e) => e.type === EVENT_TYPES.SESSION_COMPLETED);
  const firstSessionAt = rows.find((e) => e.type === EVENT_TYPES.FIRST_SESSION)?.at || null;
  const firstCompletedAt = sessionCompletions[0]?.at || null;
  return {
    version: INSTRUMENTATION_VERSION,
    window: { since, until },
    sessions: {
      started: sessionStarts.length,
      completed: sessionCompletions.length,
      abandoned: count(EVENT_TYPES.SESSION_ABANDONED),
      completionRate: sessionStarts.length ? round2(sessionCompletions.length / sessionStarts.length) : null,
    },
    segments: {
      completed: count(EVENT_TYPES.SEGMENT_COMPLETED),
      skipped: count(EVENT_TYPES.SEGMENT_SKIPPED),
      dropouts: rows.filter((e) => e.type === EVENT_TYPES.SESSION_ABANDONED && e.segment).map((e) => e.segment),
    },
    speaking: {
      totalSeconds: durations.reduce((a, b) => a + b, 0),
      sessions: durations.length,
    },
    practice: {
      reviewsCompleted: count(EVENT_TYPES.REVIEW_COMPLETED),
      hintsUsed: count(EVENT_TYPES.HINT_USED),
      retriesUsed: count(EVENT_TYPES.RETRY_USED),
      transferAttempts: count(EVENT_TYPES.TRANSFER_RESULT),
      transferSuccess: rows.filter((e) => e.type === EVENT_TYPES.TRANSFER_RESULT && e.success === true).length,
      delayedAttempts: count(EVENT_TYPES.DELAYED_RESULT),
      delayedSuccess: rows.filter((e) => e.type === EVENT_TYPES.DELAYED_RESULT && e.success === true).length,
    },
    weaknesses: {
      recurred: count(EVENT_TYPES.WEAKNESS_RECURRED),
    },
    timeToFirstSession: firstSessionAt && firstCompletedAt
      ? Math.max(0, Math.round((new Date(firstCompletedAt) - new Date(firstSessionAt)) / 1000))
      : null,
    features: tallyFeatures(rows),
  };
}

function tallyFeatures(rows) {
  const tally = {};
  for (const row of rows) {
    if (row.type !== EVENT_TYPES.FEATURE_USED) continue;
    const name = String(row.feature || 'unknown').slice(0, MAX_STRINGS);
    tally[name] = (tally[name] || 0) + 1;
  }
  return tally;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Weekly retention signal for the pilot: which days in the last `weeks`
 * contained any recorded activity. Counts, not conclusions.
 */
export function weeklyRetention(events = [], { weeks = 4, now = Date.now() } = {}) {
  const daySet = new Set();
  const since = now - weeks * 7 * 86400000;
  for (const e of events) {
    const at = new Date(e.at || 0).getTime();
    if (Number.isFinite(at) && at >= since) daySet.add(new Date(at).toISOString().slice(0, 10));
  }
  return { activeDays: [...daySet].sort(), weeks };
}
