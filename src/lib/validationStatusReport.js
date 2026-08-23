/**
 * Evidence-status reporting for the external-validation research dataset.
 *
 * Single source of truth shared by:
 *  - scripts/validation-status.mjs (CLI table)
 *  - scripts/validation-summary.mjs (CI/public summary: markdown + JSON)
 *  - src/components/Analytics.jsx (in-app evidence chips)
 *
 * Honesty contract: a track's headline number only appears once its documented
 * sample floor is met with REAL entries. Empty stores report no-data and an
 * em-dash — nothing here invents values to fill cells.
 */

import { placementValidationMetrics } from './placementValidation.js';
import { progressionValidationMetrics } from './progressionValidation.js';
import { corpusScoreAgreement, corpusInterRaterMetrics, corpusMetrics } from './writingSpeakingCorpus.js';
import { comprehensionAgreement } from './listeningReadingValidation.js';
import { benchmarkStatus } from './intelligibility.js';
import { benchmarkExaminer, validateAgainstResults } from './exams/simulator.js';
import { assistanceMetrics } from './assistanceValidation.js';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const num = (v) => (v == null ? '—' : String(v));

export const EMPTY_DATASET = {
  placementValidations: [],
  progressionValidations: [],
  corpus: [],
  comprehensionValidations: [],
  intelligibilityBenchmark: [],
  examinerScripts: [],
  realExamResults: [],
  assistanceLog: [],
  reviewEvents: [],
};

/** Documented sample floors per track (VALIDATION.md). UI chips + tests pin these. */
export const EVIDENCE_FLOORS = {
  placement: 20,
  progression: 15,
  corpus: 30,
  comprehension: 30,
  pronunciation: 30,
  examiner: 30,
  'real-exam': 20,
  assistance: 20,
  fsrs: 50,
};

export function emptyDataset() {
  return JSON.parse(JSON.stringify(EMPTY_DATASET));
}

/** Build the report rows for a research dataset object.
 *  `opts.fsrs` may inject fully-computed FSRS metrics ({n,status,logLoss,brier,
 *  calibrationError}); without it, FSRS shows counts/status only — the fit
 *  machinery stays out of browser bundles. */
export function statusReport(dataset, opts = {}) {
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

  // FSRS row: caller may inject computed metrics; default derives only
  // counts/status from durable review events so this stays browser-safe.
  const FLOOR_FSRS = 50;
  const reviewCount = arr('reviewEvents').length;
  const fsrs = opts.fsrs ?? {
    n: reviewCount,
    status: reviewCount === 0 ? 'no-data' : reviewCount >= FLOOR_FSRS ? 'validated' : 'provisional',
    logLoss: null,
    brier: null,
    calibrationError: null,
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
      track: 'fsrs', n: fsrs.n, floor: FLOOR_FSRS, target: 200, status: fsrs.status,
      headline: fsrs.logLoss == null ? '—'
        : `logLoss ${num(fsrs.logLoss)} · brier ${num(fsrs.brier)} · ECE ${num(fsrs.calibrationError)}`,
    },
  ];
}

const HONESTY_NOTE = "'—' means no number is claimed yet. Floors per VALIDATION.md; never fabricate rows to move a status.";

function markdownTable(rows) {
  const header = ['track', 'n', 'floor', 'target', 'status', 'headline'];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const r of rows) lines.push(`| ${header.map((h) => String(r[h])).join(' | ')} |`);
  return lines.join('\n');
}

/** Markdown rendering for CI step summaries and public pages. */
export function renderMarkdown(datasetPath, rows, { generatedAt } = {}) {
  return [
    `## Validation evidence — ${datasetPath}`,
    '',
    `_Generated ${generatedAt || new Date().toISOString()} · no-data = empty by design · provisional = below floor · validated/benchmarked = floor met._`,
    '',
    markdownTable(rows),
    '',
    HONESTY_NOTE,
  ].join('\n');
}

/** Public JSON payload shape (committed to public/validation-status.json). */
export function publicPayload(datasetPath, rows, { generatedAt } = {}) {
  return {
    generatedAt: generatedAt || new Date().toISOString(),
    dataset: datasetPath,
    honestyNote: HONESTY_NOTE,
    tracks: rows,
  };
}
