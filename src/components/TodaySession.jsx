import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDailyCurriculum } from '../lib/dailyCurriculum';
import { takeawayPhrase } from '../lib/takeaway';
import {
  dueRetests, recordRetest, EVIDENCE_ENGINE_VERSION,
} from '../lib/mistakeGraph';
import {
  calibrateSelection, applyCalibration, MIN_TRIALS_READY,
} from '../lib/selectionCalibration';
import {
  probeCapabilities, nextFallback, resolvePlanCapabilities,
} from '../lib/todayCapabilities';
import {
  enrolStudyState, studyStatus, daySinceEnrolment, isCheckScheduled,
  buildHeldOutPool, makeCheckRecord, saveCheckRecord, recordCheckOutcome,
  startOutcomeRecord, linkRetestToOutcomes, markOutcomeRecurrence,
  updateOutcomeDelivery, attachTransferToOutcomes,
  effectiveVariant, verifyTreatmentConsistency,
} from '../lib/studyFlow';
import { getPracticeAssignment, balancedDrillTopic } from '../lib/assignment';
import { recordSelectionTrial, getSelectionTrial, saveSelectionTrial } from '../lib/storage';
import {
  getSrs, getNotebook, getDueWeaknesses, rateCard,
  getMistakeGraph, saveMistakeGraph, getSyncId,
} from '../lib/storage';
import { getErrorNotebook } from '../lib/errorNotebook';
import { allEntries } from '../lib/vocab';
import { notebookAsEntries, dueEntries, reviewOrder, NEW_CARD_CAP } from '../lib/memory';
import { getScenarios } from '../lib/data';
import { allListeningTracks } from '../lib/listening';
import ChatArena from './ChatArena';
import { TrackPlayer } from './Listening';
import VocabCard from './VocabCard';
import { NotebookRetype } from './Memory';
import Quiz from './Quiz';
import HeldOutCheck from './HeldOutCheck';
import { ChevronRight, X } from './icons';

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

