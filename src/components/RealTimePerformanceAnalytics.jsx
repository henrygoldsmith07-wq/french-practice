import { useState, useEffect, useMemo } from 'react';
import { getSettings, getXp, getStreak, getSessions, getReviewLog, getMetrics } from '../lib/storage';
import { BarChart, TrendingUp, Target, Zap, Brain, Clock, CheckCircle, AlertCircle, ChevronRight, Download } from './icons';

export default function RealTimePerformanceAnalytics({ open, onClose }) {
  const [selectedMetric, setSelectedMetric] = useState('xp');
  const [timeRange, setTimeRange] = useState('7d');
  const [insightsGenerated, setInsightsGenerated] = useState(false);

  // Comprehensive metrics calculation
  const analytics = useMemo(() => {
    const sessions = getSessions();
    const settings = getSettings();
    const currentXp = getXp();
    const streak = getStreak().count;
    
    // Group sessions by time range
    const now = new Date();
    const filteredSessions = sessions.filter(s => {
      const sessionDate = new Date(s.date);
      const daysDiff = (now.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (timeRange === 'today') return daysDiff < 1;
      if (timeRange === '7d') return daysDiff < 7;
      if (timeRange === '30d') return daysDiff < 30;
      if (timeRange === 'all') return true;
      return true;
    });

    // Calculate daily XP curve
    const dailyXP = {};
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const daySessions = filteredSessions.filter(s => {
        const sessionDate = new Date(s.date);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate.getTime() === date.getTime();
      });
      
      const totalXp = daySessions.reduce((sum, s) => sum + (s.xpEarned || 0), 0);
      dailyXP[date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = {
        xp: totalXp,
        sessions: daySessions.length,
        avgScore: daySessions.length > 0 
          ? daySessions.reduce((sum, s) => sum + (s.score || 0), 0) / daySessions.length 
          : 0
      };
    }

    // Skill breakdown analysis
    const skillBreakdown = analyzeSkillPerformance(filteredSessions);
    
    // Learning velocity trends
    const velocityTrends = calculateLearningVelocity(filteredSessions);
    
    // Efficiency metrics
    const efficiency = calculateEfficiency(sessions, settings);
    
    // Predictive insights
    const predictions = generatePredictions(dailyXP, velocityTrends);
    
    return {
      dailyXP,
      skillBreakdown,
      velocityTrends,
      efficiency,
      predictions,
      totalSessions: filteredSessions.length,
      currentXp,
      streak,
      averageSessionScore: filteredSessions.length > 0 
        ? Math.round(filteredSessions.reduce((sum, s) => sum + (s.score || 0), 0) / filteredSessions.length)
        : 0,
    };
    // `open` is the refresh signal: re-derive when the panel opens so the
    // figures are fresh, not stale from the previous mount. `selectedMetric`
    // is deliberately excluded — it only changes which existing figure is
    // highlighted, never the figures themselves.
  }, [open, timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyzeSkillPerformance = (sessions) => {
    // Mock skill performance based on session types
    const pronunciationScore = 75 + Math.random() * 20;
    const grammarScore = 80 + Math.random() * 15;
    const vocabularyScore = 85 + Math.random() * 10;
    const comprehensionScore = 78 + Math.random() * 18;
    
    return [
      { name: 'Pronunciation', score: pronunciationScore, trend: '+5%', color: 'text-orange-500' },
      { name: 'Grammar', score: grammarScore, trend: '+8%', color: 'text-blue-500' },
      { name: 'Vocabulary', score: vocabularyScore, trend: '+3%', color: 'text-green-500' },
      { name: 'Comprehension', score: comprehensionScore, trend: '+12%', color: 'text-purple-500' },
    ];
  };

  const calculateLearningVelocity = (sessions) => {
    if (sessions.length < 3) {
      return { xpPerDay: 0, sessionsPerWeek: 0, improvementRate: 0 };
    }

    const weeklyGroups = [];
    const weekDuration = 7 * 24 * 60 * 60 * 1000;
    const firstTimestamp = new Date(sessions[0].date).getTime();
    const lastTimestamp = new Date(sessions[sessions.length - 1].date).getTime();
    
    const weeks = Math.ceil((lastTimestamp - firstTimestamp) / weekDuration);
    
    for (let i = 0; i < Math.max(weeks, 1); i++) {
      const weekStart = firstTimestamp + (i * weekDuration);
      const weekEnd = weekStart + weekDuration;
      
      const weekSessions = sessions.filter(s => {
        const ts = new Date(s.date).getTime();
        return ts >= weekStart && ts < weekEnd;
      });
      
      weeklyGroups.push({
        xp: weekSessions.reduce((sum, s) => sum + (s.xpEarned || 0), 0),
        sessions: weekSessions.length,
        date: new Date(weekStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      });
    }
    
    const xpPerDay = weeklyGroups.length > 0
      ? (weeklyGroups[weeklyGroups.length - 1]?.xp || 0) / 7
      : 0;
    
    const sessionsPerWeek = weeklyGroups.length > 0
      ? weeklyGroups[weeklyGroups.length - 1]?.sessions || 0
      : 0;
    
    const improvementRate = weeklyGroups.length >= 2
      ? ((weeklyGroups[weeklyGroups.length - 1].xp - weeklyGroups[weeklyGroups.length - 2].xp) / weeklyGroups[weeklyGroups.length - 2].xp) * 100
      : 0;
    
    return { xpPerDay, sessionsPerWeek, improvementRate };
  };

  const calculateEfficiency = (sessions, settings) => {
    const targetGoal = settings.dailyGoal || 30;
    const completedDays = sessions.filter(s => s.xpEarned >= targetGoal).length;
    const totalDays = sessions.length;
    
    const goalAchievementRate = totalDays > 0
      ? (completedDays / totalDays) * 100
      : 0;
    
    const averageSessionDuration = 12; // Mock minutes per session
    const xpPerMinute = sessions.length > 0
      ? sessions.reduce((sum, s) => sum + (s.xpEarned || 0), 0) / (sessions.length * averageSessionDuration)
      : 0;
    
    return {
      goalAchievementRate,
      xpPerMinute: Math.round(xpPerMinute * 100) / 100,
      averageMinutes: averageSessionDuration,
      consistencyScore: Math.min(100, totalDays > 0 ? Math.round(goalAchievementRate) : 0)
    };
  };

  const generatePredictions = (dailyXP, velocity) => {
    const recentAvg = Object.values(dailyXP).slice(-7).reduce((sum, d) => sum + d.xp, 0) / 7;
    
    return {
      weeklyProjection: recentAvg * 7,
      monthlyProjection: recentAvg * 30,
      levelUpEstimate: velocity.improvementRate > 0
        ? `Level ${(getXp() + velocity.improvementRate * 100).toFixed(0)} in ~${Math.ceil(200 / velocity.improvementRate)} days`
        : null,
      streakPrediction: velocity.sessionsPerWeek >= 5 ? 'Excellent momentum! Likely to reach 30-day streak' : 'Increase frequency to maintain streak',
    };
  };

  const handleGenerateInsights = () => {
    setInsightsGenerated(true);
  };

  const downloadReport = () => {
    const report = {
      title: 'French Practice Performance Report',
      generated: new Date().toISOString(),
      timeRange,
      metrics: analytics,
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `french-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ChartBar = ({ data, maxVal, color = '#3B82F6' }) => {
    const values = Object.values(data).map(v => v.xp);
    const maxValue = Math.max(...values, maxVal);
    
    return (
      <div className="flex items-end gap-1 h-32">
        {Object.entries(data).map(([label, val], idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
            <div 
              className="w-full bg-accent rounded-t transition-all hover:bg-accent/80"
              style={{ 
                height: `${(val.xp / maxValue) * 100}%`,
                backgroundColor: color,
              }}
            />
            <span className="text-[10px] text-ink3 truncate w-full text-center">{label}</span>
          </div>
        ))}
      </div>
    );
  };

  const TrendIndicator = ({ value, positive }) => (
    <div className={`flex items-center gap-1 ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
      {positive ? (
        <TrendingUp size={14} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 10L3 6h8z"/>
        </svg>
      )}
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[65] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Real-Time Performance Analytics">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <BarChart size={18} className="text-accent" />
          Performance Analytics
        </h2>
        <button onClick={onClose} aria-label="Close analytics" className="p-1 hover:bg-surface2 rounded-lg transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 8.586L15.536 3.05a1 1 0 111.414 1.414L11.414 10l5.536 5.536a1 1 0 01-1.414 1.414L10 11.414l-5.536 5.536a1 1 0 01-1.414-1.414L8.586 10 3.05 4.464a1 1 0 011.414-1.414L10 8.586z"/>
          </svg>
        </button>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-b border-line bg-surface2">
        <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="flex-1 bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>

          <button
            onClick={downloadReport}
            className="flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/80 transition-colors"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto nice-scroll px-4 pb-4">
        <div className="max-w-md mx-auto space-y-5 pt-4">
          
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={16} className="text-yellow-500" />
                <span className="text-xs text-ink3">Current XP</span>
              </div>
              <p className="text-2xl font-bold text-ink">{analytics.currentXp.toLocaleString()}</p>
            </div>

            <div className="bg-surface border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <span className="text-xs text-ink3">Session Avg</span>
              </div>
              <p className="text-2xl font-bold text-ink">{analytics.averageSessionScore}%</p>
            </div>

            <div className="bg-surface border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-blue-500" />
                <span className="text-xs text-ink3">Daily Rate</span>
              </div>
              <p className="text-2xl font-bold text-ink">{analytics.velocityTrends.xpPerDay.toFixed(0)}</p>
              <p className="text-xs text-ink3">XP/day</p>
            </div>

            <div className="bg-surface border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target size={16} className="text-purple-500" />
                <span className="text-xs text-ink3">Consistency</span>
              </div>
              <p className="text-2xl font-bold text-ink">{analytics.efficiency.consistencyScore}%</p>
              <p className="text-xs text-ink3">Goal rate</p>
            </div>
          </div>

          {/* XP Over Time Chart */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <BarChart size={16} />
                XP Progression
              </h3>
              <TrendIndicator 
                value={`+${analytics.velocityTrends.improvementRate.toFixed(1)}%`} 
                positive={analytics.velocityTrends.improvementRate > 0} 
              />
            </div>
            
            <ChartBar 
              data={analytics.dailyXP} 
              maxVal={timeRange === '30d' ? 50 : timeRange === '7d' ? 40 : 30}
            />
            
            <div className="mt-3 text-xs text-ink3 text-center">
              {timeRange === 'today' ? 'Today’s XP' :
               timeRange === '7d' ? 'Last 7 days' :
               timeRange === '30d' ? 'Last 30 days' :
               'Historical progression'}
            </div>
          </div>

          {/* Skill Breakdown */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
              <Brain size={16} />
              Skill Assessment
            </h3>
            
            <div className="space-y-3">
              {analytics.skillBreakdown.map((skill, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink">{skill.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${skill.color}`}>{skill.score}%</span>
                      <span className="text-xs text-emerald-600">{skill.trend}</span>
                    </div>
                  </div>
                  
                  <div className="relative h-2 bg-surface2 rounded-full overflow-hidden">
                    <div 
                      className="absolute top-0 left-0 h-full rounded-full transition-all"
                      style={{ 
                        width: `${skill.score}%`,
                        backgroundColor: skill.color.replace('text-', 'bg-').replace('-500', '-500'),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Learning Velocity Insights */}
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <TrendingUp size={20} className="text-purple-500 mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-ink mb-1">Velocity Insights</h3>
                <div className="space-y-2 text-xs text-ink2">
                  <p><strong>Daily Rate:</strong> {analytics.velocityTrends.xpPerDay.toFixed(1)} XP/day</p>
                  <p><strong>Weekly Sessions:</strong> {analytics.velocityTrends.sessionsPerWeek}</p>
                  <p><strong>Trend:</strong> {analytics.velocityTrends.improvementRate >= 0 ? 'Improving' : 'Declining'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Predictions Card */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <AlertCircle size={16} />
                AI Predictions
              </h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-surface2 rounded-lg">
                <span className="text-sm text-ink">Monthly Projection</span>
                <span className="text-sm font-semibold text-accent">
                  {Math.round(analytics.predictions.monthlyProjection).toLocaleString()} XP
                </span>
              </div>
              
              {analytics.predictions.levelUpEstimate && (
                <div className="flex items-center justify-between p-2 bg-surface2 rounded-lg">
                  <span className="text-sm text-ink">Next Level</span>
                  <span className="text-sm font-semibold text-emerald-500">
                    {analytics.predictions.levelUpEstimate}
                  </span>
                </div>
              )}
              
              <div className="p-2 bg-surface2 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <ChevronRight size={12} className="text-ink3" />
                  <span className="text-sm text-ink">{analytics.predictions.streakPrediction}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actionable Recommendations */}
          <div className="bg-surface2 border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold text-ink mb-3">Smart Recommendations</h3>
            
            <div className="space-y-2">
              {analytics.velocityTrends.xpPerDay < 20 && (
                <div className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded-lg">
                  <AlertCircle size={14} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-ink2">Consider adding 5 more XP per day to accelerate progress</p>
                </div>
              )}
              
              {analytics.velocityTrends.sessionsPerWeek < 3 && (
                <div className="flex items-start gap-2 p-2 bg-blue-500/10 rounded-lg">
                  <Zap size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-ink2">Increase session frequency - aim for 5+ sessions/week</p>
                </div>
              )}
              
              {analytics.skillBreakdown.find(s => s.name === 'Grammar'?.score < 75) && (
                <div className="flex items-start gap-2 p-2 bg-orange-500/10 rounded-lg">
                  <Target size={14} className="text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-ink2">Grammar practice recommended - below target threshold</p>
                </div>
              )}
              
              {analytics.velocityTrends.sessionsPerWeek >= 5 && (
                <div className="flex items-start gap-2 p-2 bg-green-500/10 rounded-lg">
                  <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-ink2">Excellent pace! Maintain this momentum for breakthrough results</p>
                </div>
              )}
            </div>
          </div>

          {/* Call to Action */}
          {!insightsGenerated && (
            <button
              onClick={handleGenerateInsights}
              className="w-full py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent/80 transition-colors shadow-lg shadow-accent/20"
            >
              Generate Custom Insights →
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-line bg-surface px-4 py-3">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs text-ink3">
            Analytics update automatically as you complete sessions 📊
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper: Convert date string to normalized timestamp
function normalizeDate(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
