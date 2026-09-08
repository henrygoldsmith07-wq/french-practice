import { useMemo, useRef, useState } from 'react';
import {
  getSrs, getNotebook, getReviewLog, getXp, getSettings, getReviewEvents, getSessionHistoryMeta,
  getEvidenceLedgerModel, getErrorModelSummary, getLearnerErrors, getLearnerErrorSummary,
  getPlacementValidationMetrics, getProgressionValidationMetrics,
  getCorpusMetrics, getAssistanceMetrics, getIntelligibilityBenchmark,
  getComprehensionValidationMetrics, getStudyProgress, buildValidationBundle, ingestValidationBundle,
  getSelectionTrial, getMistakeGraph as getGraphForTrials,
  getWeaknessMemory, getWeaknessSummary, getGrammarErrors,
  getExaminerScripts, getRealExamResults,
} from '../lib/storage';
import { allEntries as vocabAllEntries, allEntries } from '../lib/vocab';
import { notebookAsEntries } from '../lib/memory';
import { getGrammarTopic } from '../lib/grammar';
import { errorNotebookStats } from '../lib/errorNotebook';
import { retentionPredictionVsActual, speakingImprovement } from '../lib/learnerValidation';
import { benchmarkExaminer, validateAgainstResults } from '../lib/examBenchmark';
import { benchmarkStatus, mergeBenchmarkItems } from '../lib/intelligibility';
import { fmtDuration } from '../lib/analytics';
import { EVIDENCE_FLOORS } from '../lib/validationStatusReport';
import {
  joinTrials, calibrateSelection, adaptiveBalancedOutcomes,
  MIN_VARIANT_N, MIN_TRANSFER_N,
} from '../lib/selectionCalibration';
import { mistakeGraphStats } from '../lib/mistakeGraph';
import { TrendingUp } from './icons';

// Analytics evidence sections, split out of Analytics.jsx so each concern
// (ledger, external validation, adaptive-practice evidence, exam benchmark)
// stays readable. Behaviour is unchanged; Analytics renders these.

export function EvidenceLedger({ sessions, reviewEvents, errorModel, summary, historyMeta }) {
  const byMode = Object.entries(summary.byMode || {}).sort((a, b) => b[1] - a[1]);
  const active = errorModel.filter((entry) => entry.status !== 'resolved').slice(0, 6);
  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Evidence ledger</h3>
        <p className="text-xs text-ink3 mt-1">Your history and mistakes stay available across practice modes.</p>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div><p className="text-lg font-bold text-ink tabular-nums">{sessions.length}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Sessions</p></div>
        <div><p className="text-lg font-bold text-ink tabular-nums">{reviewEvents.length}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Review events</p></div>
        <div><p className="text-lg font-bold text-ink tabular-nums">{summary.active}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Active gaps</p></div>
        <div><p className="text-lg font-bold text-ink tabular-nums">{summary.recurrences}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Recurrences</p></div>
      </div>
      {historyMeta?.migration === 'last-10-to-durable' && (
        <p className="text-[11px] text-ink3 border-t border-line pt-3">
          Session history migration complete: {historyMeta.recoveredSessions || 0} existing session{historyMeta.recoveredSessions === 1 ? '' : 's'} preserved. New sessions are retained without a recent-window limit.
        </p>
      )}
      {byMode.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {byMode.map(([mode, count]) => (
            <span key={mode} className="px-2 py-1 rounded-full border border-line bg-surface2 text-[10px] font-semibold text-ink2">
              {modeLabel(mode)} · {count}
            </span>
          ))}
        </div>
      )}
      {active.length > 0 ? (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Recycle these gaps</p>
          {active.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-ink truncate">{entry.label}</span>
                <span className="block text-[10px] text-ink3">{modeLabel(entry.mode)} · {entry.errorCount} miss{entry.errorCount === 1 ? '' : 'es'} · revisit in {entry.recycleModes.map(modeLabel).join(' + ')}</span>
              </span>
              <span className="shrink-0 text-[10px] font-bold text-ink3 tabular-nums">{entry.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink3 border-t border-line pt-3">No active cross-mode gaps yet. Your first missed item will appear here with a recycling path.</p>
      )}
    </section>
  );
}

