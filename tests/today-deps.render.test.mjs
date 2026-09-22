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
const todayModule = await import('../src/components/TodaySession.jsx');
const TodaySession = todayModule.default;
const { RecallRunner, DelayedReview, DrillChainRunner, claimForwardTransition } = todayModule;
const { NotebookRetype } = await import('../src/components/NotebookRetype.jsx');
const HeldOutCheck = (await import('../src/components/HeldOutCheck.jsx')).default;
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

// ---- 4. optional content failure degrades instead of blocking practice ----

{
  const d = loaders();
  const ui = await renderToday(impl(d));
  try {
    await resolveAll(d, ['entries', 'scenarios', 'grammar']);
    await act(async () => {
      d.listening.reject(new Error('listening chunk unavailable'));
      await new Promise((r) => setTimeout(r, 20));
    });
    // Study is deliberately left unresolved: degraded learning disables
    // measurement immediately instead of making ordinary practice wait.
    assert.ok(text(ui.container).includes('Aujourd'), 'Today still opens when optional listening fails');
    assert.ok(!text(ui.container).includes("couldn't load"), 'optional failure does not become a fatal session error');
    assert.ok(text(ui.container).includes('adapted to the activities available'), 'degraded practice is disclosed');
    assert.ok(text(ui.container).includes('without research measurement'), 'degraded treatment is excluded from research measurement');
  } finally {
    // Settle the abandoned study promise to keep the test harness tidy.
    d.study.resolve(STUDY);
    await close(ui);
  }
}

{
  const d = loaders();
  const ui = await renderToday(impl(d));
  try {
    await resolveAll(d, ['entries', 'scenarios', 'listening']);
    await act(async () => {
      d.grammar.reject(new Error('grammar chunk unavailable'));
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.ok(text(ui.container).includes('Aujourd'), 'Today still opens when the authored grammar library fails');
    assert.ok(text(ui.container).includes('adapted to the activities available'));
  } finally {
    d.study.resolve(STUDY);
    await close(ui);
  }
}

// ---- 14. capability gating: French-only deps never load for beta languages -

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
      // The German plan builds and uses the DYNAMIC language name: the header
      // reads "Today" for German, "Aujourd'hui" only for French. Asserting
      // the French string here would break the very honesty this section pins.
      assert.ok(text(uiDe.container).includes('Today'), 'the German plan still builds (header localized, not French)');
      assert.ok(!text(uiDe.container).includes("Aujourd'hui"), 'no French chrome leaks into the German plan');
    } finally {
      await close(uiDe);
    }

    // Under FRENCH the same loaders DO run.
    active.setContentLanguage('fr');
    const uiFr = await renderToday(impl5);
    try {
      assert.ok(grammarLoads > 0, 'the grammar loader runs for French');
      assert.ok(listeningLoads > 0, 'the listening loader runs for French');
      assert.ok(text(uiFr.container).includes("Aujourd"), 'the French plan builds with its own chrome');
    } finally {
      await close(uiFr);
    }
  } finally {
    active.setContentLanguage('fr');
  }
}

// ---- 5. SRS recall hands control back after the final rated card ----------

{
  localStorage.clear();
  const active = await import('../src/lib/content/active.js');
  const { loadAllEntries } = await import('../src/lib/vocabAsync.js');
  active.setContentLanguage('fr');
  await loadAllEntries();

  let completed = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(RecallRunner, {
        cardCap: 1,
        onDone: () => { completed += 1; },
        onXp: () => {},
      }));
      await new Promise((r) => setTimeout(r, 25));
    });

    const flip = container.querySelector('button[aria-label="Flip the card (back)"]');
    assert.ok(flip, 'a due/new recall card renders');
    await act(async () => { flip.click(); });

    const good = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Good');
    assert.ok(good, 'recall ratings are available after reveal');
    await act(async () => {
      good.click();
      await new Promise((r) => setTimeout(r, 700));
    });

    assert.equal(completed, 1, 'the recall segment advances exactly once after the last card');
  } finally {
    await close({ root, container });
  }
}

// ---- 6. delayed review advances for both empty and completed queues -------

