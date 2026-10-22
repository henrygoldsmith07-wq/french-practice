// Study assistant: ranked suggestions, this week against the daily goal, and
// a two-week comparison — all read from the learner's own record when the
// panel opens (see lib/aiStudyAssistant.js).
import { useMemo, useState } from 'react';
import { Brain, TrendingUp, Target, Zap, Clock, CheckCircle } from './icons';
import { readStudyState, generateRecommendations, generateWeeklyPlan, weeklyInsights } from '../lib/aiStudyAssistant';

export default function AIStudyAssistant({ open, onClose, onRun }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview | plan | insights
  const view = useMemo(() => {
    if (!open) return null;
    const state = readStudyState();
    const recommendations = generateRecommendations(state);
    return {
      recommendations,
      plan: generateWeeklyPlan(state, recommendations),
      insights: weeklyInsights(state),
    };
  }, [open]);

  if (!open || !view) return null;
  const { recommendations, plan, insights } = view;
  const run = (action) => { if (action?.run) onRun?.(action.run); };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Study assistant">
      <div className="mx-auto min-h-full max-w-3xl px-4 py-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 grid place-items-center">
            <Brain size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">Study assistant</h2>
            <p className="text-xs text-ink2">Suggestions from your own practice record</p>
          </div>
          <button onClick={onClose} aria-label="Close study assistant" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex gap-2 mb-6 p-1 bg-surface border border-line rounded-xl" role="tablist">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={Zap} label="Suggestions" />
          <TabButton active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={Clock} label="This week" />
          <TabButton active={activeTab === 'insights'} onClick={() => setActiveTab('insights')} icon={TrendingUp} label="Trends" />
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4 fade-in">
            {recommendations.map((rec) => (
              <PriorityCard key={rec.id} recommendation={rec} onAction={run} />
            ))}
            {!recommendations.length && (
              <EmptyState message="Nothing needs attention yet. Suggestions appear here as you practise." />
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="space-y-3 fade-in">
            <h3 className="text-sm font-bold text-ink2 uppercase tracking-wide mb-3">
              Daily goal: {plan[0]?.goal ?? 0} XP
            </h3>
            {plan.map((day) => (
              <DayPlan key={day.key} day={day} onAction={run} />
            ))}
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="space-y-4 fade-in">
            <InsightCard
              title="XP, last 7 days"
              metric={`${insights.xp.value} XP`}
              detail={insights.xp.trend ? `${insights.xp.previous} XP the week before` : 'No earlier week to compare with yet'}
              trend={insights.xp.trend}
            />
            <InsightCard
              title="Time studied, last 7 days"
              metric={`${insights.minutes.value} min`}
              detail={insights.minutes.trend ? `${insights.minutes.previous} min the week before` : 'No earlier week to compare with yet'}
              trend={insights.minutes.trend}
            />
            <InsightCard
              title="Streak"
              metric={`${insights.streak} ${insights.streak === 1 ? 'day' : 'days'}`}
            />
            <InsightCard
              title="Weak spots"
              metric={insights.weaknesses.total ? `${insights.weaknesses.resolved} of ${insights.weaknesses.total} resolved` : 'None recorded yet'}
              detail={insights.weaknesses.recovering ? `${insights.weaknesses.recovering} recovering` : null}
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
      role="tab"
      aria-selected={active}
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

const URGENCY = {
  urgent: { icon: Zap, swatch: 'from-red-500 to-orange-500', chip: 'bg-red-100 text-red-700' },
  high: { icon: Target, swatch: 'from-yellow-500 to-amber-500', chip: 'bg-yellow-100 text-yellow-700' },
  medium: { icon: Clock, swatch: 'from-blue-500 to-cyan-500', chip: 'bg-blue-100 text-blue-700' },
  low: { icon: Clock, swatch: 'from-slate-400 to-slate-500', chip: 'bg-surface text-ink3' },
};

function PriorityCard({ recommendation, onAction }) {
  const { priority, title, description, estimatedTime, action } = recommendation;
  const u = URGENCY[priority] || URGENCY.medium;
  const Icon = u.icon;
  return (
    <div className={`rounded-xl p-5 border ${priority === 'urgent' ? 'border-red-200 bg-red-50' : 'border-line bg-surface2'}`}>
      <div className="flex items-start gap-4">
        <div className={`shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${u.swatch} grid place-items-center`}>
          <Icon size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="font-bold text-ink">{title}</h4>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${u.chip}`}>{priority}</span>
          </div>
          <p className="text-sm text-ink2 mb-3">{description}</p>
          {estimatedTime > 0 && (
            <p className="text-xs text-ink3 mb-3 flex items-center gap-1">
              <Clock size={12} /> ~{estimatedTime} min
            </p>
          )}
          {action && (
            <button onClick={() => onAction(action)} className="btn btn-primary min-h-9 px-3 rounded-lg text-xs">
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DayPlan({ day, onAction }) {
  const pct = day.goal > 0 ? Math.min(100, Math.round((day.xp / day.goal) * 100)) : 0;
  return (
    <div className={`rounded-xl border p-4 ${day.status === 'today' ? 'border-accent bg-surface' : 'border-line bg-surface2'}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-ink">{day.status === 'today' ? `${day.day} · today` : day.day}</h4>
        <span className="text-xs text-ink3 inline-flex items-center gap-1 tabular-nums">
          {day.met && <CheckCircle size={12} className="text-green600" />}
          {day.status === 'future' ? '—' : `${day.xp} / ${day.goal} XP`}
        </span>
      </div>
      {day.status !== 'future' && (
        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {day.focus && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-ink3">Focus:</span>
          {day.status === 'today' ? (
            <button onClick={() => onAction(day.focus)} className="text-[11px] px-2.5 py-1 bg-accent text-onaccent rounded-lg font-semibold">
              {day.focus.label}
            </button>
          ) : (
            <span className="text-[11px] px-2.5 py-1 bg-surface border border-line text-ink2 rounded-lg font-semibold">{day.focus.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

function InsightCard({ title, metric, detail = null, trend = null }) {
  return (
    <div className="rounded-xl bg-surface2 border border-line p-4">
      <div className="flex items-center justify-between mb-1">
        <h4 className="font-semibold text-ink">{title}</h4>
        {trend && (
          <span className={`text-xs font-semibold ${trend === 'up' ? 'text-green600' : trend === 'down' ? 'text-red600' : 'text-ink3'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      <p className="text-lg font-bold text-ink">{metric}</p>
      {detail && <p className="text-xs text-ink2 mt-1">{detail}</p>}
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
