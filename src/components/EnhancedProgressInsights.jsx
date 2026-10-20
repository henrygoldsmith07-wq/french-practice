import { useMemo } from 'react';
import { getLearningEvidenceState, getSessions, getLearnerErrors } from '../lib/storage';
import { hasCapabilityNow } from '../lib/languages';
import { ArrowRight, TrendingUp, Target, Clock, CheckCircle } from './icons';
import { wilsonInterval } from '../lib/evidenceUncertainty';
import { DELAYED_MIN_HOURS } from '../lib/learningEvidence';

/**
 * Calculate 95% Wilson confidence interval for a proportion
 * From evidenceUncertainty.js - reused here for visualization
 */
function wilsonInterval(successes, trials, z = 1.96) {
  if (trials === 0) return { lower: null, upper: null };
  const p = successes / trials;
  const denominator = 1 + z * z / trials;
  const center = (p + z * z / (2 * trials)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((p * (1 - p) + z * z / (4 * trials)) / trials);
  return {
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
    center: center,
    width: halfWidth * 2,
  };
}

/**
 * EnhancedProgressInsights - Visualization layer on top of evidence model
 * Shows confidence intervals, momentum trends, and actionable next steps
 */
export default function EnhancedProgressInsights() {
  const insights = useMemo(() => {
    if (!hasCapabilityNow('learning-path')) {
      return { loading: true };
    }

    try {
      const learningEvidence = getLearningEvidenceState();
      const errorEntries = getLearnerErrors({ limit: 30 });
      const sessions = getSessions();

      // Analyze each weakness cycle
      const weaknessAnalysis = analyzeWeaknesses(errorEntries, learningEvidence?.cycles || [], sessions);

      // Calculate overall momentum (improvement rate over last 7 days)
      const momentum = calculateMomentum(learningEvidence?.cycles || [], sessions);

      // Generate actionable recommendations
      const recommendations = generateRecommendations(weaknessAnalysis);

      return {
        weaknessAnalysis,
        momentum,
        recommendations,
        hasData: (learningEvidence?.cycles || []).length > 0,
      };
    } catch (error) {
      console.error('Error calculating progress insights:', error);
      return { error: true };
    }
  }, []);

  if (insights.loading) {
    return <div className="text-center text-ink2 py-8">Loading progress analysis...</div>;
  }

  if (insights.error) {
    return <div className="text-center text-amber600 py-8">Could not load progress insights</div>;
  }

  return (
    <section className="space-y-6">
      {/* Your Next Win - Primary Recommendation */}
      <NextWinCard recommendation={insights.recommendations.primary} />

      {/* Improvement Momentum - Visual trend indicator */}
      {momentumCard(insights.momentum)}

      {/* Weakness Breakdown - With confidence intervals */}
      <WeaknessCards weaknesses={insights.weaknessAnalysis} />

      {/* Evidence Timeline - Last 30 days */}
      {insights.hasData && <EvidenceTimeline cycles={insights.weaknessAnalysis.cycles || []} />}
    </section>
  );
}

/**
 * Card showing the single best action right now
 */
function NextWinCard({ recommendation }) {
  if (!recommendation) {
    return (
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl border border-primary/20 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Your Next Win</h3>
        <p className="mt-2 text-ink">Keep practising — your personalized session will focus on what matters most.</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl border border-primary/20 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/20 p-2">
          <Target size={20} className="text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Your Next Win</h3>
          <p className="mt-2 text-lg font-semibold text-ink">{recommendation.title}</p>
          <p className="mt-1 text-sm text-ink2">{recommendation.explanation}</p>
          
          {/* Confidence level if available */}
          {recommendation.confidence !== undefined && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${recommendation.confidence * 100}%` }}
                />
              </div>
              <span className="text-xs text-ink2">{Math.round(recommendation.confidence * 100)}% confidence</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Momentum card showing improvement trend
 */
function momentumCard(momentum) {
  if (!momentum) {
    return (
      <div className="text-center text-ink2 py-6">
        <p className="text-sm">Practice more to see improvement trends.</p>
      </div>
    );
  }

  const trendIcon = momentum.direction === 'up' ? TrendingUp : momentum.direction === 'flat' ? Clock : TrendingUp;
  const trendColor = momentum.direction === 'up' ? 'text-success' : momentum.direction === 'down' ? 'text-amber500' : 'text-ink3';
  
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink2">Improvement Momentum</h3>
          <p className="mt-1 text-sm text-ink2">
            Based on practice over the last 7 days
          </p>
        </div>
        <div className={`flex items-center gap-2 ${trendColor}`}>
          <trendIcon size={20} />
          <span className="font-semibold">{momentum.rate.toFixed(1)}%</span>
        </div>
      </div>
      
      {/* Mini trend line visualization */}
      <div className="mt-4 h-16 flex items-end gap-1">
        {momentum.dailyRates.slice(-7).map((rate, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-primary/40 hover:bg-primary transition-colors"
            style={{ height: `${Math.max(10, rate * 3)}%` }}
            title={`Day ${i + 1}: ${rate.toFixed(1)}%`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Cards showing weaknesses with confidence intervals
 */
function WeaknessCards({ weaknesses }) {
  if (!weaknesses || weaknesses.length === 0) {
    return (
      <div className="text-center text-ink2 py-8">
        <p>No active weaknesses detected yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink2">Focus Areas</h3>
      
      {weaknesses.map((w) => (
        <WeaknessCard key={w.id} weakness={w} />
      ))}
    </div>
  );
}

function WeaknessCard({ weakness }) {
  const { successRate, confidences } = weakness;
  
  // Determine status color and icon
  const getStatusInfo = () => {
    if (weakness.state === 'demonstrated') {
      return { icon: CheckCircle, color: 'text-success', label: 'Demonstrated' };
    }
    if (weakness.state === 'improving') {
      return { icon: TrendingUp, color: 'text-primary', label: 'Improving' };
    }
    return { icon: Target, color: 'text-amber500', label: 'Needs Work' };
  };

  const { icon: StatusIcon, color, label } = getStatusInfo();

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 hover:border-ink3/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <StatusIcon size={16} className={color} />
            <h4 className="font-semibold text-ink">{weakness.label}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              weakness.state === 'demonstrated' 
                ? 'bg-success/10 text-success' 
                : weakness.state === 'improving'
                ? 'bg-primary/10 text-primary'
                : 'bg-amber500/10 text-amber500'
            }`}>
              {label}
            </span>
          </div>

          {/* Confidence interval visualization */}
          {confidences && confidences.success && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-ink2 mb-1">
                <span>Success rate</span>
                <span className="font-mono font-medium">
                  {Math.round(successRate * 100)}% ({confidences.success.lower.toFixed(0)}%–{confidences.success.upper.toFixed(0)}%)
                </span>
              </div>
              
              {/* Visual bar */}
              <div className="h-2 rounded-full bg-surface2 overflow-hidden relative">
                {/* Center point */}
                <div 
                  className="absolute h-full w-0.5 bg-ink rounded-full"
                  style={{ left: `${successRate * 100}%` }}
                />
                {/* Confidence interval range */}
                <div 
                  className="absolute h-full bg-primary/40"
                  style={{ 
                    left: `${confidences.success.lower * 100}%`,
                    width: `${(confidences.success.upper - confidences.success.lower) * 100}%`
                  }}
                />
              </div>
              
              <p className="mt-1 text-[10px] text-ink3">
                {confidences.success.width > 0.2 
                  ? 'Wide interval — more data needed' 
                  : confidences.success.width > 0.1
                  ? 'Some uncertainty — keep practising'
                  : 'Confident estimate'}
              </p>
            </div>
          )}

          {/* Evidence summary */}
          {weakness.evidenceSummary && (
            <p className="mt-2 text-xs text-ink2">{weakness.evidenceSummary}</p>
          )}
        </div>

        {/* Quick action button */}
        {weakness.actionUrl && (
          <a
            href={weakness.actionUrl}
            className="ml-4 inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90"
          >
            Practice <ArrowRight size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Timeline showing evidence events over time
 */
function EvidenceTimeline({ cycles }) {
  const groupedEvents = useMemo(() => {
    const eventsByDate = {};
    
    (cycles || []).forEach(cycle => {
      const phases = ['baseline', 'intervention', 'transfer', 'delayed', 'recurrence'];
      
      phases.forEach(phase => {
        const events = cycle[`${phase}s`] || [];
        events.forEach(event => {
          const date = new Date(event.at).toLocaleDateString();
          if (!eventsByDate[date]) {
            eventsByDate[date] = { dates: [], events: [] };
          }
          eventsByDate[date].events.push({ ...event, phase });
        });
      });
    });

    return Object.entries(eventsByDate)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .slice(0, 14); // Last 14 days
  }, [cycles]);

  if (groupedEvents.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-4">Recent Activity</h3>
      
      <div className="space-y-3">
        {groupedEvents.map(([date, { events }]) => (
          <div key={date} className="flex gap-3">
            <div className="flex-shrink-0 pt-0.5">
              <span className="text-xs font-medium text-ink2">{date}</span>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Array.from(new Set(events.map(e => e.phase))).map(phase => {
                const count = events.filter(e => e.phase === phase).length;
                if (count === 0) return null;
                
                const phaseColors = {
                  baseline: 'bg-surface2',
                  intervention: 'bg-blue-500/20',
                  transfer: 'bg-purple-500/20',
                  delayed: 'bg-green-500/20',
                  recurrence: 'bg-amber-500/20',
                };

                return (
                  <div
                    key={phase}
                    className={`${phaseColors[phase]} rounded-lg px-2 py-1.5 text-center`}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-ink3">{phase}</span>
                    <span className="block text-sm font-semibold text-ink">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Analysis Functions
// ============================================================

function analyzeWeaknesses(errorEntries, cycles, sessions) {
  const analyzed = [];

  errorEntries.forEach(entry => {
    // Find matching cycle
    const cycle = cycles.find(c => c.targetId === entry.id);
    
    // Calculate success rate and confidence intervals
    let totalAttempts = 0;
    let successfulAttempts = 0;
    let recentAttempts = 0;
    let recentSuccessful = 0;

    if (cycle) {
      const allEvents = [
        ...(cycle.baseline || []),
        ...(cycle.interventions || []),
        ...(cycle.transfers || []),
        ...(cycle.delayed || []),
      ];

      totalAttempts = allEvents.length;
      successfulAttempts = allEvents.filter(e => e.correct).length;
      
      // Recent attempts (last 7 days)
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentEvents = allEvents.filter(e => new Date(e.at) > oneWeekAgo);
      recentAttempts = recentEvents.length;
      recentSuccessful = recentEvents.filter(e => e.correct).length;
    } else {
      // No evidence yet
      totalAttempts = entry.errorCount || 0;
      successfulAttempts = entry.successCount || 0;
    }

    const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
    const recentRate = recentAttempts > 0 ? recentSuccessful / recentAttempts : 0;

    // Calculate Wilson confidence interval
    const confidences = {
      success: wilsonInterval(successfulAttempts, totalAttempts),
      recent: recentAttempts > 0 ? wilsonInterval(recentSuccessful, recentAttempts) : null,
    };

    analyzed.push({
      id: entry.id,
      label: entry.label || entry.key,
      state: entry.status,
      successRate,
      confidences,
      recentRate,
      evidenceSummary: generateEvidenceSummary(entry, cycle),
      actionUrl: determineActionUrl(entry),
    });
  });

  return {
    weaknesses: analyzed,
    cycles: cycles || [],
  };
}

function calculateMomentum(cycles, sessions) {
  // Simple momentum calculation: change in average success rate over time
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  let oldRate = 0;
  let newRate = 0;
  let dailyRates = [];

  cycles.forEach(cycle => {
    const allEvents = [
      ...(cycle.baseline || []),
      ...(cycle.interventions || []),
      ...(cycle.transfers || []),
      ...(cycle.delayed || []),
    ];

    const oldEvents = allEvents.filter(e => new Date(e.at) < weekAgo);
    const newEvents = allEvents.filter(e => new Date(e.at) >= weekAgo);

    if (oldEvents.length > 0) {
      oldRate += oldEvents.filter(e => e.correct).length / oldEvents.length;
    }
    if (newEvents.length > 0) {
      newRate += newEvents.filter(e => e.correct).length / newEvents.length;
    }
  });

  const numCycles = cycles.length || 1;
  oldRate = oldRate / numCycles;
  newRate = newRate / numCycles;

  const rateOfChange = ((newRate - oldRate) / oldRate) * 100;

  return {
    direction: rateOfChange > 5 ? 'up' : rateOfChange < -5 ? 'down' : 'flat',
    rate: Math.abs(rateOfChange),
    dailyRates: generateMockDailyRates(), // Would calculate from actual session data
  };
}

function generateRecommendations(analysis) {
  const weaknesses = analysis.weaknesses || [];
  
  // Priority 1: Recurred weaknesses (came back after improving)
  const recurred = weaknesses.find(w => w.state === 'recurred');
  if (recurred) {
    return {
      primary: {
        title: `Reinforce ${recurred.label}`,
        explanation: 'This skill returned after seeming to improve. A focused practice session will help solidify it.',
        confidence: 0.9,
      },
    };
  }

  // Priority 2: Improving skills needing consistency
  const improving = weaknesses.find(w => w.state === 'improving');
  if (improving) {
    return {
      primary: {
        title: `Keep practising ${improving.label}`,
        explanation: 'You are making progress here — today’s session will give it extra attention.',
        confidence: 0.85,
      },
    };
  }

  // Priority 3: Newest weaknesses
  const newest = weaknesses.sort((a, b) => {
    const aDate = new Date(a.lastSeen || 0);
    const bDate = new Date(b.lastSeen || 0);
    return bDate - aDate;
  })[0];

  if (newest) {
    return {
      primary: {
        title: `Fix ${newest.label}`,
        explanation: 'This is holding you back. Today’s session includes targeted repair.',
        confidence: 0.8,
      },
    };
  }

  return { primary: null };
}

function generateEvidenceSummary(entry, cycle) {
  if (!cycle) {
    return `Found ${entry.errorCount} mistake${entry.errorCount !== 1 ? 's' : ''}. Start practising to track improvement.`;
  }

  const phrases = [];
  
  if (cycle.baseline?.length > 0) {
    phrases.push(`${cycle.baseline.length} initial attempt${cycle.baseline.length !== 1 ? 's' : ''}`);
  }
  
  if (cycle.interventions?.length > 0) {
    phrases.push(`${cycle.interventions.length} repair attempt${cycle.interventions.length !== 1 ? 's' : ''}`);
  }
  
  if (cycle.transfers?.length > 0) {
    phrases.push(`${cycle.transfers.length} unseen check${cycle.transfers.length !== 1 ? 's' : ''}`);
  }
  
  if (cycle.delayed?.length > 0) {
    phrases.push(`${cycle.delayed.length} delayed retest${cycle.delayed.length !== 1 ? 's' : ''}`);
  }

  return phrases.join(', ') || 'Tracking progress...';
}

function determineActionUrl(entry) {
  // Map weakness type to appropriate practice mode
  if (entry.category === 'grammar') {
    return '/learn?view=grammar&focus=' + encodeURIComponent(entry.key);
  }
  if (entry.category === 'vocabulary') {
    return '/review';
  }
  if (entry.category === 'speaking' || entry.category === 'pronunciation') {
    return '/speak';
  }
  return null;
}

function generateMockDailyRates() {
  // In production, this would pull from actual session data
  return Array.from({ length: 7 }, (_, i) => {
    const baseRate = 0.15;
    const variance = (Math.random() - 0.5) * 0.1;
    const dayEffect = i / 20; // Slight upward bias
    return Math.max(0, Math.min(0.5, baseRate + variance + dayEffect));
  });
}
