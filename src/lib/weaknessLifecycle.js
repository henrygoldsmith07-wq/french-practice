// Weakness lifecycle — how a learner-facing weakness moves from "we spotted
// this" to "you can use it", and what we say about it.
//
// Pure and injectable: it reads the shapes the learner-error model, the
// mistake graph and the learning-evidence store already persist (storage.js
// assembles them). Nothing here writes. The learner never sees an id, a
// counter or research vocabulary — only plain states and plain sentences.
//
// Lifecycle:
//   Detected → Confirmed → Repairing → Improving → Transfer check
//   → Delayed confirmation → Demonstrated
// and, when a repaired weakness reappears:
//   Recurred (the cycle reopens at Repairing)
//
// Evidence honesty rules encoded here:
//   · one isolated mistake is a slip, not a weakness — it stays "Detected"
//   · one correct answer never implies mastery
//   · assisted success extends "Improving" but never demonstrates
//   · "Demonstrated" needs independent use — in a fresh context or later

import { LEARNING_STATES, learningCycleStatus } from './learningEvidence.js';

export const WEAKNESS_LIFECYCLE = Object.freeze({
  DETECTED: 'detected',
  CONFIRMED: 'confirmed',
  REPAIRING: 'repairing',
  IMPROVING: 'improving',
  TRANSFER_CHECK: 'transfer-check',
  DELAYED_CONFIRMATION: 'delayed-confirmation',
  DEMONSTRATED: 'demonstrated',
  RECURRED: 'recurred',
});

const ORDER = [
  WEAKNESS_LIFECYCLE.DETECTED,
  WEAKNESS_LIFECYCLE.CONFIRMED,
  WEAKNESS_LIFECYCLE.REPAIRING,
  WEAKNESS_LIFECYCLE.IMPROVING,
  WEAKNESS_LIFECYCLE.TRANSFER_CHECK,
  WEAKNESS_LIFECYCLE.DELAYED_CONFIRMATION,
  WEAKNESS_LIFECYCLE.DEMONSTRATED,
];

/** Mistake confidence band: how sure are we this is a real weakness? */
export function mistakeConfidence(entry) {
  if (!entry || typeof entry !== 'object') return 'unknown';
  const errors = Number(entry.errorCount) || 0;
  const recurrences = Number(entry.recurrenceCount) || 0;
  const modes = new Set(Array.isArray(entry.modes) ? entry.modes.filter(Boolean) : []).size;
  if (recurrences > 0 || errors >= 3 || modes >= 2) return 'persistent';
  if (errors === 2) return 'repeated';
  if (errors === 1) return (entry.evidence?.[0]?.detail || '').match(/uncertain|asr|heard/i)
    ? 'uncertain'
    : 'single';
  return 'unknown';
}

/**
 * Lifecycle state for one learner-error entry.
 * @param {object} entry learnerErrors entry (or null)
 * @param {{ now?: number, cycle?: object|null }} ctx optional learning-evidence cycle
 *        for the same target, used to demand real transfer/delayed proof.
 */
export function weaknessLifecycle(entry, { now = Date.now(), cycle = null } = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const confidence = mistakeConfidence(entry);
  const recurrences = Number(entry.recurrenceCount) || 0;
  const successes = Number(entry.successCount) || 0;
  const independent = Number(entry.independentPasses) || 0;
  const lastEvidence = entry.lastEvidence || null;
  const status = entry.status || 'active';

  let state;
  if (status === 'resolved') {
    // The model already demanded independent evidence. A fresh mistake after
    // resolution is "Recurred"; without one this stands as demonstrated.
    state = recurrences > 0 && lastErrorAfterSuccess(entry)
      ? WEAKNESS_LIFECYCLE.RECURRED
      : WEAKNESS_LIFECYCLE.DEMONSTRATED;
  } else if (status === 'recovering') {
    if (lastEvidence === 'delayed' || independent >= 2) {
      state = WEAKNESS_LIFECYCLE.DELAYED_CONFIRMATION;
    } else if (successes >= 2 && independent >= 1) {
      // A transfer check is only meaningful once the learner has produced it
      // unassisted at least once — assisted-only progress is still "Improving"
      // and the planner pushes independent work instead.
      state = WEAKNESS_LIFECYCLE.TRANSFER_CHECK;
    } else {
      state = WEAKNESS_LIFECYCLE.IMPROVING;
    }
  } else if (recurrences > 0 && successes > 0) {
    state = WEAKNESS_LIFECYCLE.RECURRED;
  } else if (successes > 0) {
    state = WEAKNESS_LIFECYCLE.REPAIRING;
  } else if (confidence === 'single' || confidence === 'uncertain') {
    state = WEAKNESS_LIFECYCLE.DETECTED;
  } else {
    state = WEAKNESS_LIFECYCLE.CONFIRMED;
  }

  // A learning-evidence cycle can only ever ADVANCE the story with real
  // proof; it never fabricates one. No cycle → the counters above decide.
  // learningCycleStatus returns a plain state string.
  if (cycle) {
    const cycleState = learningCycleStatus(cycle, now);
    if (cycleState === LEARNING_STATES.DEMONSTRATED) state = WEAKNESS_LIFECYCLE.DEMONSTRATED;
    else if (cycleState === LEARNING_STATES.RECURRED) state = WEAKNESS_LIFECYCLE.RECURRED;
  }

  return {
    state,
    confidence,
    progress: ORDER.indexOf(state) >= 0 ? (ORDER.indexOf(state) + 1) / (ORDER.length + 1) : 0,
    hasTransferProof: Boolean(cycle && cycle.transfers?.length),
    hasDelayedProof: Boolean(cycle && cycle.delayed?.length) || lastEvidence === 'delayed',
  };
}

