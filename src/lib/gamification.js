// Comprehensive Gamification System - Achievements, Challenges, Leaderboards
import { getStreak, getXp } from './storage';

/**
 * Achievement definitions - everything unlocks as you progress
 */
export const ACHIEVEMENTS = [
  // Starter achievements
  {
    id: 'first_steps',
    title: 'First Steps',
    description: 'Complete your first practice session',
    icon: '🎯',
    category: 'starter',
    requirements: { sessionsCompleted: 1 },
    rewardXp: 50,
    tier: 'common',
  },
  {
    id: 'vocabulary_beginner',
    title: 'Vocabulary Beginner',
    description: 'Learn your first 50 words',
    icon: '📚',
    category: 'vocabulary',
    requirements: { vocabularyLearned: 50 },
    rewardXp: 100,
    tier: 'common',
  },
  
  // Streak achievements
  {
    id: 'week_streak',
    title: 'Week Warrior',
    description: '7-day streak reached!',
    icon: '🔥',
    category: 'streak',
    requirements: { streakDays: 7 },
    rewardXp: 150,
    tier: 'uncommon',
  },
  {
    id: 'month_streak',
    title: 'Month Master',
    description: '30-day incredible streak!',
    icon: '⚡',
    category: 'streak',
    requirements: { streakDays: 30 },
    rewardXp: 500,
    tier: 'rare',
  },
  {
    id: 'year_streak',
    title: 'Legend',
    description: '365-day legendary streak!',
    icon: '👑',
    category: 'streak',
    requirements: { streakDays: 365 },
    rewardXp: 2000,
    tier: 'legendary',
  },
  
  // Skill-based achievements
  {
    id: 'conversation_star',
    title: 'Conversation Star',
    description: 'Have 100 conversations',
    icon: '💬',
    category: 'skills',
    requirements: { conversationsCompleted: 100 },
    rewardXp: 300,
    tier: 'rare',
  },
  {
    id: 'accuracy_master',
    title: 'Accuracy Master',
    description: 'Reach 95% average accuracy',
    icon: '🎯',
    category: 'skills',
    requirements: { avgAccuracy: 0.95 },
    rewardXp: 400,
    tier: 'epic',
  },
  {
    id: 'pronunciation_pro',
    title: 'Pronunciation Pro',
    description: 'Master pronunciation drills',
    icon: '🎤',
    category: 'skills',
    requirements: { pronunciationScore: 90 },
    rewardXp: 350,
    tier: 'rare',
  },
  
  // Learning milestones
  {
    id: 'level_cefr_a1',
    title: 'CEFR A1 Certified',
    description: 'Reach A1 proficiency level',
    icon: '🏆',
    category: 'milestone',
    requirements: { cefrLevel: 'A1' },
    rewardXp: 500,
    tier: 'rare',
  },
  {
    id: 'level_cefr_b1',
    title: 'CEFR B1 Intermediate',
    description: 'Reach B1 intermediate level',
    icon: '⭐',
    category: 'milestone',
    requirements: { cefrLevel: 'B1' },
    rewardXp: 1000,
    tier: 'epic',
  },
  {
    id: 'level_cefr_c1',
    title: 'CEFR C1 Advanced',
    description: 'Reach C1 advanced level',
    icon: '💎',
    category: 'milestone',
    requirements: { cefrLevel: 'C1' },
    rewardXp: 2000,
    tier: 'legendary',
  },
  
  // Special achievements
  {
    id: 'early_bird',
    title: 'Early Bird',
    description: 'Practice before 7 AM',
    icon: '🌅',
    category: 'special',
    requirements: { morningSession: true },
    rewardXp: 75,
    tier: 'uncommon',
  },
  {
    id: 'night_owl',
    title: 'Night Owl',
    description: 'Practice after 10 PM',
    icon: '🦉',
    category: 'special',
    requirements: { nightSession: true },
    rewardXp: 75,
    tier: 'uncommon',
  },
];

/**
 * Challenge definitions - time-limited objectives
 */
export const CHALLENGES = [
  {
    id: 'daily_10min',
    title: 'Daily 10-Minute Challenge',
    description: 'Complete a 10-minute practice session',
    duration: 'daily',
    targetMinutes: 10,
    rewardXp: 50,
    isActive: true,
  },
  {
    id: 'weekly_100xp',
    title: 'Weekly 100 XP Challenge',
    description: 'Earn 100 XP this week',
    duration: 'weekly',
    targetXp: 100,
    rewardXp: 200,
    isActive: true,
  },
  {
    id: 'streak_builder',
    title: 'Streak Builder',
    description: 'Build a 7-day streak',
    duration: 'one_time',
    targetStreak: 7,
    rewardXp: 300,
    isActive: false,
  },
  {
    id: 'vocabulary_sprint',
    title: 'Vocabulary Sprint',
    description: 'Learn 20 new words',
    duration: 'weekly',
    targetVocab: 20,
    rewardXp: 150,
    isActive: true,
  },
];

/**
 * Power-ups that provide temporary bonuses
 */
export const POWERUPS = [
  {
    id: 'double_xp',
    name: 'Double XP Boost',
    description: 'Earn 2x XP for 30 minutes',
    duration: 30, // minutes
    effect: 'double_xp',
    rarity: 'rare',
    cost: 50, // coins
  },
  {
    id: 'streak_freeze',
    name: 'Streak Freeze',
    description: 'Protect your streak for one day',
    duration: 1, // days
    effect: 'freeze_streak',
    rarity: 'epic',
    cost: 100,
  },
  {
    id: 'instant_review',
    name: 'Instant Review Pack',
    description: 'Get immediate review of mastered words',
    duration: null,
    effect: 'instant_review',
    rarity: 'uncommon',
    cost: 30,
  },
];

