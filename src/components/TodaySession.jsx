import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDailyCurriculum } from '../lib/dailyCurriculum';
import { takeawayPhrase } from '../lib/takeaway';
import {
  dueRetests, recordRetest, EVIDENCE_ENGINE_VERSION,
} from '../lib/mistakeGraph';
import {
  calibrateSelection,
} from '../lib/selectionCalibration';
import {
  probeCapabilities, nextFallback, resolvePlanCapabilities, buildDrillSlot,
} from '../lib/todayCapabilities';
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
import { balancedDrillTopic } from '../lib/assignment';
import { recordSelectionTrial, getSelectionTrial, saveSelectionTrial } from '../lib/storage';
import {
  getSrs, getNotebook, getDueWeaknesses, rateCard,
  getMistakeGraph, saveMistakeGraph, getStudyChecks, getLearnerErrors,
} from '../lib/storage';
import { getErrorNotebook } from '../lib/errorNotebook';
// The vocab library is a separate lazy chunk (per-language registries) — it
// must be awaited, never statically imported from the entry graph. The hook
// centralises the null-means-loading discipline and reloads on language switch.
import { useAllEntries } from '../lib/vocabAsync';
import { useTodayDeps } from '../hooks/useTodayDeps';
import { hasCapabilityNow } from '../lib/capabilities';
import { langName } from '../lib/i18n';
import { notebookAsEntries, dueEntries, reviewOrder, NEW_CARD_CAP } from '../lib/memory';
import { getScenarios } from '../lib/data';

// Listening track content is a lazy chunk: the library (mini-podcasts,
// dialogues, news, scenes, authentic audio) must not ride the entry graph.
// The session resolves tracks dynamically; loader, cache and React binding
// live in lib/listeningAsync.js (failures are never cached there).
import { useListeningTracks } from '../lib/listeningAsync';

