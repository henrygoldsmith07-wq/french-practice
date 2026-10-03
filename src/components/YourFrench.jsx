import { useMemo } from 'react';
import { buildCapabilityMap, progressOverview } from '../lib/capabilityModel';
import { progressEvidenceStatements } from '../lib/progressEvidence';
import { weaknessLifecycle, lifecycleCopy, WEAKNESS_LIFECYCLE } from '../lib/weaknessLifecycle';
import { getLearnerErrors, getSettings, getLearningEvidenceState, getSessions, getMetrics } from '../lib/storage';
import { hasCapabilityNow } from '../lib/languages';
import { ChevronRight } from './icons';

// The default Progress screen — four questions, answered in plain language:
//   1. What can I do now?        → demonstrated capabilities
//   2. What am I improving?      → developing capabilities
//   3. What is still weak?       → open weaknesses in lifecycle language
//   4. What should I do next?    → one concrete action
//
// Detailed evidence and analytics stay one tap away (progressive disclosure);
// this screen never leads with statistical terminology.

const STATE_ORDER = [
  WEAKNESS_LIFECYCLE.RECURRED,
  WEAKNESS_LIFECYCLE.CONFIRMED,
  WEAKNESS_LIFECYCLE.DETECTED,
  WEAKNESS_LIFECYCLE.REPAIRING,
  WEAKNESS_LIFECYCLE.IMPROVING,
];

export default function YourFrench({ level, onOpenDetails }) {
  const data = useMemo(() => {
    try {
      const errorEntries = getLearnerErrors({ limit: 20 });
      const learningEvidence = hasCapabilityNow('learning-path') ? getLearningEvidenceState() : {};
      const capabilityMap = buildCapabilityMap({
        errorEntries,
        cycles: Array.isArray(learningEvidence?.cycles) ? learningEvidence.cycles : [],
        sessions: getSessions(),
        metrics: getMetrics(),
      });
      const weakRows = errorEntries
        .filter((e) => e.status !== 'resolved')
        .map((e) => {
          const life = weaknessLifecycle(e, {});
          return {
            label: String(e.label || e.key),
            state: life?.state || WEAKNESS_LIFECYCLE.DETECTED,
            ...lifecycleCopy(life?.state || WEAKNESS_LIFECYCLE.DETECTED),
          };
        })
        .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
      const next = nextAction(capabilityMap, weakRows);
      // Evidence-based statements: what actually happened, in plain language.
      const evidence = progressEvidenceStatements({
        learningEvidence: Array.isArray(learningEvidence?.cycles) ? learningEvidence : {},
        errorEntries,
      });
      return {
        overview: progressOverview({
          capabilityMap,
          weaknessLifecycle: weakRows,
          nextAction: next,
          level: level || getSettings().level || null,
          bootstrapping: errorEntries.length === 0 && (learningEvidence?.cycles || []).length === 0,
        }),
        evidence,
      };
    } catch {
      return { overview: null, evidence: { strengths: [], improving: [], weak: [] } };
    }
  }, [level]);

  const overview = data.overview;
  const evidence = data.evidence || { strengths: [], improving: [], weak: [] };
  if (!overview) return null;
  const bootstrapping = overview.bootstrapping;
  const workingLevel = overview.level || level || getSettings().level;

  return (
    <section className="bg-surface border border-line rounded-[20px] p-[22px] space-y-5" aria-label="Your French">
      <header>
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">Your French</h2>
        {workingLevel && (
          <p className="text-sm text-ink2 mt-0.5">Working level: <span className="font-semibold text-ink">{workingLevel}</span></p>
        )}
        {bootstrapping && (
          <p className="text-xs text-ink2 mt-2 leading-relaxed">
            Le Studio is learning what you already know. Your sessions will become more personalised over the next few practices.
          </p>
        )}
      </header>

      <div className="space-y-4">
        <Block
          title="Strong"
          hint={bootstrapping ? 'Once you have practised a bit, what you can reliably do shows up here.' : null}
          items={overview.canDo}
          statements={evidence.strengths}
          fallback="Nothing confirmed yet — keep practising and this fills in."
        />
        <Block
          title="Improving"
          items={overview.improving}
          statements={evidence.improving}
          fallback="No skills in motion right now — today's session will start some."
        />
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink2">Needs attention</h3>
          {(overview.weak.length || evidence.weak.length) ? (
            <ul className="mt-2 space-y-1.5">
              {evidence.weak.map((line) => (
                <li key={line} className="text-sm text-ink2 leading-snug flex items-start gap-2">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-ink3 shrink-0" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
              {overview.weak.map((w) => (
                <li key={w.label} className="text-sm text-ink2 leading-snug flex items-start gap-2">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-ink3 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold text-ink">{w.label}</span>
                    {w.state === WEAKNESS_LIFECYCLE.RECURRED && (
                      <span className="ml-1.5 text-[11px] text-ink3">— this came back after improving, so we're practising it again</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink2">Nothing outstanding. Anything that slips will show up here.</p>
          )}
        </div>
        <div className="bg-surface2 rounded-xl px-3.5 py-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink3">Next</h3>
          <p className="text-sm font-semibold text-ink mt-0.5">
            {overview.next ? overview.next : 'Open today’s session — it picks the next step for you.'}
          </p>
        </div>
      </div>

      {onOpenDetails && (
        <button
          onClick={onOpenDetails}
          className="text-xs font-semibold text-ink3 hover:text-ink inline-flex items-center gap-1"
        >
          See detailed evidence <ChevronRight size={12} />
        </button>
      )}
    </section>
  );
}

function Block({ title, items, statements = [], fallback, hint }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink2">{title}</h3>
      {hint && !items.length && !statements.length && <p className="mt-2 text-sm text-ink2 leading-snug">{hint}</p>}
      {(items.length || statements.length) ? (
        <ul className="mt-2 space-y-1.5">
          {statements.map((line) => (
            <li key={line} className="text-sm text-ink2 leading-snug flex items-start gap-2">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-success shrink-0" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
          {items.map((item) => (
            <li key={item.id} className="text-sm text-ink2 leading-snug flex items-start gap-2">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-success shrink-0" aria-hidden />
              <span>{item.statement}</span>
            </li>
          ))}
        </ul>
      ) : (!hint && <p className="mt-2 text-sm text-ink2">{fallback}</p>)}
    </div>
  );
}

function nextAction(capabilityMap, weakRows) {
  const recurred = weakRows.find((w) => w.state === WEAKNESS_LIFECYCLE.RECURRED);
  if (recurred) return `Use ${recurred.label.toLowerCase()} correctly in a new speaking situation.`;
  const improving = weakRows.find((w) => w.state === WEAKNESS_LIFECYCLE.IMPROVING);
  if (improving) return `Keep ${improving.label.toLowerCase()} in play during today's session.`;
  const developing = capabilityMap?.developing?.[0];
  if (developing) return `Practise ${developing.statement}.`;
  const confirmed = weakRows.find((w) => w.state === WEAKNESS_LIFECYCLE.CONFIRMED);
  if (confirmed) return `Repair ${confirmed.label.toLowerCase()} in today's session.`;
  return null;
}
