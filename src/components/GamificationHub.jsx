// Gamification Hub - the learner's own game, in one place.
//
// This panel used to be a fiction. It was handed a fixed object (47 sessions,
// 523 words learned, a 12-day streak, 87% accuracy, 250 coins) and it
// invented the rest: four rivals called Alex, Sam, Jordan and Taylor with
// random XP, a random rank out of an invented field of 15,000 players, a
// percentile derived from that rank, a random challenge picked on every
// render, and a "Complete Challenge" button with no handler behind it.
//
// None of that was the app's game. The app has one: fourteen badges with real
// conditions, three deterministic daily challenges, a weekly league against
// seeded pace-setters, coins, and a streak freeze you can buy with them.
// The hub shows those, and the numbers are the learner's.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, Star, Award, Zap, Shield, CheckCircle, Lock, Coins } from './icons';
import {
  getAchievements, getChallengeState, getTodayXp,
  getCoins, getFreezes, buyFreeze, FREEZE_COST, MAX_FREEZES,
} from '../lib/storage.js';
import { ACHIEVEMENTS, COLLECTIBLES, dailyChallenges, levelFromXp } from '../lib/game.js';
import { buildGameStats } from '../lib/gameStats.js';
import { grantEarnedRewards, claimDailyChallenge } from '../lib/gameGrants.js';
import WeeklyLeague from './WeeklyLeague.jsx';

