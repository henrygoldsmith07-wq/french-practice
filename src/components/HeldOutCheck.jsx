import { useMemo, useRef, useState } from 'react';
import { ChevronRight, Volume, Mic } from './icons';
import { speak } from '../lib/tts';
import useRecorder from '../hooks/useRecorder';
import { transcribe, evaluateTurn, friendlyError } from '../lib/groq';

// Held-out transfer check (Evidence Study, measurement-only).
//
//   · items are FROZEN ASSESSMENT PAYLOADS persisted in the check record —
//     content, options, explicit correctOptionId — so scoring never infers
//     correctness from ids and replays are identical
//   · unscaffolded: no hints, no corrections, no "why", no mastery updates
//   · skill-specific renderers: recognition MCQ, typed production, grammar
//     production, audio-first listening, passage reading, REAL speaking
//     pipeline (record → transcribe → evaluate → store; unscored if the
//     objective evaluation fails — self-rating is confidence only)
//   · one pass; results feed ONLY the study stores

function OptionList({ options, correctOptionId, answered, chosenId, onPick, lang = 'fr', groupLabel }) {
  return (
    <div className="grid gap-2" role="group" aria-label={groupLabel}>
      {options.map((o) => {
        const isChosen = chosenId === o.id;
        const isCorrect = o.id === correctOptionId;
        const tone = !answered
          ? 'border-line bg-surface hover:border-ink3'
          : isCorrect
            ? 'border-line bg-surface opacity-70'
            : isChosen
              ? 'border-amber-300 bg-amber-50'
              : 'border-line bg-surface opacity-60';
        return (
          <button
            key={o.id}
            onClick={() => onPick(o)}
            disabled={Boolean(answered)}
            className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${tone}`}
          >
            <span lang={lang}>{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChoiceRunner({ item, answered, onPick }) {
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-bold text-ink">{item.content.prompt}</p>
      <p className="text-center text-[11px] text-ink3">Choose the matching French word.</p>
      <OptionList
        options={item.options}
        correctOptionId={item.correctOptionId}
        answered={answered}
        chosenId={answered?.chosen}
        onPick={(o) => onPick({ chosen: o.id, correct: o.id === item.correctOptionId })}
        lang="fr"
        groupLabel="Choose the matching French word"
      />
    </div>
  );
}

function TypedRunner({ item, answered, onAnswer, placeholder, hint }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (!draft.trim() || answered) return;
    const norm = draft.toLowerCase().trim();
    const ok = (item.accept || []).some((a) => a.toLowerCase().trim() === norm);
    onAnswer({ correct: ok });
  };
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-bold text-ink">{item.content.prompt}</p>
      <p className="text-center text-[11px] text-ink3">{hint}</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={Boolean(answered)}
          placeholder={placeholder}
          aria-label="Your answer in French"
          className="flex-1 bg-transparent py-3 text-sm text-ink placeholder:text-ink3 focus:outline-none"
        />
        {!answered && (
          <button onClick={submit} disabled={!draft.trim()} className="text-ink px-1 min-h-11 grid place-items-center disabled:opacity-40" aria-label="Submit answer">
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      {answered && <p className="text-[10px] text-ink3 text-center">Recorded. No answers are shown during checks.</p>}
    </div>
  );
}

function ListeningRunner({ item, answered, onPick, ttsRate = 1 }) {
  const [plays, setPlays] = useState(0);
  const play = () => {
    try { speak(item.content.audio, { rate: ttsRate }); setPlays((p) => p + 1); } catch { /* TTS unavailable: item stays answerable by replay attempts */ }
  };
  return (
    <div className="space-y-4">
      <p className="text-center text-[11px] text-ink3">Listen, then choose the meaning. You may replay.</p>
      <div className="grid place-items-center py-2">
        <button
          onClick={play}
          disabled={Boolean(answered)}
          aria-label={`Play listening item${plays ? ` (${plays} replays)` : ''}`}
          className="btn btn-primary min-h-14 px-6 rounded-2xl text-sm inline-flex items-center gap-2"
        >
          <Volume size={18} /> {plays ? 'Replay' : 'Play'}
        </button>
      </div>
      {/* Audio-first: the transcript never renders before the item is answered. */}
      {answered && <p className="text-center text-sm text-ink3 italic" lang="fr">«{item.content.audio}»</p>}
      <OptionList
        options={item.options}
        correctOptionId={item.correctOptionId}
        answered={answered}
        chosenId={answered?.chosen}
        onPick={(o) => onPick({ chosen: o.id, correct: o.id === item.correctOptionId })}
        lang="en"
        groupLabel="Choose the meaning you heard"
      />
    </div>
  );
}

function ReadingRunner({ item, answered, onPick }) {
  return (
    <div className="space-y-4">
      <div className="bg-surface2 border border-line rounded-xl px-4 py-3">
        <p className="text-sm text-ink leading-relaxed" lang="fr">{item.content.text}</p>
      </div>
      <p className="text-center text-[11px] text-ink3">Read the passage, then choose the meaning.</p>
      <OptionList
        options={item.options}
        correctOptionId={item.correctOptionId}
        answered={answered}
        chosenId={answered?.chosen}
        onPick={(o) => onPick({ chosen: o.id, correct: o.id === item.correctOptionId })}
        lang="en"
        groupLabel="Choose the correct meaning"
      />
    </div>
  );
}

function SpeakingRunner({ item, answered, onAnswer, apiKey, mockMode, level }) {
  // REAL speaking pipeline: record → transcribe → evaluate → store.
  // If the objective evaluation fails, the attempt is stored UNSCORED
  // (never "correct"); the learner's self-rating is a confidence field only.
  const [stage, setStage] = useState('idle'); // idle | ready | recording | evaluating | done
  const startedAtRef = useRef(null);
  const [scored, setScored] = useState(null); // { aiScore, asrConfidence, status }
  const [error, setError] = useState(null);

  const recorder = useRecorder({
    onComplete: async (blob) => {
      setStage('evaluating');
      try {
        const transcript = await transcribe(apiKey, blob, { mock: mockMode });
        const words = String(transcript || '').split(/\s+/).filter(Boolean);
        const evaluation = await evaluateTurn(apiKey, {
          scenario: { title: 'Held-out speaking check', opener: item.content.prompt, curveball: null },
          history: [],
          userText: transcript,
          level,
          mock: mockMode,
        });
        const score = evaluation?.scores?.overall;
        setScored({
          transcript,
          aiScore: Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null,
          asrConfidence: words.length >= 3 ? 'usable' : 'low',
          status: Number.isFinite(Number(score)) ? 'scored' : 'unscored',
        });
        onAnswer({ correct: null, scored: true, aiScore: scoredNum(score), status: 'scored' });
      } catch (e) {
        // Objective scoring unavailable: store as UNSCORED, never correct.
        setScored({ status: 'unscored', reason: friendlyError(e) });
        onAnswer({ correct: null, scored: false, status: 'unscored' });
      }
      setStage('done');
    },
  });

  const scoredNum = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : null);

  return (
    <div className="space-y-4">
      <p className="text-center text-[11px] text-ink3">Speaking task — respond aloud. This is recorded for measurement only.</p>
      <p className="text-center text-lg font-bold text-ink" lang="fr">{item.content.prompt}</p>
      {stage === 'idle' && (
        <div className="grid place-items-center">
          <button onClick={() => { setStage('ready'); startedAtRef.current = Date.now(); }} className="btn btn-primary min-h-12 px-6 rounded-xl text-sm">
            I'm ready
          </button>
        </div>
      )}
      {stage === 'ready' && !answered && (
        <div className="grid place-items-center gap-2">
          <button
            onClick={recorder.start}
            disabled={recorder.recording}
            aria-label="Record my speaking attempt"
            className="btn btn-primary w-16 h-16 rounded-full grid place-items-center"
          >
            <Mic size={22} />
          </button>
          <p className="text-[11px] text-ink3">Tap, speak, then tap again to stop.</p>
        </div>
      )}
      {recorder.recording && (
        <div className="grid place-items-center gap-2">
          <button
            onClick={recorder.stop}
            aria-label="Stop recording"
            className="rec-pulse w-16 h-16 rounded-full bg-accent text-onaccent grid place-items-center"
          >
            <span className="w-5 h-5 rounded-sm bg-onaccent" />
          </button>
          <p className="text-[11px] text-ink3 tabular-nums">{recorder.elapsed}s</p>
        </div>
      )}
      {stage === 'evaluating' && <p className="text-center text-sm text-ink2">Evaluating your attempt…</p>}
      {stage === 'done' && scored && (
        <p className="text-center text-[11px] text-ink3">
          {scored.status === 'scored'
            ? `Attempt recorded (AI score available for research; not shown to keep the check honest).`
            : 'Attempt recorded as UNSCORED — objective evaluation was unavailable. Your confidence rating below is not a score.'}
          {scored.reason ? ` (${scored.reason})` : ''}
        </p>
      )}
      {stage === 'done' && !answered && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onAnswer({ correct: null, status: scored?.status || 'unscored', aiScore: scored?.aiScore ?? null, asrConfidence: scored?.asrConfidence ?? null, confidence: 'managed' })} className="btn btn-secondary min-h-11 rounded-xl text-sm">I managed it</button>
          <button onClick={() => onAnswer({ correct: null, status: scored?.status || 'unscored', aiScore: scored?.aiScore ?? null, asrConfidence: scored?.asrConfidence ?? null, confidence: 'could-not' })} className="btn btn-secondary min-h-11 rounded-xl text-sm">I couldn't finish it</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-ink bg-surface2 border border-line rounded-xl px-3 py-2">{error}</p>}
      {answered && <p className="text-[10px] text-ink3 text-center">Attempt stored ({answered.status || 'unscored'}). Confidence is recorded separately from scoring.</p>}
    </div>
  );
}

const RUNNERS = {
  vocabulary: ChoiceRunner,
  'vocabulary-prod': (props) => <TypedRunner {...props} placeholder="Votre réponse…" hint="Write this in French — spelling counts." />,
  grammar: (props) => <TypedRunner {...props} placeholder="Votre réponse…" hint="Write the correct form — no hints here, by design." />,
  listening: ListeningRunner,
  reading: ReadingRunner,
  speaking: SpeakingRunner,
};

export default function HeldOutCheck({ check, onDone, apiKey, mockMode, level, ttsRate = 1 }) {
  // Items are FROZEN ASSESSMENT PAYLOADS persisted in the check record.
  const items = check?.items || [];
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(null); // { chosen?, correct, status?, aiScore?, asrConfidence?, confidence? }
  const startedRef = useRef(Date.now());
  const resultsRef = useRef([]);

  const item = items[idx];
  const Runner = item ? (RUNNERS[item.skill] || ChoiceRunner) : null;

  const finish = () => {
    const scored = resultsRef.current;
    const objectivelyScored = scored.filter((r) => r.correct != null);
    const correct = objectivelyScored.filter((r) => r.correct).length;
    onDone?.({
      correct,
      total: scored.length,
      // Objective scoring only counts rows that had a definite answer;
      // unscored speaking attempts are excluded from the fraction, never
      // counted as correct.
      quizScore: objectivelyScored.length
        ? Math.round((correct / objectivelyScored.length) * 100)
        : null,
      unscored: scored.length - objectivelyScored.length,
      secondsSpent: Math.round((Date.now() - startedRef.current) / 1000),
      perItem: scored,
    });
  };

  if (!items.length) {
    // No unseen verified material at this level right now — the check honestly skips.
    return (
      <div className="h-full grid place-items-center px-4">
        <p className="text-sm text-ink2">No held-out material available today.</p>
      </div>
    );
  }

  const answer = (r) => {
    if (answered) return;
    resultsRef.current.push({ sourceItemId: item.sourceItemId, skill: item.skill, correct: r.correct ?? null, status: r.status || (r.correct != null ? 'scored' : 'unscored'), aiScore: r.aiScore ?? null, asrConfidence: r.asrConfidence ?? null, confidence: r.confidence ?? null });
    setAnswered({ chosen: r.chosen ?? null, correct: r.correct, status: r.status });
  };

  const next = () => {
    if (idx + 1 >= items.length) { finish(); return; }
    setIdx((i) => i + 1);
    setAnswered(null);
  };

  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-ink3 tabular-nums">
            {check?.scheduledSkill ? `${check.scheduledSkill} check` : 'Check'} {idx + 1}/{items.length}
          </p>
          <p className="text-[11px] text-ink3">New material — answer from what you know. No hints here, by design.</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
          {Runner && <Runner item={item} answered={answered} apiKey={apiKey} mockMode={mockMode} level={level} ttsRate={ttsRate} onPick={(o) => answer({ chosen: o.id, correct: o.id === item.correctOptionId })} onAnswer={answer} />}
          {answered && (
            <button onClick={next} className="btn btn-primary w-full min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
              {idx + 1 >= items.length ? 'Finish check' : 'Next'} <ChevronRight size={14} />
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
