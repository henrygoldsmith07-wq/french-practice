// Correction-contract eval — measures how often the AI actually delivers the
// structured metadata the product now depends on.
//
// The structured contract (impact / targetSkill / targetForm / severity /
// confidence / interruptRecommended) is what lets Le Studio:
//   · interrupt only for mistakes that matter (repair selection),
//   · build transfer challenges about the SKILL, not the phrase,
//   · schedule delayed retests of a named target.
//
// When the model omits those fields the app degrades honestly to the textual
// heuristics (speakingTransfer.correctionImpact) — but weaker transfer
// challenges are the silent cost, and nothing measured it. This module is the
// measurement: replay recorded corrections (from the writing/speaking corpus
// or an exported batch), count what arrived, and report coverage without
// judging a single correction's pedagogy.
//
//   node scripts/correction-contract-eval.mjs [--file corrections.json]
//                                              [--json]
//
// Descriptive only: coverage percentages with sample sizes, never a claim
// that the contract "works" — that needs real learner outcomes.

import {
  normalizeCorrectionsDetailed,
} from './aiValidate.js';

const FIELDS = ['impact', 'targetSkill', 'targetForm', 'severity', 'confidence', 'interruptRecommended'];

/**
 * Eval one batch of raw (pre-validation) corrections_detailed arrays.
 * Accepts either a flat array of correction arrays, or corpus rows carrying
 * `aiCorrections` as JSON/markdown (markdown is skipped: it carries no
 * structure to measure).
 *
 * @param {Array<Array<object>>} batches
 * @returns {{corrections, coverage, byImpact, complete, degraded, sampleSize}}
 */
export function correctionContractEval(batches = []) {
  const rows = [];
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    // Run each raw batch through the real validator first: what the eval
    // measures is what the app would RECEIVE, not what the model produced.
    for (const c of normalizeCorrectionsDetailed(batch, 6)) rows.push(c);
  }
  const n = rows.length;
  const counts = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  const byImpact = {};
  let complete = 0;
  for (const row of rows) {
    let all = true;
    for (const f of FIELDS) {
      if (row[f] !== undefined) counts[f] += 1;
      else all = false;
    }
    if (all) complete += 1;
    // impact is the field the heuristics can cover; targetSkill/targetForm
    // are the ones with NO fallback — their absence is the real degradation.
    const impact = row.impact || 'unclassified';
    if (!byImpact[impact]) byImpact[impact] = { n: 0, withTarget: 0 };
    byImpact[impact].n += 1;
    if (row.targetSkill || row.targetForm) byImpact[impact].withTarget += 1;
  }
  const targetCount = rows.filter((c) => c.targetSkill || c.targetForm).length;
  return {
    corrections: n,
    coverage: Object.fromEntries(FIELDS.map((f) => [
      f,
      { count: counts[f], rate: n ? Math.round((counts[f] / n) * 1000) / 1000 : null },
    ])),
    byImpact,
    complete,
    // "degraded" = no target metadata: the app falls back to phrase-level
    // transfer challenges for these.
    degraded: n - targetCount,
    sampleSize: n,
  };
}

/** Extract raw correction batches from corpus rows where they exist. */
export function batchesFromCorpusRows(rows = []) {
  const batches = [];
  for (const row of rows) {
    const raw = row?.aiCorrections;
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('[')) continue; // markdown corrections carry no structure
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) batches.push(parsed);
    } catch { /* not a structured payload — nothing to measure */ }
  }
  return batches;
}

/** Operator-facing line: coverage with sample size, honest about nothing. */
export function renderEvalSummary(report) {
  if (!report.sampleSize) return 'No structured corrections to measure yet.';
  const lines = [`Correction contract — ${report.sampleSize} corrections evaluated`];
  for (const [field, cov] of Object.entries(report.coverage)) {
    lines.push(`  ${field}: ${Math.round((cov.rate || 0) * 100)}% (${cov.count}/${report.sampleSize})`);
  }
  lines.push(`  fully-complete records: ${report.complete}/${report.sampleSize}`);
  lines.push(`  no target metadata (degrades to phrase-level transfer): ${report.degraded}/${report.sampleSize}`);
  lines.push('Descriptive coverage only — this measures the contract, not its pedagogical effect.');
  return lines.join('\n');
}
