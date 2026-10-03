// Speaking coach policy — how much correction a conversation can absorb
// before the corrections start costing more than the speaking.
//
// Pure and injectable. Two products share it:
//   Coach mode   — interruptions during the conversation, budgeted per turn
//                  and per session so fluent stretches stay intact
//   Fluency mode — no interruptions; the same ranking decides what survives
//                  into the end-of-session debrief (at most 3 items)
//
// The ranking the product promises:
//   · meaning / grammar / vocabulary / intelligibility outrank style
//   · a REPEATED error escalates: it stays even when the budget is full,
//     and one recurrences-worthy slip replaces three one-offs
//   · an isolated slip never earns an interruption on its own
//
// Everything here is learner-facing copy-safe: no ids, no engine vocabulary.

import { correctionImpact, shouldCorrectNow, correctionTarget } from './speakingTransfer.js';

// Interrupt budgets. The learner should spend substantially more time
// speaking than reading correction UI: one interruption per turn at most,
// two per conversation by default (a third only for an escalated repeat).
export const COACH_BUDGET = Object.freeze({
  perTurn: 1,
  perSession: 2,
  escalatedExtra: 1,
});

const IMPACT_RANK = {
  meaning: 0,
  grammar: 1,
  vocabulary: 2,
  intelligibility: 3,
  style: 9,
};

/**
 * Should THIS correction interrupt right now? Combines the impact triage
 * with the frequency budget and repeated-error escalation.
 *
 * @param {object} correction one corrections_detailed entry (+ session state)
 * @param {{interruptsSoFar?: number, turnCorrectionsSoFar?: number,
 *          conceptSeenBefore?: boolean, recurrences?: number}} state
 */
export function shouldInterrupt(correction = {}, state = {}) {
  if (!shouldCorrectNow(correction)) return false;
  const turnSoFar = Number(state.turnCorrectionsSoFar) || 0;
  const sessionSoFar = Number(state.interruptsSoFar) || 0;
  // An escalated repeat (seen before in this conversation) always gets in:
  // one repeated slip is worth more than three one-offs.
  const escalated = Number(state.recurrences) > 1 || state.conceptSeenBefore === true;
  if (turnSoFar >= COACH_BUDGET.perTurn) return false;
  const cap = COACH_BUDGET.perSession + (escalated ? COACH_BUDGET.escalatedExtra : 0);
  return sessionSoFar < cap;
}

/**
 * Rank corrections for one turn (Coach) or one session (Fluency): importance
 * first, recurrence second. Recurrences merge to one instruction — the same
 * form slipping three times is ONE thing to fix.
 *
 * @param {Array<object>} corrections corrections_detailed entries
 * @param {{sessionConcepts?: Set<string>}} options
 */
export function rankCorrections(corrections = [], options = {}) {
  const seenConcepts = options.sessionConcepts instanceof Set ? options.sessionConcepts : new Set();
  const byConcept = new Map();
  for (const c of corrections || []) {
    if (!c) continue;
    const impact = correctionImpact(c);
    if (impact === 'style') continue; // style never ranks — it is not a mistake
    const target = correctionTarget(c);
    const concept = target.skill || String(c.correction || c.original || '').toLowerCase().slice(0, 60);
    const key = concept || String(c.correction || '').toLowerCase();
    const existing = byConcept.get(key);
    const escalated = seenConcepts.has(key) || (existing && existing.recurrences >= 1);
    if (existing) {
      existing.recurrences += 1;
      existing.impact = IMPACT_RANK[impact] < IMPACT_RANK[existing.impact] ? impact : existing.impact;
      existing.escalated = true;
    } else {
      byConcept.set(key, {
        correction: c,
        impact,
        concept: key,
        targetSkill: target.skill,
        targetForm: target.form,
        recurrences: 1,
        escalated,
      });
    }
  }
  return [...byConcept.values()].sort((a, b) =>
    IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]
    || (b.escalated ? 1 : 0) - (a.escalated ? 1 : 0)
    || b.recurrences - a.recurrences);
}

/**
 * The turn's interrupt set: what the coach may say NOW, in rank order,
 * within budget. Everything else waits for the debrief.
 */
export function turnInterruptions(corrections = [], state = {}) {
  const ranked = rankCorrections(corrections, { sessionConcepts: state.sessionConcepts });
  const out = [];
  for (const row of ranked) {
    if (out.length >= COACH_BUDGET.perTurn) break;
    if (!shouldInterrupt(row.correction, {
      ...state,
      turnCorrectionsSoFar: out.length,
      recurrences: row.recurrences,
      conceptSeenBefore: row.escalated,
    })) continue;
    out.push(row);
  }
  return out;
}

/**
 * The end-of-session "what improved" summary the debrief leads with: what
 * the learner communicated successfully, what to fix next, and one action.
 * Derived from the session itself — never invented.
 *
 * @param {{history?: Array<object>, interruptions?: Array<object>,
 *          carriedWell?: Array<string>}} session
 */
export function sessionOutlook(session = {}) {
  const history = Array.isArray(session.history) ? session.history : [];
  const scored = history
    .map((t) => Number(t?.evaluation?.scores?.overall))
    .filter((n) => Number.isFinite(n));
  const strong = scored.filter((n) => n >= 80).length;
  const carried = Array.isArray(session.carriedWell) ? session.carriedWell : [];
  const fixes = Array.isArray(session.interruptions) ? session.interruptions : [];
  const top = fixes[0] || null;
  return {
    communicated: carried.length
      ? carried.slice(0, 2)
      : strong > 0
        ? [`${strong} turn${strong === 1 ? '' : 's'} landed cleanly`]
        : [],
    problems: fixes.slice(0, 3).map((f) => f.correction?.note || f.concept || 'a recurring form'),
    nextAction: top
      ? `Use ${String(top.targetForm || top.targetSkill || top.concept || 'that form').toLowerCase()} once more in a new sentence tomorrow.`
      : 'Keep the conversation going — length is what builds fluency now.',
  };
}
