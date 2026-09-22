// Error notebook — every correction is stored with why + recurrence and surfaced as drills.
// Require learner correction (retype) rather than just showing the answer.

import { recordWritingGap } from './storage.js';
import { read, write, KEYS } from './storageCore.js';

// KEYS.errorNotebook is a LEARNER-ROUTED key: in a household the corrections
// must live under the active member's namespace (and flow into exports) like
// every other progress key. The old raw localStorage access here bypassed that
// routing, so the notebook stayed shared at the legacy key while the claim
// migration expected it under the member key — a split-brain across two
// physical locations. storageCore read/write keeps the byte-identical raw key
// when no household is active, and the one-shot claim carries pre-existing
// data into the member namespace.
function readRaw(){ return read(KEYS.errorNotebook, []); }
function writeRaw(v){ write(KEYS.errorNotebook, v.slice(0,200)); }

export function getErrorNotebook(){ return readRaw(); }

export function correctionActivityAt(entry) {
  const at = entry?.rehearsedAt || entry?.lastAt || entry?.at || 0;
  const parsed = typeof at === 'number' ? at : Date.parse(at);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectCorrectedErrors(entries, { since = 0, limit = 200 } = {}) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.correctedByLearner && correctionActivityAt(entry) >= since)
    .sort((a, b) => correctionActivityAt(b) - correctionActivityAt(a))
    .slice(0, Math.max(0, limit));
}

export function addErrorNotebook({ original, corrected, why, ruleId, mistakeId }){
  if(!original || !corrected || original===corrected) return readRaw();
  recordWritingGap(ruleId || corrected, {
    label: why || corrected,
    score: 0,
    source: 'error-notebook',
    context: { original, corrected, ruleId: ruleId || null },
  });
  const list = readRaw();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const existing = list.find(e=> e.corrected===corrected && e.original===original);
  if(existing){
    existing.count = (existing.count||1)+1;
    existing.lastAt = new Date().toISOString();
    existing.recurrence = (existing.recurrence||0)+1;
    // A repeated real-world slip reopens the correction loop. Leaving a
    // previously retired entry marked corrected would let recurrence bypass
    // retype + delayed proof entirely.
    existing.correctedByLearner = false;
    existing.rehearsedAt = null;
    writeRaw(list);
    return list;
  }
  list.unshift({ id, original, corrected, why: why||'', ruleId: ruleId||null, mistakeId: mistakeId||null, at: new Date().toISOString(), count: 1, recurrence: 0, correctedByLearner: false });
  writeRaw(list);
  return list;
}

// Retype outcomes distinguish EXPOSURE from LEARNING:
//   first correct retype  -> 'rehearsed' (the answer was just on screen)
//   correct retype after  -> 'retired'   (delayed proof, >= REHEARSE_GAP_MS)
//   >= REHEARSE_GAP_MS
export const REHEARSE_GAP_MS = 86400000; // one day

export function markCorrectedByLearner(id, typed, now = Date.now()){
  const list = readRaw();
  const e = list.find(x=> x.id===id);
  if(!e) return false;
  // Accent-insensitive, like every other typed check in the app — the drill
  // targets the correction, not the accent keys.
  const norm = (s) => String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ok = norm(e.corrected) === norm(typed);
  if(!ok) return false;
  if (e.rehearsedAt && now - e.rehearsedAt >= REHEARSE_GAP_MS) {
    // Delayed proof: the correction was reproduced from memory a day later.
    e.correctedByLearner = true;
    e.rehearsedAt = now;
  } else {
    // Exposure only — schedule the delayed proof, do not retire.
    e.rehearsedAt = e.rehearsedAt || now;
  }
  writeRaw(list);
  return e.correctedByLearner ? 'retired' : 'rehearsed';
}

export function errorNotebookStats(){
  const list = readRaw();
  const recurrences = list.reduce((a,e)=>a+(e.recurrence||0),0);
  const pending = list.filter(e=> !e.correctedByLearner).length;
  return { total: list.length, recurrences, pending };
}
