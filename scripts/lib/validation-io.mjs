/**
 * Bulk-population IO helpers for the validation research dataset.
 *
 * Pure Node: no DOM, no localStorage. Schema enforcement is delegated to the
 * same factories the app uses (src/lib/*Validation.js, intelligibility.js),
 * so a bulk import cannot smuggle in rows the app itself would reject.
 * Nothing here invents data — rows either validate or are reported as errors.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makePlacementValidationEntry } from '../../src/lib/placementValidation.js';
import { makeProgressionEntry } from '../../src/lib/progressionValidation.js';
import { makeCorpusEntry } from '../../src/lib/writingSpeakingCorpus.js';
import { makeComprehensionEntry } from '../../src/lib/listeningReadingValidation.js';
import { makeBenchmarkSample } from '../../src/lib/intelligibility.js';
import { makeAssistanceEvent } from '../../src/lib/assistanceValidation.js';

// ---------------------------------------------------------------- csv / jsonl

/** Minimal RFC4180-ish CSV parser: quoted fields, doubled quotes, CR/LF/CRLF. */
export function csvToRows(text) {
  const src = String(text ?? '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let sawAny = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; sawAny = true; continue; }
    if (ch === ',') { endField(); sawAny = true; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      if (field !== '' || row.length || sawAny) endRow();
      sawAny = false;
      continue;
    }
    field += ch;
    sawAny = true;
  }
  if (field !== '' || row.length) endRow();

  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((cells) => {
    const obj = {};
    header.forEach((key, idx) => { obj[key] = cells[idx] != null ? cells[idx] : ''; });
    return obj;
  });
}

/** Escape one CSV field (quotes only where needed). */
function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise rows back to RFC4180 CSV (CRLF line endings, header row first). */
export function rowsToCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';
  const header = [...new Set(list.flatMap((r) => Object.keys(r)))];
  const lines = [header.map(csvField).join(',')];
  for (const r of list) lines.push(header.map((k) => csvField(r[k])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** One JSON object per line; blank lines skipped, bad lines reported. */
export function jsonlToRows(text) {
  const rows = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    try { rows.push(JSON.parse(t)); } catch (e) { errors.push({ row: i, error: `bad JSON line: ${e.message}` }); }
  });
  return { rows, errors };
}

// ------------------------------------------------------------- schema bridges

// Mirrors storage.recordExaminerMark's admission rule (that function lives
// behind localStorage, so the tiny rule is repeated here, not invented).
export function makeExaminerRow(row = {}) {
  const appPercent = Number(row.appPercent);
  const examinerPercent = Number(row.examinerPercent);
  if (!Number.isFinite(appPercent) || !Number.isFinite(examinerPercent)) return null;
  const clamp = (n) => Math.max(0, Math.min(100, n));
  return {
    ...(row && typeof row === 'object' ? row : {}),
    id: String(row.id || ''),
    appPercent: clamp(appPercent),
    examinerPercent: clamp(examinerPercent),
    at: row.at || '',
  };
}

// Mirrors storage.recordRealExamResult.
export function makeRealExamRow(row = {}) {
  if (!row.predictedGrade || !row.actualGrade) return null;
  return {
    ...(row && typeof row === 'object' ? row : {}),
    id: String(row.id || ''),
    predictedGrade: String(row.predictedGrade),
    actualGrade: String(row.actualGrade),
    at: row.at || '',
  };
}

const bucketOf = (at) => {
  if (!at) return '';
  const t = new Date(at);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 16); // minute bucket
};

