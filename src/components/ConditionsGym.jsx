import { useEffect, useMemo, useRef, useState } from 'react';
import { LISTENING_TRACKS } from '../lib/listening';
import { speakSegment, stopSpeaking, ttsSupported } from '../lib/tts';
import {
  CONDITIONS, playbackScript, conditionStage, noiseBedConfig,
} from '../lib/listeningConditions';
import { recordAttempt } from '../lib/authenticAudio';
import { getListeningProgression, saveListeningProgression } from '../lib/storage';
import { Play, Square, Check, X, ChevronLeft } from './icons';
import { SpeakButton } from './ui';

// Conditions gym — synthetic S6–S7 listening training.
//
// Real spontaneous/noisy recordings arrive through the audio pack; until
// then this drills the same SKILLS on synthetic conditions: hesitation-
// injected TTS, overlapping voices, and generated noise beds. Every surface
// labels the conditions as synthetic — nothing here pretends to be native.

export default function ConditionsGym({ ttsRate = 1, onBack }) {
  const [trackId, setTrackId] = useState(LISTENING_TRACKS[0]?.id || null);
  const [conditionId, setConditionId] = useState('hesitation');
  const [playing, setPlaying] = useState(false);
  const [playedOnce, setPlayedOnce] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [progression, setProgression] = useState(() => {
    try { return getListeningProgression(); } catch { return { currentStage: 1 }; }
  });
  const timersRef = useRef([]);
  const audioCtxRef = useRef(null);
  const bedNodesRef = useRef(null);
  const stopRef = useRef(() => {});

  const track = LISTENING_TRACKS.find((t) => t.id === trackId) || LISTENING_TRACKS[0];
  const lines = useMemo(() => (track?.lines || []).slice(0, 6), [track]);
  const condition = CONDITIONS[conditionId] || CONDITIONS.normal;
  const bedConfig = noiseBedConfig(conditionId);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  };

  const stopNoiseBed = () => {
    try { bedNodesRef.current?.src?.stop(); } catch { /* already stopped */ }
    bedNodesRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const startNoiseBed = () => {
    if (!bedConfig || !window.AudioContext && !window.webkitAudioContext) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Pink-ish (Paul Kellet filter) for ambient; brown (integrated) for busy.
    if (bedConfig.type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + 0.029591 * white;
        b1 = 0.985 * b1 + 0.032534 * white;
        b2 = 0.95 * b2 + 0.048056 * white;
        data[i] = (b0 + b1 + b2 + white * 0.05) * 3.5;
      }
    } else {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = bedConfig.lowpassHz;
    const gain = ctx.createGain();
    gain.gain.value = bedConfig.gain;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start();
    audioCtxRef.current = ctx;
    bedNodesRef.current = { src };
  };

  const stop = () => {
    stopRef.current();
    stopSpeaking();
    stopNoiseBed();
    setPlaying(false);
  };

  useEffect(() => () => stopRef.current?.(), []);

  const play = () => {
    if (!ttsSupported() || !lines.length) return;
    stopRef.current();
    stopSpeaking();
    stopNoiseBed();
    const script = playbackScript(conditionId, lines);
    const timers = [];
    let t = 0;
    for (const seg of script.segments) {
      t += seg.gapAfterMs;
      const delay = t;
      timers.push(setTimeout(() => {
        speakSegment(seg.text, {
          rate: ttsRate,
          voiceIndex: seg.voiceIndex,
          onEnd: () => {}, // sequencing is time-based; gaps don't depend on end
        });
      }, delay));
      t += 2600; // rough per-segment speaking window before the next starts
    }
    timersRef.current = timers;
    stopRef.current = () => { for (const tm of timers) clearTimeout(tm); };
    if (bedConfig) startNoiseBed();
    setPlaying(true);
    setPlayedOnce(true);
    // End state after the full script window + tail.
    const totalMs = script.totalGapMs + script.segments.length * 2600 + 800;
    timers.push(setTimeout(() => { setPlaying(false); }, totalMs));
  };

  const selfMark = (correct) => {
    const info = conditionStage(conditionId);
    try {
      const next = recordAttempt(progression, {
        itemId: `${conditionId}:${trackId}`,
        stage: info.stage,
        correct,
      });
      setProgression(saveListeningProgression(next));
    } catch { /* progression logging must never break practice */ }
  };

  const stage = conditionStage(conditionId);

  return (
    <div className="h-full overflow-y-auto nice-scroll px-4 py-5">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => { stop(); onBack?.(); }} aria-label="Back to listening" className="w-10 h-10 grid place-items-center rounded-full bg-surface2 text-ink2 hover:bg-line">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <h2 className="text-sm font-semibold text-ink">Conditions gym</h2>
            <p className="text-[11px] text-ink3">S6–S7 skills on synthetic conditions</p>
          </div>
          <span className="w-10" aria-hidden="true" />
        </div>

        <p className="text-[11px] text-ink3 text-center bg-surface2 border border-line rounded-xl px-3 py-2">
          Synthetic training: TTS with generated hesitations, overlap and noise —
          clearly not native recordings. Real spontaneous audio arrives via the
          audio pack (Settings → Developer panel).
        </p>

        {/* track + condition pickers */}
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink3">Transcript</span>
          <select value={trackId} onChange={(e) => { stop(); setTrackId(e.target.value); setShowTranscript(false); setPlayedOnce(false); }} className="w-full bg-surface border border-line rounded-xl px-3 py-2.5 text-sm text-ink">
            {LISTENING_TRACKS.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Condition">
          {Object.values(CONDITIONS).map((c) => (
            <button
              key={c.id}
              aria-pressed={conditionId === c.id}
              onClick={() => { stop(); setConditionId(c.id); setShowTranscript(false); }}
              className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                conditionId === c.id ? 'bg-ink text-bg border-ink' : 'bg-surface text-ink2 border-line hover:border-ink3'
              }`}
            >
              {c.label}{c.synthetic ? ' *' : ''}
            </button>
          ))}
        </div>

        {/* transport */}
        <div className="flex items-center justify-center gap-4 py-2">
          {playing ? (
            <button onClick={stop} aria-label="Stop" className="rec-pulse w-16 h-16 rounded-full bg-accent text-onaccent grid place-items-center active:scale-90 transition">
              <Square size={20} />
            </button>
          ) : (
            <button onClick={play} aria-label="Play with condition" className="btn btn-primary w-16 h-16 rounded-full">
              <Play size={20} />
            </button>
          )}
        </div>
        {stage && (
          <p className="text-[11px] text-ink3 text-center">
            Trains stage {stage.stage} skills — {stage.label}{stage.synthetic ? ' (synthetic)' : ''} · your ladder stage: {progression?.currentStage ?? 1}
          </p>
        )}

        {/* transcript + self-mark */}
        {playedOnce && (
          <div className="space-y-3 fade-in">
            <div className="bg-surface border border-line rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Transcript</h3>
                <button onClick={() => setShowTranscript((v) => !v)} className="text-[11px] font-semibold text-ink2 hover:text-ink min-h-8">
                  {showTranscript ? 'Hide' : 'Show'}
                </button>
              </div>
              {showTranscript ? (
                <ol className="space-y-1.5">
                  {lines.map((line, i) => (
                    <li key={i} className="text-sm text-ink" lang="fr">
                      {line.speaker && <span className="font-semibold text-ink3 mr-1.5">{line.speaker} —</span>}
                      {line.fr}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-ink3">Hidden — listen again, or reveal to check.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => selfMark(true)} className="btn btn-secondary min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
                <Check size={14} /> Caught it
              </button>
              <button onClick={() => selfMark(false)} className="btn btn-secondary min-h-11 rounded-xl text-sm inline-flex items-center justify-center gap-1.5">
                <X size={14} /> Too fast
              </button>
            </div>
            <p className="text-[11px] text-ink3 text-center">
              Self-marks feed the S1–S7 ladder (5 attempts at ≥80% unlock the next stage). SpeakButton for one more listen:
              {' '}<SpeakButton text={lines.map((l) => l.fr).join(' ')} label="Plain replay" />
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
