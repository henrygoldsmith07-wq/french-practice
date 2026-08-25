import { useMemo, useState, useEffect } from 'react';
import useRecorder from '../hooks/useRecorder';
import Waveform from './Waveform';
import { randomPoolSentence, toWords, diffWordsEq, displayHits } from '../lib/sentences';
import { transcribe, accentFeedback, friendlyError } from '../lib/groq';
import { speechMetrics } from '../lib/analytics';
import { activeLanguage } from '../lib/i18n';
import { recordSkillScore, recordPronunciationGap, getMistakeGraph, saveMistakeGraph } from '../lib/storage';
import { speak, stopSpeaking, adaptiveTtsRate } from '../lib/tts';
import { SpeakButton, Spinner } from './ui';
import { accentToleranceScore, calibratedConfidence, PHONEMES, getPhonemeProfile, nextMinimalPair, recordPhonemeAttempt, weakestPhonemes } from '../lib/phonemeProfile';
import { noiseGate } from '../lib/adaptivePractice';
import { evaluateFluency, PAUSE_MIN_MS } from '../lib/speakingEvaluation';
import { decodeToMono16k } from '../lib/acoustics';
import { analyzePhonology } from '../lib/phonologicalScore';
import { recordMistake, isAsrUncertain } from '../lib/mistakeGraph';
import { Mic, Square, Play, RefreshCw } from './icons';

// Pronunciation ("read aloud") and Shadowing ("listen & repeat") drills.
// The learner speaks the target sentence; Whisper transcribes; the word-level
// diff scores how much was recognized (a solid proxy for clarity), and the
// LLM turns the mis-transcriptions into specific accent feedback.

