// useSessionLifecycle — App.jsx's in-flight session responsibilities, extracted:
//
//   1. persistence — every scenario/history change is mirrored to the
//      learner-namespaced in-flight session store;
//   2. restore — the saved scenario (and its transcript) rehydrate on boot;
//   3. warm-then-heal — the per-language scenario registry resolves a beat
//      after first render, so the effect reselects once it lands;
//   4. language switching — switching language resets the in-flight session
//      (scenarios and transcripts are per-language) and re-syncs i18n.
//
// Pure session plumbing: App stays responsible for composition. Everything
// here already behaved exactly this way inline in App.jsx.
import { useEffect, useState } from 'react';
import { getScenarios } from '../lib/data';
import { getActiveSession, setActiveSession, clearActiveSession } from '../lib/storage';
import { warmScenarios } from '../lib/vocabAsync';
import { syncLanguage } from '../lib/i18n';

export default function useSessionLifecycle() {
  const [scenario, setScenario] = useState(() => {
    const saved = getActiveSession();
    return (saved && getScenarios().find((s) => s.id === saved.scenarioId)) || getScenarios()[0] || null;
  });
  useEffect(() => {
    if (scenario) return undefined;
    let on = true;
    warmScenarios().then(() => {
      if (!on) return;
      const saved = getActiveSession();
      setScenario((saved && getScenarios().find((s) => s.id === saved.scenarioId)) || getScenarios()[0] || null);
    });
    return () => { on = false; };
  }, [scenario]);
  const [history, setHistory] = useState(() => {
    const saved = getActiveSession();
    return saved && Array.isArray(saved.history) ? saved.history : [];
  });

  // Persist the in-flight session on every change. A session with no turns
  // yet still clears the slot so a stale transcript never reappears.
  useEffect(() => {
    if (!scenario) return; // registry still resolving (DE/ES cold start)
    if (history.length > 0) setActiveSession(scenario.id, history);
    else clearActiveSession();
  }, [scenario, history]);

  const switchLanguage = (nextLanguage) => {
    syncLanguage(nextLanguage);
    clearActiveSession();
    setScenario(getScenarios()[0]);
    setHistory([]);
  };

  return { scenario, setScenario, history, setHistory, switchLanguage };
}
