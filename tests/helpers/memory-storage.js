// ONE localStorage double for the whole test suite.
//
// This used to be copy-pasted into ~34 test files in five different shapes,
// and the incomplete variants — the ones exposing only getItem/setItem/
// removeItem — silently disabled every code path that ENUMERATES storage.
// `purgeLearnerData` (the GDPR member-removal) and `exportProgress`'s
// learner loop both iterate `localStorage.length` / `localStorage.key(i)`;
// against an incomplete double, `0 < undefined` is false, the loop never ran,
// and the function returned 0 / `{}` while every test still passed.
//
// The only test that noticed passed by luck of which file it sat in. A double
// that is missing half the Storage interface is worse than no double: it makes
// deletion paths look correct while removing nothing.
//
// It is a full `Storage`: getItem, setItem, removeItem, clear, key, length.

/**
 * A complete in-memory Storage.
 * @param {Record<string,string>} [seed] initial contents
 */
export function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => (values.has(String(key)) ? values.get(String(key)) : null),
    setItem: (key, value) => { values.set(String(key), String(value)); },
    removeItem: (key) => { values.delete(String(key)); },
    clear: () => { values.clear(); },
    key: (i) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
    // Test affordance: inspect what actually landed.
    _entries: () => Object.fromEntries(values),
  };
}

/**
 * Install a fresh double on globalThis and return it.
 * Tests assign `globalThis.localStorage` before importing storage modules,
 * because the stores capture storage at call time, not import time.
 */
export function installMemoryStorage(seed) {
  const store = memoryStorage(seed);
  globalThis.localStorage = store;
  return store;
}

/** A cache-busting suffix so each test gets fresh module-level state. */
export function freshModuleTag() {
  return `?v=${Date.now()}.${Math.random()}`;
}