function lastErrorAfterSuccess(entry) {
  if (!entry.lastErrorAt || !entry.lastSuccessAt) return entry.lastErrorAt && !entry.lastSuccessAt;
  return entry.lastErrorAt > entry.lastSuccessAt;
}

const STATE_COPY = {
  [WEAKNESS_LIFECYCLE.DETECTED]: {
    label: 'Noticed',
    detail: 'We spotted this once — it is on the list to watch, not a problem yet.',
  },
  [WEAKNESS_LIFECYCLE.CONFIRMED]: {
    label: 'Needs work',
    detail: 'This has come up more than once, so it is worth repairing properly.',
  },
  [WEAKNESS_LIFECYCLE.REPAIRING]: {
    label: 'Practising it',
    detail: 'You are working on this right now — it is getting focused practice.',
  },
  [WEAKNESS_LIFECYCLE.IMPROVING]: {
    label: 'Improving',
    detail: 'Recent attempts are better. It needs to hold up without help before we call it fixed.',
  },
  [WEAKNESS_LIFECYCLE.TRANSFER_CHECK]: {
    label: 'Almost there',
    detail: 'Next we will ask you to use it in a different situation, without a prompt.',
  },
  [WEAKNESS_LIFECYCLE.DELAYED_CONFIRMATION]: {
    label: 'Holding up',
    detail: 'You used this correctly later, with no help. One more good look and it is yours.',
  },
  [WEAKNESS_LIFECYCLE.DEMONSTRATED]: {
    label: 'Demonstrated',
    detail: 'You have used this independently — in a new situation, and later on.',
  },
  [WEAKNESS_LIFECYCLE.RECURRED]: {
    label: 'It came back',
    detail: 'This came back after you had improved it, so we are practising it again.',
  },
};

export function lifecycleCopy(state) {
  return STATE_COPY[state] || { label: 'In progress', detail: '' };
}

/**
 * The learner-facing "Why this?" sentence for one weakness. Plain language,
 * real numbers, no internal terms. Example output:
 *   "You missed adjective agreement twice this week and used the same
 *    structure incorrectly during yesterday's speaking session. This checks
 *    whether you can now use it independently."
 */
export function whyThisSentence(entry, { cycle = null, now = Date.now() } = {}) {
  if (!entry) return 'This is where your practice will make the most difference today.';
  const life = weaknessLifecycle(entry, { now, cycle });
  const mistakes = Number(entry.errorCount) || 0;
  const recurrences = Number(entry.recurrenceCount) || 0;
  const modes = Array.isArray(entry.modes) ? entry.modes.filter(Boolean) : [];
  const label = String(entry.label || entry.key || 'this');
  const modePhrase = modes.length > 1
    ? ` and got it wrong in both ${modes[0]} and ${modes[1]}`
    : modes.length === 1
      ? ` during ${modes[0]} practice`
      : '';
  const times = mistakes === 1 ? 'once' : mistakes === 2 ? 'twice' : `${mistakes} times`;
  const recurredPhrase = recurrences > 0
    ? ' It had improved before and came back, which is exactly when practice pays off.'
    : '';
  const goal = life.state === WEAKNESS_LIFECYCLE.DEMONSTRATED
    ? 'You have since used it on your own — this is a light confirmation.'
    : life.state === WEAKNESS_LIFECYCLE.DELAYED_CONFIRMATION
      ? 'This checks that it still comes back to you later, without help.'
      : life.state === WEAKNESS_LIFECYCLE.TRANSFER_CHECK
        ? 'This checks whether you can now use it in a new situation, independently.'
        : 'This gives it focused practice until it holds up on its own.';
  return `You missed ${label} ${times}${modePhrase}.${recurredPhrase} ${goal}`;
}
