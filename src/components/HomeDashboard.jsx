import { useMemo } from 'react';
import { getTodayXp, getSettings, getSessions, getWeeklyPractice } from '../lib/storage';
import { useAllEntries, useDueCount } from '../lib/vocabAsync';
import { getScenarios } from '../lib/data';
import { useScenarios } from '../hooks/useScenarios';
import { getLanguage, hasCapabilityNow } from '../lib/languages';
import { ArrowRight, Layers, MessageCircle, Play, Target, Mic, BookOpen, StudioMark, Bookmark } from './icons';
import { todayBrief, progressSummary } from '../lib/todayBrief';
import Mascot from './Mascot';
import { CHIP } from '../components/classNames.js';

function suggestScenario(sessions, scenarios = getScenarios()) {
  if (!scenarios.length) return { id: 'open', title: 'Open conversation' };
  const lastSeen = {};
  sessions.forEach((session, index) => { lastSeen[session.scenarioId] = index; });
  const unseen = scenarios.find((scenario) => !(scenario.id in lastSeen));
  return unseen || [...scenarios].sort((a, b) => (lastSeen[a.id] ?? -1) - (lastSeen[b.id] ?? -1))[0];
}

export default function HomeDashboard({ onStartLesson, onNavigate, onOpenFieldNotes, onPickScenario, lastActivity, onResume, onStartToday }) {
  const settings = getSettings();
  const language = getLanguage(settings.language);
  const todayXp = getTodayXp();
  // The vocab library loads in its own chunk (per-language registries) —
  // stats fill in right after first paint. `null` means still loading.
  const library = useAllEntries();
  // The shared live due count — one due computation for the whole app
  // (App's badge and reminder read the same hook). `null` only while the
  // library chunk loads; the dashboard showed 0 in that window before too.
  const dueCount = useDueCount() ?? 0;
  // The scenario corpus is a per-language lazy chunk too — the hook
  // re-renders the suggestion card when the registry resolves.
  const scenariosReg = useScenarios();
  const suggested = suggestScenario(getSessions(), scenariosReg || []);
  // Today's session brief — one dominant CTA and at most three reason lines,
  // composed by the same planner the session itself uses.
  const brief = useMemo(() => {
    try {
      return todayBrief({
        entries: library || [],
        hasScenario: Boolean(scenariosReg && scenariosReg.length),
      });
    } catch {
      return { cta: "Start today's session — 15 min", lines: [], demonstrate: 'You will finish with a quick recall check.', shape: [], minutes: 15, empty: false };
    }
  }, [library, scenariosReg]);
  // One concise evidence-based progress summary — demonstrated / improving /
  // needs-work, derived from real performance. XP is never the headline.
  const progress = useMemo(() => {
    try {
      return progressSummary({});
    } catch {
      return { demonstrated: 0, improving: 0, needsWork: 0, next: null, headline: 'Le Studio is still learning what you know.' };
    }
  }, []);
  // Weekly rhythm (Habit rule): days practised this week against the target.
  // A missed day never breaks this — the week stays alive until Sunday.
  const weekly = useMemo(() => {
    try { return getWeeklyPractice(); } catch { return { daysThisWeek: 0, target: 3, met: false, current: 0, best: 0 }; }
  }, []);
  // Greeting copy is per-language (French is not the only studio language).
  const hour = new Date().getHours();
  const greeting = hour < 12 ? language.greetings.morning : hour < 18 ? language.greetings.afternoon : language.greetings.evening;

  const startConversation = (minutes = 5) => {
    try { sessionStorage.setItem('fp.sessionMins', String(minutes)); } catch { /* restricted */ }
    onPickScenario(suggested);
    onNavigate('arena');
  };

  return (
    <div className="h-full overflow-y-auto nice-scroll">
      <div className="max-w-[1020px] mx-auto px-[22px] py-6 space-y-10">
        {/* Hero — one dominant CTA: today's composed session. The brief
            explains what it contains and why, in plain language. */}
        <section className="text-center pt-4 pb-2" aria-labelledby="today-hero-title">
          <Mascot mood="sing" size={56} className="mx-auto text-ink opacity-90" aria-hidden="true" />
          <p className="mt-1 text-xs font-semibold text-ink2 tracking-wide" lang={language.id}>{greeting}</p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-line text-[11px] font-semibold text-ink2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" aria-hidden />
            Le Studio · {language.name} · Today
            <span className="hidden sm:inline">· {weekly.daysThisWeek}/{weekly.target} days this week</span>
          </div>
          <h2 id="today-hero-title" className="mt-5 text-[clamp(30px,6vw,52px)] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink text-balance">
            {lastActivity ? (
              <>Pick up<br />where you left off.</>
            ) : (
              <>Today's <span lang={language.id}>{language.name}</span>,<br /><span className="text-ink2">already planned.</span></>
            )}
          </h2>
          {onStartToday ? (
            <>
              <p className="mx-auto mt-4 max-w-[640px] text-[clamp(15px,2.4vw,19px)] leading-relaxed text-ink2">
                {brief.lines.length > 0
                  ? brief.lines.join(' · ')
                  : 'One short session, chosen from where you are right now.'}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onStartToday}
                  className="inline-flex items-center gap-2 bg-ink text-bg font-bold rounded-[14px] px-[26px] py-[13px] text-[15px] hover:opacity-85 hover:-translate-y-px transition"
                >
                  <Play size={16} /> {brief.cta}
                </button>
                <div className="w-full flex flex-wrap items-center justify-center gap-1.5 -mt-1" aria-label="Today's session shape">
                  {brief.shape.map((seg) => (
                    <span key={seg} className="px-2 py-0.5 rounded-full bg-surface border border-line text-[10px] font-semibold text-ink2">{seg}</span>
                  ))}
                </div>
                <p className="w-full text-xs text-ink3">{brief.demonstrate}</p>
                {/* Review and Learn sit behind the one button — quiet,
                    secondary. Resume stays available but never competes
                    with today's session for the primary slot. */}
                <div className="w-full flex items-center justify-center gap-4 text-[13px]">
                  {lastActivity && onResume && (
                    <>
                      <button
                        type="button"
                        onClick={() => onResume(lastActivity)}
                        className="font-semibold text-ink2 hover:text-ink transition"
                      >
                        Resume practice
                      </button>
                      <span aria-hidden="true" className="text-line">·</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate('review')}
                    className="font-semibold text-ink2 hover:text-ink transition"
                  >
                    Review{dueCount > 0 ? ` · ${dueCount} due` : ''}
                  </button>
                  <span aria-hidden="true" className="text-line">·</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('learn')}
                    className="font-semibold text-ink2 hover:text-ink transition"
                  >
                    Learn
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mx-auto mt-4 max-w-[640px] text-[clamp(15px,2.4vw,19px)] leading-relaxed text-ink2">
                {lastActivity
                  ? lastActivity.label
                  : <>Have a 5-minute <span lang={language.id} className="font-semibold text-ink">{language.name}</span> conversation now. Speak naturally, get one useful correction, leave with a phrase worth remembering.</>}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={lastActivity ? () => onResume(lastActivity) : () => startConversation(5)}
                  className="inline-flex items-center gap-2 bg-ink text-bg font-bold rounded-[14px] px-[26px] py-[13px] text-[15px] hover:opacity-85 hover:-translate-y-px transition"
                >
                  {lastActivity ? <Play size={16} /> : <MessageCircle size={16} />}
                  {lastActivity ? 'Resume practice' : 'Start a 5-minute conversation'}
                </button>
                <button
                  type="button"
                  onClick={() => startConversation(5)}
                  className="inline-flex items-center gap-2 text-ink font-semibold px-5 py-3 text-[15px] hover:opacity-70 transition"
                >
                  {lastActivity ? 'Start something new' : `Try ${suggested.title}`} <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {lastActivity ? (
            <p className="mt-3 text-xs text-ink3">Or browse another scenario — your last session is still ready in Speak.</p>
          ) : (
            <p className="mt-3 text-xs text-ink3">No account · Works offline · Voice or text</p>
          )}
        </section>

        {/* Progress — one concise, evidence-based summary. XP and streaks
            stay secondary and never claim proficiency. */}
        <section className="bg-surface border border-line rounded-[20px] p-[22px]" aria-labelledby="home-progress-heading">
          <h3 id="home-progress-heading" className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink2">Where you are</h3>
          <p className="mt-2 text-[15px] font-semibold text-ink leading-snug">{progress.headline}</p>
          {progress.next && <p className="mt-1 text-sm text-ink2">Next: {progress.next}.</p>}
          <p className="mt-2 text-[11px] text-ink3 tabular-nums">
            {weekly.daysThisWeek}/{weekly.target} days this week{todayXp > 0 ? ` · ${todayXp} XP today` : ''}
          </p>
        </section>

        {/* Review — prominent only when something is genuinely due. */}
        {dueCount > 0 && (
          <section className="bg-reviewsoft border border-review/30 rounded-[20px] p-[22px] flex flex-col sm:flex-row sm:items-center gap-4" aria-label="Vocabulary review due">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-review">Review</p>
              <h3 className="mt-1 text-lg font-bold tracking-[-0.02em]">{dueCount} word{dueCount === 1 ? '' : 's'} due</h3>
              <p className="mt-1 text-sm text-ink2 leading-relaxed">A short review now beats relearning later.</p>
            </div>
            <button type="button" onClick={() => onNavigate('cards')} className="inline-flex items-center justify-center gap-1.5 bg-ink text-bg font-bold rounded-[14px] px-4 py-3 text-sm hover:opacity-90 transition shrink-0">
              Review now <ArrowRight size={14} />
            </button>
          </section>
        )}

        {/* Everything else lives under Explore — useful, never competing
            with Today for the learner's attention. */}
        <section aria-labelledby="today-explore-heading" className="pb-2">
          <h3 id="today-explore-heading" className="text-center text-[clamp(20px,3vw,26px)] font-bold tracking-[-0.02em]">Explore when you have time</h3>
          <p className="text-center text-ink2 mt-1 text-sm">Everything else, kept out of today’s decision.</p>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 mt-5">
            {/* Capability-gated: French-authored surfaces (reading library,
                learning path) appear for French only — a beta language gets
                core-loop shortcuts instead, never a French-only card. */}
            <MiniCard
              icon={Mic}
              title="Dictée"
              desc="Listen and type — ears first."
              onClick={() => onStartLesson({ type: 'dictation' })}
            />
            {hasCapabilityNow('reading-library') && (
              <MiniCard
                icon={BookOpen}
                title="Reading"
                desc="Stories, tap-to-translate."
                onClick={() => onStartLesson({ type: 'reading' })}
              />
            )}
            {hasCapabilityNow('learning-path') && (
              <MiniCard
                icon={StudioMark}
                title="Your path"
                desc="12 units · checkpoints · CEFR"
                onClick={() => onNavigate('grammar')}
              />
            )}
            {!hasCapabilityNow('reading-library') && (
              <MiniCard
                icon={MessageCircle}
                title="Speaking"
                desc="Roleplay real situations."
                onClick={() => onNavigate('speak')}
              />
            )}
            <MiniCard
              icon={Bookmark}
              title="Field Notes"
              desc={`Capture real ${language.name}, then reuse it.`}
              onClick={onOpenFieldNotes}
            />
            <MiniCard
              icon={Layers}
              title="Vocabulary"
              desc={dueCount > 0 ? `Review ${dueCount} due, or browse the deck.` : 'Browse the deck whenever you need it.'}
              onClick={() => onNavigate('cards')}
            />
            <MiniCard
              icon={Target}
              title="Grammar & skills"
              desc={hasCapabilityNow('grammar') ? '60 topics, reading and writing.' : 'Dictée, conversation and the AI tutor.'}
              onClick={() => onNavigate('learn')}
            />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className={CHIP}>Installable PWA</span>
            <span className={CHIP}>Works offline</span>
            <span className={CHIP}>No account required</span>
            <span className={CHIP}>Private by architecture</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function MiniCard({ icon: Icon, title, desc, onClick }) {
  return (
    <button type="button" onClick={onClick} className="bg-surface border border-line rounded-[18px] p-5 text-left hover:border-ink3 transition flex flex-col gap-1.5">
      <span className="w-9 h-9 grid place-items-center rounded-xl bg-surface2 border border-line text-ink"><Icon size={16} /></span>
      <span className="text-[15px] font-bold tracking-[-0.01em] flex items-center gap-1.5">{title} <ArrowRight size={13} className="text-ink3" /></span>
      <span className="text-[13px] text-ink2 leading-snug">{desc}</span>
    </button>
  );
}
