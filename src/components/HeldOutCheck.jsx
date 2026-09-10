import { useMemo, useRef, useState } from 'react';
import { ChevronRight, Volume } from './icons';
import { speak } from '../lib/tts';

// Held-out transfer check (Evidence Study, measurement-only).
//
//   · material the learner has never practised (verified bank, unseen)
//   · unscaffolded: no hints, no corrections, no "why", no mastery updates
//   · brief: a handful of items, one pass
//   · CEFR-matched at enrolment level
//   · SKILL-SPECIFIC renderers: recognition, production, grammar, listening,
//     reading, speaking — modality matches what the skill actually is
//
// Results feed ONLY the study stores — never the mistake graph, never the
// SRS scheduler, never the adaptive engine. Selection cannot learn from
// these items, which is what keeps them held out.
//
// Honesty rules for measurement: correct answers and corrective feedback are
// never revealed during a check; audio-only items never show their text
// before the item is answered (listening is audio-first).

const RECOGNITION_OPTIONS = 4;

function deterministicShuffle(items, seedStr) {
  let h = 0;
  for (const c of String(seedStr)) h = Math.imul(h ^ c.charCodeAt(0), 2654435761);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (i + 1), 2654435761);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── per-skill item renderers ───────────────────────────────────────────────

function RecognitionItem({ item, bankWords, answered, onAnswer }) {
  const options = useMemo(() => {
    const distractors = bankWords.filter((w) => w.id !== item.id && w.fr && w.en);
    const picked = [];
    const used = new Set([item.id]);
    for (const w of deterministicShuffle(distractors, item.id)) {
      if (picked.length >= RECOGNITION_OPTIONS - 1) break;
      if (used.has(w.id)) continue;
      used.add(w.id);
      picked.push(w);
    }
    const all = deterministicShuffle([...picked, { id: item.id, fr: item.fr }], `${item.id}|opts`);
    return all;
  }, [item, bankWords]);
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-bold text-ink">{item.en}</p>
      <p className="text-center text-[11px] text-ink3">Choose the matching French word.</p>
      <div className="grid gap-2" role="group" aria-label="Choose the matching French word">
        {options.map((o) => (
          <OptionButton key={o.id} label={o.fr} lang="fr" disabled={Boolean(answered)} answered={answered} chosenId={answered?.chosen} itemId={item.id} id={o.id} onAnswer={onAnswer} answer={o} />
        ))}
      </div>
    </div>
  );
}

function ProductionItem({ item, answered, onAnswer }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (!draft.trim() || answered) return;
    const ok = item.accept.some((a) => a.toLowerCase().trim() === draft.toLowerCase().trim());
    onAnswer({ id: item.id, correct: ok });
  };
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-bold text-ink">{item.en}</p>
      <p className="text-center text-[11px] text-ink3">Write this in French — spelling counts.</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={Boolean(answered)}
          placeholder="Votre réponse…"
          aria-label="Your answer in French"
          className="flex-1 bg-transparent py-3 text-sm text-ink placeholder:text-ink3 focus:outline-none"
        />
        {!answered && (
          <button onClick={submit} disabled={!draft.trim()} className="text-ink px-1 min-h-11 grid place-items-center disabled:opacity-40" aria-label="Submit answer">
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      {answered && <NextHint />}
    </div>
  );
}

function GrammarItem({ item, answered, onAnswer }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (!draft.trim() || answered) return;
    const ok = item.accept.some((a) => a.toLowerCase().trim() === draft.toLowerCase().trim());
    onAnswer({ id: item.id, correct: ok });
  };
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-bold text-ink" lang="fr">{item.prompt}</p>
      <p className="text-center text-[11px] text-ink3">Write the correct form — no hints here, by design.</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={Boolean(answered)}
          placeholder="Votre réponse…"
          aria-label="Your answer in French"
          className="flex-1 bg-transparent py-3 text-sm text-ink placeholder:text-ink3 focus:outline-none"
        />
        {!answered && (
          <button onClick={submit} disabled={!draft.trim()} className="text-ink px-1 min-h-11 grid place-items-center disabled:opacity-40" aria-label="Submit answer">
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      {answered && <NextHint />}
    </div>
  );
}

function ListeningItem({ item, answered, onAnswer }) {
  // AUDIO-FIRST: the text never renders before the item is answered.
  const [plays, setPlays] = useState(0);
  const play = () => {
    try { speak(item.audio, { lang: 'fr' }); setPlays((p) => p + 1); } catch { /* TTS unavailable: item stays answerable by replay attempts */ }
  };
  const showText = Boolean(answered);
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
      {showText && <p className="text-center text-sm text-ink3 italic" lang="fr">«{item.audio}»</p>}
      <div className="grid gap-2" role="group" aria-label="Choose the meaning you heard">
        {item.options.map((o) => (
          <OptionButton key={o.id} label={o.en} lang="en" disabled={Boolean(answered)} answered={answered} chosenId={answered?.chosen} itemId={item.id} id={o.id} onAnswer={onAnswer} answer={o} />
        ))}
      </div>
    </div>
  );
}

