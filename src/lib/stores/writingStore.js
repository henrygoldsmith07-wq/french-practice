// Writing-history store — the samples a learner has analysed in the Writing
// Coach. This used to be a raw component-level localStorage key
// (`writing_history`) written directly by components/AIWritingCoach.jsx, which
// bypassed the storage boundary in two ways at once: it skipped the
// learner-namespacing that keeps household members' histories separate, and it
// kept the history outside exportProgress()'s KEYS scan, so a learner who
// exported their progress lost their writing history. It now lives behind
// storageCore so each household member keeps their own history and exports
// include it like every other progress key. Components never touch browser
// storage directly (see the storage-boundary test).
import { read, write, KEYS } from '../storageCore.js';

const MAX_HISTORY = 20; // matches the cap AIWritingCoach has always applied

export const getWritingHistory = () => {
  const raw = read(KEYS.writingHistory, []);
  return Array.isArray(raw) ? raw : [];
};

export const saveWritingHistory = (entries) => {
  write(KEYS.writingHistory, (Array.isArray(entries) ? entries : []).slice(0, MAX_HISTORY));
};