/**
 * Check if user has unlocked any achievements
 */
export function checkAchievements(userState) {
  const unlocked = [];
  const newlyUnlocked = [];
  
  for (const achievement of ACHIEVEMENTS) {
    const isMet = meetRequirements(achievement.requirements, userState);
    
    if (isMet && !userState.unlockedAchievements?.includes(achievement.id)) {
      newlyUnlocked.push({
        ...achievement,
        rewardXp: achievement.rewardXp,
        unlockedAt: new Date().toISOString(),
      });
      unlocked.push(achievement.id);
    }
  }
  
  return { unlocked, newlyUnlocked };
}

/**
 * Get available daily challenge
 */
export function getAvailableChallenge(userState) {
  const activeChallenges = CHALLENGES.filter(c => c.isActive);
  
  // Filter out completed challenges
  const available = activeChallenges.filter(challenge => {
    if (challenge.duration === 'one_time') {
      return !userState.completedChallenges?.includes(challenge.id);
    }
    return true;
  });
  
  // Return random challenge or default first one
  return available[Math.floor(Math.random() * available.length)] || activeChallenges[0];
}

/**
 * Track challenge progress
 */
export function trackChallengeProgress(challengeId, actionType, stateUpdate) {
  const challenge = CHALLENGES.find(c => c.id === challengeId);
  if (!challenge) return null;
  
  const progress = calculateProgress(challenge, stateUpdate);
  const completed = meetsTarget(progress, challenge.targetMinutes, challenge.targetXp, challenge.targetStreak, challenge.targetVocab);
  
  return {
    challenge,
    progress,
    completed,
    remaining: Math.max(0, calculateRemaining(challenge, progress)),
  };
}

/**
 * Calculate current leaderboard position
 */
export function getLeaderboardData(userId, weeklyGoal) {
  // Mock data for demonstration
  const localUserPosition = Math.floor(Math.random() * 1000) + 1;
  
  return {
    globalRank: localUserPosition,
    friendsRank: Math.floor(Math.random() * 20) + 1,
    totalPlayers: 15000,
    weeklyXP: weeklyGoal,
    percentile: Math.max(5, 100 - ((localUserPosition / 15000) * 100)).toFixed(1),
    friends: generateMockFriendsRanking(),
  };
}

/**
 * Generate friend ranking mock data
 */
function generateMockFriendsRanking() {
  const friends = ['Alex', 'Sam', 'Jordan', 'Taylor'];
  return friends.map((name, i) => ({
    name,
    rank: i + 1,
    xp: Math.floor(Math.random() * 500) + 200,
    avatar: `👤${i + 1}`,
  }));
}

/**
 * Unlock achievement
 */
export function unlockAchievement(achievement, userState) {
  const newState = {
    ...userState,
    unlockedAchievements: [...(userState.unlockedAchievements || []), achievement.id],
  };
  
  return {
    success: true,
    achievement,
    newState,
  };
}

/**
 * Redeem power-up
 */
export function redeemPowerUp(powerUpId, userCoins) {
  const powerUp = POWERUPS.find(p => p.id === powerUpId);
  if (!powerUp || userCoins < powerUp.cost) {
    return { success: false, error: 'Insufficient coins' };
  }
  
  return {
    success: true,
    powerUp,
    remainingCoins: userCoins - powerUp.cost,
  };
}

/**
 * Calculate points based on activity
 */
export function calculatePoints(actionType, value) {
  const multipliers = {
    conversation: 1.5,
    vocabulary: 1.0,
    grammar: 1.2,
    pronunciation: 1.3,
  };
  
  const basePoints = value || 10;
  const multiplier = multipliers[actionType] || 1.0;
  
  return Math.round(basePoints * multiplier);
}

/**
 * Check requirements are met
 */
function meetRequirements(requirements, state) {
  return Object.entries(requirements).every(([key, value]) => {
    if (typeof value === 'boolean') {
      return state[key] === true;
    }
    return state[key] >= value;
  });
}

/**
 * Calculate progress towards challenge
 */
function calculateProgress(challenge, stateUpdate) {
  const progress = {};
  
  if (challenge.targetMinutes) {
    progress.minutes = stateUpdate.minutesSpent || 0;
  }
  if (challenge.targetXp) {
    progress.xp = stateUpdate.xpEarned || 0;
  }
  if (challenge.targetStreak) {
    progress.streak = stateUpdate.currentStreak || 0;
  }
  if (challenge.targetVocab) {
    progress.vocab = stateUpdate.wordsLearned || 0;
  }
  
  return progress;
}

/**
 * Check if challenge target is met
 */
function meetsTarget(progress, targetMinutes, targetXp, targetStreak, targetVocab) {
  if (targetMinutes && progress.minutes >= targetMinutes) return true;
  if (targetXp && progress.xp >= targetXp) return true;
  if (targetStreak && progress.streak >= targetStreak) return true;
  if (targetVocab && progress.vocab >= targetVocab) return true;
  return false;
}

/**
 * Calculate remaining amount needed
 */
function calculateRemaining(challenge, progress) {
  if (challenge.targetMinutes) return challenge.targetMinutes - progress.minutes;
  if (challenge.targetXp) return challenge.targetXp - progress.xp;
  if (challenge.targetStreak) return challenge.targetStreak - progress.streak;
  if (challenge.targetVocab) return challenge.targetVocab - progress.vocab;
  return 0;
}