function ReadingItem({ item, answered, onAnswer }) {
  return (
    <div className="space-y-4">
      <div className="bg-surface2 border border-line rounded-xl px-4 py-3">
        <p className="text-sm text-ink leading-relaxed" lang="fr">{item.text}</p>
      </div>
      <p className="text-center text-[11px] text-ink3">Read the passage, then choose the meaning.</p>
      <div className="grid gap-2" role="group" aria-label="Choose the correct meaning">
        {item.options.map((o) => (
          <OptionButton key={o.id} label={o.en} lang="en" disabled={Boolean(answered)} answered={answered} chosenId={answered?.chosen} itemId={item.id} id={o.id} onAnswer={onAnswer} answer={o} />
        ))}
      </div>
    </div>
  );
}

function SpeakingItem({ item, answered, onAnswer }) {
  // Independent speaking task: the learner speaks; the check records a
  // self-completed attempt (confidence-aware scoring arrives via the
  // speaking pipeline and stays measurement-only).
  const [started, setStarted] = useState(false);
  const startedAtRef = useRef(null);
  return (
    <div className="space-y-4">
      <p className="text-center text-[11px] text-ink3">Speaking task — say it aloud, then mark honestly.</p>
      <p className="text-center text-lg font-bold text-ink" lang="fr">{item.prompt}</p>
      {!answered && (
        <div className="grid gap-2">
          <button
            onClick={() => { setStarted(true); startedAtRef.current = Date.now(); }}
            disabled={started}
            className={`btn ${started ? 'btn-secondary' : 'btn-primary'} min-h-12 rounded-xl text-sm`}
          >
            {started ? 'Speaking…' : 'I\'m ready to speak'}
          </button>
          {started && (
            <>
              <button onClick={() => onAnswer({ id: item.id, correct: true, selfScore: 'managed' })} className="btn btn-secondary min-h-11 rounded-xl text-sm">I managed it</button>
              <button onClick={() => onAnswer({ id: item.id, correct: false, selfScore: 'could-not' })} className="btn btn-secondary min-h-11 rounded-xl text-sm">I couldn\'t finish it</button>
            </>
          )}
        </div>
      )}
      {answered && <NextHint />}
    </div>
  );
}

function OptionButton({ label, lang, disabled, answered, chosenId, itemId, id, onAnswer, answer }) {
  const isChosen = answered?.chosen === id;
  const isTarget = id === itemId;
  const tone = !answered
    ? 'border-line bg-surface hover:border-ink3'
    : isTarget
      ? 'border-line bg-surface opacity-70'
      : isChosen
        ? 'border-amber-300 bg-amber-50'
        : 'border-line bg-surface opacity-60';
  return (
    <button
      onClick={() => onAnswer({ id: itemId, correct: id === itemId, chosen: id })}
      disabled={disabled}
      className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${tone}`}
    >
      <span lang={lang}>{label}</span>
    </button>
  );
}

function NextHint() {
  return <p className="text-[10px] text-ink3 text-center">Recorded. No answers are shown during checks — that keeps them honest.</p>;
}

const RUNNERS = {
  vocabulary: RecognitionItem,
  'vocabulary-prod': ProductionItem,
  grammar: GrammarItem,
  listening: ListeningItem,
  reading: ReadingItem,
  speaking: SpeakingItem,
};

export default function HeldOutCheck({ check, onDone }) {
  // Items arrive in the frozen check record (bank shape); the pool view keeps
  // the study store lean (ids only) so the component rehydrates them.
  const items = check?.poolItems || [];
  const bankWords = check?.poolWords || [];
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(null); // { chosen, correct }
  const startedRef = useRef(Date.now());
  const resultsRef = useRef({});

  const item = items[idx];
  const Runner = item ? (RUNNERS[item.skill] || RecognitionItem) : null;

  const finish = () => {
    const scored = Object.values(resultsRef.current);
    const correct = scored.filter(Boolean).length;
    onDone?.({
      correct,
      total: scored.length,
      quizScore: scored.length ? Math.round((correct / scored.length) * 100) : null,
      secondsSpent: Math.round((Date.now() - startedRef.current) / 1000),
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
    resultsRef.current[r.id] = Boolean(r.correct);
    setAnswered({ chosen: r.chosen ?? r.id, correct: Boolean(r.correct) });
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
          {Runner && <Runner item={item} bankWords={bankWords} answered={answered} onAnswer={answer} />}
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
