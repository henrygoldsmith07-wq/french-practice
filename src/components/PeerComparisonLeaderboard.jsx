import { useState, useEffect, useMemo } from 'react';
import { getSettings, getXp, getStreak, getSessions } from '../lib/storage';
import { useDueCount } from '../lib/vocabAsync';
import { Trophy, Medal, TrendingUp, Users, Zap, Star, Target, Sparkles } from './icons';

export default function PeerComparisonLeaderboard({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('all');
  const [timeRange, setTimeRange] = useState('weekly');
  const [myRank, setMyRank] = useState(null);
  const tick = `${open}|${activeTab}|${timeRange}`;
  
  // Generate mock learner data for comparison
  const learners = useMemo(() => {
    const baseLearners = [
      { id: 'user_001', name: 'Sophie M.', level: 12, xp: 15420, streak: 47, sessions: 156, improvement: '+23%', avatar: '👩‍🎓' },
      { id: 'user_002', name: 'Lucas B.', level: 11, xp: 14200, streak: 32, sessions: 142, improvement: '+18%', avatar: '👨‍🎓' },
      { id: 'user_003', name: 'Emma D.', level: 10, xp: 12800, streak: 28, sessions: 138, improvement: '+15%', avatar: '👩‍💻' },
      { id: 'user_004', name: 'Pierre L.', level: 9, xp: 11500, streak: 45, sessions: 124, improvement: '+12%', avatar: '👨‍🔬' },
      { id: 'user_005', name: 'Camille R.', level: 9, xp: 10900, streak: 21, sessions: 118, improvement: '+10%', avatar: '👩‍⚕️' },
      { id: 'me', name: 'You', level: levelFromXp(getXp()), xp: getXp(), streak: getStreak().count, sessions: getSessions().length, improvement: calculateImprovement(), avatar: '🧑' },
    ];
    
    // Add more realistic mock users
    for (let i = 6; i <= 25; i++) {
      baseLearners.push({
        id: `user_${String(i).padStart(3, '0')}`,
        name: getRandomName(i),
        level: 5 + Math.floor(Math.random() * 10),
        xp: 5000 + Math.floor(Math.random() * 10000),
        streak: 5 + Math.floor(Math.random() * 50),
        sessions: 50 + Math.floor(Math.random() * 150),
        improvement: `${+(Math.random() * 30 + 5).toFixed(1)}%`,
        avatar: getRandomAvatar(i),
      });
    }
    
    return baseLearners;
  }, [tick]);

  const rankedLearners = useMemo(() => {
    let filtered = learners.filter(l => l.id !== 'me');
    if (activeTab === 'top') filtered = filtered.slice(0, 10);
    if (activeTab === 'nearby') {
      const myLevel = learners.find(l => l.id === 'me').level;
      filtered = filtered.filter(l => Math.abs(l.level - myLevel) <= 2);
    }
    return filtered.sort((a, b) => {
      if (timeRange === 'streak') return b.streak - a.streak;
      if (timeRange === 'improvement') return parseFloat(b.improvement) - parseFloat(a.improvement);
      return b.xp - a.xp; // default by total XP
    });
  }, [learners, activeTab, timeRange]);

  const findMyPosition = () => {
    const myData = learners.find(l => l.id === 'me');
    const sorted = [...learners].sort((a, b) => {
      if (timeRange === 'streak') return b.streak - a.streak;
      if (timeRange === 'improvement') return parseFloat(b.improvement) - parseFloat(a.improvement);
      return b.xp - a.xp;
    });
    return sorted.findIndex(l => l.id === 'me') + 1;
  };

  useEffect(() => {
    if (open) setMyRank(findMyPosition());
  }, [open, tick]);

  const getMedalColor = (rank) => {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-amber-600';
    return 'text-surface3';
  };

  const isCurrentUser = (learner) => learner.id === 'me';
  const highlightRow = (learner) => isCurrentUser(learner) ? 'bg-accent/10 border-accent/30' : '';

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Peer Comparison Leaderboard">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Trophy size={18} className="text-accent" />
          Global Leaderboard
        </h2>
        <button onClick={onClose} aria-label="Close leaderboard" className="p-1 hover:bg-surface2 rounded-lg transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 8.586L15.536 3.05a1 1 0 111.414 1.414L11.414 10l5.536 5.536a1 1 0 01-1.414 1.414L10 11.414l-5.536 5.536a1 1 0 01-1.414-1.414L8.586 10 3.05 4.464a1 1 0 011.414-1.414L10 8.586z"/>
          </svg>
        </button>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-b border-line bg-surface2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${activeTab === 'all' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface3'}`}
            >
              All Learners
            </button>
            <button
              onClick={() => setActiveTab('top')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${activeTab === 'top' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface3'}`}
            >
              Top 10 🔥
            </button>
            <button
              onClick={() => setActiveTab('nearby')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${activeTab === 'nearby' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface3'}`}
            >
              Same Level 👥
            </button>
          </div>
          
          <div className="flex items-center gap-1">
            <span className="text-xs text-ink3">Sort:</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="text-xs bg-surface border border-line rounded px-2 py-1 text-ink focus:outline-none focus:border-accent"
            >
              <option value="xp">Total XP</option>
              <option value="streak">Streak 📈</option>
              <option value="improvement">Growth 🚀</option>
            </select>
          </div>
        </div>
      </div>

      {/* My Rank Summary */}
      {myRank && activeTab === 'all' && (
        <div className="mx-4 mb-3 p-3 bg-gradient-to-r from-accent/10 to-purple/10 border border-accent/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 grid place-items-center bg-accent rounded-full">
                <span className="text-sm">🧑</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Your Current Rank</p>
                <p className="text-xs text-ink2">Among all learners</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-accent">#{myRank}</p>
              <p className="text-xs text-ink3">Keep climbing! 📊</p>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="flex-1 overflow-y-auto nice-scroll px-4 pb-4">
        <div className="max-w-md mx-auto space-y-2">
          <div className="grid grid-cols-12 text-xs font-semibold text-ink3 px-3 py-2 border-b border-line">
            <div className="col-span-2">Rank</div>
            <div className="col-span-4">Learner</div>
            <div className="col-span-2 text-center">Level</div>
            <div className="col-span-2 text-right">XP</div>
            <div className="col-span-2 text-right">Streak</div>
          </div>

          {rankedLearners.map((learner, idx) => {
            const rank = idx + 1;
            const current = rank === myRank;
            
            return (
              <div
                key={learner.id}
                className={`grid grid-cols-12 items-center px-3 py-3 rounded-xl border ${highlightRow(learner)} ${current ? '' : 'border-line/50'} transition-all hover:border-accent/50`}
              >
                {/* Rank */}
                <div className="col-span-2 flex items-center gap-2">
                  {rank <= 3 && rank !== myRank ? (
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full ${getMedalColor(rank)}`}>
                      <Medal size={16} />
                    </div>
                  ) : (
                    <span className={`text-sm font-bold ${isCurrentUser(learner) ? 'text-accent' : 'text-ink2'}`}>
                      #{rank}
                    </span>
                  )}
                </div>

                {/* Name & Avatar */}
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <span className="text-xl">{learner.avatar}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isCurrentUser(learner) ? 'text-accent' : 'text-ink'}`}>
                      {learner.name}
                      {isCurrentUser(learner) && <span className="ml-1 text-xs text-ink3">(you)</span>}
                    </p>
                    {learner.improvement && learner.improvement !== 'N/A' && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <TrendingUp size={10} />
                        {learner.improvement}
                      </p>
                    )}
                  </div>
                </div>

                {/* Level */}
                <div className="col-span-2 text-center">
                  <span className="inline-flex items-center px-2 py-1 text-xs font-semibold bg-surface2 rounded-lg text-ink">
                    Lvl {learner.level}
                  </span>
                </div>

                {/* XP */}
                <div className="col-span-2 text-right">
                  <p className={`text-sm font-semibold ${isCurrentUser(learner) ? 'text-accent' : 'text-ink'}`}>
                    {learner.xp.toLocaleString()}
                  </p>
                  <div className="flex items-center justify-end gap-1">
                    <Zap size={10} className="text-yellow-500" />
                    <span className="text-xs text-ink3">{Math.floor(learner.xp / 100)} lessons</span>
                  </div>
                </div>

                {/* Streak */}
                <div className="col-span-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className={`text-sm font-bold ${isCurrentUser(learner) ? 'text-accent' : 'text-ink'}`}>
                      {learner.streak}
                    </span>
                    <Flame size={12} className={isCurrentUser(learner) ? 'text-orange-500' : 'text-orange-400'} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tips */}
        {activeTab === 'top' && (
          <div className="mt-6 p-4 bg-surface2 border border-line rounded-xl">
            <p className="text-xs text-ink2 text-center">
              🔥 These top 10 learners are crushing it! Study their habits and catch up.
            </p>
          </div>
        )}

        {activeTab === 'nearby' && (
          <div className="mt-6 p-4 bg-surface2 border border-line rounded-xl">
            <p className="text-xs text-ink2 text-center">
              👥 Learners at similar levels - perfect for healthy competition!
            </p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {myRank && (
        <div className="border-t border-line bg-surface px-4 py-3">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="text-xs text-ink3">
              <Users size={12} className="inline mr-1" />
              {learners.length - 1} learners competing
            </div>
            <div className="text-xs text-emerald-600 flex items-center gap-1">
              <Target size={12} />
              Your goal: #1 this week!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions
function calculateImprovement() {
  // Simulate improvement calculation based on session history
  const sessions = getSessions();
  if (sessions.length < 2) return '+5%';
  const recent = sessions.slice(-7).length;
  const earlier = sessions.slice(-14, -7).length;
  if (earlier === 0) return '+100%';
  const change = ((recent - earlier) / earlier) * 100;
  return `+${Math.round(change)}%`;
}

function getRandomName(idx) {
  const firstNames = ['Ambre', 'Theo', 'Louise', 'Romain', 'Chloe', 'Arthur', 'Manon', 'Nicolas', 'Julie', 'Alexandre'];
  const lastNames = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau'];
  return `${firstNames[idx % firstNames.length]} ${lastNames[Math.floor(idx / firstNames.length) % lastNames.length]}`;
}

function getRandomAvatar(idx) {
  const avatars = ['👨‍🎓', '👩‍🎓', '👨‍💻', '👩‍💻', '👨‍🔬', '👩‍⚕️', '👨‍🏫', '👩‍🏫', '🧑‍🎤', '🧑‍💼'];
  return avatars[idx % avatars.length];
}
