/**
 * CI/public evidence summary from the research dataset.
 *
 *   node scripts/validation-summary.mjs [--dataset validation-dataset.json]
 *        [--md <file|'-'>] [--public public/validation-status.json]
 *
 * - `--md -` prints the markdown table (ideal for $GITHUB_STEP_SUMMARY).
 * - `--public` writes the JSON payload served at /validation-status.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadDataset, parseCliArgs } from './lib/validation-io.mjs';
import { statusReport, renderMarkdown, publicPayload } from '../src/lib/validationStatusReport.js';

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const datasetPath = String(args.dataset || 'validation-dataset.json');
  const mdOut = args.md;
  const publicOut = args.public;

  const dataset = await loadDataset(datasetPath);
  const rows = statusReport(dataset);

  if (mdOut) {
    const md = renderMarkdown(datasetPath, rows);
    if (mdOut === '-') console.log(md);
    else {
      fs.mkdirSync(path.dirname(mdOut), { recursive: true });
      fs.writeFileSync(mdOut, md + '\n');
    }
  }
  if (publicOut) {
    fs.mkdirSync(path.dirname(publicOut), { recursive: true });
    fs.writeFileSync(publicOut, JSON.stringify(publicPayload(datasetPath, rows), null, 2) + '\n');
  }
  if (!mdOut && !publicOut) {
    console.log(JSON.stringify(publicPayload(datasetPath, rows), null, 2));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
