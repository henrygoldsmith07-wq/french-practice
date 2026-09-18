// Async access to the vocabulary library and scenario registry, for code that
// must not pull the content chunks into its own bundle.
//
// vocab.js composes the active language's packs from small per-language
// registry modules (content/de-vocab, content/es-vocab, vocab-frequency-*),
// which Vite splits into their own lazy chunks. Statically importing vocab.js
// from a component drags every language's dictionaries into that component's
// chunk graph — which is how the German and Spanish dictionaries ended up
// inside the app's first-load JS. data.js applies the same registry pattern to
// roleplay scenarios (content/de.js, content/es.js).
//
// This module is the ONE async door to both libraries:
//   - loadAllEntries(): promise-based, shared, retry-on-failure
//   - useAllEntries():  React hook, `null` means "still loading", reloads
//                       when the learner switches language
//   - warmScenarios() / useScenarios(): the same trio for scenarios
//   - useDueCount():    the ONE live count of cards due for review
//
// The `null`-means-loading convention matters: an empty array is a RESOLVED
// (genuinely empty) library. Consumers that gate "empty deck → skip" effects
// on `entries !== null` can never race the chunk load — the bug class that
// once skipped whole session segments.
//
// Use `allEntries` statically ONLY from modules that are themselves lazy
// (screens behind Learn/Progress and the already-lazy hub chunks). Anything
// reachable from the entry chunk — TodaySession and its runners — must go
// through here.

import { useEffect, useState } from 'react';
import { contentLang, onContentLanguageChange } from './content/active.js';
import { useScenarios } from '../hooks/useScenarios.js';
import {
  dueEntries, notebookAsEntries, NEW_CARD_CAP,
} from './memory.js';
import { getSrs, getNotebook } from './storage.js';

let resolved = null; // promise for the CURRENT language's library
let resolvedLang = null; // which language `resolved` belongs to

/**
 * Resolve to the full entry library for the active language (exactly as
 * allEntries() returns). Concurrent callers share one import; switching
 * language re-resolves; failures are not cached so a transient error can be
 * retried.
 */
export function loadAllEntries() {
  const lang = contentLang();
  if (!resolved || resolvedLang !== lang) {
    resolvedLang = lang;
    resolved = import('./vocab').then((m) => m.allEntriesAsync());
    resolved.catch(() => { resolved = null; resolvedLang = null; });
  }
  return resolved;
}

/**
 * React binding for loadAllEntries. Returns `null` while the library chunk
 * loads (and re-loads after a language switch), otherwise the entries array.
 *
 *   const entries = useAllEntries();
 *   if (entries === null) return <Loading />;
 *   // entries is resolved — empty means genuinely empty.
 */
export function useAllEntries() {
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    let on = true;
    setEntries(null); // language switched → back to loading, never stale
    loadAllEntries().then((e) => { if (on) setEntries(e); });
    const off = onContentLanguageChange(() => {
      setEntries(null);
      loadAllEntries().then((e) => { if (on) setEntries(e); });
    });
    return () => { on = false; off(); };
  }, []);
  return entries;
}

/**
 * Prefetch the active language's scenario registry — the boot prefetch for
 * the scenario chunk. Fire-and-forget; the promise is shared, so this costs
 * nothing if something else already started the load. (The scenario chunk is
 * tiny, so even a miss is cheap — see lib/data.js.)
 */
export function warmScenarios() {
  return import('./data').then((m) => m.getScenariosAsync());
}

/**
 * React binding for the scenario registries. Returns `null` while the active
 * language's scenario chunk loads (registry languages only — French resolves
 * synchronously), otherwise the scenario array. Mirrors useAllEntries.
 */
export { useScenarios };

/**
 * The ONE live count of cards due for review, in the active language.
 *
 * Replaces four hand-rolled copies of `loadAllEntries → dueEntries → count`
 * (App's due-count effect, App's OS-badge effect, App's reminder effect,
 * HomeDashboard's stat) that had already drifted: the OS badge was missing the
 * language-switch signal and HomeDashboard's count omitted NEW_CARD_CAP.
 *
 * Returns `null` while the library loads; a number otherwise. Recomputes on
 * language switch and on every change of `bump` — pass anything that can
 * change SRS or notebook state (xp, streakTick, tab, path, a session-close
 * tick).
 */
export function useDueCount(bump = 0) {
  const [dueCount, setDueCount] = useState(null);
  // A language switch swaps the whole library behind the same hook — without
  // this the count (and the OS badge fed from it) keeps advertising the
  // previous language's due cards until an unrelated tick.
  const [langTick, setLangTick] = useState(0);
  useEffect(() => onContentLanguageChange(() => setLangTick((t) => t + 1)), []);
  useEffect(() => {
    let stale = false;
    if (langTick > 0) setDueCount(null); // switched → loading, never stale
    loadAllEntries().then((entries) => {
      if (stale) return;
      const srs = getSrs();
      const due = dueEntries(
        [...entries, ...notebookAsEntries(getNotebook())],
        srs,
        Date.now(),
        { newCardCap: NEW_CARD_CAP },
      ).length;
      setDueCount(due);
    });
    return () => { stale = true; };
  }, [bump, langTick]);
  return dueCount;
}
