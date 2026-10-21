// Comprehensive Gamification Hub - Achievements, Challenges, Leaderboards, Power-ups
import { useState } from 'react';
import { Trophy, Star, Award, Zap, Shield, Gem, Flame, Target, MapPin } from './icons';
import { ACHIEVEMENTS, getAvailableChallenge, checkAchievements, getLeaderboardData, POWERUPS } from '../lib/gamification';

export default function GamificationHub({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('achievements'); // achievements | challenges | leaderboard | powerups
  
  if (!open) return null;
  
  const userState = {
    sessionsCompleted: 47,
    vocabularyLearned: 523,
    streakDays: 12,
    conversationsCompleted: 38,
    avgAccuracy: 0.87,
    pronunciationScore: 82,
    unlockedAchievements: ['first_steps', 'vocabulary_beginner'],
    completedChallenges: [],
    weeklyXP: 450,
    cefrLevel: 'A2',
    currentStreak: 12,
  };
  
  const { newlyUnlocked } = checkAchievements(userState);
  const challenge = getAvailableChallenge(userState);
  const leaderboard = getLeaderboardData('user1', userState.weeklyXP);
  
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Gamification Hub">
      <div className="mx-auto min-h-full max-w-4xl px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 grid place-items-center">
              <Trophy size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Gamification Hub</h2>
              <p className="text-xs text-ink2">Achievements, challenges & more</p>
            </div>
          </div>
          
          {newlyUnlocked.length > 0 && (
            <NewUnlockBadge count={newlyUnlocked.length} onDismiss={() => {}} />
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
            active={activeTab === 'achievements'} 
            onClick={() => setActiveTab('achievements')}
            icon={Award}
            label="Badges"
            badge={newlyUnlocked.length}
          />
          <TabButton 
            active={activeTab === 'challenges'} 
            onClick={() => setActiveTab('challenges')}
            icon={Target}
            label="Challenges"
          />
          <TabButton 
            active={activeTab === 'leaderboard'} 
            onClick={() => setActiveTab('leaderboard')}
            icon={MapPin}
            label={`#${leaderboard.globalRank}`}
          />
          <TabButton 
            active={activeTab === 'powerups'} 
            onClick={() => setActiveTab('powerups')}
            icon={Zap}
            label="Boosts"
          />
        </div>
        
        {/* Content by Tab */}
        {activeTab === 'achievements' && (
          <AchievementsView 
            userState={userState}
            allAchievements={ACHIEVEMENTS}
            newlyUnlocked={newlyUnlocked}
          />
        )}
        
        {activeTab === 'challenges' && (
          <ChallengesView challenge={challenge} userState={userState} />
        )}
        
        {activeTab === 'leaderboard' && (
          <LeaderboardView leaderboard={leaderboard} />
        )}
        
        {activeTab === 'powerups' && (
          <PowerUpsView userCoins={250} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors relative ${
        active 
          ? 'bg-accent text-onaccent' 
          : 'text-ink3 hover:bg-surface2'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <Icon size={14} />
        {label}
      </div>
      {badge > 0 && (
        <span className="absolute top-1 right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full grid place-items-center">
          {badge}
        </span>
      )}
    </button>
  );
}

function NewUnlockBadge({ count, onDismiss }) {
  return (
    <div className="relative animate-bounce">
      <span className="w-8 h-8 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 grid place-items-center text-white text-xs font-bold">
        🎉
      </span>
      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full grid place-items-center">
        {count}
      </span>
    </div>
  );
}

function AchievementsView({ userState, allAchievements, newlyUnlocked }) {
  const unlockedCount = userState.unlockedAchievements?.length || 0;
  const totalCount = allAchievements.length;
  const progressPercentage = Math.round((unlockedCount / totalCount) * 100);
  
  return (
    <div className="space-y-4 fade-in">
      {/* Progress Overview */}
      <div className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 p-5 text-white">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-lg">Collection Progress</h3>
          <span className="text-2xl">{progressPercentage}%</span>
        </div>
        
        <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-1">
          <div 
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        <p className="text-sm opacity-90">{unlockedCount}/{totalCount} badges collected</p>
      </div>
      
      {/* Newly Unlocked Section */}
      {newlyUnlocked.length > 0 && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-4">
          <h4 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">
            <Star className="text-yellow-600" size={16} />
            Recently Unlocked!
          </h4>
          {newlyUnlocked.map(achievement => (
            <div key={achievement.id} className="flex items-center gap-3 py-2">
              <span className="text-2xl">{achievement.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-ink">{achievement.title}</p>
                <p className="text-xs text-ink2">{achievement.description}</p>
              </div>
              <span className="text-xs font-semibold text-green-600">+{achievement.rewardXp} XP</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Achievement Categories */}
      <div className="space-y-3">
        {[
          { title: 'Streak Masters 🔥', data: filterByCategory('streak'), color: 'from-orange-400 to-red-500' },
          { title: 'Skill Development 💪', data: filterByCategory('skills'), color: 'from-blue-400 to-cyan-500' },
          { title: 'Learning Milestones 🏆', data: filterByCategory('milestone'), color: 'from-purple-400 to-pink-500' },
        ].map((section, i) => (
          <AchievementSection 
            key={i}
            title={section.title}
            achievements={section.data}
            gradient={section.color}
          />
        ))}
      </div>
    </div>
  );
}

function AchievementSection({ title, achievements, gradient }) {
  const unlocked = achievements.filter(a => a.tier === 'legendary' || a.tier === 'epic');
  
  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className={`bg-gradient-to-r ${gradient} p-3 text-white font-bold`}>
        {title}
      </div>
      <div className="p-3 space-y-2">
        {achievements.slice(0, 3).map((achievement, i) => (
          <AchievementRow key={i} achievement={achievement} />
        ))}
      </div>
    </div>
  );
}

function AchievementRow({ achievement }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface2 transition-colors">
      <span className="text-2xl shrink-0">{achievement.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-ink text-sm">{achievement.title}</p>
        <p className="text-xs text-ink2 truncate">{achievement.description}</p>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
        achievement.tier === 'legendary' ? 'bg-yellow-100 text-yellow-700' :
        achievement.tier === 'epic' ? 'bg-purple-100 text-purple-700' :
        achievement.tier === 'rare' ? 'bg-blue-100 text-blue-700' :
        'bg-gray-100 text-gray-700'
      }`}>
        {achievement.tier}
      </span>
    </div>
  );
}

function ChallengesView({ challenge, userState }) {
  return (
    <div className="space-y-4 fade-in">
      {/* Active Challenge Card */}
      <div className="rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 p-6 text-white">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-lg">Daily Challenge</h3>
          <Flame size={20} className="shrink-0" />
        </div>
        
        <h4 className="font-bold text-xl mb-1">{challenge.title}</h4>
        <p className="text-sm opacity-90 mb-4">{challenge.description}</p>
        
        <div className="flex items-center justify-between">
          <div className="text-center">
            <p className="text-2xl font-black">{Math.floor(Math.random() * 5) + 3}</p>
            <p className="text-xs opacity-75">days remaining</p>
          </div>
          
          <div className="flex-1 mx-4">
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: '40%' }} />
            </div>
          </div>
          
          <div className="text-center">
            <p className="text-2xl font-black">{challenge.rewardXp}</p>
            <p className="text-xs opacity-75">XP reward</p>
          </div>
        </div>
        
        <button className="mt-4 w-full bg-white text-green-600 font-bold py-2 rounded-lg hover:bg-white/90 transition-colors">
          Complete Challenge
        </button>
      </div>
      
      {/* Other Challenges */}
      <div className="rounded-xl bg-surface2 border border-line p-4">
        <h4 className="font-semibold text-ink mb-3">Weekly Challenges</h4>
        <div className="space-y-2">
          {['Weekly 100 XP Challenge', 'Vocabulary Sprint'].map((title, i) => (
            <ChallengeListItem 
              key={i}
              title={title}
              progress={Math.floor(Math.random() * 60) + 20}
              reward={Math.floor(Math.random() * 200) + 100}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChallengeListItem({ title, progress, reward }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface transition-colors">
      <div className="flex-1">
        <p className="font-medium text-ink text-sm">{title}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-ink3 tabular-nums">{progress}%</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-green-600 whitespace-nowrap">+{reward} XP</span>
    </div>
  );
}

function LeaderboardView({ leaderboard }) {
  return (
    <div className="space-y-4 fade-in">
      {/* Your Rank */}
      <div className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 p-6 text-white text-center">
        <p className="text-sm opacity-90 mb-1">Your Global Rank</p>
        <p className="text-5xl font-black mb-2">#{leaderboard.globalRank}</p>
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{leaderboard.percentile}<sup className="text-sm">th</sup></p>
            <p className="text-xs opacity-75">Percentile</p>
          </div>
          <div className="w-px h-8 bg-white/30" />
          <div className="text-center">
            <p className="text-2xl font-bold">{leaderboard.totalPlayers.toLocaleString()}</p>
            <p className="text-xs opacity-75">Players</p>
          </div>
        </div>
        <p className="text-sm">Earn {leaderboard.weeklyXP} XP this week!</p>
      </div>
      
      {/* Friends Ranking */}
      <div className="rounded-xl bg-surface2 border border-line p-4">
        <h4 className="font-semibold text-ink mb-3">Friends Rankings</h4>
        <div className="space-y-2">
          {leaderboard.friends.map((friend, i) => (
            <FriendRow key={i} friend={friend} rank={i + 1} yourRank={leaderboard.globalRank <= friend.rank} />
          ))}
        </div>
      </div>
      
      {/* Top Players Preview */}
      <div className="rounded-xl bg-surface border border-line p-4">
        <h4 className="font-semibold text-ink mb-3">Top Players This Week</h4>
        <div className="space-y-2">
          {generateMockTopPlayers().slice(0, 5).map((player, i) => (
            <PlayerRow key={i} player={player} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FriendRow({ friend, rank, yourRank }) {
  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg ${yourRank ? 'bg-yellow-50' : ''}`}>
      <span className="text-lg">{friend.avatar}</span>
      <div className="flex-1">
        <p className="font-medium text-ink text-sm flex items-center gap-2">
          {friend.name}
          {rank === 1 && <Gem size={12} className="text-yellow-600" />}
        </p>
      </div>
      <span className="text-xs font-semibold text-ink3 whitespace-nowrap">{friend.xp} XP</span>
    </div>
  );
}

function PlayerRow({ player, rank }) {
  const colors = { 1: 'text-yellow-600', 2: 'text-gray-600', 3: 'text-amber-700' };
  
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface2 transition-colors">
      <span className={`font-bold text-lg ${colors[rank] || 'text-ink3'}`}>#{rank}</span>
      <span className="text-xl">{player.avatar}</span>
      <div className="flex-1">
        <p className="font-medium text-ink text-sm">{player.name}</p>
      </div>
      <span className="text-xs font-semibold text-ink3 whitespace-nowrap">{player.xp} XP</span>
    </div>
  );
}

function PowerUpsView({ userCoins }) {
  return (
    <div className="space-y-4 fade-in">
      <div className="rounded-xl bg-surface2 border border-line p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-ink">Your Coins</h4>
          <span className="text-lg font-bold text-ink">{userCoins}</span>
        </div>
        
        <div className="grid gap-3">
          {POWERUPS.map((powerUp, i) => (
            <PowerUpCard key={i} powerUp={powerUp} userCoins={userCoins} />
          ))}
        </div>
      </div>
      
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-center">
        <Shield size={24} className="mx-auto mb-2 text-blue-600" />
        <p className="text-sm font-medium text-blue-800">Power-up Tips</p>
        <p className="text-xs text-blue-600 mt-1">
          Use Double XP Boost during practice sessions for maximum rewards!
        </p>
      </div>
    </div>
  );
}

function PowerUpCard({ powerUp, userCoins }) {
  const canAfford = userCoins >= powerUp.cost;
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-line bg-surface hover:border-accent transition-colors">
      <div className={`w-10 h-10 rounded-lg grid place-items-center ${
        powerUp.rarity === 'legendary' ? 'bg-yellow-100' :
        powerUp.rarity === 'epic' ? 'bg-purple-100' :
        'bg-blue-100'
      }`}>
        {powerUp.id === 'double_xp' ? <Zap size={20} className="text-blue-600" /> :
         powerUp.id === 'streak_freeze' ? <Shield size={20} className="text-purple-600" /> :
         <Target size={20} className="text-green-600" />}
      </div>
      
      <div className="flex-1">
        <p className="font-semibold text-ink text-sm">{powerUp.name}</p>
        <p className="text-xs text-ink2">{powerUp.description}</p>
      </div>
      
      <button
        disabled={!canAfford}
        className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
          canAfford 
            ? 'bg-accent text-onaccent hover:opacity-90' 
            : 'bg-surface2 text-ink3 cursor-not-allowed'
        }`}
      >
        {powerUp.cost} 💰
      </button>
    </div>
  );
}

function filterByCategory(category) {
  const categories = {
    skills: ['conversation_star', 'accuracy_master', 'pronunciation_pro'],
    milestone: ['level_cefr_a1', 'level_cefr_b1', 'level_cefr_c1'],
    streak: ['week_streak', 'month_streak', 'year_streak'],
  };
  
  const ids = categories[category];
  return ACHIEVEMENTS.filter(a => ids.includes(a.id));
}

function generateMockTopPlayers() {
  return [
    { name: 'Marie L.', xp: 5234, avatar: '👩‍💻' },
    { name: 'Pierre D.', xp: 4987, avatar: '👨‍💼' },
    { name: 'Sophie M.', xp: 4756, avatar: '👧' },
    { name: 'Lucas B.', xp: 4521, avatar: '👦' },
    { name: 'Camille R.', xp: 4398, avatar: '👩' },
  ];
}
