/** Pure scoring helpers (no browser APIs). */

/**
 * Weighted composite used across the UI:
 * S = 0.30·grammar + 0.30·naturalness + 0.20·relevance + 0.20·fluency
 */
export function compositeScore(s = {}) {
  const g = +s.grammar || 0;
  const n = +s.naturalness || 0;
  const r = +s.relevance || 0;
  const f = +s.fluency || 0;
  return Math.round(0.3 * g + 0.3 * n + 0.2 * r + 0.2 * f);
}

export const SESSION_SCORE_KEYS = ['grammar', 'naturalness', 'relevance', 'fluency', 'overall'];

/**
 * The session's scores, computed from the turns the app has ALREADY graded.
 *
 * This is the source of truth for a session report. The report's `overall` used
 * to be the model's own arithmetic over the same per-turn scores, which made
 * the number non-reproducible (the identical conversation could report 84 then
 * 71) and put a learner's checkpoint, CEFR level, scenario queue and adaptive
 * difficulty behind it. `overall` is recomputed with the published weighting, so
 * it is deterministic and consistent with the tooltip in `scoreExplainers()`.
 *
 * A turn with no scores contributes nothing rather than dragging the average
 * toward zero.
 */
export function sessionScores(turns = []) {
  const totals = Object.fromEntries(SESSION_SCORE_KEYS.map((k) => [k, 0]));
  const counts = Object.fromEntries(SESSION_SCORE_KEYS.map((k) => [k, 0]));
  for (const turn of turns || []) {
    const s = turn?.evaluation?.scores || turn?.scores;
    if (!s || typeof s !== 'object') continue;
    for (const k of SESSION_SCORE_KEYS) {
      const v = Number(s[k]);
      if (!Number.isFinite(v)) continue;
      totals[k] += v;
      counts[k] += 1;
    }
  }
  const out = {};
  for (const k of ['grammar', 'naturalness', 'relevance', 'fluency']) {
    out[k] = counts[k] ? Math.round(totals[k] / counts[k]) : 0;
  }
  out.overall = counts.overall
    ? Math.round(totals.overall / counts.overall)
    : compositeScore(out);
  return out;
}

/** Plain-English breakdown for tooltips / report cards. */
export function scoreExplainers() {
  return {
    grammar: 'How correct the French was (endings, gender, agreement).',
    naturalness: 'Whether a native speaker would actually say it that way.',
    relevance: 'How well the reply answered the prompt or situation.',
    fluency: 'Flow and completeness — not just isolated words.',
    overall: '30% grammar + 30% naturalness + 20% relevance + 20% fluency.',
  };
}
