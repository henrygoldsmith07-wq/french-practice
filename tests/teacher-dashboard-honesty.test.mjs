// The teacher dashboard must not promise what the app cannot do.
//
// The panel is a preview of a class view. It has no class data source: the
// studio is a single-learner app with no accounts and no server. That much
// was already said on screen. What it also did was offer actions that could
// not happen:
//
//   - "+ Create new class" - a button with no handler
//   - "View Details" - a button with no handler, on a card that looked
//     clickable and was not
//   - "Send Message" - a button with no handler; there is no messaging in the
//     app and nowhere to send one
//
// and it made a claim that was not true:
//
//   - "Privacy-Preserving Analytics: All student data is completely
//     anonymized" - there is no student data. The panel shows student IDs
//     from an invented class.
//
// This test reads the component and checks those things are gone, and that
// the one action left on a class card really opens the class.
//
// Run: node --import ./tests/register-jsx.mjs tests/teacher-dashboard-honesty.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* Node >= 21 exposes navigator */ }
globalThis.localStorage = dom.window.localStorage;

const source = readFileSync(new URL('../src/components/TeacherDashboard.jsx', import.meta.url), 'utf8');

// The actions that cannot happen are gone.
assert.doesNotMatch(source, /Create new class/, 'the panel still offers to create a class');
assert.doesNotMatch(source, /Send Message/, 'the panel still offers to send a message');

// The claim that was not true is gone.
assert.doesNotMatch(source, /completely anonymized/, 'the panel still claims the student data is anonymized');
assert.doesNotMatch(source, /Privacy-Preserving Analytics/, 'the panel still shows the privacy claim as a headline');
assert.doesNotMatch(source, /Free educator tier/, 'the panel still implies a paid tier exists');

// The panel still says what it is.
assert.match(source, /Sample data/, 'the sample-data disclosure is still there');

// Render it and check that the class card's one action really opens the class.
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const TeacherDashboard = (await import('../src/components/TeacherDashboard.jsx')).default;

const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => { root.render(React.createElement(TeacherDashboard, { open: true, onClose: () => {} })); });

const html = container.innerHTML;
assert.ok(html.includes('Sample data'), 'the disclosure renders');
assert.ok(html.includes('Nothing here is collected'), 'the honest note renders');

const details = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('View Details'));
assert.ok(details, 'the class card still has its one action');

// Press it: the class view opens, so the button is not another dead one.
await act(async () => { details.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const after = container.innerHTML;
assert.ok(after.includes('Student Progress'), 'pressing View Details opened the class view');
assert.ok(!after.includes('All Classes Overview'), 'the overview gave way to the class view');

// Every button the panel renders has a handler.
for (const b of container.querySelectorAll('button')) {
  const propsKey = Object.keys(b).find((k) => k.startsWith('__reactProps'));
  const hasHandler = propsKey && typeof b[propsKey].onClick === 'function';
  assert.ok(hasHandler || b.disabled, 'a button in the teacher dashboard has no handler');
}

console.log('teacher dashboard: the panel stops pretending');
