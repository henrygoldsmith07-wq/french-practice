import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WhyPanel, DrillChainRunner, RecallRunner, DelayedReview, TrainerDrill,
} from './TodaySegments';
import FollowUpCheck from './FollowUpCheck';
import { takeawayPhrase } from '../lib/takeaway';
import { buildTodayPlan } from '../lib/todayPlan';
// Study glue is measurement infrastructure: it loads WITH the session (the
// lazy ChatArena/HeldOutCheck chunks pull the same module), never with the
// app — same discipline as the listening library. Plan construction GATES on
// it while it resolves (instrumentation is never silently skipped), a FAILED
// load degrades to a no-measurement plan (practice is never blocked), and
// study CALLS are safe no-ops in the beat before it resolves. The loader
// itself — with its never-cache-a-rejection retry semantics — lives in
// lib/studyFlowAsync.js; the whole dependency lifecycle lives in
// hooks/useTodayDeps.js.
import { callStudy } from '../lib/studyFlowAsync';
import { makeEvent, dropoutPoint, EVENT_TYPES } from '../lib/instrumentation';
import { spokenProduction } from '../lib/speakingTime';
import {
  recordSelectionTrial, getSelectionTrial, saveSelectionTrial, recordStudyEvent,
} from '../lib/storage';
import { useTodayDeps } from '../hooks/useTodayDeps';
import { hasCapabilityNow } from '../lib/capabilities';
import { activeLanguage, langName } from '../lib/i18n';
import { getScenarios } from '../lib/data';

// Listening track content is a lazy chunk: the library (mini-podcasts,
// dialogues, news, scenes, authentic audio) must not ride the entry graph.
// The session resolves tracks dynamically; loader, cache and React binding
// live in lib/listeningAsync.js (failures are never cached there).
import { resolveListeningTrack, useListeningTracks } from '../lib/listeningAsync';

// The arena, the held-out check and the track player are heavy (audio, LLM,
// recording, content) and only rendered mid-session — load them with the
// session, not with the app.
const ChatArena = lazy(() => import('./ChatArena'));
const HeldOutCheck = lazy(() => import('./HeldOutCheck'));
const TrackPlayer = lazy(() => import('./Listening').then((m) => ({ default: m.TrackPlayer })));
import { ChevronRight, X } from './icons';
import useDialogFocus from '../hooks/useDialogFocus.js';

const EMPTY_DEP_LIST = Object.freeze([]);

// Today's French — one Start button, one composed session. Segments come
// from the daily curriculum; the learner never chooses a mode. Every phase
// writes through the app's real recorders, so abandoning mid-way still counts.
//
// Capability-aware: a segment that cannot run is replaced by the next link
// in the fallback chain (AI drill → authored drill → retype → SRS → listen/
// review) so an offline session stays complete instead of showing holes.
//
// Hooks live in the two sub-components below (TodayBody / SessionComplete)
// so the early-return structure can never reorder them.

