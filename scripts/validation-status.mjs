/**
 * Honest reporting for the validation research dataset.
 *
 *   node scripts/validation-status.mjs [--dataset validation-dataset.json] [--json]
 *
 * Reuses the app's own metric calculators. Empty tracks report no-data;
 * below the documented sample floor they report provisional; the headline
 * number only appears once the floor is met. Absent data prints '—' —
 * nothing is ever invented to fill a cell.
 */
import { pathToFileURL } from 'node:url';
import {
  loadDataset,
  parseCliArgs,
  srsFromReviewEvents,
} from './lib/validation-io.mjs';
import { placementValidationMetrics } from '../src/lib/placementValidation.js';
import { progressionValidationMetrics } from '../src/lib/progressionValidation.js';
import { corpusScoreAgreement, corpusInterRaterMetrics, corpusMetrics } from '../src/lib/writingSpeakingCorpus.js';
import { comprehensionAgreement } from '../src/lib/listeningReadingValidation.js';
import { benchmarkStatus } from '../src/lib/intelligibility.js';
import { benchmarkExaminer, validateAgainstResults } from '../src/lib/exams/simulator.js';
import { assistanceMetrics } from '../src/lib/assistanceValidation.js';
import { samplesFrom, logLoss, brierScore, calibrationError, MIN_SAMPLES } from '../src/lib/fsrsValidation.js';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const num = (v) => (v == null ? '—' : String(v));

/** Build the report rows for a dataset. Exported for tests. */
export function statusReport(dataset) {
  const ds = dataset && typeof dataset === 'object' ? dataset : {};
  const arr = (key) => (Array.isArray(ds[key]) ? ds[key] : []);

  const placement = placementValidationMetrics(arr('placementValidations'));
  const progression = progressionValidationMetrics(arr('progressionValidations'));
  const corpusList = arr('corpus');
  const scores = corpusScoreAgreement(corpusList);
  const interRater = corpusInterRaterMetrics(corpusList);
  const corpus = { ...scores, n: corpusList.length, status: corpusList.length === 0 ? 'no-data' : scores.status };
  const comprehension = comprehensionAgreement(arr('comprehensionValidations'));
  const pronunciation = benchmarkStatus(arr('intelligibilityBenchmark'));
  const examiner = benchmarkExaminer(arr('examinerScripts'));
  const realExam = validateAgainstResults(arr('realExamResults'));
  const assistance = assistanceMetrics(arr('assistanceLog'));

  // FSRS scoring rules over durable review events — only above MIN_SAMPLES.
  const reviewEvents = arr('reviewEvents');
  const fsrsSamples = samplesFrom(srsFromReviewEvents(reviewEvents));
  const fsrsReady = fsrsSamples.length >= MIN_SAMPLES;
  const fsrs = {
    n: fsrsSamples.length,
    status: fsrsSamples.length === 0 ? 'no-data' : fsrsReady ? 'validated' : 'provisional',
    logLoss: fsrsReady ? logLoss(fsrsSamples) : null,
    brier: fsrsReady ? brierScore(fsrsSamples) : null,
    calibrationError: fsrsReady ? calibrationError(fsrsSamples) : null,
  };

  return [
    {
      track: 'placement', n: placement.n, floor: 20, target: 20, status: placement.status,
      headline: placement.status === 'no-data' ? '—'
        : `exact ${pct(placement.exactAgreement)} · ±1 ${pct(placement.withinOneAgreement)}`,
    },
    {
      track: 'progression', n: progression.n, floor: 15, target: 15, status: progression.status,
      headline: progression.status === 'no-data' ? '—'
        : `pass ${pct(progression.overallPassRate)} · mean ${num(progression.overallMean)}`,
    },
    {
      track: 'corpus', n: corpusList.length, floor: 30, target: 30, status: corpus.status,
      headline: scores.n === 0 && interRater.n === 0 ? '—'
        : `MAE ${num(scores.meanAbsoluteError)} · κ ${interRater.n ? num(interRater.kappa) : '—'} (${corpusMetrics(corpusList).doubleMarked} double-marked)`,
    },
    {
      track: 'comprehension', n: arr('comprehensionValidations').length, floor: 30, target: 30, status: comprehension.status,
      headline: comprehension.status === 'no-data' ? '—'
        : `MAE ${num(comprehension.meanAbsoluteError)} · within5 ${pct(comprehension.within5)}`,
    },
    {
      track: 'pronunciation', n: pronunciation.n, floor: 30, target: 40, status: pronunciation.status,
      headline: pronunciation.status === 'no-data' ? '—'
        : `r ${num(pronunciation.correlation)} · MAE ${num(pronunciation.meanAbsoluteError)}`,
    },
    {
      track: 'examiner', n: examiner.n, floor: 30, target: 30, status: examiner.status === 'no-data' ? 'no-data' : examiner.status,
      headline: examiner.status === 'no-data' ? '—'
        : `MAE ${num(examiner.meanAbsoluteError)}pp · κ ${num(examiner.kappa)}`,
    },
    {
      track: 'real-exam', n: realExam.n, floor: 20, target: 20, status: realExam.status,
      headline: realExam.status === 'no-data' ? '—'
        : `exact ${pct(realExam.exact)} · within1 ${pct(realExam.withinOne)}`,
    },
    {
      track: 'assistance', n: assistance.n, floor: 20, target: 20, status: assistance.status,
      headline: assistance.status === 'no-data' ? '—'
        : `gap ${assistance.gap == null ? '—' : `${Math.round(assistance.gap)}pp`}`,
    },
    {
      track: 'fsrs', n: fsrs.n, floor: MIN_SAMPLES, target: 200, status: fsrs.status,
      headline: fsrs.status === 'no-data' ? '—'
        : `logLoss ${num(fsrs.logLoss)} · brier ${num(fsrs.brier)} · ECE ${num(fsrs.calibrationError)}`,
    },
  ];
}

function printTable(rows) {
  const header = ['track', 'n', 'floor', 'target', 'status', 'headline'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[header[i]]).length)));
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
