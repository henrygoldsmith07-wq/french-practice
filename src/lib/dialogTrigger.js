// Remembers which control opened the current dialog so focus can be returned to it.
//
// Why this exists: `document.activeElement` is sampled inside the dialog's effect,
// which runs AFTER React re-renders and the dialog already holds focus. On engines
// that do not focus a button on click (notably WebKit/Safari) `activeElement` is
// still `<body>` at that point, so the dialog captures `<body>` as its trigger and
// never returns focus - a real WCAG 2.4.3 failure that only surfaced on WebKit.
//
// We instead remember the interactable element from the event that opened the
// dialog (a capture-phase pointerdown/Enter listener), which is accurate on every
// engine because it runs before the click handler and before focus moves.

const INTERACTIVE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let trigger = null;

/** The remembered trigger, if it is still connected to the document. */
export function getDialogTrigger() {
  return trigger && trigger.isConnected ? trigger : null;
}

/** Forget the trigger (once focus has been returned). */
export function clearDialogTrigger() {
  trigger = null;
}

function noteInteraction(event) {
  const el = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null;
  if (el) trigger = el;
}

// Installed once, in the capture phase, so we observe the interactable element
// BEFORE the dialog's click handler opens the overlay and moves focus.
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', noteInteraction, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') noteInteraction(e);
  }, true);
}