// The arena, the held-out check and the track player are heavy (audio, LLM,
// recording, content) and only rendered mid-session — load them with the
// session, not with the app.
const ChatArena = lazy(() => import('./ChatArena'));
const HeldOutCheck = lazy(() => import('./HeldOutCheck'));
const TrackPlayer = lazy(() => import('./Listening').then((m) => ({ default: m.TrackPlayer })));
// The conjugation trainer renders inside the session when a trainer gap owns
// the drill slot — heavy content (verb tables), so it loads with the session.
const ConjugationTrainer = lazy(() => import('./ConjugationTrainer'));
// The focused dictée and accent drills render inside the session when a
// listening/pronunciation gap owns the drill slot — both are light, but they
// are mid-session-only surfaces, so they load with the session like the rest.
const Dictation = lazy(() => import('./Dictation'));
const AccentDrill = lazy(() => import('./AccentDrill'));
import VocabCard from './VocabCard';
import { NotebookRetype } from './NotebookRetype';
import Quiz from './Quiz';
import { ChevronRight, X } from './icons';
import { personAt } from '../lib/conjugationMeta';
import { recordLearnerSuccess } from '../lib/storage';
import { currentSessionId, newEncounterId } from '../lib/evidenceIdentity';
import { segmentExplain, recoveryStatus } from '../lib/segmentExplain';
import RecoveryBadge from './RecoveryBadge';

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
  const scenariosReg = deps.scenarios;
  const grammarReady = deps.grammar;       // true = ready (or not needed)
  const listeningTracks = deps.listening;  // null = loading
  const studyModule = deps.study;          // null = loading
  const studyFailed = deps.failed.includes('study');
  const studyReady = Boolean(studyModule);

  // Capability rows for the ACTIVE language (registry: lib/capabilities.js):
  // French-authored drill producers and the listening library never enter a
  // German or Spanish plan.
  const conjCap = hasCapabilityNow('conjugation');
  const authoredCap = hasCapabilityNow('grammar');
  const accentCap = hasCapabilityNow('writing-authored');

  const plan = useMemo(() => {
    if (!open || !entries || !scenariosReg || !grammarReady || !listeningTracks) return null;
    // Study measurement: wait while it resolves (never silently skipped), but
    // when it has FAILED, continue without measurement — study tooling must
    // never block ordinary learning.
    if (!studyReady && !studyFailed) return null;
    const studyApi = studyReady ? studyModule : null;
    const graph = getMistakeGraph();
    // Conjugation-trainer misses are grammar gaps the mistake graph may never
    // have seen (the trainer writes to the learnerErrors model). A gap that
    // failed twice and has never been repaired competes for today's drill —
    // zero mastery, so it goes first. Formal recovery happens in the trainer
    // (recordLearnerSuccess flips the entry to recovering/resolved).
    // Evidence Study: keep enrolment fresh (idempotent, consent-gated). When
    // the study module failed to load (or misbehaves), `study` stays null and
    // every measurement branch below is skipped — the learning plan is
    // unchanged. Study tooling must never break ordinary practice.
    let study = null;
    if (studyApi) {
      try {
        study = studyApi.enrolStudyState({ startLevel: level || null });
      } catch { study = null; }
    }
    // ONE authoritative treatment: study arm when enrolled+active, else
    // adaptive. Nonparticipants always get the fully personalised product.
    let variant = 'adaptive';
    if (study && studyApi) {
      try { variant = studyApi.effectiveVariant({ study }); } catch { variant = 'adaptive'; }
    }
    const balanced = variant === 'balanced';
    // Study validity: the trainer gap is learner-specific targeting. It is
    // built UNCONDITIONALLY here and gated by the drill-slot registry
    // (buildDrillSlot skips learner-specific producers in the balanced arm) —
    // the gate lives in ONE place instead of at every construction site.
    // Conjugation content (verb tables) is French-authored — a beta language
    // never schedules the trainer even if stale French errors linger in the
    // learner-error model from an earlier French period.
    const trainerGap = !conjCap ? null : (() => {
      try {
        const due = getLearnerErrors({ limit: 12 }).find((e) =>
          e.key.startsWith('conjugation:') && e.status === 'active' && e.errorCount > 1);
        if (!due) return null;
        const [verb, tense, personIdx] = due.key.slice('conjugation:'.length).split(':');
        return {
          id: due.id,
          concept: `conjugating ${verb} (${tense}${personIdx ? ` · ${personAt(Number(personIdx)) || ''}` : ''})`,
          label: due.label,
          type: 'grammar',
          mastery: 0,
          recurrence: due.recurrenceCount,
          // The exact missed cell, carried into the drill payload so the
          // focused trainer leads with the very form that was missed.
          errorCount: due.errorCount,
          personIndex: Number.isInteger(Number(personIdx)) && personIdx !== '' ? Number(personIdx) : null,
          // Marks the selection-trial candidate set as extended: the frozen
          // candidates list must contain whatever the trial's selectedId can
          // name, or the P1 analysis joins a foreign id.
          source: 'learner-errors',
        };
      } catch { return null; }
    })();
    // The other learner-error categories get their own focused consumers the
    // same way: an active dictée gap drills dictation, an active pronunciation
    // gap drills accents — built unconditionally, gated by the registry in
    // the balanced arm like every other learner-specific producer.
    const dueLearnerErrors = getLearnerErrors({ limit: 12 });
    const dictationGap = (() => {
      const gap = dueLearnerErrors.find((e) =>
        e.key === 'dictation' && e.status === 'active' && e.errorCount > 1);
      return gap ? { id: gap.id, concept: 'Dictée listening accuracy', label: gap.label, type: 'listening', mastery: 0, recurrence: gap.recurrenceCount, source: 'learner-errors' } : null;
    })();
    // The accent-drill repair retypes French accents (é/è/ç/œ) — French-
    // authored orthography, so it exists only under the writing-authored
    // capability row; other languages fall through to the next producer.
    const pronunciationGap = !accentCap ? null : (() => {
      const gap = dueLearnerErrors.find((e) =>
        e.key === 'pronunciation' && e.status === 'active' && e.errorCount > 1);
      return gap ? { id: gap.id, concept: 'Pronunciation clarity', label: gap.label, type: 'pronunciation', mastery: 0, recurrence: gap.recurrenceCount, source: 'learner-errors' } : null;
    })();
    // P2 calibration: join past selection trials with their delayed retest
    // outcomes and derive conservative per-type weights. Below the sample
    // floor this is a no-op — selection stays the urgency order.
    const calibration = calibrateSelection(getSelectionTrial(), graph);
    // The drill slot: which weakness producer owns it, in what order, under
    // which study-arm gates — decided in ONE registry (see todayCapabilities).
    // The registry freezes the combined candidate list BEFORE the choice, so
    // the trial's selectedId can only ever name a frozen candidate, and it
    // applies P2 calibration WITHIN each producer (the old joint sort let the
    // zero-overdue trainer gap lose to any real graph node by accident).
    const drill = buildDrillSlot({
      balanced,
      calibration,
      trainerGap,
      dictationGap,
      pronunciationGap,
      dueRetestCandidates: dueRetests(graph, Date.now(), 3).map((n) => ({
        id: n.id, concept: n.concept, type: n.type,
        mastery: n.mastery, recurrence: n.recurrence, overdueBy: n.overdueBy,
      })),
    });
    const candidates = drill.candidates;
    const top = drill.top;
    const srs = getSrs();
    const library = [...entries, ...notebookAsEntries(getNotebook())];
    const srsDue = dueEntries(library, srs, Date.now(), { newCardCap: NEW_CARD_CAP }).length;
    const notebook = getErrorNotebook();
    const pendingRetypes = notebook.filter((e) => !e.correctedByLearner).length;
    const dayIndex = Math.floor(Date.now() / 86400000);
    const tracks = Array.isArray(listeningTracks) ? listeningTracks : [];
    const listeningTrack = tracks.length ? tracks[dayIndex % tracks.length] : null;
    const weakness = (() => { try { return getDueWeaknesses()[0] || null; } catch { return null; } })();
    const scenarios = scenariosReg;
    const suggested = scenarios.length ? scenarios[dayIndex % scenarios.length] : null;
    const rotationTopic = balancedDrillTopic(dayIndex);
    const hasAi = Boolean(apiKey) || Boolean(mockMode);
    const caps = probeCapabilities({
      hasAi,
      hasScenario: scenarios.length > 0,
      // Study validity: in the balanced arm the drill must be the ROTATION
      // topic, not the learner's own top concept (adaptive picks the top;
      // the control arm gets the deterministic rotation — the same rule
      // scripts/curriculum-eval.mjs simulates).
      concept: balanced ? rotationTopic : (top?.concept || null),
      pendingRetypes,
      srsDue,
      listeningTrack: listeningTrack ? { id: listeningTrack.id, title: listeningTrack.title, audioSrc: listeningTrack.audioSrc || null } : null,
      recentCorrections: notebook.filter((e) => e.correctedByLearner && Date.now() - Date.parse(e.at || e.lastSeenAt || 0) <= 48 * 3600000).length,
      // Capability gating for French-authored drill producers: conj/accent/
      // authored links exist only where the registry offers them (fr).
      languageCaps: { conj: conjCap, authored: authoredCap, accent: accentCap },
    });
    const planBuilt = buildDailyCurriculum({
      minutes,
      srsDue,
      topMistake: top,
      pendingRetypes,
      recentCorrections: caps.recentCorrections ? 1 : 0,
      weaknessScenarioId: weakness?.scenarioId || null,
      suggestedScenarioId: suggested?.id || null,
      listeningTrack: listeningTrack ? { id: listeningTrack.id, title: listeningTrack.title, audioSrc: listeningTrack.audioSrc || null } : null,
      dayIndex,
      balanced,
      balancedDrillTopic: balanced ? rotationTopic : null,
    });
    // Resolve what can actually run: no segment is ever scheduled that
    // cannot run. Offline, the AI drill becomes the authored drill (or
    // retype/SRS/listen) BEFORE the session starts.
    const planResolved = resolvePlanCapabilities(planBuilt, caps);
    // Learner-facing explanation layer (see segmentExplain.js): every
    // targeted segment carries WHAT is practised, WHY it was selected, the
    // evidence behind that, and what success requires — all frozen with the
    // plan so the panel never drifts from what was actually delivered. The
    // balanced (control) arm gets no weakness panel: its drill is the
    // deterministic rotation, and saying otherwise would be a lie.
    const drillSegForExplain = planResolved.segments.find((s) => s.id === 'drill');
    if (drillSegForExplain) {
      if (balanced) {
        drillSegForExplain.explain = null;
        drillSegForExplain.recovery = null;
      } else {
        drillSegForExplain.explain = segmentExplain({
          segId: 'drill',
          concept: top?.concept || null,
          drillKind: drillSegForExplain.payload?.kind || null,
          target: {
            errorCount: top?.errorCount ?? top?.recurrence ?? 0,
            overdueBy: top?.overdueBy ?? 0,
            modes: top?.modes,
          },
          fallbackWhy: drillSegForExplain.why || null,
        });
        // Recovery state only where the learner-error model is the source of
        // truth (trainer/dictation/pronunciation gaps); mistake-graph nodes
        // have a different shape and stay unbadged rather than mislabelled.
        const gapEntry = trainerGap || dictationGap || pronunciationGap;
        drillSegForExplain.recovery = top && gapEntry && top.id === gapEntry.id
          ? recoveryStatus(getLearnerErrors({ limit: 20 }).find((e) => e.id === top.id))
          : null;
      }
    }
    const reviewSegForExplain = planResolved.segments.find((s) => s.id === 'review');
    if (reviewSegForExplain) {
      reviewSegForExplain.explain = segmentExplain({
        segId: 'review',
        targeted: balanced ? false : caps.recentCorrections > 0,
        fallbackWhy: reviewSegForExplain.why || null,
      });
    }
    // Evidence Study: deterministic held-out check insertion. On a check day
    // a brief, unscaffolded, CEFR-matched check rides at the END of the
    // session — measurement only, never practice, never mastery input.
    const today = new Date();
    const sDay = study ? studyApi.daySinceEnrolment(study, today) : null;
    const checkDue = study ? studyApi.isCheckScheduled(study, sDay) : false;
    let heldOut = null;
    if (checkDue) {
      // Study instrumentation must never take down practice: any failure in
      // pool building simply means no check today.
      try {
        // TRULY HELD-OUT: every previously shown sourceItemId is collected
        // from past checks so no item repeats for this participant. If the
        // verified bank is exhausted for the scheduled skill, the pool comes
        // back empty and the check honestly skips (no recycling).
        const seenIds = new Set(
          getStudyChecks().flatMap((c) => (c.items || []).map((it) => it.sourceItemId))
        );
        const pool = studyApi.buildHeldOutPool({
          participantId: study.participantId,
          day: sDay,
          level: level || study.startLevel || 'B1',
          vocabEntries: entries,
          srsMap: getSrs(),
          listeningTracks: tracks,
          seenIds,
        });
      // A completed measurement is never re-presented; a pending same-day
      // check re-uses its frozen record (deterministic across re-renders and
      // StrictMode double-invocation — never rebuild the pool for a day that
      // already has a check).
      const existing = getStudyChecks().find((c) => c.day === sDay && c.participantId === study.participantId);
      if (existing) {
        if (!existing.results) heldOut = existing;
      } else if (pool.words.length || pool.track) {
        const saved = studyApi.saveCheckRecord(studyApi.makeCheckRecord({
          participantId: study.participantId, day: sDay, level: level || study.startLevel || 'B1', pool,
        }));
        if (saved && !saved.results) heldOut = saved;
      }
      } catch { /* a broken check plan is no reason to lose the session */ }
    }
    // P1 selection-trial record: frozen before any practice happens, with
    // the resolved activity so analysis knows what was actually delivered.
    // This is the product's own scheduler diagnostic (fp.selectionTrial.v1),
    // not fp.study.* research data — it is recorded with or without study
    // enrolment, so scheduler quality is observable for every learner.
    try {
      const drillSeg = planResolved.segments.find((s) => s.id === 'drill');
      const trial = recordSelectionTrial({
        engineVersion: EVIDENCE_ENGINE_VERSION,
        candidates,
        selectedId: top?.id || null,
        selectedConcept: top?.concept || (balanced ? rotationTopic : null),
        activity: drillSeg?.payload?.kind || (planResolved.segments[0]?.id || null),
        masteryBefore: top?.mastery ?? null,
        recurrenceBefore: top?.recurrence ?? null,
        why: drillSeg?.why || '',
        segments: planResolved.segments.map((s) => ({ id: s.id, minutes: s.minutes })),
        variant,
        calibrationReady: Boolean(calibration.ready),
      });
      // Longitudinal outcome skeleton for this trial: a genuine fp.study.*
      // research write, so it happens only for an enrolled participant
      // (startOutcomeRecord additionally self-guards on consent/protocol).
      if (study) {
        const consistency = studyApi.verifyTreatmentConsistency({ deliveredVariant: variant, study });
        studyApi.startOutcomeRecord({ trial, graph, arm: variant, day: sDay, consistency });
      }
    } catch { /* trial logging must never break the session */ }
    return { ...planResolved, study, heldOut, studyDay: sDay };
  // deps: every async dependency's arrival (or failure, or retry) changes the
  // deps object → these primitives change → the plan replans no matter what
  // order modules resolve in.
  }, [open, minutes, apiKey, mockMode, level, entries, scenariosReg, grammarReady,
    listeningTracks, studyReady, studyFailed, studyModule, conjCap, authoredCap, accentCap]);

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
  const award = (n) => { setXp((x) => x + n); onXp?.(n); };

  if (!open) return null;
  const close = () => { onClose(); setSegIndex(0); setHistory([]); setXp(0); };
  // Loading: genuine learning dependencies (vocab, scenarios, grammar,
  // listening) still resolving. Never more than the actual chunk downloads —
  // and never a timer: deps resolve as soon as their chunks land.
  if (!plan && !deps.failed.length) {
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
function TodayBody({ plan, segIndex, setSegIndex, close, apiKey, mockMode, level, ttsRate, onTurn, onActivity, award, history, setHistory }) {
  // Track content lives in the lazy listening chunk; today's payload only
  // carries ids, so resolve the real track when the listen segment renders.
  const liveTracks = useListeningTracks();
  const startRef = useRef(Date.now());
  const segStartRef = useRef(Date.now());
  const deliveredRef = useRef([]);
  const recordedRef = useRef(false);
  const missingRef = useRef(null);
  const totalSteps = plan.segments.length + (plan.heldOut ? 1 : 0);
  const advance = () => {
    const seg = plan.segments[segIndex];
    if (seg) {
      deliveredRef.current.push({
        id: seg.id,
        minutes: seg.minutes,
        seconds: Math.round((Date.now() - segStartRef.current) / 1000),
        skipped: false,
      });
    }
    segStartRef.current = Date.now();
    setSegIndex((i) => i + 1);
  };
  const skip = useCallback(() => {
    const seg = plan.segments[segIndex];
    if (seg) {
      deliveredRef.current.push({
        id: seg.id,
        minutes: seg.minutes,
        seconds: Math.round((Date.now() - segStartRef.current) / 1000),
        skipped: true,
      });
    }
    segStartRef.current = Date.now();
    setSegIndex((i) => i + 1);
  }, [plan, segIndex, setSegIndex]);
  // Persist the delivery record onto the newest selection trial once the
  // session ends (the trial was frozen at start; outcomes join later).
  useEffect(() => {
    if (segIndex < totalSteps || recordedRef.current) return;
    recordedRef.current = true;
    try {
      const trials = getSelectionTrial();
      const last = trials[trials.length - 1];
      if (last) {
        last.delivered = deliveredRef.current;
        last.timeSpent = Math.round((Date.now() - startRef.current) / 1000);
        last.completed = deliveredRef.current.length === plan.segments.length
          && !deliveredRef.current.some((d) => d.skipped && d.seconds < 5);
        saveSelectionTrial(trials);
        // Study: fold delivery into the outcome record for this trial.
        callStudy('updateOutcomeDelivery', { trialAt: last.at, timeSpent: last.timeSpent, completed: last.completed, delivered: last.delivered });
      }
    } catch { /* delivery logging must never break the close */ }
  }, [segIndex, plan, totalSteps]);

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
      body = <DelayedReview count={seg.payload.count} onXp={award} />;
    } else if (seg.id === 'listen' && seg.payload.track) {
      const track = (liveTracks || []).find((t) => t.id === seg.payload.track.id);
      if (track) body = <TrackPlayer track={track} baseRate={ttsRate} level={level} onXp={award} onActivity={onActivity} onDone={advance} />;
    }
  }

  if (!body && drillFocus) {
    body = <TrainerDrill focus={drillFocus} onXp={award} onDone={advance} />;
  }

  if (!body && onCheckStep && plan.heldOut) {
    body = (
      <HeldOutCheck
        check={plan.heldOut}
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
    return (
      <div className="fixed inset-0 z-[65] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label={`Today's ${langName()} complete`}>
        <div className="mx-auto min-h-full max-w-lg px-4 py-10 text-center space-y-5">
          <p className="text-3xl font-black text-ink">C'est tout.</p>
          {takeaway ? (
            <p className="text-lg text-ink leading-relaxed">
              You can now say<br />
              <span className="font-bold" lang="fr">«{takeaway}»</span>
            </p>
          ) : (
            <p className="text-sm text-ink2">
              Today's French — {plan.totalMinutes} minutes · {plan.segments.map((s) => s.label).join(' → ')}.
            </p>
          )}
          <button onClick={close} className="btn btn-primary w-full max-w-xs mx-auto min-h-12 rounded-xl text-sm">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label={`Today's ${langName()}`}>
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

// The "why this?" panel for targeted segments: what · why · evidence ·
// success. Copy is composed by segmentExplain.js (pure, tested for learner
// safety); this component only lays it out. The recovery badge appears when
// the learner-error model is the source of truth for the target.
function WhyPanel({ explain, recovery }) {
  return (
    <div className="shrink-0 bg-surface2 border-b border-line px-4 py-3">
      <div className="max-w-lg mx-auto space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink" lang="fr">{explain.headline}</p>
          {recovery && <RecoveryBadge status={recovery} />}
        </div>
        <p className="text-xs text-ink2">{explain.why}</p>
        {explain.evidence.length > 0 && (
          <p className="text-[11px] text-ink3 tabular-nums">{explain.evidence.join(' · ')}</p>
        )}
        <p className="text-[11px] text-ink3">Done when: {explain.success}</p>
      </div>
    </div>
  );
}

// Targeted drill with a runtime fallback chain. The payload arrives with the
// full ordered chain from the capability resolver; if the AI drill returns
// nothing (offline, quota, error), the runner walks to the next link instead
// of showing "unavailable" — the session always stays complete.
function DrillChainRunner({ payload, level, apiKey, mockMode, ttsRate, onXp, onDone }) {
  const [current, setCurrent] = useState(payload);
  const kind = current?.kind || payload?.kind;

  if (kind === 'conj-drill') {
    return <TrainerDrill focus={{ ...current, personIndex: current.personIndex ?? payload.personIndex ?? null }} onXp={onXp} onDone={onDone} />;
  }
  if (kind === 'dictation-drill') {
    // sessionMode: the segment ends when the repair lands — a clean pass
    // repairs the gap (recordLearnerSuccess), 'Done' hands back to the session.
    return (
      <SessionDrillShell title="Dictée — train your ear" onDone={onDone}>
        <Dictation ttsRate={ttsRate} onXp={onXp} sessionMode onDone={onDone} />
      </SessionDrillShell>
    );
  }
  if (kind === 'accent-drill') {
    return (
      <SessionDrillShell title="Accent drill — retype with the accents" onDone={onDone}>
        <AccentDrill onXp={onXp} sessionMode onDone={onDone} />
      </SessionDrillShell>
    );
  }
  if (kind === 'authored-drill') {
    return (
      <AuthoredDrill
        exercises={current.exercises}
        topicTitle={current.title}
        onXp={onXp}
        onDone={onDone}
      />
    );
  }
  if (kind === 'retype') {
    return <NotebookRetype onXp={onXp} onCleared={onDone} />;
  }
  if (kind === 'srs-retrieval') {
    return <RecallRunner cardCap={current.cardCap || 5} onDone={onDone} onXp={onXp} />;
  }
  if (kind === 'listen') {
    return <ListenFallback track={current.track} onDone={onDone} />;
  }
  if (kind === 'review') {
    return <DelayedReview count={current.count} onXp={onXp} />;
  }
  // Default: the AI targeted drill (first link of the chain).
  return (
    <AiDrillRunner
      concept={current.concept}
      level={level}
      apiKey={apiKey}
      mockMode={mockMode}
      onXp={onXp}
      onDone={onDone}
      onEmpty={() => {
        const next = nextFallback(payload.chain, 'ai-drill');
        if (next) setCurrent(next); else onDone();
      }}
    />
  );
}

function FallbackBridge() {
  return <div className="h-full grid place-items-center px-4"><p className="text-sm text-ink2">Preparing the next drill…</p></div>;
}

// Chrome for the session-embedded focused drills (dictée, accents): the
// standalone pages have their own headers and finish buttons; inside the
// session the segment needs a title and an explicit end. `canFinish` gates
// the button to after the first completed round — ending the segment before
// any repair attempt would just leave the gap active with nothing gained.
function SessionDrillShell({ title, canFinish, onDone, children }) {
  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <p className="text-[11px] uppercase tracking-wider text-ink3">Focused drill — your weak spot</p>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {children}
        {canFinish && (
          <button onClick={onDone} className="btn btn-primary w-full min-h-11 rounded-xl text-sm">
            Done drilling
          </button>
        )}
      </div>
    </div>
  );
}

// The AI micro-drill: on failure/empty, falls through to the next chain link.
function AiDrillRunner({ concept, level, apiKey, mockMode, onXp, onDone, onEmpty }) {
  const [state, setState] = useState({ busy: true, exercises: null });
  const correctRef = useRef(0);
  // Evidence identity: the whole drill is ONE presentation of this concept
  // (one encounter). Every success it records cites the same encounter, so a
  // single lucky run can never mint two independent passes; the NEXT drill
  // run builds its own identity.
  const encounterRef = useRef(null);
  if (encounterRef.current === null) encounterRef.current = newEncounterId();
  const awardCounting = (n) => { if (n >= 3) correctRef.current += 1; onXp(n); };
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { generateExercises } = await import('../lib/groq');
        const { exercises: ex } = await generateExercises(apiKey, { topic: concept, level, mock: mockMode });
        if (live) setState({ busy: false, exercises: ex || [] });
      } catch {
        if (live) setState({ busy: false, exercises: [] });
      }
    })();
    return () => { live = false; };
  }, [concept, level, apiKey, mockMode]);
  useEffect(() => {
    if (!state.busy && state.exercises && !state.exercises.length) {
      const t = setTimeout(onEmpty, 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state.busy, state.exercises, onEmpty]);
  const finish = () => {
    try {
      const graph = getMistakeGraph();
      const node = graph.find((m) => m.concept === concept && m.status === 'active');
      if (node) {
        const retest = { at: new Date().toISOString(), correct: correctRef.current >= 2, context: 'targeted-drill', immediate: true };
        saveMistakeGraph(recordRetest(graph, { id: node.id, ...retest }));
        // Study: same-session drill outcome → immediate slot only (never retention).
        callStudy('linkRetestToOutcomes', { mistakeId: node.id, retest: { ...retest, immediate: true } });
      }
    } catch { /* graph bookkeeping must never break the drill */ }
    // Close the learner-error loop too: this drill exists because a grammar
    // gap was selected, so its outcome is that gap's evidence. Two correct
    // answers (the same-session bar the mistake graph uses) record a success;
    // the next independent pass is what actually resolves the entry.
    try {
      if (correctRef.current >= 2) {
        const entry = getLearnerErrors({ limit: 40 }).find((e) => e.category === 'grammar'
          && (e.key === concept || e.label === concept
            || (concept && e.label && concept.toLowerCase().includes(e.label.toLowerCase()))));
        if (entry) recordLearnerSuccess({ category: 'grammar', key: entry.key, mode: 'targeted-drill', score: null, source: 'ai-drill', sessionId: currentSessionId(), encounterId: encounterRef.current, activityId: concept });
      }
    } catch { /* loop bookkeeping must never break the drill */ }
    onDone();
  };
  if (state.busy) return <div className="h-full grid place-items-center"><p className="text-sm text-ink2">Building your drill…</p></div>;
  if (!state.exercises?.length) {
    // Walk the fallback chain instead of a dead end. The parent swaps the
    // runner for the next chain link; the brief pause avoids a flash.
    return <FallbackBridge />;
  }
  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto">
        <Quiz exercises={state.exercises} onXp={awardCounting} footer={
          <button onClick={finish} className="btn btn-primary w-full min-h-11 rounded-xl text-sm mt-3">Done drilling</button>
        } />
      </div>
    </div>
  );
}

