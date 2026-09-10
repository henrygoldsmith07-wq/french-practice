import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Volume, Mic } from './icons';
import { speak } from '../lib/tts';
import useRecorder from '../hooks/useRecorder';
import { transcribe, evaluateTurn, friendlyError } from '../lib/groq';

// Held-out transfer check (Evidence Study, measurement-only).
//
// Every item ends as exactly one of:
//   scored      – a valid objective result exists (correctness or numeric AI)
//   unscored    – the learner attempted it but objective measurement failed
//   unavailable – infrastructure made measurement impossible (TTS/mic/AI)
// Infrastructure failure is NEVER counted as incorrect performance, and
// learner self-confidence NEVER touches the objective result.
//
// Items are FROZEN ASSESSMENT PAYLOADS persisted in the check record;
// correctness comes from the explicit correctOptionId / accept list — never
// from id inference. No answer or correction is shown during measurement.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const matchAccept = (typed, accept) => {
  const n = norm(typed);
  for (const a of accept || []) {
    if (norm(a) === n) return a;
  }
  return null;
};

// ── item state machine: answer → (optional confidence) → finalise ─────────
// objective: {status, correct?, aiScore?, asrConfidence?, reason?, matchedAccept?}

function ConfidenceChips({ value, onChange }) {
  const opts = [['managed', 'Managed'], ['unsure', 'Unsure'], ['could-not', 'Could not complete']];
  return (
    <div className="pt-1" role="group" aria-label="How confident did you feel (optional — never affects your score)">
      <p className="text-[10px] text-ink3 mb-1">Confidence (optional — does not affect scoring):</p>
      <div className="flex gap-1.5">
        {opts.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(value === id ? null : id)}
            aria-pressed={value === id}
            className={`px-2.5 py-1 rounded-lg border text-[11px] ${value === id ? 'border-ink bg-surface2 text-ink' : 'border-line text-ink3 hover:text-ink2'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionList({ options, correctOptionId, locked, chosenId, onPick, lang, groupLabel }) {
  return (
    <div className="grid gap-2" role="group" aria-label={groupLabel}>
      {options.map((o) => {
        const tone = locked ? 'border-line bg-surface opacity-60' : 'border-line bg-surface hover:border-ink3';
        return (
          <button
            key={o.id}
            onClick={() => onPick(o)}
            disabled={locked}
            className={`w-full text-left rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${tone}`}
        >
          <span lang={lang}>{o.text}</span>
        </button>
      );
    })}
  </div>
);
}

function ChoiceRunner({ item, objective, setObjective, onPick }) {
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-bold text-ink">{item.content?.prompt}</p>
      <p className="text-center text-[11px] text-ink3">Choose the matching French word.</p>
      <OptionList
        options={item.options || []}
        correctOptionId={item.correctOptionId}
        locked={Boolean(objective)}
        chosenId={objective?.chosenId ?? null}
        onPick={(o) => onPick(o)}
        lang="fr"
        groupLabel="Choose the matching French word"
      />
    </div>
  );
}

function TypedRunner({ item, objective, setObjective, hint, onAnswer }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (!draft.trim() || objective) return;
    const matched = matchAccept(draft, item.accept);
    if (matched == null && draft.trim().length === 0) return;
    onAnswer({ draft, matched });
  };
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-bold text-ink">{item.content?.prompt}</p>
      <p className="text-center text-[11px] text-ink3">{hint}</p>
      {objective ? (
        <p className="text-center text-sm text-ink2">Response recorded.</p>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Votre réponse…"
            aria-label="Your answer in French"
            className="flex-1 bg-transparent py-3 text-sm text-ink placeholder:text-ink3 focus:outline-none"
          />
          <button onClick={submit} disabled={!draft.trim()} className="text-ink px-1 min-h-11 grid place-items-center disabled:opacity-40" aria-label="Submit answer">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function ListeningRunner({ item, objective, setObjective, onPick, ttsRate = 1 }) {
  // Audio-first: options stay locked until at least one play succeeded; if
  // speechSynthesis is missing or every play fails, the item is unavailable.
  const [plays, setPlays] = useState(0);
  const [played, setPlayed] = useState(false);
  const play = () => {
    if (!('speechSynthesis' in window)) {
      setObjective({ status: 'unavailable', reason: 'tts-unavailable' });
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(item.content?.audio || '');
      u.lang = 'fr-FR';
      u.rate = ttsRate || 1;
      window.speechSynthesis.speak(u);
      setPlays((p) => p + 1);
      setPlayed(true);
    } catch {
      setObjective({ status: 'unavailable', reason: 'tts-failed' });
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-center text-[11px] text-ink3">Listen, then choose the meaning.</p>
      <div className="grid place-items-center py-2">
        <button
          onClick={play}
          disabled={Boolean(objective)}
          aria-label={`Play listening item${plays ? ` (${plays} replays)` : ''}`}
          className="btn btn-primary min-h-14 px-6 rounded-2xl text-sm inline-flex items-center gap-2"
        >
          <Volume size={18} /> {plays ? 'Replay' : 'Play'}
        </button>
      </div>
      {!played && !objective && (
        <p className="text-center text-[11px] text-ink3">Play the audio first — answers unlock once it has played.</p>
      )}
      {objective && objective.reason && (
        <p className="text-center text-[11px] text-amber-700">Audio could not be played — this item is recorded as unavailable, not wrong.</p>
      )}
      {objective && (
        <p className="text-center text-sm text-ink3 italic" lang="fr">«{item.content?.audio}»</p>
      )}
      <OptionList
        options={item.options || []}
        correctOptionId={item.correctOptionId}
        locked={Boolean(objective) || !played}
        chosenId={objective?.chosenId ?? null}
        onPick={(o) => onPick(o)}
        lang="en"
        groupLabel="Choose the meaning you heard"
      />
    </div>
  );
}

function ReadingRunner({ item, objective, onPick }) {
  return (
    <div className="space-y-4">
      <div className="bg-surface2 border border-line rounded-xl px-4 py-3">
        <p className="text-sm text-ink leading-relaxed" lang="fr">{item.content?.text}</p>
      </div>
      <p className="text-center text-[11px] text-ink3">Read the passage, then choose the meaning.</p>
      <OptionList
        options={item.options || []}
        correctOptionId={item.correctOptionId}
        locked={Boolean(objective)}
        chosenId={objective?.chosenId ?? null}
        onPick={(o) => onPick(o)}
        lang="en"
        groupLabel="Choose the correct meaning"
      />
    </div>
  );
}

function SpeakingRunner({ item, objective, setObjective, confidence, setConfidence, apiKey, mockMode, level }) {
  // record → transcribe → validate ASR → AI evaluate → numeric objective
  // score. Any infrastructure failure ends the item as unscored/unavailable —
  // never as incorrect. The learner's confidence is captured separately.
  const [stage, setStage] = useState('idle'); // idle|ready|recording|processing|awaiting-confidence
  const [tappedMic, setTappedMic] = useState(false);
  const [note, setNote] = useState(null);
  const recorder = useRecorder({
    onComplete: async (blob) => {
      setStage('processing');
      try {
        const transcript = await transcribe(apiKey, blob, { mock: mockMode });
        const words = String(transcript || '').split(/\s+/).filter(Boolean);
        if (!words.length) {
          // ASR validation: an empty recognition is not learner failure.
          setObjective({ status: 'unavailable', asrConfidence: 'none', reason: 'empty-transcription' });
          setStage('awaiting-confidence');
          return;
        }
        const evaluation = await evaluateTurn(apiKey, {
          scenario: { title: 'Held-out speaking check', opener: item.content?.prompt || '', curveball: null },
          history: [],
          userText: transcript,
          level,
          mock: mockMode,
        });
        const raw = Number(evaluation?.scores?.overall);
        if (Number.isFinite(raw)) {
          // A numeric valid score makes the item scored — success alone does not.
          setObjective({
            status: 'scored',
            aiScore: Math.max(0, Math.min(100, Math.round(raw))),
            asrConfidence: words.length >= 3 ? 'usable' : 'low',
          });
        } else {
          setObjective({ status: 'unscored', asrConfidence: words.length >= 3 ? 'usable' : 'low', reason: 'non-numeric-evaluation' });
        }
      } catch (e) {
        setObjective({ status: 'unscored', reason: friendlyError(e).slice(0, 120) });
      }
      setStage('awaiting-confidence');
    },
  });

  // A denied/unavailable microphone resolves (not rejects) inside the
  // recorder; surface it as an explicit unavailable measurement.
  useEffect(() => {
    if (recorder.error && !objective) {
      setObjective({ status: 'unavailable', reason: 'microphone-unavailable' });
      setStage('awaiting-confidence');
    }
  }, [recorder.error, objective]);
  // An evaluation pipeline that never resolves (offline, hung API, silent
  // recorder) must NOT trap the check: after a bounded wait the attempt is
  // recorded unscored — infrastructure failure, never learner failure.
  useEffect(() => {
    if (stage !== 'processing' || objective) return undefined;
    const t = setTimeout(() => {
      if (!objective) {
        setObjective({ status: 'unscored', reason: 'evaluation-timeout' });
        setStage('awaiting-confidence');
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [stage, objective]);
  // A microphone that opens but never produces media is equally an
  // infrastructure failure — surface it instead of trapping the learner.
  useEffect(() => {
    if (stage !== 'ready' || objective || recorder.recording || !tappedMic) return undefined;
    const t = setTimeout(() => {
      if (!objective && !recorder.recording) {
        setObjective({ status: 'unavailable', reason: 'microphone-silent' });
        setStage('awaiting-confidence');
      }
    }, 10000);
    return () => clearTimeout(t);
  }, [stage, objective, recorder.recording, tappedMic]);

  return (
    <div className="space-y-4">
      <p className="text-center text-[11px] text-ink3">Speaking task — respond aloud. Recorded for measurement only.</p>
      <p className="text-center text-lg font-bold text-ink" lang="fr">{item.content?.prompt}</p>
      {stage === 'idle' && (
        <div className="grid place-items-center">
          <button onClick={() => setStage('ready')} data-testid="start-speaking-attempt" className="btn btn-primary min-h-12 px-6 rounded-xl text-sm">I'm ready</button>
        </div>
      )}
      {stage === 'ready' && !objective && (
        <div className="grid place-items-center gap-2">
          <button onClick={() => { setTappedMic(true); recorder.start().catch(() => { if (!objective) { setObjective({ status: 'unavailable', reason: 'microphone-unavailable' }); setStage('awaiting-confidence'); } }); }} aria-label="Record my speaking attempt" className="btn btn-primary w-16 h-16 rounded-full grid place-items-center">
            <Mic size={22} />
          </button>
          <p className="text-[11px] text-ink3">Tap, speak, then tap again to stop.</p>
        </div>
      )}
      {recorder.recording && (
        <div className="grid place-items-center gap-2">
          <button onClick={() => { setStage('processing'); recorder.stop(); }} aria-label="Stop recording" className="rec-pulse w-16 h-16 rounded-full bg-accent text-onaccent grid place-items-center">
            <span className="w-5 h-5 rounded-sm bg-onaccent" />
          </button>
          <p className="text-[11px] text-ink3 tabular-nums">{recorder.elapsed}s</p>
        </div>
      )}
      {stage === 'processing' && <p className="text-center text-sm text-ink2">Evaluating your attempt…</p>}
      {objective && (
        <p className="text-center text-[11px] text-ink3">
          {objective.status === 'scored'
            ? 'Attempt scored for research. Confidence below is separate from the score.'
            : objective.status === 'unavailable'
              ? `Recording unavailable (${objective.reason || 'device'}) — not counted against you.`
              : `Attempt recorded as unscored (${objective.reason || 'evaluation'}), never as wrong.`}
        </p>
      )}
      {objective && stage === 'awaiting-confidence' && (
        <ConfidenceChips value={confidence} onChange={setConfidence} />
      )}
      {note && <p className="text-[11px] text-amber-700 text-center">{note}</p>}
    </div>
  );
}

const RUNNERS = {
  vocabulary: ChoiceRunner,
  'vocabulary-prod': (p) => <TypedRunner {...p} hint="Write this in French — spelling counts." />,
  grammar: (p) => <TypedRunner {...p} hint="Write the correct form — no hints here, by design." />,
  listening: ListeningRunner,
  reading: ReadingRunner,
  speaking: SpeakingRunner,
};

export default function HeldOutCheck({ check, onDone, apiKey, mockMode, level, ttsRate = 1 }) {
  const items = check?.items || [];
  const [idx, setIdx] = useState(0);
  // Per-item evidence state machine (kept across items in a ref for finals).
  const [objective, setObjective] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const startedRef = useRef(Date.now());
  const evidenceRef = useRef([]);

  const item = items[idx];
  const isSpeaking = item?.skill === 'speaking';
  const Runner = item ? (RUNNERS[item.skill] || ChoiceRunner) : null;

  // Finalise the current item: objective result + separate confidence.
  const finalise = () => {
    if (!item || !objective) return;
    evidenceRef.current.push({
      sourceItemId: item.sourceItemId,
      skill: item.skill,
      cefr: item.cefr ?? null,
      status: objective.status,
      correct: objective.correct ?? null,
      aiScore: objective.aiScore ?? null,
      asrConfidence: objective.asrConfidence ?? null,
      confidence,
      reason: objective.reason ?? null,
      matchedAccept: objective.matchedAccept ?? null,
      at: new Date().toISOString(),
    });
    if (idx + 1 >= items.length) {
      const perItem = evidenceRef.current;
      const scored = perItem.filter((p) => p.status === 'scored' && p.correct != null);
      const correct = scored.filter((p) => p.correct).length;
      const speakingScored = perItem.filter((p) => p.skill === 'speaking' && p.status === 'scored' && typeof p.aiScore === 'number');
      onDone?.({
        correct,
        total: perItem.length,
        quizScore: scored.length ? Math.round((correct / scored.length) * 100) : null,
        unscored: perItem.filter((p) => p.status !== 'scored').length,
        speakingMean: speakingScored.length ? Math.round(speakingScored.reduce((a, p) => a + p.aiScore, 0) / speakingScored.length) : null,
        secondsSpent: Math.round((Date.now() - startedRef.current) / 1000),
        perItem,
      });
      return;
    }
    setIdx((i) => i + 1);
    setObjective(null);
    setConfidence(null);
  };

  // Non-speaking skills: objective result → optional confidence → continue.
  const onPickChoice = (o) => {
    if (objective) return;
    setObjective({ chosenId: o.id, status: 'scored', correct: o.id === item.correctOptionId });
  };
  const onTyped = ({ draft, matched }) => {
    if (objective) return;
    setObjective({
      status: 'scored',
      correct: matched != null,
      matchedAccept: matched,
    });
  };

  if (!items.length) {
    return (
      <div className="h-full grid place-items-center px-4">
        <p className="text-sm text-ink2">No held-out material available today.</p>
      </div>
    );
  }

  const showContinue = objective && (isSpeaking ? true : true);

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
          {Runner && (
            <Runner
              key={item.assessmentId || item.sourceItemId || idx}
              item={item}
              objective={objective}
              setObjective={setObjective}
              confidence={confidence}
              setConfidence={setConfidence}
              apiKey={apiKey}
              mockMode={mockMode}
              level={level}
              ttsRate={ttsRate}
              onPick={onPickChoice}
              onAnswer={onTyped}
            />
          )}
          {showContinue && !isSpeaking && (
            <div className="space-y-2">
              <ConfidenceChips value={confidence} onChange={setConfidence} />
              <button onClick={finalise} className="btn btn-primary w-full min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
                {idx + 1 >= items.length ? 'Finish check' : 'Record & next'} <ChevronRight size={14} />
              </button>
            </div>
          )}
          {showContinue && isSpeaking && (
            <button onClick={finalise} className="btn btn-primary w-full min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
              {idx + 1 >= items.length ? 'Finish check' : 'Record & next'} <ChevronRight size={14} />
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
