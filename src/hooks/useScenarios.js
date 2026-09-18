// React binding for the per-language scenario registries in lib/data.js —
// the scenario mirror of vocabAsync's useAllEntries.
//
// Returns `null` while the active language's scenario chunk is still loading
// (registry languages only — French resolves synchronously in one microtask),
// otherwise the scenario array. The same `null`-means-loading convention as
// useAllEntries: consumers gate plan-building on it and can never mistake a
// cold-start empty list for a genuinely empty library.
//
// The first hook consumer to mount also warms the registry, so the boot
// prefetch for the scenario chunk is simply "the app rendered".

import { useEffect, useState } from 'react';
import { getScenariosAsync } from '../lib/data';
import { onContentLanguageChange } from '../lib/content/active';

export function useScenarios() {
  const [scenarios, setScenarios] = useState(null);
  useEffect(() => {
    let on = true;
    getScenariosAsync().then((s) => { if (on) setScenarios(s); });
    const off = onContentLanguageChange(() => {
      setScenarios(null); // language switched → back to loading, never stale
      getScenariosAsync().then((s) => { if (on) setScenarios(s); });
    });
    return () => { on = false; off(); };
  }, []);
  return scenarios;
}
