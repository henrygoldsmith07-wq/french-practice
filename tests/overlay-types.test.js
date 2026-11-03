// Every overlay the app renders must be an overlay the app can open.
//
// `makeOverlay` rejects any name that is not in OVERLAY_TYPES, and the
// reducer drops the open action when it is rejected — silently. Five panels
// were rendered by App.jsx and missing from that list (the AI Study
// Assistant, the content importer, the share cards, the teacher dashboard
// and the gamification hub), so every one of them was unreachable: the
// buttons did nothing and no error was raised.
//
// This test reads the names App.jsx actually uses and checks each one
// against the gate, so the next panel added cannot be left behind.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { OVERLAY_TYPES, makeOverlay } from '../src/lib/overlayNav.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

// `overlayIs(overlay, 'name')` gates the render; `openOverlay('name')` asks
// for one. Both have to be names the reducer accepts. Components reach the
// same reducer through a third door — `new CustomEvent('openOverlay',
// { detail: 'name' })`, relayed to openOverlay() in App.jsx — and that door
// is where the twelve profile panels were lost: each dispatched a name the
// gate rejected, silently. So the dispatchers are collected too.
function collect(pattern) {
  const names = new Set();
  for (const match of appSource.matchAll(pattern)) names.add(match[1]);
  return [...names];
}

// Every openOverlay CustomEvent dispatched anywhere under src/components.
function collectComponentDispatchers() {
  const names = new Set();
  const dir = new URL('../src/components/', import.meta.url);
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.jsx') && !entry.endsWith('.js')) continue;
    const source = readFileSync(new URL(`../src/components/${entry}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/CustomEvent\('openOverlay',\s*\{\s*detail:\s*'([^']+)'/g)) {
      names.add(match[1]);
    }
  }
  return [...names];
}

const rendered = collect(/overlayIs\(overlay,\s*'([^']+)'\)/g);
const opened = collect(/openOverlay\('([^']+)'/g);
const dispatched = collectComponentDispatchers();

test('App.jsx renders overlays that the overlay gate accepts', () => {
  assert.ok(rendered.length >= 15, `expected App.jsx to render many overlays, found ${rendered.length}`);
  const unknown = rendered.filter((name) => !OVERLAY_TYPES.includes(name));
  assert.deepEqual(
    unknown, [],
    `these panels are rendered but can never be opened: ${unknown.join(', ')}. Add them to OVERLAY_TYPES in src/lib/overlayNav.js.`,
  );
});

test('every overlay App.jsx opens is accepted by the gate', () => {
  const unknown = opened.filter((name) => !OVERLAY_TYPES.includes(name));
  assert.deepEqual(
    unknown, [],
    `these openOverlay() calls are rejected: ${unknown.join(', ')}. Add them to OVERLAY_TYPES in src/lib/overlayNav.js.`,
  );
});

test('every openOverlay CustomEvent dispatched from a component is accepted by the gate', () => {
  assert.ok(dispatched.length >= 10, `expected many event-dispatched overlays, found ${dispatched.length}`);
  const unknown = dispatched.filter((name) => !OVERLAY_TYPES.includes(name));
  assert.deepEqual(
    unknown, [],
    `these CustomEvent openOverlay dispatches are rejected: ${unknown.join(', ')}. Add them to OVERLAY_TYPES in src/lib/overlayNav.js.`,
  );
});

test('every event-dispatched overlay is actually rendered by App.jsx', () => {
  const orphans = dispatched.filter((name) => !rendered.includes(name));
  assert.deepEqual(
    orphans, [],
    `dispatched but never rendered: ${orphans.join(', ')}`,
  );
});

test('the gate rejects an unknown name instead of storing it', () => {
  assert.equal(makeOverlay('notARealOverlay'), null);
  assert.equal(makeOverlay('profile').type, 'profile');
});
