// Profile replaces the page behind an aria-modal dialog. Keyboard users must
// stay inside it and get focus back on the avatar button when it closes.
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
const Profile = (await import('../src/components/Profile.jsx')).default;
const assert = (await import('node:assert/strict')).default;

const opener = document.createElement('button');
opener.textContent = 'Your profile';
document.body.appendChild(opener);
opener.focus();

const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => {
  root.render(React.createElement(Profile, { open: true, onClose() {}, onXp() {} }));
});
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const dialog = container.querySelector('[role="dialog"][aria-modal="true"]');
assert.ok(dialog, 'profile dialog renders');
assert.ok(dialog.contains(document.activeElement), 'focus moved into the profile');

const focusables = [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
assert.ok(focusables.length > 2, 'profile has real controls');
focusables[focusables.length - 1].focus();
await act(async () => {
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
});
assert.equal(document.activeElement, focusables[0], 'Tab wraps inside the profile');

await act(async () => { root.unmount(); });
assert.equal(document.activeElement, opener, 'focus returns to the opener on close');
