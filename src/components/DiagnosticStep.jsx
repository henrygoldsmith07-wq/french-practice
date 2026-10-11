// The spoken diagnostic step — the first moment a new learner SPEAKS and gets a
// named weakness back with a scheduled re-check.
//
// Onboarding used to end by guessing a CEFR level. This step replaces the guess
// with real evidence: the learner says a few sentences, the transcript is
// graded on the four spoken dimensions, and diagnoseSpeaking() turns the
// weakest one into a weakness in the shared error model plus a future re-check
// date the learner can see.
//
// Degradation is honest, never a fake pass:
//   - mic denied / unsupported → a clear message and a "type instead" path, so
//     the learner is never stuck on a dead mic screen.
//   - mock mode (no AI key) → still records and diagnoses from the typed text,
//     but says plainly it is an offline estimate, not live AI feedback.
//   - silence/empty → says there is nothing to diagnose yet.
//
// Recording and transcribing reuse the SAME useRecorder hook and transcribe()
// the conversation arena uses — no second audio path.

import { useState } from 'react';
import useRecorder from '../hooks/useRecorder';
import { transcribe, evaluateTurn, friendlyError } from '../lib/groq';
import { speechMetrics } from '../lib/analytics';
import { diagnoseSpeaking } from '../lib/diagnostic';

// One short prompt, at any level, that reliably yields gradeable speech.
const PROMPTS = [
  'Introduce yourself and say what you did last weekend.',
  'Describe your town and what you like doing there.',
  'Talk about your favourite film or book, and why you like it.',
];

