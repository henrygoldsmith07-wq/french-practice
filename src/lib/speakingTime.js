// Speaking-time accounting — how much the LEARNER actually spoke.
//
// The measure is voiced production, not time-on-screen: the recorder's
// acoustic loop already separates voiced speech from silence (voicedMs), so
// this module's job is to keep that honest when it is accumulated:
//
//   · silence never counts as speech — only voiced milliseconds arrive here
//   · the AI partner's playback never counts (only the learner's mic runs
//     through useRecorder; TTS playback is not an input to this module)
//   · repeated events for the same presentation are counted once
//   · an abandoned session records what was genuinely spoken, never a
//     guessed total derived from elapsed screen time
//
// Pure and injectable: storage/studyFlow own persistence, this owns rules.

// One attempt = one presentation of a turn (one mic recording, one submit).
// A re-send of the same recording must not mint a second attempt.
const MAX_EVENTS = 200;

function keyOf(event = {}) {
  return String(event.encounterId || event.activityId || `${event.at || ''}:${event.sessionId || 'session'}`);
}

/**
 * Accumulate spoken-production events into one honest session total.
 *
 * @param {Array<{voicedMs?: number, encounterId?: string, activityId?: string,
 *                at?: string, sessionId?: string}>} events
 * @param {{ maxEvents?: number }} options
 * @returns {{seconds, attempts, droppedDuplicates, droppedInvalid}}
 */
export function spokenProduction(events = [], options = {}) {
  const max = Number(options.maxEvents) || MAX_EVENTS;
  const seen = new Set();
  let voicedMs = 0;
  let attempts = 0;
  let droppedDuplicates = 0;
  let droppedInvalid = 0;
  for (const event of (events || []).slice(-max)) {
    if (!event || typeof event !== 'object') { droppedInvalid += 1; continue; }
    const key = keyOf(event);
    if (seen.has(key)) { droppedDuplicates += 1; continue; }
    seen.add(key);
    const ms = Number(event.voicedMs);
    // Silence, failed recordings and unvoiced submissions contribute nothing
    // — never a default estimate. A recording with no measured voice is
    // recorded as an attempt with zero production, not dropped, so the
    // absence of speech is visible rather than invisible.
    if (!Number.isFinite(ms) || ms <= 0) {
      attempts += 1;
      droppedInvalid += Number.isFinite(ms) ? 0 : 1;
      continue;
    }
    voicedMs += ms;
    attempts += 1;
  }
  return {
    seconds: Math.round(voicedMs / 1000),
    attempts,
    droppedDuplicates,
    droppedInvalid,
  };
}

/**
 * Merge one new attempt into a running session total without double
 * counting: the accumulator state carries the seen keys.
 *
 * @param {{seconds: number, attempts: number, seenKeys: string[]}} state
 * @param {{voicedMs?: number, encounterId?: string, activityId?: string, at?: string}} event
 */
export function accumulateSpoken(state = {}, event = {}) {
  const seen = new Set(Array.isArray(state.seenKeys) ? state.seenKeys : []);
  const key = keyOf(event);
  if (seen.has(key)) {
    return { ...state, seenKeys: [...seen] };
  }
  seen.add(key);
  const ms = Number(event.voicedMs);
  const seconds = (Number(state.seconds) || 0) + (Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0);
  return {
    seconds: Math.round(seconds * 100) / 100,
    attempts: (Number(state.attempts) || 0) + 1,
    seenKeys: [...seen].slice(-MAX_EVENTS),
  };
}

/**
 * Learner-facing line for a session total. Plain language, never a technical
 * measure name.
 */
export function spokenProductionLabel(seconds) {
  const s = Number(seconds) || 0;
  if (s < 30) return 'A short speaking turn';
  const m = Math.round(s / 60);
  return m <= 1 ? 'About a minute of speaking' : `About ${m} minutes of speaking`;
}