{
  localStorage.clear();
  let completed = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(DelayedReview, {
        count: 2,
        onDone: () => { completed += 1; },
        onXp: () => {},
      }));
      await new Promise((r) => setTimeout(r, 25));
    });
    assert.equal(completed, 1, 'an empty delayed-review queue skips exactly once');
  } finally {
    await close({ root, container });
  }
}

{
  localStorage.clear();
  const notebook = await import('../src/lib/errorNotebook.js');
  const list = notebook.addErrorNotebook({
    original: 'Je suis allé hier.',
    corrected: 'Je suis allé hier.',
    why: 'seed',
  });
  // addErrorNotebook intentionally ignores no-op corrections, so seed a real
  // corrected item and promote it through the delayed-retype lifecycle.
  const seeded = notebook.addErrorNotebook({
    original: 'Je aller au parc.',
    corrected: 'Je vais au parc.',
    why: 'Use the conjugated present form.',
    ruleId: 'present-aller',
  });
  const entry = seeded[0] || list[0];
  assert.ok(entry, 'a corrected notebook entry is available');
  notebook.markCorrectedByLearner(entry.id, entry.corrected, Date.now());
  notebook.markCorrectedByLearner(entry.id, entry.corrected, Date.now() + notebook.REHEARSE_GAP_MS + 1);

  let completed = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(DelayedReview, {
        count: 1,
        onDone: () => { completed += 1; },
        onXp: () => {},
      }));
      await new Promise((r) => setTimeout(r, 25));
    });

    const reveal = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Say it, then reveal');
    assert.ok(reveal, 'a corrected item enters delayed review');
    await act(async () => { reveal.click(); });

    const remembered = [...container.querySelectorAll('button')].find((b) => b.textContent === 'I said it right');
    assert.ok(remembered, 'the learner can self-mark delayed recall');
    await act(async () => {
      remembered.click();
      await new Promise((r) => setTimeout(r, 500));
    });
    assert.equal(completed, 1, 'completed delayed review advances exactly once');
  } finally {
    await close({ root, container });
  }
}

// ---- 7. segment transitions are idempotent and stale-safe -----------------

{
  const gate = { current: -1 };
  assert.equal(claimForwardTransition(gate, 0), true, 'first completion for a segment is accepted');
  assert.equal(claimForwardTransition(gate, 0), false, 'duplicate completion for the same segment is ignored');
  assert.equal(claimForwardTransition(gate, 1), true, 'the next segment may transition');
  assert.equal(claimForwardTransition(gate, 0), false, 'a stale callback from an older segment cannot advance the session');
  assert.equal(claimForwardTransition(gate, 1), false, 'duplicate skip/completion races are ignored');
  assert.equal(claimForwardTransition(gate, 2), true, 'forward progress remains available after rejected races');
}

// ---- 8. empty retype queues emit completion once across parent rerenders --

{
  localStorage.clear();
  let completed = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(NotebookRetype, {
        onXp: () => {},
        onCleared: () => { completed += 1; },
      }));
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      // New callback identity simulates a normal parent rerender.
      root.render(React.createElement(NotebookRetype, {
        onXp: () => {},
        onCleared: () => { completed += 1; },
      }));
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(completed, 1, 'empty retype completion is one-shot, not callback-identity driven');
  } finally {
    await close({ root, container });
  }
}

// ---- 9. committed Today plans create one selection trial in StrictMode ----

{
  localStorage.clear();
  storage.saveMistakeGraph([{
    id: 'mg-strict', concept: 'passe-compose', type: 'grammar',
    errorCount: 3, lastMissAt: Date.now() - 86400000, mastery: 0.2, recurrence: 2,
    modes: ['conversation'], overdueBy: 86400000,
  }]);

  const strictImpl = {
    entries: () => Promise.resolve(ENTRIES),
    scenarios: () => Promise.resolve(SCENARIOS),
    grammar: () => Promise.resolve(true),
    listening: () => Promise.resolve(TRACKS),
    study: () => Promise.resolve(STUDY),
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(
        React.StrictMode,
        null,
        React.createElement(TodaySession, {
          open: true, onClose: () => {}, minutes: 20, apiKey: '', mockMode: true,
          level: 'B1', ttsRate: 1, depsImpl: strictImpl,
        }),
      ));
      await new Promise((r) => setTimeout(r, 120));
    });

    const trials = storage.getSelectionTrial();
    assert.equal(trials.length, 1, 'StrictMode effect replay must not duplicate selection trials');
    assert.ok(trials[0].id?.startsWith('selection:'), 'new trials carry a durable unique id');
    assert.equal(trials[0].completed, null, 'StrictMode fake unmount must not record a false abandonment');
  } finally {
    await close({ root, container });
  }
}

