// Learning Analytics Dashboard - Deep insights into performance patterns
import { useState } from 'react';
import { TrendingUp, Target, Clock, Brain, BarChart3, Activity } from './icons';

export default function LearningAnalytics({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview | skills | time | retention
  
  if (!open) return null;
  
  const mockData = {
    skillProgress: [
      { skill: 'Listening', current: 78, target: 90, trend: 'up' },
      { skill: 'Speaking', current: 65, target: 85, trend: 'up' },
      { skill: 'Reading', current: 82, target: 90, trend: 'stable' },
      { skill: 'Writing', current: 71, target: 85, trend: 'up' },
    ],
    weeklyActivity: [
      { day: 'Mon', minutes: 25, xp: 450 },
      { day: 'Tue', minutes: 32, xp: 520 },
      { day: 'Wed', minutes: 18, xp: 310 },
      { day: 'Thu', minutes: 40, xp: 680 },
      { day: 'Fri', minutes: 28, xp: 490 },
      { day: 'Sat', minutes: 45, xp: 750 },
      { day: 'Sun', minutes: 22, xp: 380 },
    ],
    retentionRates: [
      { week: 1, rate: 95 },
      { week: 2, rate: 89 },
      { week: 3, rate: 84 },
      { week: 4, rate: 81 },
    ],
  };
  
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Learning Analytics">
      <div className="mx-auto min-h-full max-w-5xl px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Learning Analytics</h2>
              <p className="text-xs text-ink2">Deep insights into your progress</p>
            </div>
          </div>
          
          <button onClick={onClose} aria-label="Close analytics" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 p-1 bg-surface border border-line rounded-xl">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={TrendingUp} label="Overview" />
          <TabButton active={activeTab === 'skills'} onClick={() => setActiveTab('skills')} icon={Target} label="Skills" />
          <TabButton active={activeTab === 'time'} onClick={() => setActiveTab('time')} icon={Clock} label="Time Analysis" />
          <TabButton active={activeTab === 'retention'} onClick={() => setActiveTab('retention')} icon={Brain} label="Retention" />
        </div>
        
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4 fade-in">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard 
                title="Weekly XP" 
                value="3,580" 
                change="+12%"
                trend="up"
                icon={Zap}
              />
              <MetricCard 
                title="Avg Accuracy" 
                value="87%" 
                change="+3%"
                trend="up"
                icon={Target}
              />
              <MetricCard 
                title="Streak" 
                value="12 days" 
                change="Active"
                trend="stable"
                icon={Flame}
              />
              <MetricCard 
                title="Words Learned" 
                value="523" 
                change="+47 this week"
                trend="up"
                icon={Book}
              />
            </div>
            
            {/* Main Chart - Weekly Activity */}
            <div className="rounded-xl bg-surface2 border border-line p-6">
              <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
                <Activity size={18} />
                Weekly Activity Pattern
              </h3>
              <div className="space-y-3">
                {mockData.weeklyActivity.map((day, i) => (
                  <ActivityRow key={i} day={day.day} minutes={day.minutes} xp={day.xp} maxMinutes={Math.max(...mockData.weeklyActivity.map(d => d.minutes))} />
                ))}
              </div>
            </div>
            
            {/* Insights Section */}
            <InsightsPanel />
          </div>
        )}
        
        {/* Skills Tab */}
        {activeTab === 'skills' && (
          <div className="space-y-4 fade-in">
            <h3 className="text-sm font-bold text-ink2 uppercase tracking-wide">CEFR Skill Proficiency</h3>
            {mockData.skillProgress.map((skill, i) => (
              <SkillProgressCard key={i} skill={skill} />
            ))}
          </div>
        )}
        
        {/* Time Analysis Tab */}
        {activeTab === 'time' && (
          <div className="space-y-4 fade-in">
            <TimeAnalysisCards />
          </div>
        )}
        
        {/* Retention Tab */}
        {activeTab === 'retention' && (
          <div className="space-y-4 fade-in">
            <RetentionChart data={mockData.retentionRates} />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active ? 'bg-accent text-onaccent' : 'text-ink3 hover:bg-surface2'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <Icon size={14} />
        {label}
      </div>
    </button>
  );
}

function MetricCard({ title, value, change, trend, icon: Icon }) {
  return (
    <div className="rounded-xl bg-surface2 border border-line p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-500 grid place-items-center">
          <Icon size={20} className="text-white" />
        </div>
        <span className={`text-xs font-semibold ${trend === 'up' ? 'text-green-600' : 'text-blue-600'}`}>
          {change}
        </span>
      </div>
      <p className="text-2xl font-black text-ink">{value}</p>
      <p className="text-xs text-ink2 mt-1">{title}</p>
    </div>
  );
}

