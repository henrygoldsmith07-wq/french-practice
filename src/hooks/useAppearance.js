// useAppearance — App.jsx's document-level appearance side effects:
// theme follows the OS until toggled, and the accessibility toggles
// (reduce-motion, large-text, dyslexia font, high contrast) mirror onto
// <html> classes. No state of its own — reads the settings object it is
// given, so App stays the single owner of settings state.
import { useEffect } from 'react';

export default function useAppearance(settings) {
  const isDark = settings.theme
    ? settings.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('reduce-motion', !!settings.reduceMotion);
    el.classList.toggle('large-text', !!settings.largeText);
    el.classList.toggle('dyslexia', !!settings.dyslexiaFont);
    el.classList.toggle('high-contrast', !!settings.highContrast);
  }, [settings.reduceMotion, settings.largeText, settings.dyslexiaFont, settings.highContrast]);

  return { isDark };
}