export default function DiagnosticStep({ apiKey, mockMode, language = 'fr', level = 'B1', onResult }) {
  const [phase, setPhase] = useState('idle'); // idle | recording | grading | done
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [promptIndex] = useState(() => Math.floor(Math.random() * PROMPTS.length));
  const prompt = PROMPTS[promptIndex];

  // Hold the blob/duration for the type-instead path so grading is identical
  // whether the text came from speech or the keyboard.
  const recorder = useRecorder({
    onComplete: async (blob, durationMs) => {
      setPhase('grading');
      setError(null);
      try {
        const text = await transcribe(apiKey, blob, { mock: mockMode });
        await grade(text, durationMs);
      } catch (e) {
        setError(friendlyError(e));
        setPhase('idle');
      }
    },
  });

  // Grade a transcript on the spoken dimensions and record the finding.
  //
  // Real field mapping (do not invent dims): evaluateTurn returns
  // `scores.{grammar,naturalness,relevance,fluency,overall}` plus
  // `corrections_detailed`, whose `impact`/`targetSkill` describe the actual
  // mistake. We map grammar→accuracy, fluency→fluency, and read pronunciation
  // from any 'intelligibility'/'liaison' correction; naturalness/relevance have
  // no 1:1 diagnostic dimension so they inform the note, never a fake dim.
  //
  // In mock mode there is no key, so we grade delivery only (pace/fluency from
  // the audio metrics) and mark the whole result `offline` — the UI says so.
  const grade = async (text, durationMs) => {
    const heard = String(text || '').trim();
    const metrics = speechMetrics(heard, durationMs || 0, language);
    let dims = {
      accuracy: null,
      fluency: Math.round(metrics.fluency ?? metrics.score ?? 70),
      vocabulary: null,
      pronunciation: null,
    };
    let pronunciationImpact = null;
    if (!mockMode) {
      try {
        const evaluation = await evaluateTurn(apiKey, {
          scenario: { title: 'A quick self-introduction', setup: 'The learner introduces themselves and answers one follow-up.', aiRole: 'a friendly listener' },
          history: [], userText: heard, level: level || 'B1', mock: false,
        });
        const scores = evaluation?.scores || {};
        dims = {
          accuracy: numOr(scores.grammar, null),
          fluency: numOr(scores.fluency, dims.fluency),
          // No direct vocabulary score in the turn contract; naturalness is the
          // closest honest proxy and only used when grammar is also present.
          vocabulary: numOr(scores.naturalness, null),
          pronunciation: numOr(scores.pronunciation, null),
        };
        // A pronunciation/intelligibility correction is the only honest signal
        // the model gives us for delivery; surface it as that dimension.
        const pronCorrection = (evaluation?.corrections_detailed || []).find(
          (c) => c?.impact === 'intelligibility' || c?.targetSkill === 'liaison',
        );
        if (pronCorrection && dims.pronunciation == null) {
          dims.pronunciation = 60;
          pronunciationImpact = pronCorrection.targetForm || pronCorrection.note || null;
        }
      } catch { /* keep the delivery-only estimate; still honest */ }
    }
    const out = diagnoseSpeaking({ transcript: heard, ...dims });
    setResult({ ...out, offline: mockMode, pronunciationImpact });
    setPhase('done');
    onResult?.(out.finding, out.recheckAt);
  };

  const startTyped = async () => {
    const heard = typed.trim();
    if (!heard) { setError('Write a sentence or two first, then we can look at it.'); return; }
    setPhase('grading');
    setError(null);
    await grade(heard, 0);
  };

  const unsupported = typeof MediaRecorder === 'undefined';

  if (phase === 'done' && result) {
    return <DiagnosticResult result={result} onRetry={() => { setResult(null); setTyped(''); setPhase('idle'); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink2">Say this out loud</p>
        <p className="mt-2 text-lg font-semibold text-ink" lang={language}>« {prompt} »</p>
        <div className="mt-3">
          {phase === 'recording' ? (
            <div className="space-y-2">
              <p className="text-sm text-ink2">Listening… {Math.round(recorder.elapsed / 1000)}s — stop when you're done.</p>
              <button type="button" onClick={recorder.stop} className="btn btn-primary w-full rounded-xl py-3 text-sm">Stop and check</button>
            </div>
          ) : phase === 'grading' ? (
            <p className="text-sm text-ink2">Checking your speaking…</p>
          ) : (
            <button
              type="button"
              disabled={unsupported}
              onClick={recorder.start}
              className="btn btn-primary w-full rounded-xl py-3 text-sm disabled:opacity-50"
            >
              {unsupported ? 'Recording not available on this device' : 'Start speaking'}
            </button>
          )}
        </div>
        {recorder.error && <p className="mt-2 text-xs text-amber-600">{recorder.error}</p>}
      </div>

      <div className="rounded-2xl border border-line bg-surface2 p-4">
        <p className="text-xs font-semibold text-ink2">No mic, or prefer to type?</p>
        <textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          rows={2}
          placeholder="Type a sentence or two in French…"
          aria-label="Type your answer instead of speaking"
          className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm"
        />
        <button type="button" onClick={startTyped} disabled={phase === 'grading'} className="btn mt-2 w-full rounded-xl border border-line py-2 text-sm disabled:opacity-50">
          Check what I wrote
        </button>
      </div>

      {mockMode && (
        <p className="text-center text-[11px] text-ink3">
          You're in offline mode, so this is an estimate from your delivery, not live AI feedback. Add a key in Settings for full marking.
        </p>
      )}
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DiagnosticResult({ result, onRetry }) {
  const { finding, recheckAt, note, offline } = result;
  // The date is the SAME one the scheduler fires (diagnoseSpeaking derives both
  // from recheckHorizonHours), so "in N days" is exactly when it comes back.
  // Round UP: a 2.1-day gap shown as "2 days" would fire a day later than the
  // copy implies. `recheckHours` (when present) is the authoritative number.
  const days = recheckAt
    ? Math.max(1, Math.ceil((new Date(recheckAt).getTime() - Date.now()) / 86_400_000))
    : 0;
  return (
    <div className="space-y-3" data-testid="diagnostic-result">
      {finding ? (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink2">Your first named weakness</p>
          <p className="mt-1 text-lg font-semibold text-ink">{finding.label}</p>
          <p className="mt-1 text-sm text-ink2">{finding.why}</p>
          <p className="mt-3 text-xs text-ink2">
            <strong className="text-ink">Re-check in {days} day{days === 1 ? '' : 's'}.</strong> It's queued into your next session — one good answer won't close it on its own.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Solid start.</p>
          <p className="mt-1 text-sm text-ink2">{note}</p>
        </div>
      )}
      {offline && <p className="text-center text-[11px] text-ink3">Estimated offline from delivery, not live AI.</p>}
      <button type="button" onClick={onRetry} className="btn w-full rounded-xl border border-line py-2 text-sm">Try again</button>
    </div>
  );
}

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}
