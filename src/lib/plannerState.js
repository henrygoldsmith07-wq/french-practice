// Planner state assembly — reads the learner's real persisted state and
// hands the session planner one plain object.
//
// This is the boundary between storage and planning: storage.js owns
// persistence, sessionPlanner.js owns decisions, and this module does the
// translation. Nothing here decides anything; every function is a read.

import {
  getSrs, getNotebook, getSessions, getPrefs, getSettings, getTimeLog,
  getLearnerErrors, getMistakeGraph, getLearningEvidenceState, getSelectionTrial,
} from './storage.js';
import { dueEntries, notebookAsEntries, NEW_CARD_CAP } from './memory.js';
import { dueRetests } from './mistakeGraph.js';
import { weaknessLifecycle, WEAKNESS_LIFECYCLE } from './weaknessLifecycle.js';
import { dueLearningChecks } from './learningEvidence.js';
import { localDayIndex } from './localDay.js';

const DAY = 86400000;

/** Minutes of practice recorded over the last `days` days, per modality. */
export function recentMinutes({ days = 7, now = Date.now(), timeLog = null, sessions = null } = {}) {
  const log = timeLog || getTimeLog();
  const since = new Date(now - days * DAY).toISOString().slice(0, 10);
  let total = 0;
  for (const [day, seconds] of Object.entries(log || {})) {
    if (day >= since) total += Number(seconds) || 0;
  }
  const rows = sessions || getSessions();
  const recent = (rows || []).filter((s) => s && s.date && new Date(s.date).getTime() >= now - days * DAY);
  const speaking = recent.reduce((sum, s) => {
    const seconds = Number(s.durationSeconds) || 0;
    return sum + (s.kind === 'speaking' ? seconds / 60 : (Number(s.turns) || 0) * 0.6);
  }, 0);
  return {
    totalMinutes: Math.round(total / 60),
    speakingMinutes: Math.round(speaking),
    sessionCount: recent.length,
  };
}

/** How often recent successes needed help (0..1). Drives independence push. */
export function assistanceDependence(entries = []) {
  let assisted = 0;
  let total = 0;
  for (const entry of entries.slice(0, 12)) {
    for (const ev of (entry.evidence || [])) {
      total += 1;
      if (ev.assisted === true) assisted += 1;
    }
  }
  return total ? Math.round((assisted / total) * 100) / 100 : 0;
}

/** Deterministic per-day easy-win eligibility: roughly every third day. */
export function easyWinEligible(dayIndex = localDayIndex()) {
  return dayIndex % 3 === 2;
}

/**
 * Assemble the planner's input state. Pure apart from storage reads, which
 * are injectable for tests via the `read` parameter.
 * @param {{entries?: Array<object>, minutes?: number, now?: number,
 *          reading?: object, goals?: string[]}} options
 */
export function plannerState(options = {}) {
  const now = options.now || Date.now();
  const read = options.reading || {};
  const srs = read.srs || getSrs();
  const entries = options.entries || [];
  const library = [...entries, ...notebookAsEntries(read.notebook || getNotebook())];
  const due = dueEntries(library, srs, now, { newCardCap: NEW_CARD_CAP });
  const graph = read.graph || getMistakeGraph();
  const errorEntries = read.errorEntries || getLearnerErrors({ limit: 12 });
  const evidence = read.learningEvidence || getLearningEvidenceState();
  const minutes7 = read.recentMinutes || recentMinutes({ now, timeLog: read.timeLog, sessions: read.sessions });
  const prefs = read.prefs || getPrefs();
  const settings = read.settings || getSettings();

  // Due evidence follow-ups: the transfer check and delayed retest the model
  // OWES. This is the ONE rule for that question — dueLearningChecks in
  // learningEvidence.js — not a second, looser derivation here. The old local
  // version counted lanes directly, which could ask for a transfer check
  // straight after one had passed, and could call a delayed retest due the
  // moment a transfer landed, with no delay at all. One implementation means
  // the session planner, Today's brief and Progress can never disagree about
  // what the learner still owes.
  const evidenceDue = dueLearningChecks(evidence, now).slice(0, 3);

  // Per-modality need from live weakness pressure (0..1).
  const skillNeeds = read.skillNeeds || (() => {
    const needs = { speak: 0, listen: 0, retrieve: 0 };
    for (const entry of errorEntries) {
      const weight = Math.min(1, ((Number(entry.errorCount) || 0) + (Number(entry.recurrenceCount) || 0)) / 5);
      if (entry.category === 'speaking' || entry.category === 'pronunciation') needs.speak = Math.max(needs.speak, weight);
      else if (entry.category === 'listening') needs.listen = Math.max(needs.listen, weight);
      else if (entry.category === 'vocabulary') needs.retrieve = Math.max(needs.retrieve, weight);
    }
    return needs;
  })();

  const goals = options.goals || prefs.favouriteTopics || [];
  return {
    now,
    weaknesses: errorEntries,
    weaknessLifecycle: new Map(errorEntries.map((e) => [e.id, weaknessLifecycle(e, { now })])),
    srsDue: due.length,
    dueRetests: dueRetests(graph, now, 3),
    evidenceDue,
    skillNeeds,
    goals,
    recentPlans: read.recentPlans || recentPlansFromTrials(read.trials || getSelectionTrial()),
    assistanceDependence: assistanceDependence(errorEntries),
    speakingMinutes7d: minutes7.speakingMinutes,
    listeningMinutes7d: read.listeningMinutes ?? Math.round(minutes7.totalMinutes * 0.2),
    easyWinEligible: easyWinEligible(localDayIndex()),
    hasListeningContent: options.hasListeningContent !== false,
    hasScenario: options.hasScenario !== false,
    fieldNoteDue: Number(read.fieldNoteDue) || 0,
    level: settings.level || null,
  };
}

/** Recent plan history from recorded selection trials (the app's own log). */
export function recentPlansFromTrials(trials = []) {
  return (trials || []).slice(-10).map((t) => ({
    kind: t?.activity || t?.segments?.[0]?.id || null,
    target: t?.selectedConcept || t?.selectedId || null,
    at: t?.at || null,
  })).filter((p) => p.kind);
}

/**
 * The learner-facing summary line for a weakness: label + what the learner
 * should hear. Keeps Today's copy and Progress's copy in one place.
 */
export function weaknessHeadline(entry, { now = Date.now(), cycle = null } = {}) {
  const life = weaknessLifecycle(entry, { now, cycle });
  return {
    label: String(entry?.label || entry?.key || 'this'),
    state: life?.state || WEAKNESS_LIFECYCLE.DETECTED,
  };
}
