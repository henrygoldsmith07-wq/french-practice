// One owner for every async dependency the Today session needs. This hook
// exists because the previous lifecycle had each dependency wired by hand —
// a module-level cache here, a local state there — and the plan's useMemo did
// not depend on the readiness signals, so whichever lazy chunk resolved LAST
// was invisible: Today could stay blank forever depending purely on module
// resolution order.
//
// Contract:
//   - every dependency settles independently → the deps object changes
//     identity on each arrival, so a memo keyed on it replans no matter what
//     order modules resolve in;
//   - a FAILED dynamic import is never cached and never hangs: it lands in
//     `failed` and can be retried (`retry()`) — a fresh import attempt, not a
//     replayed rejection;
//   - dependencies the ACTIVE LANGUAGE cannot use (French-authored libraries
//     under a beta language) never load at all — they settle as `true`
//     ("not needed"), which also keeps French-only chunks out of German and
//     Spanish sessions (capability matrix: lib/capabilities.js);
//   - a language switch restarts the whole cycle (content re-resolves in the
//     new language, never stale).
//
// Research measurement (`study`) is treated like a genuine dependency: the
// plan waits for it while it is in flight (so instrumentation is never
// silently skipped), but a FAILURE degrades to a no-measurement plan instead
// of blocking practice — see TodaySession.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { onContentLanguageChange } from '../lib/content/active.js';
import { hasCapabilityNow } from '../lib/capabilities.js';
import { loadAllEntries } from '../lib/vocabAsync.js';
import { getScenariosAsync } from '../lib/data.js';
import { ensureGrammarTopics } from '../lib/todayCapabilities.js';
import { loadListeningTracks } from '../lib/listeningAsync.js';
import { loadStudyFlow } from '../lib/studyFlowAsync.js';

export const EMPTY_DEPS = Object.freeze({
  entries: null,      // vocabulary library (per-language chunk) — null = loading
  scenarios: null,    // scenario registry (per-language chunk) — null = loading
  grammar: false,     // grammar topic index — true when ready (or not needed)
  listening: null,    // listening track library — null = loading
  study: null,        // study module — null = loading
  failed: Object.freeze({}), // name → true for each dependency whose import rejected
});

// The production loaders. `grammar` reports boolean readiness (the grammar
// loader resolves even when the import failed, so a false readiness is
// surfaced as a REJECTION — see below — so the failure lands in deps.failed
// and the UI can offer a retry). The rest report the loaded value and reject
// on failure. Capability gating does NOT live here: it is structural, in the
// hook (SKIP_FOR_CAPABILITY below), so it applies to every impl — including
// test injections — and a beta language never downloads French-authored
// chunks no matter who wires the loaders.
export const TODAY_DEPS = {
  entries: () => loadAllEntries(),
  scenarios: () => getScenariosAsync(),
  grammar: () => ensureGrammarTopics().then((ready) => {
    // ensureGrammarTopics swallows its own failure (retryable by design) and
    // resolves with the readiness signal — surface a false as a REJECTION so
    // the failure lands in deps.failed instead of Today waiting forever on a
    // library that silently never arrived.
    if (!ready) throw new Error('grammar-library-unavailable');
    return ready;
  }),
  listening: () => loadListeningTracks(),
  study: () => loadStudyFlow(),
};

// Dependencies whose content is French-authored: skipped entirely (settled as
// `true`, "not needed") for languages without the capability row, so a German
// or Spanish Today never even downloads those chunks.
const SKIP_FOR_CAPABILITY = Object.freeze({
  grammar: 'grammar',
  listening: 'listening-library',
});

/** Test seam: production defaults with individual loaders overridden. */
export function createTodayDeps(overrides = {}) {
  return { ...TODAY_DEPS, ...overrides };
}

export function useTodayDeps(depsImpl = TODAY_DEPS) {
  const [attempt, setAttempt] = useState(0);
  const [deps, setDeps] = useState(EMPTY_DEPS);

  useEffect(() => {
    let on = true;
    setDeps(EMPTY_DEPS);
    const settle = (name) => (value) => {
      if (on) setDeps((s) => ({ ...s, [name]: value }));
    };
    const fail = (name) => () => {
      // Rejections are never cached by the loaders; record the failure so the
      // UI can offer a retry, and so a failing study module degrades the plan
      // instead of blocking it.
      if (on) setDeps((s) => ({ ...s, failed: { ...s.failed, [name]: true } }));
    };
    for (const name of Object.keys(depsImpl)) {
      const capability = SKIP_FOR_CAPABILITY[name];
      if (capability && !hasCapabilityNow(capability)) {
        // Not needed for this language — settle immediately as a sentinel.
        settle(name)(true);
        continue;
      }
      Promise.resolve()
        .then(depsImpl[name])
        .then(settle(name), fail(name));
    }
    // Language switch → full re-resolution in the new language.
    const off = onContentLanguageChange(() => setAttempt((a) => a + 1));
    return () => { on = false; off(); };
  }, [attempt, depsImpl]);

  // Retry re-runs every loader. Loaders never cache rejections, so this is a
  // genuine fresh attempt (a real fix, never a timed blind retry).
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const failed = useMemo(() => Object.keys(deps.failed), [deps.failed]);
  return { ...deps, failed, retry };
}