// Conjugation-trainer drill link: repairs the trainer gap in-session with
// the trainer itself, focused on the exact weak form (no level picker, no
// browsing) so a missed form gets one more chance within today's plan.
function TrainerDrill({ focus, onXp, onDone }) {
  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto">
        <p className="text-[11px] uppercase tracking-wider text-ink3 mb-2">Verb drill — your weak form</p>
        <Suspense fallback={<div className="h-40 grid place-items-center"><p className="text-sm text-ink2">Loading the trainer…</p></div>}>
          <ConjugationTrainer focus={focus} onXp={onXp} onDone={onDone} />
        </Suspense>
      </div>
    </div>
  );
}

// Authored drill from the grammar library — always available offline.
function AuthoredDrill({ exercises, topicTitle, onXp, onDone }) {
  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto">
        {topicTitle && <p className="text-[11px] uppercase tracking-wider text-ink3 mb-2">{topicTitle}</p>}
        <Quiz exercises={exercises} onXp={onXp} footer={
          <button onClick={onDone} className="btn btn-primary w-full min-h-11 rounded-xl text-sm mt-3">Done drilling</button>
        } />
      </div>
    </div>
  );
}

// Listen fallback inside the drill chain.
function ListenFallback({ track, onDone }) {
  const tracks = useListeningTracks();
  const real = (tracks || []).find((t) => t.id === track?.id);
  useEffect(() => {
    if (!real) onDone();
  }, [real, onDone]);
  if (!real) return null;
  return <TrackPlayer track={real} baseRate={1} level="B1" onXp={() => {}} onActivity={() => {}} onDone={onDone} />;
}

