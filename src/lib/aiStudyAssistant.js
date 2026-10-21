// AI Study Assistant - Personalized recommendations based on user data analysis
// Analyzes patterns in user progress, identifies weaknesses, suggests optimal
// study times, predicts retention risks, and provides actionable insights

// `getPhonemeProfile` lives in lib/phonemeProfile.js, not in storage.js — the
// import was pointing at the wrong module, so the bundler failed on it.
// `getSessionData` and `getVocabProgress` were imported but never used.
import { getPhonemeProfile } from './phonemeProfile.js';
import { analyzeTargetText } from './phonologicalScore';
import { wilsonInterval } from './evidenceUncertainty';

/**
 * Analyze user data and generate personalized recommendations
 */
export function generateAIRecommendations(userState) {
  const recommendations = [];
  
  // Analyze performance patterns
  const weakAreas = identifyWeakAreas(userState);
  weakAreas.forEach(area => {
    recommendations.push({
      type: 'focus_area',
      priority: area.priority,
      title: area.title,
      description: area.description,
      action: `Practice ${area.action}`,
      estimatedTime: area.estimatedTime,
    });
  });
  
  // Check for streak threats
  const streakRisk = assessStreakRisk(userState);
  if (streakRisk.level === 'high') {
    recommendations.push({
      type: 'motivation',
      priority: 'urgent',
      title: 'Streak at Risk!',
      description: `You haven't practiced in ${streakRisk.days}. Keep your streak alive!`,
      action: 'Complete a quick 5-minute session',
      estimatedTime: 5,
    });
  }
  
  // Optimal timing suggestions
  const bestTime = suggestOptimalTime(userState);
  if (bestTime) {
    recommendations.push({
      type: 'timing',
      priority: 'medium',
      title: 'Best Practice Time',
      description: bestTime.reason,
      action: `Set reminder for ${bestTime.time}`,
      estimatedTime: null,
    });
  }
  
  // Retention risk alerts
  const atRiskWords = predictRetentionRisks(userState);
  if (atRiskWords.length > 0) {
    recommendations.push({
      type: 'review',
      priority: 'high',
      title: `${atRiskWords.length} Words at Risk`,
      description: 'These vocabulary items need attention before they slip away',
      action: 'Review at-risk vocabulary',
      estimatedTime: atRiskWords.length * 2,
    });
  }
  
  return recommendations.sort((a, b) => priorityOrder(b.priority) - priorityOrder(a.priority));
}

/**
 * Identify weak areas based on phoneme confusion stats and vocab accuracy
 */
function identifyWeakAreas(state) {
  const weaknesses = [];
  
  // Phoneme weaknesses
  const phonemes = getPhonemeProfile();
  if (phonemes && phonemes.byLang) {
    Object.values(phonemes.byLang).forEach(langStats => {
      const weakPhonemes = Object.entries(langStats)
        .filter(([_, stats]) => (stats.misses / Math.max(1, stats.attempts)) > 0.3)
        .slice(0, 2);
      
      if (weakPhonemes.length > 0) {
        weaknesses.push({
          priority: 'high',
          title: 'Pronunciation Improvement Needed',
          description: `${weakPhonemes.length} sound contrasts need practice`,
          action: 'Complete pronunciation drills',
          estimatedTime: 10,
        });
      }
    });
  }
  
  // Vocab accuracy issues
  const lowAccuracyWords = state.lowAccuracyWords || [];
  if (lowAccuracyWords.length >= 5) {
    weaknesses.push({
      priority: 'high',
      title: 'Vocabulary Accuracy',
      description: `${lowAccuracyWords.length} words have <70% accuracy`,
      action: 'Review low-accuracy vocabulary',
      estimatedTime: lowAccuracyWords.length * 3,
    });
  }
  
  // Conversation hesitation
  if (state.conversationHesitationRate > 0.4) {
    weaknesses.push({
      priority: 'medium',
      title: 'Conversation Flow',
      description: 'You hesitate frequently during conversations',
      action: 'Try Quick Fire exercises',
      estimatedTime: 15,
    });
  }
  
  return weaknesses;
}

/**
 * Assess risk to maintaining daily streak
 */
function assessStreakRisk(state) {
  const lastSession = getLastActivityTimestamp(state);
  const hoursSinceLastSession = (Date.now() - lastSession) / (1000 * 60 * 60);
  const streakLength = state.streakCount || 0;
  
  let level = 'low';
  if (hoursSinceLastSession > 18 || (hoursSinceLastSession > 12 && streakLength >= 7)) {
    level = 'high';
  } else if (hoursSinceLastSession > 6 && streakLength >= 3) {
    level = 'medium';
  }
  
  return {
    level,
    days: Math.ceil(hoursSinceLastSession / 24),
    streakLength,
  };
}

/**
 * Suggest optimal practice time based on historical patterns
 */