export default function TodaySession({ open, onClose, minutes = 20, apiKey, mockMode, level, ttsRate, onTurn, onXp, onActivity, depsImpl }) {
  // EVERY async dependency — vocabulary, scenarios, grammar index, listening
  // library, study module — settles through ONE hook. Each arrival changes
  // the deps object's identity, so the plan memo below replans regardless of
  // the order modules resolve in (the old hand-wired per-dep state missed its
  // readiness signals in the memo's dependency array, and Today could stay
  // blank whenever the last chunk landed after first render). Failures land
  // in deps.failed with an explicit retry — a failed import never hangs the
  // session and is never permanently cached. `depsImpl` is a test seam:
  // tests inject per-dependency loaders to force resolution orders and
  // import failures deterministically.
  const deps = useTodayDeps(depsImpl);
  const { entries, retry } = deps;
  const entriesFailed = deps.failed.includes('entries');
  const scenarioFailed = deps.failed.includes('scenarios');
  const grammarFailed = deps.failed.includes('grammar');
  const listeningFailed = deps.failed.includes('listening');
  const studyFailed = deps.failed.includes('study');

  // Vocabulary is the one hard content dependency: it anchors the live SRS
  // queue and learner review state. The other content libraries are additive
  // capabilities, so a failed chunk degrades to "not available" rather than
  // taking down the whole composed session.
  const scenariosReg = deps.scenarios ?? (scenarioFailed ? EMPTY_DEP_LIST : null);
  const grammarReady = deps.grammar || grammarFailed;
  const listeningTracks = deps.listening ?? (listeningFailed ? EMPTY_DEP_LIST : null);
  const studyModule = deps.study;
  const studyReady = Boolean(studyModule);
  const degradedLearning = scenarioFailed || grammarFailed || listeningFailed;
  const learningDepsSettled = (entries !== null || entriesFailed)
    && scenariosReg !== null
    && Boolean(grammarReady)
    && listeningTracks !== null;
  const studySettled = degradedLearning || studyReady || studyFailed;

  // Capability rows for the ACTIVE language (registry: lib/capabilities.js):
  // French-authored drill producers and the listening library never enter a
  // German or Spanish plan.
  const conjCap = hasCapabilityNow('conjugation');
  const authoredCap = hasCapabilityNow('grammar') && !grammarFailed;
  const accentCap = hasCapabilityNow('writing-authored');

  const plan = useMemo(() => buildTodayPlan({
    open,
    minutes,
    apiKey,
    mockMode,
    level,
    entries,
    scenariosReg,
    grammarReady,
    listeningTracks,
    studyModule,
    degradedLearning,
    studyFailed,
    conjCap,
    authoredCap,
    accentCap,
  }),
  // deps: every async dependency's arrival (or failure, or retry) changes the
  // deps object → these primitives change → the plan replans no matter what
  // order modules resolve in. `studyModule` is the study gate itself — its
  // identity flips exactly when study becomes ready or fails.
  [open, minutes, apiKey, mockMode, level, entries, scenariosReg, grammarReady,
    listeningTracks, studyFailed, studyModule, degradedLearning,
    conjCap, authoredCap, accentCap]);

  // Warm the heavy mid-session chunks (arena, held-out check) with the
  // session, not the app. Fire-and-forget: the lazy() imports render via
  // Suspense regardless, so no state is needed here — and a failed warm-up
  // must not throw an unhandled rejection.
  useEffect(() => {
    if (!open) return undefined;
    Promise.all([import('./ChatArena'), import('./HeldOutCheck')]).catch(() => { /* lazy() surfaces its own fallback */ });
    return undefined;
  }, [open]);

  const [segIndex, setSegIndex] = useState(0);
  const [, setXp] = useState(0);
  const [history, setHistory] = useState([]);
  const [trialId, setTrialId] = useState(null);
  const trialLoggedRef = useRef(false);
  const award = (n) => { setXp((x) => x + n); onXp?.(n); };

  // Persistent scheduler/evidence writes belong after commit, never in
  // useMemo. The ref survives StrictMode's effect replay, so one opened Today
  // session creates one trial even when React deliberately re-runs effects.
  useEffect(() => {
    if (!open) {
      trialLoggedRef.current = false;
      setTrialId(null);
      return;
    }
    if (!plan || trialLoggedRef.current) return;
    trialLoggedRef.current = true;
    try {
      const trial = recordSelectionTrial(plan.trialDraft || {});
      setTrialId(trial?.id || null);
      // Pilot instrumentation: one event per opened session, local only.
      try {
        recordStudyEvent(makeEvent(EVENT_TYPES.SESSION_STARTED, {
          minutes: plan.totalMinutes,
          segments: plan.segments.map((s) => s.id),
        }));
      } catch { /* instrumentation must never break practice */ }
      if (trial && plan.study && studyReady && studyModule) {
        const consistency = studyModule.verifyTreatmentConsistency({
          deliveredVariant: plan.trialVariant,
          study: plan.study,
        });
        studyModule.startOutcomeRecord({
          trial,
          graph: plan.trialGraph || [],
          arm: plan.trialVariant,
          day: plan.studyDay,
          consistency,
        });
      }
    } catch {
      // Trial logging is diagnostic; it must never block practice.
    }
  }, [open, plan, studyReady, studyModule]);

  if (!open) return null;
  const close = () => { onClose(); setSegIndex(0); setHistory([]); setXp(0); };
  // Loading: genuine learning dependencies (vocab, scenarios, grammar,
  // listening) still resolving. Never more than the actual chunk downloads —
  // and never a timer: deps resolve as soon as their chunks land.
  if (!plan && !entriesFailed && (!learningDepsSettled || !studySettled)) {
    return (
      <div className="fixed inset-0 z-[60] bg-bg grid place-items-center" role="dialog" aria-modal="true" aria-label="Loading today's session">
        <div className="text-center space-y-3 px-6">
          <span className="inline-block w-7 h-7 rounded-full border-2 border-line border-t-ink animate-spin" aria-hidden="true" />
          <p className="text-sm text-ink2">Preparing today's session…</p>
        </div>
      </div>
    );
  }
  // One or more dependencies failed to load (offline, quota, transient
  // error). Retry re-runs the real imports — never a timed blind retry.
  if (!plan) {
    return (
      <div className="fixed inset-0 z-[60] bg-bg grid place-items-center" role="dialog" aria-modal="true" aria-label="Today's session unavailable">
        <div className="text-center space-y-3 px-6 max-w-sm">
          <p className="text-lg font-bold text-ink">Today's session couldn't load</p>
          <p className="text-sm text-ink2">Some practice material didn't download. Check your connection and try again.</p>
          <button onClick={retry} className="btn btn-primary min-h-11 px-6 rounded-xl text-sm">Try again</button>
          <button onClick={close} className="block mx-auto text-xs text-ink3 hover:text-ink underline">Close</button>
        </div>
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
    <TodayBody
      plan={plan}
      trialId={trialId}
      segIndex={segIndex}
      setSegIndex={setSegIndex}
      close={close}
      apiKey={apiKey}
      mockMode={mockMode}
      level={level}
      ttsRate={ttsRate}
      onTurn={onTurn}
      onActivity={onActivity}
      award={award}
      history={history}
      setHistory={setHistory}
    />
    </Suspense>
  );
}

// The in-session body: owns the delivery timers (per-segment time spent and
// completion, recorded onto the frozen selection trial) and renders the
// current segment. All hooks run unconditionally — the early return for the
// finished state lives in the child below, never here.
export function claimForwardTransition(ref, index) {
  if (index <= ref.current) return false;
  ref.current = index;
  return true;
}

// The optional usefulness prompt shown once, after a finished session. One
// question, five buttons, dismissible — deliberately not a rating system: it
// feeds the research path only (1–5), never a score, and skipping costs the
// learner nothing. Dismissing stores nothing at all.
function UsefulnessPrompt({ onRate }) {
  const [answered, setAnswered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (answered || dismissed) return null;
  return (
    <div className="mx-auto max-w-xs space-y-2" role="group" aria-label="Was today's session useful?">
      <p className="text-xs text-ink2">Was today’s session useful to you?</p>
      <div className="flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setAnswered(true); onRate?.(n); }}
            aria-label={`Useful — ${n} of 5`}
            className="min-h-11 min-w-11 rounded-xl border border-line bg-surface text-sm font-semibold text-ink2 hover:border-ink hover:text-ink transition"
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink3">1 = not useful · 5 = very useful</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-[11px] text-ink3 hover:text-ink2 underline underline-offset-2 min-h-8"
      >
        Skip
      </button>
    </div>
  );
}

function TodayBody({ plan, trialId, segIndex, setSegIndex, close, apiKey, mockMode, level, ttsRate, onTurn, onActivity, award, history, setHistory }) {
  // Track content lives in the lazy listening chunk; today's payload only
  // carries ids, so resolve the real track when the listen segment renders.
  const liveTracks = useListeningTracks();
  const startRef = useRef(Date.now());
  const segStartRef = useRef(Date.now());
  const deliveredRef = useRef([]);
  const recordedRef = useRef(false);
  const missingRef = useRef(null);
  const transitionRef = useRef(-1);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef);
  const totalSteps = plan.segments.length + (plan.heldOut ? 1 : 0);

  // Every segment transition is single-consumer. A completion callback can
  // race a skip, fire twice, or arrive late after its child unmounted. Because
  // segment indexes only move forward, rejecting any index already claimed (or
  // older than the latest claim) makes all of those paths idempotent.
  const moveNext = useCallback((skipped) => {
    if (!claimForwardTransition(transitionRef, segIndex)) return;
    const seg = plan.segments[segIndex];
    if (seg) {
      const seconds = Math.round((Date.now() - segStartRef.current) / 1000);
      deliveredRef.current.push({
        id: seg.id,
        minutes: seg.minutes,
        seconds,
        skipped,
      });
      // Pilot instrumentation: local-only events, no learner text. Segment
      // completion and skip points are the drop-out signal.
      try {
        recordStudyEvent(makeEvent(
          skipped ? EVENT_TYPES.SEGMENT_SKIPPED : EVENT_TYPES.SEGMENT_COMPLETED,
          { segment: seg.id, seconds, minutes: seg.minutes },
        ));
      } catch { /* instrumentation must never break practice */ }
    }
    segStartRef.current = Date.now();
    setSegIndex((i) => i + 1);
  }, [plan, segIndex, setSegIndex]);

  const advance = useCallback(() => moveNext(false), [moveNext]);
  const skip = useCallback(() => moveNext(true), [moveNext]);
  const flushDelivery = useCallback((finishedAllSteps) => {
    if (recordedRef.current || !trialId) return null;
    try {
      const trials = getSelectionTrial();
      const trial = trials.find((row) => row.id === trialId);
      if (!trial) return null;
      recordedRef.current = true;
      trial.delivered = [...deliveredRef.current];
      trial.timeSpent = Math.round((Date.now() - startRef.current) / 1000);
      // Completion means the WHOLE composed session ended, including the
      // held-out step when one exists. Finishing all ordinary segments is not
      // enough if the learner abandoned measurement afterward.
      trial.completed = Boolean(finishedAllSteps)
        && deliveredRef.current.length === plan.segments.length
        && !deliveredRef.current.some((d) => d.skipped && d.seconds < 5);
      // Spoken production across the session's speak turns: voiced time on
      // the learner's mic, deduped per presentation. An abandoned session
      // records what was genuinely said — never a guessed total.
      const spoken = spokenProduction(history.map((t, i) => ({
        voicedMs: t.voicedMs,
        encounterId: t.encounterId || `turn-${i}`,
        sessionId: t.sessionId,
        at: t.at,
      })));
      trial.speakingSeconds = spoken.seconds;
      saveSelectionTrial(trials);
      callStudy('updateOutcomeDelivery', {
        trialId: trial.id,
        trialAt: trial.at,
        timeSpent: trial.timeSpent,
        completed: trial.completed,
        delivered: trial.delivered,
        speakingSeconds: spoken.seconds,
      });
      // Pilot instrumentation: session outcome + drop-out point, local only.
      try {
        recordStudyEvent(makeEvent(
          trial.completed ? EVENT_TYPES.SESSION_COMPLETED : EVENT_TYPES.SESSION_ABANDONED,
          {
            minutes: plan.totalMinutes,
            timeSpent: trial.timeSpent,
            segment: dropoutPoint(trial.delivered)?.segment || null,
            segments: trial.delivered.map((d) => d.id),
          },
        ));
      } catch { /* instrumentation must never break practice */ }
      return trial;
    } catch {
      return null;
    }
  }, [trialId, plan.segments.length, plan.totalMinutes, history]);

  // Persist a fully completed run as soon as its final step advances.
  useEffect(() => {
    if (segIndex < totalSteps) return;
    flushDelivery(true);
  }, [segIndex, totalSteps, flushDelivery]);

  // Escape / Android Back close the parent overlay directly, so TodayBody can
  // disappear without its own close button running. A delayed unmount flush
  // captures that partial session. The mounted flag is intentional: React
  // StrictMode performs a fake cleanup+setup cycle; by the next task the
  // component is mounted again, so that development-only cleanup writes
  // nothing. A real unmount stays false and records the abandonment.
  const mountedRef = useRef(false);
  const flushRef = useRef(flushDelivery);
  flushRef.current = flushDelivery;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current) flushRef.current(false);
      }, 0);
    };
  }, []);

  const done = segIndex >= totalSteps;
  // The held-out check is an implicit extra step after the last normal segment.
  const onCheckStep = !done && segIndex >= plan.segments.length && plan.heldOut;
  const seg = onCheckStep ? null : (done ? null : plan.segments[segIndex]);

  // Resolve the current segment's body. A missing body (should be rare — the
  // plan was capability-resolved at build time, but e.g. a recall deck can
  // empty itself mid-session) falls through to the next segment instead of a
  // dead screen.
  let body = null;
  let drillFocus = null;
  if (!done && seg) {
    if (seg.id === 'speak') {
      const sc = getScenarios().find((x) => x.id === seg.payload.scenarioId);
      if (sc) {
        body = (
          <ChatArena
            apiKey={apiKey}
            mockMode={mockMode}
            ttsRate={ttsRate}
            level={level}
            onTtsRate={() => {}}
            onTurn={onTurn}
            onXp={award}
            history={history}
            setHistory={setHistory}
            scenario={sc}
            setScenario={() => {}}
            onEndSession={advance}
            showEndButton
          />
        );
      }
    } else if (seg.id === 'retrieve') {
      body = <RecallRunner cardCap={seg.payload.cardCap} onDone={advance} onXp={award} onActivity={onActivity} />;
    } else if (seg.id === 'drill') {
      body = (
        <DrillChainRunner
          payload={seg.payload}
          level={level}
          apiKey={apiKey}
          mockMode={mockMode}
          ttsRate={ttsRate}
          onXp={award}
          onDone={advance}
        />
      );
      drillFocus = seg.payload?.kind === 'conj-drill'
        ? { ...seg.payload }
        : (seg.payload?.chain || []).find((p) => p.kind === 'conj-drill') || null;
    } else if (seg.id === 'review') {
      body = <DelayedReview count={seg.payload.count} onXp={award} onDone={advance} />;
    } else if (seg.id === 'followup' && seg.payload.task) {
      // The check the recovery loop owes, run against the real weakness.
      // No task → no body → the session moves on rather than faking a pass.
      body = <FollowUpCheck task={seg.payload.task} onXp={award} onDone={advance} />;
    } else if (seg.id === 'listen' && seg.payload.track) {
      const resolved = resolveListeningTrack(liveTracks, seg.payload.track.id);
      if (resolved.status === 'loading') {
        // A null library means the lazy listening chunk is still in flight,
        // not that the planned track disappeared. Render a real body so the
        // generic missing-body auto-skip cannot discard valid listening.
        body = <div className="h-full grid place-items-center"><p className="text-sm text-ink2">Loading listening…</p></div>;
      } else if (resolved.status === 'ready') {
        body = <TrackPlayer track={resolved.track} baseRate={ttsRate} level={level} onXp={award} onActivity={onActivity} onDone={advance} />;
      }
      // Once the library has resolved, a genuinely missing id leaves body
      // null and the generic fallback below advances to the next segment.
    }
  }

  if (!body && drillFocus) {
    body = <TrainerDrill focus={drillFocus} onXp={award} onDone={advance} />;
  }

  if (!body && onCheckStep && plan.heldOut) {
    body = (
      <HeldOutCheck
        check={plan.heldOut}
        apiKey={apiKey}
        mockMode={mockMode}
        level={level}
        ttsRate={ttsRate}
        onDone={(finished) => {
          // Full per-item evidence is persisted first, then the check's
          // per-skill summary (speaking from numeric scores, correctness
          // domains from valid results only) attaches to today's outcomes.
          callStudy('recordCheckOutcome', plan.heldOut.id, finished);
          callStudy('attachTransferFromCheck', plan.heldOut.id);
          advance();
        }}
      />
    );
  }

  useEffect(() => {
    if (done) return undefined;
    if (body || missingRef.current === segIndex) return undefined;
    missingRef.current = segIndex;
    const t = setTimeout(skip, 0);
    return () => clearTimeout(t);
  }, [done, body, segIndex, skip]);

  if (done) {
    const speakSeg = plan.segments.find((s) => s.id === 'speak');
    const speakScenario = speakSeg ? getScenarios().find((x) => x.id === speakSeg.payload.scenarioId) : null;
    const takeaway = takeawayPhrase(history, speakScenario);
    // The takeaway is learner-language content — it must carry the ACTIVE
    // language, never a hard-coded French attribute.
    const activeId = activeLanguage().id;
    return (
      <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[65] overflow-y-auto bg-bg focus:outline-none" role="dialog" aria-modal="true" aria-label={`Today's ${langName()} complete`}>
        <div className="mx-auto min-h-full max-w-lg px-4 py-10 text-center space-y-5">
          <p className="text-3xl font-black text-ink">Session complete.</p>
          {takeaway ? (
            <p className="text-lg text-ink leading-relaxed">
              You can now say<br />
              <span className="font-bold" lang={activeId}>«{takeaway}»</span>
            </p>
          ) : (
            <p className="text-sm text-ink2">
              Today's {langName()} — {plan.totalMinutes} minutes · {plan.segments.map((s) => s.label).join(' → ')}.
            </p>
          )}
          <UsefulnessPrompt onRate={(rating) => {
            // Opt-in, dismissible, research-path only: a rating goes to the
            // study outcome record (1–5), and skipping passes nothing.
            try {
              callStudy('updateOutcomeDelivery', {
                trialId,
                usefulness: rating,
              });
            } catch { /* a rating is never worth breaking the close */ }
          }} />
          <button onClick={close} className="btn btn-primary w-full max-w-xs mx-auto min-h-12 rounded-xl text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[60] bg-bg flex flex-col focus:outline-none" role="dialog" aria-modal="true" aria-label={`Today's ${langName()}`}>
      <header className="shrink-0 border-b border-line bg-surface px-4 py-2.5">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <span className="text-sm font-bold text-ink whitespace-nowrap">{langName() === 'French' ? 'Aujourd\'hui' : 'Today'}</span>
          <span className="text-[11px] text-ink3 tabular-nums">{plan.totalMinutes} min</span>
          <div className="flex-1 flex gap-1.5">
            {(plan.heldOut ? [...plan.segments, { id: 'held-out' }] : plan.segments).map((s, i) => (
              <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i < segIndex ? 'bg-success' : i === segIndex ? 'bg-ink animate-pulse' : 'bg-surface2'}`} />
            ))}
          </div>
          <button onClick={close} aria-label="End today's session" className="w-8 h-8 grid place-items-center rounded-full text-ink3 hover:text-ink"><X size={15} /></button>
        </div>
        <p className="max-w-lg mx-auto mt-1 text-[11px] text-ink3">
          {seg ? seg.why : 'A short, unscaffolded check on material you haven\'t practised — measurement only.'}
        </p>
        {!plan.study && (
          <p className="max-w-lg mx-auto text-[11px] text-ink3">Practising without research measurement today — your session is unaffected.</p>
        )}
        {plan.degradedLearning && (
          <p className="max-w-lg mx-auto text-[11px] text-ink3">Some optional practice material did not load, so Today adapted to the activities available.</p>
        )}
      </header>
      {seg?.explain && (
        <WhyPanel explain={seg.explain} recovery={seg.recovery} />
      )}
      <div className="flex-1 min-h-0 overflow-y-auto nice-scroll">{body}</div>
      {seg && seg.id !== 'speak' && (
        <footer className="shrink-0 border-t border-line bg-surface px-4 py-3">
          <button onClick={skip} className="btn btn-secondary w-full max-w-lg mx-auto min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
            Skip <ChevronRight size={14} />
          </button>
        </footer>
      )}
    </div>
  );
}

// Backwards compatibility: the segment runners now live in TodaySegments.jsx,
// re-exported here so existing consumers keep their import path.
export { WhyPanel, DrillChainRunner, RecallRunner, DelayedReview };
