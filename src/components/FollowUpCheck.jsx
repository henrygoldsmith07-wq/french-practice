import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from './icons';
import { shuffleOptions } from './GrammarExercises';
import { FOLLOW_UP_KINDS, followUpCopy, gradeListening, gradeProduction } from '../lib/followUp';
import { recordLearnerError, recordLearnerSuccess } from '../lib/storage';
import { currentSessionId } from '../lib/evidenceIdentity';

// The same chunk TodaySession already lazy-loads for its Listen segment —
// reusing it keeps the player out of the static graph and out of the Today
// bundle, which the segment-budget gate treats as a product constraint.
const TrackPlayer = lazy(() => import('./Listening').then((m) => ({ default: m.TrackPlayer })));

// The segment that makes the last two links of the loop real.
//
// The learner model can owe a fresh-context check or a delayed retest. This
// runs it — against the exact weakness that owes it, on material the learner
// has not met (lib/followUp.js) — and records the real outcome so the debt is
// either discharged or renewed. Nothing here is simulated: a clean pass earns
// transfer evidence, a miss goes back into the model as a dated mistake.
//
// Grading is deterministic and offline. AI is an enhancement elsewhere in the
// app; it is never the source of this verdict.

export default function FollowUpCheck({ task, onDone, onXp }) {
  const [result, setResult] = useState(null);
  const recordedRef = useRef(false);
  const sessionId = useMemo(() => currentSessionId(), []);

  const record = (correct, score, detail, extra = {}) => {
    if (recordedRef.current || !task) return;
    recordedRef.current = true;
    const payload = {
      category: task.skill,
      key: task.key,
      label: task.label,
      mode: 'followup',
      source: `followup-${task.type}`,
      score: Math.round(score),
      sessionId,
      encounterId: task.encounterId,
      activityId: `followup:${task.targetId}`,
      detail,
      ...extra,
    };
    if (correct) {
      // An assisted pass is a real success but NOT a demonstration: the answer
      // was supported, so it may extend "improving" and nothing more. That is
      // the rule the model claims, so the flag reflects it rather than being
      // set unconditionally.
      recordLearnerSuccess({
        ...payload,
        // The check itself proves this is a new context: the runner administered
        // unseen material and graded it. The store still lets the clock decide
        // whether it also clears the delayed floor.
        transferVerified: extra.transferVerified !== false && extra.assistance === undefined,
        heldOut: task.heldOut === true,
        promptNovelty: 1,
      });
    } else {
      recordLearnerError(payload);
    }
    setResult({ correct, assisted: extra.assistance != null, score: Math.round(score) });
    onXp?.(correct ? 4 : 1);
  };

  if (!task) return null;

  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">
            {task.type === 'delayed' ? 'Check again' : 'Use it somewhere new'}
          </p>
          <p className="text-sm text-ink leading-snug">{followUpCopy(task)}</p>
        </div>
        <TaskBody task={task} onFinished={record} />
        {result && (
          <div className={`rounded-xl border p-3 text-xs ${result.correct ? 'border-success/40 bg-successsoft text-success' : 'border-line bg-surface2 text-ink2'}`}>
            {result.assisted
              ? 'Logged as practice, not proof — the transcript was open, so this cannot count as an independent check.'
              : result.correct
                ? 'Logged. This counts as a real, independent check — the delayed one is still owed.'
                : 'Not this time — it goes back on the list, and you will meet it again.'}
          </div>
        )}
        <button type="button" onClick={onDone} className="btn btn-primary w-full min-h-11 rounded-xl text-sm">
          Done
        </button>
      </div>
    </div>
  );
}

