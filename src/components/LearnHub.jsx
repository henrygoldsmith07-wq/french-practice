import { lazy, Suspense } from 'react';
import { Book, Mic, Sparkles, Landmark, Compass, Search, ChevronRight, GraduationCap, Bookmark } from './icons';
import { contentLang } from '../lib/content/active.js';
import { featureAvailableNow, betaAlternativeCopy, getLanguage } from '../lib/languages';
import { CHIP } from '../components/classNames.js';

const LazyGrammar = lazy(() => import('./Grammar'));
const LazySkills = lazy(() => import('./Skills'));
const LazyCulture = lazy(() => import('./Culture'));
const LazyAiHub = lazy(() => import('./AiHub'));
const LazyReference = lazy(() => import('./Reference'));
const LazyExamSimulator = lazy(() => import('./ExamSimulator'));
const LazyFieldNotes = lazy(() => import('./FieldNotes'));

function ScreenLoader() {
  return (
    <div className="grid place-items-center py-12" role="status" aria-label="Loading">
      <span className="w-6 h-6 rounded-full border-2 border-line border-t-ink animate-spin" />
    </div>
  );
}

const SECTIONS_ALL = [
  { id: 'grammar', title: 'Grammar', subtitle: '60 CEFR topics · A1 to C1', icon: Book },
  { id: 'skills', title: 'Skills', subtitle: 'Speaking · Listening · Reading · Writing', icon: Mic },
  { id: 'field-notes', title: 'Field Notes', subtitle: 'Turn real life into a private practice loop', icon: Bookmark },
  { id: 'ai', title: 'AI tutor', subtitle: 'Ask anything, get exercises', icon: Sparkles },
  { id: 'culture', title: 'Culture', subtitle: 'Customs, food, regions, history', icon: Landmark },
  { id: 'exams', title: 'Exam simulator', subtitle: 'WJEC · AQA · Edexcel — speaking · writing · listening · reading', icon: GraduationCap },
  { id: 'reference', title: 'Reference', subtitle: 'Dictionary & conjugations', icon: Search },
  { id: 'realworld', title: 'Real-world', subtitle: 'Travel, café, medical phrases', icon: Compass },
];

// Language honesty: grammar topics, culture and exam boards are authored in
// French only. For beta languages those tools hide instead of showing
// half-working content — the core loop (Today, Speak, vocab, dictée,
// phrasebook, AI tutor) is what beta covers. The gate is the shared
// FULL_ONLY_FEATURES registry (languages.js), also used by onboarding,
// search and deep links.
const SECTIONS = () => SECTIONS_ALL.filter(
  (s) => featureAvailableNow(s.id),
);

