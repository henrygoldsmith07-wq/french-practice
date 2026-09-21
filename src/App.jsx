import { lazy, Suspense, useEffect, useMemo, useReducer, useState } from 'react';
import HomeDashboard from './components/HomeDashboard';
import FeedbackWidget from './components/FeedbackWidget';
const ChatArena = lazy(() => import('./components/ChatArena'));
const SessionDashboard = lazy(() => import('./components/SessionDashboard'));
const Vocabulary = lazy(() => import('./components/Vocabulary'));
const DevPanel = lazy(() => import('./components/DevPanel'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const PathSetup = lazy(() => import('./components/PathSetup'));
const LearningPath = lazy(() => import('./components/LearningPath'));
const Profile = lazy(() => import('./components/Profile'));
const RealWorld = lazy(() => import('./components/RealWorld'));
const Personalise = lazy(() => import('./components/Personalise'));
const Offline = lazy(() => import('./components/Offline'));
const Analytics = lazy(() => import('./components/Analytics'));
const Reference = lazy(() => import('./components/Reference'));
const Focus = lazy(() => import('./components/Focus'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const GlobalSearch = lazy(() => import('./components/GlobalSearch'));
// TodaySession (and its drill-runner graph) is an overlay the learner opens
// deliberately — lazy keeps its curriculum/memory/quiz imports out of the
// first-load chunk entirely.
const TodaySession = lazy(() => import('./components/TodaySession'));
// Grammar / Skills / AiHub / Culture chunks are NOT imported here — App never
// renders them directly (Learn hub owns them) and lib/prefetch.js owns their
// intent/idle loading. Importing them here would drag them into App's chunk
// graph for nothing.
import { getPath, applyActivity } from './lib/path';
import { getScenarios } from './lib/data';
import usePwaInstall from './hooks/usePwaInstall';
import useOverlayNav from './hooks/useOverlayNav';
import useStudioBoot from './hooks/useStudioBoot';
import useSessionLifecycle from './hooks/useSessionLifecycle';
import useAppearance from './hooks/useAppearance';
import {
  getApiKey, getSettings, setSettings as persistSettings, getStreak, getXp, addXp,
  getTodayXp,
  getCoins, addCoins, getAvatar, bumpChallengeMetric, addEventXp,
  getPrefs, setPrefs, getSessions,
  setApiKey as persistApiKey, setAvatar as persistAvatar, ownAvatar, setHabitList,
  setOnboarded, setLastActivity, getLastActivity, recordSpeakingGap, recordLearningActivity,
  shouldOnboard,
} from './lib/storage';
// Heavy content libraries (vocab packs, grammar topics, listening tracks,
// groq) are NOT statically imported here — they would drag ~600 kB of content
// into the first bundle for a handful of label lookups. They load lazily
// below and inside their own screens' chunks.
import { adaptiveLevel } from './lib/personalise';
import { prefetchForTab } from './lib/prefetch';
import { AVATARS, activeEvent, levelFromXp } from './lib/game';
import { useDueCount, loadAllEntries, warmScenarios } from './lib/vocabAsync';
import { getLanguage, featureAvailableNow, hasCapabilityNow } from './lib/languages';
import { overlayReducer, overlayIs, overlayPayload, initialOverlay } from './lib/overlayNav';
import { relayEnabled } from './lib/relay';
import { Flame, Bolt, Sun, Moon, Gear, Key, ArrowRight, Home, MessageCircle, Layers, BookOpen, BarChart, Search, Coins as CoinsIcon, X, Download } from './components/icons';
import Mascot from './components/Mascot';
import LearnHub from './components/LearnHub';
import ProgressHub from './components/ProgressHub';

// Focused 5-tab nav: Today | Speak | Review | Learn | Progress
// Everything else lives underneath Learn / Progress so the bar never competes.
const TABS = [
  ['today', Home, 'Today'],
  ['speak', MessageCircle, 'Speak'],
  ['review', Layers, 'Review'],
  ['learn', BookOpen, 'Learn'],
  ['progress', BarChart, 'Progress'],
];
const TAB_ALIASES = { home: 'today', arena: 'speak', cards: 'review', skills: 'learn', grammar: 'learn', ai: 'learn', culture: 'learn', dev: 'progress' };

export default function App() {
  const [apiKey, setApiKey] = useState(getApiKey);
  const [settings, setSettings] = useState(() => {
    const current = getSettings();
    return getApiKey() || relayEnabled ? { ...current, mockMode: relayEnabled ? false : current.mockMode } : { ...current, mockMode: true };
  });
  const [tab, _setTab] = useState('today');
  const [learnView, setLearnView] = useState(null);
  const [progressView, setProgressView] = useState(null);
  const setTab = (id) => {
    const canonical = TAB_ALIASES[id] || id;
    if (canonical === 'learn') setLearnView(null);
    if (canonical === 'progress') setProgressView(null);
    _setTab(canonical);
  };
  // ONE structured overlay state replaces ~15 mutually-exclusive booleans
  // (lib/overlayNav.js): at most one overlay can be open, so two-modals-at-
  // once and detached-payload states are structurally impossible. Escape and
  // Android Back close whatever is open via useOverlayNav; opening a second
  // overlay replaces the first (modal focus, not a stack).
  const [overlay, dispatchOverlay] = useReducer(overlayReducer, initialOverlay);
  const openOverlay = (name, payload = undefined) => dispatchOverlay({ type: 'open', overlay: name, payload });
  const closeOverlay = () => dispatchOverlay({ type: 'close' });
  // In-flight session lifecycle (persist/restore, warm-then-heal scenario
  // resolution, language switching) and document appearance live in focused
  // hooks; App stays composition.
  const {
    scenario, setScenario, history, setHistory, switchLanguage,
  } = useSessionLifecycle();
  const { isDark } = useAppearance(settings);
  const [lastScores, setLastScores] = useState(null);
  // Fluency mode state: the debrief is produced once, after the session.
  const [conversationMode, setConversationMode] = useState(() => {
    try { return localStorage.getItem('fp.conversationMode') === 'fluency' ? 'fluency' : 'coach'; } catch { return 'coach'; }
  });
  const [fluencyReviewResult, setFluencyReviewResult] = useState(null);
  const [debriefPending, setDebriefPending] = useState(false);
  const [streakTick, setStreakTick] = useState(0);
  const [xp, setXp] = useState(getXp);
  const [xpGain, setXpGain] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [coins, setCoins] = useState(getCoins);
  const [avatarId, setAvatarId] = useState(getAvatar);
  const [prefs, setPrefsState] = useState(getPrefs);
  const pwa = usePwaInstall();
  const [installDismissed, setInstallDismissed] = useState(false);
  const [path, setPath] = useState(getPath);
  // The ONE live count of cards due (vocab + notebook), in the active
  // language: useDueCount handles the library chunk load, the language-switch
  // reload, and the new-card cap internally. `xp`, `streakTick` and `tab`
  // bump it whenever SRS/notebook state can have changed; the path fingerprint
  // covers the learning path's CEFR reassignment.
  const dueTick = `${tab}|${xp}|${streakTick}|${path ? `${path.goal}:${path.cefr}:${path.unitIndex}:${path.lessonIndex}` : ''}`;
  const dueCount = useDueCount(dueTick);
  const [grammarFocus, setGrammarFocus] = useState(null);
  const [skillArea, setSkillArea] = useState(null);
  const [speakingMode, setSpeakingMode] = useState(null);
  const [listeningMode, setListeningMode] = useState(null);

  // Boot prefetches: the vocabulary library loads in its own chunk
  // (per-language registries — only the active language's dictionaries
  // download), and loadAllEntries warms its sync facade so lazy screens can
  // keep calling allEntries() unchanged. The scenario registry gets the same
  // warm-up — the speak tab, Home and search read getScenarios() synchronously.
  // Due counts, the OS badge and the smart reminder recompute through
  // useDueCount when the chunk lands; nothing else needs to gate on readiness.
  useEffect(() => {
    loadAllEntries().catch(() => {});
    warmScenarios().catch(() => {});
  }, []);

  // Non-rendering boot work (chunk warm-up, smart reminder, OS badge,
  // study clock, telemetry sink) lives in one hook; App stays composition.
  const { telemetry, clearTelemetry } = useStudioBoot({ dueCount, smartReminders: settings.smartReminders });

  // First-run onboarding: a brand-new learner (no key, no XP, no sessions,
  // not onboarded before) is greeted by the picker. Returning learners and
  // every seeded/skipped state land straight in the studio. Runs once after
  // mount so storage has settled.
  useEffect(() => {
    if (shouldOnboard()) openOverlay('onboarding');
  }, []); // mount-only gate: a brand-new learner gets the picker, once

  // Escape / Android Back close the one open overlay (useOverlayNav pushes
  // and consumes a history entry around it).
  useOverlayNav([[Boolean(overlay), closeOverlay]]);

  const updateSettings = (s) => {
    if (s.language !== settings.language) switchLanguage(s.language);
    setSettings(s);
    persistSettings(s);
  };

  const handleApiKeyChange = (key) => {
    setApiKey(key);
    if (key && settings.mockMode) updateSettings({ ...settings, mockMode: false });
  };

  const updatePrefs = (patch) => {
    setPrefs(patch);
    setPrefsState(getPrefs());
  };

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
    if (!apiKey && !settings.mockMode) updateSettings({ ...settings, mockMode: true });
    setOnboarded();
    closeOverlay();
  };

  const effectiveLevel = adaptiveLevel(settings.level, getSessions(), prefs.adaptiveDifficulty).level;



  const toggleTheme = () =>
    updateSettings({ ...settings, theme: isDark ? 'light' : 'dark' });

  const ready = Boolean(apiKey) || relayEnabled || settings.mockMode;
  const streak = getStreak();
  void streakTick;

  const awardXp = (gained) => {
    const beforeXp = getXp();
    const beforeToday = getTodayXp();
    const newXp = addXp(gained);
    setXp(newXp);
    setXpGain({ amount: gained, id: Date.now() });
    setCoins(addCoins(Math.max(1, Math.round(gained / 3))));
    const event = activeEvent();
    if (event) addEventXp(event.id, gained);
    const before = levelFromXp(beforeXp);
    const after = levelFromXp(newXp);
    const dailyGoal = settings.dailyGoal || 30;
    try {
      if (after.level > before.level) {
        setCelebration({ kind: 'level', level: after.level, title: after.title, newTitle: after.title !== before.title });
        navigator.vibrate?.([30, 50, 30, 50, 70]);
      } else if (beforeToday < dailyGoal && getTodayXp() >= dailyGoal) {
        setCelebration({ kind: 'goal' });
        navigator.vibrate?.([25, 40, 45]);
      } else {
        navigator.vibrate?.(12);
      }
    } catch { /* no haptics */ }
  };

  const handleTurn = (scores) => {
    if (!scenario) return; // registry still resolving (DE/ES cold start)
    setLastScores(scores);
    recordSpeakingGap('conversation', {
      label: 'Conversation turn',
      score: scores?.overall ?? 0,
      source: 'conversation',
      context: { scenarioId: scenario.id },
    });
    awardXp(Math.max(1, Math.round(scores.overall / 10)));
    setLastActivity('session', scenario.id, `Conversation: ${scenario.title}`);
  };

  const handleActivity = (evt) => {
    if (!evt || typeof evt !== 'object') return;
    recordLearningActivity(evt);
    const labels = {
      cards: 'Flashcard review',
      dictation: 'Dictée practice',
      quickfire: 'Quick Fire improv',
      session: evt.scenarioId ? `Conversation: ${getScenarios().find((x) => x.id === evt.scenarioId)?.title || ''}` : null,
      pronunciation: 'Pronunciation practice',
      speaking: 'Exam speaking',
      writing: 'Writing practice',
      reading: 'Reading practice',
      'field-note': evt.noteId ? 'Field note practice' : 'Field Notes',
    };
    // Grammar/listening titles live in heavy content chunks — resolve the
    // label lazily rather than importing those libraries for one lookup.
    if (evt.type === 'grammar' && evt.topicId) {
      import('./lib/grammar').then(({ getGrammarTopic }) => {
        setLastActivity('grammar', evt.topicId, `Grammar: ${getGrammarTopic(evt.topicId)?.title || ''}`);
      }).catch(() => {});
    }
    if (evt.type === 'listening' && evt.trackId) {
      import('./lib/listening').then(({ getTrack }) => {
        setLastActivity('listening', evt.trackId, `Listening: ${getTrack(evt.trackId)?.title || ''}`);
      }).catch(() => {});
    }
    if (labels[evt.type]) setLastActivity(evt.type, evt.scenarioId || evt.topicId || evt.trackId || evt.textId || evt.noteId, labels[evt.type]);
    if (['cards', 'session', 'dictation', 'quickfire', 'grammar'].includes(evt.type)) {
      bumpChallengeMetric(evt.type);
    }
    const result = applyActivity(getPath(), evt);
    if (!result.changed) return;
    setPath({ ...result.path });
    if (result.levelChange === 'up') {
      updateSettings({ ...settings, level: result.path.cefr });
    }
  };

  const startLesson = (lesson) => {
    if (lesson.scenarioId) {
      const s = getScenarios().find((x) => x.id === lesson.scenarioId);
      if (s && s.id !== scenario?.id) {
        setScenario(s);
        setHistory([]);
        setLastScores(null);
      }
    }
    if (lesson.type === 'dictation') { setSkillArea('listening'); setListeningMode('dictation'); setLearnView('skills'); setTab('learn'); return; }
    if (lesson.type === 'quickfire') { setSkillArea('speaking'); setSpeakingMode('quickfire'); setLearnView('skills'); setTab('learn'); return; }
    if (lesson.type === 'grammar') {
      if (featureAvailableNow('grammar')) { setGrammarFocus(lesson.topicId); setLearnView('grammar'); }
      else setLearnView('skills');
      setTab('learn');
      return;
    }
    // Capability-gated lesson types: the reading and listening libraries are
    // French-authored, so a stale link can never route a beta learner into
    // them — they fall back to the Skills hub instead.
    if (lesson.type === 'reading') {
      if (hasCapabilityNow('reading-library')) { setSkillArea('reading'); setLearnView('skills'); }
      else setLearnView('skills');
      setTab('learn');
      return;
    }
    if (lesson.type === 'listening') {
      if (hasCapabilityNow('listening-library')) { setSkillArea('listening'); setListeningMode(lesson.trackId); }
      setLearnView('skills');
      setTab('learn');
      return;
    }
    if (lesson.type === 'cards') { setTab('review'); return; }
    // scenario/checkpoint -> Speak
    setTab(lesson.type === 'checkpoint' || lesson.type === 'scenario' ? 'speak' : 'today');
  };

  const startRoleplay = (scenarioId) => {
    const s = getScenarios().find((x) => x.id === scenarioId);
    if (s && s.id !== scenario?.id) {
      setScenario(s);
      setHistory([]);
      setLastScores(null);
    }
    closeOverlay();
    setTab('speak');
  };

  const runRecommendation = (type) => {
    closeOverlay();
    if (type === 'arena' || type === 'speak') { setTab('speak'); return; }
    if (type === 'cards' || type === 'review') { setTab('review'); return; }
    if (type === 'field-notes') { setTab('learn'); setLearnView('field-notes'); return; }
    if (type === 'grammar') {
      // The grammar library is French-authored: a beta recommendation is
      // re-routed to the Learn hub instead of a screen that cannot exist.
      if (hasCapabilityNow('grammar')) setLearnView('grammar');
      else setLearnView(null);
      setTab('learn');
      return;
    }
    if (type === 'reading' || type === 'listening' || type === 'dictation' || type === 'quickfire') { setLearnView('skills'); setTab('learn'); return; }
  };

  const goFromSearch = (hit) => {
    closeOverlay();
    // Final gate for French-only features: search results, stale links and
    // any future caller can never land a Beta language on them. The hub also
    // hides the entry points — this closes the loop behind them.
    if (hit.type === 'grammar' && !featureAvailableNow('grammar')) return;
    if (hit.type === 'scenario') {
      const sc = getScenarios().find((x) => x.id === hit.id);
      if (sc && sc.id !== scenario?.id) { setScenario(sc); setHistory([]); setLastScores(null); }
      setTab('speak');
    }
    if (hit.type === 'field-notes') { setTab('learn'); setLearnView('field-notes'); }
    if (hit.type === 'grammar' && featureAvailableNow('grammar')) { setGrammarFocus(hit.id); setLearnView('grammar'); setTab('learn'); }
    if (hit.type === 'reading' && hasCapabilityNow('reading-library')) { setSkillArea('reading'); setLearnView('skills'); setTab('learn'); }
    if (hit.type === 'listening' && hasCapabilityNow('listening-library')) { setSkillArea('listening'); setListeningMode(hit.id); setLearnView('skills'); setTab('learn'); }
  };

  const resumeActivity = (la) => {
    if (!la) return;
    if (la.type === 'session') {
      const sc = getScenarios().find((x) => x.id === la.id);
      if (sc && sc.id !== scenario?.id) { setScenario(sc); setHistory([]); setLastScores(null); }
      setTab('speak');
    } else if (la.type === 'grammar') {
      // Stale evidence from an earlier French period must never route a beta
      // learner into French-authored screens — they re-route to the hub.
      if (featureAvailableNow('grammar')) { setGrammarFocus(la.id); setLearnView('grammar'); }
      else setLearnView(null);
      setTab('learn');
    }
    else if (la.type === 'listening') {
      if (hasCapabilityNow('listening-library')) { setSkillArea('listening'); setListeningMode(la.id); }
      setLearnView('skills'); setTab('learn');
    }
    else if (la.type === 'reading') {
      if (hasCapabilityNow('reading-library')) { setSkillArea('reading'); setLearnView('skills'); }
      else setLearnView(null);
      setTab('learn');
    }
    else if (la.type === 'cards') setTab('review');
    else if (la.type === 'dictation') { setSkillArea('listening'); setListeningMode('dictation'); setLearnView('skills'); setTab('learn'); }
    else if (la.type === 'quickfire') { setSkillArea('speaking'); setSpeakingMode('quickfire'); setLearnView('skills'); setTab('learn'); }
    else if (la.type === 'field-note') { setTab('learn'); setLearnView('field-notes'); }
  };

  const endSession = () => {
    if (history.length === 0) return;
    if (conversationMode === 'fluency') {
      // Fluency run: analyse AFTER the session, then show the report with
      // the debrief attached. Only the highest-value corrections surface.
      if (debriefPending) return;
      setDebriefPending(true);
      (async () => {
        try {
          const { fluencyReview } = await import('./lib/groq');
          const { recordFluencyMistakes } = await import('./lib/fluencyReview');
          const review = await fluencyReview(apiKey, {
            scenario, history, level: effectiveLevel, mock: settings.mockMode,
          });
          recordFluencyMistakes(review);
          setFluencyReviewResult(review);
        } catch { /* the report must open even if the debrief fails */ }
        setDebriefPending(false);
        openOverlay('dashboard');
      })();
      return;
    }
    openOverlay('dashboard');
  };

  const closeDashboard = () => {
    closeOverlay();
    setHistory([]);
    setLastScores(null);
    setFluencyReviewResult(null);
  };

  return (
    <div className="h-dvh flex flex-col bg-bg text-ink font-sans app-enter">
      <a href="#main" className="skip-link">Skip to content</a>
      <span className="sr-only" role="status" aria-live="polite">
        {xpGain ? `${xpGain.amount} XP earned` : ''}
      </span>
      {/* flex-wrap: on a narrow phone the title, the streak/XP badges and the
          five header controls together exceed the viewport, and without it the
          row overflowed horizontally and pushed Settings off-screen. Wrapping
          keeps every control reachable rather than truncating or hiding one. */}
      <header className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line bg-surface backdrop-blur">
        <img src="/logo.svg" alt="" width={27} height={27} className="rounded-lg" aria-hidden="true" />
        <h1 className="font-bold text-lg text-ink tracking-tight mr-1 whitespace-nowrap min-w-0">
          {getLanguage(settings.language).studio}
          <span className="sr-only"> — {getLanguage(settings.language).name} speaking practice</span>
        </h1>            <button
              onClick={() => openOverlay('profile')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${streak.count > 0 ? 'bg-surface2 text-ink' : 'bg-surface2 text-ink3'}`}
              title="Day streak — tap for your stats"
              aria-label={`${streak.count}-day streak — open your stats`}
            >
          <Flame size={13} /> {streak.count}
        </button>
        <button onClick={() => openOverlay('profile')} aria-label={`${xp} XP — open your stats`} className="relative flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface2 text-ink text-xs font-semibold whitespace-nowrap" title="Experience points — tap for your stats">
          <Bolt size={13} /> {xp.toLocaleString('en-GB')} XP
          {xpGain && (
            <span key={xpGain.id} className="xp-pop absolute -top-1 right-0 text-ink font-bold text-xs pointer-events-none">
              +{xpGain.amount}
            </span>
          )}
        </button>
        <button onClick={() => openOverlay('profile')} aria-label={`${coins} coins — open your stats`} className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface2 text-ink text-xs font-semibold whitespace-nowrap" title="Coins — tap for your stats">
          <CoinsIcon size={13} /> {coins}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => openOverlay('search')} aria-label="Search the studio" title="Search" className="w-10 h-10 grid place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <Search size={18} />
          </button>
          <button onClick={() => openOverlay('profile')} aria-label="Open your profile" title="Profile" className="w-10 h-10 grid place-items-center rounded-full bg-surface2 hover:bg-line text-lg">
            <span role="img" aria-hidden="true">{(AVATARS.find((a) => a.id === avatarId) || AVATARS[0]).emoji}</span>
          </button>
          {tab === 'speak' && history.length > 0 && (
            <button onClick={endSession} disabled={debriefPending} className="btn btn-secondary min-h-10 px-3.5 rounded-xl text-xs">
              {debriefPending ? 'Reviewing…' : 'End Session'}
            </button>
          )}
          <button onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} title={isDark ? 'Light mode' : 'Dark mode'} className="w-10 h-10 grid place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink text-lg">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => openOverlay('settings')} aria-label="Settings" className="w-10 h-10 grid place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink text-lg">
            <Gear size={18} />
          </button>
        </div>
      </header>

      {!ready && (
        <button onClick={() => openOverlay('settings')} className="fade-in mx-4 mt-3 flex items-center gap-3 text-left bg-surface2 border border-line rounded-xl px-4 py-3 hover:border-ink3 transition">
          <span className="w-10 h-10 grid place-items-center rounded-xl bg-surface border border-line text-ink" aria-hidden="true"><Key size={18} /></span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-ink">Welcome to the Studio!</span>
            <span className="block text-xs text-ink2 mt-0.5">Add your free AI key (build.nvidia.com) to start speaking {getLanguage(settings.language).name} — tap here.</span>
          </span>
          <span className="text-ink2" aria-hidden="true"><ArrowRight size={16} /></span>
        </button>
      )}

      {pwa.canInstall && !installDismissed && (
        <div className="fade-in mx-4 mt-3 flex items-center gap-3 bg-surface2 border border-line rounded-xl px-4 py-3">
          <span className="w-10 h-10 grid place-items-center rounded-xl bg-surface border border-line text-ink" aria-hidden="true"><Download size={18} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-ink">Install Le Studio</span>
            <span className="block text-xs text-ink2 mt-0.5">Add it to your device for full-screen, offline practice.</span>
          </span>
          <button onClick={() => pwa.promptInstall()} className="btn btn-primary min-h-9 px-3.5 rounded-lg text-xs shrink-0">Install</button>
          <button onClick={() => setInstallDismissed(true)} aria-label="Dismiss install banner" className="w-8 h-8 grid place-items-center rounded-full text-ink3 hover:text-ink shrink-0"><X size={15} /></button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <main id="main" className="flex-1 min-w-0 flex flex-col">
          <Suspense fallback={<ScreenLoader />}>
          {tab === 'today' && (
            <HomeDashboard
              dailyGoal={settings.dailyGoal}
              level={settings.level}
              prefs={prefs}
              onStartLesson={startLesson}
              onNavigate={setTab}
              onOpenFieldNotes={() => { setTab('learn'); setLearnView('field-notes'); }}
              lastActivity={getLastActivity()}
              onResume={resumeActivity}
              onStartToday={() => openOverlay('today')}
              onPickScenario={(s) => {
                if (s && s.id !== scenario?.id) {
                  setScenario(s);
                  setHistory([]);
                  setLastScores(null);
                }
              }}
            />
          )}
          {/* Speak renders deterministically during session hydration: a
              loader, never a blank void and never a half-restored arena. The
              registry chunk resolves a beat after boot; ChatArena only mounts
              once the scenario — restored or first — is final. */}
          {tab === 'speak' && (scenario ? (
            <ChatArena
              onEndSession={endSession}
              apiKey={apiKey}
              mockMode={settings.mockMode}
              ttsRate={settings.ttsRate}
              level={effectiveLevel}
              conversationMode={conversationMode}
              onConversationMode={(m) => {
                setConversationMode(m);
                try { localStorage.setItem('fp.conversationMode', m); } catch { /* ignore */ }
              }}
              onTtsRate={(r) => updateSettings({ ...settings, ttsRate: r })}
              onTurn={handleTurn}
              onXp={awardXp}
              onGrammarTip={(topicId) => {
                if (!featureAvailableNow('grammar')) return;
                setGrammarFocus(topicId);
                setLearnView('grammar');
                setTab('learn');
              }}
              history={history}
              setHistory={setHistory}
              scenario={scenario}
              setScenario={setScenario}
            />
          ) : (
            <ScreenLoader />
          ))}
          {tab === 'review' && (
            <Vocabulary apiKey={apiKey} mockMode={settings.mockMode} onActivity={handleActivity} onXp={awardXp} />
          )}
          {tab === 'learn' && (
            <LearnHub
              view={learnView}
              onView={(v) => {
                if (v === 'realworld-overlay') { openOverlay('realWorld'); return; }
                setLearnView(v);
              }}
              grammarFocus={grammarFocus}
              onFocusConsumed={() => setGrammarFocus(null)}
              onXp={awardXp}
              onActivity={handleActivity}
              skillsArea={skillArea}
              onSkillsArea={(a) => {
                setSkillArea(a);
                if (a !== 'speaking') setSpeakingMode(null);
                if (a !== 'listening') setListeningMode(null);
              }}
              speaking={{ mode: speakingMode, onModeChange: setSpeakingMode }}
              listening={{ mode: listeningMode, onModeChange: setListeningMode }}
              common={{ apiKey, mockMode: settings.mockMode, ttsRate: settings.ttsRate, level: effectiveLevel, onXp: awardXp, onActivity: handleActivity }}
              apiKey={apiKey}
              mockMode={settings.mockMode}
              level={effectiveLevel}
              referenceTool={overlayIs(overlay, 'reference') ? overlayPayload(overlay, 'tool') : null}
              onCloseReference={() => { closeOverlay(); setLearnView(null); }}
              onOpenSpeaking={() => setTab('speak')}
            />
          )}
          {tab === 'progress' && (
            <ProgressHub
              view={progressView}
              onView={(v) => {
                if (v === 'dev') { openOverlay('devPanel'); return; }
                setProgressView(v);
              }}
              onXp={awardXp}
              weeklyGoal={settings.weeklyGoal}
              onHeaderChange={({ coins: c, avatarId: a }) => { setCoins(c); setAvatarId(a); }}
              path={path}
              dueCount={dueCount}
              onStartLesson={startLesson}
              onOpenPathSetup={() => openOverlay('pathSetup')}
              onOpenGrammar={(topicId) => {
                if (!featureAvailableNow('grammar')) return;
                setGrammarFocus(topicId); setLearnView('grammar'); setTab('learn');
              }}
              onOpenSpeaking={() => setTab('speak')}
            />
          )}
          </Suspense>
        </main>          {tab === 'speak' && scenario && <FeedbackWidget scores={lastScores} turnCount={history.length} />}
      </div>

      <nav className="flex border-t border-line bg-surface backdrop-blur pb-safe elev-nav" aria-label="Main navigation">
        {TABS.map(([id, icon, label]) => (
          <TabButton key={id} id={id} icon={icon} label={label} active={tab === id} onClick={setTab} />
        ))}
      </nav>

      {/* All overlays render from the ONE structured state: at most one open,
          Escape/Back handled by useOverlayNav, payloads travel with the
          overlay descriptor (e.g. reference's initial tool). */}
      <Suspense fallback={null}>
      {overlayIs(overlay, 'settings') && (
        <SettingsModal open onClose={closeOverlay} apiKey={apiKey} onKeyChange={handleApiKeyChange} settings={settings} onSettingsChange={updateSettings} onReplayOnboarding={() => openOverlay('onboarding')} />
      )}
      {overlayIs(overlay, 'dashboard') && (
        <SessionDashboard open onClose={closeDashboard} apiKey={apiKey} mockMode={settings.mockMode} scenario={scenario} history={history} level={effectiveLevel} onXp={awardXp} fluencyReview={fluencyReviewResult} fluencyPending={debriefPending} onSessionSaved={(report) => { setStreakTick((t) => t + 1); handleActivity({ type: 'session', scenarioId: scenario?.id, score: report?.average_scores?.overall ?? 0 }); }} />
      )}
      {overlayIs(overlay, 'personalise') && (<Personalise open onClose={closeOverlay} prefs={prefs} onPrefsChange={updatePrefs} baseLevel={settings.level} onRun={runRecommendation} />)}
      {overlayIs(overlay, 'offline') && <Offline open onClose={closeOverlay} pwa={pwa} />}
      {overlayIs(overlay, 'analytics') && <Analytics open onClose={closeOverlay} />}
      {overlayIs(overlay, 'reference') && (<Reference open initialTool={overlayPayload(overlay, 'tool')} onXp={awardXp} onClose={() => { closeOverlay(); setLearnView(null); }} />)}
      {overlayIs(overlay, 'focus') && <Focus open onClose={closeOverlay} />}
      {/* Developer panel: opt-in (Settings → Developer panel), lazy, and an
          overlay — never inline in a tab, where its height would push layout
          around and intercept the tab grid's clicks. */}
      {overlayIs(overlay, 'devPanel') && (
        <DevPanel open onClose={closeOverlay} telemetry={telemetry} apiKey={apiKey} mockMode={settings.mockMode} onMockMode={(v) => updateSettings({ ...settings, mockMode: v })} onClear={clearTelemetry} />
      )}
      {overlayIs(overlay, 'learningPath') && (
        <div className="fixed inset-0 z-[55] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Learning path">
          <div className="mx-auto min-h-full max-w-lg px-4 py-4">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="flex-1 text-lg font-bold text-ink">Learning path</h2>
              <button type="button" onClick={closeOverlay} aria-label="Close learning path" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink"><X size={18} /></button>
            </div>
            <LearningPath path={path} dueCount={dueCount} onStartLesson={startLesson} onOpenSetup={() => openOverlay('pathSetup')} />
          </div>
        </div>
      )}
      {overlayIs(overlay, 'onboarding') && (<Onboarding open initialLanguage={settings.language} onComplete={finishOnboarding} onSkip={skipOnboarding} onStartConversation={() => setTab('speak')} />)}
      {overlayIs(overlay, 'search') && <GlobalSearch open onClose={closeOverlay} onGo={goFromSearch} />}
      {overlayIs(overlay, 'realWorld') && (<RealWorld open onClose={closeOverlay} onRoleplay={startRoleplay} onXp={awardXp} />)}
      {overlayIs(overlay, 'profile') && (<Profile open onClose={closeOverlay} onXp={awardXp} weeklyGoal={settings.weeklyGoal} onHeaderChange={({ coins: c, avatarId: a }) => { setCoins(c); setAvatarId(a); }} />)}
      {overlayIs(overlay, 'pathSetup') && (<PathSetup open onClose={closeOverlay} onCreated={(p) => { setPath(p); closeOverlay(); updateSettings({ ...settings, level: p.cefr }); }} />)}
      </Suspense>
      {overlayIs(overlay, 'today') && (
        <Suspense fallback={<ScreenLoader />}>
          <TodaySession
            open
            onClose={closeOverlay}
            minutes={20}
            apiKey={apiKey}
            mockMode={settings.mockMode}
            level={effectiveLevel}
            ttsRate={settings.ttsRate}
            onTurn={handleTurn}
            onXp={awardXp}
            onActivity={handleActivity}
          />
        </Suspense>
      )}
      {celebration && <Celebration data={celebration} onDone={() => setCelebration(null)} />}
    </div>
  );
}

function Celebration({ data, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [onDone]);
  const pieces = useMemo(() => {
    const shades = ['var(--ink)', 'var(--ink-2)', 'var(--ink-3)', 'var(--line)'];
    return Array.from({ length: 28 }, (_, i) => ({
      key: i,
      left: `${Math.round((i / 28) * 100 + (Math.random() * 6 - 3))}%`,
      dx: `${Math.round(Math.random() * 120 - 60)}px`,
      rot: `${Math.round(Math.random() * 540 + 180)}deg`,
      sz: `${6 + Math.round(Math.random() * 6)}px`,
      dur: `${1.9 + Math.random() * 1.1}s`,
      delay: `${Math.random() * 0.4}s`,
      pc: shades[i % shades.length],
      round: i % 3 === 0,
    }));
  }, []);
  const level = data.kind === 'level';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={level ? 'Level up' : 'Goal reached'}>
      <button className="absolute inset-0 bg-black/40 fade-in" aria-label="Dismiss" onClick={onDone} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {pieces.map((p) => (
          <span key={p.key} className="confetti-piece" style={{ left: p.left, '--dx': p.dx, '--rot': p.rot, '--sz': p.sz, '--dur': p.dur, '--delay': p.delay, '--pc': p.pc, borderRadius: p.round ? '9999px' : '2px' }} />
        ))}
      </div>
      <div className="celebrate-pop relative mx-6 w-full max-w-xs bg-surface border border-line rounded-3xl elev-pop px-6 py-7 text-center">
        <div className="w-16 h-16 mx-auto grid place-items-center rounded-2xl bg-surface2 border border-line">
          {level ? <span className="text-2xl font-black text-ink tabular-nums">{data.level}</span> : <Mascot mood="cheer" size={40} className="text-ink" />}
        </div>
        <p className="mt-4 text-lg font-bold text-ink" lang="fr">{level ? `Niveau ${data.level} !` : 'Objectif atteint !'}</p>
        <p className="mt-1 text-sm text-ink2">{level ? (data.newTitle ? `You’re now ${data.title}. Keep the momentum.` : 'Another level down — keep the momentum.') : 'Daily goal reached — anything more today is pure bonus.'}</p>
        <button onClick={onDone} className="btn btn-primary w-full min-h-11 rounded-xl text-sm mt-5">{level ? 'Merci !' : 'Allez !'}</button>
      </div>
    </div>
  );
}

function ScreenLoader() {
  return (
    <div className="flex-1 grid place-items-center py-20" role="status" aria-label="Loading">
      <span className="w-6 h-6 rounded-full border-2 border-line border-t-ink animate-spin" />
    </div>
  );
}

function TabButton({ id, icon: TabIcon, label, active, onClick }) {
  // Intent prefetch: pointing at (or keyboard-focusing) a tab downloads that
  // tab's chunk before the tap lands, so the first navigation never shows a
  // spinner — without the old boot-time blanket warm-up.
  return (
    <button
      onClick={() => onClick(id)}
      onPointerEnter={() => prefetchForTab(id)}
      onFocus={() => prefetchForTab(id)}
      aria-current={active ? 'page' : undefined}
      className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 min-h-14 text-[11px] font-medium transition-colors ${active ? 'text-ink' : 'text-ink3 hover:text-ink2'}`}
    >
      <span aria-hidden="true" className={`absolute top-0 h-0.5 rounded-full bg-ink transition-all duration-200 ${active ? 'w-8 opacity-100' : 'w-0 opacity-0'}`} />
      <TabIcon size={18} />
      {label}
    </button>
  );
}
