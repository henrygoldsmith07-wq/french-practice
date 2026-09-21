// The overlay navigation state — one reducer replacing ~15 mutually-exclusive
// booleans in App.jsx.
//
// The old shape made impossible states representable: two overlays open at
// once, a modal opened from inside another one stacking unpredictably, a
// reference modal detached from its tool. This module makes them structurally
// impossible:
//
//   overlay = null | { type, ...payload }   — AT MOST ONE at any time
//
// Transitions the product actually has:
//   · Escape / Android Back closes whatever is open (preserved exactly —
//     including onboarding, which the old closers list also dismissed);
//   · opening an overlay while one is open REPLACES it — an overlay is a
//     modal focus, not a stack (settings → replay onboarding, learning
//     path → setup both already behaved this way);
//   · every open passes through the OVERLAY_TYPES gate, so a typo'd name
//     fails loudly instead of silently doing nothing.
//
// Pure and React-free, so the transitions are unit-testable without a DOM.

export const OVERLAY_TYPES = [
  'search', 'settings', 'profile', 'realWorld', 'personalise', 'offline',
  'analytics', 'reference', 'focus', 'devPanel', 'learningPath', 'pathSetup',
  'onboarding', 'today', 'dashboard',
];

export const initialOverlay = null;

/** A validated overlay descriptor (unknown names are rejected, not stored). */
export function makeOverlay(type, payload = {}) {
  if (!OVERLAY_TYPES.includes(type)) return null;
  return { type, ...payload };
}

export function overlayReducer(state, action) {
  switch (action.type) {
    case 'open': {
      const next = makeOverlay(action.overlay, action.payload);
      return next || state;
    }
    case 'close':
      return null;
    default:
      return state;
  }
}

/** True when `overlay` is open and of `type` — the render gate. */
export const overlayIs = (overlay, type) => Boolean(overlay && overlay.type === type);

/** The payload accessor with a default, so render code stays terse. */
export const overlayPayload = (overlay, field, fallback = null) =>
  (overlay && overlay[field] !== undefined ? overlay[field] : fallback);
