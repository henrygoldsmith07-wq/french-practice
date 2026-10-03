import { useMemo } from 'react';
import { buildWeeklyReview, weeklyReviewLines } from '../lib/weeklyReview';
import {
  getSessions, getTimeLog, getStudyEvents, getLearnerErrorModel, getLearningEvidenceState,
} from '../lib/storage';
import { hasCapabilityNow } from '../lib/languages';

// The weekly review: a concise, actionable summary — no charts, no scores
// wall. Practised minutes, speaking minutes, what was demonstrated, what
// improved, what came back, and what to do next week.

export default function WeeklyReviewCard() {
  const summary = useMemo(() => {
    try {
      return buildWeeklyReview({
        sessions: getSessions(),
        timeLog: getTimeLog(),
        reviewEvents: getStudyEvents().filter((e) => e?.type === 'review.completed'),
        learningEvidence: hasCapabilityNow('learning-path') ? getLearningEvidenceState() : {},
        learnerErrorModel: getLearnerErrorModel(),
      });
    } catch {
      return null;
    }
  }, []);
  if (!summary) return null;
  const lines = weeklyReviewLines(summary);

  return (
    <section className="bg-surface border border-line rounded-[20px] p-[22px] space-y-3" aria-label="This week">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink2">This week</h2>
      <ul className="space-y-1">
        {lines.map((line) => (
          <li key={line} className="text-sm text-ink2 leading-relaxed">{line}</li>
        ))}
      </ul>
      {summary.biggestImprovement && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Biggest improvement</p>
          <p className="text-sm text-ink mt-0.5">{summary.biggestImprovement.label}</p>
          <p className="text-xs text-ink2">{summary.biggestImprovement.why}</p>
        </div>
      )}
      {summary.needsAttention && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Needs attention</p>
          <p className="text-sm text-ink mt-0.5">{summary.needsAttention.label}</p>
          <p className="text-xs text-ink2">{summary.needsAttention.why}</p>
        </div>
      )}
      {summary.nextWeek?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Next week</p>
          <ul className="mt-1 space-y-0.5">
            {summary.nextWeek.map((action) => (
              <li key={action} className="text-xs text-ink2 leading-relaxed">· {action}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