// ---- 10. real unmount persists an abandoned Today trial ------------------

{
  localStorage.clear();
  storage.saveMistakeGraph([{
    id: 'mg-abandon', concept: 'passe-compose', type: 'grammar',
    errorCount: 3, lastMissAt: Date.now() - 86400000, mastery: 0.2, recurrence: 2,
    modes: ['conversation'], overdueBy: 86400000,
  }]);
  const immediateImpl = {
    entries: () => Promise.resolve(ENTRIES),
    scenarios: () => Promise.resolve(SCENARIOS),
    grammar: () => Promise.resolve(true),
    listening: () => Promise.resolve(TRACKS),
    study: () => Promise.resolve(STUDY),
  };
  const ui = await renderToday(immediateImpl);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  let trials = storage.getSelectionTrial();
  assert.equal(trials.length, 1, 'session start creates one frozen trial');
  assert.equal(trials[0].completed, null, 'open session has not been classified yet');

  await close(ui);
  await new Promise((r) => setTimeout(r, 20));

  trials = storage.getSelectionTrial();
  assert.equal(trials[0].completed, false, 'real overlay dismissal records abandonment');
  assert.ok(Number.isFinite(trials[0].timeSpent), 'partial session keeps elapsed time');
  assert.ok(Array.isArray(trials[0].delivered), 'partial delivery facts are persisted');
}

// ---- 11. invalid focused conjugation falls through the drill chain --------

{
  let completed = 0;
  const payload = {
    kind: 'conj-drill',
    verb: 'not-a-real-verb',
    tense: 'present',
    chain: [
      { kind: 'conj-drill', verb: 'not-a-real-verb', tense: 'present' },
      {
        kind: 'authored-drill',
        title: 'Fallback grammar drill',
        exercises: [{ q: 'Choose one', options: ['A', 'B'], answer: 0, why: 'Because A is correct.' }],
      },
    ],
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(DrillChainRunner, {
        payload,
        level: 'B1',
        apiKey: '',
        mockMode: true,
        ttsRate: 1,
        onXp: () => {},
        onDone: () => { completed += 1; },
      }));
      await new Promise((r) => setTimeout(r, 80));
    });
    assert.ok(container.textContent.includes('Fallback grammar drill'), 'next runnable fallback replaces the unavailable trainer');
    assert.equal(completed, 0, 'producer unavailability must not complete the whole segment');
  } finally {
    await close({ root, container });
  }
}

// ---- 12. held-out rapid double-tap cannot skip an assessment item --------

{
  const check = {
    id: 'chk-double-tap',
    scheduledSkill: 'vocabulary',
    items: [
      {
        assessmentId: 'a1', sourceItemId: 'w1', skill: 'vocabulary', cefr: 'A1',
        content: { prompt: 'House' },
        options: [{ id: 'o1', text: 'maison' }, { id: 'o2', text: 'chat' }],
        correctOptionId: 'o1',
      },
      {
        assessmentId: 'a2', sourceItemId: 'w2', skill: 'vocabulary', cefr: 'A1',
        content: { prompt: 'Cat' },
        options: [{ id: 'o3', text: 'chat' }, { id: 'o4', text: 'chien' }],
        correctOptionId: 'o3',
      },
    ],
  };
  let completed = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(HeldOutCheck, {
        check,
        onDone: () => { completed += 1; },
        apiKey: '',
        mockMode: true,
        level: 'A1',
      }));
    });

    const firstChoice = [...container.querySelectorAll('button')].find((b) => b.textContent === 'maison');
    assert.ok(firstChoice);
    await act(async () => { firstChoice.click(); });

    const next = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Record & next'));
    assert.ok(next);
    await act(async () => {
      next.click();
      next.click();
      await new Promise((r) => setTimeout(r, 20));
    });

    assert.ok(container.textContent.includes('Check 2/2'), 'double tap advances exactly one item');
    assert.ok(container.textContent.includes('Cat'), 'the second assessment item is not skipped');
    assert.equal(completed, 0, 'check cannot finish from the duplicated first-item tap');
  } finally {
    await close({ root, container });
  }
}

