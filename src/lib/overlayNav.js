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
      if (!next) return state;
      // Re-opening the overlay that is ALREADY open must not produce a new
      // object. useReducer only bails out of a re-render when the returned
      // state is Object.is-equal to the current one, so a fresh `{ type }`
      // literal here re-renders App every single time — which is exactly how a
      // caller that re-dispatches `open` from inside an effect keyed on a prop
      // turns into an unbounded render loop (ChatArena's session-timer expiry
      // did precisely this). Idempotence is the reducer's job, not the
      // caller's.
      if (state && state.type === next.type && overlayPayloadEqual(state, next)) return state;
      return next;
    }
    case 'close':
      return state === null ? state : null;
    default:
      return state;
  }
}

/**
 * Shallow equality over an overlay's payload keys.
 *
 * `makeOverlay` spreads the payload onto the descriptor, so a re-open with the
 * same type but different payload IS a real change and must re-render; an
 * identical payload must not. Values are compared with Object.is, which is what
 * React itself uses for this decision.
 */
function overlayPayloadEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.is(a[k], b[k]));
}

/** True when `overlay` is open and of `type` — the render gate. */
export const overlayIs = (overlay, type) => Boolean(overlay && overlay.type === type);

/** The payload accessor with a default, so render code stays terse. */
export const overlayPayload = (overlay, field, fallback = null) =>
  (overlay && overlay[field] !== undefined ? overlay[field] : fallback);
