// Today-session async lifecycle — regression tests for the bug class where
// the plan's useMemo did not depend on its readiness signals and Today could
// stay blank forever depending purely on module resolution order.
//
// These tests render the REAL TodaySession (jsdom) and inject per-dependency
// loaders (the `depsImpl` test seam) to force:
//   · different module-resolution orders — every order must end in a plan;
//   · study import failure — practice continues WITHOUT measurement;
//   · a failed import is retryable, never a cached rejection;
//   · genuine deps still loading show the loading state, never a blank.
// Run: node --import ./tests/register-jsx.mjs tests/today-deps.render.test.mjs
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
const TodaySession = (await import('../src/components/TodaySession.jsx')).default;
const { setGrammarTopics } = await import('../src/lib/todayCapabilities.js');
// The REAL study module — injected like the lazy chunk would deliver it.
const STUDY = await import('../src/lib/studyFlow.js');

// Seeded learner state: a mistake-graph node so the drill slot has a target.
storage.saveMistakeGraph([{
  id: 'mg-test', concept: 'passe-compose', type: 'grammar',
  errorCount: 3, lastMissAt: Date.now() - 86400000, mastery: 0.2, recurrence: 2,
  modes: ['conversation'], overdueBy: 86400000,
}]);

const ENTRIES = [{ id: 'w-test', fr: 'la maison', en: 'the house', cefr: 'A1', example: 'La maison est grande.', exampleEn: 'The house is big.', packId: 'fr-test' }];
const SCENARIOS = [{ id: 'cafe', title: 'Au café', opener: 'Bonjour !' }];
const TRACKS = [{ id: 'tr-1', title: 'Track', kind: 'dialogue', cefr: 'A1', lines: [], questions: [] }];
setGrammarTopics([{ id: 'g-passe', title: 'Passé composé', cefr: 'B1', drills: [{ q: 'il ___ mangé', options: ['a', 'at', 'est'] }] }]);

// Deferred loaders: each test resolves dependencies in the order it chooses.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const VALUE = { entries: ENTRIES, scenarios: SCENARIOS, grammar: true, listening: TRACKS, study: STUDY };
function loaders() {
  const d = {};
  for (const name of Object.keys(VALUE)) d[name] = deferred();
  return d;
}
const impl = (d) => ({
  entries: () => d.entries.promise,
  scenarios: () => d.scenarios.promise,
  grammar: () => d.grammar.promise,
  listening: () => d.listening.promise,
  study: () => d.study.promise,
});
async function resolveAll(d, names) {
  for (const name of names) {
    await act(async () => {
      d[name].resolve(VALUE[name]);
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}
async function renderToday(depsImpl) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TodaySession, {
      open: true, onClose: () => {}, minutes: 20, apiKey: '', mockMode: true,
      level: 'B1', ttsRate: 1, depsImpl,
    }));
    await new Promise((r) => setTimeout(r, 10));
  });
  return { root, container };
}
async function close({ root, container }) {
  await act(async () => { root.unmount(); });
  container.remove();
}
const text = (container) => container.innerHTML;
const LOADING = "Preparing today's session";

// ---- 1. every resolution order ends in a plan ----------------------------

const ORDERS = [
  ['entries', 'scenarios', 'grammar', 'listening', 'study'],
  ['study', 'listening', 'grammar', 'scenarios', 'entries'],
  ['listening', 'study', 'entries', 'grammar', 'scenarios'],
  ['grammar', 'scenarios', 'study', 'listening', 'entries'],
];
for (const order of ORDERS) {
  {
    const d = loaders();
    const ui = await renderToday(impl(d));
    try {
      assert.ok(text(ui.container).includes(LOADING), 'shows the loading state while deps resolve');
      await resolveAll(d, order);
      assert.ok(!text(ui.container).includes(LOADING), 'loading state is gone once deps resolved');
      assert.ok(text(ui.container).includes('Aujourd'), `the plan rendered for order ${order.join('→')}`);
    } finally {
      await close(ui);
    }
  }
}

// ---- 2. study failure degrades to no-measurement practice ----------------

{
  const d = loaders();
  const ui = await renderToday(impl(d));
  try {
    await resolveAll(d, ['entries', 'scenarios', 'grammar', 'listening']);
    await act(async () => { d.study.reject(new Error('study chunk failed')); await new Promise((r) => setTimeout(r, 10)); });
    assert.ok(text(ui.container).includes('Aujourd'), 'the session still opens without study tooling');
    assert.ok(text(ui.container).includes('without research measurement'), 'the learner is told measurement is off');
  } finally {
    await close(ui);
  }
}

// ---- 3. a failed genuine dependency is retryable, never cached -----------

{
  const d = loaders();
  let attempts = 0;
  const failingThenWorking = () => {
    attempts += 1;
    return attempts === 1 ? Promise.reject(new Error('network down')) : Promise.resolve(ENTRIES);
  };
  const ui = await renderToday({ ...impl(d), entries: failingThenWorking });
  try {
    assert.ok(text(ui.container).includes("couldn't load"), 'failure state renders');
    const retryBtn = [...ui.container.querySelectorAll('button')].find((b) => b.textContent === 'Try again');
    assert.ok(retryBtn, 'a retry action is offered');
    await act(async () => { retryBtn.click(); });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(attempts, 2, 'retry issued a FRESH import attempt');
    await resolveAll(d, ['scenarios', 'grammar', 'listening', 'study']);
    assert.ok(text(ui.container).includes('Aujourd'), 'after retry the plan builds');
  } finally {
    await close(ui);
  }
}

// ---- 4. capability gating: French-only deps never load for beta languages -

{
  const active = await import('../src/lib/content/active.js');
  let grammarLoads = 0;
  let listeningLoads = 0;
  const impl5 = {
    entries: () => Promise.resolve(ENTRIES),
    scenarios: () => Promise.resolve(SCENARIOS),
    grammar: () => { grammarLoads += 1; return Promise.resolve(true); },
    listening: () => { listeningLoads += 1; return Promise.resolve(TRACKS); },
    study: () => Promise.resolve(STUDY),
  };
  try {
    // Under GERMAN the French-authored loaders are never even called: the
    // hook settles them as "not needed" sentinels without loading anything.
    active.setContentLanguage('de');
    const uiDe = await renderToday(impl5);
    try {
      assert.equal(grammarLoads, 0, 'the French grammar library never loads for German');
      assert.equal(listeningLoads, 0, 'the French listening library never loads for German');
      assert.ok(text(uiDe.container).includes('Aujourd'), 'the German plan still builds');
    } finally {
      await close(uiDe);
    }

    // Under FRENCH the same loaders DO run.
    active.setContentLanguage('fr');
    const uiFr = await renderToday(impl5);
    try {
      assert.ok(grammarLoads > 0, 'the grammar loader runs for French');
      assert.ok(listeningLoads > 0, 'the listening loader runs for French');
      assert.ok(text(uiFr.container).includes('Aujourd'), 'the French plan builds');
    } finally {
      await close(uiFr);
    }
  } finally {
    active.setContentLanguage('fr');
  }
}

console.log('Today-deps lifecycle render tests: PASS');