// ---- 13. rapid SRS rating double-tap creates one review outcome -----------

{
  localStorage.clear();
  const active = await import('../src/lib/content/active.js');
  const { loadAllEntries } = await import('../src/lib/vocabAsync.js');
  active.setContentLanguage('fr');
  const entries = await loadAllEntries();
  assert.ok(entries.length > 0, 'French vocab library available');
  let completed = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(RecallRunner, {
        cardCap: 1,
        onDone: () => { completed += 1; },
        onXp: () => {},
      }));
      await new Promise((r) => setTimeout(r, 30));
    });
    const flip = container.querySelector('button[aria-label="Flip the card (back)"]');
    assert.ok(flip, 'recall card rendered');
    await act(async () => { flip.click(); });
    const again = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Again');
    assert.ok(again, 'Again rating available');
    await act(async () => {
      again.click();
      again.click();
      await new Promise((r) => setTimeout(r, 30));
    });
    const vocabErrors = storage.getLearnerErrors({ limit: 50 })
      .filter((entry) => entry.category === 'vocabulary');
    assert.equal(vocabErrors.length, 1, 'double tap produces one vocabulary weakness');
    assert.equal(vocabErrors[0].errorCount, 1, 'double tap produces one lapse');
    assert.equal(storage.getReviewEvents().length, 1, 'double tap logs one review event');
    assert.equal(completed, 0, 'segment does not prematurely complete during the advance delay');
  } finally {
    await close({ root, container });
  }
}

// ---- 14. held-out listening waits for confirmed audio playback ------------

{
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const hadSpeech = Object.prototype.hasOwnProperty.call(window, 'speechSynthesis');
  const originalSpeech = window.speechSynthesis;
  let utterance = null;
  class FakeUtterance {
    constructor(text) { this.text = text; this.onstart = null; this.onerror = null; }
  }
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: FakeUtterance, configurable: true, writable: true,
  });
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak: (u) => { utterance = u; } }, configurable: true,
  });

  const check = {
    id: 'chk-listen-start',
    scheduledSkill: 'listening',
    items: [{
      assessmentId: 'listen-1', sourceItemId: 'held-listen-1', skill: 'listening', cefr: 'A1',
      content: { audio: 'Bonjour', prompt: 'Listen and choose.' },
      options: [{ id: 'hello', text: 'Hello' }, { id: 'bye', text: 'Goodbye' }],
      correctOptionId: 'hello',
    }],
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(HeldOutCheck, {
        check, onDone: () => {}, apiKey: '', mockMode: true, level: 'A1',
      }));
    });
    const play = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Play'));
    assert.ok(play, 'listening play button rendered');
    await act(async () => { play.click(); });

    const helloBefore = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Hello');
    assert.equal(helloBefore.disabled, true, 'queuing TTS alone does not unlock answers');
    assert.ok(utterance, 'utterance was queued');

    await act(async () => {
      utterance.onstart?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    let helloAfter = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Hello');
    assert.equal(helloAfter.disabled, false, 'answers unlock only after confirmed playback start');

    const replay = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Replay'));
    assert.ok(replay, 'a successful first playback exposes replay');
    await act(async () => {
      replay.click();
      utterance.onerror?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    helloAfter = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Hello');
    assert.equal(helloAfter.disabled, false, 'failed replay does not erase a successful first playback');
    assert.ok(!container.textContent.includes('Audio could not be played'), 'replay failure does not invalidate scorable evidence');
  } finally {
    await close({ root, container });
    if (originalUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      value: originalUtterance, configurable: true, writable: true,
    });
    if (hadSpeech) Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeech, configurable: true,
    });
    else delete window.speechSynthesis;
  }
}

