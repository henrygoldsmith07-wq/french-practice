import { useMemo, useRef, useState } from 'react';
import { CONJUGATIONS, TENSES } from '../lib/reference';
import {
  buildQueue, gradeAnswer, recordResult, weakestAreas,
} from '../lib/conjugationDrill';
import { getConjugationProgress, saveConjugationProgress } from '../lib/storage';
import { SpeakButton } from './ui';
import { Check, X, ChevronLeft } from './icons';

// Conjugation drill — typed production over the same hand-verified tables the
// reference screen displays. Reading a table is recognition; the exam and the
// conversation both want production.
//
// The one thing this screen is opinionated about: an accent slip is marked
// wrong, and named. Accepting `parle` for `parlé` silently teaches a habit
// that costs a mark in every written paper, but calling it the same error as
// writing the wrong person is equally unhelpful — so it gets its own verdict
// and its own explanation.

const SESSION_SIZE = 12;

export default function ConjugationDrill({ onXp, onActivity, onBack }) {
  const [stats, setStats] = useState(() => getConjugationProgress());
  const [tenseFilter, setTenseFilter] = useState(null);
  const [verbFilter, setVerbFilter] = useState(null);
  // The queue is frozen for the run: re-sorting mid-session would move the
  // ground under the learner as their own answers change the ranking.
  const [queue, setQueue] = useState(null);
  const [index, setIndex] = useState(0);
  const [entry, setEntry] = useState('');
  const [result, setResult] = useState(null);
  const [tally, setTally] = useState({ right: 0, accent: 0, wrong: 0 });
  const inputRef = useRef(null);

  const insight = useMemo(() => weakestAreas(stats), [stats]);
  const current = queue ? queue[index] : null;

  const start = () => {
    const next = buildQueue(stats, {
      verbs: verbFilter ? [verbFilter] : null,
      tenses: tenseFilter ? [tenseFilter] : null,
      limit: SESSION_SIZE,
    });
    if (!next.length) return;
    setQueue(next);
    setIndex(0);
    setEntry('');
    setResult(null);
    setTally({ right: 0, accent: 0, wrong: 0 });
  };

  const submit = () => {
    if (!current || result) return;
    const graded = gradeAnswer(entry, current.answer);
    setResult(graded);
    const updated = recordResult(stats, current.id, graded);
    setStats(updated);
    saveConjugationProgress(updated);
    setTally((t) => ({
      right: t.right + (graded.verdict === 'correct' ? 1 : 0),
      accent: t.accent + (graded.verdict === 'accent-error' ? 1 : 0),
      wrong: t.wrong + (graded.verdict === 'incorrect' || graded.verdict === 'empty' ? 1 : 0),
    }));
    if (graded.verdict === 'correct') onXp?.(2);
    onActivity?.({ type: 'conjugation', id: current.id, label: `${current.inf} · ${current.tenseLabel}` });
  };

  const advance = () => {
    if (index + 1 >= queue.length) { setQueue(null); return; }
    setIndex(index + 1);
    setEntry('');
    setResult(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (result) advance(); else submit();
  };

  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-5">
      <div className="max-w-lg mx-auto space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-ink3 hover:text-ink">
          <ChevronLeft size={14} /> Reference
        </button>

        {!queue ? (
          <>
            <div>
              <h2 className="text-lg font-semibold text-ink">Conjugation drill</h2>
              <p className="text-xs text-ink3 mt-1">
                Type the form. Accents count — a missing accent is marked wrong, but you will be told
                that is what it was.
              </p>
            </div>

            <Filter
              label="Tense"
              value={tenseFilter}
              onChange={setTenseFilter}
              options={TENSES.map((t) => ({ value: t.id, label: t.label }))}
            />
            <Filter
              label="Verb"
              value={verbFilter}
              onChange={setVerbFilter}
              options={CONJUGATIONS.map((v) => ({ value: v.inf, label: v.inf }))}
            />

            <button
              onClick={start}
              className="w-full rounded-2xl bg-ink text-bg text-sm font-semibold py-3 hover:opacity-90"
            >
              Start {SESSION_SIZE} forms
            </button>

            <section className="bg-surface border border-line rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-ink">What you keep missing</h3>
              {!insight.ready ? (
                <p className="text-xs text-ink3 mt-1.5">
                  {insight.answers === 0
                    ? 'Nothing drilled yet — patterns appear once there is something to read.'
                    : `${insight.needed} more answer${insight.needed === 1 ? '' : 's'} before a pattern means anything.`}
                </p>
              ) : (
                <div className="mt-2 space-y-2 text-xs">
                  <Ranked title="Tenses" rows={insight.tenses} labelFor={(k) => TENSES.find((t) => t.id === k)?.label || k} />
                  <Ranked title="Verbs" rows={insight.verbs} labelFor={(k) => k} />
                  <p className="text-ink3">
                    {Math.round(insight.accentShare * 100)}% of your answers were the right form with the wrong accents
                    {insight.accentShare >= 0.15 ? ' — that is a writing habit, not a grammar gap.' : '.'}
                  </p>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-ink3">
              <span>{index + 1} / {queue.length}</span>
              <span className="tabular-nums">
                {tally.right} correct · {tally.accent} accent · {tally.wrong} wrong
              </span>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 text-center">
              <p className="text-xs text-ink3">{current.tenseLabel}{current.irregular ? ' · irregular' : ''}</p>
              <p className="text-xl font-semibold text-ink mt-1">
                {current.person} <span className="text-ink3">…</span>
              </p>
              <p className="text-sm text-ink2 mt-1">
                {current.inf} <span className="text-ink3">— {current.en}</span>
              </p>
            </div>

            <label className="block">
              <span className="sr-only">Your answer</span>
              <input
                ref={inputRef}
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={!!result}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="type the form"
                className="w-full rounded-2xl bg-surface border border-line px-4 py-3 text-base text-ink placeholder:text-ink3 focus:outline-none focus:border-ink3"
              />
            </label>

            {!result ? (
              <button
                onClick={submit}
                className="w-full rounded-2xl bg-ink text-bg text-sm font-semibold py-3 hover:opacity-90"
              >
                Check
              </button>
            ) : (
              <>
                <Verdict result={result} person={current.person} />
                <button
                  onClick={advance}
                  className="w-full rounded-2xl bg-ink text-bg text-sm font-semibold py-3 hover:opacity-90"
                >
                  {index + 1 >= queue.length ? 'Finish' : 'Next'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Verdict({ result, person }) {
  const tone = result.verdict === 'correct'
    ? 'border-success/40 bg-successsoft'
    : result.verdict === 'accent-error'
      ? 'border-review/40 bg-reviewsoft'
      : 'border-line bg-surface';
  const heading = {
    correct: 'Correct',
    'accent-error': 'Right word, wrong accents',
    incorrect: 'Not this one',
    empty: 'Nothing entered',
  }[result.verdict];

  return (
    <div className={`rounded-2xl border p-4 ${tone}`} role="status">
      <div className="flex items-center gap-2">
        {result.correct ? <Check size={16} /> : <X size={16} />}
        <p className="text-sm font-semibold text-ink">{heading}</p>
        <span className="ml-auto"><SpeakButton text={`${person} ${result.expected}`} label="Hear the form" /></span>
      </div>
      <p className="text-sm text-ink mt-1.5">{person} <strong>{result.expected}</strong></p>
      {result.verdict === 'accent-error' && (
        <p className="text-xs text-ink2 mt-1.5">
          You had the form. It is written <strong>{result.nearest}</strong> — in a written paper this
          still loses the mark, so it is counted as wrong here.
        </p>
      )}
    </div>
  );
}

function Ranked({ title, rows, labelFor }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="font-semibold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.slice(0, 3).map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-ink2">
            <span className="flex-1 truncate">{labelFor(row.key)}</span>
            <span className="tabular-nums text-ink3">{Math.round(row.errorRate * 100)}% wrong of {row.seen}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink2 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={value === null} onClick={() => onChange(null)}>All</Chip>
        {options.map((o) => (
          <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>{o.label}</Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
        active ? 'bg-ink text-bg border-ink' : 'bg-surface text-ink2 border-line hover:border-ink3'
      }`}
    >
      {children}
    </button>
  );
}
