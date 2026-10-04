// A timeout that cleans up after itself.
//
// Several runners schedule a short delay to let a card flip before advancing
// (`setTimeout(() => setIdx((i) => i + 1), 250)`). Written inline, every one of
// those timers outlived its component: advancing the segment, closing the
// overlay or navigating away inside that window left the callback to fire
// against an unmounted tree.
//
// This hook owns exactly that problem — one timer at a time, cleared on
// re-schedule and on unmount — so a runner can say what it wants to do rather
// than re-implementing the cleanup.
import { useCallback, useEffect, useRef } from 'react';

/**
 * @param {() => void} fn the work to run after the delay
 * @param {number} [delayMs]
 * @returns {() => void} schedule the work, replacing any pending call
 */
export function useTimeout(fn, delayMs = 0) {
  const timer = useRef(null);
  // Latest-ref, so re-scheduling never depends on the callback's identity —
  // the same pattern Profile.jsx and ui.jsx use for unstable props.
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const schedule = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current?.();
    }, delayMs);
  }, [clear, delayMs]);

  useEffect(() => clear, [clear]);
  return schedule;
}