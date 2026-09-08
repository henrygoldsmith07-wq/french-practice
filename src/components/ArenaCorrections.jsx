import { useState } from 'react';
import { Markdown, ScoreBadge, SpeakButton, Spinner } from './ui';
import Quiz from './Quiz';
import { ArrowRight, Book, Lightbulb } from './icons';
import { explainMistake, friendlyError, generateExercises } from '../lib/groq';
import { saveToNotebook } from '../lib/storage';
import { getGrammarTopic } from '../lib/grammar';

// The Arena's correction-side UI cluster: the learner's turn bubble with its
// tiered corrections, the redo comparison, the on-demand rule explanation and
// the mistake→learning-object chain (micro-drill / flashcard). Split out of
// ChatArena so the conversation controller stays readable; behaviour unchanged.

export function Avatar() {
  return (
    <span
      className="w-9 h-9 shrink-0 rounded-full bg-surface2 border border-line grid place-items-center mb-1 text-[10px] font-semibold tracking-widest text-ink2"
      aria-hidden="true"
    >
      FR
    </span>
  );
}

export function AiBubble({ text, translation, ttsRate }) {
  const [showTranslation, setShowTranslation] = useState(false);
  return (
    <div className="flex items-end gap-2 max-w-[88%] sm:max-w-[75%] bubble-in">
      <Avatar />
      <div className="bg-surface2 rounded-2xl rounded-bl-md px-4 py-3 space-y-2">
        <p className="text-[15px] text-ink leading-relaxed" lang="fr">{text}</p>
        {showTranslation && <p className="text-xs text-ink2 italic border-t border-line pt-2">{translation}</p>}
        <div className="flex items-center gap-2">
          <SpeakButton text={text} rate={ttsRate} label="Replay" />
          <button
            onClick={() => setShowTranslation((v) => !v)}
            className="text-[11px] text-ink2 hover:text-ink min-h-8 px-1"
          >
            {showTranslation ? 'Hide' : 'Translate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UserBubble({ turn, idx, redoActive, onRedo, onCancelRedo, onGrammarTip, apiKey, mockMode, level, correctionPolicy, onXp }) {
  const [expanded, setExpanded] = useState(false);
  const { evaluation } = turn;
  const feedbackOff = correctionPolicy?.preference === 'off';
  const redoHidden = redoActive && !expanded; // correction collapsed while redo active
  void redoHidden;
  return (
    <div className="flex flex-col items-end gap-1.5 bubble-in">
      <div className="flex items-end gap-2 max-w-[88%] sm:max-w-[75%]">
        <div className={`rounded-2xl rounded-br-md px-4 py-3 shadow-md shadow-black/15 ${turn.redo ? 'bg-ink text-bg' : 'bg-accent text-onaccent'}`}>
          <p className={`text-[15px] leading-relaxed ${turn.redo ? 'text-bg' : 'text-onaccent'}`} lang="fr">{turn.userText}</p>
        </div>
        <ScoreBadge value={evaluation.scores.overall} />
      </div>
      <div className="flex items-center gap-2">
        {turn.mode === 'fluency' ? (
          <span className="text-[11px] text-ink3 min-h-8 px-1 grid place-items-center">Feedback after the session</span>
        ) : !feedbackOff ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-ink2 hover:text-ink min-h-8 px-1"
          >
            {expanded ? 'Hide feedback' : correctionPolicy?.timing === 'delayed' ? 'Review saved feedback' : 'Corrections & native version'}
          </button>
        ) : <span className="text-[11px] text-ink3 min-h-8 px-1 grid place-items-center">Feedback off</span>}
        {turn.mode !== 'fluency' && !turn.redo && (
          redoActive ? (
            <button onClick={onCancelRedo} className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 min-h-8 px-2 rounded-lg bg-amber-50 border border-amber-200">Cancel redo</button>
          ) : (
            <button onClick={() => onRedo(idx)} className="text-[11px] font-semibold text-ink2 hover:text-ink min-h-8 px-2 rounded-lg border border-line bg-surface hover:border-ink3">Redo this turn →</button>
          )
        )}
      </div>
      {expanded && (
        <div className="w-full sm:max-w-[85%] fade-in bg-surface2 border border-line rounded-2xl p-4 space-y-3 text-left">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink2 mb-1">Corrections</h4>
            {evaluation.corrections_detailed?.length ? (
              <TieredCorrections detailed={evaluation.corrections_detailed} />
            ) : (
              <Markdown className="text-[13px] text-ink leading-relaxed">{evaluation.corrections}</Markdown>
            )}
            <ExplainRule turn={turn} apiKey={apiKey} mockMode={mockMode} level={level} />
            <MistakeActions turn={turn} apiKey={apiKey} mockMode={mockMode} level={level} onXp={onXp} />
          </div>          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink mb-1">Like a native</h4>
            <p className="text-[13px] text-ink italic" lang="fr">{evaluation.native_alternative}</p>
            <SpeakButton text={evaluation.native_alternative} slow label="Listen" />
          </div>
          {(() => {
            const tipTopic = getGrammarTopic(evaluation.grammar_topic);
            return tipTopic ? (
              <button
                onClick={() => onGrammarTip?.(tipTopic.id)}
                className="w-full flex items-center gap-2.5 bg-surface border border-line rounded-xl px-3.5 py-2.5 text-left hover:border-ink3 transition-colors"
              >
                <Book size={14} className="text-ink2 shrink-0" />
                <span className="flex-1 text-xs text-ink">
                  <span className="font-semibold">Grammar tip:</span> this looks like{' '}
                  <span lang="fr" className="font-semibold">{tipTopic.title}</span> — review the lesson
                </span>
                <ArrowRight size={13} className="text-ink3 shrink-0" />
              </button>
            ) : null;
          })()}
        </div>
      )}
      {redoActive && !expanded && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 w-full sm:max-w-[85%] text-left">
          Correction hidden — redo the turn from memory. Open feedback only after you retry.
        </p>
      )}
    </div>
  );
}