const hashOf = (s) => {
  const str = String(s ?? '');
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

// Natural content identity: two rows describing the same marking of the same
// item at the same minute collapse to one key regardless of supplied ids
// (factories generate fresh random ids when none is given, so ids cannot be
// trusted as merge keys).
const corpusItemKey = (e) => `${e.mode}|${hashOf(e.prompt)}|${hashOf(e.response)}`;

export const TRACKS = {
  placement: {
    arrayKey: 'placementValidations',
    make: makePlacementValidationEntry,
    required: ['knownLevel', 'placedLevel', 'theta', 'se', 'itemsAsked'],
    schemaHint: 'CEFR levels A1–C2, numeric theta/se (0–5) and itemsAsked (1–100)',
    key: (e) => `placement|${e.knownLevel}|${e.placedLevel}|${e.theta}|${e.se}|${e.rater ?? ''}|${bucketOf(e.at)}`,
    itemKey: () => null,
  },
  progression: {
    arrayKey: 'progressionValidations',
    make: makeProgressionEntry,
    required: ['from', 'to', 'unseen'],
    schemaHint: 'from<to CEFR levels plus unseen.{reading|listening|writing|speaking|grammar|vocabulary} scores 0–100',
    prepare: (row) => {
      // CSV supplies unseen scores as dotted columns (unseen.reading=82).
      const unseen = { ...(row.unseen && typeof row.unseen === 'object' ? row.unseen : {}) };
      for (const [k, v] of Object.entries(row)) {
        if (k.startsWith('unseen.') && v !== '') unseen[k.slice(7)] = v;
      }
      return { ...row, unseen };
    },
    key: (e) => `progression|${e.from}|${e.to}|${hashOf(JSON.stringify(e.unseen))}|${bucketOf(e.at)}`,
    itemKey: () => null,
  },
  corpus: {
    arrayKey: 'corpus',
    make: makeCorpusEntry,
    required: ['mode', 'prompt', 'response'],
    schemaHint: 'mode writing|speaking, non-empty prompt/response, scores 0–100',
    key: (e) => `corpus|${e.mode}|${hashOf(e.prompt)}|${hashOf(e.response)}|${bucketOf(e.at)}`,
    itemKey: corpusItemKey,
  },
  comprehension: {
    arrayKey: 'comprehensionValidations',
    make: makeComprehensionEntry,
    required: ['skill', 'itemId||itemTitle'],
    schemaHint: 'skill listening|reading, itemId or itemTitle, scores 0–100, source teacher|exam|self',
    key: (e) => `comprehension|${e.skill}|${e.itemId}|${bucketOf(e.at)}`,
    itemKey: (e) => `${e.skill}|${e.itemId}`,
  },
  pronunciation: {
    arrayKey: 'intelligibilityBenchmark',
    make: makeBenchmarkSample,
    required: ['target', 'transcript', 'humanMean'],
    schemaHint: 'target/transcript text, humanMean 1–5 listener scale, optional raters list',
    prepare: (row) => {
      // Accept "L1;L2;L3" or a JSON array string for the raters column.
      if (typeof row.raters === 'string' && row.raters.trim().startsWith('[')) {
        try { return { ...row, raters: JSON.parse(row.raters) }; } catch { return row; }
      }
      if (typeof row.raters === 'string') {
        return { ...row, raters: row.raters.split(';').map((r) => r.trim()).filter(Boolean) };
      }
      return row;
    },
    key: (e) => `pronunciation|${hashOf(e.target)}|${hashOf(e.transcript)}|${bucketOf(e.at)}`,
    itemKey: () => null,
  },
  examiner: {
    arrayKey: 'examinerScripts',
    make: makeExaminerRow,
    required: ['appPercent', 'examinerPercent'],
    schemaHint: 'numeric appPercent/examinerPercent 0–100 (plus optional grades)',
    prepare: (row) => ({ ...row, id: row.id || undefined, at: row.at || undefined }),
    key: (e) => `examiner|${e.appPercent}|${e.examinerPercent}|${bucketOf(e.at)}`,
    itemKey: () => null,
  },
  'real-exam': {
    arrayKey: 'realExamResults',
    make: makeRealExamRow,
    required: ['predictedGrade', 'actualGrade'],
    schemaHint: 'predictedGrade/actualGrade pair (e.g. 9–1 or A*–U)',
    prepare: (row) => ({ ...row, id: row.id || undefined, at: row.at || undefined }),
    key: (e) => `real-exam|${e.predictedGrade}|${e.actualGrade}|${bucketOf(e.at)}`,
    itemKey: () => null,
  },
  assistance: {
    arrayKey: 'assistanceLog',
    make: makeAssistanceEvent,
    required: ['support', 'score'],
    schemaHint: "support 'with'|'without', score 0–100",
    key: (e) => `assistance|${e.skill}|${e.support}|${e.score}|${e.taskId ?? ''}|${bucketOf(e.at)}`,
    itemKey: () => null,
  },
};

export const TRACK_NAMES = Object.keys(TRACKS);

/** Validate raw rows for one track through the app's own schema factory. */
export function parseTrackRows(trackName, rows) {
  const track = TRACKS[trackName];
  if (!track) throw new Error(`unknown track "${trackName}" (allowed: ${TRACK_NAMES.join(', ')})`);
  const valid = [];
  const errors = [];
  (Array.isArray(rows) ? rows : []).forEach((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({ row: i, error: 'row is not a plain object' });
      return;
    }
    const row = track.prepare ? track.prepare(raw) : raw;
    const missing = [];
    for (const spec of track.required) {
      const alternatives = spec.split('||');
      if (alternatives.every((k) => row[k] == null || row[k] === '')) missing.push(spec.replace('||', '/'));
    }
    if (missing.length) {
      errors.push({ row: i, error: `missing required field(s): ${missing.join(', ')}` });
      return;
    }
    const made = track.make(row);
    if (!made) {
      errors.push({ row: i, error: `rejected by ${trackName} schema (${track.schemaHint})` });
      return;
    }
    valid.push(made);
  });
  return { valid, errors };
}

