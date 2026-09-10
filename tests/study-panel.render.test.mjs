// Component render test: enrolled Evidence Study dashboard with realistic
// pooled data, including the diagnostics disclosure.
// Run: node --import ./tests/jsx-loader.mjs tests/study-panel.render.test.mjs
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* Node ≥21 exposes navigator */ }
globalThis.localStorage = dom.window.localStorage;

// Seed realistic study data through the real storage layer.
const { recordStudyConsent, enrolStudyState, startOutcomeRecord } = await import('../src/lib/studyFlow.js');
const storage = await import('../src/lib/storage.js');

storage.saveSession({ scenarioId: 'x', turns: 2, report: { average_scores: { overall: 55 } } });
recordStudyConsent('accepted', { enrol: { startLevel: 'B1' } });
enrolStudyState({ startLevel: 'B1' });
const state = storage.getStudyState();
for (let i = 0; i < 3; i++) {
  startOutcomeRecord({
    trial: { at: new Date(Date.now() - i * 86400000).toISOString(), activity: 'ai-drill', variant: state.arm, selectedId: `mg-${i}`, selectedConcept: 'passe-compose' },
    graph: [], arm: state.arm, day: i,
    consistency: { ok: true, expected: state.arm, reason: null },
  });
}

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const StudyPanel = (await import('../src/components/StudyPanel.jsx')).default;

const assert = (await import('node:assert/strict'));
const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => { root.render(React.createElement(StudyPanel)); });

const html = container.innerHTML;
assert.ok(html.includes('Evidence study'), 'dashboard renders');
assert.ok(html.includes('Not enough evidence yet') || html.includes('Collecting'), 'honest status renders');
assert.ok(html.includes('Held-out vocabulary transfer'), 'per-skill-labelled transfer metric renders');
assert.ok(html.includes('Research diagnostics'), 'diagnostics section present');
assert.ok(html.includes('Adaptive'), 'arm row renders');
assert.ok(html.includes('Balanced'), 'second arm row renders');
assert.ok(html.includes('Export study bundle'), 'export action renders');
// The arm VALUE is never revealed as an assignment — both arm labels appear
// as static row headers, but nothing may read "you are in the X arm".
assert.ok(!/you (are|were) (assigned|in the)/i.test(html), 'no assignment statement anywhere');
assert.ok(!/your arm/i.test(html), 'no your-arm phrasing anywhere');

// Open the diagnostics disclosure and re-verify.
const details = container.querySelector('details');
assert.ok(details, 'diagnostics <details> exists');
await act(async () => { details.open = true; });
const htmlOpen = container.innerHTML;
assert.ok(htmlOpen.includes('Protocol version'), 'protocol version shown in diagnostics');
assert.ok(htmlOpen.includes('Exclusions by reason'), 'exclusion counts shown');
assert.ok(htmlOpen.includes('Attrition'), 'attrition by arm shown');
assert.ok(htmlOpen.includes('Rejected imports'), 'rejected imports shown');
assert.ok(!/you (are|were) (assigned|in the)/i.test(htmlOpen), 'arm hidden in diagnostics too');

console.log('StudyPanel enrolled-dashboard render test: PASS');
