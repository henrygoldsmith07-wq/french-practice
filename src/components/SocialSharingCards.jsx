import { useState } from 'react';
import { Share2, Download, CheckCircle, Target, Clock, TrendingUp } from './icons';

/**
 * SocialSharingCards - Opt-in progress exports for student motivation
 * Creates visually appealing shareable cards without exposing personal data
 */
export default function SocialSharingCards({ open, onClose }) {
  const [showCreator, setShowCreator] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState(['sessions', 'accuracy', 'weaknesses']);
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Share progress">
      <div className="mx-auto min-h-full max-w-4xl px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <h2 className="flex-1 text-lg font-bold text-ink">Share Progress</h2>
          <button onClick={onClose} aria-label="Close share panel" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Left Panel - Card Creator */}
        {!showCreator ? (
          <div className="w-1/2 border-r border-line bg-surface p-6">
            <h2 className="text-xl font-bold text-ink mb-2">Share Your Progress</h2>
            <p className="text-sm text-ink2 mb-6">
              Create beautiful, motivating progress cards to celebrate your achievements! 
              No personal data included - just your learning stats.
            </p>

            {/* Privacy Badge */}
            <div className="mb-6 rounded-2xl border border-accent/20 bg-accent/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle size={20} className="text-onaccent mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-onaccent">Privacy First</h4>
                  <p className="mt-1 text-xs text-onaccent/80">
                    Your name and personal details are never included in shared cards. 
                    Only anonymized learning metrics.
                  </p>
                </div>
              </div>
            </div>

            {/* Metrics Selection */}
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-3">Choose What to Share</h3>
            <div className="space-y-2 mb-6">
              <MetricToggle 
                label="Sessions Completed"
                description="Total practice sessions"
                icon={Clock}
                metric="sessions"
                selected={selectedMetrics}
                onToggle={setSelectedMetrics}
              />
              <MetricToggle 
                label="Accuracy Rate"
                description="Average correctness %"
                icon={Target}
                metric="accuracy"
                selected={selectedMetrics}
                onToggle={setSelectedMetrics}
              />
              <MetricToggle 
                label="Weaknesses Fixed"
                description="Mistakes improved"
                icon={TrendingUp}
                metric="weaknesses"
                selected={selectedMetrics}
                onToggle={setSelectedMetrics}
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setShowCreator(true)}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-onaccent hover:bg-accent/90"
              >
                <Share2 size={16} className="inline mr-2" />
                Create Progress Card
              </button>
              
              <button className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink hover:bg-surface2">
                View Past Cards
              </button>
            </div>
          </div>
        ) : (
          <CardCreator 
            metrics={selectedMetrics}
            onClose={() => setShowCreator(false)}
            onBack={() => setShowCreator(false)}
          />
        )}

        {/* Right Panel - Gallery & Examples */}
        <div className="w-1/2 bg-surface p-6 overflow-y-auto">
          <h2 className="text-xl font-bold text-ink mb-4">Recent Cards</h2>
          
          {/* Example Cards */}
          <div className="space-y-4">
            <ExampleCard
              title="Week 1 Milestone 🎉"
              subtitle="10 sessions completed!"
              stat={{ label: "Sessions", value: "10" }}
              highlight="Perfect consistency!"
              gradient="from-blue-500 to-purple-500"
            />
            
            <ExampleCard
              title="Accuracy Breakthrough ⭐"
              subtitle="Crossed 75% threshold"
              stat={{ label: "Accuracy", value: "78%" }}
              highlight="Up from 62% last month!"
              gradient="from-green-500 to-emerald-500"
            />
            
            <ExampleCard
              title="Fixed 15 Weaknesses 💪"
              subtitle="Keep building momentum"
              stat={{ label: "Fixed", value: "15" }}
              highlight="Grammar mastered!"
              gradient="from-amber-500 to-orange-500"
            />
          </div>

          {/* Share Options */}
          <div className="mt-8 pt-6 border-t border-line">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-3">Share Platforms</h3>
            <div className="grid grid-cols-3 gap-3">
              {['Instagram', 'Twitter', 'Email'].map(platform => (
                <button
                  key={platform}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:border-primary hover:text-primary transition-colors"
                >
                  {platform}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink2 text-center">
              Cards generate PNG images compatible with all platforms
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Metric selection toggle
 */
function MetricToggle({ label, description, icon: Icon, metric, selected, onToggle }) {
  const isSelected = selected.includes(metric);
  
  return (
    <label className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
      isSelected 
        ? 'border-accent text-onaccent bg-accent' 
        : 'border-line bg-surface2 hover:bg-surface'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${isSelected ? 'bg-primary text-white' : 'bg-surface text-ink3'}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-ink3">{description}</p>
        </div>
      </div>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(
          isSelected 
            ? selected.filter(m => m !== metric)
            : [...selected, metric]
        )}
        className="h-5 w-5 rounded border-line text-primary focus:ring-primary"
      />
    </label>
  );
}

/**
 * Card creation interface
 */
function CardCreator({ metrics, onClose, onBack }) {
  const [generating, setGenerating] = useState(false);
  const [cardData, setCardData] = useState(generateMockCardData());
  const themeColors = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    green: 'from-green-500 to-green-600',
    amber: 'from-amber-500 to-amber-600',
  };

  // Mock user stats
  const userStats = {
    sessionsCompleted: 47,
    avgAccuracy: 72,
    weaknessesFixed: 23,
    currentStreak: 5,
    longestStreak: 12,
    timeSpent: '19 hours',
    levelReached: 'B1',
  };

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      alert('Card generated! Would save to library and allow download/share.');
    }, 1000);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <header className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Create Progress Card</h2>
        <button
          onClick={onBack}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <main className="flex-1 flex flex-col md:flex-row">
        {/* Card Preview */}
        <div className="flex-1 p-6 flex items-center justify-center bg-gradient-to-br from-surface via-white to-surface">
          <div className="w-full max-w-md rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-8 text-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold">Le Studio</h3>
                <p className="text-sm opacity-90">Language Learning Journey</p>
              </div>
              <div className="rounded-full bg-white/20 p-3">
                <AwardIcon />
              </div>
            </div>

            {/* Main Stats */}
            <div className="space-y-4">
              {metrics.includes('sessions') && (
                <StatRow 
                  label="Sessions Completed" 
                  value={`${userStats.sessionsCompleted}`}
                  icon={Clock}
                />
              )}
              {metrics.includes('accuracy') && (
                <StatRow 
                  label="Accuracy Rate" 
                  value={`${userStats.avgAccuracy}%`}
                  icon={Target}
                  highlight
                />
              )}
              {metrics.includes('weaknesses') && (
                <StatRow 
                  label="Weaknesses Fixed" 
                  value={`${userStats.weaknessesFixed}`}
                  icon={TrendingUp}
                />
              )}
            </div>

            {/* Achievement Badge */}
            <div className="mt-6 rounded-2xl bg-white/20 p-4 text-center">
              <p className="text-xs uppercase tracking-wider opacity-90">Current Level</p>
              <p className="text-2xl font-bold">{userStats.levelReached}</p>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-6 border-t border-white/20 text-center text-sm opacity-90">
              Keep up the great work! 🇫🇷
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="w-full md:w-80 border-l border-line bg-surface p-6 flex flex-col">
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-4">Customization</h3>
          
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Theme Color</label>
              <div className="flex gap-2">
                {['primary', 'success', 'purple', 'amber'].map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full ${
                      color === 'primary' ? 'bg-primary' :
                      color === 'success' ? 'bg-success' :
                      color === 'purple' ? 'bg-purple-500' :
                      'bg-amber-500'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-2">Include Motivational Quote</label>
              <select className="w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink">
                <option>"Practice makes progress!"</option>
                <option>"Every mistake is a lesson."</option>
                <option>"Consistency is key."</option>
                <option>"Fluency takes time."</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-auto rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Download Card'}
          </button>
        </div>
      </main>
    </div>
  );
}

function StatRow({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`flex items-center justify-between rounded-2xl p-4 ${highlight ? 'bg-white/20' : ''}`}>
      <div className="flex items-center gap-3">
        <Icon size={20} />
        <span className="opacity-90">{label}</span>
      </div>
      <span className="text-3xl font-bold">{value}</span>
    </div>
  );
}

function ExampleCard({ title, subtitle, stat, highlight, gradient }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-white shadow-lg">
      <h4 className="font-bold text-lg">{title}</h4>
      <p className="text-sm opacity-90 mb-4">{subtitle}</p>
      
      <div className="flex items-center gap-3 mb-3">
        <div className="text-2xl font-bold">{stat.value}</div>
        <div className="text-sm opacity-90">{stat.label}</div>
      </div>
      
      <p className="text-xs opacity-80">{highlight}</p>
    </div>
  );
}

function AwardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="6" />
      <path d="M15 13c2.5 0.5 4.5 2.5 4.5 5.5V20H5.5v-1.5c0-3 2-5 4.5-5.5" />
    </svg>
  );
}

// Import X icon
import { X } from './icons';

function generateMockCardData() {
  return {
    sessions: 47,
    accuracy: 72,
    weaknesses: 23,
  };
}
