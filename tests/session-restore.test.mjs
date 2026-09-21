// Deterministic in-flight session restore — the "survives a reload" contract.
//
// Renders the real useSessionLifecycle hook under jsdom and asserts the exact
// rules that closed the restore race:
//   · a saved session with a known scenario restores scenario + transcript
//     and re-persists the SAME content (never cleared, never mis-attributed);
//   · the hydration window (registry not yet resolved) writes nothing;
//   · a saved session whose scenario no longer exists is invalidated ON
//     PURPOSE (slot cleared, transcript dropped) instead of being pinned to
//     the first scenario;
//   · no saved session → first scenario, no crash;
//   · a malformed slot degrades to "no session";
//   · switchLanguage intentionally clears the slot and re-lands on the new
//     registry's first scenario.
// Run: node --import ./tests/register-jsx.mjs tests/session-restore.test.mjs
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* Node ≥21 exposes navigator */ }
globalThis.localStorage = dom.window.localStorage;

const assert = (await import('node:assert/strict')).default;
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const storage = await import('../src/lib/storage.js');
const { savedSessionOf, planRestore } = await import('../src/lib/sessionRestore.js');
const useSessionLifecycle = (await import('../src/hooks/useSessionLifecycle.js')).default;

const ACTIVE = storage.KEYS.active;
const TURN = {
  userText: 'Bonjour, je voudrais un café.',
  evaluation: { reply: 'Bien sûr !', corrections: 'Très bien !', scores: { overall: 80 } },
  reply: 'Bien sûr !',
};

// ---- pure decision core -------------------------------------------------

assert.deepEqual(savedSessionOf(null), { scenarioId: null, history: [] });
assert.deepEqual(savedSessionOf('garbage'), { scenarioId: null, history: [] });
assert.deepEqual(savedSessionOf({ scenarioId: 42, history: 'nope' }), { scenarioId: null, history: [] });
assert.deepEqual(
  savedSessionOf({ scenarioId: 'libre', history: [TURN, null, undefined] }),
  { scenarioId: 'libre', history: [TURN] },
  'malformed turn entries are dropped, valid ones survive',
);

// Registry empty (cold start): never a scenario, never an invalidation —
// the decision is simply deferred until the registry resolves.
assert.deepEqual(planRestore({ scenarioId: 'libre', history: [TURN] }, []), { scenario: null, invalidate: false });
const first = { id: 'bistro' };
const libre = { id: 'libre' };
const registry = [first, libre];
assert.deepEqual(planRestore({ scenarioId: 'libre', history: [TURN] }, registry), { scenario: libre, invalidate: false });
assert.deepEqual(planRestore({ scenarioId: 'gone', history: [TURN] }, registry), { scenario: first, invalidate: true });
assert.deepEqual(planRestore({ scenarioId: null, history: [] }, registry), { scenario: first, invalidate: false });

// ---- hook behaviour under jsdom -----------------------------------------

function Probe({ onState }) {
  const s = useSessionLifecycle();
  onState(s);
  return null;
}

async function renderProbe(onState) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Probe, { onState })); });
  return { root, container };
}

const settle = () => new Promise((r) => setTimeout(r, 25));

// 1. A saved session with a known scenario restores scenario + transcript.
{
  localStorage.clear();
  localStorage.setItem('fp.onboarded', '1');
  localStorage.setItem(ACTIVE, JSON.stringify({ scenarioId: 'libre', history: [TURN] }));
  let latest = null;
  const { root, container } = await renderProbe((s) => { latest = s; });
  await act(async () => { await settle(); });
  assert.equal(latest.scenario?.id, 'libre', 'restored scenario is the saved one');
  assert.equal(latest.history.length, 1, 'restored transcript intact');
  assert.equal(latest.restoring, false, 'hydration finished');
  const slot = JSON.parse(localStorage.getItem(ACTIVE));
  assert.equal(slot.scenarioId, 'libre', 'slot still attributes the transcript to its scenario');
  assert.equal(slot.history.length, 1, 'the valid session was never cleared');
  root.unmount();
  container.remove();
}

// 2. Nothing saved → first scenario, empty history, no crash.
{
  localStorage.clear();
  let latest = null;
  const { root, container } = await renderProbe((s) => { latest = s; });
  await act(async () => { await settle(); });
  assert.ok(latest.scenario?.id, 'a default scenario lands');
  assert.equal(latest.history.length, 0);
  assert.equal(localStorage.getItem(ACTIVE), null, 'no phantom session is written');
  root.unmount();
  container.remove();
}

// 3. A saved scenario the registry does not know is invalidated deliberately:
//    transcript dropped, slot cleared, first scenario restored.
{
  localStorage.clear();
  localStorage.setItem(ACTIVE, JSON.stringify({ scenarioId: 'deleted-long-ago', history: [TURN] }));
  let latest = null;
  const { root, container } = await renderProbe((s) => { latest = s; });
  await act(async () => { await settle(); });
  assert.equal(latest.history.length, 0, 'orphan transcript is not pinned to another scenario');
  assert.equal(localStorage.getItem(ACTIVE), null, 'stale slot cleared on purpose');
  root.unmount();
  container.remove();
}

// 4. A malformed slot degrades to "no session" (and never throws).
{
  localStorage.clear();
  localStorage.setItem(ACTIVE, '{"scenarioId": 12, "history": "oops"');
  let latest = null;
  const { root, container } = await renderProbe((s) => { latest = s; });
  await act(async () => { await settle(); });
  assert.ok(latest.scenario?.id, 'app still boots onto a scenario');
  assert.equal(latest.history.length, 0);
  root.unmount();
  container.remove();
}

// 5. Language switching intentionally clears the session and lands on the new
//    registry's first scenario (per-language sessions by design).
{
  localStorage.clear();
  localStorage.setItem(ACTIVE, JSON.stringify({ scenarioId: 'libre', history: [TURN] }));
  let latest = null;
  const { root, container } = await renderProbe((s) => { latest = s; });
  await act(async () => { await settle(); });
  await act(async () => { latest.switchLanguage('de'); await settle(); });
  assert.equal(latest.history.length, 0, 'switch clears the transcript');
  assert.equal(localStorage.getItem(ACTIVE), null, 'switch clears the slot');
  assert.ok(latest.scenario?.id.startsWith('de-'), `German scenario restored (got ${latest.scenario?.id})`);
  root.unmount();
  container.remove();
}

// 6. Live persistence: turns written after hydration reach the slot.
{
  localStorage.clear();
  let latest = null;
  const { root, container } = await renderProbe((s) => { latest = s; });
  await act(async () => { await settle(); });
  const scenarioId = latest.scenario.id;
  await act(async () => { latest.setHistory([TURN]); await settle(); });
  const slot = JSON.parse(localStorage.getItem(ACTIVE));
  assert.equal(slot.scenarioId, scenarioId, 'live turns persist under the active scenario');
  assert.equal(slot.history.length, 1);
  root.unmount();
  container.remove();
}

console.log('session-restore tests: PASS');