// Compact SRS recall: due cards, capped, rated through the real scheduler.
// Mistake-graph cards (id prefix 'mistake-') feed recordRetest as spaced,
// non-immediate evidence — an SRS resurface is by definition delayed.
export function RecallRunner({ cardCap, onDone, onXp, onActivity }) {
  // The vocab library is a lazy chunk — the hook's `null` means still loading;
  // only a RESOLVED empty deck auto-advances, otherwise the effect would race
  // the chunk load and skip the segment before a card had a chance to render.
  const entries = useAllEntries();
  const [deck, setDeck] = useState(null);
  useEffect(() => {
    if (entries === null) return undefined;
    const srs = getSrs();
    const library = [...entries, ...notebookAsEntries(getNotebook())];
    setDeck(reviewOrder(dueEntries(library, srs, Date.now(), { newCardCap: cardCap }), srs).slice(0, cardCap));
    return undefined;
  }, [entries, cardCap]);
  const [idx, setIdx] = useState(0);
  const firedRef = useRef(false);
  const loaded = deck !== null;
  useEffect(() => { if (loaded && deck.length === 0 && !firedRef.current) { firedRef.current = true; setTimeout(onDone, 0); } }, [loaded, deck, onDone]);
  useEffect(() => { firedRef.current = false; }, [cardCap]);
  if (!loaded || deck.length === 0) return null;
  if (idx >= deck.length) {
    return (
      <div className="h-full grid place-items-center px-4">
        <p className="text-sm text-ink2">Recall done — {deck.length} card{deck.length === 1 ? '' : 's'} reviewed.</p>
      </div>
    );
  }
  const entry = deck[idx];
  const rate = (rating) => {
    rateCard(entry.id, rating, { mode: 'receptive', skill: 'vocabulary', itemLabel: entry.fr, label: entry.fr, source: 'today-recall', encounterId: newEncounterId() });
    onActivity?.({ type: 'cards', rating, itemId: entry.id, itemLabel: entry.fr, mode: 'receptive' });
    onXp(rating === 'again' ? 1 : 2);
    // Mistake-graph cards close their loop: the SRS resurface IS the
    // delayed retest, so the outcome feeds the node's mastery lifecycle.
    if (entry.id.startsWith('mistake-')) {
      try {
        const nb = getErrorNotebook().find((e) => e.id === entry.id);
        if (nb?.mistakeId) {
          const graph = getMistakeGraph();
          if (graph.some((m) => m.id === nb.mistakeId)) {
            const retest = { at: new Date().toISOString(), correct: rating !== 'again', context: 'srs-recall' };
            saveMistakeGraph(recordRetest(graph, { id: nb.mistakeId, ...retest }));
            // Study: the SRS resurface IS the delayed retest. ASR-sourced
            // cards carry uncertainty so the analysis can exclude them.
            callStudy('linkRetestToOutcomes', { mistakeId: nb.mistakeId, retest: { ...retest, asrUncertain: Boolean(nb.asrUncertain) } });
          }
        }
      } catch { /* graph bookkeeping must never break recall */ }
    }
    setTimeout(() => setIdx((i) => i + 1), 250);
  };
  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <p className="text-center text-[11px] text-ink3 tabular-nums">{idx + 1}/{deck.length}</p>
        <VocabCard entry={entry} cardDue saved={false} onRate={rate} onToggleSave={() => {}} apiKey="" mockMode />
        <p className="text-[11px] text-ink3 text-center">Rate honestly — the scheduler decides when this returns.</p>
      </div>
    </div>
  );
}

