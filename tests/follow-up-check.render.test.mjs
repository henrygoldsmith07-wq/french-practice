// Render test: the authored follow-up check — the grammar/writing TRANSFER and
// DELAYED RETEST segment, i.e. the step the whole repair loop exists for.
//
// Run: node --import ./tests/register-jsx.mjs tests/follow-up-check.render.test.mjs
//
// The component CRASHED on the first option tap and the regression is
// invisible to a unit test of its data helpers, because the fault was in a
// `useMemo` dependency array: `picked` was listed, so the memo returned `null`
// on precisely the render the learner was looking at, and the next line
// dereferenced it. That threw into the ROOT error boundary
// (src/main.jsx), which replaced the entire app with "Oups — something broke",
// so `onDone` never fired, no success was recorded, and the due check
// stayed owed forever.
//
// Contract note: `onDone` is TodaySession's `advance` — it takes no arguments.
// The pass/fail OUTCOME is recorded by the component itself into the
// learner-error store, so that store is what this test asserts on.
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* Node ≥21 exposes navigator */ }
globalThis.localStorage = dom.window.localStorage;

// No ErrorBoundary anywhere: a throw must reach us, not be swallowed.
const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); origError(...a); };

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const FollowUpCheck = (await import('../src/components/FollowUpCheck.jsx')).default;
const storage = await import('../src/lib/storage.js');

const assert = (await import('node:assert/strict'));

const TASK = {
  id: 'fu-1',
  kind: 'authored-transfer',
  skill: 'grammar',
  key: 'passe-compose-negation',
  label: 'passé composé negation',
  targetId: 'w-42',
  type: 'transfer',
  prompt: 'Use it somewhere new',
  why: 'You repaired this earlier. Here are different sentences for the same rule.',
  exercises: [
    { q: 'Which sentence is correct?', options: ['Il a mangé', 'Il a mangé pas', 'Il mangeait'], answer: 0 },
    { q: 'Pick the right form.', options: ['que', 'quoi', 'qui'], answer: 1 },
  ],
};

const advanced = [];
const container = document.getElementById('root');
const root = createRoot(container);

await act(async () => {
  root.render(React.createElement(FollowUpCheck, {
    task: TASK,
    apiKey: '',
    // The real contract: onDone is TodaySession's `advance` and takes no
    // arguments — the pass/fail outcome is recorded inside the component.
    onDone: () => advanced.push(true),
  }));
});

assert.ok(container.innerHTML.includes('Which sentence is correct?'), 'the question renders');

const click = async (label) => {
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent.trim() === label && !x.disabled);
  assert.ok(b, `a "${label}" button should be available`);
  await act(async () => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
};

// THE REGRESSION: this click used to throw "Cannot read properties of null".
await click('Il a mangé');

assert.ok(
  !errors.some((e) => /Cannot read properties of null/.test(e)),
  `selecting an option must not crash, got: ${errors.join(' | ')}`,
);
assert.ok(container.innerHTML.includes('Which sentence is correct?'), 'the question is still on screen after answering');

// Finish the run: the first item is already answered correctly above. The
// outcome must be recorded by the component (not passed to onDone), or the
// due check is never discharged and stays owed.
await click('Next item');
await click('quoi');                // item 2, correct
await click('See result');
await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

// The outcome reached the learning-evidence ledger: a clean pass on unseen
// items opens (or advances) the evidence cycle for exactly this weakness.
// Successes never create learner-error entries from nothing — they attach to
// the repair cycle — so the ledger is the durable, assertable record.
const rawEvidence = JSON.parse(globalThis.localStorage.getItem('fp.learningEvidence.v1') || '{"cycles":[]}');
const cycle = (rawEvidence.cycles || []).find((c) => c?.target?.key === TASK.key);
assert.ok(
  cycle,
  `a clean pass records evidence for the repaired weakness (cycles: ${JSON.stringify((rawEvidence.cycles || []).map((c) => c?.target?.key))})`,
);

// The session-advance contract: the Done button moves the session on.
await click('Done');
assert.equal(advanced.length, 1, 'the Done button advances the session exactly once');

console.error = origError;
console.log('FollowUpCheck render test: PASS');
