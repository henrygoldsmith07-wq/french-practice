// AI Study Assistant - recommendations built from the learner's own record.
//
// The panel used to be handed a fixed object by App.jsx — 450 XP, a 12-day
// streak, three "weak" words and a table of practice hours — so every learner
// on every device was shown the same personalised advice, and the action
// buttons only wrote a line to the console. The state now comes from
// src/lib/studyAssistantState.js, which reads what the learner has actually
// done, and the actions open the part of the app they talk about.
import { useEffect, useMemo, useState } from 'react';
import { Brain, TrendingUp, Target, Zap, Clock, CheckCircle } from './icons';
import { generateAIRecommendations, generateWeeklyPlan } from '../lib/aiStudyAssistant.js';
import { buildStudyState } from '../lib/studyAssistantState.js';

export default function AIStudyAssistant({ open, onClose, onGo }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview | plan | insights
  const [state, setState] = useState(null);

  // Read the learner's record when the panel opens, not when the app did:
  // the advice has to be about now.
  useEffect(() => {
    if (!open) return;
    setState(buildStudyState());
  }, [open]);

  const recommendations = useMemo(
    () => (state ? generateAIRecommendations(state) : []),
    [state],
  );
  const weeklyPlan = useMemo(
    () => (state ? generateWeeklyPlan(state) : []),
    [state],
  );

  if (!open) return null;

  const handleAction = (recommendation) => {
    // The action buttons used to `console.log('Completed:', action)`. If the
    // recommendation points at a place in the app, go there.
    if (recommendation.target && onGo) onGo(recommendation.target);
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="AI Study Assistant">
      <div className="mx-auto min-h-full max-w-3xl px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center">
            <Brain size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">AI Study Assistant</h2>
            <p className="text-xs text-ink2">
              {state && state.hasEvidence
                ? 'Worked out on this device from your own practice — no account, no server'
                : 'Nothing to read yet — this fills in as you practise'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close AI assistant" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 p-1 bg-surface border border-line rounded-xl">
          <TabButton
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            icon={Zap}
            label="Smart Recommendations"
          />
          <TabButton
            active={activeTab === 'plan'}
            onClick={() => setActiveTab('plan')}
            icon={Clock}
            label="Weekly Plan"
          />
          <TabButton
            active={activeTab === 'insights'}
            onClick={() => setActiveTab('insights')}
            icon={TrendingUp}
            label="Learning Insights"
          />
        </div>

        {/* Overview Tab - Smart Recommendations */}
        {activeTab === 'overview' && (
          <div className="space-y-4 fade-in">
            {/* Urgent Priority Card */}
            {recommendations.filter(r => r.priority === 'urgent').map((rec, i) => (
              <PriorityCard key={i} recommendation={rec} onAction={handleAction} urgent />
            ))}

            {/* High Priority Recommendations */}
            {recommendations.filter(r => r.priority === 'high').map((rec, i) => (
              <PriorityCard key={i} recommendation={rec} onAction={handleAction} />
            ))}

            {/* Medium Priority */}
            {recommendations.filter(r => r.priority === 'medium').map((rec, i) => (
              <PriorityCard key={i} recommendation={rec} onAction={handleAction} compact />
            ))}

            {!recommendations.length && (
              <EmptyState
                message={state && state.hasEvidence
                  ? 'Nothing needs your attention right now.'
                  : 'No practice on record yet, so there is nothing to advise on. The advice here is built from what you actually do, so it appears once you have practised.'}
              />
            )}
          </div>
        )}

        {/* Weekly Plan Tab */}
        {activeTab === 'plan' && weeklyPlan.length > 0 && (
          <div className="space-y-3 fade-in">
            <h3 className="text-sm font-bold text-ink2 uppercase tracking-wide mb-3">Your Personalized Study Schedule</h3>
            {weeklyPlan.map((day, i) => (
              <DayPlan key={i} day={day} />
            ))}

            <div className="mt-6 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 p-4 text-center">
              <p className="text-sm font-medium text-purple-800">
                {state && state.recentAverageMinutes > 0
                  ? `Each day is sized to the ${state.recentAverageMinutes} minutes a day you have actually been practising.`
                  : 'A starting week. These targets follow the pace you actually keep, so they move as you do.'}
              </p>
            </div>
          </div>
        )}

        {/* Learning Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-4 fade-in">
            <InsightCard
              title="Learning Velocity"
              description="XP you have earned this week"
              metric={`${state ? state.weeklyXP : 0} XP this week`}
              trend={state && state.momentum > 1.05 ? 'up' : state && state.momentum < 0.95 ? 'down' : 'stable'}
            />
            <InsightCard
              title="Streak Power"
              description="Consecutive days you have practised"
              metric={state && state.streakCount > 0
                ? `${state.streakCount} day streak`
                : 'No streak yet'}
              trend={state && state.streakCount > 0 ? 'up' : 'stable'}
            />
            <InsightCard
              title="Weakness Reduction"
              description="Mistakes you have repaired and re-tested"
              metric={state && state.weaknessesResolved > 0
                ? `${state.weaknessesResolved} repaired`
                : 'None repaired yet'}
              trend={state && state.weaknessesResolved > 0 ? 'up' : 'stable'}
            />
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
        active
          ? 'bg-accent text-onaccent'
          : 'text-ink3 hover:bg-surface2'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <Icon size={14} />
        {label}
      </div>
    </button>
  );
}

function PriorityCard({ recommendation, onAction, urgent = false, compact = false }) {
  const urgencyColors = {
    urgent: 'from-red-500 to-orange-500',
    high: 'from-yellow-500 to-amber-500',
    medium: 'from-blue-500 to-cyan-500',
  };

  return (
    <div className={`rounded-xl p-5 border transition-all hover:shadow-md ${
      urgent
        ? 'border-red-200 bg-red-50'
        : 'border-line bg-surface2'
    }`}>
      <div className="flex items-start gap-4">
        {/* Urgency Indicator */}
        <div className={`shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${urgencyColors[recommendation.priority]} grid place-items-center`}>
          {recommendation.priority === 'urgent' ? (
            <Zap size={20} className="text-white" />
          ) : recommendation.priority === 'high' ? (
            <Target size={20} className="text-white" />
          ) : (
            <Clock size={20} className="text-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-bold text-ink">{recommendation.title}</h4>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
              recommendation.priority === 'urgent' ? 'bg-red-100 text-red-700' :
              recommendation.priority === 'high' ? 'bg-yellow-100 text-yellow-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {recommendation.priority}
            </span>
          </div>

          {!compact && <p className="text-sm text-ink2 mb-3">{recommendation.description}</p>}

          {/* Time Estimate */}
          {recommendation.estimatedTime && (
            <p className="text-xs text-ink3 mb-3 flex items-center gap-1">
              <Clock size={12} />
              ~{recommendation.estimatedTime} minutes
            </p>
          )}

          {/* Action Button — only when the recommendation points somewhere */}
          {recommendation.target && (
            <button
              onClick={() => onAction(recommendation)}
              className="btn btn-primary min-h-9 px-3 rounded-lg text-xs"
            >
              {recommendation.action}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DayPlan({ day }) {
  // The bar used to fill by position in the week (14%, 28%, 43%…), which
  // looked like progress the learner had made. It now compares the day's
  // target with the longest target in the plan.
  const longest = Math.max(day.maxTargetMinutes || day.targetMinutes, 1);
  const percentage = Math.min(100, Math.round((day.targetMinutes / longest) * 100));

  return (
    <div className="rounded-xl bg-surface2 border border-line p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-ink">{day.day}</h4>
        <span className="text-xs text-ink3">{day.targetMinutes} min target</span>
      </div>

      {/* Target bar */}
      <div className="h-1.5 bg-surface rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Recommended Modes */}
      <div className="flex flex-wrap gap-2">
        {day.recommendedModes.map(mode => (
          <span key={mode} className="text-[10px] px-2.5 py-1 bg-accent text-onaccent rounded-lg font-semibold">
            {formatModeName(mode)}
          </span>
        ))}
      </div>

      {/* Milestones */}
      {day.milestones.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          <div className="flex flex-wrap gap-2">
            {day.milestones.map((milestone, i) => (
              <span key={i} className="text-[10px] text-green600 flex items-center gap-1">
                <CheckCircle size={10} />
                {milestone.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({ title, description, metric, trend }) {
  return (
    <div className="rounded-xl bg-surface2 border border-line p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-ink">{title}</h4>
        <span className={`text-xs font-semibold ${
          trend === 'up' ? 'text-green600' :
          trend === 'down' ? 'text-red600' :
          'text-blue600'
        }`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
        </span>
      </div>
      <p className="text-xs text-ink2 mb-2">{description}</p>
      <p className="text-lg font-bold text-ink">{metric}</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-12 space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-green-100 grid place-items-center">
        <CheckCircle size={32} className="text-green600" />
      </div>
      <p className="text-sm font-medium text-ink">{message}</p>
    </div>
  );
}

function formatModeName(mode) {
  const names = {
    conversation: 'Conversation',
    vocabulary_review: 'Vocab Review',
    pronunciation_drills: 'Pronunciation',
    grammar_topics: 'Grammar',
    phoneme_training: 'Phonemes',
    vocab_memorization: 'Memorization',
  };
  return names[mode] || mode;
}
