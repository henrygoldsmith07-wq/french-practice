import { useMemo, useState } from 'react';
import {
  studyStatus, withdrawStudyState, clearStudyState,
  studyConsentState, recordStudyConsent,
} from '../lib/studyFlow';
import {
  personalOutcomes, checkScore,
  MIN_N_PER_ARM,
} from '../lib/evidenceStudy';
import { poolStudyData } from '../lib/researchAggregation';
import {
  getStudyOutcomes, getStudyChecks, getStudyState,
  buildStudyBundle, getImportedStudyBundles,
} from '../lib/storage';
import { CONSENT_POINTS } from '../lib/studyConsent';

// Evidence Study panel — the longitudinal study's dashboard.
//
//   Study day 18
//   Delayed retention     74%
//   New-context transfer  68%
//   Recurrence            11%
//   Evidence status: Provisional · n=14
//
// HONESTY CONTRACT: every rate is null below its sample floor and prints as
// '—'. The adaptive-vs-balanced comparison runs on the POOLED research
// dataset (local + imported bundles) and appears only when BOTH arms clear
// MIN_N_PER_ARM scored outcomes — descriptive only, never significance,
// confidence or superiority claims. The learner's own arm is NEVER displayed.
// Enrolment is strictly opt-in: this panel owns the consent flow.

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
    if (!enrolled) return { enrolled: false, state, consent: studyConsentState() };
    const outcomes = getStudyOutcomes();
    const checks = getStudyChecks();
    const study = getStudyState();
    const imports = getImportedStudyBundles();
    // Research aggregation: local participant + imported bundles, deduped
    // and schema-validated. Comparisons use ONLY this pooled dataset.
    const pool = poolStudyData({ localStudy: study, localOutcomes: outcomes, imports });
    return {
      enrolled: true,
      state,
      day,
      consent: studyConsentState(),
      personal: personalOutcomes(outcomes),
      checks: checks.map((c) => ({ id: c.id, day: c.day, score: checkScore(c), total: c.results?.total ?? 0 })),
      nParticipants: imports.length,
      pool,
    };
  }, [busy]);

  if (!data.enrolled) {
    const withdrawn = data.state?.status === 'withdrawn';
    const declined = data.consent === 'declined';
    return (
      <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Evidence study</h3>
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink3" data-testid="study-status">
          {withdrawn ? 'Withdrawn' : declined ? 'Not participating' : 'Evidence status: Not enrolled (no consent yet)'}
        </p>
        {withdrawn && (
          <p className="text-xs text-ink2">You have withdrawn. Study data was deleted; practice history is untouched.</p>
        )}
        {declined && (
          <p className="text-xs text-ink2">
            You declined to take part — that is completely fine, and nothing was recorded.
            The invitation stays here if you ever change your mind; Today never asks again.
          </p>
        )}
        <p className="text-xs text-ink2">
          The Evidence Study measures whether the adaptive Today loop genuinely improves
          delayed retention and transfer compared with an equivalent balanced curriculum.
          Participation is optional — normal practice works exactly the same without joining.
        </p>
        <ul className="text-xs text-ink3 space-y-1">
          {CONSENT_POINTS.map((p) => (
            <li key={p.title}><span className="font-bold">{p.title}:</span> {p.body}</li>
          ))}
        </ul>
        {!data.consent && !withdrawn && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => { recordStudyConsent('accepted'); setBusy((b) => !b); }}
              className="btn btn-primary min-h-10 px-4 rounded-xl text-sm"
            >
              Join the study
            </button>
            <button
              onClick={() => { recordStudyConsent('declined'); setBusy((b) => !b); }}
              className="btn btn-secondary min-h-10 px-4 rounded-xl text-sm text-ink2"
            >
              Not now
            </button>
          </div>
        )}
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

  const { state, day, personal, checks } = data;
  const comparison = data.pool.comparison;
  const statusLabel = personal.n === 0
    ? 'No data yet'
    : personal.n < MIN_N_PER_ARM
      ? `Provisional · n=${personal.n}`
      : `Collecting · n=${personal.n}`;
  const p = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const armBlock = (label, arm) => (
    <div className="space-y-1" data-testid={`arm-${label.toLowerCase()}`}>
      <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-xs text-ink font-semibold">{label}</span>
        <span className="text-[11px] text-ink3 tabular-nums">
          Enrolled: {arm.participants} · Eligible: {arm.eligibleParticipants} · Sessions: {arm.sessions}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-[11px] text-ink3">1–3d evidence:</span>
        <span className="text-[11px] text-ink tabular-nums">
          {arm.delayedShort.mean == null ? '—' : `${Math.round(arm.delayedShort.mean * 100)}% (median ${Math.round(arm.delayedShort.median * 100)}%)`} from {arm.delayedShort.scoredParticipants} scored participants
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-[11px] text-ink3">7d+ evidence:</span>
        <span className="text-[11px] text-ink tabular-nums">
          {arm.delayedLong.mean == null ? '—' : `${Math.round(arm.delayedLong.mean * 100)}%`} from {arm.delayedLong.scoredParticipants} scored participants
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-[11px] text-ink3">Transfer (vocab):</span>
        <span className="text-[11px] text-ink tabular-nums">
          {arm.transfer.mean == null ? '—' : `${Math.round(arm.transfer.mean * 100)}%`} from {arm.transfer.scoredParticipants} scored participants
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-[11px] text-ink3">Recurrence:</span>
        <span className="text-[11px] text-ink tabular-nums">
          {arm.recurrence.mean == null ? '—' : `${Math.round(arm.recurrence.mean * 100)}%`} from {arm.recurrence.scoredParticipants} scored participants
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-[11px] text-ink3">Completion:</span>
        <span className="text-[11px] text-ink tabular-nums">
          {arm.completion.mean == null ? '—' : `${Math.round(arm.completion.mean * 100)}%`} from {arm.completion.scoredParticipants} scored participants
        </span>
      </div>
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
        <Metric label="Held-out vocabulary transfer" value={pct(personal.transfer)} sub="measurement-only checks" />
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

      <div className="border-t border-line pt-2 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">
          Adaptive vs balanced — pooled, participant-weighted ({data.pool.participants} participant{data.pool.participants === 1 ? '' : 's'}: {data.pool.participantsByArm.adaptive || 0} adaptive · {data.pool.participantsByArm.balanced || 0} balanced)
        </p>
        {armBlock('Adaptive', comparison.adaptive)}
        {armBlock('Balanced', comparison.balanced)}
        <p className="text-[10px] text-ink3" data-testid="study-comparison">{comparison.comparison.message}</p>
        <p className="text-[10px] text-ink3">
          Each metric prints only when its own scored-participant floor is met. Participant-weighted:
          one contribution per participant per metric — heavy practice never outweighs a quiet learner.
        </p>
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