function modeLabel(mode) {
  return {
    grammar: 'Grammar',
    vocabulary: 'Vocabulary',
    listening: 'Listening',
    pronunciation: 'Pronunciation',
    speaking: 'Speaking',
    writing: 'Writing',
    reading: 'Reading',
  }[mode] || mode;
}

// Persistent weakness memory: error → repair → deliberate retest → recurrence.
export function WeaknessMemory() {
  const summary = getWeaknessSummary();
  const items = getWeaknessMemory().slice(0, 6);
  if (!items.length) return null;
  const pct = summary.recurrenceRate == null ? '—' : `${Math.round(summary.recurrenceRate * 100)}%`;
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Weakness memory & retests</h3>
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><p className="text-base font-bold text-ink tabular-nums">{summary.byStatus.active}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Active</p></div>
          <div><p className="text-base font-bold text-ink tabular-nums">{summary.byStatus.recovering}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Recovering</p></div>
          <div><p className="text-base font-bold text-ink tabular-nums">{summary.byStatus.resolved}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Resolved</p></div>
          <div><p className="text-base font-bold text-ink tabular-nums">{pct}</p><p className="text-[9px] font-bold uppercase tracking-wider text-ink3">Recurrence</p></div>
        </div>
        <p className="text-[11px] text-ink3">{summary.retests} retests · {summary.recurrences} recurrences{summary.due ? ` · ${summary.due} due now` : ''} — lower recurrence means fixes are sticking.</p>
        <div className="space-y-2">
          {items.map((e) => {
            const topic = getGrammarTopic(e.topicId);
            const label = topic ? topic.title : e.topicId;
            const badge = e.status === 'resolved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : e.status === 'recovering' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-surface2 text-ink3 border-line';
            return (
              <div key={e.topicId} className="flex items-center gap-2">
                <span className="flex-1 text-xs text-ink truncate" lang="fr">{label}</span>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${badge}`}>{e.status}</span>
                <span className="shrink-0 text-[11px] text-ink3 tabular-nums">{e.errorCount}×</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


function downloadFile(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function EvidenceStudy() {
  const progress = useMemo(() => {
    try { return getStudyProgress(); } catch { return null; }
  }, []);
  const [importNote, setImportNote] = useState(null);
  const fileRef = useRef(null);
  if (!progress) return null;

  const doExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`le-studio-validation-bundle-${stamp}.json`, JSON.stringify(buildValidationBundle(), null, 2), 'application/json');
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const report = ingestValidationBundle(await file.text());
      const added = Object.entries(report.added).filter(([, n]) => n > 0).map(([k, n]) => `${k} +${n}`).join(', ') || 'nothing new';
      setImportNote(
        report.ok
          ? `Imported: ${added}${report.skipped ? ` · ${report.skipped} duplicates skipped` : ''}`
          : `Import stopped: ${report.errors[0]}${report.errors.length > 1 ? ` (+${report.errors.length - 1} more)` : ''}`
      );
    } catch (err) {
      setImportNote(`Import failed: ${err.message}`);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Evidence study</h3>
        <span className="text-[11px] text-ink3 tabular-nums">{progress.totalN}/{progress.totalTarget} entries · {progress.streamsMet}/{progress.rows.length} streams at target</span>
      </div>
      <p className="text-xs text-ink2">
        These numbers only move when real humans contribute marks — teacher entry in Settings → Developer panel, or an imported bundle. Nothing is generated.
      </p>
      <div className="space-y-2">
        {progress.rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="w-52 shrink-0 truncate text-[11px] text-ink" title={r.label}>{r.label}</span>
            <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden" role="progressbar" aria-valuenow={r.n} aria-valuemin={0} aria-valuemax={r.target} aria-label={`${r.label}: ${r.n} of ${r.target}`}>
              <div className={`h-full rounded-full ${r.met ? 'bg-success' : 'bg-ink'}`} style={{ width: `${r.pct}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right text-[11px] text-ink3 tabular-nums">{r.n}/{r.target}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-line">
        <button onClick={doExport} className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs">Export bundle</button>
        <button onClick={() => fileRef.current?.click()} className="btn btn-secondary min-h-9 px-3 rounded-lg text-xs">Import bundle</button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" aria-hidden="true" tabIndex={-1} />
        {importNote && <span className="text-[11px] text-ink3 truncate" role="status">{importNote}</span>}
      </div>
    </section>
  );
}

// Adaptive-practice evidence: does the calibrated Today loop actually work?
// Every rate here is sample-gated — below the floor it prints '—', never a
// number that would pretend to be a finding. The join is real: frozen
// selection trials joined against the mistake graph's delayed retests.
export function AdaptivePracticeEvidence() {
  const data = useMemo(() => {
    try {
      const trials = getSelectionTrial();
      const graph = getGraphForTrials();
      const joined = joinTrials(trials, graph);
      const withSelection = joined.filter((t) => t.selectedId);
      const delayedRows = withSelection.filter((t) => typeof t.delayedResult === 'boolean');
      const transferRows = withSelection.filter((t) => t.newContextResult != null || t.transferObserved);
      const calibration = calibrateSelection(trials, graph);
      const variants = adaptiveBalancedOutcomes(trials, graph);
      const graphStats = mistakeGraphStats(graph);
      return {
        trials: trials.length,
        joined: withSelection.length,
        delayed: {
          n: delayedRows.length,
          rate: delayedRows.length >= MIN_VARIANT_N
            ? Math.round(delayedRows.filter((t) => t.delayedResult).length / delayedRows.length * 100) : null,
        },
        transfer: {
          n: transferRows.length,
          rate: transferRows.length >= MIN_TRANSFER_N
            ? Math.round(transferRows.filter((t) => t.newContextResult === true || t.transferObserved).length / transferRows.length * 100) : null,
        },
        timeSpent: joined.filter((t) => Number.isFinite(t.timeSpent)),
        completed: joined.filter((t) => typeof t.completed === 'boolean'),
        calibration,
        variants,
        graphStats,
      };
    } catch { return null; }
  }, []);
  if (!data) return null;
  const pct = (v) => (v == null ? '—' : `${v}%`);
  const variantRow = (label, v) => (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-xs text-ink font-semibold">{label}</span>
      <span className="w-12 shrink-0 text-xs text-ink3 tabular-nums">n={v.n}</span>
      <span className="text-[11px] text-ink3">
        delayed {pct(v.delayedRate)} · new-context {v.newContextRate == null ? '—' : `${v.newContextRate}%`} · recurrence {pct(v.recurrenceRate)} · completed {pct(v.completed)}
      </span>
    </div>
  );
  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Adaptive practice evidence</h3>
        <span className="text-[11px] text-ink3 tabular-nums">{data.trials} Today sessions · {data.joined} with a targeted weakness</span>
      </div>
      <p className="text-xs text-ink2">
        Immediate post-correction success is never counted here — only delayed and
        new-context retests, joined from the frozen selection records.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Adaptive outcome summary">
        <Stat label="Delayed retention" value={pct(data.delayed.rate)} sub={`n=${data.delayed.n}`} />
        <Stat label="Transfer (new context)" value={pct(data.transfer.rate)} sub={`n=${data.transfer.n}`} />
        <Stat label="Median time / session" value={data.timeSpent.length >= MIN_VARIANT_N
          ? `${Math.round(median(data.timeSpent.map((t) => t.timeSpent))) / 60} min` : '—'}
          sub={`n=${data.timeSpent.length}`} />
        <Stat label="Sessions completed" value={pct(data.completed.length >= MIN_VARIANT_N
          ? Math.round(data.completed.filter((t) => t.completed).length / data.completed.length * 100) : null)}
          sub={`n=${data.completed.length}`} />
      </div>
      <div className="border-t border-line pt-2 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Adaptive vs balanced (rates print at n≥{MIN_VARIANT_N} per arm)</p>
        {variantRow('Adaptive', data.variants.adaptive)}
        {variantRow('Balanced', data.variants.balanced)}
        <p className="text-[10px] text-ink3">
          {data.variants.adaptive.n < MIN_VARIANT_N || data.variants.balanced.n < MIN_VARIANT_N
            ? 'Sample too small to compare arms — keep practicing; nothing is claimed below the floor.'
            : 'Same time budget both arms; only content targeting differs.'}
        </p>
      </div>
      <div className="border-t border-line pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Selection calibration</p>
        <p className="text-[11px] text-ink3" data-testid="calibration-status">{data.calibration.message}</p>
        {data.calibration.ready && data.calibration.rows?.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {data.calibration.rows.map((r) => (
              <div key={r.type} className="flex items-baseline gap-2">
                <span className="w-24 shrink-0 text-xs text-ink">{r.type}</span>
                <span className="text-[11px] text-ink3 tabular-nums">
                  weight ×{r.weight} · delayed {r.delayed.n ? `${Math.round(r.delayed.rate * 100)}% (n=${r.delayed.n})` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {data.graphStats?.n > 0 && (
        <div className="border-t border-line pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">Mistake graph</p>
          <p className="text-[11px] text-ink3">{data.graphStats.message}</p>
          {data.graphStats.recurrenceByDelay && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
              {Object.entries(data.graphStats.recurrenceByDelay).map(([bucket, v]) => (
                <span key={bucket} className="text-[11px] text-ink3 tabular-nums">
                  {bucket}: {v.rate == null ? '—' : `${v.rate}%`} <span className="text-ink3/70">(n={v.n})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-surface2 border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink3">{label}</p>
      <p className="text-lg font-bold text-ink tabular-nums">{value}</p>
      <p className="text-[10px] text-ink3 tabular-nums">{sub}</p>
    </div>
  );
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function LearnerValidation(){
  const srs = (()=>{ try{ return getSrs(); }catch{ return {}; } })();
  const entries = (()=>{ try{ return vocabAllEntries(); }catch{ return []; } })();
  const retention = retentionPredictionVsActual(srs, entries.slice(0,40));
  const speaking = (()=>{ try{ return speakingImprovement([]); }catch{ return { slope:null }; } })();

  // External-validation harnesses: every one starts empty and says so until a
  // human supplies the other side (known level, held-out tasks, human marks).
  const external = [
    ['Placement accuracy', getPlacementValidationMetrics()],
    ['Progression transfer', getProgressionValidationMetrics()],
    ['AI vs human marking', getCorpusMetrics()],
    ['Listening vs humans', getComprehensionValidationMetrics('listening')],
    ['Reading vs humans', getComprehensionValidationMetrics('reading')],
    ['Pronunciation vs humans', benchmarkStatus(mergeBenchmarkItems(getIntelligibilityBenchmark()))],
    ['Assistance fading', getAssistanceMetrics()],
  ];
  // Roadmap evidence chips: current n vs documented floor, per track. The
  // full table (incl. examiner/real-exam/fsrs) lives at /validation-status.json.
  const evidenceTrack = {
    'Placement accuracy': 'placement',
    'Progression transfer': 'progression',
    'AI vs human marking': 'corpus',
    'Listening vs humans': 'comprehension',
    'Reading vs humans': 'comprehension',
    'Pronunciation vs humans': 'pronunciation',
    'Assistance fading': 'assistance',
  };
  const chip = (track) => `${track} ${evidenceTrack[track] ? `${external.find(([n]) => n === track)?.[1]?.n ?? 0}/${EVIDENCE_FLOORS[evidenceTrack[track]]}` : `0/${EVIDENCE_FLOORS[track]}`}`;
  const roadmapChips = Object.keys(EVIDENCE_FLOORS).map(chip).join(' · ');
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Learner validation</h3>
      <p className="text-xs text-ink2">Retention prediction: {retention.accuracy==null ? '—' : `${Math.round(retention.accuracy*100)}%`} (n={retention.n}) · Speaking slope: {speaking.slope==null ? '—' : `${speaking.slope}/day`}</p>
      <p className="text-[11px] text-ink3">Predicted vs actual recall on due cards; slope from recent speaking scores.</p>
      <div className="border-t border-line pt-2 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">External validation</p>
        {external.map(([name, m]) => (
          <div key={name} className="flex items-baseline gap-2">
            <span className="w-36 shrink-0 text-xs text-ink">{name}</span>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              m.status === 'validated' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : m.status === 'provisional' ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-line bg-surface2 text-ink3'
            }`}>{m.label || m.status}</span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink3" title={m.message}>{m.message}</span>
          </div>
        ))}
        <p className="pt-1 text-[10px] leading-relaxed text-ink3" data-testid="evidence-roadmap">
          <span className="font-bold uppercase tracking-wider">Roadmap floors:</span> {roadmapChips}
          {' · '}full table: <span className="underline">/validation-status.json</span>
        </p>
      </div>
    </section>
  );
}
export function ErrorNotebookStats(){
  const st = (()=>{ try{ return errorNotebookStats(); }catch{ return { total:0, pending:0, recurrences:0 }; } })();
  if(!st.total) return null;
  return (
    <section className="bg-surface border border-line rounded-2xl p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Error notebook</h3>
      <p className="text-xs text-ink2">{st.total} corrections · {st.pending} pending retype · {st.recurrences} recurrences</p>
    </section>
  );
}

export function LearnerErrorModel({ entries, summary }) {
  const labels = { grammar: 'Grammar', vocabulary: 'Vocabulary', listening: 'Listening', pronunciation: 'Pronunciation' };
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Persistent learner error model</h3>
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          {Object.entries(labels).map(([key, label]) => (
            <div key={key}>
              <p className="text-base font-bold text-ink tabular-nums">{summary.byCategory[key].entries}</p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-ink3">{label}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink3">{summary.active} active · {summary.recovering} recovering · {summary.resolved} resolved · {summary.recurrences} recurrences. Gaps persist across the mode where they first appeared.</p>
        {entries.length > 0 && (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <span className="shrink-0 px-1.5 py-0.5 rounded border border-line bg-surface2 text-[9px] font-bold uppercase tracking-wider text-ink3">{entry.category}</span>
                <span className="flex-1 min-w-0 text-xs text-ink truncate">{entry.label}</span>
                <span className="shrink-0 text-[10px] text-ink3 tabular-nums">{entry.errorCount}×</span>
              </div>
            ))}
          </div>
        )}
        {!entries.length && <p className="text-xs text-ink3">No persistent gaps yet. Every low-scoring drill will feed this model.</p>}
      </div>
    </section>
  );
}

export function SessionHistory({ sessions }) {
  const recent = sessions.slice().reverse().slice(0, 8);
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Full session history</h3>
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
        <p className="text-xs text-ink2">{sessions.length} completed session{sessions.length === 1 ? '' : 's'} stored locally. New sessions are no longer limited to the old last-10 window.</p>
        {recent.length > 0 && (
          <div className="space-y-2">
            {recent.map((session) => {
              const score = session.report?.average_scores?.overall;
              return (
                <div key={session.id} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-ink3 tabular-nums">{session.date ? new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
                  <span className="flex-1 min-w-0 truncate text-ink">{session.scenarioId || 'Conversation'}</span>
                  <span className="shrink-0 text-ink3 tabular-nums">{score == null ? '—' : `${score}%`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// Says how far the exam marks have actually been checked against a human
// examiner. With no marked attempts on file that is "not at all", and saying
// so is the entire point of the panel — a confident-looking agreement figure
// computed from nothing is worse than no panel.
export function ExamBenchmark(){
  const b = benchmarkExaminer(getExaminerScripts());
  const results = validateAgainstResults(getRealExamResults());
  return (
    <section className="bg-surface border border-line rounded-2xl p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Examiner benchmark</h3>
      <p className="text-sm font-semibold mt-1">{b.label}</p>
      <p className="text-xs text-ink2 mt-1">{b.message}</p>
      {b.n > 0 && (
        <p className="text-xs text-ink2 mt-1">
          Within 5pp: {Math.round(b.agreement * 100)}% · MAE {b.meanAbsoluteError}pp
          {b.kappa == null ? '' : ` · κ ${b.kappa}`} (n={b.n})
        </p>
      )}
      {results.n > 0 && <p className="text-xs text-ink2 mt-1">Real results: {results.message}</p>}
    </section>
  );
}
// Which grammar areas trip you up in real conversation — counted from the
// Arena's per-turn mistake classification.
export function ErrorCategories() {
  const errors = Object.entries(getGrammarErrors()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!errors.length) return null;
  const max = errors[0][1];
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Errors by grammar area</h3>
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-2.5">
        {errors.map(([topicId, count]) => {
          const topic = getGrammarTopic(topicId);
          return (
            <div key={topicId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs text-ink truncate" lang="fr">{topic ? topic.title : topicId}</span>
              <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                <div className="h-full bg-ink rounded-full" style={{ width: `${(count / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right text-[11px] text-ink3 tabular-nums">{count}</span>
            </div>
          );
        })}
        <p className="text-[11px] text-ink3">Counted every time the Arena classifies a conversation mistake.</p>
      </div>
    </section>
  );
}
