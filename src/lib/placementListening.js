// Placement 2.0 — genuine listening stage.
//
// Placement 1.0's "listening" items were read-text questions: the learner
// READ an announcement and picked a meaning. That measured reading, not
// listening, and the per-skill report quietly misdescribed the learner.
// This module provides the real thing: the learner must HEAR the item
// (audio playback with a playback-confirmed gate, mirroring the held-out
// check's anti-fabrication rule), and the transcript is NEVER exposed
// before the answer.
//
// Everything here is pure and deterministic: no storage, no network. The UI
// owns playback and persistence; this module owns the rules.

import { BAND_CENTRE, abilityToLevel, estimateAbility } from './placement.js';

// ── the listening item bank ──────────────────────────────────────────────
// Spoken-only phrasing: each item is authored to be answerable by EAR alone
// (numbers, time, negatives, liaison, idiom). `audio` is what the learner
// hears (TTS today; an authentic-audio pack could override per asset later).
// `probe` names the listening skill the item targets — the result reports
// it, and Today's allocator consumes the aggregate.
// The authored per-item explanations (why each answer is right) are kept in
// git history, not in the bundle: no screen renders them (placement shows no
// per-item review), and shipped bytes are budgeted.
const li = (id, cefr, difficulty, probe, audio, options, answer) =>
  ({ id, cefr, difficulty, probe, audio, options, answer });

export const LISTENING_BANK = [
  // ---- A1 ----
  li('pl-a1-1', 'A1', -2.2, 'numbers', 'Un, deux, trois, quatre — j\'ai quatre pommes.', ['three', 'four', 'fourteen'], 1),
  li('pl-a1-2', 'A1', -2.0, 'gist', 'Bonjour, je voudrais un café, s\'il vous plaît.', ['Ordering', 'Saying goodbye', 'Introducing someone'], 0),

  // ---- A2 ----
  li('pl-a2-1', 'A2', -1.2, 'numbers', 'Le billet coûte dix-sept euros cinquante.', ['€17.50', '€70.15', '€27.50'], 0),
  li('pl-a2-2', 'A2', -1.1, 'negatives', 'Je ne prends jamais de sucre.', ['Never sugar', 'Always sugar', 'Sugar occasionally'], 0),
  li('pl-a2-3', 'A2', -0.9, 'time', 'Le train part à neuf heures moins le quart.', ['8:45', '9:15', '9:45'], 0),

  // ---- B1 ----
  li('pl-b1-1', 'B1', -0.2, 'inference', 'Je vous rappelle dès que je sors du métro.', ['Call back right after the commute', 'Call back tomorrow', 'Not calling back'], 0),
  li('pl-b1-2', 'B1', -0.1, 'detail', 'Le musée ouvre à dix heures, mais la boutique ferme à dix-huit heures.', ['The shop closes at 6pm', 'The museum closes at 6pm', 'Both close at 6pm'], 0),
  li('pl-b1-3', 'B1', 0.1, 'negatives', 'Ce n\'est pas que je refuse, c\'est que je ne peux pas venir.', ['Wants to but can\'t come', 'Refuses outright', 'Will come anyway'], 0),

  // ---- B2 ----
  li('pl-b2-1', 'B2', 0.8, 'inference', 'Ce n\'est pas mauvais, mais j\'ai connu mieux.', ['Polite criticism', 'Genuine praise', 'Confusion'], 0),
  li('pl-b2-2', 'B2', 1.0, 'intention', 'La réunion est reportée à 16h30, sous réserve de la salle.', ['Moved to 16:30, room pending', 'Moved to 14:00', 'Cancelled'], 0),
];

// ── item lifecycle (mirrors HeldOutCheck so one vocabulary of truth) ─────
// loading → ready → answered | unavailable
// An item is never "wrong" because audio failed: `unavailable` items are
// recorded, excluded from the ability estimate, and reported honestly.
export const PLAYBACK_GATE_MS = 5000;
export const LISTENING_MIN = 4;
export const LISTENING_MAX = 6;