function ActivityRow({ day, minutes, xp, maxMinutes }) {
  const percentage = (minutes / maxMinutes) * 100;
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{day}</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink3">{minutes} min</span>
          <span className="text-xs font-semibold text-purple-600">{xp} XP</span>
        </div>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function SkillProgressCard({ skill }) {
  const percentage = Math.round((skill.current / skill.target) * 100);
  
  return (
    <div className="rounded-xl bg-surface2 border border-line p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-ink">{skill.skill}</h4>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
          skill.trend === 'up' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {skill.trend === 'up' ? '↑ Improving' : '→ Stable'}
        </span>
      </div>
      
      <div className="flex items-end gap-3 mb-2">
        <span className="text-3xl font-black text-ink">{skill.current}%</span>
        <span className="text-sm text-ink2 mb-1">/ {skill.target}% target</span>
      </div>
      
      <div className="h-3 bg-surface rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            percentage >= 80 ? 'bg-green-500' :
            percentage >= 60 ? 'bg-yellow-500' :
            'bg-blue-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <p className="text-xs text-ink3 mt-2">
        {skill.current < skill.target 
          ? `${skill.target - skill.current}% away from target` 
          : '🎯 Target reached! Maintaining...'}
      </p>
    </div>
  );
}

function InsightsPanel() {
  const insights = [
    {
      type: 'strength',
      title: 'Strongest Area',
      description: 'Your reading comprehension is exceptional!',
      metric: '92% average accuracy',
      icon: Star,
      color: 'from-green-400 to-emerald-500',
    },
    {
      type: 'improvement',
      title: 'Focus Opportunity',
      description: 'Speaking practice could boost your confidence',
      metric: 'Only 65% accuracy',
      icon: Alert,
      color: 'from-yellow-400 to-orange-500',
    },
    {
      type: 'pattern',
      title: 'Best Practice Time',
      description: 'You perform best during evening sessions',
      metric: '85% avg after 6 PM',
      icon: Clock,
      color: 'from-blue-400 to-indigo-500',
    },
  ];
  
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-ink2 uppercase tracking-wide mb-3">AI-Powered Insights</h3>
      {insights.map((insight, i) => (
        <InsightCard key={i} {...insight} />
      ))}
    </div>
  );
}

function InsightCard({ type, title, description, metric, icon: Icon, color }) {
  return (
    <div className={`rounded-xl bg-gradient-to-r ${color} p-4 text-white`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-white/20 grid place-items-center shrink-0">
          <Icon size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-bold mb-1">{title}</h4>
          <p className="text-sm opacity-90 mb-2">{description}</p>
          <p className="text-sm font-semibold opacity-75">{metric}</p>
        </div>
      </div>
    </div>
  );
}

function TimeAnalysisCards() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <TimeCard 
        title="Total Study Time"
        value="89 hours"
        subtitle="Across 12 weeks"
        icon={Clock}
        trend="+15% vs last week"
      />
      <TimeCard 
        title="Average Session"
        value="28 minutes"
        subtitle="Optimal duration"
        icon={Target}
        trend="+4 min improvement"
      />
      <TimeCard 
        title="Peak Hours"
        value="7-9 PM"
        subtitle="Most productive"
        icon={Sunset}
        trend="Maintained consistency"
      />
      <TimeCard 
        title="Practice Frequency"
        value="6 days/week"
        subtitle="Excellent rhythm"
        icon={Calendar}
        trend="On track!"
      />
    </div>
  );
}

function TimeCard({ title, value, subtitle, icon: Icon, trend }) {
  return (
    <div className="rounded-xl bg-surface2 border border-line p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-pink-500 grid place-items-center">
          <Icon size={20} className="text-white" />
        </div>
        <span className="text-xs font-semibold text-green-600">{trend}</span>
      </div>
      <p className="text-2xl font-black text-ink">{value}</p>
      <p className="text-sm text-ink2">{title}</p>
      <p className="text-xs text-ink3 mt-1">{subtitle}</p>
    </div>
  );
}

function RetentionChart({ data }) {
  return (
    <div className="rounded-xl bg-surface2 border border-line p-6">
      <h3 className="font-bold text-ink mb-4 flex items-center gap-2">
        <Brain size={18} />
        Word Retention Rate Over Time
      </h3>
      
      <div className="space-y-4">
        {data.map((item, i) => (
          <RetentionPolicy key={i} item={item} index={i} total={data.length} />
        ))}
      </div>
      
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm font-medium text-blue-800">💡 Pro Tip</p>
        <p className="text-xs text-blue-600 mt-1">
          Your retention is above average! Consider increasing review frequency for words at 75-85% retention.
        </p>
      </div>
    </div>
  );
}

function RetentionPolicy({ item, index, total }) {
  const percentage = ((index + 1) / total) * 100;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Week {item.week}</span>
        <span className="text-lg font-bold text-ink">{item.rate}%</span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${
            item.rate >= 90 ? 'bg-green-500' :
            item.rate >= 80 ? 'bg-yellow-500' :
            'bg-red-500'
          }`}
          style={{ width: `${item.rate}%` }}
        />
      </div>
    </div>
  );
}

// Icons
const Zap = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const Flame = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.5 14.5a2.5 2.5 0 005 0c0-1.5-.5-2.5-1.5-3 .5-1 1-2 1-3.5a4 4 0 10-8 0c0 1.5.5 2.5 1.5 3-1 1-1.5 1.5-1.5 3a2.5 2.5 0 003.5 2.5z" />
  </svg>
);

const Book = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);

const Star = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const Alert = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const Sunset = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 18A5 5 0 006 18" />
    <path d="M12 18V6" />
    <path d="M4.929 16.929l4.243-4.242" />
    <path d="M18.828 16.929l-4.242-4.242" />
  </svg>
);

const Calendar = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
