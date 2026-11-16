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

// The raw key the coach used before this store existed. A learner who used
// the coach on an older build still has samples there; moving the store to
// storageCore must not quietly hide them. The legacy key is read through
// storageCore too, so this file still never touches localStorage directly.
const LEGACY_KEY = 'writing_history';

const migrateLegacy = () => {
  const legacy = read(LEGACY_KEY, null);
  if (!Array.isArray(legacy) || legacy.length === 0) return [];
  const kept = legacy.slice(0, MAX_HISTORY);
  write(KEYS.writingHistory, kept);
  // Deliberately leave the legacy key in place: a migration must never delete
  // the only copy of learner data, and it makes this read idempotent.
  return kept;
};

export const getWritingHistory = () => {
  const raw = read(KEYS.writingHistory, null);
  if (Array.isArray(raw)) return raw;
  return migrateLegacy();
};

export const saveWritingHistory = (entries) => {
  write(KEYS.writingHistory, (Array.isArray(entries) ? entries : []).slice(0, MAX_HISTORY));
};