export function startListeningStage({ seedTheta = 0, bank = LISTENING_BANK } = {}) {
  // Duplicate ids are an authoring bug, not runtime data: fail loudly at
  // stage start rather than silently double-counting evidence later.
  const ids = new Set();
  for (const it of bank) {
    if (ids.has(it.id)) throw new Error(`duplicate listening item id: ${it.id}`);
    ids.add(it.id);
    if (!it.audio || !Array.isArray(it.options) || !it.options.length || !Number.isFinite(it.difficulty)) {
      throw new Error(`listening item ${it?.id || '(unknown)'} is missing audio/options/difficulty`);
    }
  }
  return {
    stage: 'listening',
    bank,
    asked: [],
    responses: [],
    confirmedPlays: [],
    unavailable: [],
    theta: Number.isFinite(seedTheta) ? seedTheta : 0,
    se: 99,
    done: false,
  };
}

/** The next item closest to the current estimate (most informative). */
export function selectListeningItem(state) {
  if (state.done) return null;
  const asked = new Set(state.asked);
  const pool = state.bank.filter((it) => !asked.has(it.id) && !state.unavailable.includes(it.id));
  if (!pool.length || state.asked.length >= LISTENING_MAX) return null;
  let best = null;
  let bestDist = Infinity;
  for (const it of pool) {
    const dist = Math.abs(it.difficulty - state.theta);
    if (dist < bestDist) { bestDist = dist; best = it; }
  }
  return best;
}

/** Confirmed audio start for an item: unlocks answering. */
export function confirmPlayback(state, itemId) {
  if (state.confirmedPlays.includes(itemId)) return state;
  return { ...state, confirmedPlays: [...state.confirmedPlays, itemId] };
}

/** Whether answering this item is currently legitimate. */
export const canAnswerListeningItem = (state, itemId) =>
  state.confirmedPlays.includes(itemId) && !state.done;

/**
 * Audio never confirmed (TTS missing/failed/timeout): the item resolves
 * `unavailable`. It is recorded and excluded from the estimate — never a
 * wrong answer, never silent.
 */
export function markListeningUnavailable(state, itemId) {
  if (!state.bank.some((it) => it.id === itemId)) return state;
  if (state.unavailable.includes(itemId)) return state;
  return { ...state, unavailable: [...state.unavailable, itemId] };
}

/** Rasch update over the listening responses only. */
export function answerListeningItem(state, itemId, choiceIndex) {
  const it = state.bank.find((i) => i.id === itemId);
  if (!it) return state;
  if (!canAnswerListeningItem(state, itemId)) return state; // gate holds
  if (state.responses.some((r) => r.id === itemId)) return state; // one answer per item

  const correct = choiceIndex === it.answer;
  const responses = [...state.responses, {
    id: it.id, difficulty: it.difficulty, correct, probe: it.probe, cefr: it.cefr, choice: choiceIndex,
  }];
  // The SAME estimator as the receptive stage: one Rasch implementation on
  // one logit scale, so a listening estimate is directly comparable with a
  // reading estimate. All-right/all-wrong honesty handling included.
  const { theta, se: inflight } = estimateAbility(responses, state.theta);

  const answered = state.asked.length + 1;
  const done = answered >= Math.min(LISTENING_MIN + state.unavailable.length, LISTENING_MAX)
    || (answered >= LISTENING_MIN && inflight <= 0.55 && state.unavailable.length === 0)
    || (state.unavailable.length > 0 && state.bank.every((i) => state.asked.includes(i.id) || state.unavailable.includes(i.id)));

  return {
    ...state,
    theta,
    se: inflight,
    asked: [...state.asked, it.id],
    responses,
    done,
  };
}

/**
 * Per-skill listening estimate from the stage: level, ±1 SE band, and the
 * per-probe breakdown (gist / detail / numbers / time / negatives /
 * inference / intention). Unavailable items appear under `unavailableProbes`
 * so a weak TTS environment can never masquerade as listening weakness.
 */