export const parsePlacementRows = (rows) => parseTrackRows('placement', rows);
export const parseCorpusRows = (rows) => parseTrackRows('corpus', rows);
export const parseComprehensionRows = (rows) => parseTrackRows('comprehension', rows);
export const parsePronunciationRows = (rows) => parseTrackRows('pronunciation', rows);
export const parseExaminerRows = (rows) => parseTrackRows('examiner', rows);
export const parseRealExamRows = (rows) => parseTrackRows('real-exam', rows);
export const parseProgressionRows = (rows) => parseTrackRows('progression', rows);

// ------------------------------------------------------------------- dataset

const REVIEW_EVENTS_KEY = 'reviewEvents';

export function emptyDataset() {
  const ds = {};
  for (const name of TRACK_NAMES) ds[TRACKS[name].arrayKey] = [];
  ds[REVIEW_EVENTS_KEY] = [];
  return ds;
}

export function normaliseDataset(value) {
  const base = emptyDataset();
  if (!value || typeof value !== 'object') return base;
  for (const key of Object.keys(base)) {
    if (Array.isArray(value[key])) base[key] = value[key];
  }
  return base;
}

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

function raterIndependenceError(trackName, entry, pool) {
  const rater2 = entry.rater2 != null ? String(entry.rater2).trim() : '';
  if (!rater2) return null;
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const first = entry.rater != null ? norm(entry.rater) : '';
  if (first && first === norm(rater2)) {
    return `second-mark rater "${entry.rater2}" equals first rater — rater independence violated`;
  }
  const itemKey = TRACKS[trackName].itemKey(entry);
  for (const other of pool) {
    if (!other || other === entry) continue;
    if (TRACKS[trackName].itemKey(other) !== itemKey) continue;
    if (other.rater != null && norm(other.rater) === norm(rater2)) {
      return `second-mark rater "${entry.rater2}" already supplied the first mark for this item`;
    }
  }
  return null;
}

/**
 * Deep-merge per-track arrays keyed by natural content id. Exact duplicate
 * rows are refused (counted, not added); same key with different content is
 * a conflict (existing row wins, counted). Second marks must come from a
 * rater different from the first — violations land in errors, never the data.
 * Incoming keys may be either track names ("corpus") or dataset array keys
 * ("writingSpeakingCorpus"-style arrays like "corpus"/"placementValidations").
 */
export function mergeDataset(existing = {}, incoming = {}) {
  const base = normaliseDataset(existing);
  const inc = emptyDataset();
  for (const [key, value] of Object.entries(incoming && typeof incoming === 'object' ? incoming : {})) {
    if (!Array.isArray(value)) continue;
    const arrKey = TRACKS[key] ? TRACKS[key].arrayKey : Object.prototype.hasOwnProperty.call(inc, key) ? key : null;
    if (arrKey) inc[arrKey].push(...value);
  }

  const added = [];
  const duplicates = [];
  const conflicts = [];
  const errors = [];

  for (const name of TRACK_NAMES) {
    const arrKey = TRACKS[name].arrayKey;
    const current = base[arrKey];
    const index = new Map(current.map((e, i) => [TRACKS[name].key(e), i]));
    for (const entry of inc[arrKey]) {
      if (!entry || typeof entry !== 'object') continue;
      const key = TRACKS[name].key(entry);
      const violation = raterIndependenceError(name, entry, current);
      if (violation) { errors.push({ track: name, key, error: violation }); continue; }
      if (index.has(key)) {
        const incumbent = current[index.get(key)];
        if (stableStringify(incumbent) === stableStringify(entry)) duplicates.push(key);
        else conflicts.push(key);
        continue;
      }
      current.push(entry);
      index.set(key, current.length - 1);
      added.push(key);
    }
  }

  // Review events are append-only facts: dedupe by their stored id.
  const seenIds = new Set(base[REVIEW_EVENTS_KEY].map((e) => (e && e.id != null ? String(e.id) : null)).filter(Boolean));
  for (const ev of inc[REVIEW_EVENTS_KEY]) {
    if (!ev || typeof ev !== 'object') continue;
    const id = ev.id != null ? String(ev.id) : null;
    if (id && seenIds.has(id)) { duplicates.push(`reviewEvents|${id}`); continue; }
    if (id) seenIds.add(id);
    base[REVIEW_EVENTS_KEY].push(ev);
    added.push(`reviewEvents|${id ?? 'anonymous'}`);
  }

  return {
    dataset: base,
    added,
    duplicates,
    conflicts,
    errors,
  };
}

