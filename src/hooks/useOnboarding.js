import { useEffect } from 'react';
import { contentLang } from '../lib/content/active';
import { relayEnabled } from '../lib/relay';
import {
  setApiKey as persistApiKey, setAvatar as persistAvatar, ownAvatar, setHabitList,
  setOnboarded, shouldOnboard,
} from '../lib/storage';

// First-run onboarding domain: the mount-only gate that greets brand-new
// learners with the picker, plus its two exits. Completing the picker
// persists every answer (settings, prefs, avatar, habits, API key); skipping
// adopts the LIVE content language so picking-and-skipping still sticks.
// App stays composition: it wires this hook to its settings/prefs updaters.
export default function useOnboarding({
  settings, apiKey, updateSettings, updatePrefs, setApiKey, setAvatarId,
  openOverlay, closeOverlay,
}) {
  // A brand-new learner (no key, no XP, no sessions, not onboarded before)
  // is greeted by the picker. Returning learners and every seeded/skipped
  // state land straight in the studio. Runs once after mount so storage has
  // settled.
  useEffect(() => {
    if (shouldOnboard()) openOverlay('onboarding');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only gate: a brand-new learner gets the picker, once
  }, []);

  const finishOnboarding = (d) => {
    let timezone = null;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { timezone = null; }
    updateSettings({
      ...settings,
      name: d.name.trim(),
      language: d.language,
      timezone,
      level: d.level,
      dailyGoal: d.dailyGoal,
      weeklyGoal: d.weeklyGoal,
      smartReminders: d.reminders,
      mockMode: relayEnabled ? false : (d.mock || (!d.apiKey.trim() && settings.mockMode)),
    });
    updatePrefs({ learningStyle: d.learningStyle, lessonLength: d.lessonLength, favouriteTopics: d.favouriteTopics });
    persistAvatar(d.avatarId);
    ownAvatar(d.avatarId);
    setAvatarId(d.avatarId);
    if (d.habits.length) setHabitList(d.habits);
    if (d.apiKey.trim()) {
      persistApiKey(d.apiKey.trim());
      setApiKey(d.apiKey.trim());
    }
    setOnboarded();
    closeOverlay();
  };

  const skipOnboarding = () => {
    // The picker step syncs the chosen language LIVE (Onboarding →
    // syncLanguage → content/active) but historically a skip never wrote it
    // to settings: settings.language stayed at its previous value while the
    // content layer ran Spanish/German — so Settings claimed French, the
    // language radio could never trigger a switch (its guard saw no change),
    // and the next reload silently reverted the learner to French. Adopt the
    // LIVE content language so picking a language and skipping still sticks.
    const liveLanguage = contentLang();
    const next = { ...settings, language: liveLanguage };
    if (!apiKey && !settings.mockMode) next.mockMode = true;
    updateSettings(next);
    setOnboarded();
    closeOverlay();
  };

  return { finishOnboarding, skipOnboarding };
}