export function listeningStageResult(state) {
  const { theta, se, responses, unavailable, bank } = state;
  const level = responses.length ? abilityToLevel(theta) : null;
  const byProbe = {};
  for (const r of responses) {
    (byProbe[r.probe] ||= { asked: 0, correct: 0 });
    byProbe[r.probe].asked += 1;
    if (r.correct) byProbe[r.probe].correct += 1;
  }
  for (const s of Object.values(byProbe)) s.pct = Math.round((s.correct / s.asked) * 100);
  const unavailableProbes = [...new Set(unavailable
    .map((id) => bank.find((it) => it.id === id)?.probe)
    .filter(Boolean))];
  return {
    answered: responses.length,
    correct: responses.filter((r) => r.correct).length,
    unavailable: unavailable.length,
    level,
    theta: Math.round(theta * 100) / 100,
    se: Math.round(se * 100) / 100,
    range: responses.length
      ? (abilityToLevel(theta - se) === abilityToLevel(theta + se)
        ? level
        : `${abilityToLevel(theta - se)}–${abilityToLevel(theta + se)}`)
      : null,
    byProbe,
    unavailableProbes,
  };
}

/**
 * Per-skill placement estimates: the receptive stage's Rasch result plus the
 * listening stage's own Rasch result, expressed per skill with honest
 * uncertainty. One number does not describe a learner; this is the shape the
 * rest of the app can consume (skillNeeds seeding, first-week plan).
 */
export function perSkillEstimates({ receptive, listening }) {
  const skills = {};
  // Receptive skills keep their sub-scores as directional signals; their
  // levels come from the shared receptive theta (the receptive stage is one
  // adaptive stream — sub-skill item counts are too small for their own
  // Rasch fits, and pretending otherwise would manufacture precision).
  const receptiveLevel = receptive?.level || null;
  for (const skill of ['grammar', 'vocab', 'reading']) {
    const sub = receptive?.bySkill?.[skill] || null;
    skills[skill] = {
      level: receptiveLevel,
      pct: sub?.pct ?? null,
      asked: sub?.asked ?? 0,
      evidence: 'receptive-written',
    };
  }
  // Listening gets its OWN estimate from actual heard audio.
  skills.listening = listening?.answered
    ? {
        level: listening.level,
        pct: Math.round((listening.correct / Math.max(1, listening.answered)) * 100),
        asked: listening.answered,
        range: listening.range,
        se: listening.se,
        evidence: 'audio-heard',
        byProbe: listening.byProbe,
      }
    : {
        level: null,
        pct: null,
        asked: 0,
        range: null,
        evidence: listening?.unavailable ? 'audio-unavailable' : 'not-measured',
        byProbe: {},
      };
  return skills;
}

/**
 * Practice recommendations from a placement result — the bridge that makes
 * placement CHANGE practice instead of ending at a result screen. Output is
 * a `skillNeeds`-shaped object consumable by buildDailyCurriculum, plus
 * concrete first-week directives.
 */
export function practiceRecommendations({ skills, listening }) {
  const needs = { listen: 0, speak: 0.2, retrieve: 0 };
  const directives = [];
  const listenLevel = skills.listening?.level ? BAND_CENTRE[skills.listening.level] : null;
  const readLevel = skills.reading?.level ? BAND_CENTRE[skills.reading.level] : null;

  // Listening below reading: raise listening share, start clearer/slower.
  if (listenLevel != null && readLevel != null && listenLevel < readLevel) {
    needs.listen = Math.min(1, 0.5 + (readLevel - listenLevel) * 0.5);
    directives.push({
      id: 'listening-behind',
      why: 'Your listening measured below your reading.',
      action: 'listening-stage-lower',
      detail: 'Today starts listening at a slower stage and revisits it more often.',
    });
  }
  // Weak/we-may-not-know listening: schedule listening evidence anyway.
  if (!skills.listening?.level) {
    needs.listen = Math.max(needs.listen, 0.4);
    directives.push({
      id: 'listening-unmeasured',
      why: listening?.unavailable
        ? 'Audio could not play during placement — listening was not measured.'
        : 'Listening was not measured during placement.',
      action: 'listening-evidence-first',
      detail: 'Early sessions include short listening checks so the estimate fills in.',
    });
  }
  // Production lagging recognition: bias toward speak, away from pure
  // recognition drills (the allocator already follows mistake-driven drills).
  const grammarPct = skills.grammar?.pct;
  if (Number.isFinite(grammarPct) && grammarPct >= 60) {
    needs.speak = 0.6;
    directives.push({
      id: 'production-lags',
      why: 'You recognise more grammar than you produced today.',
      action: 'production-first',
      detail: 'Sessions lean toward speaking and typed production over multiple choice.',
    });
  }
  return { skillNeeds: needs, directives };
}
