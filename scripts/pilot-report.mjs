/**
 * Pilot readiness report — what an operator needs before and during a small
 * adaptive-vs-balanced study (20–30 learners, repeated sessions, delayed
 * retest windows, held-out transfer checks).
 *
 *   node scripts/pilot-report.mjs [--json]
 *
 * Every number comes from recorded data. Descriptive only: this report never
 * says "significant", "proven", or anything causal — it shows counts, floors
 * and missing follow-ups so an operator can see whether the study is running
 * honestly, not whether it produced a result.
 */
import {
  loadDataset,
  parseCliArgs,
} from './lib/validation-io.mjs';
import { pathToFileURL } from 'node:url';
import { poolStudyData } from '../src/lib/researchAggregation.js';
import { experimentComparison, formatMetricCell } from '../src/lib/experimentReport.js';
import { MIN_N_PER_ARM, MIN_TRANSFER_N } from '../src/lib/evidenceStudy.js';

/** One operator-facing snapshot of pilot health. Pure over its inputs. */
export function pilotReport({ study = null, outcomes = [], imports = [] } = {}) {
  const pooled = poolStudyData({ localStudy: study, localOutcomes: outcomes, imports });
  const comparison = experimentComparison(pooled);
  const arms = pooled.participantsByArm || { adaptive: 0, balanced: 0 };

  // Recruitment: how close each arm is to the operator's target.
  const target = 15; // 20–30 learners total → ~15 per arm
  const recruitment = {
    target,
    adaptive: { enrolled: arms.adaptive || 0, floorReached: (arms.adaptive || 0) >= MIN_N_PER_ARM },
    balanced: { enrolled: arms.balanced || 0, floorReached: (arms.balanced || 0) >= MIN_N_PER_ARM },
  };

  // Session health: completions, drop-offs, rows that carried no delivery
  // facts at all (an incomplete row is visible, never silently dropped).
  const rows = pooled.outcomes || [];
  const completed = rows.filter((r) => r.completed === true).length;
  const abandoned = rows.filter((r) => r.completed === false).length;
  const incomplete = rows.filter((r) => typeof r.completed !== 'boolean').length;

  // Follow-ups owed: a delayed window nobody has retested yet. Each outcome
  // row with an intervention but no delayed pass owes exactly one retest.
  const delayedDue = rows.filter((r) => !r.delayedShort && !r.delayedLong && Array.isArray(r.delivered)).length;

  // Invalid/included rows the classifier rejected upstream, kept visible.
  const exclusions = pooled.exclusionCounts || {};

  return {
    recruitment,
    sessions: {
      recorded: rows.length,
      completed,
      abandoned,
      incomplete,
      participants: pooled.participants || 0,
      includedRows: pooled.includedRows ?? rows.length,
    },
    followUps: {
      delayedRetestsDue: delayedDue,
      missingShort: rows.filter((r) => !r.delayedShort).length,
      missingLong: rows.filter((r) => !r.delayedLong).length,
      missingTransfer: rows.filter((r) => !r.transfer).length,
    },
    validity: {
      rejectedImports: pooled.rejected?.length || 0,
      exclusionCounts: exclusions,
      treatmentConsistency: rows.filter((r) => r.treatmentConsistency && r.treatmentConsistency.ok === false).length,
    },
    floors: {
      minParticipantsPerArm: MIN_N_PER_ARM,
      minScoredPerMetric: MIN_TRANSFER_N,
      comparisonReady: Boolean(comparison.state === 'provisional'),
    },
    metrics: comparison.metrics,
    transferBySkill: comparison.transferBySkill,
    captureGaps: comparison.captureGaps,
    note: 'Descriptive only — counts, floors and missing data. No significance or causal claims.',
  };
}

/** Operator-facing markdown: the same numbers, readable at a glance. */
export function renderPilotMarkdown(report) {
  const lines = [
    '# Pilot readiness',
    '',
    `**Recruitment** — target ${report.recruitment.target} per arm: `
      + `adaptive ${report.recruitment.adaptive.enrolled}${report.recruitment.adaptive.floorReached ? ' (floor met)' : ' (below floor)'}, `
      + `balanced ${report.recruitment.balanced.enrolled}${report.recruitment.balanced.floorReached ? ' (floor met)' : ' (below floor)'}`,
    `**Sessions** — ${report.sessions.recorded} recorded · ${report.sessions.completed} completed · `
      + `${report.sessions.abandoned} abandoned · ${report.sessions.incomplete} incomplete`,
    `**Follow-ups** — ${report.followUps.delayedRetestsDue} delayed retests due · `
      + `${report.followUps.missingShort} rows still awaiting a 1–3 day check · `
      + `${report.followUps.missingTransfer} rows without transfer evidence`,
    `**Validity** — ${report.validity.rejectedImports} rejected imports · `
      + `${report.validity.treatmentConsistency} consistency mismatches`,
    '',
    '## Adaptive vs Balanced (participant-weighted, descriptive)',
    '',
  ];
  for (const [name, metric] of Object.entries(report.metrics)) {
    const a = formatMetricCell(name, metric.adaptive);
    const b = formatMetricCell('balanced', metric.balanced);
    lines.push(`- ${a} · ${b.replace(/^balanced:\s*/, 'balanced: ')}`);
  }
  lines.push('');
  lines.push(`_Floors: ${report.floors.minParticipantsPerArm} participants/arm · ${report.floors.minScoredPerMetric} scored participants/metric. ${report.note}_`);
  return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const datasetPath = String(args.dataset || 'validation-dataset.json');
  const dataset = await loadDataset(datasetPath);
  const report = pilotReport({
    study: dataset?.study || null,
    outcomes: dataset?.studyOutcomes || [],
    imports: [],
  });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(renderPilotMarkdown(report));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(String(process.argv[1])).href;
if (invokedDirectly) main().catch((e) => { console.error(e.message || e); process.exit(1); });
