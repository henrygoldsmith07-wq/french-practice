// The learner's game state, in the shape the achievements are written against.
//
// This used to live inside src/components/Profile.jsx as a local function,
// which meant only the profile could see it. The Gamification Hub needs the
// same numbers to show how far along each badge is, and a second copy of
// this would be a second set of rules. One source, one shape.
import {
  getXp, getStreak, getSessions, getReviewLog, getGrammarProgress,
  getNotebook, getCollectibles, getMetrics, getStarredLines,
} from './storage.js';
import { levelFromXp } from './game.js';
import { totalReviews } from './memory.js';

/**
 * The numbers every achievement is measured against.
 *
 * `check(stats)` on an achievement answers "is this earned?"; `value(stats)`
 * answers "how far along is it?" They read the same object.
 */
export function buildGameStats() {
  const xp = getXp();
  return {
    xp,
    level: levelFromXp(xp).level,
    streak: getStreak().count,
    sessions: getSessions().length,
    reviews: totalReviews(getReviewLog()),
    grammarMastered: Object.values(getGrammarProgress()).filter((g) => g.best >= 80).length,
    notebook: getNotebook().length,
    collectibles: Object.keys(getCollectibles()).length,
    drills: getMetrics().filter((m) => m.skill === 'drill').length,
    starred: getStarredLines().length,
  };
}
