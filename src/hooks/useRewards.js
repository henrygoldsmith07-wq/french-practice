// Rewards domain — XP, coins, level/goal celebrations, avatar, streak ticks.
//
// Extracted from App.jsx: this state only ever changes together (awardXp
// updates XP, coins, the gain toast and possibly a celebration) and every
// consumer receives it through callbacks, so living in one hook keeps the
// invariants local: XP and coins are persisted together, the celebration can
// only fire from an award, and the daily-goal crossing is detected exactly
// once per award (beforeToday < goal && after >= goal).
//
// XP/streaks are engagement signals, deliberately separate from proficiency —
// this hook never touches the proficiency/CEFR model.
import { useState } from 'react';
import {
  getXp, addXp, getTodayXp, getCoins, addCoins, getAvatar, addEventXp,
} from '../lib/storage';
import { activeEvent, levelFromXp } from '../lib/game';

export default function useRewards({ dailyGoal = 30 } = {}) {
  // streakTick only exists to re-key the due-count query after a session;
  // bumpStreak is called when a session is saved to the dashboard.
  const [streakTick, setStreakTick] = useState(0);
  const [xp, setXp] = useState(getXp);
  const [xpGain, setXpGain] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [coins, setCoins] = useState(getCoins);
  const [avatarId, setAvatarId] = useState(getAvatar);

  const awardXp = (gained) => {
    const beforeXp = getXp();
    const beforeToday = getTodayXp();
    const newXp = addXp(gained);
    setXp(newXp);
    setXpGain({ amount: gained, id: Date.now() });
    setCoins(addCoins(Math.max(1, Math.round(gained / 3))));
    const event = activeEvent();
    if (event) addEventXp(event.id, gained);
    const before = levelFromXp(beforeXp);
    const after = levelFromXp(newXp);
    try {
      if (after.level > before.level) {
        setCelebration({ kind: 'level', level: after.level, title: after.title, newTitle: after.title !== before.title });
        navigator.vibrate?.([30, 50, 30, 50, 70]);
      } else if (beforeToday < dailyGoal && getTodayXp() >= dailyGoal) {
        setCelebration({ kind: 'goal' });
        navigator.vibrate?.([25, 40, 45]);
      } else {
        navigator.vibrate?.(12);
      }
    } catch { /* no haptics */ }
  };

  const bumpStreak = () => setStreakTick((t) => t + 1);

  return {
    xp, xpGain, celebration, setCelebration,
    coins, setCoins, avatarId, setAvatarId,
    streakTick, bumpStreak, awardXp,
  };
}