export default function LearnHub({
  view,
  onView,
  grammarFocus,
  onFocusConsumed,
  onXp,
  onActivity,
  skillsArea,
  onSkillsArea,
  speaking,
  listening,
  common,
  apiKey,
  mockMode,
  level,
  referenceTool,
  onCloseReference,
  onOpenSpeaking,
}) {
  // Defensive deep-link gate: even if a stale link, a recommendation or a
  // future caller routes here, a French-authored screen can never render for
  // a beta language — the hub shows the honest beta note instead.
  if (view && ['grammar', 'culture', 'exams'].includes(view) && !featureAvailableNow(view)) {
    return (
      <div className="h-full overflow-y-auto nice-scroll">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="max-w-lg mx-auto px-4 py-10 space-y-4 text-center">
          <p className="text-lg font-bold text-ink">Not available for {getLanguage(contentLang()).name} yet</p>
          <p className="text-sm text-ink2 leading-relaxed">{betaAlternativeCopy(contentLang())}</p>
          <button onClick={() => onView(null)} className="btn btn-primary min-h-11 px-6 rounded-xl text-sm">Back to Learn</button>
        </div>
      </div>
    );
  }
  if (view === 'grammar') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="flex-1 min-h-0">
          <Suspense fallback={<ScreenLoader />}>
            <LazyGrammar focusTopicId={grammarFocus} onFocusConsumed={onFocusConsumed} onXp={onXp} onActivity={onActivity} />
          </Suspense>
        </div>
      </div>
    );
  }
  if (view === 'skills') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="flex-1 min-h-0">
          <Suspense fallback={<ScreenLoader />}>
            <LazySkills area={skillsArea} onAreaChange={onSkillsArea} speaking={speaking} listening={listening} common={common} />
          </Suspense>
        </div>
      </div>
    );
  }
  if (view === 'field-notes') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="flex-1 min-h-0">
          <Suspense fallback={<ScreenLoader />}>
            <LazyFieldNotes onXp={onXp} onActivity={onActivity} onOpenSpeaking={onOpenSpeaking} />
          </Suspense>
        </div>
      </div>
    );
  }

  if (view === 'ai') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={<ScreenLoader />}>
            <LazyAiHub apiKey={apiKey} mockMode={mockMode} level={level} onXp={onXp} />
          </Suspense>
        </div>
      </div>
    );
  }
  if (view === 'culture') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={<ScreenLoader />}>
            <LazyCulture onXp={onXp} />
          </Suspense>
        </div>
      </div>
    );
  }
  if (view === 'exams') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="flex-1 min-h-0">
          <Suspense fallback={<ScreenLoader />}>
            <LazyExamSimulator apiKey={apiKey} mockMode={mockMode} onXp={onXp} onActivity={onActivity} />
          </Suspense>
        </div>
      </div>
    );
  }
  if (view === 'reference') {
    return (
      <div className="h-full flex flex-col min-h-0">
        <HubBack onBack={() => onView(null)} label="Learn" />
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense fallback={<ScreenLoader />}>
            <LazyReference open initialTool={referenceTool} onXp={onXp} onClose={onCloseReference} />
          </Suspense>
        </div>
      </div>
    );
  }
  if (view === 'realworld') {
    return (
      <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
        <div className="max-w-[1020px] mx-auto space-y-4">
          <HubBack onBack={() => onView(null)} label="Learn" inline={false} />
          <p className="text-sm text-ink2">Real-world phrasebooks live as an overlay — tap below to open it.</p>
          <button onClick={() => onView('realworld-overlay')} className="inline-flex items-center justify-center bg-ink text-bg font-bold rounded-[14px] px-5 py-3 text-sm hover:opacity-90 transition">Open phrasebook</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto nice-scroll">
      <div className="max-w-[1020px] mx-auto px-[22px] py-6 space-y-6">
        <div className="text-center">
          <h2 className="text-[clamp(22px,4vw,30px)] font-bold tracking-[-0.02em]">Learn</h2>
          <p className="text-ink2 mt-1.5 text-sm max-w-xl mx-auto">Grammar, skills and reference — one calm place. Pick what you need today; the rest waits.</p>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {SECTIONS().map((s) => (
            <button
              key={s.id}
              onClick={() => onView(s.id)}
              className="text-left bg-surface border border-line rounded-[20px] p-[22px] hover:border-ink3 transition flex flex-col gap-2"
            >
              <span className="w-8 h-8 grid place-items-center rounded-full bg-surface2 border border-line text-ink"><s.icon size={16} /></span>
              <span className="text-[18px] font-bold tracking-[-0.02em] leading-tight">{s.title}</span>
              <span className="text-sm text-ink2 leading-relaxed">{s.subtitle}</span>
              <span className="text-xs font-semibold text-ink inline-flex items-center gap-1 mt-1">Open <ChevronRight size={12} /></span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {featureAvailableNow('grammar') && (
            <span className={CHIP}>A1 → C1 grammar library</span>
          )}
          <span className={CHIP}>Your life → your curriculum</span>
          <span className={CHIP}>4 skills · PWA offline</span>
          <span className={CHIP}>Search with ⌘K</span>
        </div>
      </div>
    </div>
  );
}

function HubBack({ onBack, label, inline = true }) {
  return (
    <button
      onClick={onBack}
      className={`flex items-center gap-1.5 px-[22px] py-2 text-[11px] font-semibold text-ink3 hover:text-ink shrink-0 ${inline ? '' : 'mb-2'}`}
    >
      <ChevronRight size={13} className="rotate-180" /> Back to {label}
    </button>
  );
}
