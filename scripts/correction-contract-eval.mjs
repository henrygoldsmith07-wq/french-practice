/**
 * Correction-contract eval — how often does the AI deliver the structured
 * metadata (impact / targetSkill / targetForm / severity / confidence /
 * interruptRecommended) the product depends on?
 *
 *   node scripts/correction-contract-eval.mjs [--file corrections.json] [--json]
 *
 * Input: a JSON file holding either a corpus-style export (rows with
 * `aiCorrections` as a JSON string) or a plain array of corrections_detailed
 * arrays. Markdown corrections carry no structure and are skipped.
 *
 * Descriptive coverage only — it measures the contract, never its pedagogical
 * effect, and it never fills gaps with assumptions.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  correctionContractEval,
  batchesFromCorpusRows,
  renderEvalSummary,
} from '../src/lib/correctionContractEval.js';

function parseCliArgs(argv = []) {
  const out = {};
  let key = null;
  for (const arg of argv) {
    if (arg.startsWith('--')) { key = arg.slice(2); out[key] = true; }
    else if (key) { out[key] = arg; key = null; }
  }
  return out;
}

function loadBatches(filePath) {
  let raw;
  try { raw = readFileSync(filePath, 'utf8'); } catch {
    throw new Error(`cannot read ${filePath}`);
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) {
    throw new Error(`${filePath} is not valid JSON: ${e.message}`);
  }
  if (Array.isArray(parsed)) {
    // Either a flat array of batches, or an array of raw corrections.
    return Array.isArray(parsed[0]) ? parsed : [parsed];
  }
  if (parsed && Array.isArray(parsed.rows)) return batchesFromCorpusRows(parsed.rows);
  if (parsed && Array.isArray(parsed.studyOutcomes)) {
    // A validation-study export: corrections live on corpus rows, not
    // outcomes — accept an explicit `corrections` array when present.
    return Array.isArray(parsed.corrections) ? [parsed.corrections] : [];
  }
  throw new Error(`${filePath} holds no recognisable corrections shape`);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const filePath = String(args.file || 'corrections.json');
  const report = correctionContractEval(loadBatches(filePath));
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(renderEvalSummary(report));
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(String(process.argv[1])).href;
if (invokedDirectly) main();
