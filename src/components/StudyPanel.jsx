import { useMemo, useState } from 'react';
import {
  studyStatus, withdrawStudyState, clearStudyState,
} from '../lib/studyFlow';
import {
  personalOutcomes, studyAggregates, checkScore,
  MIN_N_PER_ARM,
} from '../lib/evidenceStudy';
import {
  getStudyOutcomes, getStudyChecks, getStudyState,
  buildStudyBundle, getImportedStudyBundles,
} from '../lib/storage';

// Evidence Study panel — the longitudinal study's dashboard.
//
//   Study day 18
//   Delayed retention     74%
//   New-context transfer  68%
//   Recurrence            11%
//   Evidence status: Provisional · n=14
//
// HONESTY CONTRACT: every rate is null below its sample floor and prints as
// '—'. The adaptive-vs-balanced comparison appears only when BOTH arms clear
// MIN_N_PER_ARM scored outcomes, and even then the copy says "descriptive
// only" — no significance, no confidence, no superiority claims. The
// learner's own arm is NEVER displayed.

const pct = (v) => (v == null ? '—' : `${v}%`);

function downloadJson(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StudyPanel() {
  const [busy, setBusy] = useState(false);
  const data = useMemo(() => {
    const { state, enrolled, day } = studyStatus();
    if (!enrolled) return { enrolled: false };
    const outcomes = getStudyOutcomes();
    const checks = getStudyChecks();
    return {
      enrolled: true,
      state,
      day,
      personal: personalOutcomes(outcomes),
      aggregates: studyAggregates(outcomes),
      checks: checks.map((c) => ({ id: c.id, day: c.day, score: checkScore(c), total: c.results?.total ?? 0 })),
      nParticipants: getImportedStudyBundles().length,
    };
  }, [busy]);

  if (!data.enrolled) {
    const withdrawn = data.state?.status === 'withdrawn';
    return (
      <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Evidence study</h3>
        {withdrawn && (
          <p className="text-xs text-ink2">You have withdrawn. Study data was deleted; practice history is untouched.</p>
        )}
        <p className="text-xs text-ink2">
          The Evidence Study measures whether the adaptive Today loop genuinely improves
          delayed retention and transfer. If you take part, a held-out check rides at the
          end of some Today sessions: brief, unscaffolded material you have never practised,
          scored for measurement only — it never touches your review schedule or mistakes.
        </p>
        <ul className="text-xs text-ink3 space-y-1">
          <li>· An anonymous participant id is generated locally — no account, no name.</li>
          <li>· Your starting CEFR band and the study start date are recorded once.</li>
          <li>· Curriculum assignment is locked for the study period and never displayed.</li>
          <li>· Everything stays on this device until you explicitly export a bundle.</li>
        </ul>
        <p className="text-[10px] text-ink3">
          Enrolment happens automatically on your next Today session — this panel will
          then show your study dashboard. You can withdraw and delete study data at any time.
        </p>
        {withdrawn && (
          <button
            onClick={() => { clearStudyState(); setBusy((b) => !b); }}
            className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs"
          >
            Clear withdrawn record (allows re-enrolment)
          </button>
        )}
      </section>
    );
  }

  const { state, day, personal, aggregates, checks } = data;
  const statusLabel = personal.n === 0
    ? 'No data yet'
    : personal.n < MIN_N_PER_ARM
      ? `Provisional · n=${personal.n}`
      : `Collecting · n=${personal.n}`;
  const armRow = (label, arm) => (
    <div className="flex items-baseline gap-2">
      <span className="w-20 shrink-0 text-xs text-ink font-semibold">{label}</span>
      <span className="w-12 shrink-0 text-[11px] text-ink3 tabular-nums">n={arm.n}</span>
      <span className="text-[11px] text-ink3">
        1–3d {pct(arm.delayedShort.rate == null ? null : Math.round(arm.delayedShort.rate * 100))}
        {' · '}7d+ {pct(arm.delayedLong.rate == null ? null : Math.round(arm.delayedLong.rate * 100))}
        {' · '}transfer {pct(arm.transfer.rate == null ? null : Math.round(arm.transfer.rate * 100))}
        {' · '}recurrence {pct(arm.recurrence.rate == null ? null : Math.round(arm.recurrence.rate * 100))}
      </span>
    </div>
  );

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Evidence study</h3>
        <span className="text-[11px] text-ink3 tabular-nums">Study day {day ?? 0}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="study-metrics">
        <Metric label="Delayed retention" value={pct(personal.delayedShort)} sub="1–3 days" />
        <Metric label="New-context transfer" value={pct(personal.transfer)} sub="held-out checks" />
        <Metric label="Recurrence" value={pct(personal.recurrence)} sub="after delayed success" />
        <Metric label="Long-term recall" value={pct(personal.delayedLong)} sub="7+ days" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink3" data-testid="study-status">
        Evidence status: {statusLabel}
      </p>
      <p className="text-[10px] text-ink3">
        Immediate retries never count as retention. Held-out checks are measurement only.
        {checks.length ? ` ${checks.length} check${checks.length === 1 ? '' : 's'} so far.` : ''}
      </p>

      <div className="border-t border-line pt-2 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Adaptive vs balanced</p>
        {armRow('Adaptive', aggregates.adaptive)}
        {armRow('Balanced', aggregates.balanced)}
        <p className="text-[10px] text-ink3" data-testid="study-comparison">{aggregates.comparison.message}</p>
      </div>

      {data.nParticipants > 0 && (
        <p className="text-[10px] text-ink3 border-t border-line pt-2">
          {data.nParticipants} imported participant bundle{data.nParticipants === 1 ? '' : 's'} pooled for research aggregation (read-only).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          onClick={() => {
            setBusy((b) => !b);
            try {
              downloadJson(`le-studio-evidence-study-${state.participantId}.json`, buildStudyBundle());
            } finally { setBusy((b) => !b); }
          }}
          className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs"
        >
          Export study bundle
        </button>
        <button
          onClick={() => {
            // Consent & deletion: withdraw stops collection and wipes the
            // study's own stores. Practice history (XP, reviews, mistakes)
            // is the learner's normal data and is untouched.
            withdrawStudyState({ deleteData: true });
            setBusy((b) => !b);
          }}
          className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs text-ink2"
        >
          Withdraw & delete study data
        </button>
      </div>
      <p className="text-[10px] text-ink3">
        The bundle carries your anonymous id, locked assignment, outcome rows and check
        scores — never transcripts or raw sentences. Withdrawing does not delete practice history.
      </p>
    </section>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-surface2 border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink3">{label}</p>
      <p className="text-lg font-bold text-ink tabular-nums">{value}</p>
      <p className="text-[10px] text-ink3">{sub}</p>
    </div>
  );
}
