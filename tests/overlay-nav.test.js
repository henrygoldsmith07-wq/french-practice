// The one-overlay reducer: impossible states stay impossible.
// Run: node --test tests/overlay-nav.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  overlayReducer,
  overlayIs,
  overlayPayload,
  makeOverlay,
  OVERLAY_TYPES,
} = await import('../src/lib/overlayNav.js');

const open = (state, name, payload) => overlayReducer(state, { type: 'open', overlay: name, payload });
const close = (state) => overlayReducer(state, { type: 'close' });

test('at most one overlay can be open — opening replaces, never stacks', () => {
  let state = null;
  state = open(state, 'settings');
  assert.ok(overlayIs(state, 'settings'));
  state = open(state, 'search');
  assert.ok(overlayIs(state, 'search'), 'the new overlay replaces the old one');
  assert.equal(overlayIs(state, 'settings'), false, 'the old overlay is gone — no two-modals-at-once');
});

test('close clears whatever is open; closing nothing stays nothing', () => {
  assert.equal(close(null), null);
  assert.equal(close(open(null, 'profile')), null);
});

test('payloads travel with the overlay descriptor', () => {
  const state = open(null, 'reference', { tool: 'conjugation' });
  assert.equal(overlayPayload(state, 'tool'), 'conjugation');
  assert.equal(overlayPayload(state, 'missing', 'fallback'), 'fallback');
  assert.equal(overlayPayload(null, 'tool', 'fallback'), 'fallback');
});

test('unknown overlay names are rejected, leaving state untouched', () => {
  const state = open(null, 'settings');
  assert.equal(open(state, 'notARealOverlay'), state, 'typo’d names fail the gate instead of opening nothing');
  assert.equal(makeOverlay('nope'), null);
});

test('every declared overlay type opens and closes symmetrically', () => {
  for (const type of OVERLAY_TYPES) {
    const state = open(null, type);
    assert.ok(overlayIs(state, type), `${type} opens`);
    assert.equal(close(state), null, `${type} closes`);
  }
});