export default function GamificationHub({ open, onClose, onXp, onChange }) {
  const [tab, setTab] = useState('badges'); // badges | challenges | league | boosts
  const [tick, setTick] = useState(0);
  const [fresh, setFresh] = useState([]);

  // App passes an inline callback (new identity each render), so the effect
  // below must not depend on it directly - that would re-run the grant on
  // every render. The latest-ref pattern: the effect always calls the
  // freshest callback.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Opening the hub grants what has been earned, the same way the profile
  // does — one set of rules, in lib/gameGrants.js. The grant pays coins, so
  // the header has to be told to re-read them.
  useEffect(() => {
    if (!open) return;
    const { unlockedNow } = grantEarnedRewards();
    setFresh(unlockedNow);
    setTick((t) => t + 1);
    onChangeRef.current?.();
  }, [open]);

  const data = useMemo(() => {
    void tick; // re-read when a reward is granted
    const stats = buildGameStats();
    return {
      stats,
      level: levelFromXp(stats.xp),
      coins: getCoins(),
      freezes: getFreezes(),
      achievements: getAchievements(),
      challenges: getChallengeState(),
    };
  }, [tick]);

  if (!open) return null;

  const unlockedCount = Object.keys(data.achievements).length;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Gamification Hub">
      <div className="mx-auto min-h-full max-w-4xl px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 grid place-items-center">
              <Trophy size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Gamification Hub</h2>
              <p className="text-xs text-ink2">
                Niveau {data.level.level} · {data.stats.xp.toLocaleString('en-GB')} XP · {data.coins} <Coins size={10} className="inline" /> · {data.stats.streak}-day streak
              </p>
            </div>
          </div>

          {fresh.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-800">
              <Star size={12} />
              {fresh.length} new badge{fresh.length === 1 ? '' : 's'}
            </span>
          )}

          <button onClick={onClose} aria-label="Close gamification hub" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 p-1 bg-surface border border-line rounded-xl">
          <TabButton
            active={tab === 'badges'}
            onClick={() => setTab('badges')}
            icon={Award}
            label="Badges"
            badge={unlockedCount}
          />
          <TabButton
            active={tab === 'challenges'}
            onClick={() => setTab('challenges')}
            icon={Zap}
            label="Challenges"
          />
          <TabButton
            active={tab === 'league'}
            onClick={() => setTab('league')}
            icon={Trophy}
            label="League"
          />
          <TabButton
            active={tab === 'boosts'}
            onClick={() => setTab('boosts')}
            icon={Shield}
            label="Boosts"
          />
        </div>

        {tab === 'badges' && <BadgesView data={data} />}
        {tab === 'challenges' && (
          <ChallengesView
            data={data}
            onXp={onXp}
            onChange={() => { setTick((t) => t + 1); onChange?.(); }}
          />
        )}
        {tab === 'league' && <WeeklyLeague level={data.level.level} />}
        {tab === 'boosts' && (
          <BoostsView
            coins={data.coins}
            freezes={data.freezes}
            onChange={() => { setTick((t) => t + 1); onChange?.(); }}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active ? 'bg-accent text-onaccent' : 'text-ink3 hover:bg-surface2'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <Icon size={14} />
        {label}
      </div>
      {badge > 0 && (
        <span className="absolute top-1 right-1.5 w-5 h-5 bg-accent text-onaccent text-[10px] font-bold rounded-full grid place-items-center">
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * The fourteen real badges, with how far along the learner is on each one.
 *
 * The number beside a locked badge comes from the same stats the unlock
 * condition is written against, so "4 / 5 sessions" and the moment the badge
 * unlocks cannot disagree.
 */
function BadgesView({ data }) {
  const total = ACHIEVEMENTS.length;
  const unlocked = Object.keys(data.achievements).length;
  const percentage = Math.round((unlocked / total) * 100);

  return (
    <div className="space-y-4 fade-in">
      <div className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 p-5 text-white">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-lg">Badges</h3>
          <span className="text-2xl font-bold tabular-nums">{unlocked}/{total}</span>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-1">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${percentage}%` }} />
        </div>
        <p className="text-sm opacity-90">{percentage}% earned</p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {ACHIEVEMENTS.map((a) => {
          const got = Boolean(data.achievements[a.id]);
          const current = Math.min(a.value(data.stats), a.target);
          const pct = Math.round((current / a.target) * 100);
          return (
            <div key={a.id} className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
              <div className="flex items-start gap-3">
                <span className={`text-2xl shrink-0 ${got ? '' : 'grayscale opacity-60'}`} role="img" aria-hidden="true">{a.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink text-sm truncate">{a.title}</p>
                    {got
                      ? <CheckCircle size={13} className="text-green600 shrink-0" />
                      : <Lock size={12} className="text-ink3 shrink-0" />}
                  </div>
                  <p className="text-xs text-ink2">{a.desc}</p>
                </div>
              </div>
              {got ? (
                <p className="text-[11px] font-semibold text-green600">Earned · {a.coins} <Coins size={9} className="inline" /> paid</p>
              ) : (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-ink3 tabular-nums">
                    {current} / {a.target} · worth {a.coins} <Coins size={9} className="inline" />
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Today's three challenges — the same three the profile shows, picked
 * deterministically from the day's seed — with the learner's real progress
 * against each one, and a button that really claims it.
 */
function ChallengesView({ data, onXp, onChange }) {
  const todays = useMemo(() => dailyChallenges(data.challenges.day), [data.challenges.day]);
  const [newCard, setNewCard] = useState(null);

  const progressOf = (c) => (c.metric === 'xp' ? getTodayXp() : (data.challenges.counts[c.metric] || 0));

  const claim = (c) => {
    // The same claim the profile makes: the challenge is recorded, its coins
    // are paid, and clearing all three awards the next postcard.
    const card = claimDailyChallenge(c, todays);
    onXp?.(c.xp);
    if (card) setNewCard(card);
    onChange?.();
  };

  return (
    <div className="space-y-3 fade-in">
      <p className="text-xs text-ink2">
        Three challenges a day, the same three every time you open this. Clear all three to earn the next postcard.
      </p>
      {newCard && (
        <p role="status" className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs font-semibold text-ink">
          Postcard earned: {COLLECTIBLES.find((c) => c.id === newCard)?.title || newCard}
        </p>
      )}
      {todays.map((c) => {
        const progress = Math.min(c.target, progressOf(c));
        const complete = progress >= c.target;
        const claimed = data.challenges.claimed.includes(c.id);
        return (
          <div key={c.id} className="rounded-xl border border-line bg-surface p-4 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink" lang="fr">{c.title}</p>
                <p className="text-xs text-ink3">{c.desc} · +{c.coins} <Coins size={10} className="inline" /> +{c.xp} XP</p>
              </div>
              {claimed ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink2"><CheckCircle size={13} /> Claimed</span>
              ) : complete ? (
                <button onClick={() => claim(c)} className="btn btn-primary min-h-9 px-3.5 rounded-lg text-xs">Claim</button>
              ) : (
                <span className="text-xs text-ink3 tabular-nums">{progress}/{c.target}</span>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${claimed ? 'bg-line' : 'bg-accent'}`} style={{ width: `${Math.round((progress / c.target) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The only boost the studio actually sells: a streak freeze. It costs
 * FREEZE_COST coins, you can hold MAX_FREEZES of them, and one is used
 * automatically if a single day is missed. The other two boosts this panel
 * used to offer - a double-XP boost and an instant review pack - were never
 * part of the game, and buying them did nothing.
 */
function BoostsView({ coins, freezes, onChange }) {
  const canBuy = freezes < MAX_FREEZES && coins >= FREEZE_COST;

  const buy = () => {
    if (buyFreeze()) onChange?.();
  };

  return (
    <div className="space-y-3 fade-in">
      <div className="rounded-xl border border-line bg-surface p-4 flex items-start gap-3">
        <span className="text-3xl" role="img" aria-hidden="true">🧊</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink">Streak freeze</p>
          <p className="text-xs text-ink2">
            If you miss a single day, a freeze covers it and your streak survives. It is used automatically.
          </p>
          <p className="mt-1.5 text-xs text-ink3 tabular-nums">
            You have {freezes} of a possible {MAX_FREEZES} · {FREEZE_COST} coins each · you have {coins} <Coins size={10} className="inline" />
          </p>
        </div>
        <button
          onClick={buy}
          disabled={!canBuy}
          className="btn btn-primary min-h-9 px-3.5 rounded-lg text-xs disabled:opacity-50"
        >
          {freezes >= MAX_FREEZES ? 'Full' : canBuy ? `Buy for ${FREEZE_COST}` : `Needs ${FREEZE_COST - coins} more`}
        </button>
      </div>
      <p className="text-[11px] text-ink3 leading-snug">
        A double-XP boost and an instant review pack used to be offered here. Neither was ever part of the
        studio — buying them spent coins and changed nothing — so they are not on offer now.
      </p>
    </div>
  );
}
