// Lightweight learning-path persistence.
//
// Keep this module free of roadmap/content imports so App can restore the saved
// path on boot without eagerly loading the full French-authored path engine.
import { read, write, remove, KEYS } from './storageCore.js';

const KEY = KEYS.path;

export function getPath() {
  try {
    return read(KEY, null);
  } catch {
    return null;
  }
}

export function savePath(path) {
  try {
    write(KEY, path);
  } catch { /* storage unavailable */ }
}

export const clearPath = () => remove(KEY);
