import { useState, useEffect } from 'react';
import { weakestPhonemes, getPhonemeProfile, minimalPairsFor } from '../lib/phonemeProfile';
import { contentLang } from '../lib/content/active.js';
import { CheckCircle, Target, Volume2, ArrowRight } from './icons';
import { SpeakButton } from './ui';

/**
 * PronunciationInsightsPanel - Shows deep phoneme-level feedback
 * Replaces generic "pronunciation score" with specific sound targets
 *
 * The panel used to end in two buttons that did nothing: "Practice this
 * sound" had no handler, and "Start Minimal Pair Drill" was a div with a
 * pointer cursor and no behaviour at all. The studio already has the drill -
 * a contrast pair for the sound, with the two words to listen to - so the
 * panel now shows it instead of promising it.
 */
export default function PronunciationInsightsPanel({ mode = 'read-aloud' }) {
  const [activePhonemes, setActivePhonemes] = useState([]);
  const [recentAttempts, setRecentAttempts] = useState(null);
  const lang = contentLang();

  useEffect(() => {
    // Load phoneme data when component mounts
    try {
      const profile = getPhonemeProfile(lang);
      const weaknessData = weakestPhonemes(3, lang);

      setActivePhonemes(weaknessData.filter(p => p.stats.attempts > 0));

      // Calculate recent attempt summary
      const totalAttempts = Object.values(profile || {}).reduce((sum, stats) => sum + (stats.attempts || 0), 0);
      const totalMisses = Object.values(profile || {}).reduce((sum, stats) => sum + (stats.misses || 0), 0);

      setRecentAttempts({
        totalAttempts,
        totalMisses,
        overallWeakness: totalAttempts > 0 ? totalMisses / totalAttempts : 0,
      });
    } catch (error) {
      console.error('Error loading phoneme data:', error);
    }
  }, [mode, lang]);

  return (
    <section className="space-y-4">
      {/* Overall Phoneme Health */}
      <PhonemeHealthSummary attempts={recentAttempts} />

      {/* Weak Sounds Breakdown */}
      {activePhonemes.length > 0 && (
        <>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink2">Your Weakest Sounds</h3>
          <div className="space-y-3">
            {activePhonemes.map((phoneme, index) => (
              <PhonemeDetailCard
                key={phoneme.id}
                phoneme={phoneme}
                rank={index + 1}
                lang={lang}
              />
            ))}
          </div>

          {/* Recommended Practice */}
          <PracticeRecommendation weakPhoneme={activePhonemes[0]} lang={lang} />
        </>
      )}

      {/* Empty State */}
      {activePhonemes.length === 0 && (
        <EmptyStateMessage />
      )}
    </section>
  );
}

/**
 * Summary card showing overall phoneme health metrics
 */
function PhonemeHealthSummary({ attempts }) {
  if (!attempts) return null;

  const weaknessRate = attempts.totalAttempts > 0
    ? Math.round((attempts.totalMisses / attempts.totalAttempts) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2a4 4 0 00-4 4v4a4 4 0 008 0V6a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 9v1a7 7 0 0014 0V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm text-ink2">
            You miss {attempts.totalMisses} out of {attempts.totalAttempts} attempts ({weaknessRate}%). Focus on the sounds below to improve.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Detailed card for individual phoneme weakness
 */
function PhonemeDetailCard({ phoneme, rank, lang }) {
  const { id, label, tip } = phoneme;
  const { attempts, misses, weak } = phoneme.stats || { attempts: 0, misses: 0, avgConf: 0.5, weak: false };
  const [open, setOpen] = useState(false);

  if (attempts === 0) return null;

  const successRate = ((attempts - misses) / attempts) * 100;

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${
      weak
        ? 'border-amber/30 bg-amber/5'
        : 'border-success/20 bg-success/5'
    }`}>
      <div className="flex items-start gap-3">
        {/* Rank indicator */}
        <div className={`flex-shrink-0 rounded-full px-3 py-1 text-center text-xs font-bold ${
          rank <= 2
            ? 'bg-amber-500/20 text-amber-600'
            : 'bg-surface2 text-ink3'
        }`}>
          #{rank}
        </div>

        {/* Phoneme info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-ink">{label}</h4>
            {weak && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                <Target size={10} /> Needs Work
              </span>
            )}
          </div>

          {/* Success rate bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-ink2 mb-1">
              <span>Success rate</span>
              <span className="font-mono font-medium">{Math.round(successRate)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  successRate >= 70 ? 'bg-success'
                    : successRate >= 50 ? 'bg-primary'
                    : 'bg-amber500'
                }`}
                style={{ width: `${successRate}%` }}
              />
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-lg bg-surface2 p-3">
            <p className="text-xs text-ink2 leading-snug">
              <span className="font-semibold text-ink">Tip:</span> {tip}
            </p>
          </div>

          {/* Practice: opens the real contrast drill for this sound */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2 inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
          >
            {open ? 'Hide the contrast pair' : 'Practice this sound'} <ArrowRight size={12} />
          </button>
          {open && <ContrastDrill phonemeId={id} label={label} lang={lang} />}
        </div>

        {/* Icon indicating status */}
        <div className={`flex-shrink-0 rounded-full p-2 ${
          weak ? 'bg-amber-500/10' : 'bg-success/10'
        }`}>
          {weak ? (
            <Target size={20} className="text-amber500" />
          ) : (
            <CheckCircle size={20} className="text-success" />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The drill: a pair of words that differ only in the sound, with a button to
 * hear each one. These are the pairs the studio has authored for that sound
 * (src/lib/phonemeProfile.js) - not a promise to fetch one later.
 */
function ContrastDrill({ phonemeId, label, lang }) {
  const pairs = minimalPairsFor(phonemeId);
  const [index, setIndex] = useState(0);

  if (!pairs || !pairs.length) {
    return (
      <p className="mt-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-[11px] text-ink3 leading-snug">
        There is no contrast pair written for {label} yet. The tip above is the help for it.
      </p>
    );
  }

  const pair = pairs[index % pairs.length];

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface2 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Contrast pair</p>
      <p className="text-sm text-ink" lang={lang}>{pair[0]} — {pair[1]}</p>
      <div className="flex items-center gap-2">
        <SpeakButton text={pair[0]} label={pair[0]} />
        <SpeakButton text={pair[1]} label={pair[1]} />
        {pairs.length > 1 && (
          <button
            onClick={() => setIndex((i) => (i + 1) % pairs.length)}
            className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs"
          >
            New pair
          </button>
        )}
      </div>
      <p className="text-[11px] text-ink3 leading-snug">
        Listen to both, then say them yourself. They differ only in {label}.
      </p>
    </div>
  );
}

/**
 * Recommendation based on strongest weakness
 */
function PracticeRecommendation({ weakPhoneme, lang }) {
  if (!weakPhoneme) return null;

  const { id, label } = weakPhoneme;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/20 p-2">
          <Volume2 size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Recommended Practice</h3>
          <p className="mt-1 text-ink">
            Focus on <strong>{label}</strong>. The pair below differs only in that sound — listen to both, then say them.
          </p>
          <ContrastDrill phonemeId={id} label={label} lang={lang} />
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state message when no data yet
 */
function EmptyStateMessage() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-8 text-center">
      <Volume2 size={40} className="mx-auto text-ink3 mb-3" />
      <h3 className="text-sm font-semibold text-ink">No pronunciation data yet</h3>
      <p className="mt-1 text-sm text-ink2">
        Complete some read-aloud or shadowing drills to identify your problem sounds.
      </p>
    </div>
  );
}
