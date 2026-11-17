import { useState, useEffect, useRef } from 'react';
import { compareTranscript } from '../lib/pronunciationCoach';
/**
 * PronunciationCoach - guided pronunciation practice demo.
 *
 * Honest by design: the browser's speech recognizer transcribes what was said
 * and we compare those words with the target phrase. There is no fabricated
 * "AI" analysis, no phoneme grading and no made-up scores.
 */
export default function PronunciationCoach({ open, onClose }) {
  const [isRecording, setIsRecording] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedPhrase, setSelectedPhrase] = useState('Bonjour, comment allez-vous aujourd\'hui?');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState('');

  const synth = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const recognitionRef = useRef(null);
  // The transcript is captured here on every onresult event. The Web Speech
  // API has no setTranscript() method and no readable .transcript property —
  // the old code called both, so `spoken` was always ''.
  const transcriptRef = useRef('');
  const pendingRef = useRef(false);
  const recordingRef = useRef(false);
  // Held in a ref so the recognition handlers (installed once in the effect)
  // always call the latest phrase-specific finish logic.
  const finishRef = useRef(() => {});

  // Available practice phrases categorized by difficulty
  const PHRASES = {
    beginner: [
      'Bonjour!',
      'Merci beaucoup.',
      'Je m\'appelle...',
      'Ça va bien.',
    ],
    intermediate: [
      'Je voudrais un café, s\'il vous plaît.',
      'Où est la gare, s\'il vous plaît?',
      'Combien ça coûte?',
      'Je parle un peu français.',
    ],
    advanced: [
      'Bonjour, comment allez-vous aujourd\'hui?',
      'Je suis très heureux de vous rencontrer.',
      'Pourriez-vous m\'expliquer ce concept?',
      'Il fait beau aujourd\'hui, n\'est-ce pas?',
    ],
  };

  finishRef.current = (transcript) => {
    // Deterministic, honest comparison — no simulated delay, no random score.
    setAnalysisResult(compareTranscript(selectedPhrase, transcript));
  };

  useEffect(() => {
    if (!open) return undefined;

    // Initialize Web Speech API recognition (real browser transcription).
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'fr-FR';

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          transcript += event.results[i][0].transcript;
        }
        transcriptRef.current = transcript;
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        recordingRef.current = false;
        setIsRecording(false);
        setError('Your browser could not transcribe that attempt. You can try again.');
      };

      recognition.onend = () => {
        recordingRef.current = false;
        setIsRecording(false);
        // The final result arrives before onend, so the ref now holds the
        // complete transcript. Only finish attempts the user actually started.
        if (pendingRef.current) {
          pendingRef.current = false;
          finishRef.current(transcriptRef.current);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      pendingRef.current = false;
      recordingRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [open]);

  const startRecording = async () => {
    if (!recognitionRef.current) {
      setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Visualize audio level (real microphone input)
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateAudioLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i += 1) {
          sum += dataArray[i];
        }
        setAudioLevel(Math.min(100, sum / bufferLength));

        if (recordingRef.current) {
          requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();

      transcriptRef.current = '';
      pendingRef.current = true;
      recordingRef.current = true;
      setError('');
      setAnalysisResult(null);
      setIsRecording(true);
      recognitionRef.current.start();
    } catch (err) {
      console.error('Microphone access denied:', err);
      pendingRef.current = false;
      recordingRef.current = false;
      setError('Microphone access is required for this practice. Please enable it in your browser settings.');
    }
  };

  const stopRecording = () => {
    // onend() finishes the attempt once the final transcript has arrived.
    recordingRef.current = false;
    setIsRecording(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const playNativeAudio = () => {
    if (!synth.current) return;

    synth.current.cancel();
    const utterance = new SpeechSynthesisUtterance(selectedPhrase);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9; // Slightly slower for learning

    synth.current.speak(utterance);
  };

  const selectRandomPhrase = () => {
    const categories = Object.keys(PHRASES);
    const category = PHRASES[categories[Math.floor(Math.random() * categories.length)]];
    setSelectedPhrase(category[Math.floor(Math.random() * category.length)]);
    setAnalysisResult(null);
    setError('');
    transcriptRef.current = '';
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-line bg-surface">
        <h2 className="text-lg font-bold text-ink">🎤 Guided Pronunciation Practice</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            disabled={!!analysisResult}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-accent text-onaccent hover:bg-accent/90'
            }`}
          >
            {isRecording ? (
              <span className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-white animate-ping" />
                Stop
              </span>
            ) : analysisResult ? (
              'Record Again'
            ) : (
              'Start Speaking'
            )}
          </button>
          <button
            onClick={playNativeAudio}
            disabled={isRecording}
            className="rounded-lg bg-surface2 px-3 py-2 text-sm font-medium text-ink hover:bg-surface3"
          >
            🔊 Listen
          </button>
          <button onClick={selectRandomPhrase} className="rounded-lg bg-surface2 px-3 py-2 text-sm font-medium text-ink hover:bg-surface3">
            🎲 Random
          </button>
          <button onClick={onClose} aria-label="Close pronunciation coach" className="rounded-lg p-2 text-ink2 hover:bg-surface2">
            ✕
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div role="alert" className="max-w-2xl mx-auto mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-ink">
            {error}
          </div>
        )}

        {!analysisResult && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Phrase Display */}
            <div className="text-center">
              <p className="text-sm text-ink2 mb-2">Practice this phrase:</p>
              <h3 className="text-2xl font-semibold text-ink mb-4">{selectedPhrase}</h3>
              <div className="flex justify-center gap-2 text-xs text-ink3">
                {Object.entries(PHRASES).map(([level, phrases]) => (
                  <button
                    key={level}
                    onClick={() => { setSelectedPhrase(phrases[Math.floor(Math.random() * phrases.length)]); setAnalysisResult(null); }}
                    className={`px-3 py-1 rounded-full ${
                      level === 'beginner' ? 'bg-emerald-500/10 text-emerald-600' :
                      level === 'intermediate' ? 'bg-blue-500/10 text-blue-600' :
                      'bg-purple-500/10 text-purple-600'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Honest description of what this tool actually does */}
            <div className="bg-surface2 p-4 rounded-xl border border-line">
              <p className="text-sm text-ink2">
                This is a <span className="font-semibold text-ink">guided practice demo</span>, not an AI accent grader.
                Your browser transcribes what you say; we then show which words of the target were recognised.
                No pronunciation score is produced.
              </p>
            </div>

            {/* Instructions */}
            <div className="bg-surface p-6 rounded-xl border border-line">
              <h4 className="font-semibold text-ink mb-3">How to practise:</h4>
              <ul className="space-y-2 text-sm text-ink2">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">✓</span>
                  Speak clearly and at a moderate pace
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">✓</span>
                  Read the entire phrase before recording
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">✓</span>
                  Focus on French-specific sounds (nasals, R, U)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">✓</span>
                  Don't worry about perfection - practice makes progress!
                </li>
              </ul>
            </div>

            {/* Audio Level Visualization */}
            <div className="bg-surface p-4 rounded-xl border border-line">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-ink2">Microphone Level</span>
                <span className="text-sm text-ink3">{Math.round(audioLevel)}%</span>
              </div>
              <div className="h-3 bg-surface3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-100"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {analysisResult && !analysisResult.available && (
          <div className="max-w-2xl mx-auto text-center py-12 space-y-4">
            <h3 className="text-lg font-semibold text-ink">No analysis available</h3>
            <p className="text-sm text-ink2">
              Nothing was recognised in that recording, so there is no word comparison to show.
              Try again, speaking a little closer to the microphone.
            </p>
            <button
              onClick={() => { setAnalysisResult(null); transcriptRef.current = ''; }}
              className="rounded-xl bg-accent text-onaccent px-6 py-3 font-semibold hover:bg-accent/90"
            >
              Try Again
            </button>
          </div>
        )}

        {analysisResult && analysisResult.available && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Honest word-recognition result — no score, no "out of 100" */}
            <div className="bg-surface p-6 rounded-xl border border-line">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-ink mb-1">Words recognised</h3>
                  <p className="text-sm text-ink2">Compared with the target phrase — not a pronunciation score.</p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-ink tabular-nums">
                    {analysisResult.matched} / {analysisResult.total}
                  </div>
                  <div className="text-sm text-ink3">words recognised</div>
                </div>
              </div>
            </div>

            {/* Word-by-word breakdown of what was recognised */}
            <div className="bg-surface p-6 rounded-xl border border-line">
              <h4 className="font-semibold text-ink mb-4">Word-by-word comparison</h4>
              <div className="flex flex-wrap gap-2">
                {analysisResult.targetWords.map((word, idx) => (
                  <span
                    key={idx}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      analysisResult.hits[idx]
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : 'bg-surface3 text-ink3 line-through'
                    }`}
                  >
                    {analysisResult.hits[idx] ? '✓' : '○'} {word}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-ink3">
                Underlined/struck-through words were not present in what the recognizer heard.
              </p>
            </div>

            {/* The real transcript */}
            <div className="bg-surface p-6 rounded-xl border border-line">
              <h4 className="font-semibold text-ink mb-2">What your browser heard</h4>
              <p className="text-sm text-ink2" lang="fr-FR">{analysisResult.heard}</p>
            </div>

            {/* Generic practice tips — clearly not derived from an analysis */}
            <div className="bg-surface p-6 rounded-xl border border-line">
              <h4 className="font-semibold text-ink mb-4">General practice tips</h4>
              <ul className="space-y-2">
                <li className="flex items-start gap-3 text-sm text-ink2">
                  <span className="text-purple-500 mt-1">•</span>
                  <span>Speak slower and enunciate each syllable clearly</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-ink2">
                  <span className="text-purple-500 mt-1">•</span>
                  <span>Focus on nasal sounds - let air escape through your nose</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-ink2">
                  <span className="text-purple-500 mt-1">•</span>
                  <span>Keep your lips rounded for "u" and "o" sounds</span>
                </li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => { setAnalysisResult(null); transcriptRef.current = ''; }}
                className="flex-1 bg-accent text-onaccent px-6 py-3 rounded-xl font-semibold hover:bg-accent/90 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-surface2 text-ink px-6 py-3 rounded-xl font-semibold hover:bg-surface3 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
