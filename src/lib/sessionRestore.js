// Pure decision core for the in-flight session restore (the "survives a
// reload" contract). Kept out of the React hook so the exact rules — what may
// be restored, what must be invalidated, and when persistence is allowed to
// write — can be unit-tested without a browser or a component tree.
//
// The race this module exists to close: on a cold boot the per-language
// scenario registry resolves a beat AFTER first render (getScenarios() serves
// [] until then), while the saved transcript is available synchronously. A
// naive "persist whatever is in state" effect can therefore run in the
// hydration window with an empty scenario list and erase or mis-attribute a
// valid saved session. The rules here make restoration deterministic:
//
//   · the saved read is validated once (savedSessionOf) — malformed slots
//     degrade to "no session", never to a crash or a half-session;
//   · the saved scenario is restored only when the registry actually knows
//     it (planRestore) — a transcript is never silently attributed to a
//     different scenario;
//   · a saved session whose scenario no longer exists is invalidated
//     deliberately (planRestore → invalidate), not by a timing accident;
//   · callers must not persist anything until the registry has resolved
//     (phase 'ready' in useSessionLifecycle), so the cold window cannot
//     clear a valid session.

/** Validate one raw active-session read into a safe {scenarioId, history}. */
export function savedSessionOf(raw) {
  if (!raw || typeof raw !== 'object') return { scenarioId: null, history: [] };
  const scenarioId = typeof raw.scenarioId === 'string' && raw.scenarioId.trim()
    ? raw.scenarioId
    : null;
  const history = Array.isArray(raw.history) ? raw.history.filter(Boolean) : [];
  return { scenarioId, history };
}

/**
 * Decide what a resolved scenario registry means for the saved session.
 * Returns { scenario, invalidate }:
 *   · scenario  — the scenario to restore (null while the registry is empty);
 *   · invalidate — true when a saved session points at a scenario the
 *     registry does not know: its transcript must be dropped and the slot
 *     cleared ON PURPOSE (stale content or a foreign-language session that
 *     never went through switchLanguage), instead of pinning the transcript
 *     to whichever scenario happens to be first.
 */
export function planRestore(saved, scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return { scenario: null, invalidate: false };
  }
  const match = saved.scenarioId
    ? scenarios.find((s) => s && s.id === saved.scenarioId)
    : null;
  if (match) return { scenario: match, invalidate: false };
  return { scenario: scenarios[0], invalidate: Boolean(saved.scenarioId) };
}
