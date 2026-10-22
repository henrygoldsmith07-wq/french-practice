// AI Study Assistant - Personalized recommendations based on user data analysis
// Analyzes patterns in user progress, identifies weaknesses, suggests optimal
// study times, predicts retention risks, and provides actionable insights

// `getPhonemeProfile` lives in lib/phonemeProfile.js, not in storage.js — the
// import was pointing at the wrong module, so the bundler failed on it.
// `getSessionData` and `getVocabProgress` were imported but never used, and
// `analyzeTargetText` was imported but never used either — and, being an
// extensionless import, it stopped the module loading in Node at all.
import { getPhonemeProfile } from './phonemeProfile.js';
import { wilsonInterval } from './evidenceUncertainty.js';
import { MIN_ACTIVITY_SAMPLE } from './studyAssistantState.js';

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
      target: area.target || null,
    });
  });
  
  // Check for streak threats
  const streakRisk = assessStreakRisk(userState);
  if (streakRisk.level === 'high') {
    // A broken streak cannot be "kept alive" — getStreak() has already reset
    // it to zero by then. The card says which of the two it is.
    const alive = streakRisk.streakLength > 0;
    recommendations.push({
      type: 'motivation',
      priority: 'urgent',
      title: alive ? 'Streak at Risk!' : 'Practice Break',
      description: alive
        ? `Your ${streakRisk.streakLength}-day streak ends tonight - you have not practised in ${streakRisk.days} day${streakRisk.days === 1 ? '' : 's'}.`
        : `You have not practised in ${streakRisk.days} day${streakRisk.days === 1 ? '' : 's'}. A session today starts a new streak.`,
      action: 'Complete a quick 5-minute session',
      estimatedTime: 5,
      target: { type: 'quickfire' },
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
      action: `Practise around ${bestTime.time}`,
      estimatedTime: null,
      target: null,
    });
  }

  // Retention risk alerts
  const atRiskWords = predictRetentionRisks(userState);
  if (atRiskWords.length > 0) {
    recommendations.push({
      type: 'review',
      priority: 'high',
      title: `${atRiskWords.length} Word${atRiskWords.length === 1 ? '' : 's'} at Risk`,
      description: 'These vocabulary items need attention before they slip away',
      action: 'Review at-risk vocabulary',
      estimatedTime: atRiskWords.length * 2,
      target: { type: 'cards' },
    });
  }
  
  return recommendations.sort((a, b) => priorityOrder(b.priority) - priorityOrder(a.priority));
}

/**
 * Identify weak areas based on phoneme confusion stats and vocab accuracy
 */
function identifyWeakAreas(state) {
  const weaknesses = [];

  // Phoneme weaknesses. getPhonemeProfile() already returns the active
  // language's `{ [phonemeId]: stats }` bucket. This used to look for
  // `byLang` on it — a key only the raw stored profile has — so the
  // pronunciation card could never appear.
  const langStats = getPhonemeProfile() || {};
  const weakPhonemes = Object.entries(langStats)
    .filter(([, stats]) => stats && (stats.misses / Math.max(1, stats.attempts)) > 0.3)
    .slice(0, 2);
  if (weakPhonemes.length > 0) {
    weaknesses.push({
      priority: 'high',
      title: 'Pronunciation Improvement Needed',
      description: `${weakPhonemes.length} sound contrast${weakPhonemes.length === 1 ? '' : 's'} need${weakPhonemes.length === 1 ? 's' : ''} practice`,
      action: 'Complete pronunciation drills',
      estimatedTime: 10,
      target: { type: 'speaking' },
    });
  }

  // Vocab accuracy issues. The words are the learner's own tracked mistakes —
  // before, this list was three words written into the source, so the panel
  // told every learner the same thing about "chat", "maison" and "homme".
  const lowAccuracyWords = state.lowAccuracyWords || [];
  if (lowAccuracyWords.length >= 1) {
    weaknesses.push({
      priority: 'high',
      title: 'Vocabulary Accuracy',
      description: `${lowAccuracyWords.length} word${lowAccuracyWords.length === 1 ? '' : 's'} still to repair`,
      action: 'Review low-accuracy vocabulary',
      estimatedTime: lowAccuracyWords.length * 3,
      target: { type: 'cards' },
    });
  }

  return weaknesses;
}

