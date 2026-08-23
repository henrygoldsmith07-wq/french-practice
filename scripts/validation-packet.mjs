/**
 * Rater workflow for the validation dataset.
 *
 *   --make:  sample anonymised marking packets
 *     node scripts/validation-packet.mjs --make --track speaking \
 *       --n 30 --raters 3 --out packets/speaking-batch1.json [--dataset d.json]
 *
 *   --merge: fold a rater's completed marksheet back into the dataset with
 *   rater attribution (second marks must come from a different rater).
 *     node scripts/validation-packet.mjs --merge batch1.raterA.json \
 *       --rater raterA --into validation-dataset.json
 *
 * Packets carry item content only — no learner identifiers ever leave the
 * dataset. Scores are applied in place; nothing is invented for missing ones.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  loadDataset,
  parseCliArgs,
  writeJsonAtomic,
} from './lib/validation-io.mjs';

const marksCount = (entry) => (entry.humanScore != null ? 1 : 0) + (entry.humanScore2 != null ? 1 : 0);

/** Build an anonymised packet of corpus items awaiting marks. */
export function buildPacket(dataset, { track = 'speaking', n = 20, raters = 1 } = {}) {
  if (!['writing', 'speaking'].includes(track)) {
    return { error: `packet workflow covers writing/speaking marking only (got "${track}")` };
  }
  const expected = Math.max(1, Math.min(3, Number(raters) || 1));
  const corpus = Array.isArray(dataset?.corpus) ? dataset.corpus : [];
  const awaiting = corpus.filter((e) => e && typeof e === 'object' && e.mode === track && e.prompt && e.response && marksCount(e) < expected);
  // Deterministic order so every rater receives the same items.
  const items = awaiting
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, Number(n) || 0))
    .map((e) => {
      // Allowlist fields ONLY — anything identifying stays behind.
      const item = { itemId: e.id, prompt: e.prompt };
      if (track === 'speaking') item.transcript = e.response;
      else item.response = e.response;
      if (e.audioRef) item.audioRef = e.audioRef;
      return item;
    });
  return {
    packet: {
      batchId: `pkt-${track}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      track,
      ratersExpected: expected,
      createdAt: new Date().toISOString(),
      items,
    },
    considered: awaiting.length,
  };
}

const clampScore = (v) => {
  const num = Number(v);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return Math.round(num);
};

/**
 * Apply a completed marksheet ({batchId, track, marks:[{itemId, score,
 * corrections?}]}) to the dataset with rater attribution. Returns per-mark
 * errors instead of guessing; second marks by the first rater are refused.
 */
export function applyMarksheet(dataset, marksheet, raterName) {
  const errors = [];
  let updated = 0;
  const rater = String(raterName || '').trim();
  if (!rater) {
    errors.push({ itemId: null, error: '--rater is required to attribute marks' });
    return { updated, errors, dataset };
  }
  const marks = Array.isArray(marksheet?.marks) ? marksheet.marks : [];
  const list = Array.isArray(dataset?.corpus) ? dataset.corpus : [];
  const byId = new Map(list.map((e, i) => [e && e.id != null ? String(e.id) : null, i]));

  marks.forEach((mark, i) => {
    const idx = byId.get(String(mark?.itemId ?? ''));
    if (idx === undefined) {
      errors.push({ row: i, error: `unknown itemId "${mark?.itemId}" — not in this dataset` });
      return;
    }
    const score = clampScore(mark.score);
    if (score == null || !Number.isFinite(Number(mark.score))) {
      errors.push({ row: i, error: `score for "${mark.itemId}" is not a number in 0–100` });
      return;
    }
    const entry = list[idx];
    if (marksCount(entry) >= 2) {
      errors.push({ row: i, error: `"${mark.itemId}" is already double-marked` });
      return;
    }
    if (entry.humanScore == null) {
      list[idx] = {
        ...entry,
        humanScore: score,
        humanCorrections: mark.corrections != null ? String(mark.corrections).slice(0, 8000) : entry.humanCorrections,
        rater,
        consensus: entry.consensus ?? null,
        hasHuman: true,
        paired: entry.aiScore != null,
        doubleMarked: false,
      };
      updated += 1;
      return;
    }
    if (String(entry.rater ?? '').trim().toLowerCase() === rater.toLowerCase()) {
      errors.push({ row: i, error: `"${mark.itemId}" was first marked by ${entry.rater}; a second mark must come from a different rater` });
      return;
    }
    list[idx] = {
      ...entry,
      humanScore2: score,
      humanCorrections2: mark.corrections != null ? String(mark.corrections).slice(0, 8000) : entry.humanCorrections2,
      rater2: rater,
      consensus: String(Math.round((Number(entry.humanScore) + score) / 2)),
      doubleMarked: true,
    };
    updated += 1;
  });

  return { updated, errors, dataset };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.make) {
    const datasetPath = String(args.dataset || 'validation-dataset.json');
    const dataset = await loadDataset(datasetPath);
    const { packet, considered, error } = buildPacket(dataset, {
      track: String(args.track || 'speaking'),
      n: Number(args.n) || 20,
      raters: Number(args.raters) || 1,
    });
    if (error) { console.error(error); process.exit(1); return; }
    const out = String(args.out || `packets/${packet.batchId}.json`);
    await writeJsonAtomic(out, packet);
    console.log(`Packet ${packet.batchId}: ${packet.items.length} item(s) sampled from ${considered} awaiting marks (${packet.ratersExpected} rater(s) expected).`);
    console.log(`Anonymised — item content only. → ${out}`);
    return;
  }

  if (args.merge) {
    const into = String(args.into || 'validation-dataset.json');
    let marksheet;
    try { marksheet = JSON.parse(await readFile(String(args.merge), 'utf8')); } catch (e) {
      console.error(`Cannot read marksheet ${args.merge}: ${e.message}`);
      process.exit(1);
      return;
    }
    const dataset = await loadDataset(into);
    const { updated, errors } = applyMarksheet(dataset, marksheet, args.rater);
    if (updated > 0) {
      dataset.updatedAt = new Date().toISOString();
      await writeJsonAtomic(into, dataset);
    }
    console.log(`Marksheet ${String(args.merge)} (batch ${marksheet?.batchId ?? '?'}): ${updated} mark(s) applied${errors.length ? `, ${errors.length} refused` : ''}.`);
    if (errors.length) {
      console.log(`Refused marks (first ${Math.min(10, errors.length)} of ${errors.length}):`);
      for (const err of errors.slice(0, 10)) console.log(`  ${err.row != null ? `row ${err.row}` : '*'}: ${err.error}`);
    }
    if (!updated && errors.length) process.exit(1);
    return;
  }

  console.error('Nothing to do. Use --make ... or --merge <marksheet> --rater <id> --into <dataset>.');
  process.exit(1);
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(String(process.argv[1])).href;
if (invokedDirectly) main().catch((e) => { console.error(e.message); process.exit(1); });
