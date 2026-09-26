import { useEffect, useRef } from 'react';

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
    restoreRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const preferred = initialRef?.current;
      const first = focusablesWithin(container)[0];
      (preferred && container.contains(preferred) ? preferred : first || container)?.focus?.();
    });

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
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      const restore = restoreRef.current;
      if (restore?.isConnected !== false) {
        try { restore?.focus?.(); } catch { /* trigger may have disappeared */ }
      }
    };
  }, [active, containerRef, initialRef]);
}

