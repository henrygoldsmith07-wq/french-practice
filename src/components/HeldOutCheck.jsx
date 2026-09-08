import { useMemo, useRef, useState } from 'react';
import { ChevronRight } from './icons';

// Held-out transfer check (Evidence Study, measurement-only).
//
//   · material the learner has never practised (unseen vocabulary)
//   · unscaffolded: no hints, no corrections, no "why", no mastery updates
//   · brief: a handful of items, one pass
//   · CEFR-matched at enrolment level
//
// Results feed ONLY the study stores — never the mistake graph, never the
// SRS scheduler, never the adaptive engine. Selection cannot learn from
// these items, which is what keeps them held out.

const OPTIONS = 4;

function pickOptions(pool, target, count) {
  const distractors = pool.filter((w) => w.id !== target.id);
  const chosen = [];
  const used = new Set();
  for (let i = distractors.length - 1; i > 0; i--) {
    const j = (i * 7 + i * i) % (i + 1); // deterministic shuffle — no RNG drift
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
  }
  for (const w of distractors) {
    if (chosen.length >= count - 1) break;
    if (used.has(w.id)) continue;
    used.add(w.id);
    chosen.push(w);
  }
  const all = [...chosen, target];
  // deterministic but not positional: rotate by target id hash
  const shift = [...String(target.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % all.length;
  return [...all.slice(shift), ...all.slice(0, shift)];
}

export default function HeldOutCheck({ check, onDone }) {
  // Words arrive in the frozen check record; the pool view keeps the study
  // store lean (ids only) so the component rehydrates them from the pack.
  const words = check?.poolWords || [];
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(null); // { chosen, correct }
  const startedRef = useRef(Date.now());
  const resultsRef = useRef([]);

  const word = words[idx];
  const options = useMemo(
    () => (word ? pickOptions(words, word, OPTIONS) : []),
    [word, words],
  );

  const finish = () => {
    const correct = resultsRef.current.filter(Boolean).length;
    onDone?.({
      correct,
      total: resultsRef.current.length,
      quizScore: resultsRef.current.length ? Math.round((correct / resultsRef.current.length) * 100) : null,
      secondsSpent: Math.round((Date.now() - startedRef.current) / 1000),
    });
  };

  if (!words.length) {
    // No unseen material at this level right now — the check honestly skips.
    return (
      <div className="h-full grid place-items-center px-4">
        <p className="text-sm text-ink2">No held-out material available today.</p>
      </div>
    );
  }

  const answer = (w) => {
    if (answered) return;
    const correct = w.id === word.id;
    setAnswered({ chosen: w.id, correct });
    resultsRef.current.push(correct);
  };

  const next = () => {
    if (idx + 1 >= words.length) { finish(); return; }
    setIdx((i) => i + 1);
    setAnswered(null);
  };

  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-ink3 tabular-nums">Check {idx + 1}/{words.length}</p>
          <p className="text-[11px] text-ink3">New material — answer from what you know. No hints here, by design.</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
          <p className="text-center text-lg font-bold text-ink">{word.en}</p>
          <p className="text-center text-[11px] text-ink3">{word.example ? `“${word.example}”` : null}</p>
          <div className="grid gap-2" role="group" aria-label="Choose the matching French word">
            {options.map((o) => {
              const isChosen = answered?.chosen === o.id;
              const isTarget = o.id === word.id;
              const tone = !answered
                ? 'border-line bg-surface hover:border-ink3'
                : isTarget
                  ? 'border-emerald-300 bg-emerald-50'
                  : isChosen
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-line bg-surface opacity-60';
              return (
                <button
                  key={o.id}
                  onClick={() => answer(o)}
                  disabled={Boolean(answered)}
                  className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${tone}`}
                >
                  <span lang="fr">{o.fr}</span>
                </button>
              );
            })}
          </div>
          {answered && (
            <button onClick={next} className="btn btn-primary w-full min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
              {idx + 1 >= words.length ? 'Finish check' : 'Next'} <ChevronRight size={14} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-ink3 text-center">
          This check measures transfer only — it never feeds your review schedule or mistakes.
        </p>
      </div>
    </div>
  );
}