// ── Authored: unseen items on the same rule ──────────────────────────────
function AuthoredBody({ task, onFinished }) {
  // Memoised so the item list is a stable dependency of the shuffle below.
  const items = useMemo(() => (Array.isArray(task.exercises) ? task.exercises : []), [task.exercises]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  // Shuffled once per item so the answer is not always first.
  const options = useMemo(
    () => (picked === null && !done ? shuffleOptions(items[Math.min(idx, items.length - 1)]) : null),
    [items, idx, picked, done],
  );

  useEffect(() => {
    if (!done || items.length === 0) return;
    const score = (correct / items.length) * 100;
    const timer = setTimeout(() => onFinished(correct === items.length, score, `${correct}/${items.length} on unseen items`), 0);
    return () => clearTimeout(timer);
  }, [done, correct, items.length, onFinished]);

  if (!items.length) return null;
  if (done) {
    return <p className="text-sm text-ink2 tabular-nums">{correct}/{items.length}</p>;
  }
  const item = options;
  const choose = (i) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === item.answer) setCorrect((c) => c + 1);
  };
  const next = () => {
    setPicked(null);
    if (idx + 1 < items.length) setIdx((i) => i + 1);
    else setDone(true);
  };
  return (
    <div className="space-y-3">
      <p className="text-[10px] text-ink3 text-center">Item {idx + 1}/{items.length}</p>
      <div className="bg-surface border border-line rounded-2xl p-5">
        <p className="text-[15px] text-ink font-medium leading-relaxed" lang="fr">{item.q}</p>
      </div>
      <div className="space-y-2">
        {item.options.map((opt, i) => {
          const isAnswer = i === item.answer;
          const isPicked = i === picked;
          let cls = 'border-line bg-surface hover:border-ink3';
          if (picked !== null) {
            cls = isAnswer ? 'border-ink bg-surface2' : 'border-line bg-surface opacity-60';
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={picked !== null}
              className={`w-full flex items-center gap-3 border rounded-xl px-4 py-3 text-left text-sm text-ink transition-colors ${cls}`}
            >
              <span className="flex-1" lang="fr">{opt}</span>
              {picked !== null && isAnswer && <Check size={15} className="shrink-0" />}
              {picked !== null && isPicked && !isAnswer && <X size={15} className="shrink-0" />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="fade-in space-y-3">
          {item.why && <div className="bg-surface2 border border-line rounded-xl px-3.5 py-2.5"><p className="text-xs text-ink2">{item.why}</p></div>}
          <button type="button" onClick={next} className="btn btn-primary w-full min-h-11 rounded-xl text-sm">
            {idx + 1 < items.length ? 'Next item' : 'See result'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Production: the word, used in a sentence of the learner's own ────────
function ProductionBody({ task, onFinished }) {
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(null);

  const check = () => {
    const value = text.trim();
    if (!value) return;
    const outcome = gradeProduction(task, value);
    setChecked(outcome);
    onFinished(outcome.correct, outcome.correct ? 100 : 0, outcome.reason);
  };

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-line rounded-2xl p-5">
        <p className="text-[15px] text-ink font-medium leading-relaxed" lang="fr">{task.prompt}</p>
      </div>
      <label className="block">
        <span className="sr-only">Your sentence</span>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setChecked(null); }}
          rows={3}
          className="w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
          placeholder="Write a sentence of your own…"
        />
      </label>
      {checked && (
        <p className={`text-xs rounded-xl px-3 py-2 border ${checked.correct ? 'border-success/40 bg-successsoft text-success' : 'border-line bg-surface2 text-ink2'}`}>
          {checked.correct
            ? 'Used it on your own, in a new sentence. That is real evidence.'
            : checked.reason === 'target-missing'
              ? `This one needs «${task.word}» in the sentence.`
              : checked.reason === 'no-sentence'
                ? 'Give it a full sentence, not the word on its own.'
                : 'Write it in your own words — a copy of the studied line does not count.'}
        </p>
      )}
      <button
        type="button"
        onClick={check}
        disabled={!text.trim()}
        className="btn btn-primary w-full min-h-11 rounded-xl text-sm disabled:opacity-40"
      >
        Check it
      </button>
    </div>
  );
}

// ── Listening: a comprehension check on a recording never heard before ────
//
// The player grades itself: it marks every question and reports the result
// with how much support was used. All this body has to do is turn that into an
// honest verdict — a full, unassisted pass is transfer evidence; a partial one
// is a real miss; a pass the learner read off the transcript is practice, and
// is recorded as practice rather than dressed up as one or the other.
function ListeningBody({ task, onFinished }) {
  const done = useRef(false);
  const track = task.track;
  if (!track) return null;

  const onQuizComplete = (result) => {
    if (done.current) return;
    done.current = true;
    const verdict = gradeListening(task, result);
    const detail = `${result.correct}/${result.total} on a track the learner had not heard`;
    if (verdict.assisted) {
      // Right answer, supported answer: record the success, withhold the claim.
      onFinished(true, verdict.score, detail, { assistance: 'scaffolded', transferVerified: false });
      return;
    }
    onFinished(verdict.correct, verdict.score, detail);
  };

  return (
    <Suspense fallback={<p className="text-sm text-ink2">Loading the player…</p>}>
      <TrackPlayer
        track={track}
        baseRate={1}
        level={track.cefr || 'B1'}
        onXp={() => {}}
        onQuizComplete={onQuizComplete}
      />
    </Suspense>
  );
}

function TaskBody({ task, onFinished }) {
  if (task.kind === FOLLOW_UP_KINDS.AUTHORED) return <AuthoredBody task={task} onFinished={onFinished} />;
  if (task.kind === FOLLOW_UP_KINDS.PRODUCTION) return <ProductionBody task={task} onFinished={onFinished} />;
  if (task.kind === FOLLOW_UP_KINDS.LISTENING) return <ListeningBody task={task} onFinished={onFinished} />;
  return null;
}
