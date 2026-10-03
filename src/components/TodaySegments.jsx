import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recordRetest } from '../lib/mistakeGraph';
import {
  getSrs, getNotebook, rateCard, getLearnerErrors,
  getMistakeGraph, saveMistakeGraph, recordLearnerSuccess,
} from '../lib/storage';
import { getErrorNotebook, selectCorrectedErrors } from '../lib/errorNotebook';
import { useAllEntries } from '../lib/vocabAsync';
import { activeLanguage } from '../lib/i18n';
import { notebookAsEntries, reviewOrder, dueEntries } from '../lib/memory';
import { resolveListeningTrack, useListeningTracks } from '../lib/listeningAsync';
import { callStudy } from '../lib/studyFlowAsync';
import { currentSessionId, newEncounterId } from '../lib/evidenceIdentity';
import VocabCard from './VocabCard';
import { NotebookRetype } from './NotebookRetype';
import Quiz from './Quiz';
import RecoveryBadge from './RecoveryBadge';

// Heavy segment runners load with the session, never with the app: they are
// mounted mid-session only, so their content chunks stay out of first load.
const TrackPlayer = lazy(() => import('./Listening').then((m) => ({ default: m.TrackPlayer })));
const ConjugationTrainer = lazy(() => import('./ConjugationTrainer'));
const Dictation = lazy(() => import('./Dictation'));
const AccentDrill = lazy(() => import('./AccentDrill'));

// Segment runners for Today's composed session: the drill chain and its
// producers, SRS recall and delayed review. Each runner owns only its own
// delivery; session-level bookkeeping (the plan, the trial, the debrief)
// stays in TodaySession.jsx.

