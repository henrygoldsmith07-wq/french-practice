/**
 * Import real rater/learner rows into the validation research dataset.
 *
 *   node scripts/validation-import.mjs --dataset validation-dataset.json \
 *     --track placement --file learners.csv [--format csv|jsonl] [--append]
 *
 * Every row is validated through the app's own schema factories; rejected
 * rows are reported, never coerced. Without --append the track is REPLACED
 * by the imported batch; with --append rows are merged (exact duplicates
 * refused, content conflicts keep the incumbent). Writes are atomic.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  TRACK_NAMES,
  TRACKS,
  csvToRows,
  jsonlToRows,
  loadDataset,
  mergeDataset,
  emptyDataset,
  parseCliArgs,
  parseTrackRows,
  writeJsonAtomic,
} from './lib/validation-io.mjs';

const ALLOWED = TRACK_NAMES;

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const trackName = String(args.track || '');
  if (!ALLOWED.includes(trackName)) {
    console.error(`Unknown or missing --track "${trackName}". Allowed: ${ALLOWED.join(', ')}`);
    process.exit(1);
    return;
  }
  const file = String(args.file || '');
  if (!file) {
    console.error('Missing --file <learners.csv|rows.jsonl>');
    process.exit(1);
    return;
  }
  const format = String(args.format || (file.toLowerCase().endsWith('.csv') ? 'csv' : 'jsonl')).toLowerCase();
  if (!['csv', 'jsonl'].includes(format)) {
    console.error(`Unknown --format "${format}" (allowed: csv, jsonl)`);
    process.exit(1);
    return;
  }

  let text;
  try { text = await readFile(file, 'utf8'); } catch (e) {
    console.error(`Cannot read ${file}: ${e.message}`);
    process.exit(1);
    return;
  }

  const syntaxErrors = [];
  let rows;
  if (format === 'csv') {
    rows = csvToRows(text);
  } else {
    const parsed = jsonlToRows(text);
    rows = parsed.rows;
    syntaxErrors.push(...parsed.errors);
  }

  const { valid, errors } = parseTrackRows(trackName, rows);
  const allErrors = [...syntaxErrors, ...errors];

  const datasetPath = String(args.dataset || 'validation-dataset.json');
  const existing = await loadDataset(datasetPath);
  const arrKey = TRACKS[trackName].arrayKey;

  // Replace starts from an empty base so rater-independence checks still run
  // within the batch; append merges against what is already there.
  const base = args.append ? existing : emptyDataset();
  const merged = mergeDataset(base, { [arrKey]: valid });
  merged.dataset.updatedAt = new Date().toISOString();
  await writeJsonAtomic(datasetPath, merged.dataset);

  console.log(`${trackName}: ${rows.length} row(s) read (${format}) · ${valid.length} valid · ${errors.length} rejected`);
  console.log(`${args.append ? 'appended' : 'replaced'}: +${merged.added.length} added · ${merged.duplicates.length} exact duplicate(s) refused · ${merged.conflicts.length} conflict(s) kept as stored`);
  console.log(`Dataset → ${datasetPath}`);

  if (allErrors.length) {
    console.log(`Rejected rows (first ${Math.min(10, allErrors.length)} of ${allErrors.length}):`);
    for (const err of allErrors.slice(0, 10)) {
      console.log(`  row ${err.row}: ${err.error}`);
    }
  }
  if (!valid.length) {
    console.error('Nothing imported — every row was rejected.');
    process.exit(1);
  }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(String(process.argv[1])).href;
if (invokedDirectly) main().catch((e) => { console.error(e.message); process.exit(1); });
