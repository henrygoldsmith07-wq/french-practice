import { useEffect, useRef } from 'react';

/**
 * One history entry covers the whole overlay session. Without consuming it
 * on UI/Escape close, every overlay left a stale entry behind and Android
 * Back needed two presses to leave the page.
 *
 * @param {Array<[boolean, () => void]>} overlayClosers [isOpen, close] pairs,
 *        ordered topmost-last.
 */
export default function useOverlayNav(overlayClosers) {
  const anyOverlayOpen = overlayClosers.some(([o]) => o);
  const closeTopOverlay = () => overlayClosers.find(([o]) => o)?.[1]();
  const overlayEntryRef = useRef(false); // false | true (open) | 'consume'

  useEffect(() => {
    if (!anyOverlayOpen) {
      if (overlayEntryRef.current === true) {
        overlayEntryRef.current = 'consume';
        window.history.back(); // consume the entry we pushed on open
      }
      return undefined;
    }
    if (!overlayEntryRef.current) {
      window.history.pushState({ overlay: true }, '');
      overlayEntryRef.current = true;
    }
    const onKey = (e) => { if (e.key === 'Escape') closeTopOverlay(); };
    const onPop = () => {
      if (overlayEntryRef.current === 'consume') {
        // Our own consume-pop landing late (fast close→reopen). Ignore.
        overlayEntryRef.current = false;
        return;
      }
      if (overlayEntryRef.current === true) {
        // Browser Back consumed the entry itself — close, don't re-consume.
        overlayEntryRef.current = false;
        closeTopOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyOverlayOpen]);

  return anyOverlayOpen;
}
