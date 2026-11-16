// The onboarding dialog is the first keyboard journey. It is aria-modal, so
// focus must move inside, Tab must cycle within it, and skipping/closing must
// hand focus back to the button that opened it.
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* Node ≥21 */ }
globalThis.localStorage = dom.window.localStorage;

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const Onboarding = (await import('../src/components/Onboarding.jsx')).default;
const assert = (await import('node:assert/strict')).default;

const trigger = document.createElement('button');
trigger.textContent = 'Start';
document.body.appendChild(trigger);
trigger.focus();
assert.equal(document.activeElement, trigger, 'test starts with the trigger focused');

const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => {
  root.render(React.createElement(Onboarding, { open: true, onComplete() {}, onSkip() {} }));
});
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const dialog = container.querySelector('[role="dialog"][aria-modal="true"]');
assert.ok(dialog, 'the onboarding dialog renders');
assert.ok(dialog.contains(document.activeElement), 'focus moved into the dialog');

const focusables = [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
assert.ok(focusables.length > 1, 'the dialog has real controls');
focusables[focusables.length - 1].focus();
await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
});
assert.equal(document.activeElement, focusables[0], 'Tab from the last control wraps to the first');

await act(async () => { root.unmount(); });
assert.equal(document.activeElement, trigger, 'focus returns to the opener on close');
