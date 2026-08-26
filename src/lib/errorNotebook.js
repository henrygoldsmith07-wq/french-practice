// Error notebook — every correction is stored with why + recurrence and surfaced as drills.
// Require learner correction (retype) rather than just showing the answer.

import { recordWritingGap } from './storage.js';

const KEY = 'fp.errorNotebook';

function readRaw(){ try{ const v=localStorage.getItem(KEY); return v? JSON.parse(v): []; }catch{ return []; } }
function writeRaw(v){ try{ localStorage.setItem(KEY, JSON.stringify(v.slice(0,200))); }catch{} }

export function getErrorNotebook(){ return readRaw(); }

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
  if(existing){ existing.count = (existing.count||1)+1; existing.lastAt = new Date().toISOString(); existing.recurrence = (existing.recurrence||0)+1; writeRaw(list); return list; }
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
