// Study-glue loader: the Evidence Study module is measurement infrastructure
// and must never ride the entry graph. It loads with the Today session (the
// lazy ChatArena/HeldOutCheck chunks pull the same module) and the plan gates
// on it so instrumentation is resolved, never silently skipped — but a FAILED
// load must never block practice: Today continues without measurement.
//
// Rejections are NEVER cached: a failed import clears the in-flight promise
// so the next call (user retry, next session open) attempts a fresh import.
// Only a resolved module is memoised.
let _mod = null;
let _loading = null;

export function loadStudyFlow() {
  if (_mod) return Promise.resolve(_mod);
  if (_loading) return _loading; // dedupe concurrent callers
  _loading = import('./studyFlow')
    .then((m) => { _mod = m; _loading = null; return m; })
    .catch((err) => { _loading = null; throw err; });
  return _loading;
}

/** True once the module has resolved (callStudy is then a live call). */
export function isStudyFlowLoaded() { return Boolean(_mod); }

/** Loaded module or null — study calls made through getStudyFlow are safe no-ops before resolution. */
export function getStudyFlow() { return _mod; }

/** Test/diagnostic reset: forget the module AND any in-flight/rejected attempt. */
export function resetStudyFlow() { _mod = null; _loading = null; }

/** Safe optional call: no-op (returns undefined) until the module has loaded. */
export function callStudy(name, ...args) {
  const mod = _mod;
  return mod?.[name]?.(...args);
}