// The "why this?" panel for targeted segments: what · why · evidence ·
// success. Copy is composed by segmentExplain.js (pure, tested for learner
// safety); this component only lays it out. The recovery badge appears when
// the learner-error model is the source of truth for the target.
export function WhyPanel({ explain, recovery }) {
  return (
    <div className="shrink-0 bg-surface2 border-b border-line px-4 py-3">
      <div className="max-w-lg mx-auto space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink" lang={activeLanguage().id}>{explain.headline}</p>
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
// full ordered chain from the capability resolver; if a link fails at runtime
// (AI drill returns nothing, the trainer has no data for the target form, a
// queue empties), the runner advances to the next runnable link instead of
// showing "unavailable" — the session always stays complete.
//
// Runtime contract:
//   1. a segment producer may fail;
//   2. failure never ends the session;
//   3. advance DETERMINISTICALLY to the next link (by position, not kind —
//      a chain may contain the same kind twice);
//   4. keep advancing while further links fail;
//   5. the completion handler fires exactly once, and only when a runnable
//      activity actually finished or every link is genuinely exhausted;
//   6. no transient "unavailable" dead-end UI.
export function DrillChainRunner({ payload, level, apiKey, mockMode, ttsRate, onXp, onDone }) {
  const chain = Array.isArray(payload?.chain) && payload.chain.length
    ? payload.chain
    : [payload];
  const [index, setIndex] = useState(0);
  const current = chain[Math.min(index, chain.length - 1)];

  // Completion is single-consumer: a child's onDone, an unavailability race
  // and a parent unmount can all arrive in the same tick. One guard, one call.
  const finishedRef = useRef(false);
  const [finished, setFinished] = useState(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    onDone?.();
  }, [onDone]);
  // Advance to the next link, or finish when the chain is exhausted. Idempotent
  // per link: a stale child callback from an older link cannot skip ahead.
  const advanceFrom = useCallback((from) => {
    if (finishedRef.current) return;
    if (from !== indexRef.current) return; // stale producer callback
    if (from + 1 < chain.length) setIndex(from + 1);
    else finish();
  }, [chain.length, finish]);
  // Reported unavailability for THIS link only. The child re-renders with a
  // fresh callback identity every time the parent renders, so a plain
  // `advanceFrom(indexRef.current)` could advance twice from one link.
  const [unavailableFor, setUnavailableFor] = useState(-1);
  const unavailable = useCallback(() => {
    const from = indexRef.current;
    if (unavailableFor === from) return;
    setUnavailableFor(from);
    advanceFrom(from);
  }, [advanceFrom, unavailableFor]);

  // A payload with no chain at all is an exhausted chain: complete honestly.
  useEffect(() => {
    if (!current) finish();
  }, [current, finish]);

  // A link that cannot run at all (no exercises to drill, nothing to play)
  // is producer unavailability decided BEFORE render — never a fake "0/0
  // done" screen or a "nothing to drill" dead-end. Runtime failures
  // self-report through `unavailable`; this covers the statically
  // unrunnable ones so the chain keeps walking.
  const runnable = current ? linkRunnable(current) : true;
  useEffect(() => {
    if (current && !runnable) unavailable();
  }, [current, runnable, unavailable]);

  // Nothing to show only while the session moves on: a finished chain and an
  // unrunnable link render NO panel at all — the segment advances on the same
  // tick, so a learner never sits on "preparing the next drill…" forever.
  if (!current || finished || !runnable) return null;
  const kind = current.kind;

  if (kind === 'conj-drill') {
    return (
      <TrainerDrill
        focus={{ ...current, personIndex: current.personIndex ?? payload?.personIndex ?? null }}
        onXp={onXp}
        onDone={finish}
        onUnavailable={unavailable}
      />
    );
  }
  if (kind === 'dictation-drill') {
    // sessionMode: the segment ends when the repair lands — a clean pass
    // repairs the gap (recordLearnerSuccess), 'Done' hands back to the session.
    return (
      <SessionDrillShell title="Dictée — train your ear" onDone={finish}>
        <Dictation ttsRate={ttsRate} onXp={onXp} sessionMode onDone={finish} />
      </SessionDrillShell>
    );
  }
  if (kind === 'accent-drill') {
    return (
      <SessionDrillShell title="Accent drill — retype with the accents" onDone={finish}>
        <AccentDrill onXp={onXp} sessionMode onDone={finish} />
      </SessionDrillShell>
    );
  }
  if (kind === 'authored-drill') {
    return (
      <AuthoredDrill
        exercises={current.exercises}
        topicTitle={current.title}
        onXp={onXp}
        onDone={finish}
      />
    );
  }
  if (kind === 'retype') {
    return <NotebookRetype onXp={onXp} onCleared={finish} />;
  }
  if (kind === 'srs-retrieval') {
    return <RecallRunner cardCap={current.cardCap || 5} onDone={finish} onXp={onXp} />;
  }
  if (kind === 'listen') {
    return <ListenFallback track={current.track} onDone={finish} onUnavailable={unavailable} />;
  }
  if (kind === 'review') {
    return <DelayedReview count={current.count} onXp={onXp} onDone={finish} />;
  }
  // Default: the AI targeted drill — generated at runtime, so it can fail or
  // come back empty; either way the chain walks on instead of dead-ending.
  return (
    <AiDrillRunner
      concept={current.concept}
      level={level}
      apiKey={apiKey}
      mockMode={mockMode}
      onXp={onXp}
      onDone={finish}
      onEmpty={unavailable}
    />
  );
}

function FallbackBridge() {
  return <div className="h-full grid place-items-center px-4"><p className="text-sm text-ink2">Preparing the next drill…</p></div>;
}

// Can this link run at all? Statically-decidable unavailability only — a link
// that must ask the network or the learner self-reports at runtime instead.
// Returning false walks the chain on instead of rendering a dead-end panel.
function linkRunnable(link) {
  switch (link?.kind) {
    case 'authored-drill':
      return Array.isArray(link.exercises) && link.exercises.length > 0;
    case 'retype':
    case 'srs-retrieval':
    case 'review':
      // Empty queues are legitimate completions (the child reports "cleared"),
      // not unavailability: there was nothing to repair, and that is progress.
      return true;
    default:
      return true;
  }
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
  const finishRef = useRef(false);
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
        // generateExercises returns a plain exercise ARRAY (AiHub consumes it
        // that way). Destructuring `{ exercises }` from it here read undefined
        // and made every AI drill fall through to the fallback chain — the
        // first link could never actually run.
        const ex = await generateExercises(apiKey, { topic: concept, level, mock: mockMode });
        if (live) setState({ busy: false, exercises: Array.isArray(ex) ? ex : [] });
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
    if (finishRef.current) return;
    finishRef.current = true;
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
export function TrainerDrill({ focus, onXp, onDone, onUnavailable }) {
  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto">
        <p className="text-[11px] uppercase tracking-wider text-ink3 mb-2">Verb drill — your weak form</p>
        <Suspense fallback={<div className="h-40 grid place-items-center"><p className="text-sm text-ink2">Loading the trainer…</p></div>}>
          <ConjugationTrainer focus={focus} onXp={onXp} onDone={onDone} onUnavailable={onUnavailable} />
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

// Listen fallback inside the drill chain. A missing/unresolvable track is
// producer unavailability: the chain walks on instead of dead-ending.
function ListenFallback({ track, onDone, onUnavailable }) {
  const tracks = useListeningTracks();
  const resolved = resolveListeningTrack(tracks, track?.id);
  const firedRef = useRef(false);

  useEffect(() => {
    if (resolved.status !== 'missing' || firedRef.current) return;
    firedRef.current = true;
    (onUnavailable || onDone)?.();
  }, [resolved.status, onDone, onUnavailable]);

  if (resolved.status === 'loading') {
    return <div className="h-full grid place-items-center"><p className="text-sm text-ink2">Loading listening…</p></div>;
  }
  if (resolved.status !== 'ready') return null;
  return <TrackPlayer track={resolved.track} baseRate={1} level="B1" onXp={() => {}} onActivity={() => {}} onDone={onDone} />;
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
  // Evidence identity + double-tap guard: ONE encounter per DISPLAYED card.
  // The id is minted per deck index (per presentation), not inside the rating
  // callback, and the first rating wins: ratingRef closes synchronously so a
  // fast double-tap (or a tap racing the 250 ms advance) is a no-op.
  const ratingRef = useRef(false);
  const encounterRef = useRef(null);
  useEffect(() => {
    ratingRef.current = false;
    encounterRef.current = newEncounterId();
  }, [idx]);
  const loaded = deck !== null;

  // Empty decks skip immediately; completed non-empty decks briefly show the
  // completion state and then hand control back to Today. Mark completion only
  // when the timer actually fires so a parent re-render cannot cancel the timer
  // after permanently flipping the guard.
  useEffect(() => {
    if (!loaded || firedRef.current) return undefined;
    const delay = deck.length === 0 ? 0 : idx >= deck.length ? 300 : null;
    if (delay === null) return undefined;
    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDone();
    }, delay);
    return () => clearTimeout(timer);
  }, [loaded, deck, idx, onDone]);

  // A changed cap or language library means a fresh recall segment.
  useEffect(() => {
    firedRef.current = false;
    ratingRef.current = false;
    setIdx(0);
  }, [cardCap, entries]);

  useEffect(() => {
    ratingRef.current = false;
  }, [idx]);

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
    if (ratingRef.current) return; // duplicate tap: one presentation, one rating
    ratingRef.current = true;
    rateCard(entry.id, rating, { mode: 'receptive', skill: 'vocabulary', itemLabel: entry.fr, label: entry.fr, source: 'today-recall', encounterId: encounterRef.current });
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
        <VocabCard entry={entry} cardDue saved={false} disabled={ratingRef.current} onRate={rate} onToggleSave={() => {}} apiKey="" mockMode />
        <p className="text-[11px] text-ink3 text-center">Rate honestly — the scheduler decides when this returns.</p>
      </div>
    </div>
  );
}

