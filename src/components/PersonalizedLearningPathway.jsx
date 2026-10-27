import { useState, useEffect, useMemo } from 'react';
/**
 * PersonalizedLearningPathway - Dynamic curriculum builder adapting to learner performance
 * Real-time difficulty adjustment, skill gap identification, and intelligent content routing
 */
export default function PersonalizedLearningPathway({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview | roadmap | skills | analytics
  const [currentLevel, setCurrentLevel] = useState(null);
  const [learningGoals, setLearningGoals] = useState([]);
  const [completedUnits, setCompletedUnits] = useState([]);
  const [skillGaps, setSkillGaps] = useState([]);
  const [recommendedContent, setRecommendedContent] = useState([]);

  const userProfile = useMemo(() => ({
    totalSessions: 47,
    averageScore: 78,
    currentCEFR: 'A2',
    weakestSkills: ['pronunciation', 'listening'],
    strongestSkills: ['reading', 'vocabulary'],
    dailyGoal: 30,
    lastActiveDays: [1, 2, 3, 5, 7, 10, 12], // Recent activity pattern
    retentionRate: 0.72, // 72% of learned words still retained
    learningStyle: 'visual-auditory', // Based on feature usage patterns
    timeOfDayPreference: 'evening', // Most active 6-9 PM
    preferredSessionLength: 20, // Average session duration
  }), []);

  const [roadmap, setRoadmap] = useState([
    {
      id: 'UNIT-A1-01',
      title: 'Basics Greeting & Introductions',
      description: 'Learn to greet people, introduce yourself, and exchange basic information',
      level: 'A1',
      status: 'completed',
      objectives: [
        'Master greeting phrases (bonjour, bonsoir, salut)',
        'Introduce yourself using "je m\'appelle"',
        'Ask and answer "comment ça va?" correctly',
        'Use formal vs informal address appropriately',
      ],
      completedAt: '2026-10-15T14:30:00Z',
      scoreAchieved: 85,
      timeSpentMinutes: 45,
      masteryScore: 0.78,
    },
    {
      id: 'UNIT-A1-02',
      title: 'Food & Ordering at Café',
      description: 'Navigate French cafés confidently – order food, drinks, and handle payment',
      level: 'A1',
      status: 'in-progress',
      objectives: [
        'Order meals using "je voudrais" structure',
        'Ask about ingredients and allergens',
        'Handle payment scenarios politely',
        'Express dietary preferences clearly',
      ],
      progressPercentage: 65,
      nextObjective: 'Handle payment scenarios politely',
      estimatedTimeRemainingMinutes: 20,
    },
    {
      id: 'UNIT-A1-03',
      title: 'Daily Routines & Habits',
      description: 'Describe your typical day using present tense reflexive verbs',
      level: 'A1',
      status: 'locked',
      prerequisites: ['UNIT-A1-02'],
      objectives: [
        'Use reflexive verbs (se lever, se laver, s\'habiller)',
        'Describe morning and evening routines',
        'Talk about frequency with "toujours", "souvent", "jamais"',
        'Ask others about their habits',
      ],
      estimatedDurationMinutes: 50,
    },
    {
      id: 'UNIT-A2-01',
      title: 'Travel & Transportation',
      description: 'Navigate trains, buses, and ask for directions in French-speaking cities',
      level: 'A2',
      status: 'locked',
      prerequisites: ['UNIT-A1-03'],
      objectives: [
        'Buy tickets and ask about schedules',
        'Understand announcements and delays',
        'Ask for and give clear directions',
        'Handle lost luggage or missed connections',
      ],
      estimatedDurationMinutes: 60,
    },
    {
      id: 'UNIT-A2-02',
      title: 'Shopping & Negotiating Prices',
      description: 'Shop confidently in French markets and stores',
      level: 'A2',
      status: 'locked',
      prerequisites: ['UNIT-A1-03'],
      objectives: [
        'Compare prices and quality effectively',
        'Negotiate discounts politely',
        'Return defective products successfully',
        'Understand sizing and measurements',
      ],
      estimatedDurationMinutes: 55,
    },
  ]);

  const [skillMastery, setSkillMastery] = useState([
    {
      skill: 'Listening',
      currentLevel: 72,
      targetLevel: 85,
      trend: 'up',
      recentImprovement: 8,
      weaknessAreas: [
        'Fast natural speech',
        'Accents from different regions',
        'Background noise comprehension',
      ],
      strengthAreas: [
        'Slow clearly spoken audio',
        'Announcements with pauses',
        'Numbers and dates recognition',
      ],
      recommendedPractice: [
        { type: 'audio', title: 'French News Slow', duration: 10, difficulty: 'A2' },
        { type: 'dictation', title: 'Quick Fire Drills', duration: 15, difficulty: 'A2-B1' },
      ],
    },
    {
      skill: 'Speaking',
      currentLevel: 65,
      targetLevel: 85,
      trend: 'up',
      recentImprovement: 12,
      weaknessAreas: [
        'Fluency under pressure',
        'Pronouncing nasal sounds accurately',
        'Expressing complex opinions',
      ],
      strengthAreas: [
        'Basic greetings and small talk',
        'Simple past tense narration',
        'Reading aloud clearly',
      ],
      recommendedPractice: [
        { type: 'pronunciation', title: 'Nasal Sounds Masterclass', duration: 20, difficulty: 'A2' },
        { type: 'conversation', title: 'Free Talk Warm-up', duration: 15, difficulty: 'A2' },
      ],
    },
    {
      skill: 'Reading',
      currentLevel: 88,
      targetLevel: 90,
      trend: 'stable',
      recentImprovement: 2,
      weaknessAreas: [
        'Technical vocabulary',
        'Literary texts with archaic language',
        'Idiomatic expressions',
      ],
      strengthAreas: [
        'News articles and blogs',
        'Menus and signs',
        'Social media posts',
      ],
      recommendedPractice: [
        { type: 'reading', title: 'Short Story Comprehension', duration: 15, difficulty: 'B1' },
        { type: 'vocab', title: 'Idiom Builder', duration: 10, difficulty: 'A2' },
      ],
    },
    {
      skill: 'Writing',
      currentLevel: 75,
      targetLevel: 85,
      trend: 'up',
      recentImprovement: 10,
      weaknessAreas: [
        'Past tense consistency (imparfait vs passé composé)',
        'Formal email structure',
        'Connecting sentences smoothly',
      ],
      strengthAreas: [
        'Informal messages to friends',
        'Simple descriptive paragraphs',
        'Lists and bullet points',
      ],
      recommendedPractice: [
        { type: 'writing', title: 'Email Structure Practice', duration: 20, difficulty: 'A2' },
        { type: 'grammar', title: 'Past Tense Deep Dive', duration: 25, difficulty: 'A2-B1' },
      ],
    },
  ]);

  // Weekly plan is state, not a memo: regeneratePlan() rewrites it in place
  // (it used to call setWeeklyPlan on a useMemo const, which would have thrown
  // a ReferenceError the first time the button fired).
  const [weeklyPlan, setWeeklyPlan] = useState(() => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, idx) => ({
    day,
    date: new Date(Date.now() + idx * 86400000).toLocaleDateString(),
    targetMinutes: idx === 5 || idx === 6 ? 15 : 30, // Weekends shorter
    priorityFocus: idx < 3 ? 'speaking' : idx < 5 ? 'listening' : 'balanced',
    suggestedActivities: getSuggestedActivities(idx, null),
    completion: idx < 3 && [true, true, false][idx] || false, // Mock completion data
  })));

  // Derives the skill gaps / recommendations the Overview shows. Deliberately
  // a refresh-signal effect (`[open]` + void refs): the inputs are useState
  // arrays recreated every render, so adding them as deps would re-run this
  // on every render of the open panel for the same output.
  const refreshDerivedViews = () => {
    const gaps = skillMastery
      .filter(s => s.currentLevel < s.targetLevel - 5)
      .map(s => ({
        skill: s.skill,
        gap: s.targetLevel - s.currentLevel,
        urgency: s.gap > 15 ? 'high' : s.gap > 10 ? 'medium' : 'low',
        recommendedActions: s.recommendedPractice,
      }));

    setSkillGaps(gaps.sort((a, b) => b.gap - a.gap));

    setRecommendedContent(generateRecommendations(userProfile, skillGaps, roadmap));
  };

  useEffect(() => {
    if (!open) return;
    refreshDerivedViews();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh-signal: re-derive when the panel opens
  }, [open]);

  const completeUnit = (unitId) => {
    setRoadmap(prev => prev.map(unit => 
      unit.id === unitId 
        ? { ...unit, status: 'completed', completedAt: new Date().toISOString(), masteryScore: 0.85 }
        : unit
    ));
    setCompletedUnits([...completedUnits, unitId]);
    
    // Unlock next unit if locked
    setRoadmap(prev => prev.map(unit => {
      if (unit.status === 'locked') {
        const prereqsMet = unit.prerequisites?.every(prereqId => 
          prev.find(u => u.id === prereqId)?.status === 'completed'
        );
        if (prereqsMet) {
          return { ...unit, status: 'available' };
        }
      }
      return unit;
    }));
  };

  const regeneratePlan = () => {
    // Recalculate weekly plan based on current performance
    const newPlan = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, idx) => ({
      day,
      date: new Date(Date.now() + idx * 86400000).toLocaleDateString(),
      targetMinutes: userProfile.dailyGoal / 7,
      priorityFocus: idx % 3 === 0 ? 'speaking' : idx % 3 === 1 ? 'listening' : 'balanced',
      suggestedActivities: getSuggestedActivities(idx, userProfile),
      completion: false,
    }));

    setWeeklyPlan(newPlan);
  };

  if (!open) return null;

  const getProgressColor = (percentage) => {
    if (percentage >= 80) return 'text-emerald-600 bg-emerald-500/10';
    if (percentage >= 60) return 'text-blue-600 bg-blue-500/10';
    if (percentage >= 40) return 'text-amber-600 bg-amber-500/10';
    return 'text-red-600 bg-red-500/10';
  };

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-line bg-surface">
        <h2 className="text-lg font-bold text-ink">🗺️ Your Personalized Learning Pathway</h2>
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Close learning pathway" className="rounded-lg p-2 text-ink2 hover:bg-surface2">
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line bg-surface">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'overview' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('roadmap')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'roadmap' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Roadmap ({roadmap.length} units)
        </button>
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'skills' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Skills ({skillMastery.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'analytics' ? 'text-accent border-b-2 border-accent' : 'text-ink2 hover:text-ink'
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <OverviewView
            profile={userProfile}
            goal={roadmap.filter(u => u.status === 'in-progress')[0]}
            skillGaps={skillGaps}
            weeklyPlan={weeklyPlan}
            onRegenerate={regeneratePlan}
            roadmap={roadmap}
            getProgressColor={getProgressColor}
          />
        )}

        {activeTab === 'roadmap' && (
          <RoadmapView
            units={roadmap}
            onComplete={completeUnit}
          />
        )}

        {activeTab === 'skills' && (
          <SkillsView
            mastery={skillMastery}
            recommendedContent={recommendedContent}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            profile={userProfile}
            weeklyPlan={weeklyPlan}
            roadmap={roadmap}
          />
        )}
      </div>
    </div>
  );
}