/**
 * Assess risk to maintaining daily streak
 */
function assessStreakRisk(state) {
  const lastSession = getLastActivityTimestamp(state);
  // No activity at all is not a broken streak — it is a learner who has not
  // started. The old code fell back to "one day ago" and then told every new
  // learner their streak was at risk before they had done anything.
  if (lastSession == null) return { level: 'none', days: 0, streakLength: 0 };

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
    // Rounded, not rounded up: 48 hours is two days, and `Math.ceil` turned
    // 48 hours and one millisecond into "3 days".
    days: Math.max(1, Math.round(hoursSinceLastSession / 24)),
    streakLength,
  };}

/**
 * Suggest optimal practice time based on historical patterns
 */
function suggestOptimalTime(state) {
  // "Your historical peak learning period" needs a history to point at. With
  // a handful of records the peak hour is noise, so the panel says nothing
  // rather than claiming a pattern it cannot see.
  if ((state.activitySample || 0) < MIN_ACTIVITY_SAMPLE) return null;

  const activityHours = state.activityByHour || {};
  const bestHour = Object.entries(activityHours)
    .sort((a, b) => b[1] - a[1])[0];

  if (!bestHour) return null;
  
  const hour = parseInt(bestHour[0]);
  const timeStr = formatTime(hour);

  // The panel used to shift the hour by two at the weekend and still call
  // it "your weekend peak usage time". There is no weekend adjustment in the
  // learner's record, so the hour reported is the hour they actually practise
  // at, and the wording says that.
  return {
    time: timeStr,
    reason: `You have practised most often around ${timeStr}`,
  };
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
  // null means "no activity on record". It used to fall back to a day ago,
  // which turned every brand-new learner into a streak-at-risk learner.
  const t = state.lastActivity;
  return Number.isFinite(t) ? t : null;
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
 *
 * The daily target comes from the learner's own practice: how much they have
 * actually studied, and on which weekdays they tend to study. It used to be a
 * fixed 25 minutes for everybody, from a constant in the caller.
 */
export function generateWeeklyPlan(userState, preferences = {}) {
  const plan = [];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const byWeekday = userState.minutesByWeekday || null;

  const targets = days.map((_, i) => {
    const weekdayMinutes = byWeekday ? byWeekday[i] : undefined;
    return calculateDailyTarget(userState, weekdayMinutes);
  });
  const maxTargetMinutes = Math.max(...targets, 1);

  for (let i = 0; i < 7; i++) {
    const targetMinutes = targets[i];
    plan.push({
      day: days[i],
      targetMinutes,
      // The bar in the plan compares one day with another, so the longest
      // target is carried with the plan.
      maxTargetMinutes,
      recommendedModes: selectRecommendedModes(userState, targetMinutes),
      milestones: generateMilestones(targetMinutes),
    });
  }

  return plan;
}

/**
 * Calculate daily study target from the learner's own pace
 */
function calculateDailyTarget(state, weekdayMinutes) {
  const momentumFactor = state.momentum || 1.0;
  // If the learner is doing more than last week, plan a little more — but
  // never more than the app's own 60-minute ceiling.
  const stretch = momentumFactor > 1.2 ? 1.1 : 1;
  const base = Number.isFinite(weekdayMinutes) && weekdayMinutes > 0
    ? weekdayMinutes
    : (state.recentAverageMinutes || 0);
  if (base > 0) return Math.max(5, Math.min(60, Math.round(base * stretch)));
  // No practice on record yet: the app's own session length (Today is a
  // 20-minute session). A starting point, not a claim about the learner.
  return 20;
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