// Delayed review: recent corrections replayed as retrieval prompts. A
// self-marked "said it right" feeds the mistake graph's mastery lifecycle.
export function DelayedReview({ count, onXp, onDone }) {
  const items = useMemo(
    () => selectCorrectedErrors(getErrorNotebook(), { limit: Math.max(1, count) }),
    [count],
  );
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const firedRef = useRef(false);
  const markRef = useRef(false);
  const complete = !items.length || idx >= items.length;

  // Review is a session segment, not a terminal screen: empty review queues
  // skip immediately and completed queues hand control back after a brief
  // acknowledgement. The guard prevents StrictMode/re-render duplicates.
  useEffect(() => {
    if (!complete || firedRef.current) return undefined;
    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDone?.();
    }, items.length ? 300 : 0);
    return () => clearTimeout(timer);
  }, [complete, items.length, onDone]);

  useEffect(() => {
    firedRef.current = false;
    markRef.current = false;
    setIdx(0);
    setRevealed(false);
  }, [count]);

  useEffect(() => {
    markRef.current = false;
  }, [idx]);

  if (complete) {
    return (
      <div className="h-full grid place-items-center px-4">
        <p className="text-sm text-ink2">Review complete.</p>
      </div>
    );
  }
  const entry = items[idx];
  const mark = (remembered) => {
    if (markRef.current) return;
    markRef.current = true;
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
        <p className="text-lg text-ink" lang={activeLanguage().id}>«{entry.original}»</p>
        {revealed ? (
          <>
            <p className="text-lg font-semibold text-ink" lang={activeLanguage().id}>{entry.corrected}</p>
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