// Delayed review: recent corrections replayed as retrieval prompts. A
// self-marked "said it right" feeds the mistake graph's mastery lifecycle.
export function DelayedReview({ count, onXp }) {
  const items = useMemo(
    () => getErrorNotebook().filter((e) => e.correctedByLearner).slice(0, Math.max(1, count)),
    [count],
  );
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  if (!items.length || idx >= items.length) {
    return (
      <div className="h-full grid place-items-center px-4">
        <p className="text-sm text-ink2">Review complete.</p>
      </div>
    );
  }
  const entry = items[idx];
  const mark = (remembered) => {
    try {
      const graph = getMistakeGraph();
      const match = graph.find((m) => m.original === entry.original || m.concept === entry.ruleId);
      if (match) {
        const retest = { at: new Date().toISOString(), correct: remembered, context: 'delayed-review' };
        saveMistakeGraph(recordRetest(graph, { id: match.id, ...retest }));
        callStudy('linkRetestToOutcomes', { mistakeId: match.id, retest });
      }
    } catch { /* graph bookkeeping must never break review */ }
    onXp(remembered ? 2 : 1);
    setRevealed(false);
    setIdx((i) => i + 1);
  };
  return (
    <div className="h-full grid place-items-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="text-[11px] uppercase tracking-wider text-ink3">Prompt {idx + 1}/{items.length}</p>
        <p className="text-lg text-ink" lang="fr">«{entry.original}»</p>
        {revealed ? (
          <>
            <p className="text-lg font-semibold text-ink" lang="fr">{entry.corrected}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => mark(true)} className="btn btn-secondary min-h-11 rounded-xl text-sm">I said it right</button>
              <button onClick={() => mark(false)} className="btn btn-secondary min-h-11 rounded-xl text-sm">Needed the answer</button>
            </div>
          </>
        ) : (
          <button onClick={() => setRevealed(true)} className="btn btn-primary min-h-11 px-6 rounded-xl text-sm">Say it, then reveal</button>
        )}
      </div>
    </div>
  );
}