{
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const hadSpeech = Object.prototype.hasOwnProperty.call(window, 'speechSynthesis');
  const originalSpeech = window.speechSynthesis;
  let utterance = null;
  class FakeUtterance {
    constructor(text) { this.text = text; this.onstart = null; this.onerror = null; }
  }
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: FakeUtterance, configurable: true, writable: true,
  });
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak: (u) => { utterance = u; } }, configurable: true,
  });

  const check = {
    id: 'chk-listen-error',
    scheduledSkill: 'listening',
    items: [{
      assessmentId: 'listen-err', sourceItemId: 'held-listen-err', skill: 'listening', cefr: 'A1',
      content: { audio: 'Bonsoir', prompt: 'Listen and choose.' },
      options: [{ id: 'evening', text: 'Good evening' }, { id: 'morning', text: 'Good morning' }],
      correctOptionId: 'evening',
    }],
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(HeldOutCheck, {
        check, onDone: () => {}, apiKey: '', mockMode: true, level: 'A1',
      }));
    });
    const play = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Play'));
    await act(async () => {
      play.click();
      utterance.onerror?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.ok(container.textContent.includes('Audio could not be played'), 'playback error becomes unavailable evidence');
    const answer = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Good evening');
    assert.equal(answer.disabled, true, 'failed playback never unlocks scored answers');
  } finally {
    await close({ root, container });
    if (originalUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      value: originalUtterance, configurable: true, writable: true,
    });
    if (hadSpeech) Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeech, configurable: true,
    });
    else delete window.speechSynthesis;
  }
}

// ---- 15. delayed-review double tap cannot skip the next correction --------

{
  localStorage.clear();
  const notebook = await import('../src/lib/errorNotebook.js');
  const now = Date.now();
  const firstList = notebook.addErrorNotebook({
    original: 'Je aller au parc.',
    corrected: 'Je vais au parc.',
    why: 'Conjugate aller.',
    ruleId: 'present-aller',
  });
  const first = firstList[0];
  notebook.markCorrectedByLearner(first.id, first.corrected, now - notebook.REHEARSE_GAP_MS - 1000);
  notebook.markCorrectedByLearner(first.id, first.corrected, now);

  const secondList = notebook.addErrorNotebook({
    original: 'Il avoir faim.',
    corrected: 'Il a faim.',
    why: 'Conjugate avoir.',
    ruleId: 'present-avoir',
  });
  const second = secondList.find((entry) => entry.original === 'Il avoir faim.');
  notebook.markCorrectedByLearner(second.id, second.corrected, now - notebook.REHEARSE_GAP_MS - 1000);
  notebook.markCorrectedByLearner(second.id, second.corrected, now);

  let xp = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(DelayedReview, {
        count: 2,
        onDone: () => {},
        onXp: (n) => { xp += n; },
      }));
    });
    const reveal = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Say it, then reveal');
    assert.ok(reveal);
    await act(async () => { reveal.click(); });
    const remembered = [...container.querySelectorAll('button')].find((b) => b.textContent === 'I said it right');
    assert.ok(remembered);
    await act(async () => {
      remembered.click();
      remembered.click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.ok(container.textContent.includes('Prompt 2/2'), 'double tap advances exactly one review item');
    assert.equal(xp, 2, 'double tap awards one review result');
  } finally {
    await close({ root, container });
  }
}

// ---- 16. AI drill completion is one-shot under rapid double-click ---------

{
  localStorage.clear();
  storage.saveMistakeGraph([{
    id: 'mg-ai-double',
    concept: 'passe-compose',
    type: 'grammar',
    status: 'active',
    mastery: 40,
    recurrence: 1,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    lastSeenAt: new Date(Date.now() - 86400000).toISOString(),
    retests: [],
  }]);
  let completed = 0;
  const payload = {
    kind: 'ai-drill',
    concept: 'passe-compose',
    chain: [{ kind: 'ai-drill', concept: 'passe-compose' }],
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(React.createElement(DrillChainRunner, {
        payload,
        level: 'B1',
        apiKey: '',
        mockMode: true,
        ttsRate: 1,
        onXp: () => {},
        onDone: () => { completed += 1; },
      }));
      await new Promise((r) => setTimeout(r, 80));
    });
    const done = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Done drilling');
    assert.ok(done, 'mock AI drill renders its completion action');
    await act(async () => {
      done.click();
      done.click();
      await new Promise((r) => setTimeout(r, 20));
    });
    const node = storage.getMistakeGraph().find((m) => m.id === 'mg-ai-double');
    assert.equal(node.retests.length, 1, 'double click writes one retest');
    assert.equal(completed, 1, 'double click emits one completion');
  } finally {
    await close({ root, container });
  }
}

console.log('Today-deps lifecycle render tests: PASS');