// account.exportProgress backups: { app, version, exportedAt, data: { '<fp.key>': json } }
const STORE_KEY_MAP = {
  'fp.placementValidations.v1': 'placementValidations',
  'fp.progressionValidations.v1': 'progressionValidations',
  'fp.writingSpeakingCorpus.v1': 'corpus',
  'fp.comprehensionValidations.v1': 'comprehensionValidations',
  'fp.intelligibilityBenchmark.v1': 'intelligibilityBenchmark',
  'fp.examinerScripts.v1': 'examinerScripts',
  'fp.realExamResults.v1': 'realExamResults',
  'fp.assistanceLog.v1': 'assistanceLog',
  'fp.reviewEvents.v2': REVIEW_EVENTS_KEY,
};

/**
 * Fold many exportProgress backups into one research dataset, counting
 * malformed payloads instead of guessing at them.
 */
export function aggregateExports(backups = []) {
  const incoming = emptyDataset();
  const stats = { backups: 0, skipped: 0, storesParsed: 0, malformed: [] };
  const errors = [];
  for (const backup of (Array.isArray(backups) ? backups : [])) {
    if (!backup || backup.app !== 'le-studio' || !backup.data || typeof backup.data !== 'object') {
      stats.skipped += 1;
      errors.push({ backup: backup?.exportedAt ?? 'unknown', error: 'not a Le Studio exportProgress payload' });
      continue;
    }
    stats.backups += 1;
    for (const [storeKey, raw] of Object.entries(backup.data)) {
      const arrKey = STORE_KEY_MAP[storeKey];
      if (!arrKey) continue;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('stored value is not an array');
        incoming[arrKey].push(...parsed);
        stats.storesParsed += 1;
      } catch (e) {
        stats.malformed.push(`${backup.exportedAt ?? 'unknown'}:${storeKey}: ${e.message}`);
      }
    }
  }
  const merged = mergeDataset({}, incoming);
  return {
    dataset: merged.dataset,
    stats: {
      ...stats,
      added: merged.added.length,
      duplicates: merged.duplicates.length,
      conflicts: merged.conflicts.length,
    },
    errors,
  };
}

// -------------------------------------------------------------- file plumbing

export async function loadDataset(filePath) {
  let raw;
  try { raw = await readFile(filePath, 'utf8'); } catch { return emptyDataset(); }
  try { return normaliseDataset(JSON.parse(raw)); } catch (e) {
    throw new Error(`dataset file is not valid JSON: ${e.message}`);
  }
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

/**
 * Atomic write: temp file in the target directory, then rename over the
 * destination. On any failure the temp file is removed — a half-written
 * dataset must never exist.
 */
export async function writeJsonAtomic(filePath, data) {
  const target = path.resolve(String(filePath));
  const serialized = JSON.stringify(data, null, 2) + '\n';
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  try {
    await writeFile(tmp, serialized, 'utf8');
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  return target;
}

// --------------------------------------------------------- fsrs over reviews

/**
 * Build a pseudo-SRS map ({ itemId: { history: [{at, rating}] } }) from
 * durable review events, so fsrsValidation scoring rules (log loss, Brier,
 * calibration) can be computed over real reviews. Events without a time or a
 * recall signal are skipped — never guessed.
 */
export function srsFromReviewEvents(events = []) {
  const byItem = new Map();
  for (const ev of (Array.isArray(events) ? events : [])) {
    if (!ev || typeof ev !== 'object') continue;
    const at = ev.reviewedAt || ev.at;
    if (!at) continue;
    const time = new Date(at).getTime();
    if (!Number.isFinite(time)) continue;
    let recalled = null;
    if (typeof ev.correct === 'boolean') recalled = ev.correct;
    else if (Number.isFinite(Number(ev.score))) recalled = Number(ev.score) >= 80;
    if (recalled === null) continue;
    const item = String(ev.itemId || ev.gapKey || '').trim();
    if (!item) continue;
    if (!byItem.has(item)) byItem.set(item, []);
    byItem.get(item).push({ at: time, rating: recalled ? 3 : 1 });
  }
  const srs = {};
  for (const [item, history] of byItem) {
    if (history.length >= 2) srs[item] = { history: history.sort((a, b) => a.at - b.at) };
  }
  return srs;
}

// ------------------------------------------------------------------ cli utils

export function parseCliArgs(argv = []) {
  const out = {};
  let key = null;
  for (const arg of argv) {
    if (arg.startsWith('--')) { key = arg.slice(2); out[key] = true; } else if (key) { out[key] = arg; key = null; }
  }
  return out;
}
