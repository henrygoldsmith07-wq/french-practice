// Today's conversation segment embeds ChatArena with the scenario already
// chosen by the plan. The standalone scenario rail and speed slider must not
// appear there: they had no working handlers and the rail's buttons wiped the
// transcript when tapped.
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* Node ≥21 */ }
globalThis.localStorage = dom.window.localStorage;
dom.window.Element.prototype.scrollTo = function scrollTo() {}; // jsdom has no layout engine

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const ChatArena = (await import('../src/components/ChatArena.jsx')).default;
const assert = (await import('node:assert/strict')).default;

const scenario = {
  id: 'cafe', title: 'Au café', setup: 'Order at a café.', opener: 'Bonjour !',
  openerTranslation: 'Hello!',
};
const props = {
  apiKey: '', mockMode: true, ttsRate: 1, level: 'B1',
  onTtsRate() {}, onTurn() {}, onXp() {}, onGrammarTip() {},
  history: [], setHistory() {}, scenario, setScenario() {},
};

const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => {
  root.render(React.createElement(ChatArena, { ...props, embedded: true }));
});
await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

assert.equal(container.querySelector('[aria-label="Choose a scenario"]'), null,
  'no inert scenario rail inside Today');
assert.equal(container.querySelector('[aria-label="Playback speed"]'), null,
  'no inert speed slider inside Today');
assert.ok(container.querySelector('[aria-label="Conversation mode"]'),
  'the working conversation-mode controls remain available');
assert.ok(container.querySelector('.px-3'),
  'the control rows keep their horizontal padding in the embedded view');
assert.equal(container.textContent.includes('Browse all'), false,
  'the browse-all button is hidden too');

// The standalone Speak tab still gets both controls.
await act(async () => {
  root.render(React.createElement(ChatArena, props));
});
await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
assert.ok(container.querySelector('[aria-label="Choose a scenario"]'), 'standalone rail still renders');
assert.ok(container.querySelector('[aria-label="Playback speed"]'), 'standalone slider still renders');