export default function TodaySession({ open, onClose, minutes = 20, apiKey, mockMode, level, ttsRate, onTurn, onXp, onActivity }) {
  const plan = useMemo(() => {
    if (!open) return null;
    const graph = getMistakeGraph();
    // Evidence Study: keep enrolment fresh (idempotent, consent-gated).
    const study = enrolStudyState({ startLevel: level || null });
    // ONE authoritative treatment: study arm when enrolled+active, else
    // adaptive. Nonparticipants always get the fully personalised product.
    const variant = effectiveVariant({ study });
    const balanced = variant === 'balanced';
    // P2 calibration: join past selection trials with their delayed retest
    // outcomes and derive conservative per-type weights. Below the sample
    // floor this is a no-op — selection stays the urgency order.
    const calibration = calibrateSelection(getSelectionTrial(), graph);
    // Freeze the selection candidates BEFORE choosing — P1 analysis joins
    // the delayed retest outcome against this record later.
    const candidates = applyCalibration(
      dueRetests(graph, Date.now(), 3).map((n) => ({
        id: n.id, concept: n.concept, type: n.type,
        mastery: n.mastery, recurrence: n.recurrence,
      })),
      calibration,
    );
    const top = candidates[0] || null;
    const srs = getSrs();
    const library = [...allEntries(), ...notebookAsEntries(getNotebook())];
    const srsDue = dueEntries(library, srs, Date.now(), { newCardCap: NEW_CARD_CAP }).length;
    const notebook = getErrorNotebook();
    const pendingRetypes = notebook.filter((e) => !e.correctedByLearner).length;
    const dayIndex = Math.floor(Date.now() / 86400000);
    const tracks = allListeningTracks();
    const listeningTrack = tracks.length ? tracks[dayIndex % tracks.length] : null;
    const weakness = (() => { try { return getDueWeaknesses()[0] || null; } catch { return null; } })();
    const scenarios = getScenarios();
    const suggested = scenarios.length ? scenarios[dayIndex % scenarios.length] : null;
    const rotationTopic = balancedDrillTopic(dayIndex);
    const hasAi = Boolean(apiKey) || Boolean(mockMode);
    const caps = probeCapabilities({
      hasAi,
      hasScenario: scenarios.length > 0,
      concept: top?.concept || null,
      pendingRetypes,
      srsDue,
      listeningTrack: listeningTrack ? { id: listeningTrack.id, title: listeningTrack.title, audioSrc: listeningTrack.audioSrc || null } : null,
      recentCorrections: notebook.filter((e) => e.correctedByLearner && Date.now() - Date.parse(e.at || e.lastSeenAt || 0) <= 48 * 3600000).length,
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
    // Evidence Study: deterministic held-out check insertion. On a check day
    // a brief, unscaffolded, CEFR-matched check rides at the END of the
    // session — measurement only, never practice, never mastery input.
    const today = new Date();
    const sDay = daySinceEnrolment(study, today);
    const checkDue = isCheckScheduled(study, sDay);
    let heldOut = null;
    if (checkDue) {
      const pool = buildHeldOutPool({
        participantId: study.participantId,
        day: sDay,
        level: level || study.startLevel || 'B1',
        vocabEntries: allEntries(),
        srsMap: getSrs(),
        listeningTracks: tracks,
      });
      if (pool.words.length || pool.track) {
        const saved = saveCheckRecord(makeCheckRecord({
          participantId: study.participantId, day: sDay, level: level || study.startLevel || 'B1', pool,
        }));
        // The persisted record keeps ids only; the bank-shaped items ride on
        // the in-memory plan so the skill-specific runner can render without
        // re-reading the bank.
        heldOut = { ...saved, poolItems: pool.words, poolWords: pool.words };
      }
    }
    // P1 selection-trial record: frozen before any practice happens, with
    // the resolved activity so analysis knows what was actually delivered.
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
      // Longitudinal outcome skeleton for this selection (study only).
      // Validity invariant: the label recorded MUST equal the delivered
      // treatment; a mismatch is flagged, never silently relabelled.
      const consistency = verifyTreatmentConsistency({ deliveredVariant: variant, study });
      startOutcomeRecord({ trial, graph, arm: variant, day: sDay, consistency });
    } catch { /* trial logging must never break the session */ }
    return { ...planResolved, study, heldOut, studyDay: sDay };
  }, [open, minutes, apiKey, mockMode, level]);

  const [segIndex, setSegIndex] = useState(0);
  const [xp, setXp] = useState(0);
  const [history, setHistory] = useState([]);
  const award = (n) => { setXp((x) => x + n); onXp?.(n); };

  if (!open || !plan) return null;
  const close = () => { onClose(); setSegIndex(0); setHistory([]); setXp(0); };
  return (
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
  );
}

// The in-session body: owns the delivery timers (per-segment time spent and
// completion, recorded onto the frozen selection trial) and renders the
// current segment. All hooks run unconditionally — the early return for the
// finished state lives in the child below, never here.
function TodayBody({ plan, segIndex, setSegIndex, close, apiKey, mockMode, level, ttsRate, onTurn, onActivity, award, history, setHistory }) {
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
  const skip = () => {
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
  };
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
        updateOutcomeDelivery({ trialAt: last.at, timeSpent: last.timeSpent, completed: last.completed, delivered: last.delivered });
      }
    } catch { /* delivery logging must never break the close */ }
  }, [segIndex, plan]);

  const done = segIndex >= totalSteps;
  // The held-out check is an implicit extra step after the last normal segment.
  const onCheckStep = !done && segIndex >= plan.segments.length && plan.heldOut;
  const seg = onCheckStep ? null : (done ? null : plan.segments[segIndex]);

  // Resolve the current segment's body. A missing body (should be rare — the
  // plan was capability-resolved at build time, but e.g. a recall deck can
  // empty itself mid-session) falls through to the next segment instead of a
  // dead screen.
  let body = null;
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
          onXp={award}
          onDone={advance}
        />
      );
    } else if (seg.id === 'review') {
      body = <DelayedReview count={seg.payload.count} onXp={award} onDone={advance} />;
    } else if (seg.id === 'listen' && seg.payload.track) {
      const track = allListeningTracks().find((t) => t.id === seg.payload.track.id);
      if (track) body = <TrackPlayer track={track} baseRate={ttsRate} level={level} onXp={onXp} onActivity={onActivity} onDone={advance} />;
    }
  }

  if (!body && onCheckStep && plan.heldOut) {
    body = (
      <HeldOutCheck
        check={plan.heldOut}
        onDone={(finished) => {
          recordCheckOutcome(plan.heldOut.id, finished);
          // Transfer attaches PER SKILL (the check day's scheduled skill) —
          // measurement only; selection never sees these items. Skills are
          // never merged while the protocol forbids an overall score.
          const score = finished?.total
            ? Math.round((finished.correct / finished.total) * 100)
            : null;
          attachTransferToOutcomes({
            day: plan.studyDay,
            score,
            skill: plan.heldOut.scheduledSkill || plan.heldOut.skills?.[0] || null,
          });
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
  }, [done, body, segIndex]);

  if (done) {
    const speakSeg = plan.segments.find((s) => s.id === 'speak');
    const speakScenario = speakSeg ? getScenarios().find((x) => x.id === speakSeg.payload.scenarioId) : null;
    const takeaway = takeawayPhrase(history, speakScenario);
    return (
      <div className="fixed inset-0 z-[65] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Today's French complete">
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
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Today's French">
      <header className="shrink-0 border-b border-line bg-surface px-4 py-2.5">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <span className="text-sm font-bold text-ink whitespace-nowrap">Aujourd'hui</span>
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
      </header>
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

// Targeted drill with a runtime fallback chain. The payload arrives with the
// full ordered chain from the capability resolver; if the AI drill returns
// nothing (offline, quota, error), the runner walks to the next link instead
// of showing "unavailable" — the session always stays complete.
function DrillChainRunner({ payload, level, apiKey, mockMode, onXp, onDone }) {
  const [current, setCurrent] = useState(payload);
  const kind = current?.kind || payload?.kind;

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
    return <DelayedReview count={current.count} onXp={onXp} onDone={onDone} />;
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

function FallbackBridge({ onEmpty }) {
  return <div className="h-full grid place-items-center px-4"><p className="text-sm text-ink2">Preparing the next drill…</p></div>;
}

// The AI micro-drill: on failure/empty, falls through to the next chain link.
function AiDrillRunner({ concept, level, apiKey, mockMode, onXp, onDone, onEmpty }) {
  const [state, setState] = useState({ busy: true, exercises: null });
  const correctRef = useRef(0);
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
        linkRetestToOutcomes({ mistakeId: node.id, retest: { ...retest, immediate: true } });
      }
    } catch { /* graph bookkeeping must never break the drill */ }
    onDone();
  };
  if (state.busy) return <div className="h-full grid place-items-center"><p className="text-sm text-ink2">Building your drill…</p></div>;
  if (!state.exercises?.length) {
    // Walk the fallback chain instead of a dead end. The parent swaps the
    // runner for the next chain link; the brief pause avoids a flash.
    return <FallbackBridge onEmpty={onEmpty} />;
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
  const tracks = allListeningTracks();
  const real = tracks.find((t) => t.id === track?.id);
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
  const deck = useMemo(() => {
    const srs = getSrs();
    const library = [...allEntries(), ...notebookAsEntries(getNotebook())];
    return reviewOrder(dueEntries(library, srs, Date.now(), { newCardCap: cardCap }), srs).slice(0, cardCap);
  }, [cardCap]);
  const [idx, setIdx] = useState(0);
  const firedRef = useRef(false);
  useEffect(() => { if (!deck.length && !firedRef.current) { firedRef.current = true; setTimeout(onDone, 0); } }, [deck.length, onDone]);
  useEffect(() => { firedRef.current = false; }, [cardCap]);
  if (!deck.length) return null;
  if (idx >= deck.length) {
    return (
      <div className="h-full grid place-items-center px-4">
        <p className="text-sm text-ink2">Recall done — {deck.length} card{deck.length === 1 ? '' : 's'} reviewed.</p>
      </div>
    );
  }
  const entry = deck[idx];
  const rate = (rating) => {
    rateCard(entry.id, rating, { mode: 'receptive', skill: 'vocabulary', itemLabel: entry.fr, label: entry.fr, source: 'today-recall' });
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
            linkRetestToOutcomes({ mistakeId: nb.mistakeId, retest: { ...retest, asrUncertain: Boolean(nb.asrUncertain) } });
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
export function DelayedReview({ count, onXp, onDone }) {
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
        linkRetestToOutcomes({ mistakeId: match.id, retest });
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
