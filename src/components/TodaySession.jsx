import { useMemo, useRef, useState } from 'react';
import { buildDailyCurriculum } from '../lib/dailyCurriculum';
import { dueRetests, weakestMistakes, recordRetest } from '../lib/mistakeGraph';
import {
  getSrs, getNotebook, getDueWeaknesses, rateCard,
  getMistakeGraph, saveMistakeGraph,
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
import { Check, ChevronRight, Play, X } from './icons';

// Today's French — one Start button, one composed session. Segments come
// from the daily curriculum; the learner never chooses a mode. Every phase
// writes through the app's real recorders, so abandoning mid-way still counts.

export default function TodaySession({ open, onClose, minutes = 20, apiKey, mockMode, level, ttsRate, onTurn, onXp, onActivity }) {
  const plan = useMemo(() => {
    if (!open) return null;
    const graph = getMistakeGraph();
    const top = dueRetests(graph, Date.now(), 1)[0] || weakestMistakes(graph, 1)[0] || null;
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
    return buildDailyCurriculum({
      minutes,
      srsDue,
      topMistake: top ? { id: top.id, concept: top.concept, label: top.concept, type: top.type, mastery: top.mastery, recurrence: top.recurrence } : null,
      pendingRetypes,
      recentCorrections: notebook.filter((e) => e.correctedByLearner && Date.now() - Date.parse(e.at || e.lastSeenAt || 0) <= 48 * 3600000).length,
      weaknessScenarioId: weakness?.scenarioId || null,
      suggestedScenarioId: suggested?.id || null,
      listeningTrack: listeningTrack ? { id: listeningTrack.id, title: listeningTrack.title, audioSrc: listeningTrack.audioSrc || null } : null,
      dayIndex,
    });
  }, [open, minutes]);

  const [segIndex, setSegIndex] = useState(0);
  const [xp, setXp] = useState(0);
  const [history, setHistory] = useState([]);
  const award = (n) => { setXp((x) => x + n); onXp?.(n); };
  const advance = () => setSegIndex((i) => i + 1);

  if (!open || !plan) return null;
  const close = () => { onClose(); setSegIndex(0); setHistory([]); setXp(0); };

  if (segIndex >= plan.segments.length) {
    return (
      <div className="fixed inset-0 z-[65] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Today's French complete">
        <div className="mx-auto min-h-full max-w-lg px-4 py-10 text-center space-y-5">
          <p className="text-3xl font-black text-ink">C'est tout.</p>
          <p className="text-sm text-ink2">
            Today's French — {plan.totalMinutes} minutes · {plan.segments.map((s) => s.label).join(' → ')}.
          </p>
          <p className="text-sm font-bold text-ink tabular-nums">+{xp} XP earned</p>
          <button onClick={close} className="btn btn-primary w-full max-w-xs mx-auto min-h-12 rounded-xl text-sm">Close</button>
        </div>
      </div>
    );
  }

  const seg = plan.segments[segIndex];

  let body = <MissingSegment />;
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
        />
      );
    }
  } else if (seg.id === 'retrieve') {
    body = <RecallRunner cardCap={seg.payload.cardCap} onDone={advance} onXp={award} onActivity={onActivity} />;
  } else if (seg.id === 'drill') {
    body = seg.payload.kind === 'retype'
      ? <NotebookRetype onXp={award} onCleared={advance} />
      : <DrillRunner concept={seg.payload.concept} level={level} apiKey={apiKey} mockMode={mockMode} onXp={award} onDone={advance} />;
  } else if (seg.id === 'review') {
    body = <DelayedReview count={seg.payload.count} onXp={award} onDone={advance} />;
  } else if (seg.id === 'listen' && seg.payload.track) {
    const track = allListeningTracks().find((t) => t.id === seg.payload.track.id);
    if (track) body = <TrackPlayer track={track} baseRate={ttsRate} level={level} onXp={onXp} onActivity={onActivity} onDone={advance} />;
  }

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Today's French">
      <header className="shrink-0 border-b border-line bg-surface px-4 py-2.5">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <span className="text-sm font-bold text-ink whitespace-nowrap">Aujourd'hui</span>
          <span className="text-[11px] text-ink3 tabular-nums">{plan.totalMinutes} min</span>
          <div className="flex-1 flex gap-1.5">
            {plan.segments.map((s, i) => (
              <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i < segIndex ? 'bg-success' : i === segIndex ? 'bg-ink animate-pulse' : 'bg-surface2'}`} />
            ))}
          </div>
          <button onClick={close} aria-label="End today's session" className="w-8 h-8 grid place-items-center rounded-full text-ink3 hover:text-ink"><X size={15} /></button>
        </div>
        <p className="max-w-lg mx-auto mt-1 text-[11px] text-ink3">{seg.why}</p>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto nice-scroll">{body}</div>
      {seg.id !== 'speak' && (
        <footer className="shrink-0 border-t border-line bg-surface px-4 py-3">
          <button onClick={advance} className="btn btn-secondary w-full max-w-lg mx-auto min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
            Skip <ChevronRight size={14} />
          </button>
        </footer>
      )}
    </div>
  );
}

function MissingSegment() {
  return (
    <div className="h-full grid place-items-center px-4">
      <p className="text-sm text-ink2">Nothing available for this segment — tap Skip.</p>
    </div>
  );
}

// Compact SRS recall: due cards, capped, rated through the real scheduler.
function RecallRunner({ cardCap, onDone, onXp, onActivity }) {
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

// Targeted micro-drill for the curriculum's weakest concept.
function DrillRunner({ concept, level, apiKey, mockMode, onXp, onDone }) {
  const [state, setState] = useState({ busy: true, exercises: null });
  useMemo(() => {
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
  if (state.busy) return <div className="h-full grid place-items-center"><p className="text-sm text-ink2">Building your drill…</p></div>;
  if (!state.exercises?.length) {
    return (
      <div className="h-full grid place-items-center px-4 space-y-3 text-center">
        <p className="text-sm text-ink2">Drill unavailable offline — skipped.</p>
        <button onClick={onDone} className="btn btn-secondary min-h-10 px-4 rounded-lg text-xs">Continue</button>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto">
        <Quiz exercises={state.exercises} onXp={onXp} footer={
          <button onClick={onDone} className="btn btn-primary w-full min-h-11 rounded-xl text-sm mt-3">Done drilling</button>
        } />
      </div>
    </div>
  );
}

// Delayed review: recent corrections replayed as retrieval prompts. A
// self-marked "said it right" feeds the mistake graph's mastery lifecycle.
function DelayedReview({ count, onXp, onDone }) {
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
      if (match) saveMistakeGraph(recordRetest(graph, { id: match.id, correct: remembered, context: 'delayed-review' }));
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
