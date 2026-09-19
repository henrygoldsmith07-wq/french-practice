// useStudioBoot — App.jsx's non-rendering boot responsibilities, extracted:
//
//   1. lazy chunk warm-up  — idle-time prefetch of every screen chunk so the
//      first navigation never stalls on a download;
//   2. smart reminder      — the one-notification-per-day nudge, driven by
//      the shared live due count;
//   3. OS badge            — the dock/home-screen badge mirrors the due count;
//   4. study clock         — 20s-heartbeat study-time tracking while visible;
//   5. telemetry sink      — DevPanel's request log, capped.
//
// Pure side-effect plumbing: no rendering, no navigation, no product state.
// App stays responsible for composition; this hook owns the *when* of boot
// work. Everything here already behaved exactly this way inline in App.jsx.
import { useEffect, useState } from 'react';
import {
  shouldRemindToday, markRemindedToday, getStreak, getTodayXp, addStudyTime,
} from '../lib/storage';

export default function useStudioBoot({ dueCount, smartReminders }) {
  const [telemetry, setTelemetry] = useState([]);
  const clearTelemetry = () => setTelemetry([]);

  // Groq request log for the DevPanel (capped at 50, like the inline version).
  useEffect(() => {
    let cancelled = false;
    let mod = null;
    import('../lib/groq').then((m) => {
      mod = m;
      if (!cancelled) m.setTelemetrySink((entry) => setTelemetry((t) => [...t.slice(-49), entry]));
    });
    return () => {
      cancelled = true;
      mod?.setTelemetrySink(null);
    };
  }, []);

  // Warm every lazy screen chunk during idle time. One bounded prefetch —
  // not per-tab — so the first tap into any hub never shows a spinner.
  useEffect(() => {
    const warm = () => {
      import('../components/ChatArena');
      import('../components/Skills');
      import('../components/Vocabulary');
      import('../components/Grammar');
      import('../components/AiHub');
      import('../components/Culture');
      import('../components/Reference');
      import('../components/Analytics');
      import('../components/Profile');
      import('../components/GlobalSearch');
      import('../components/Focus');
      import('../components/RealWorld');
      import('../components/Personalise');
      import('../components/Offline');
      import('../components/PathSetup');
      import('../components/LearningPath');
      import('../components/FieldNotes');
      import('../components/SettingsModal');
      import('../components/SessionDashboard');
    };
    const ric = window.requestIdleCallback;
    const id = ric ? ric(warm, { timeout: 4000 }) : setTimeout(warm, 2500);
    return () => { (window.cancelIdleCallback || clearTimeout)(id); };
  }, []);

  // Smart reminder: reads the shared live due count — one due computation
  // for the whole app. shouldRemindToday/markRemindedToday keep it to one
  // notification per day; the extra effect runs are no-ops.
  useEffect(() => {
    if (dueCount === null || !smartReminders || !shouldRemindToday()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const streak = getStreak().count;
    const streakAtRisk = streak >= 3 && getTodayXp() === 0 && new Date().getHours() >= 17;
    if (dueCount === 0 && !streakAtRisk) return;
    markRemindedToday();
    const body = streakAtRisk
      ? `Your ${streak}-day streak is at risk — two minutes today keeps it alive.`
      : `${dueCount} card${dueCount > 1 ? 's are' : ' is'} due for review — a few minutes now beats relearning later.`;
    notify('Le Studio', body);
  }, [dueCount, smartReminders]);

  // The OS badge: same live count. (A hand-rolled copy once missed the
  // language-switch signal — switching FR→DE kept advertising the previous
  // language's due cards until an unrelated tick. One hook, one source.)
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    try {
      if (dueCount !== null && dueCount > 0) navigator.setAppBadge(dueCount);
      else navigator.clearAppBadge?.();
    } catch { /* badging unsupported */ }
  }, [dueCount]);

  // Study clock: count only while the tab is visible.
  useEffect(() => {
    const STEP = 20;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') addStudyTime(STEP);
    }, STEP * 1000);
    return () => clearInterval(id);
  }, []);

  return { telemetry, clearTelemetry };
}

function notify(title, body) {
  const options = { body, icon: `${import.meta.env.BASE_URL}icon-192.png`, badge: `${import.meta.env.BASE_URL}icon-192.png`, tag: 'le-studio-reminder' };
  try {
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, options))
        .catch(() => { try { new Notification(title, options); } catch { /* unsupported */ } });
    } else {
      new Notification(title, options);
    }
  } catch { /* notifications unsupported */ }
}
