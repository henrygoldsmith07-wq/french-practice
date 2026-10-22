// Weekly league: a local leaderboard against seeded pace-setters (no backend,
// so never real people). Ranked by this week's XP; the tier follows the
// learner's level, so promotion means levelling up.
//
// This was a local component inside Profile.jsx. The Gamification Hub shows
// the same board, and a second copy of the standings logic is a second set of
// rules about who is where, so it lives in one place.
import { useMemo } from 'react';
import { getWeekXp, getSettings, getAvatar } from '../lib/storage.js';
import { AVATARS, leagueTier, weeklyLeague, LEAGUE_TIERS } from '../lib/game.js';
import { localDayKey } from '../lib/localDay.js';

export default function WeeklyLeague({ level }) {
  const board = useMemo(() => {
    const now = new Date();
    // Monday-anchored week, matching getWeekXp; progress is the fraction elapsed.
    const dow = (now.getDay() + 6) % 7; // 0 = Monday
    const weekProgress = (dow * 86400 + now.getHours() * 3600 + now.getMinutes() * 60) / (7 * 86400);
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    // Local Y/M/D key from the canonical identity (localDay.js) — matching
    // isoWeekKey in storage.js; toISOString put Sunday-evening users in the
    // following week's league.
    const weekKey = localDayKey(monday);
    const tier = leagueTier(level);
    const settings = getSettings();
    const avatar = AVATARS.find((a) => a.id === getAvatar());
    const league = weeklyLeague(weekKey, getWeekXp(), weekProgress, tier.index, {
      name: settings.name || 'You',
      avatar: avatar?.emoji || '🙂',
    });
    return { tier, ...league };
  }, [level]);

  const { tier, standings, rank, ahead, count, promoteZone, relegateZone } = board;
  const nextTier = LEAGUE_TIERS[tier.index + 1];

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2 inline-flex items-center gap-1.5">
          <span aria-hidden="true">{tier.emoji}</span> {tier.name} league
        </h3>
        <span className="text-[11px] text-ink3 tabular-nums">#{rank} of {count}</span>
      </div>

      <p className="text-xs text-ink2 leading-relaxed">
        {rank === 1
          ? 'You’re topping the league this week — hold the lead.'
          : ahead
            ? <>Just <span className="font-semibold text-ink tabular-nums">{ahead.xp - standings[rank - 1].xp} XP</span> behind {ahead.name}. Overtake them before Monday.</>
            : 'Earn XP this week to climb the ladder.'}
      </p>

      <ol className="space-y-1">
        {standings.map((s, i) => {
          const place = i + 1;
          const zone = place <= promoteZone ? 'promote' : place > count - relegateZone ? 'relegate' : 'hold';
          return (
            <li
              key={s.isUser ? 'you' : s.name}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 border ${
                s.isUser ? 'bg-surface2 border-ink3' : 'bg-surface border-line'
              }`}
            >
              <span className={`w-5 shrink-0 text-center text-[11px] font-bold tabular-nums ${
                zone === 'promote' ? 'text-ink' : zone === 'relegate' ? 'text-ink3' : 'text-ink2'
              }`}>{place}</span>
              <span className="text-lg shrink-0" aria-hidden="true">{s.avatar}</span>
              <span className={`flex-1 min-w-0 truncate text-sm ${s.isUser ? 'font-bold text-ink' : 'text-ink2'}`}>
                {s.isUser ? `${s.name} (you)` : s.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink2">{s.xp} XP</span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between text-[11px] text-ink3">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ink" aria-hidden="true" /> Top {promoteZone} {nextTier ? `→ ${nextTier.name}` : 'promote'}</span>
        <span>Resets Monday</span>
      </div>
      <p className="text-[10px] text-ink3 leading-snug">
        Pace-setters are seeded practice challengers, not real players — the studio stays fully offline. Your league tier follows your level.
      </p>
    </section>
  );
}