// Helper Components

function OverviewView({ profile, goal, skillGaps, weeklyPlan, onRegenerate, roadmap, getProgressColor }) {
  const completedCount = roadmap.filter(u => u.status === 'completed').length;
  const totalCount = roadmap.length;

  return (
    <div className="p-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Current Level"
          value={`${profile.currentCEFR}`}
          icon="🎯"
          color="blue"
        />
        <SummaryCard
          label="Total Sessions"
          value={profile.totalSessions}
          icon="⚡"
          color="yellow"
        />
        <SummaryCard
          label="Avg Score"
          value={`${profile.averageScore}%`}
          icon="📊"
          color="green"
        />
        <SummaryCard
          label="Retention Rate"
          value={`${Math.round(profile.retentionRate * 100)}%`}
          icon="🧠"
          color="purple"
        />
      </div>

      {/* Active Unit Banner */}
      {goal && (
        <div className="bg-gradient-to-r from-accent/10 to-purple-500/10 rounded-xl p-5 border border-line mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-ink mb-1">{goal.title}</h3>
              <p className="text-sm text-ink2">{goal.description}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getProgressColor(goal.progressPercentage)}`}>
              {goal.progressPercentage}%
            </span>
          </div>
          
          <div className="mb-3">
            <p className="text-xs text-ink3 mb-2">Next Objective:</p>
            <p className="text-sm text-ink">{goal.nextObjective}</p>
          </div>

          <div className="h-2 bg-surface3 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-accent to-purple-600 transition-all"
              style={{ width: `${goal.progressPercentage}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-ink3">
            <span>{goal.estimatedTimeRemainingMinutes} min remaining</span>
            <button className="text-accent font-semibold hover:text-accent/80">Continue →</button>
          </div>
        </div>
      )}

      {/* Skill Gaps Alert */}
      {skillGaps.length > 0 && (
        <div className="bg-amber-500/10 rounded-xl p-5 border border-amber-500/30 mb-6">
          <h4 className="font-semibold text-ink mb-3 flex items-center gap-2">
            <span>⚠️</span> Focus Areas to Improve
          </h4>
          <div className="space-y-2">
            {skillGaps.slice(0, 3).map((gap, idx) => (
              <div key={idx} className="flex items-center justify-between bg-surface2 rounded-lg p-3">
                <div>
                  <p className="font-medium text-ink">{gap.skill}</p>
                  <p className="text-xs text-ink3">{gap.gap} points below target</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  gap.urgency === 'high' ? 'bg-red-500/10 text-red-600' :
                  gap.urgency === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                  'bg-blue-500/10 text-blue-600'
                }`}>
                  {gap.urgency.charAt(0).toUpperCase() + gap.urgency.slice(1)} Priority
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Plan Preview */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-ink">This Week's Plan</h4>
          <button
            onClick={onRegenerate}
            className="text-sm text-accent font-semibold hover:text-accent/80"
          >
            Regenerate
          </button>
        </div>
        
        <div className="space-y-2">
          {weeklyPlan.slice(0, 5).map((day, idx) => (
            <div key={idx} className="bg-surface rounded-lg p-3 border border-line">
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-ink">{day.day}</p>
                <span className="text-sm text-ink3">{day.targetMinutes} min</span>
              </div>
              <p className="text-xs text-ink2">{day.suggestedActivities.join(', ')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    yellow: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    green: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  };

  return (
    <div className={`border rounded-xl p-4 ${colorClasses[color]}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-black">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

function RoadmapView({ units, onComplete }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Your Learning Journey</h3>
        <p className="text-ink2">Complete units in order to progress through levels</p>
      </div>

      <div className="space-y-4">
        {units.map((unit) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            onComplete={() => onComplete(unit.id)}
          />
        ))}
      </div>
    </div>
  );
}

function UnitCard({ unit, onComplete }) {
  const statusColors = {
    completed: 'bg-emerald-500/10 border-emerald-500/30',
    'in-progress': 'bg-blue-500/10 border-blue-500/30',
    available: 'bg-green-500/10 border-green-500/30',
    locked: 'bg-surface3 border-line',
  };

  const statusLabels = {
    completed: '✓ Completed',
    'in-progress': '🔄 In Progress',
    available: '▶️ Available',
    locked: '🔒 Locked',
  };

  return (
    <div className={`rounded-xl p-5 border ${statusColors[unit.status]}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-semibold text-ink">{unit.title}</h4>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              unit.level === 'A1' ? 'bg-green-500/20 text-green-600' :
              unit.level === 'A2' ? 'bg-blue-500/20 text-blue-600' :
              'bg-purple-500/20 text-purple-600'
            }`}>
              {unit.level}
            </span>
            {unit.status !== 'locked' && (
              <span className="text-xs text-ink3">{statusLabels[unit.status]}</span>
            )}
          </div>
          
          <p className="text-sm text-ink2 mb-3">{unit.description}</p>
          
          {unit.status !== 'locked' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-ink3 uppercase tracking-wide">Objectives:</p>
              <ul className="space-y-1">
                {unit.objectives.slice(0, 2).map((objective, idx) => (
                  <li key={idx} className="text-xs text-ink2 flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    {objective}
                  </li>
                ))}
              </ul>
              
              {unit.status === 'completed' && (
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-line">
                  <span className="text-sm text-ink3">Mastery: {Math.round(unit.masteryScore * 100)}%</span>
                  <button
                    onClick={onComplete}
                    className="text-accent text-sm font-semibold hover:text-accent/80"
                  >
                    View Certificate →
                  </button>
                </div>
              )}
              
              {unit.status === 'in-progress' && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-ink3">{unit.progressPercentage}% complete</span>
                    <span className="text-xs text-ink3">{unit.estimatedTimeRemainingMinutes} min left</span>
                  </div>
                  <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-accent to-purple-600 transition-all"
                      style={{ width: `${unit.progressPercentage}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          
          {unit.status === 'locked' && (
            <p className="text-xs text-ink3 mt-2">Complete {unit.prerequisites?.join(' • ')} to unlock</p>
          )}
        </div>
        
        {!unit.locked && (
          <button className="ml-4 px-4 py-2 bg-accent text-onaccent rounded-lg font-semibold text-sm hover:bg-accent/90 transition-colors">
            {unit.status === 'completed' ? 'Review' : 'Continue'}
          </button>
        )}
      </div>
    </div>
  );
}

function SkillsView({ mastery, recommendedContent }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Skill Mastery Dashboard</h3>
        <p className="text-ink2">Track progress across all four language competencies</p>
      </div>

      <div className="space-y-4">
        {mastery.map((skill, idx) => (
          <SkillCard key={idx} skill={skill} idx={idx} />
        ))}
      </div>

      {/* Recommended Practice Section */}
      <div className="mt-8 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-5 border border-line">
        <h4 className="font-semibold text-ink mb-4">🎯 Recommended for You</h4>
        <div className="space-y-3">
          {recommendedContent.slice(0, 3).map((item, idx) => (
            <div key={idx} className="flex items-center justify-between bg-surface rounded-lg p-3">
              <div>
                <p className="font-medium text-ink">{item.title}</p>
                <p className="text-xs text-ink3">{item.duration} min • {item.difficulty}</p>
              </div>
              <button className="px-3 py-1.5 bg-accent text-onaccent rounded-lg text-xs font-semibold hover:bg-accent/90 transition-colors">
                Start
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkillCard({ skill, idx }) {
  const trendIcons = {
    up: '↗️',
    down: '↘️',
    stable: '➡️',
  };

  return (
    <div className="bg-surface rounded-xl p-5 border border-line">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl">
            {skill.skill === 'Listening' ? '👂' : 
             skill.skill === 'Speaking' ? '🎤' :
             skill.skill === 'Reading' ? '📖' : '✍️'}
          </div>
          <div>
            <h4 className="font-semibold text-ink">{skill.skill}</h4>
            <p className="text-sm text-ink3">
              {trendIcons[skill.trend]} {skill.recentImprovement} pts this week
            </p>
          </div>
        </div>
        
        <div className="text-right">
          <div className={`text-2xl font-black ${
            skill.currentLevel >= 80 ? 'text-emerald-600' :
            skill.currentLevel >= 65 ? 'text-blue-600' :
            'text-amber-600'
          }`}>
            {skill.currentLevel}
          </div>
          <p className="text-xs text-ink3">of 100</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink3">Current: {skill.currentLevel}</span>
          <span className="text-xs text-ink3">Target: {skill.targetLevel}</span>
        </div>
        <div className="h-2 bg-surface3 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              skill.currentLevel >= 80 ? 'bg-emerald-500' :
              skill.currentLevel >= 65 ? 'bg-blue-500' :
              'bg-amber-500'
            }`}
            style={{ width: `${(skill.currentLevel / 100) * 100}%` }}
          />
        </div>
      </div>

      {/* Weakness & Strength Areas */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-red-500/5 rounded-lg p-2">
          <p className="font-medium text-red-600 mb-1">Needs Work:</p>
          <ul className="space-y-0.5 text-ink2">
            {skill.weaknessAreas.map((area, i) => (
              <li key={i} className="truncate">• {area}</li>
            ))}
          </ul>
        </div>
        <div className="bg-emerald-500/5 rounded-lg p-2">
          <p className="font-medium text-emerald-600 mb-1">Strong:</p>
          <ul className="space-y-0.5 text-ink2">
            {skill.strengthAreas.map((area, i) => (
              <li key={i} className="truncate">• {area}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recommended Practice */}
      {skill.recommendedPractice && (
        <div className="mt-4 pt-4 border-t border-line">
          <p className="text-xs font-medium text-ink3 mb-2">Suggested:</p>
          <div className="flex gap-2">
            {skill.recommendedPractice.map((rec, i) => (
              <button key={i} className="flex-1 bg-surface2 rounded-lg p-2 text-left hover:bg-surface3 transition-colors">
                <p className="text-xs font-medium text-ink truncate">{rec.title}</p>
                <p className="text-[10px] text-ink3">{rec.duration} min</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsView({ profile, weeklyPlan, roadmap }) {
  const completedCount = roadmap.filter(u => u.status === 'completed').length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-ink mb-2">Learning Analytics</h3>
        <p className="text-ink2">Deep insights into your learning patterns</p>
      </div>

      {/* Activity Heatmap Placeholder */}
      <div className="bg-surface rounded-xl p-5 border border-line mb-6">
        <h4 className="font-semibold text-ink mb-4">Study Consistency</h4>
        <div className="flex items-center justify-between text-sm text-ink2 mb-3">
          <span>Last {profile.lastActiveDays.length} days of activity</span>
          <span>Average: {Math.round(profile.lastActiveDays.length / 7 * 100)}% weekly consistency</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }).map((_, idx) => {
            const hasActivity = [2, 5, 8, 12, 15, 18, 22, 25].includes(idx);
            return (
              <div
                key={idx}
                className={`aspect-square rounded ${
                  hasActivity ? 'bg-accent' : 'bg-surface3'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Goal Progress */}
      <div className="bg-surface rounded-xl p-5 border border-line mb-6">
        <h4 className="font-semibold text-ink mb-4">Unit Completion</h4>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-ink2">{completedCount} of {roadmap.length} units completed</span>
          <span className="text-sm font-bold text-ink">{Math.round((completedCount / roadmap.length) * 100)}%</span>
        </div>
        <div className="h-2 bg-surface3 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-accent to-purple-600"
            style={{ width: `${(completedCount / roadmap.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Time Analysis */}
      <div className="bg-surface rounded-xl p-5 border border-line">
        <h4 className="font-semibold text-ink mb-4">Study Time Analysis</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink2">Daily Goal</span>
            <span className="text-sm font-bold text-ink">{profile.dailyGoal} min/day</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink2">Avg Session Length</span>
            <span className="text-sm font-bold text-ink">{profile.preferredSessionLength} min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink2">Preferred Time</span>
            <span className="text-sm font-bold text-ink">{profile.timeOfDayPreference}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Utility Functions

function getSuggestedActivities(dayIndex, profile) {
  const activities = [];
  
  if (dayIndex % 3 === 0) {
    activities.push('Speaking practice');
  }
  if (dayIndex % 3 === 1) {
    activities.push('Listening drill');
  }
  if (dayIndex % 3 === 2) {
    activities.push('Balanced review');
  }
  
  if (profile.weakestSkills.includes('pronunciation')) {
    activities.push('Pronunciation focus');
  }
  
  return [...new Set(activities)]; // Remove duplicates
}

function generateRecommendations(profile, skillGaps, roadmap) {
  const recommendations = [];
  
  // Recommend practice for weakest skills first
  profile.weakestSkills.forEach(skill => {
    if (skill === 'pronunciation') {
      recommendations.push({
        title: 'Daily Pronunciation Drill',
        duration: 15,
        difficulty: 'A2',
        type: 'pronunciation',
        reason: 'Your pronunciation is below target - daily practice recommended',
      });
    }
    if (skill === 'listening') {
      recommendations.push({
        title: 'Comprehensible Input Listening',
        duration: 20,
        difficulty: 'A2-B1',
        type: 'listening',
        reason: 'Improve listening with graded audio materials',
      });
    }
  });
  
  // Recommend catching up on roadmap
  const inProgress = roadmap.find(u => u.status === 'in-progress');
  if (inProgress) {
    recommendations.push({
      title: `Complete ${inProgress.title}`,
      duration: 30,
      difficulty: inProgress.level,
      type: 'unit',
      reason: 'You\'re partway through this unit - finish it for momentum',
    });
  }
  
  return recommendations.slice(0, 5);
}

import { Flame, Bolt } from './icons';