function suggestOptimalTime(state) {
  const activityHours = state.activityByHour || {};
  const bestHour = Object.entries(activityHours)
    .sort((a, b) => b[1] - a[1])[0];
  
  if (!bestHour) return null;
  
  const hour = parseInt(bestHour[0]);
  const timeStr = formatTime(hour);
  
  // Weekend vs weekday adjustment
  const today = new Date();
  const dayOfWeek = today.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const adjustedTime = isWeekend ? adjustForWeekend(timeStr) : timeStr;
  
  return {
    time: adjustedTime,
    reason: isWeekend 
      ? 'Your weekend peak usage time' 
      : 'Your historical peak learning period',
  };
}

function adjustForWeekend(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  const adjustedHour = hour + 2; // Shift 2 hours later on weekends
  return `${String(adjustedHour % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Predict vocabulary retention risks using Wilson intervals
 */
function predictRetentionRisks(state) {
  const vocabEntries = state.vocabulary || [];
  const risky = [];
  
  for (const entry of vocabEntries) {
    const attempts = entry.reviews?.length || 0;
    if (attempts < 3) continue; // Need minimum data
    
    const correct = entry.reviews.filter(r => r.correct).length;
    const interval = wilsonInterval(correct, attempts);
    
    if (!interval) continue;
    
    // If Wilson lower bound < 0.6 and interval width is large, high uncertainty
    if (interval.lower < 0.6 && (interval.upper - interval.lower) > 0.3) {
      risky.push(entry.target);
    }
  }
  
  return risky.slice(0, 10); // Return top 10 at-risk words
}

/**
 * Get timestamp of most recent activity
 */
function getLastActivityTimestamp(state) {
  return state.lastActivity || Date.now() - (24 * 60 * 60 * 1000); // Default 1 day ago
}

/**
 * Format hour to readable time string
 */
function formatTime(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00${period}`;
}

/**
 * Priority ordering for sorting
 */
function priorityOrder(priority) {
  const order = { urgent: 4, high: 3, medium: 2, low: 1 };
  return order[priority] || 0;
}

/**
 * Generate study plan for next week
 */
export function generateWeeklyPlan(userState, preferences) {
  const plan = [];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  for (let i = 0; i < 7; i++) {
    const targetMinutes = calculateDailyTarget(userState, i, preferences.dailyGoal);
    
    plan.push({
      day: days[i],
      targetMinutes,
      recommendedModes: selectRecommendedModes(userState, targetMinutes),
      milestones: generateMilestones(targetMinutes),
    });
  }
  
  return plan;
}

/**
 * Calculate daily study target based on current pace
 */
function calculateDailyTarget(state, dayIndex, defaultGoal) {
  const recentPerformance = state.recentAverageMinutes || 20;
  const momentumFactor = state.momentum || 1.0;
  
  // Increase target if user is consistently exceeding
  if (momentumFactor > 1.2) {
    return Math.min(60, Math.round(recentPerformance * 1.1));
  }
  
  return defaultGoal || recentPerformance;
}

/**
 * Select best practice modes for given time allocation
 */
function selectRecommendedModes(state, minutes) {
  const modes = [];
  
  if (minutes >= 10) modes.push('conversation');
  if (minutes >= 15) modes.push('vocabulary_review');
  if (minutes >= 20) modes.push('pronunciation_drills');
  if (minutes >= 30) modes.push('grammar_topics');
  
  // Add weakness-focused activities
  const weakestArea = state.weakestArea;
  if (weakestArea === 'pronunciation') {
    modes.unshift('phoneme_training');
  } else if (weakestArea === 'vocabulary') {
    modes.unshift('vocab_memorization');
  }
  
  return modes;
}

/**
 * Generate achievement milestones for practice session
 */
function generateMilestones(minutes) {
  const milestones = [
    { at: 5, type: 'quick_win', title: 'Quick Session Complete', description: "5 minutes down!" },
    { at: 15, type: 'commitment', title: 'Commitment Reached', description: 'Solid practice session!' },
    { at: 30, type: 'master_mode', title: 'Deep Work Mode', description: 'You are in flow state!' },
  ];
  
  return milestones.filter(m => m.at <= minutes);
}

/**
 * Create motivational message based on performance
 */
export function createMotivationalMessage(actionResult, state) {
  const messages = [];
  
  // XP gain celebration
  if (actionResult.xpGain > 0) {
    const tiers = [
      { threshold: 50, text: 'Awesome! Great progress!' },
      { threshold: 100, text: 'On fire! Keep it up!' },
      { threshold: 200, text: 'Incredible! You\'re crushing it!' },
    ];
    
    const tier = tiers.find(t => actionResult.xpGain >= t.threshold);
    if (tier) {
      messages.push(tier.text);
    }
  }
  
  // Streak milestone
  if (state.streakCount && state.streakCount % 7 === 0) {
    messages.push(`🔥 ${state.streakCount}-day streak! Week ${Math.ceil(state.streakCount / 7)} complete!`);
  }
  
  // Learning velocity
  const weeklyXP = state.weeklyXP || 0;
  if (weeklyXP >= 500) {
    messages.push(`🚀 ${weeklyXP} XP this week - you're on track!`);
  }
  
  // Weakness improvement
  if (actionResult.improvedWeakness) {
    messages.push(`💪 Improved your weakest area: ${actionResult.improvedWeakness}!`);
  }
  
  if (messages.length === 0) {
    messages.push('Keep making progress!');
  }
  
  return messages.join(' ');
}
