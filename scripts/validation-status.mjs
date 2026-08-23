/**
 * Honest reporting for the validation research dataset.
 *
 *   node scripts/validation-status.mjs [--dataset validation-dataset.json] [--json]
 *
 * Row building lives in src/lib/validationStatusReport.js — the single source
 * of truth shared with the in-app evidence chips and the CI/public summary.
 */
import { pathToFileURL } from 'node:url';
import {
  loadDataset,
  parseCliArgs,
  srsFromReviewEvents,
} from './lib/validation-io.mjs';
import { statusReport as buildRows, renderMarkdown } from '../src/lib/validationStatusReport.js';
import { samplesFrom, logLoss, brierScore, calibrationError, MIN_SAMPLES } from '../src/lib/fsrsValidation.js';

export const statusReport = (dataset) => {
  // Compute FSRS metrics here so the CLI keeps its full headline; other
  // surfaces (app/CI JSON) use the lib default counts-only row.
  let fsrs;
  try {
    const reviewEvents = Array.isArray(dataset?.reviewEvents) ? dataset.reviewEvents : [];
    const samples = samplesFrom(srsFromReviewEvents(reviewEvents));
    const ready = samples.length >= MIN_SAMPLES;
    fsrs = {
      n: samples.length,
      status: samples.length === 0 ? 'no-data' : ready ? 'validated' : 'provisional',
      logLoss: ready ? logLoss(samples) : null,
      brier: ready ? brierScore(samples) : null,
      calibrationError: ready ? calibrationError(samples) : null,
    };
  } catch {
    fsrs = undefined; // fall back to lib defaults
  }
  return buildRows(dataset, { fsrs });
};

export { renderMarkdown };

function printTable(rows) {
  const header = ['track', 'n', 'floor', 'target', 'status', 'headline'];
  const widths = header.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(header.map((h) => r[h])));
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const datasetPath = String(args.dataset || 'validation-dataset.json');
  const dataset = await loadDataset(datasetPath);
  const rows = statusReport(dataset);

  if (args.json) {
    console.log(JSON.stringify({ dataset: datasetPath, generatedAt: new Date().toISOString(), rows }, null, 2));
  } else {
    console.log(`Validation status — ${datasetPath}`);
    printTable(rows);
    console.log('\nno-data = empty by design · provisional = below floor · validated/benchmarked = floor met.');
    console.log("'—' means no number is claimed yet. Floors per VALIDATION.md; never fabricate rows to move a status.");
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(String(process.argv[1])).href;
if (invokedDirectly) main().catch((e) => { console.error(e.message); process.exit(1); });
