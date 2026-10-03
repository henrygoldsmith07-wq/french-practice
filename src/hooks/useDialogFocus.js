import { useEffect, useRef } from 'react';
import { getDialogTrigger, clearDialogTrigger } from '../lib/dialogTrigger.js';

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusablesWithin(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE)].filter((node) => (
    node.getAttribute('aria-hidden') !== 'true'
    && !node.hasAttribute('hidden')
  ));
}

/**
 * Focus management for full-screen dialog surfaces that cannot use the shared
 * <Modal>. Moves focus inside, traps Tab/Shift+Tab, and restores the trigger on
 * unmount. Escape/back navigation stays owned by useOverlayNav so there is one
 * close authority.
 */
export default function useDialogFocus(containerRef, { active = true, initialRef = null } = {}) {
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    // Prefer the control that actually opened this dialog (captured from the
    // opening interaction). Fall back to activeElement only when that is a real
    // focusable element - `<body>` is not a valid trigger, and returning focus
    // to it silently strands keyboard users (and is what broke WebKit E2E).
    // NOTE: do not name this `active`; the hook's own `active` option is read
    // above, and shadowing it puts that read in its temporal dead zone.
    const focusedNow = document.activeElement;
    const remembered = getDialogTrigger();
    restoreRef.current = remembered || (focusedNow && focusedNow !== document.body ? focusedNow : null);
    // rAF is the browser's focus timing, but jsdom (and other non-browser
    // hosts) do not define it — fall back to a macrotask so focus restoration
    // works identically everywhere and never crashes a render host.
    const frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(focusFirst)
      : setTimeout(focusFirst, 0);
    function focusFirst() {
      const container = containerRef.current;
      if (!container) return;
      const preferred = initialRef?.current;
      const first = focusablesWithin(container)[0];
      (preferred && container.contains(preferred) ? preferred : first || container)?.focus?.();
    }

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const focusables = focusablesWithin(container);
      if (!focusables.length) {
        event.preventDefault();
        container.focus?.();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!container.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      else clearTimeout(frame);
      window.removeEventListener('keydown', onKeyDown);
      const restore = restoreRef.current;
      clearDialogTrigger();
      if (restore?.isConnected !== false) {
        try { restore?.focus?.(); } catch { /* trigger may have disappeared */ }
      }
    };
  }, [active, containerRef, initialRef]);
}

