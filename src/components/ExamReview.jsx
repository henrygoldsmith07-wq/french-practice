import { useState } from 'react';
import { recordExaminerMark, recordRealExamResult, recordSkillScore } from '../lib/storage';
import { gradeEstimate, examFeedback, benchmarkExaminer, validateAgainstResults } from '../lib/exams/simulator.js';
import { GraduationCap } from './icons';

// Exam review stage, split out of ExamSimulator.jsx: per-criterion sliders,
// examiner benchmark status and real-results validation. Pure UI over the
// finished run; scoring itself lives in the domain layer (lib/exams).

// ----------------------------------------------------------------- review ---

export function Review({ run, scores, setScores, onRestart, onXp, onActivity }) {
  const [awarded, setAwarded] = useState(false);
  const [examinerPercent, setExaminerPercent] = useState('');
  const [examinerGrade, setExaminerGrade] = useState('');
  const [actualGrade, setActualGrade] = useState('');
  const [validationMessage, setValidationMessage] = useState(null);

  const taskScores = run.paper.sections.map((s) => scoreTask({
    boardId: run.paper.boardId,
    taskId: s.taskId,
    tier: run.paper.tier || TIER.HIGHER,
    scores: scores[s.taskId] || {},
    outOf: s.marks,
    automaticScore: run.transcripts.find((t) => t.taskId === s.taskId)?.responseData?.objectiveScore,
  }));
  const paperScore = scorePaper({ boardId: run.paper.boardId, tier: run.paper.tier, taskScores });
  const grade = gradeEstimate(paperScore.percent, {
    boundaries: run.paper.boundaries,
    boundarySource: run.paper.boundarySource,
    board: run.paper.boardName,
  });
  const technique = scoreExamTechnique(run);
  const notes = examFeedback(run, paperScore);
  const benchmark = benchmarkExaminer(getExaminerScripts());
  const realResults = validateAgainstResults(getRealExamResults());
  const examMode = run.paper.examMode || EXAM_MODE.SPEAKING;

  const setCriterion = (taskId, criterion, value) => {
    setScores((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] || {}), [criterion]: value } }));
  };

  const finish = () => {
    if (paperScore.percent !== null) {
      recordSkillScore(examMode, paperScore.percent, {
        boardId: run.paper.boardId,
        techniqueScore: technique.score,
        examMode,
      });
      onActivity?.({ type: examMode, boardId: run.paper.boardId, score: paperScore.percent, techniqueScore: technique.score, mode: 'exam', label: `${run.paper.boardName} ${EXAM_MODES[examMode].label}` });
      onXp?.(30);
    }
    setAwarded(true);
  };

  const saveValidation = () => {
    const percent = Number(examinerPercent);
    if (!Number.isFinite(percent)) return;
    recordExaminerMark({
      boardId: run.paper.boardId,
      examMode,
      appPercent: paperScore.percent,
      examinerPercent: percent,
      appGrade: grade.grade,
      examinerGrade: examinerGrade || null,
      outOf: paperScore.outOf,
    });
    if (grade.grade && actualGrade) {
      recordRealExamResult({ boardId: run.paper.boardId, predictedGrade: grade.grade, actualGrade, percent: paperScore.percent });
    }
    setExaminerPercent('');
    setExaminerGrade('');
    setActualGrade('');
    setValidationMessage('Saved locally. It will count as provisional until there are enough real marked attempts.');
  };

  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[820px] mx-auto space-y-4">
        <h2 className="text-xl font-bold">{EXAM_MODES[examMode].label} marking</h2>
        <p className="text-sm text-ink2">
          Score language level against the plain-English criteria. Exam technique is shown separately and never folded into the language mark.
        </p>

        {run.paper.sections.map((s, i) => {
          const t = run.transcripts[i];
          return (
            <section key={s.taskId} className="bg-surface border border-line rounded-2xl p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-bold">{s.label}</h3>
                <span className="text-xs text-ink2">
                  {examMode === EXAM_MODE.SPEAKING ? `${fmt(t?.spokenSeconds || 0)} spoken` : `${fmt(t?.spentSeconds || 0)} used`} of {fmt(s.seconds)}
                  {examMode === EXAM_MODE.SPEAKING && t?.shortfall > 20 && <span className="text-amber-600 font-semibold"> · {fmt(t.shortfall)} short</span>}
                </span>
              </div>
              {displayTranscript(t) && (
                <p className="text-sm bg-surface2 border border-line rounded-xl p-3 whitespace-pre-wrap">{displayTranscript(t)}</p>
              )}
              {(s.criteria || TASK_CRITERIA[s.taskId] || []).map((c) => (
                <CriterionSlider
                  key={c}
                  criterion={CRITERIA[c]}
                  value={scores[s.taskId]?.[c]}
                  onChange={(v) => setCriterion(s.taskId, c, v)}
                />
              ))}
              {t?.responseData?.objectiveScore != null && <p className="text-xs text-ink2">Automatic comprehension check: {t.responseData.objectiveScore}% — review the answers above before relying on it.</p>}
            </section>
          );
        })}

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Result</h3>
          <p className="text-2xl font-bold">
            {paperScore.percent === null ? '—' : `${paperScore.marks} / ${paperScore.outOf}`}
            {paperScore.percent !== null && <span className="text-base text-ink2 font-semibold ml-2">({paperScore.percent}%)</span>}
          </p>
          {grade.grade && <p className="text-lg font-bold">Estimated grade: {grade.grade}</p>}
          {grade.indicativeBand && <p className="text-sm font-semibold">{grade.indicativeBand}</p>}
          <p className="text-xs text-ink2">{grade.note}</p>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Exam technique — separate score</h3>
            <span className="text-lg font-bold">{technique.score == null ? '—' : `${technique.score}/100`}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-ink2">
            {Object.entries(technique.components || {}).map(([key, value]) => <span key={key}>{key.replace(/([A-Z])/g, ' $1')}: <strong className="text-ink">{value}</strong></span>)}
          </div>
          <p className="text-xs text-ink2">{technique.note}</p>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Examiner validation</h3>
          <p className="text-xs text-ink2">Enter a real human mark for this attempt if a qualified teacher has checked it. These records stay on this device.</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input type="number" min="0" max="100" value={examinerPercent} onChange={(e) => setExaminerPercent(e.target.value)} placeholder="Examiner %" className="bg-bg border border-line rounded-xl px-3 py-2 text-sm" aria-label="Examiner percentage" />
            <input value={examinerGrade} onChange={(e) => setExaminerGrade(e.target.value)} placeholder="Examiner grade (optional)" className="bg-bg border border-line rounded-xl px-3 py-2 text-sm" aria-label="Examiner grade" />
            <input value={actualGrade} onChange={(e) => setActualGrade(e.target.value)} placeholder={grade.grade ? 'Actual result (optional)' : 'Import boundaries first'} className="bg-bg border border-line rounded-xl px-3 py-2 text-sm" aria-label="Actual exam grade" disabled={!grade.grade} />
          </div>
          <button onClick={saveValidation} disabled={!examinerPercent || paperScore.percent === null} className="w-full border border-line rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40">Save human check</button>
          <p className="text-xs text-ink2">{benchmark.label}: {benchmark.message}</p>
          {realResults.n > 0 && <p className="text-xs text-ink2">Real results: {realResults.message}</p>}
          {validationMessage && <p className="text-xs text-emerald-600">{validationMessage}</p>}
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">What to fix</h3>
          {notes.map((n, i) => (
            <p key={i} className="text-sm">{n.text}</p>
          ))}
        </section>

        <div className="flex gap-2">
          {!awarded && paperScore.percent !== null && (
            <button onClick={finish} className="flex-1 bg-ink text-bg font-bold rounded-[14px] px-5 py-3 text-sm">
              <Check className="w-4 h-4 inline mr-1" />Log this attempt
            </button>
          )}
          <button onClick={onRestart} className="flex-1 border border-line rounded-[14px] px-5 py-3 text-sm font-bold hover:border-ink2 transition">
            Sit another paper
          </button>
        </div>
      </div>
    </div>
  );
}

function displayTranscript(transcript) {
  if (!transcript) return '';
  if (transcript.responseData?.answers && transcript.transcript) return transcript.transcript;
  return transcript.transcript || '';
}

function CriterionSlider({ criterion, value, onChange }) {
  if (!criterion) return null;
  const current = value ?? '';
  const band = value === undefined ? null : criterion.bands.slice().reverse().find((b) => value >= b.min);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{criterion.label}</span>
        <span className="text-xs text-ink2">{value === undefined ? 'not scored' : `${value}%`}</span>
      </div>
      <p className="text-[11px] text-ink2">{criterion.blurb}</p>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={current === '' ? 50 : current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        aria-label={`${criterion.label} score`}
      />
      {band && <p className="text-xs"><strong>{band.label}</strong> — {band.desc}</p>}
    </div>
  );
}
