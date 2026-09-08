import { useEffect, useRef, useState } from 'react';
import { langName } from '../lib/i18n';
import useRecorder from '../hooks/useRecorder';
import Waveform from './Waveform';
import { getScenarios } from '../lib/data';
import { transcribe, evaluateTurn, evaluateRedoTurn, getHint, friendlyError, fluencyReview } from '../lib/groq';
import { scoreDelta, redoVerdict } from '../lib/redo';
import { speechMetrics } from '../lib/analytics';
import { activeLanguage } from '../lib/i18n';
import {
  getSrs, getSessions, getMetrics, getReviewEvents, getGrammarProgress, getEvidenceLedgerModel,
  getSettings, recordGrammarError, recordWeaknessError, recordWeaknessRepair, getDueWeaknesses, getLearnerBrief,
  recordAssistanceEvent,
} from '../lib/storage';
import { recordMistake, typeForCategory, mistakeId as graphIdFor } from '../lib/mistakeGraph';
import { saveMistakeGraph, getMistakeGraph } from '../lib/storage';
import { categoryForTopic } from '../lib/errorTaxonomy';
import { allEntries } from '../lib/vocab';
import { GRAMMAR_TOPICS } from '../lib/grammar';
import { buildLearningPlan } from '../lib/learningAdaptation';
import { SpeakButton, RateSlider, Spinner } from './ui';
import { speak, stopSpeaking } from '../lib/tts';
import { ArrowRight, Lightbulb, Mic, Square, scenarioIcon } from './icons';
import ScenarioPicker from './ScenarioPicker';
import FluencyDebrief from './FluencyDebrief';
import { Avatar, AiBubble, UserBubble, RedoCompare, STRONG_LEVELS } from './ArenaCorrections';

const CURVEBALL_TURN = 3; // the surprise lands on the learner's 3rd turn

// Conversation modes:
//   coach    â€” per-turn corrections, hints, redo (the classic Arena loop)
//   fluency  â€” no interruptions during the conversation; one debrief after,
//              surfacing only the highest-value 2â€“3 corrections
const CONVERSATION_MODES = ['coach', 'fluency'];
const MODE_KEY = 'fp.conversationMode';
function readConversationMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return CONVERSATION_MODES.includes(v) ? v : 'coach';
  } catch { return 'coach'; }
}

function readSessionBudget() {
  try {
    const m = +sessionStorage.getItem('fp.sessionMins');
    if (m === 5 || m === 10 || m === 15 || m === 16 || m === 20) return m * 60;
  } catch { /* ignore */ }
  return null;
}

