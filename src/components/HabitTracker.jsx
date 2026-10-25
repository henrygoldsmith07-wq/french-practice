import { useState, useEffect, useMemo } from 'react';
import { getSettings, getXp, getSessions, setSettings, addXp as recordXp } from '../lib/storage';
import { Flame, TrendingUp, Target, Calendar, CheckCircle, AlertCircle, Bell, X, Zap, Heart } from './icons';

export default function HabitTracker({ open, onClose }) {
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [todayProgress, setTodayProgress] = useState({ xp: 0, target: 30 });
  const [weeklyConsistency, setWeeklyConsistency] = useState([]);
  const [nudgeEnabled, setNudgeEnabled] = useState(true);
  const [preferredReminders, setPreferredReminders] = useState(['morning', 'evening']);
  const [motivationalMessage, setMotivationalMessage] = useState('');

  // Calculate habit metrics
  useEffect(() => {
    if (!open) return;
    
    const sessions = getSessions();
    const settings = getSettings();
    const xp = getXp();
    
    // Current streak calculation
    const streakData = calculateStreak(sessions);
    setCurrentStreak(streakData.current);
    setLongestStreak(streakData.longest);
    
    // Today's progress
    const todayXp = streakData.todayXp || 0;
    const dailyGoal = settings.dailyGoal || 30;
    setTodayProgress({ xp: todayXp, target: dailyGoal });
    
    // Weekly consistency heatmap
    const weeklyStats = calculateWeeklyConsistency(sessions);
    setWeeklyConsistency(weeklyStats);
    
    // Motivational message based on progress
    const motivation = generateMotivation(todayXp, dailyGoal, streakData.current);
    setMotivationalMessage(motivation);
  }, [open]);

  const calculateStreak = (sessions) => {
    if (!sessions || sessions.length === 0) {
      return { current: 0, longest: 0, todayXp: 0 };
    }

    const sortedSessions = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let currentStreak = 0;
    let longestStreak = 0;
    let todayXp = 0;
    let consecutiveDays = 0;
    
    for (let i = 0; i < sortedSessions.length; i++) {
      const sessionDate = new Date(sortedSessions[i].date);
      sessionDate.setHours(0, 0, 0, 0);
      
      const diffTime = Math.abs(today.getTime() - sessionDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        todayXp += sortedSessions[i].xpEarned || 0;
        consecutiveDays++;
      } else if (diffDays === 1 && consecutiveDays > 0) {
        currentStreak = consecutiveDays + 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else if (diffDays > 1) {
        break;
      }
    }

    return { current: currentStreak, longest: longestStreak, todayXp };
  };

  const calculateWeeklyConsistency = (sessions) => {
    const days = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const daySessions = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate.getTime() === date.getTime();
      });
      
      const totalXp = daySessions.reduce((sum, s) => sum + (s.xpEarned || 0), 0);
      days.push({
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        xp: totalXp,
        sessions: daySessions.length,
        goalReached: totalXp >= 30,
      });
    }
    
    return days;
  };

  const generateMotivation = (currentXp, target, streak) => {
    if (currentXp >= target) {
      return `🎉 Goal crushed! You've earned your ${target} XP today. Keep the momentum going!`;
    }
    
    const remaining = target - currentXp;
    if (streak >= 7) {
      return `🔥 ${streak}-day streak! Just ${remaining} more XP to complete today's goal!`;
    }
    
    if (streak >= 3) {
      return `📈 Great progress! ${remaining} XP away from your daily target. Stay consistent!`;
    }
    
    return `💪 First few days are the hardest! ${remaining} XP to go - you got this!`;
  };

  const updateDailyGoal = (newGoal) => {
    const settings = getSettings();
    setSettings({ ...settings, dailyGoal: newGoal });
    setTodayProgress(prev => ({ ...prev, target: newGoal }));
  };

  const toggleReminder = (time) => {
    setPreferredReminders(prev => 
      prev.includes(time) 
        ? prev.filter(t => t !== time)
        : [...prev, time]
    );
  };

  const getHeatmapColor = (xp) => {
    if (xp === 0) return 'bg-surface3';
    if (xp < 15) return 'bg-yellow-400/30';
    if (xp < 30) return 'bg-green-400/30';
    return 'bg-emerald-500/50';
  };

  const getConsecutiveMagicNumber = () => {
    if (currentStreak >= 30) return 'Legendary 🔱';
    if (currentStreak >= 14) return 'Dedicated ⭐';
    if (currentStreak >= 7) return 'Consistent ✨';
    if (currentStreak >= 3) return 'Building 💪';
    return 'Starting 🌱';
  };

  const sendNudge = (type) => {
    if (!nudgeEnabled) return;
    
    const messages = {
      morning: "Bonjour! Time for your French practice session ☀️",
      evening: "Rappelez-vous: la pratique fait le maître 🌙",
      break: "Break time? Perfect moment for 5 minutes of French! 🇫🇷",
    };
    
    console.log(`[Habit Nudge ${type}]`, messages[type] || 'Keep practicing!');
    
    // In production, this would trigger browser notification API
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('French Practice Reminder', {
        body: messages[type] || 'Don\'t break your streak!',
        icon: '/icon-192.png',
      });
    }
  };

  const scheduleTestNudge = (type) => {
    sendNudge(type);
    alert(`Test nudge sent: ${type}`);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Habit Formation Tracker">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Flame size={18} className="text-orange-500" />
          Your Learning Habits
        </h2>
        <button onClick={onClose} aria-label="Close habit tracker" className="p-1 hover:bg-surface2 rounded-lg transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto nice-scroll px-4 pb-4">
        <div className="max-w-md mx-auto space-y-5 pt-4">
          
          {/* Current Streak Hero Card */}
          <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Flame size={18} className="text-orange-500" />
                Current Streak
              </h3>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                currentStreak >= 7 ? 'bg-orange-500/20 text-orange-400' : 
                currentStreak >= 3 ? 'bg-yellow-500/20 text-yellow-400' : 
                'bg-slate-500/20 text-slate-400'
              }`}>
                {getConsecutiveMagicNumber()}
              </span>
            </div>
            
            <div className="flex items-center justify-center py-4">
              <div className="relative">
                <div className="w-24 h-24 grid place-items-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/30">
                  <span className="text-4xl font-bold text-white">{currentStreak}</span>
                </div>
                <Flame size={24} className="absolute -top-2 -right-2 text-orange-300 animate-pulse" />
              </div>
            </div>
            
            <p className="text-center text-sm text-ink2 mb-2">Day{currentStreak === 1 ? '' : 's'} in a row!</p>
            {longestStreak > currentStreak && (
              <p className="text-xs text-ink3 text-center">
                Longest streak: {longestStreak} days
              </p>
            )}
          </div>

          {/* Today's Progress */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink">Today's Progress</h3>
              <div className="flex items-center gap-1">
                <Zap size={14} className="text-yellow-500" />
                <span className="text-xs text-ink2">XP</span>
              </div>
            </div>
            
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-bold text-ink">{todayProgress.xp}</span>
              <span className="text-sm text-ink3">/ {todayProgress.target} XP</span>
            </div>
            
            <div className="relative h-3 bg-surface2 rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (todayProgress.xp / todayProgress.target) * 100)}%` }}
              />
            </div>
            
            {todayProgress.xp >= todayProgress.target && (
              <p className="text-xs text-emerald-600 mt-2 text-center flex items-center justify-center gap-1">
                <CheckCircle size={12} />
                Daily goal achieved! 🎉
              </p>
            )}
          </div>

          {/* Motivational Message */}
          <div className="bg-surface2 border border-line rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Heart size={20} className="text-pink-500 flex-shrink-0 mt-1" />
              <p className="text-sm text-ink2 italic">"{motivationalMessage}"</p>
            </div>
          </div>

          {/* Weekly Consistency Heatmap */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Calendar size={16} />
              This Week
            </h3>
            
            <div className="space-y-2">
              {weeklyConsistency.map((day, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-ink3 w-12">{day.dayName}</span>
                    <div className="flex-1 h-2 bg-surface2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${getHeatmapColor(day.xp)}`}
                        style={{ width: `${Math.min(100, (day.xp / 30) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {day.goalReached && (
                      <CheckCircle size={14} className="text-emerald-500" />
                    )}
                    <span className="text-xs text-ink2 font-medium">{day.xp} XP</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Nudge Settings */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Bell size={16} />
              Smart Reminders
            </h3>
            
            <div className="space-y-3">
              <label className="flex items-center justify-between p-2 bg-surface2 rounded-lg cursor-pointer hover:bg-surface3 transition-colors">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nudgeEnabled}
                    onChange={(e) => setNudgeEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-line text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-ink">Enable nudges</span>
                </div>
                {nudgeEnabled && (
                  <span className="text-xs text-emerald-600">Active ✓</span>
                )}
              </label>

              <div className="ml-6 space-y-2">
                {['morning', 'break', 'evening'].map((time) => (
                  <label key={time} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={preferredReminders.includes(time)}
                      onChange={() => toggleReminder(time)}
                      className="w-4 h-4 rounded border-line text-accent focus:ring-accent"
                    />
                    <span className="text-xs text-ink capitalize">{time} time</span>
                  </label>
                ))}
              </div>

              <div className="pt-2 flex flex-wrap gap-2">
                {[
                  { label: 'Morning', value: 'morning', icon: '☀️' },
                  { label: 'Break', value: 'break', icon: '🍽️' },
                  { label: 'Evening', value: 'evening', icon: '🌙' },
                ].map(({ label, value, icon }) => (
                  <button
                    key={value}
                    onClick={() => scheduleTestNudge(value)}
                    disabled={!nudgeEnabled}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors flex items-center gap-1 ${
                      nudgeEnabled 
                        ? 'border-accent/30 hover:border-accent text-accent' 
                        : 'border-line text-ink3 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <span>{icon}</span>
                    {label} Test
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tips Card */}
          <div className="bg-surface2 border border-line rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-blue-500 flex-shrink-0 mt-1" />
              <div>
                <h4 className="text-sm font-semibold text-ink mb-1">Habit Building Tips</h4>
                <ul className="text-xs text-ink2 space-y-1 list-disc list-inside">
                  <li>Start small - even 5 minutes counts!</li>
                  <li>Practice at the same time daily</li>
                  <li>Track your mood after each session</li>
                  <li>Celebrate milestones religiously</li>
                  <li>Don't break the chain!</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Adjust Daily Goal */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold text-ink mb-3">Daily XP Goal</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateDailyGoal(Math.max(10, todayProgress.target - 5))}
                className="w-8 h-8 grid place-items-center bg-surface2 rounded-lg text-ink hover:bg-surface3 transition-colors"
              >
                -
              </button>
              <div className="flex-1 text-center">
                <span className="text-lg font-bold text-ink">{todayProgress.target}</span>
                <span className="text-xs text-ink3 ml-1">XP/day</span>
              </div>
              <button
                onClick={() => updateDailyGoal(Math.min(100, todayProgress.target + 5))}
                className="w-8 h-8 grid place-items-center bg-surface2 rounded-lg text-ink hover:bg-surface3 transition-colors"
              >
                +
              </button>
            </div>
            <p className="text-xs text-ink3 mt-2">
              Recommended: {currentStreak >= 7 ? '30-40' : currentStreak >= 3 ? '20-30' : '10-20'} XP for your level
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-line bg-surface px-4 py-3">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs text-ink3">
            Habit formation takes ~66 days on average. You're doing great! 🌟
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper: Extract date without time for comparison
function normalizeDate(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