// Correction confidence tiers: definite errors lead, valid-but-less-natural
// forms are offered as suggestions, and "uncertain" items stay collapsed
// unless asked for — the anti-overcorrection rule made visible.
export const STRONG_LEVELS = new Set(['definite_error', 'likely_error']);
const SOFT_LEVELS = new Set(['stylistic_suggestion', 'acceptable_alternative']);
const LEVEL_LABEL = {
  definite_error: 'Error',
  likely_error: 'Likely error',
  stylistic_suggestion: 'More natural',
  acceptable_alternative: 'Also correct',
  uncertain: 'Not sure',
};

export function TieredCorrections({ detailed }) {
  const [showUncertain, setShowUncertain] = useState(false);
  const strong = detailed.filter((c) => STRONG_LEVELS.has(c.level));
  const soft = detailed.filter((c) => SOFT_LEVELS.has(c.level));
  const unsure = detailed.filter((c) => c.level === 'uncertain');
  const Row = ({ c, tone }) => (
    <li className="space-y-0.5">
      <p className="text-[13px] leading-relaxed">
        <span lang="fr" className={tone === 'strong' ? 'text-ink line-through decoration-ink3' : 'text-ink2'}>{c.original}</span>
        <span className="text-ink3 mx-1.5" aria-hidden="true">→</span>
        <span lang="fr" className={`font-semibold ${tone === 'strong' ? 'text-ink' : 'text-ink2'}`}>{c.correction}</span>
        <span className={`ml-2 align-middle text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
          tone === 'strong' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-line bg-surface text-ink3'
        }`}>{LEVEL_LABEL[c.level]}</span>
      </p>
      {c.note && <p className="text-[11px] text-ink3">{c.note}</p>}
    </li>
  );
  return (
    <div className="space-y-2">
      {strong.length > 0 && (
        <ul className="space-y-2">{strong.map((c, i) => <Row key={`s${i}`} c={c} tone="strong" />)}</ul>
      )}
      {soft.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink3 mb-1">Suggestions — your version already works</p>
          <ul className="space-y-2">{soft.map((c, i) => <Row key={`o${i}`} c={c} tone="soft" />)}</ul>
        </div>
      )}
      {unsure.length > 0 && (
        <div>
          <button onClick={() => setShowUncertain((v) => !v)} className="text-[11px] text-ink3 hover:text-ink2 min-h-8">
            {showUncertain ? 'Hide' : `Show ${unsure.length}`} the tutor wasn’t sure about
          </button>
          {showUncertain && (
            <ul className="space-y-2 pt-1">{unsure.map((c, i) => <Row key={`u${i}`} c={c} tone="soft" />)}</ul>
          )}
        </div>
      )}
      {strong.length === 0 && soft.length === 0 && unsure.length === 0 && (
        <p className="text-[13px] text-ink">No corrections — that landed cleanly.</p>
      )}
    </div>
  );
}

