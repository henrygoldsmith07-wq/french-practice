// Handing out what the learner has earned.
//
// The profile did this in an effect when it opened: every achievement whose
// condition is now met gets recorded, its coins are paid, and the avatar it
// carries is unlocked; then any postcard the badge count has earned is
// awarded, and so is the seasonal event's.
//
// The Gamification Hub shows the same game, so it needs the same decisions.
// Two copies of this would mean the two screens could disagree about what has
// been earned, so it lives here and both call it.
import {
  getAchievements, unlockAchievement, addCoins, getCollectibles,
  awardCollectible, getEventXp, ownAvatar, getChallengeState, claimChallenge,
} from './storage.js';
import {
  ACHIEVEMENTS, AVATARS, earnedBadgeCollectibles, activeEvent, nextCollectible,
} from './game.js';
import { buildGameStats } from './gameStats.js';

/**
 * Record everything the learner has earned and not yet been given.
 *
 * @returns {{ unlockedNow: string[], cardsNow: string[] }} what was granted
 *   in this call — the screens use it for their "new" banner, and nothing is
 *   granted twice.
 */
export function grantEarnedRewards() {
  const unlockedNow = [];
  const cardsNow = [];

  const stats = buildGameStats();
  for (const a of ACHIEVEMENTS) {
    if (!getAchievements()[a.id] && a.check(stats)) {
      unlockAchievement(a.id);
      addCoins(a.coins);
      const gift = AVATARS.find((av) => av.achievement === a.id);
      if (gift) ownAvatar(gift.id);
      unlockedNow.push(a.id);
    }
  }

  const badgeCount = Object.keys(getAchievements()).length;
  for (const c of earnedBadgeCollectibles(getCollectibles(), badgeCount)) {
    awardCollectible(c.id);
    cardsNow.push(c.id);
  }

  const event = activeEvent();
  if (event && getEventXp(event.id) >= event.goal && awardCollectible(event.collectible)) {
    cardsNow.push(event.collectible);
  }

  return { unlockedNow, cardsNow };
}

/**
 * Claim a daily challenge.
 *
 * The challenge is recorded and its coins are paid. If this was the last of
 * today's three, the next postcard in the challenge set is awarded as well —
 * the profile does that, and so must the Gamification Hub, or a learner who
 * claims from the hub would come away short of the postcard they earned.
 *
 * @param {{ id: string, coins: number }} challenge the challenge claimed
 * @param {Array<{ id: string }>} todays every challenge offered today
 * @returns {string|null} the postcard awarded, if one was
 */
export function claimDailyChallenge(challenge, todays) {
  claimChallenge(challenge.id);
  addCoins(challenge.coins);

  const nowClaimed = getChallengeState().claimed;
  if (!todays.every((t) => nowClaimed.includes(t.id))) return null;

  const card = nextCollectible(getCollectibles(), 'challenges');
  if (!card) return null;
  awardCollectible(card.id);
  return card.id;
}
