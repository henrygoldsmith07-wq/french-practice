import { useState, useEffect, useMemo } from 'react';
import { getSettings, getXp, getStreak, getSessions, getReviewLog, getPrefs } from '../lib/storage';
import { TrendingUp, Target, Sparkles, Clock, Star, CheckCircle, Zap, Brain, Bookmark, Heart } from './icons';

export default function SmartContentRecommendations({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('for-you');
  const [personalizedSuggestions, setPersonalizedSuggestions] = useState([]);
  const [trendingNow, setTrendingNow] = useState([]);
  const [justForYou, setJustForYou] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [matchStrength, setMatchStrength] = useState(0);

  // Generate comprehensive recommendations based on behavioral patterns
  useEffect(() => {
    if (!open) return;
    
    const settings = getSettings();
    const sessions = getSessions();
    const prefs = getPrefs();
    const currentXp = getXp();
    
    // Build detailed user profile
    const profile = buildUserProfile(sessions, settings, prefs);
    setUserProfile(profile);
    
    // Generate personalized recommendations
    const suggestions = generateRecommendations(profile, settings);
    setPersonalizedSuggestions(suggestions);
    
    // Calculate content match strength
    const overallStrength = calculateOverallMatchStrength(suggestions);
    setMatchStrength(Math.round(overallStrength));
    
    // Mock trending content
    const trending = generateTrendingContent();
    setTrendingNow(trending);
    
    // Just for you section
    const justForYou = generateJustForYouContent(profile);
    setJustForYou(justForYou);
    // The builders are component-scope arrow functions; re-running the whole
    // derivation whenever their identity changed would recompute the same
    // output, so the effect deliberately re-runs only when the panel opens.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildUserProfile = (sessions, settings, prefs) => {
    if (!sessions || sessions.length === 0) {
      return {
        level: 5,
        xp: 0,
        streak: 0,
        learningStyle: 'balanced',
        weakAreas: ['grammar', 'pronunciation'],
        strongAreas: ['vocabulary'],
        peakHours: ['morning', 'evening'],
        averageSessionDuration: 15,
        preferredLearningMode: 'mixed',
        recentFocus: [],
      };
    }

    const sortedSessions = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentSessions = sortedSessions.slice(0, 20);
    
    // Analyze learning patterns
    const sessionTypes = recentSessions.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {});
    
    const totalSessions = recentSessions.length;
    const vocabularySessions = sessionTypes['cards'] || 0;
    const grammarSessions = sessionTypes['grammar'] || 0;
    const conversationSessions = sessionTypes['conversation'] || 0;
    
    const styleAnalysis = {
      balanced: Math.min(1, (Math.abs(vocabularySessions - grammarSessions) / totalSessions)),
      vocabFocused: vocabularySessions / totalSessions,
      grammarFocused: grammarSessions / totalSessions,
      conversational: conversationSessions / totalSessions,
    };
    
    const dominantStyle = Object.entries(styleAnalysis)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return {
      level: currentXp > 0 ? Math.floor(currentXp / 500) + 1 : 5,
      xp: currentXp,
      streak: getStreak().count,
      learningStyle: dominantStyle,
      weakAreas: ['grammar', 'pronunciation'].filter(a => !Object.prototype.hasOwnProperty.call(prefs, a) || !prefs[a]),
      strongAreas: ['vocabulary'].filter(a => prefs[a]),
      peakHours: ['morning', 'evening'],
      averageSessionDuration: 15,
      preferredLearningMode: 'mixed',
      recentFocus: Object.keys(sessionTypes).slice(0, 3),
    };
  };

  const generateRecommendations = (profile, settings) => {
    const recommendations = [];
    
    // Based on learning style
    if (profile.learningStyle === 'grammarFocused') {
      recommendations.push({
        id: 'rec_001',
        title: 'Perfect Your French Grammar',
        description: 'Continue your grammar mastery journey with advanced tenses',
        type: 'skill',
        priority: 'high',
        duration: 20,
        reason: `You've been focusing heavily on grammar - maintain this momentum!`,
        icon: 'target',
        tags: ['grammar', 'intermediate', 'structured'],
      });
    } else if (profile.learningStyle === 'conversational') {
      recommendations.push({
        id: 'rec_002',
        title: 'Real-World Conversation Practice',
        description: 'Immerse yourself in authentic French scenarios',
        type: 'conversation',
        priority: 'high',
        duration: 25,
        reason: 'Your conversational focus is paying off - keep practicing!',
        icon: 'chat',
        tags: ['speaking', 'advanced', 'practical'],
      });
    }
    
    // Based on weak areas
    if (profile.weakAreas.includes('pronunciation')) {
      recommendations.push({
        id: 'rec_003',
        title: 'Pronunciation Excellence',
        description: 'Master French phonetics with AI-powered feedback',
        type: 'pronunciation',
        priority: 'medium',
        duration: 15,
        reason: 'Your pronunciation needs attention - daily practice recommended',
        icon: 'mic',
        tags: ['pronunciation', 'beginner-friendly', 'AI-feedback'],
      });
    }
    
    // Streak-based recommendations
    if (profile.streak >= 7) {
      recommendations.push({
        id: 'rec_004',
        title: 'Weekly Challenge Complete!',
        description: 'Celebrate your consistency with an achievement session',
        type: 'challenge',
        priority: 'low',
        duration: 10,
        reason: 'You\'ve maintained a 7-day streak - reward yourself!',
        icon: 'trophy',
        tags: ['gamification', 'fun', 'achievement'],
      });
    }
    
    // XP-based progression
    if (currentXp < 1000 && currentXp > 0) {
      recommendations.push({
        id: 'rec_005',
        title: 'Foundation Builder',
        description: 'Strengthen basic vocabulary and phrases',
        type: 'vocabulary',
        priority: 'medium',
        duration: 15,
        reason: 'Solid foundational knowledge accelerates faster progress',
        icon: 'book',
        tags: ['vocabulary', 'foundational', 'quick-win'],
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });
  };

  const generateTrendingContent = () => {
    return [
      {
        id: 'trend_001',
        title: 'Common French Mistakes to Avoid',
        author: 'French Teacher Marie',
        category: 'Grammar',
        rating: 4.9,
        participants: 1247,
        difficulty: 'Intermediate',
        thumbnail: '📚',
      },
      {
        id: 'trend_002',
        title: 'Business French Essentials',
        author: 'Corporate Learning Hub',
        category: 'Professional',
        rating: 4.8,
        participants: 892,
        difficulty: 'Advanced',
        thumbnail: '💼',
      },
      {
        id: 'trend_003',
        title: 'French Slang You Need to Know',
        author: 'Street Language Pro',
        category: 'Culture',
        rating: 4.7,
        participants: 1534,
        difficulty: 'All Levels',
        thumbnail: '🎭',
      },
      {
        id: 'trend_004',
        title: 'Travel French Survival Guide',
        author: 'Wanderlust Academy',
        category: 'Travel',
        rating: 4.9,
        participants: 2103,
        difficulty: 'Beginner',
        thumbnail: '✈️',
      },
    ];
  };

  const generateJustForYouContent = (profile) => {
    return [
      {
        id: 'jfy_001',
        title: 'Daily Vocabulary Builder',
        description: 'Learn 10 new words tailored to your level',
        type: 'vocab',
        estimatedTime: 10,
        benefit: 'Expands your active vocabulary',
        matchScore: 95,
        icon: 'sparkles',
      },
      {
        id: 'jfy_002',
        title: 'Quick Grammar Refresh',
        description: '5-minute daily grammar maintenance',
        type: 'grammar',
        estimatedTime: 5,
        benefit: 'Prevents skill decay',
        matchScore: 88,
        icon: 'brain',
      },
      {
        id: 'jfy_003',
        title: 'Listening Comprehension Drill',
        description: 'Train your ear with authentic French audio',
        type: 'listening',
        estimatedTime: 12,
        benefit: 'Improves understanding speed',
        matchScore: 82,
        icon: 'ear',
      },
    ];
  };

  const currentXp = getXp();

  const calculateOverallMatchStrength = (recommendations) => {
    const weightByPriority = { high: 3, medium: 2, low: 1 };
    const totalWeight = recommendations.reduce((sum, r) => sum + weightByPriority[r.priority], 0);
    return totalWeight / (recommendations.length || 1);
  };

  const getRecommendationIcon = (iconName) => {
    const icons = {
      target: <Target size={20} className="text-orange-500" />,
      chat: <MessageCircle size={20} className="text-blue-500" />,
      mic: <Mic size={20} className="text-purple-500" />,
      trophy: <Trophy size={20} className="text-yellow-500" />,
      book: <BookOpen size={20} className="text-green-500" />,
      sparkles: <Sparkles size={20} className="text-pink-500" />,
      brain: <Brain size={20} className="text-indigo-500" />,
    };
    return icons[iconName] || <Target size={20} />;
  };

  const RecommendationCard = ({ rec }) => (
    <div className="bg-surface border border-line rounded-xl p-4 hover:border-accent/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-12 h-12 grid place-items-center bg-accent/10 rounded-lg">
          {getRecommendationIcon(rec.icon)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-ink">{rec.title}</h4>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              rec.priority === 'high' ? 'bg-red-500/20 text-red-400' :
              rec.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-green-500/20 text-green-400'
            }`}>
              {rec.priority} priority
            </span>
          </div>
          
          <p className="text-xs text-ink2 mb-2">{rec.description}</p>
          
          <div className="flex items-center justify-between text-xs text-ink3">
            <div className="flex items-center gap-2">
              <Clock size={12} />
              <span>{rec.duration} min</span>
            </div>
            
            <button className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/80 transition-colors">
              Start Now
            </button>
          </div>
          
          <div className="mt-2 pt-2 border-t border-line/50">
            <p className="text-[10px] text-ink4 italic">💡 {rec.reason}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const TrendingCard = ({ content }) => (
    <div className="bg-surface2 border border-line rounded-xl p-3 hover:border-accent/30 transition-colors cursor-pointer">
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg flex items-center justify-center text-3xl">
          {content.thumbnail}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-ink truncate">{content.title}</h4>
          <p className="text-xs text-ink3 mt-0.5">by {content.author}</p>
          
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs bg-surface3 px-2 py-0.5 rounded text-ink3">{content.category}</span>
            <span className="text-xs flex items-center gap-1">
              <Star size={10} className="text-yellow-500" />
              {content.rating}
            </span>
            <span className="text-xs text-ink3">({content.participants})</span>
          </div>
        </div>
      </div>
    </div>
  );

  const JustForYouCard = ({ item }) => (
    <div className="bg-surface border border-line rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 grid place-items-center bg-green-500/10 rounded-lg">
            <Sparkles size={14} className="text-green-500" />
          </div>
          <span className="text-xs font-semibold text-emerald-500">{item.matchScore}% match</span>
        </div>
        <Bookmark size={14} className="text-ink3 hover:text-accent cursor-pointer" />
      </div>
      
      <h4 className="text-sm font-semibold text-ink mb-1">{item.title}</h4>
      <p className="text-xs text-ink2 mb-2">{item.description}</p>
      
      <div className="flex items-center justify-between text-xs text-ink3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {item.estimatedTime} min
          </span>
          <span className="flex items-center gap-1">
            <Zap size={10} />
            {item.benefit}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[65] bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Smart Content Recommendations">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Sparkles size={18} className="text-pink-500" />
          Smart Recommendations
        </h2>
        <button onClick={onClose} aria-label="Close recommendations" className="p-1 hover:bg-surface2 rounded-lg transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 8.586L15.536 3.05a1 1 0 111.414 1.414L11.414 10l5.536 5.536a1 1 0 01-1.414 1.414L10 11.414l-5.536 5.536a1 1 0 01-1.414-1.414L8.586 10 3.05 4.464a1 1 0 011.414-1.414L10 8.586z"/>
          </svg>
        </button>
      </div>

      {/* Match Strength Meter */}
      {userProfile && (
        <div className="px-4 py-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-b border-purple-500/30">
          <div className="max-w-md mx-auto flex items-center justify-between">
            <div className="text-left">
              <p className="text-xs text-ink3">Personalization Match</p>
              <p className="text-lg font-bold text-accent">{matchStrength}% optimized for you</p>
            </div>
            <Sparkles size={32} className="text-pink-500 animate-pulse" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-line bg-surface2">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <button
            onClick={() => setActiveTab('for-you')}
            className={`flex-1 py-2 text-xs font-medium rounded-full transition-colors ${
              activeTab === 'for-you' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface3'
            }`}
          >
            For You ✨
          </button>
          <button
            onClick={() => setActiveTab('trending')}
            className={`flex-1 py-2 text-xs font-medium rounded-full transition-colors ${
              activeTab === 'trending' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface3'
            }`}
          >
            Trending 🔥
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-2 text-xs font-medium rounded-full transition-colors ${
              activeTab === 'all' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface3'
            }`}
          >
            All Content 📚
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto nice-scroll px-4 pb-4">
        <div className="max-w-md mx-auto space-y-4 pt-4">
          
          {/* Personalized Suggestions */}
          {activeTab === 'for-you' && personalizedSuggestions.length > 0 && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">Recommended For You</h3>
                {personalizedSuggestions.map((rec, idx) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </div>

              {/* Just For You Section */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Heart size={16} className="text-pink-500" />
                  <h3 className="text-sm font-semibold text-ink">Curated For Your Level</h3>
                </div>
                
                <div className="space-y-2">
                  {justForYou.map((item, idx) => (
                    <JustForYouCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Trending Content */}
          {activeTab === 'trending' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-ink">What Everyone\'s Learning</h3>
              {trendingNow.map((content, idx) => (
                <TrendingCard key={content.id} content={content} />
              ))}
            </div>
          )}

          {/* All Content */}
          {activeTab === 'all' && (
            <>
              {personalizedSuggestions.map((rec, idx) => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
              
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-ink mb-3">Popular Content</h3>
                {trendingNow.map((content, idx) => (
                  <TrendingCard key={content.id} content={content} />
                ))}
              </div>
            </>
          )}

          {/* Empty State */}
          {personalizedSuggestions.length === 0 && userProfile && (
            <div className="text-center py-12">
              <Sparkles size={48} className="mx-auto text-ink3 mb-4" />
              <h3 className="text-lg font-semibold text-ink mb-2">Ready to Get Started?</h3>
              <p className="text-sm text-ink2 max-w-xs mx-auto">
                Complete a few practice sessions to unlock personalized recommendations
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Stats */}
      {userProfile && (
        <div className="border-t border-line bg-surface px-4 py-3">
          <div className="max-w-md mx-auto grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-bold text-ink">{personalizedSuggestions.length}</p>
              <p className="text-[10px] text-ink3">Recommendations</p>
            </div>
            <div>
              <p className="text-lg font-bold text-ink">{trendingNow.length}</p>
              <p className="text-[10px] text-ink3">Trending</p>
            </div>
            <div>
              <p className="text-lg font-bold text-ink">{justForYou.length}</p>
              <p className="text-[10px] text-ink3">Curated</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Missing icon imports (add to Profile.jsx import)
const MessageCircle = ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const Mic = ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
const BookOpen = ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>;
const Trophy = ({ size, className }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 22V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v15a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3z"/><path d="M14 22V7a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3z"/></svg>;