// The mistake→learning-object chain, made tangible on the correction itself:
// micro-drill the exact weak structure now, or park it as an SRS flashcard
// the review queue will resurface. Notebook capture is automatic; these are
// the learner-controlled extensions of the same chain.
export function MistakeActions({ turn, apiKey, mockMode, level, onXp }) {
  const { evaluation } = turn;
  const [drill, setDrill] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const strong = (evaluation.corrections_detailed || []).find((c) => STRONG_LEVELS.has(c.level));
  const topicId = evaluation.grammar_topic || null;
  const topicTitle = topicId ? (getGrammarTopic(topicId)?.title || topicId) : '';

  const runDrill = async () => {
    setBusy(true);
    try {
      const { exercises } = await generateExercises(apiKey, {
        topic: topicTitle || strong?.correction || evaluation.corrections?.slice(0, 80) || 'sentence correction',
        level,
        mock: mockMode,
      });
      setDrill(exercises || []);
    } catch {
      setDrill([]); // generator unavailable — show nothing rather than break
    }
    setBusy(false);
  };

  const saveFlashcard = () => {
    // Stable content id: re-saving the same mistake dedupes in the notebook.
    let h = 0;
    for (const ch of turn.userText) h = (h * 31 + ch.charCodeAt(0)) | 0;
    saveToNotebook({
      id: `mistake-${Math.abs(h).toString(36)}`,
      fr: `Corrige : «${turn.userText}»`,
      en: evaluation.native_alternative || strong?.correction || evaluation.native_alternative || '',
      note: topicTitle || 'correction',
    });
    setSaved(true);
  };

  if (!strong && !topicId) return null;
  return (
    <div className="pt-1 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={runDrill}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink2 hover:text-ink min-h-8 px-2 rounded-lg border border-line bg-surface hover:border-ink3"
        >
          <Lightbulb size={12} /> {busy ? 'Building…' : 'Micro-drill this'}
        </button>
        <button
          onClick={saveFlashcard}
          disabled={saved}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink2 hover:text-ink min-h-8 px-2 rounded-lg border border-line bg-surface hover:border-ink3 disabled:opacity-60"
        >
          <Book size={12} /> {saved ? 'In review queue ✓' : 'Add as flashcard'}
        </button>
      </div>
      {drill && (drill.length
        ? <Quiz exercises={drill} onXp={onXp} />
        : <p className="text-[11px] text-ink3">Drill unavailable right now — the flashcard keeps the mistake alive either way.</p>
      )}
    </div>
  );
}

export function RedoCompare({ redo, before, idx }) {
  const sign = (n) => (n > 0 ? `+${n}` : String(n));
  const tone = redo.deltaOverall > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : redo.deltaOverall < 0 ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-ink2 bg-surface2 border-line';
  return (
    <div className={`fade-in rounded-2xl border px-4 py-3 space-y-2 text-left sm:max-w-[85%] ml-auto w-full ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-bold uppercase tracking-wider">Redo — turn {idx + 1}</h4>
        <span className={`text-xs font-black tabular-nums ${redo.deltaOverall > 0 ? 'text-emerald-700' : redo.deltaOverall < 0 ? 'text-amber-700' : 'text-ink2'}`}>{sign(redo.deltaOverall)} overall</span>
      </div>
      <p className="text-xs leading-relaxed"><span className="font-semibold">Retry:</span> <span lang="fr">“{redo.retryText}”</span></p>
      <p className="text-xs leading-relaxed italic">{redo.verdict}{redo.note ? ` — ${redo.note}` : ''}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {Object.entries(redo.deltas).map(([k, v]) => (
          <span key={k} className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${v > 0 ? 'bg-emerald-100 border-emerald-200 text-emerald-800' : v < 0 ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-surface border-line text-ink3'}`}>
            {k} {sign(v)}
          </span>
        ))}
      </div>
      <div className="flex gap-2 text-[11px] text-ink2">
        <span>Before {before.overall}</span><span aria-hidden="true">→</span><span className="font-bold text-ink">Retry {redo.evaluation.scores.overall}</span>
      </div>
    </div>
  );
}

// On-demand deep dive: asks the LLM to explain the underlying rule behind
// this turn's corrections, in plain English with an extra example.
export function ExplainRule({ turn, apiKey, mockMode, level }) {
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setExplanation(await explainMistake(apiKey, {
        userText: turn.userText,
        corrections: turn.evaluation.corrections,
        level,
        mock: mockMode,
      }));
    } catch (e) {
      setError(friendlyError(e));
    }
    setBusy(false);
  };

  if (explanation) {
    return (
      <div className="fade-in mt-2 bg-surface border border-line rounded-xl px-3.5 py-2.5">
        <h5 className="text-[10px] font-bold uppercase tracking-wider text-ink3 mb-1">The rule behind it</h5>
        <Markdown className="text-xs text-ink leading-relaxed">{explanation}</Markdown>
      </div>
    );
  }
  if (busy) return <div className="mt-2"><Spinner label="Digging into the rule…" /></div>;
  return (
    <div className="mt-1.5">
      <button onClick={run} className="flex items-center gap-1.5 text-[11px] font-semibold text-ink2 hover:text-ink min-h-8">
        <Lightbulb size={13} /> Why? Explain the rule
      </button>
      {error && <p role="alert" className="text-xs text-ink">{error}</p>}
    </div>
  );
}
