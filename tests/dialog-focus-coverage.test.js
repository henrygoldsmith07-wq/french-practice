// Coverage guard, not a behaviour test: the render tests prove the focus trap
// works for representative panels. This stops a NEW aria-modal dialog from
// shipping with no focus management at all — a recurring gap in this repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/components/', import.meta.url);
const componentFiles = readdirSync(dir).filter((f) => f.endsWith('.jsx'));
// App.jsx composes two aria-modal dialogs inline (learning path, celebration).
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dialogs = componentFiles.filter((f) => {
  const txt = readFileSync(new URL(f, dir), 'utf8');
  return txt.includes('role="dialog"') && txt.includes('aria-modal="true"');
});
if (appSource.includes('role="dialog"') && appSource.includes('aria-modal="true"')) dialogs.push('App.jsx');
const sourceOf = (f) => (f === 'App.jsx' ? appSource : readFileSync(new URL(f, dir), 'utf8'));
const missing = dialogs.filter((f) => {
  // ui.jsx is the shared Modal shell: it implements its own trap.
  if (f === 'ui.jsx') return false;
  return !sourceOf(f).includes('useDialogFocus(');
});

test('every aria-modal panel in src/components manages focus', () => {
  assert.ok(dialogs.length >= 25, `expected the real dialog set, found ${dialogs.length}`);
  assert.deepEqual(missing, [], 'these dialogs have no focus trap');
});