export default function Pronunciation({ mode, apiKey, mockMode, ttsRate, level, onXp, onActivity }) {
  const shadow = mode === 'shadow';
  const [sentence, setSentence] = useState(() => randomPoolSentence());
  const [played, setPlayed] = useState(false); // shadowing requires listening first
  const [phase, setPhase] = useState('idle'); // idle | scoring
  const [result, setResult] = useState(null); // { heard, accuracy, gained, hits, feedback }
  const [error, setError] = useState(null);

  // Navigating away mid-playback must not keep reading aloud over the next screen.
  useEffect(() => () => stopSpeaking(), []);

  const words = useMemo(() => sentence.text.split(/\s+/), [sentence]);

  const [phonemeTick, setPhonemeTick] = useState(0);
  const recorder = useRecorder({
    onComplete: async (blob, durationMs, acoustic = {}) => {
      setPhase('scoring');
      setError(null);
      // Noise gate
      const gate = noiseGate(recorder.peakDb ?? -20);
      if(!gate.ok){
        setError(gate.reason);
        setPhase('idle');
        return;
      }
      try {
        const heard = await transcribe(apiKey, blob, { mock: mockMode });
        // Accent-tolerant scoring folded into the alignment itself: if only
        // accents differ, the pair matches inside the LCS — so an inserted or
        // dropped word earlier in the sentence can't shift tolerance onto
        // the wrong word.
        const target = toWords(sentence.text);
        const heardWords = toWords(heard);
        const hits = diffWordsEq(target, heardWords, (t, h) => t === h || accentToleranceScore(t, h) != null);
        const matched = hits.filter(Boolean).length;
        const rawAcc = matched / Math.max(1, target.length);
        const accCal = calibratedConfidence(rawAcc);
        const accuracy = Math.round(accCal * 100);
        const gained = Math.max(1, Math.round(accuracy / 10));
        onXp(gained);
        recordSkillScore(shadow ? 'speaking' : 'pronunciation', accuracy);
        onActivity?.({
          type: 'pronunciation',
          mode: shadow ? 'shadowing' : 'pronunciation',
          score: accuracy,
          accuracy,
          label: shadow ? 'Shadowing clarity' : 'Read-aloud clarity',
        });
        // Phonological breakdown: decode the SAME blob we just transcribed
        // and measure rhythm, intonation, voicing and phoneme-family proxies
        // against the target text. Best-effort — never blocks scoring.
        let phonology = null;
        try {
          const audio = await decodeToMono16k(blob);
          phonology = analyzePhonology({ target: sentence.text, accuracy, audio });
          // Feed the phoneme profile: weakest phonological components count
          // as misses so the existing minimal-pair drills target them.
          if (phonology.weakest && PHONEMES.some((p) => p.id === phonology.weakest.id)) {
            recordPhonemeAttempt(phonology.weakest.id, { correct: phonology.weakest.score >= 60, confidence: 0.5 });
          }
          // Mistake graph: weak phonological components become structural
          // nodes (type: pronunciation). ASR uncertainty gate: if the audio
          // clearly contained speech but almost nothing was recognised, the
          // miss may be the recogniser's — keep the node, exclude from
          // mastery maths.
          const uncertain = isAsrUncertain({
            heardWords: toWords(heard).length,
            targetWords: target.length,
            voicedRatio: durationMs > 0 && Number.isFinite(acoustic?.voicedMs)
              ? Math.min(1, acoustic.voicedMs / durationMs)
              : null,
          });
          if (phonology.weakest && phonology.weakest.score < 60) {
            recordMistake(saveMistakeGraph(getMistakeGraph()), {
              type: 'pronunciation',
              concept: phonology.weakest.id,
              source: shadow ? 'shadowing' : 'read-aloud',
              attempt: sentence.text,
              corrected: null,
              confidence: accCal,
              asrUncertain: uncertain,
            });
          }
        } catch { /* audio decode unavailable — components stay null */ }
        const metrics = speechMetrics(heard, durationMs, activeLanguage().id);
        // Fluency: acoustic pausing + delivery + vocabulary variety, all local.
        const fluency = evaluateFluency({
          heard,
          durationMs,
          wpm: metrics.wpm,
          fillers: metrics.fillers,
          words: metrics.words,
          stats: acoustic,
        });
        // Phoneme bookkeeping (light): treat underlined = miss
        for(let i=0;i<target.length;i++) recordPhonemeAttempt('overall', { correct: hits[i], confidence: accCal, trackGap: false });
        recordPronunciationGap(`${mode}:sentence-clarity`, {
          label: 'Sentence clarity',
          score: accuracy,
          source: shadow ? 'shadowing' : 'read-aloud',
          context: { missedWords: target.filter((_, i) => !hits[i]).slice(0, 8), rawAccuracy: Math.round(rawAcc * 100), fluency: fluency.score, pauses: fluency.pausing.pauseCount },
        });
        setPhonemeTick(t=>t+1);
        void phonemeTick; void PHONEMES; void getPhonemeProfile;
        let feedback = '';
        try {
          feedback = await accentFeedback(apiKey, { target: sentence.text, heard, level, mock: mockMode });
        } catch {
          feedback = ''; // scoring still stands without coach commentary
        }
        setResult({ heard, accuracy, gained, hits: displayHits(sentence.text, hits), feedback, metrics, fluency, phonology, rawAcc: Math.round(rawAcc*100), calibrated: accuracy });
      } catch (e) {
        setError(friendlyError(e));
      }
      setPhase('idle');
    },
  });

  const play = (slow) => {
    stopSpeaking();
    const lvlRate = adaptiveTtsRate(level);
    speak(sentence.text, { rate: slow ? Math.min(lvlRate, 0.75) : lvlRate });
    setPlayed(true);
  };

  const next = () => {
    stopSpeaking();
    setSentence(randomPoolSentence(sentence.text));
    setPlayed(false);
    setResult(null);
    setError(null);
  };

  const canRecord = !shadow || played;

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink2 text-center">
        {shadow
          ? 'Listen to the native rhythm first, then repeat it as closely as you can.'
          : 'Read the sentence aloud, clearly and at a natural pace.'}
      </p>

      {/* the target sentence */}
      <div className="bg-surface border border-line rounded-2xl p-5 text-center space-y-3">
        <p className="text-[17px] text-ink leading-relaxed" lang="fr">
          {result
            ? words.map((w, i) => (
                <span key={i} className={result.hits[i] ? 'text-ink' : 'text-ink3 underline decoration-2 underline-offset-2'}>
                  {w}{' '}
                </span>
              ))
            : sentence.text}
        </p>
        <p className="text-xs text-ink3 italic">{sentence.translation}</p>
        <div className="flex justify-center gap-2">
          <button onClick={() => play(false)} className="btn btn-secondary min-h-10 px-4 rounded-xl text-xs">
            <Play size={12} /> {shadow && !played ? 'Listen first' : 'Hear it'}
          </button>
          <button onClick={() => play(true)} className="btn btn-secondary min-h-10 px-3 rounded-xl text-xs">
            0.75×
          </button>
        </div>
      </div>

      {/* record / score */}
      {recorder.recording ? (
        <div className="space-y-3">
          <Waveform analyserRef={recorder.analyserRef} peakDb={recorder.peakDb} elapsed={recorder.elapsed} />
          <button
            onClick={recorder.stop}
            aria-label="Stop and score"
            className="rec-pulse w-16 h-16 mx-auto rounded-full bg-accent text-onaccent grid place-items-center active:scale-90 transition"
          >
            <Square size={20} />
          </button>
        </div>
      ) : phase === 'scoring' ? (
        <div className="text-center"><Spinner label="Scoring your pronunciation…" /></div>
      ) : !result ? (
        <div className="text-center space-y-2">
          <button
            onClick={() => { setResult(null); recorder.start(); }}
            disabled={!canRecord}
            className="btn btn-primary min-h-12 px-8 rounded-xl text-sm"
          >
            <Mic size={15} /> {shadow ? 'Repeat it' : 'Read it aloud'}
          </button>
          {!canRecord && <p className="text-[11px] text-ink3">Play the sentence first</p>}
        </div>
      ) : (
        <div className="fade-in bg-surface border border-line rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-ink tabular-nums">{result.accuracy}%</span>
              <span className="text-xs text-ink2 ml-2">intelligibility</span>
            </div>
            <span className="text-xs text-ink2">
              {result.accuracy >= 90 ? 'Crystal clear.' : result.accuracy >= 65 ? 'Mostly understood.' : 'Hard to recognize — slow down and retry.'}
              {' '}+{result.gained} XP
            </span>
          </div>

          {/* Phonological breakdown: components with confidence tiers */}
          {result.phonology && result.phonology.components.some((c) => c.id !== 'intelligibility' && c.score != null) && (
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink2 mb-1">Phonological components</h4>
              {result.phonology.components.filter((c) => c.score != null).map((c) => (
                <div key={c.id} className="flex items-center gap-2" title={c.note}>
                  <span className="w-40 shrink-0 truncate text-xs text-ink">{c.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full rounded-full bg-ink" style={{ width: `${c.score}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-semibold text-ink tabular-nums">{c.score}</span>
                  <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded border ${
                    c.confidence === 'measured' ? 'border-emerald-200 text-emerald-700'
                      : c.confidence === 'estimated' ? 'border-amber-200 text-amber-700'
                        : 'border-line text-ink3'
                  }`}>{c.confidence}</span>
                </div>
              ))}
              {result.phonology.weakest && (
                <p className="text-[11px] text-review bg-reviewsoft rounded-lg px-2.5 py-1.5">
                  Tomorrow's drill: <span className="font-semibold">{result.phonology.weakest.label}</span> ({result.phonology.weakest.score}) — weakest component.
                  {result.phonology.weakest.id === 'r' || result.phonology.weakest.id === 'u-ou' || result.phonology.weakest.id.startsWith('nasal')
                    ? ' A minimal pair is queued in Phoneme focus.'
                    : result.phonology.weakest.id === 'rhythm' || result.phonology.weakest.id === 'intonation'
                      ? ' Shadowing targets exactly this.'
                      : ' Slow linked reading targets this.'}
                </p>
              )}
            </div>
          )}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink2 mb-1">The recognizer heard</h4>
            <p className="text-sm text-ink2" lang="fr">{result.heard || '—'}</p>
            <p className="text-[11px] text-ink3 mt-1">Underlined words above weren't recognized — they're your likely trouble spots.</p>
          </div>

          {/* delivery: pace, hesitations, pausing, vocabulary variety */}
          {result.metrics && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface2 rounded-xl px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Pace</p>
                <p className="text-lg font-bold text-ink tabular-nums leading-tight">
                  {result.metrics.wpm} <span className="text-[11px] font-normal text-ink3">wpm</span>
                </p>
                <p className="text-[11px] text-ink3">
                  {result.metrics.pace === 'measured' ? 'measured — build flow' : result.metrics.pace === 'fast' ? 'fast — mind clarity' : 'natural pace'}
                </p>
              </div>
              <div className="bg-surface2 rounded-xl px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Hesitations</p>
                <p className="text-lg font-bold text-ink tabular-nums leading-tight">{result.metrics.fillers}</p>
                <p className="text-[11px] text-ink3">
                  {result.metrics.fillers === 0 ? 'none heard — fluent' : 'filler word' + (result.metrics.fillers > 1 ? 's' : '')}
                </p>
              </div>
              {result.fluency && (
                <>
                  <div className="bg-surface2 rounded-xl px-3.5 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Pauses</p>
                    <p className="text-lg font-bold text-ink tabular-nums leading-tight">{result.fluency.pausing.pauseCount}</p>
                    <p className="text-[11px] text-ink3">
                      {result.fluency.pausing.longestPauseMs > 0
                        ? `longest ${(result.fluency.pausing.longestPauseMs / 1000).toFixed(1)}s`
                        : 'no stalls detected'}
                    </p>
                  </div>
                  <div className="bg-surface2 rounded-xl px-3.5 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Fluency</p>
                    <p className="text-lg font-bold text-ink tabular-nums leading-tight">
                      {result.fluency.score != null ? `${result.fluency.score}` : '—'}
                      {result.fluency.richness && <span className="text-[11px] font-normal text-ink3"> /100</span>}
                    </p>
                    <p className="text-[11px] text-ink3">
                      {result.fluency.richness ? `${result.fluency.richness.level} vocabulary` : 'short sample'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          {result.fluency && result.fluency.pausing.longestPauseMs > PAUSE_MIN_MS * 5 && (
            <p className="text-[11px] text-review bg-reviewsoft rounded-lg px-2.5 py-1.5" role="status">
              Coach: you stalled {(result.fluency.pausing.longestPauseMs / 1000).toFixed(1)}s mid-answer — link phrases with «et puis…» or «alors…» to keep the flow.
            </p>
          )}
          {result.feedback && (
            <div className="bg-surface2 border border-line rounded-xl px-3.5 py-2.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-ink3 mb-1">Accent coach</h4>
              <p className="text-xs text-ink2 leading-relaxed">{result.feedback}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setResult(null); }}
              className="btn btn-secondary flex-1 min-h-11 rounded-xl text-sm"
            >
              <Mic size={13} /> Try again
            </button>
            <button onClick={next} className="btn btn-primary flex-1 min-h-11 rounded-xl text-sm">
              <RefreshCw size={13} /> Next sentence
            </button>
          </div>
        </div>
      )}

      {(error || recorder.error) && (
        <p role="alert" className="text-xs text-ink text-center">{error || recorder.error}</p>
      )}
      <MinimalPairStrip level={level} />
      <PhonemeWeakStrip />
      <div className="text-center">
        <SpeakButton text={sentence.text} slow />
      </div>
    </div>
  );
}
function MinimalPairStrip({ level }){
  // Start from the learner's actual weakest contrast, not a hard-coded one —
  // the label and the audio must agree on the very first render.
  const weak = weakestPhonemes(1)[0];
  const phoneme = weak?.id || 'u-ou';
  const [pair, setPair] = useState(() => nextMinimalPair(phoneme));
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3">
      <div className="flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink3">Minimal pair · {phoneme}</p>
        <p className="text-sm text-ink" lang="fr">{pair[0]} — {pair[1]}</p>
      </div>
      <SpeakButton text={pair[0]} label={pair[0]} />
      <SpeakButton text={pair[1]} label={pair[1]} />
      <button onClick={()=> setPair(nextMinimalPair(phoneme))} className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs">New</button>
    </div>
  );
}
function PhonemeWeakStrip(){
  const weak = weakestPhonemes(3);
  if(!weak.length) return null;
  return (
    <div className="bg-surface2 border border-line rounded-xl px-3.5 py-2.5 space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink3">Phoneme focus</p>
      {weak.map(w=> (
        <div key={w.id} className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink">{w.label}</span>
          <span className="text-[11px] text-ink3">{w.stats.misses}/{w.stats.attempts}</span>
        </div>
      ))}
    </div>
  );
}
