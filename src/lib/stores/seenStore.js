// Seen-set store — which Culture / RealWorld items the learner has already
// opened. These used to be raw component-level localStorage keys
// (`fp.cultureSeen`, `fp.realworldSeen`); they now live behind storageCore so
// household members each keep their own seen-lists (learner-routed with the
// one-shot legacy claim) and exports include them like every other progress
// key. Components never touch browser storage directly (see the
// storage-boundary test).
import { read, write, KEYS } from '../storageCore.js';

const MAX_SEEN = 1000; // hard cap so an ever-growing list can never eat quota

function loadSet(key) {
  const raw = read(key, []);
  return new Set(Array.isArray(raw) ? raw : []);
}

function saveSet(key, set) {
  write(key, [...set].slice(-MAX_SEEN));
}

export const getCultureSeen = () => loadSet(KEYS.cultureSeen);
export const saveCultureSeen = (set) => saveSet(KEYS.cultureSeen, set);
export const getRealWorldSeen = () => loadSet(KEYS.realworldSeen);
export const saveRealWorldSeen = (set) => saveSet(KEYS.realworldSeen, set);
