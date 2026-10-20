import { useState, useEffect } from 'react';
import { phonemesFor, weakestPhonemes, getPhonemeProfile } from '../lib/phonemeProfile';
import { CheckCircle, Target, Volume2, ArrowRight } from './icons';
import Chip from './Chip.jsx';

/**
 * PronunciationInsightsPanel - Shows deep phoneme-level feedback
 * Replaces generic "pronunciation score" with specific sound targets
 */
export default function PronunciationInsightsPanel({ mode = 'read-aloud' }) {
  const [activePhonemes, setActivePhonemes] = useState([]);
  const [recentAttempts, setRecentAttempts] = useState(null);

  useEffect(() => {
    // Load phoneme data when component mounts
    try {
      const profile = getPhonemeProfile();
      const weaknessData = weakestPhonemes(3);
      
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
  }, [mode]);

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
              />
            ))}
          </div>

          {/* Recommended Practice */}
          <PracticeRecommendation weakPhoneme={activePhonemes[0]} />
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
  if (!attempts || attempts.totalAttempts === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink2">Phoneme Health</h3>
        <p className="mt-2 text-sm text-ink2">Start practising read-aloud drills to identify your problem sounds.</p>
      </div>
    );
  }

  const weaknessRate = Math.round(attempts.overallWeakness * 100);
  const improvementRate = 100 - weaknessRate;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink2">Phoneme Health</h3>
          <p className="mt-1 text-sm text-ink2">Based on {attempts.totalAttempts} attempt{attempts.totalAttempts !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-ink">{improvementRate}%</div>
          <div className="text-xs text-ink2">strength score</div>
        </div>
      </div>

      {/* Progress ring visualization */}
      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-16 w-16">
          <svg className="h-full w-full" viewBox="0 0 36 36">
            <circle
              className="text-surface2"
              strokeWidth="3"
              strokeLinecap="round"
              cx="18"
              cy="18"
              r="16"
              fill="none"
            />
            <circle
              className="text-primary transition-all duration-500"
              strokeWidth="3"
              strokeLinecap="round"
              cx="18"
              cy="18"
              r="16"
              fill="none"
              strokeDasharray={`${improvementRate}, 100`}
              transform="rotate(-90 18 18)"
            />
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
function PhonemeDetailCard({ phoneme, rank }) {
  const { id, label, tip } = phoneme;
  const { attempts, misses, avgConf, weak } = phoneme.stats || { attempts: 0, misses: 0, avgConf: 0.5, weak: false };

  if (attempts === 0) return null;

  const successRate = ((attempts - misses) / attempts) * 100;
  const improvementScore = Math.round(avgConf * 100);

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

          {/* Practice button */}
          <button className="mt-2 inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90">
            Practice this sound <ArrowRight size={12} />
          </button>
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
 * Recommendation based on strongest weakness
 */
function PracticeRecommendation({ weakPhoneme }) {
  if (!weakPhoneme) return null;

  const { id, label } = weakPhoneme;
  
  // Would normally fetch minimal pair drill for this phoneme
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/20 p-2">
          <Volume2 size={20} className="text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Recommended Practice</h3>
          <p className="mt-1 text-ink">
            Focus on <strong>{label}</strong>. Try the minimal pair drill to contrast this sound with similar ones.
          </p>
          
          {/* Would load actual minimal pairs here */}
          <div className="mt-3 inline-flex rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 cursor-pointer">
            Start Minimal Pair Drill
          </div>
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
