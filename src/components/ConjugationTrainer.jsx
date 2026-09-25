import { useEffect, useMemo, useRef, useState } from 'react';
import { poolForLevel, makePrompt, checkForm, spokenSentence, tenseLabel, trainerVerbs, focusedPool } from '../lib/conjugationTrainer';
import { PERSONS } from '../lib/reference';
import { recordLearnerError, recordLearnerSuccess } from '../lib/storage';
import { currentSessionId, newEncounterId } from '../lib/evidenceIdentity';
import { SpeakButton } from './ui';
import { Check, RefreshCw, Flame, ChevronRight, BookOpen, X } from './icons';

// Conjugation trainer: the app had conjugations as read-only reference; this
// turns them into a typed drill. Prompts are drawn from the CEFR pool, graded
// accent-exactly (parlé vs parle IS the lesson), and misses feed the
// learner-error model so other modes can resurface the weak forms.

const LEVELS = ['A1', 'A2', 'B1', 'B2'];

export default function ConjugationTrainer({ onXp, focus = null, onDone = null, onUnavailable = null }) {
  const focusKey = focus ? `${focus.verb || ''}:${focus.tense || ''}` : '';
  // focus identity churns every render upstream; focusKey is the stable shape.
  // The memo re-runs when the shape changes and reads the latest focus via ref.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const [level, setLevel] = useState('B1');
  const pool = useMemo(() => {
    void focusKey; // the shape change is what re-runs this memo
    return focusRef.current ? focusedPool(focusRef.current) : poolForLevel(level);
  }, [level, focusKey]);
  const [prompt, setPrompt] = useState(() => (focus ? makePrompt(focusedPool(focus), { personIndex: focus.personIndex ?? null }) : makePrompt(poolForLevel('B1'))));
  // Focused mode may be one producer inside Today's fallback chain. An
  // unpromptable target is producer unavailability, not learner completion:
  // let the parent walk to its next fallback when it supplied one.
  useEffect(() => {
    if (focus && !pool) (onUnavailable || onDone)?.();
  }, [focus, pool, onDone, onUnavailable]);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null); // { status, answer, xp }
  // Evidence identity: each PROMPT is one encounter. The ref is replaced when
  // a new prompt is drawn (next prompt ⇒ new encounter) but reused while the
  // learner retries that same prompt (submit after a wrong attempt keeps the
  // same id, so a grind can never fabricate independent passes).
  const encounterRef = useRef(newEncounterId());
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [peeked, setPeeked] = useState(false);

  const nextPrompt = (prevKey) => {
    setPrompt(makePrompt(pool, { avoid: prevKey }));
    // New prompt ⇒ new encounter: evidence from the next drill question can
    // be counted as genuinely independent by the recovery model.
    encounterRef.current = newEncounterId();
    setInput('');
    setResult(null);
    setPeeked(false);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!prompt || result) return;
    const status = checkForm(input, prompt.answer);
    const correct = status === 'correct';
    const near = status === 'near';
    // Peek before answering caps the reward: the table is a reference, not a crib.
    const gained = correct ? (peeked ? 1 : 3 + Math.min(streak, 4)) : near ? 1 : 0;
    const nextStreak = correct ? streak + 1 : 0;
    setStreak(nextStreak);
    setBest((b) => Math.max(b, nextStreak));
    if (gained) onXp(gained);
    if (correct) {
      recordLearnerSuccess({
        category: 'grammar',
        key: `conjugation:${prompt.key}`,
        label: `${prompt.inf} · ${prompt.tense} · ${prompt.person}`,
        mode: 'conjugation-trainer',
        score: 100,
        source: 'conjugation-trainer',
        sessionId: currentSessionId(),
        encounterId: encounterRef.current,
        activityId: prompt.key,
      });
    } else if (!near) {
      recordLearnerError({
        category: 'grammar',
        key: `conjugation:${prompt.key}`,
        label: `${prompt.inf} · ${prompt.tense} · ${prompt.person} → ${prompt.answer}`,
        mode: 'conjugation-trainer',
        score: 0,
        source: 'conjugation-trainer',
        detail: `Typed “${input.trim() || '—'}”, expected “${prompt.answer}”`,
        sessionId: currentSessionId(),
        encounterId: encounterRef.current,
        activityId: prompt.key,
      });
    }
    setResult({ status, answer: prompt.answer, gained });
  };

  return (
    <div className="space-y-4">
      {!focus && <LevelPicker level={level} onChange={(l) => { setLevel(l); const p = makePrompt(poolForLevel(l)); setPrompt(p); setInput(''); setResult(null); setPeeked(false); setStreak(0); encounterRef.current = newEncounterId(); }} />}

      {prompt ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="bg-surface border border-line rounded-2xl p-5 space-y-2" data-testid="conj-prompt" data-answer={prompt.answer}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">{prompt.tense}</p>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink2" aria-label={`Streak ${streak}`}>
                <Flame size={12} /> {streak}{best > 1 && <span className="text-ink3 font-normal">· best {best}</span>}
              </div>
            </div>
            <p className="text-[17px] text-ink font-medium" lang="fr">
              <span className="text-ink3">{prompt.person}</span> <span className="italic">{prompt.inf}</span>
            </p>
            <p className="text-xs text-ink3 italic">{prompt.en}</p>
            <div className="flex items-center gap-1.5">
              <SpeakButton text={spokenSentence(prompt)} label="Hear it" />
              <SpeakButton text={spokenSentence(prompt)} slow label="Slow" />
            </div>
          </div>

          {!result ? (
            <div className="space-y-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                lang="fr"
                autoFocus
                placeholder={`${prompt.person} …`}
                aria-label="Type the conjugated form"
                className="w-full bg-surface border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink"
              />
              <button type="submit" disabled={!input.trim()} className="btn btn-primary w-full min-h-11 rounded-xl text-sm">
                <Check size={14} /> Check
              </button>
              <PeekTable verb={prompt.inf} onPeek={() => setPeeked(true)} />
            </div>
          ) : (
            <ResultPanel
              result={result}
              input={input}
              prompt={prompt}
              onNext={() => nextPrompt(prompt.key)}
              // Session mode: the learner can end the drill segment after any
              // answer instead of skipping it — a completed segment reads
              // honestly in the delivery record.
              onDone={focus ? onDone : null}
            />
          )}
        </form>
      ) : (
        <p className="text-xs text-ink3 text-center">{focus ? 'Nothing to drill for this form right now.' : 'No verbs available for this level.'}</p>
      )}
    </div>
  );
}

