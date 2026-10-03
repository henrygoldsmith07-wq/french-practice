// Scenario progression — a learner revisits a scenario and faces a slightly
// harder version instead of restarting a generic conversation.
//
// Difficulty ladder per scenario (product spec's restaurant example):
//   1. basic task (order food)
//   2. more interaction (ask questions about the menu)
//   3. repair pressure (resolve an incorrect order)
//   4. natural conversation (hold a natural exchange with staff)
//
// Levels are earned by demonstrated ability: the recorded performance in that
// scenario and its skill family — not by visits. A level moves up on strong
// independent performance and moves down when performance collapses; it never
// jumps from a single lucky session.

export const SCENARIO_LEVELS = Object.freeze([
  { level: 1, label: 'Getting started', focus: 'the basic task' },
  { level: 2, label: 'More interaction', focus: 'asking questions and reacting' },
  { level: 3, label: 'Under pressure', focus: 'fixing problems and surprises' },
  { level: 4, label: 'Natural conversation', focus: 'speaking freely with the other person' },
]);

export const MAX_SCENARIO_LEVEL = SCENARIO_LEVELS.length;

/** The level-augmented prompt note handed to the conversation engine. */
export function levelDirective(level, scenario) {
  const lvl = Math.max(1, Math.min(MAX_SCENARIO_LEVEL, Number(level) || 1));
  switch (lvl) {
    case 1:
      return `Keep this simple and supportive: help the learner complete the basic task — ${scenario.title.toLowerCase()}. Short turns, gentle corrections, clear openings.`;
    case 2:
      return `Push for more interaction: ask the learner follow-up questions, offer choices, and expect them to ask questions back. The task is ${scenario.title.toLowerCase()}, but the conversation should go beyond the minimum.`;
    case 3:
      return `Add gentle pressure: introduce a small complication (a misunderstanding, something unavailable, a change of plan) and make the learner resolve it. Keep it realistic for ${scenario.title.toLowerCase()}.`;
    default:
      return `Hold a natural, flowing conversation as a real person would in this situation (${scenario.title.toLowerCase()}). Vary your turns, add small surprises, use natural speed and colloquial phrasing — the goal is free conversation.`;
  }
}

/**
 * Current level for a scenario from recorded session performance.
 * @param {Array<object>} sessions saved sessions referencing scenarioId
 * @param {string} scenarioId
 * @param {{ now?: number }} opts
 * @returns {{level: number, average: number|null, attempts: number, readyForNext: boolean, needsConsolidation: boolean}}
 */
export function scenarioLevel(sessions = [], scenarioId, { now = Date.now() } = {}) {
  const rows = (sessions || []).filter((s) => s && s.scenarioId === scenarioId);
  const scores = rows
    .map((s) => Number(s?.report?.average_scores?.overall))
    .filter((n) => Number.isFinite(n));
  const recent = scores.slice(-4);
  const average = recent.length
    ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
    : null;
  // Attempts below 3 cannot distinguish learning from luck; level grows with
  // sustained performance, not visits.
  let level = 1;
  if (scores.length >= 2 && average >= 72) level = 2;
  if (scores.length >= 3 && average >= 78) level = 3;
  if (scores.length >= 4 && average >= 84) level = 4;
  // Time decay: a level not touched in a month drifts back one step so a
  // returning learner gets a comfortable restart, not a wall.
  const lastAt = rows.length ? new Date(rows[rows.length - 1].date || now).getTime() : null;
  const staleDays = lastAt ? (now - lastAt) / 86400000 : 0;
  if (staleDays > 30 && level > 1) level -= 1;
  return {
    level,
    average,
    attempts: scores.length,
    readyForNext: level < MAX_SCENARIO_LEVEL && average != null && average >= 78 && scores.length >= 3,
    needsConsolidation: average != null && average < 60 && scores.length >= 2,
  };
}

/**
 * Next difficulty step for a scenario, with learner-friendly framing.
 * The same scenario at the next level, or a clear consolidation message.
 */
export function nextScenarioStep(sessions = [], scenario, { now = Date.now() } = {}) {
  const state = scenarioLevel(sessions, scenario?.id, { now });
  const stage = SCENARIO_LEVELS[Math.max(0, Math.min(SCENARIO_LEVELS.length - 1, state.level - 1))];
  if (state.needsConsolidation) {
    return {
      scenarioId: scenario?.id || null,
      level: state.level,
      label: `${scenario?.title || 'This scenario'} — at your pace`,
      detail: 'This one is still shaky, so it stays at the same level until it feels comfortable.',
      directive: levelDirective(state.level, scenario || { title: '' }),
    };
  }
  return {
    scenarioId: scenario?.id || null,
    level: state.level,
    label: `${scenario?.title || 'This scenario'} · ${stage.label}`,
    detail: state.level === 1
      ? 'Start with the basic task — we make it harder as you show you can handle it.'
      : `This time the focus is ${stage.focus}.`,
    directive: levelDirective(state.level, scenario || { title: '' }),
    readyForNext: state.readyForNext,
  };
}

/**
 * Which scenarios to put in front of the learner next: partially-progressed
 * first (finish what they started), then unseen, then least-recently-played.
 */
export function scenarioQueue(sessions = [], scenarios = [], { now = Date.now() } = {}) {
  const scored = (scenarios || []).map((scenario) => {
    const state = scenarioLevel(sessions, scenario.id, { now });
    const rows = (sessions || []).filter((s) => s?.scenarioId === scenario.id);
    const lastAt = rows.length ? new Date(rows[rows.length - 1].date || 0).getTime() : 0;
    let rank = 3; // unseen
    if (state.attempts > 0 && state.readyForNext) rank = 1; // keep going — ready to level up
    else if (state.attempts > 0) rank = 2; // in progress
    if (state.needsConsolidation) rank = 0; // consolidate first
    return { scenario, state, rank, lastAt };
  });
  return scored
    .sort((a, b) => a.rank - b.rank || b.lastAt - a.lastAt)
    .map((row) => ({ ...row, step: nextScenarioStep(sessions, row.scenario, { now }) }));
}
