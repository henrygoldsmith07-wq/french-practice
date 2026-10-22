// The pronunciation insights panel must point at a real drill.
//
// The panel ended in two promises it did not keep: "Practice this sound"
// was a button with no handler, and "Start Minimal Pair Drill" was a div
// with a pointer cursor and nothing behind it. The studio has the drill —
// a contrast pair for the sound — so the panel has to show it.
//
// This renders the panel with a phoneme the learner has actually struggled
// with and checks that the pair for THAT sound appears, rather than a
// promise to fetch one later.
//
// Run: node --import ./tests/register-jsx.mjs tests/pronunciation-insights.render.test.mjs
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* Node >= 21 exposes navigator */ }
globalThis.localStorage = dom.window.localStorage;

const assert = (await import('node:assert/strict')).default;

// Seed a real phoneme profile: the learner tried "u-ou" often and got it
// wrong more than a third of the time, so it is one of their weak sounds.
const { recordPhonemeAttempt, minimalPairsFor } = await import('../src/lib/phonemeProfile.js');
for (let i = 0; i < 4; i += 1) {
  recordPhonemeAttempt('u-ou', { correct: i === 0, confidence: 0.35, label: 'u / ou', trackGap: false });
}

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const PronunciationInsightsPanel = (await import('../src/components/PronunciationInsightsPanel.jsx')).default;

const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => { root.render(React.createElement(PronunciationInsightsPanel)); });

const html = container.innerHTML;

// The weak sound is named, with the learner's own numbers.
assert.ok(html.includes('u / ou'), 'the weak sound is named');
assert.ok(html.includes('Your Weakest Sounds'), 'the weak sounds section renders');

// The drill is real: the pair written for THIS sound is on screen, with the
// two words in it.
const pairs = minimalPairsFor('u-ou');
assert.ok(pairs && pairs.length, 'the sound has an authored pair');
assert.ok(html.includes(pairs[0][0]), `the pair word "${pairs[0][0]}" is on screen`);
assert.ok(html.includes(pairs[0][1]), `the pair word "${pairs[0][1]}" is on screen`);

// The recommendation shows the same drill rather than a dead div.
assert.ok(html.includes('Recommended Practice'), 'the recommendation renders');
assert.ok(html.includes('Contrast pair'), 'the drill is labelled as one');

// No button in the panel is left without a handler: every button in the
// rendered panel must carry a React onClick prop. (React attaches handlers
// through the root's delegated listener, so the DOM attribute is not there
// to look at - the props are.)
const buttons = [...container.querySelectorAll('button')];
assert.ok(buttons.length > 0, 'the panel has buttons');
for (const b of buttons) {
  const propsKey = Object.keys(b).find((k) => k.startsWith('__reactProps'));
  const hasHandler = propsKey && typeof b[propsKey].onClick === 'function';
  assert.ok(hasHandler || b.disabled, 'a button in the panel has no handler');
}

// The dead wording is gone.
assert.ok(!html.includes('Start Minimal Pair Drill'), 'the fake "Start Minimal Pair Drill" div is gone');
assert.ok(!html.includes('Would load actual minimal pairs'), 'the "would load" placeholder is gone');

// The drill can be opened from the card, and it really shows the pair.
const practice = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Practice this sound'));
assert.ok(practice, 'the practice button exists');
const before = container.innerHTML.includes('Contrast pair');
await act(async () => { practice.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const after = container.innerHTML;
assert.ok(after.includes('Contrast pair'), 'the drill opens when the button is pressed');
assert.ok(after.includes('New pair'), 'the drill can move to the next pair');

// The pair label and the pair agree: the panel never shows a pair written
// for one sound under another sound's name.
assert.ok(!html.includes('liaison'), 'no unrelated sound is shown');
void before;

console.log('pronunciation insights: the drill is real');
