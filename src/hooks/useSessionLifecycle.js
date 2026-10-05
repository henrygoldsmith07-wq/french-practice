// useSessionLifecycle — App.jsx's in-flight session responsibilities:
//
//   1. restore    — the saved scenario (and its transcript) rehydrate on boot
//                   through a deterministic two-phase state machine;
//   2. warm-then-heal — the per-language scenario registry resolves a beat
//                   after first render; restoration completes when it lands;
//   3. persistence — every scenario/history change is mirrored to the
//                   learner-namespaced in-flight session store — but only
//                   AFTER hydration, so the cold registry window can never
//                   write an empty session or a mis-attributed transcript;
//   4. language switching — an intentional reset (scenarios and transcripts
//                   are per-language) that also re-syncs i18n.
//
// Why the two phases: on a cold boot getScenarios() serves [] until the
// per-language registry chunk resolves, while the saved transcript is
// available synchronously. Persisting during that window is the race that
// could erase a valid session on reload (empty history → clearActiveSession,
// or a fallback scenario → mis-attribute the transcript). Persistence is
// therefore gated on phase === 'ready', which is reached exactly once the
// registry has resolved — whether the restore found a match, invalidated a
// stale slot, or had nothing to restore.
//
// Pure session plumbing: App stays responsible for composition. The restore
// rules themselves live in lib/sessionRestore.js (unit-tested without React).
import { useEffect, useRef, useState } from 'react';
import { getScenarios } from '../lib/data';
import { getActiveSession, setActiveSession, clearActiveSession, activeLearnerId } from '../lib/storage';
import { warmScenarios } from '../lib/vocabAsync';
import { syncLanguage } from '../lib/i18n';
import { savedSessionOf, planRestore } from '../lib/sessionRestore';

export default function useSessionLifecycle() {
  // The synchronous boot read happens exactly once, before first paint: the
  // transcript is held here and in state while the registry loads.
  const [saved] = useState(() => savedSessionOf(getActiveSession()));
  const [history, setHistory] = useState(saved.history);
  const [scenario, setScenario] = useState(null); // restored when the registry resolves
  // 'loading' → the registry has not resolved; persistence is suspended so
  // the hydration window can never erase or mis-write the saved session.
  // 'ready' → the registry resolved (or failed closed); persistence is live.
  const [phase, setPhase] = useState('loading');
  // Set when the learner switches language mid-boot: the boot-time restore
  // must not resurrect a session that switchLanguage just invalidated.
  const switchedRef = useRef(false);
  // Which household member the in-flight transcript belongs to.
  const ownerRef = useRef(activeLearnerId());

  useEffect(() => {
    let on = true;
    // finally, not then: a failed registry chunk must still end hydration
    // (closed) rather than leave the app persistence-deaf forever.
    warmScenarios().finally(() => {
      if (!on) return;
      const scenarios = getScenarios();
      if (switchedRef.current) {
        // A language switch already reset the session: land on the new
        // registry's first scenario, restore nothing.
        setScenario(scenarios[0] || null);
      } else {
        const plan = planRestore(saved, scenarios);
        setScenario(plan.scenario);
        if (plan.invalidate) {
          // The saved scenario no longer exists (removed content, or a
          // foreign-language session that bypassed switchLanguage): drop the
          // transcript and clear the slot deliberately.
          setHistory([]);
          clearActiveSession();
        }
      }
      setPhase('ready');
    });
    return () => { on = false; };
  }, [saved]);

  // The scenario registry resolves asynchronously (DE/ES cold start). If the
  // learner navigates away first, the `finally` below must not set state.
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; };
  }, []);

  // Persist the in-flight session on every change — but only once hydration
  // is complete. A session with no turns yet still clears the slot so a
  // stale transcript never reappears; that rule simply cannot fire during
  // the hydration window anymore.
  useEffect(() => {
    if (phase !== 'ready' || !scenario) return; // registry still resolving (DE/ES cold start)
    // Whose session is this? The persist path routes by the ACTIVE member at
    // write time, so a household switch that happened underneath this hook
    // would write the previous member's transcript into the new member's
    // namespace — one learner's French conversation handed to another, who
    // then restores it on next load. Profile switches members without
    // unmounting App, so nothing else in here was told. Checked at the write
    // point itself: the next turn the learner takes changes `history`, this
    // effect runs, and it drops the foreign transcript instead of persisting
    // it.
    const current = activeLearnerId();
    if (current !== ownerRef.current) {
      ownerRef.current = current;
      setPhase('loading');
      setHistory([]);
      setScenario(null);
      warmScenarios().finally(() => {
        if (unmountedRef.current) return;
        setPhase('ready');
        setScenario(getScenarios()[0] || null);
      });
      return;
    }
    if (history.length > 0) setActiveSession(scenario.id, history);
    else clearActiveSession();
  }, [phase, scenario, history]);

  const switchLanguage = (nextLanguage) => {
    switchedRef.current = true;
    syncLanguage(nextLanguage);
    clearActiveSession();
    setHistory([]);
    const first = getScenarios()[0] || null;
    setScenario(first);
    if (!first) {
      // The new language's registry may still be loading: resolve its first
      // scenario when it lands. `cur ||` keeps any scenario the learner has
      // already picked from the new registry in the meantime.
      warmScenarios().then(() => setScenario((cur) => cur || getScenarios()[0] || null));
    }
  };

  return { scenario, setScenario, history, setHistory, switchLanguage, restoring: phase === 'loading' };
}