export default function ChatArena({ apiKey, mockMode, ttsRate, level, onTtsRate, onTurn, onGrammarTip, onXp, history, setHistory, scenario, setScenario, onEndSession, conversationMode: conversationModeProp, onConversationMode, showEndButton = false }) {
  const [phase, setPhase] = useState('idle'); // idle | transcribing | editing | thinking
  const [draft, setDraft] = useState(''); // transcription editor / manual text
  const [spoken, setSpoken] = useState(null); // delivery coaching for a voice turn
  // Controlled from App when it passes a mode; TodaySession uses the local
  // default (coach — the daily session keeps per-turn corrections).
  const [localMode, setLocalMode] = useState(readConversationMode);
  const conversationMode = conversationModeProp || localMode;
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [hint, setHint] = useState('');
  const [hintLoading, setHintLoading] = useState(false);
  const [error, setError] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(readSessionBudget);
  // Active redo: idx of the turn being retried. While set, the correction
  // for that turn is hidden so the learner must recall it.
  const [redoIdx, setRedoIdx] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [weaknessDue, setWeaknessDue] = useState(() => getDueWeaknesses()[0] || null);
  const isFluency = conversationMode === 'fluency';
  const setMode = (mode) => {
    setLocalMode(mode);
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
    onConversationMode?.(mode);
    // Switching mode restarts the conversation: corrections only make sense
    // if the policy was consistent for every turn.
    if (history.length) { setHistory([]); }
    setRedoIdx(null);
    setHint('');
    setHintLevel(0);
    setPhase('idle');
  };
  const scrollRef = useRef(null);
  // Assistance-fading evidence: how many hints the learner burned on the turn
  // in flight. Recorded with the turn's score once the evaluation lands.
  const hintsUsedRef = useRef(0);
  // In-flight guard: bumped on scenario switch/unmount so a slow LLM response
  // for the old conversation can never land in (or speak over) the new one.
  const flightRef = useRef(0);
  const hintSeqRef = useRef(0);

  // Leaving the Arena must silence the partner mid-sentence.
  useEffect(() => () => stopSpeaking(), []);

  // Honour Home's 5/10/15 min presets: countdown only, never auto-sends speech.
  useEffect(() => {
    if (secondsLeft == null) return undefined;
    if (secondsLeft <= 0) {
      try { sessionStorage.removeItem('fp.sessionMins'); } catch { /* ignore */ }
      onEndSession?.();
      return undefined;
    }
    const id = setInterval(() => setSecondsLeft((s) => (s == null ? s : s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft, onEndSession]);

  const recorder = useRecorder({
    onComplete: async (blob, durationMs, acoustic = {}) => {
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]); // haptic: stopped
      setPhase('transcribing');
      setError(null);
      try {
        const text = await transcribe(apiKey, blob, { mock: mockMode });
        setDraft(text);
        // Coach on delivery from the raw spoken transcript, before any edits.
        const m = speechMetrics(text, durationMs, activeLanguage().id);
        const delivery = { ...m, pauseCount: acoustic.pauseCount || 0, longestPauseMs: acoustic.longestPauseMs || 0 };
        setSpoken(
          delivery.fillers > 0 || delivery.pace === 'fast' || delivery.pauseCount >= 2 || delivery.longestPauseMs > 1800
            ? delivery
            : null
        );
        setPhase('editing'); // review/edit before it goes to the LLM
      } catch (e) {
        setError(friendlyError(e));
        setPhase('idle');
      }
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [history, phase]);

  const [reversed, setReversed] = useState(false);

  // Mic-failure fallback line: the partner's latest message, else the opener.
  // Speech failure always falls back to tap-to-listen + typing â€” never a dead
  // mic screen.
  const fallbackListenText = (() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const reply = history[i]?.evaluation?.reply;
      if (typeof reply === 'string' && reply.trim()) return reply;
    }
    return scenario.opener;
  })();

  const changeScenario = (id) => {
    const s = getScenarios().find((x) => x.id === id);
    if (!s) return;
    flightRef.current += 1; // orphan any in-flight turn/hint from the old chat
    hintSeqRef.current += 1;
    stopSpeaking();
    setScenario(s);
    setHistory([]);
    setHint('');
    setHintLevel(0);
    setError(null);
    setPhase('idle');
    setRedoIdx(null);
    setPickerOpen(false);
    // If this scenario targets a due weakness, count it as a deliberate retest attempt
    const due = weaknessDue;
    if (due && due.topicId) {
      // Mark the retest as started; outcome is recorded on next error/repair
      try { window.dispatchEvent(new CustomEvent('fp:retest-start', { detail: { topicId: due.topicId, scenarioId: id } })); } catch { /* ignore */ }
    }
    setWeaknessDue(getDueWeaknesses()[0] || null);
  };

  const send = async (text) => {
    const userText = text.trim();
    if (!userText || phase === 'thinking') return;
    const flight = ++flightRef.current;
    const stale = () => flightRef.current !== flight;
    // Redo path: re-evaluate the same turn with correction hidden
    if (redoIdx != null) {
      const idx = redoIdx;
      const original = history[idx];
      if (!original) { setRedoIdx(null); return; }
      setDraft('');
      setSpoken(null);
      setPhase('thinking');
      setError(null);
      try {
        const redoEval = await evaluateRedoTurn(apiKey, {
          scenario,
          historyBefore: history.slice(0, idx),
          originalText: original.userText,
          retryText: userText,
          level,
          mock: mockMode,
        });
        if (stale()) return;
        if (redoEval.grammar_topic) {
          recordGrammarError(redoEval.grammar_topic);
          recordWeaknessError(redoEval.grammar_topic, { scenarioId: scenario.id });
        }
        // Repair signal: successful redo counts as evidence the learner recovered the form
        if (original.evaluation?.grammar_topic) {
          const improved = (redoEval.scores?.overall ?? 0) > (original.evaluation.scores?.overall ?? 0);
          if (improved) recordWeaknessRepair(original.evaluation.grammar_topic, { scenarioId: scenario.id, passed: true });
        }
        const { deltas, deltaOverall } = scoreDelta(original.evaluation.scores, redoEval.scores);
        const verdict = redoVerdict(deltaOverall);
        const redo = { retryText: userText, evaluation: redoEval, deltas, deltaOverall, verdict, note: redoEval.redo_note };
        setHistory((h) => h.map((t, i) => (i === idx ? { ...t, redo } : t)));
        onTurn(redoEval.scores);
        speak(redoEval.reply, { rate: ttsRate });
      } catch (e) {
        if (stale()) return;
        setError(friendlyError(e));
        setDraft(userText);
        setPhase('editing');
        return;
      }
      setRedoIdx(null);
      setPhase('idle');
      return;
    }
    setDraft('');
    setSpoken(null);
    setHint('');
    setHintLevel(0);
    hintsUsedRef.current = 0;
    setPhase('thinking');
    setError(null);
    const turnNumber = history.length + 1;
    try {
      const learner = getLearnerBrief();
      const learningPlan = buildLearningPlan({
        level,
        entries: allEntries(),
        srs: getSrs(),
        sessions: getSessions(),
        metrics: getMetrics(),
        reviewEvents: getReviewEvents(),
        grammarTopics: GRAMMAR_TOPICS,
        grammarProgress: getGrammarProgress(),
        errorModel: getEvidenceLedgerModel(),
        correctionFrequency: getSettings().correctionFrequency,
        confidence: learner.errorQueue?.length ? 0.45 : 0.55,
        userRate: ttsRate,
        userText,
      });
      const evaluation = await evaluateTurn(apiKey, {
        scenario,
        history,
        userText,
        curveball: turnNumber === CURVEBALL_TURN ? scenario.curveball : null,
        level,
        knownWords: learningPlan.input.knownWords,
        learningPlan,
        reversed,
        learner,
        mock: mockMode,
      });
      if (stale()) return; // scenario switched mid-flight â€” discard, don't append
      if (evaluation.grammar_topic) recordWeaknessError(evaluation.grammar_topic, { scenarioId: scenario.id });
      if (evaluation.grammar_topic) recordGrammarError(evaluation.grammar_topic);
      // Permanent learning object: definite/likely errors become notebook
      // entries automatically â€” retype drill now, recurrence tracking forever.
      // Stylistic suggestions are advice, not mistakes; they don't get kept.
      try {
        const strong = (evaluation.corrections_detailed || []).find((c) => STRONG_LEVELS.has(c.level));
        if (strong && conversationMode !== 'fluency') {
          // Permanent learning object: definite/likely errors become notebook
          // entries automatically â€” retype drill now, recurrence tracking
          // forever. In fluency mode this happens once, after the session
          // (the debrief records only the highest-value mistakes).
          // Structural mistake graph: concept + type + mastery lifecycle.
          // (ASR-uncertainty lives at the transcription layer; a typed or
          // edited send is by definition what the learner meant to say.)
          const category = categoryForTopic(evaluation.grammar_topic || '');
          const type = typeForCategory(category);
          const graphNodeId = graphIdFor({ type, concept: evaluation.grammar_topic || 'unknown' });
          // Mutate-then-save: the graph must be written AFTER recordMistake.
          const graph = getMistakeGraph();
          recordMistake(graph, {
            type,
            concept: evaluation.grammar_topic || 'unknown',
            source: 'conversation',
            attempt: userText,
            corrected: evaluation.native_alternative || strong.correction,
            confidence: 0.5,
            asrUncertain: false,
            related: [evaluation.grammar_topic].filter(Boolean),
          });
          saveMistakeGraph(graph);
          addErrorNotebook({
            original: userText,
            corrected: evaluation.native_alternative || strong.correction,
            why: strong.note || strong.correction,
            ruleId: evaluation.grammar_topic || null,
            mistakeId: graphNodeId,
          });
        }
      } catch { /* notebook must never break a turn */ }
      // Assistance-fading evidence: did this score happen with scaffolding or
      // without? Feeds the dependence check in assistanceValidation.
      try {
        recordAssistanceEvent({
          skill: 'speaking',
          support: hintsUsedRef.current > 0 ? 'with' : 'without',
          score: evaluation.scores.overall,
          hintsUsed: hintsUsedRef.current,
          retries: 0,
          taskId: scenario.id,
        });
      } catch { /* logging must never break a turn */ }
      // Speaking corpus seed: store the AI side of this turn so a human rater
      // can pair their mark against it later (updateCorpusHumanMark, then a
      // second rater via updateCorpusSecondMark). Never fabricates the human
      // half â€” the entry waits as AI-only until raters add theirs.
      try {
        recordCorpusEntry({
          mode: 'speaking',
          prompt: scenario.title || scenario.id,
          response: userText,
          aiScore: evaluation.scores.overall,
          aiCorrections: evaluation.corrections || null,
          criterion: 'communication',
        });
      } catch { /* corpus logging must never break a turn */ }
      const turn = {
        userText,
        evaluation,
        reply: evaluation.reply,
        curveball: turnNumber === CURVEBALL_TURN,
        mode: conversationMode,
        correctionPolicy: isFluency
          ? { ...learningPlan.correction, preference: 'off', timing: 'end-of-session' }
          : learningPlan.correction,
        learningSnapshot: {
          targetLevel: learningPlan.progression.targetLevel,
          listeningStage: learningPlan.listening.stage,
          newWords: learningPlan.input.newWords,
          speechRate: learningPlan.speech.rate,
        },
      };
      setHistory((h) => [...h, turn]);
      onTurn(evaluation.scores);
      speak(evaluation.reply, { rate: learningPlan.speech.rate });
    } catch (e) {
      if (stale()) return;
      setError(friendlyError(e));
      setDraft(userText); // don't lose their words
      setPhase('editing');
      return;
    }
    if (!stale()) setPhase('idle');
  };

  const askHint = async () => {
    const seq = ++hintSeqRef.current;
    const depth = Math.min(3, hintLevel + 1);
    setHintLoading(true);
    setHintLevel(depth);
    hintsUsedRef.current = depth;
    try {
      const lastAiReply = history.length ? history[history.length - 1].reply : scenario.opener;
      const h = await getHint(apiKey, { scenario, lastAiReply, level: depth, cefr: level, mock: mockMode });
      if (hintSeqRef.current !== seq) return; // a newer hint (or scenario switch) superseded this one
      setHint(h);
    } catch {
      if (hintSeqRef.current !== seq) return;
      setHint(scenario.staticHints[depth - 1]); // offline fallback
    }
    if (hintSeqRef.current === seq) setHintLoading(false);
  };

  const busy = phase === 'transcribing' || phase === 'thinking';

  return (
    <div className="flex flex-col h-full">
      {/* scenario card rail */}
      <div className="border-b border-line bg-surface px-3 pt-2.5 pb-2 space-y-1.5">
        <div className="snap-rail flex gap-2 overflow-x-auto" role="group" aria-label="Choose a scenario">
          {getScenarios().map((s) => {
            const active = s.id === scenario.id;
            const ScenarioIcon = scenarioIcon(s.id);
            return (
              <button
                key={s.id}
                onClick={() => changeScenario(s.id)}
                aria-pressed={active}
                className={`shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                  active
                    ? 'border-ink bg-surface shadow-sm'
                    : 'border-line bg-surface hover:border-ink3'
                }`}
              >
                <ScenarioIcon size={16} className={active ? 'text-ink' : 'text-ink3'} />
                <span className={`text-xs font-semibold whitespace-nowrap ${active ? 'text-ink' : 'text-ink2'}`}>
                  {s.title}
                </span>
              </button>
            );
          })}
          <button onClick={() => setPickerOpen(true)} className="shrink-0 px-3.5 py-2.5 rounded-xl border border-dashed border-line bg-surface text-xs font-semibold text-ink2 hover:border-ink3 hover:text-ink whitespace-nowrap">Browse all {getScenarios().length} â†’</button>
        </div>
        <ScenarioPicker open={pickerOpen} activeId={scenario.id} onPick={changeScenario} onClose={() => setPickerOpen(false)} />
        {/* Conversation mode: Coach corrects per turn; Fluency stays silent
            until the end-of-session debrief. */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Conversation mode">
          {['coach', 'fluency'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={conversationMode === m}
              title={m === 'coach'
                ? 'Corrections on every turn, hints, redo'
                : 'No interruptions â€” full debrief when you finish'}
              className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                conversationMode === m
                  ? 'border-ink bg-surface2 text-ink'
                  : 'border-line text-ink3 hover:text-ink2'
              }`}
            >
              {m === 'coach' ? 'ðŸŽ¯ Coach' : 'ðŸŒŠ Fluency'}
            </button>
          ))}
          <span className="text-[10px] text-ink3 hidden sm:inline">
            {isFluency ? 'Keep talking â€” corrections come at the end.' : 'Corrections each turn.'}
          </span>
        </div>
        {weaknessDue && !isFluency && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center justify-between gap-2" role="status">
            <span className="text-xs text-ink"><span className="font-bold">Retest due:</span> {(() => { const t = getGrammarTopic(weaknessDue.topicId); return t ? t.title : weaknessDue.topicId; })()} â€” last slip {Math.max(1, Math.round((Date.now() - new Date(weaknessDue.lastErrorAt).getTime())/86400000))}d ago. Practise it again?</span>
            <button onClick={() => changeScenario(scenario.id)} className="shrink-0 text-xs font-semibold text-amber-800 underline">Keep this scenario</button>
          </div>
        )}
        <div className="flex items-center justify-between pr-1 gap-2">
          <button
            onClick={() => { setReversed((v) => !v); setHistory([]); setHint(''); setHintLevel(0); setPhase('idle'); }}
            aria-pressed={reversed}
            title="Swap roles: you play the professional, the AI plays the customer"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${
              reversed ? 'border-ink bg-surface2 text-ink' : 'border-line text-ink3 hover:text-ink2'
            }`}
          >
            ðŸ”„ {reversed ? 'Roles swapped â€” you serve' : 'Swap roles'}
          </button>
          <div className="flex items-center gap-2">
            {secondsLeft != null && (
              <span
                className={`tabular-nums text-[11px] font-bold px-2 py-1 rounded-lg border ${
                  secondsLeft <= 60 ? 'border-ink text-ink bg-surface2' : 'border-line text-ink3'
                }`}
                title="Session timer from Home preset"
                aria-live="polite"
              >
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
            )}
            {showEndButton && history.length > 0 && (
              <button
                onClick={() => onEndSession?.()}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-ink text-ink bg-surface2 whitespace-nowrap"
                title="Finish this conversation and see the report"
              >
                End Session
              </button>
            )}
            <RateSlider rate={ttsRate} onChange={onTtsRate} />
          </div>
        </div>
      </div>

      {/* transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto nice-scroll px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-center text-[11px] text-ink3 max-w-sm mx-auto">{scenario.setup}</p>
        <AiBubble text={scenario.opener} translation={scenario.openerTranslation} ttsRate={ttsRate} />
        {redoIdx != null && history[redoIdx] && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-ink" role="status">
            <span className="font-bold">Redo mode</span> â€” correction hidden. Recall the fix from memory, then re-speak or re-type the same turn. Weâ€™ll compare the two attempts.
          </div>
        )}
        {history.map((turn, i) => (
          <div key={i} className="space-y-4">
            <UserBubble
              turn={turn}
              idx={i}
              redoActive={redoIdx === i}
              onRedo={(idx) => { setRedoIdx(idx); setDraft(''); setSpoken(null); setError(null); setPhase('idle'); }}
              onCancelRedo={() => setRedoIdx(null)}
              onGrammarTip={onGrammarTip}
              apiKey={apiKey}
              mockMode={mockMode}
              level={level}
              correctionPolicy={turn.correctionPolicy}
              onXp={onXp}
            />
            {turn.curveball && (
              <p className="text-center text-[11px] text-ink/90 font-semibold tracking-wide uppercase">
                Curveball
              </p>
            )}
            <AiBubble text={turn.evaluation.reply} translation={turn.evaluation.translation} ttsRate={ttsRate} />
            {turn.redo && <RedoCompare redo={turn.redo} before={turn.evaluation.scores} idx={i} />}
          </div>
        ))}
        {phase === 'thinking' && (
          <div className="flex items-end gap-2 bubble-in" aria-label="Your partner is typingâ€¦">
            <Avatar />
            <div className="bg-surface2 rounded-2xl rounded-bl-md px-4 py-3.5 flex gap-1.5">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-ink bg-surface2 border border-line rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        </div>
      </div>

      {/* hint strip */}
      {(hint || hintLoading) && !isFluency && (
        <div className="mx-4 sm:max-w-2xl sm:mx-auto sm:w-full mb-2 fade-in rounded-xl bg-surface2 border border-line px-3 py-2">
          {hintLoading
            ? <Spinner label={`Hint ${hintLevel}/3â€¦`} />
            : <p className="text-xs text-ink2"><span className="font-bold">Hint {hintLevel}/3:</span> {hint}</p>}
        </div>
      )}

      {/* composer */}
      <div className="border-t border-line bg-surface px-4 pt-3 pb-safe">
        <div className="max-w-2xl mx-auto">
        {redoIdx != null && phase === 'idle' && !recorder.recording && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
            <span className="text-xs text-ink"><span className="font-bold">Retrying turn {redoIdx + 1}</span> â€” say it again without peeking.</span>
            <button onClick={() => setRedoIdx(null)} className="text-xs font-semibold text-ink2 hover:text-ink min-h-8 px-2">Cancel redo</button>
          </div>
        )}
        {recorder.recording ? (
          <div className="space-y-2">
            <Waveform analyserRef={recorder.analyserRef} peakDb={recorder.peakDb} elapsed={recorder.elapsed} />
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={recorder.cancel}
                className="min-h-11 px-4 rounded-xl text-sm text-ink2 hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={recorder.stop}
                aria-label="Stop and send"
                className="rec-pulse w-16 h-16 rounded-full bg-accent text-onaccent text-2xl grid place-items-center active:scale-90 transition"
              >
                <Square size={20} />
              </button>
              <span className="text-[11px] text-ink3 w-20">3.5 s of silence auto-sends</span>
            </div>
          </div>
        ) : phase === 'editing' ? (
          <div className="space-y-2 fade-in">
            <p className="text-[11px] text-ink2 font-medium">Check your transcription before sending:</p>
            {spoken && (
              <p className="text-[11px] text-review bg-reviewsoft rounded-lg px-2.5 py-1.5" role="status">
                {spoken.fillers > 0
                  ? <>Coach: you hesitated on Â«{spoken.fillerWords.join('Â», Â«')}Â» â€” try to land the phrase in one breath.</>
                  : spoken.longestPauseMs > 1800
                    ? <>Coach: a {(spoken.longestPauseMs / 1000).toFixed(1)}s pause mid-answer â€” bridge with Â«et puisâ€¦Â» while you think.</>
                    : <>Coach: that came out fast ({spoken.wpm} wpm) â€” a slightly slower pace reads clearer.</>}
              </p>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              className="w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ink resize-none"
              aria-label="Transcription to review"
            />
            <div className="flex gap-2">
              <button onClick={() => { setDraft(''); setSpoken(null); setPhase('idle'); }} className="min-h-11 px-4 rounded-xl text-sm text-ink2 hover:text-ink">
                Redo
              </button>
              <button
                onClick={() => send(draft)}
                disabled={!draft.trim()}
                className="btn btn-primary flex-1 min-h-11 rounded-xl text-sm"
              >
                Send <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            {!isFluency && (
              <button
                onClick={askHint}
                disabled={busy || hintLevel >= 3}
                className="btn btn-secondary min-h-11 px-3 rounded-xl text-xs whitespace-nowrap"
              >
                <Lightbulb size={14} /> {hintLevel === 0 ? 'Hint' : `Hint ${Math.min(3, hintLevel + 1)}/3`}
              </button>
            )}
            <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 ${redoIdx != null ? 'bg-amber-50 border-amber-300 focus-within:border-amber-400' : 'bg-surface2 border-line focus-within:border-ink'}`}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(draft)}
                placeholder={busy ? 'â€¦' : redoIdx != null ? `Redo turn ${redoIdx + 1} â€” type your improved ${langName()}â€¦` : `Or type in ${langName()}â€¦`}
                disabled={busy}
                className="flex-1 bg-transparent py-3 text-sm text-ink placeholder:text-ink3 focus:outline-none"
                aria-label={redoIdx != null ? 'Retry reply' : 'Typed reply'}
              />
              {draft.trim() && (
                <button onClick={() => send(draft)} disabled={busy} aria-label={redoIdx != null ? 'Send retry' : 'Send'} className="text-ink px-1 min-h-11 grid place-items-center"><ArrowRight size={16} /></button>
              )}
            </div>
            <button
              onClick={recorder.start}
              disabled={busy}
              aria-label="Record my reply"
              className="btn btn-primary w-14 h-14 rounded-full"
            >
              {phase === 'transcribing' ? <span className="w-5 h-5 rounded-full border-2 border-onaccent border-t-transparent animate-spin" /> : <Mic size={22} />}
            </button>
          </div>
        )}

        {recorder.error && (
          <div role="alert" className="mt-2 rounded-xl border border-line bg-surface2 px-3 py-2.5 space-y-1.5">
            <p className="text-[11px] text-ink">{recorder.error} No problem — listen below and type your reply instead.</p>
            <div className="flex flex-wrap items-center gap-2">
              <SpeakButton text={fallbackListenText} rate={ttsRate} label="Tap to listen" />
              <button
                type="button"
                onClick={() => recorder.start()}
                className="min-h-9 px-3 rounded-lg text-xs font-semibold text-ink2 hover:text-ink border border-line"
              >
                Try microphone again
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