function LevelPicker({ level, onChange }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="CEFR level">
      {LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={level === l}
          className={`flex-1 min-h-9 rounded-xl text-xs font-semibold transition-colors ${
            level === l ? 'bg-ink text-surface' : 'bg-surface2 text-ink2 hover:bg-line'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ResultPanel({ result, input, prompt, onNext, onDone }) {
  const { status, answer } = result;
  const headline = status === 'correct' ? 'Parfait.' : status === 'near' ? 'Almost — accent slip.' : 'Not quite.';
  return (
    <div className="fade-in bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-2">
        {status === 'correct' ? <Check size={15} className="shrink-0 mt-0.5" /> : <X size={15} className="shrink-0 mt-0.5" />}
        <p className="text-sm text-ink">{headline}</p>
      </div>
      {status !== 'correct' && (
        <p className="text-xs text-ink3">
          You typed: <span className="text-ink2" lang="fr">{input.trim() || '—'}</span>
          {' · '}Correct: <span className="text-ink font-semibold" lang="fr">{answer}</span>
        </p>
      )}
      <div className="flex gap-2">
        <SpeakButton text={spokenSentence(prompt)} label="Hear it" />
        <button type="button" onClick={onNext} className="btn btn-primary flex-1 min-h-11 rounded-xl text-sm">
          <RefreshCw size={13} /> Next
        </button>
      </div>
      {onDone && (
        <button type="button" onClick={onDone} className="btn btn-secondary w-full min-h-11 rounded-xl text-sm">
          Done drilling
        </button>
      )}
    </div>
  );
}

// Collapsible full table for the current verb — reference, not a crib: peeking
// before answering caps the XP (see submit).
function PeekTable({ verb, onPeek }) {
  const [open, setOpen] = useState(false);
  const full = useMemo(() => trainerVerbs().find((v) => v.inf === verb), [verb]);
  if (!full) return null;
  const tenses = Object.keys(full.tenses);
  return (
    <div>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) onPeek(); }}
        aria-expanded={open}
        className="inline-flex items-center gap-1 px-2 py-1 min-h-8 rounded-lg text-[11px] font-medium bg-surface2 text-ink2 hover:bg-line"
      >
        <BookOpen size={10} /> {open ? 'Hide the table' : 'Peek at the table'} <ChevronRight size={10} className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="fade-in mt-2 bg-surface2 border border-line rounded-xl p-3 overflow-x-auto">
          <table className="w-full border-collapse" aria-label={`Conjugation table for ${verb}`}>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Tense</span></th>
                {PERSONS.map((p) => (
                  <th key={p} scope="col" className="text-[10px] font-semibold text-ink3 px-1 pb-1">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenses.map((tid) => (
                <tr key={tid}>
                  <th scope="row" className="text-[10px] font-semibold text-ink2 pr-2 text-left whitespace-nowrap">{tenseLabel(tid)}</th>
                  {full.tenses[tid].map((f, i) => (
                    <td key={i} className="text-[11px] text-ink text-center px-1 tabular-nums" lang="fr">{f}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
