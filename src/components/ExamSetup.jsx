import { useRef, useState } from 'react';
import {
  getExaminerScripts, saveExamBoundarySet,
} from '../lib/storage';
import {
  EXAM_MODES, TIER, timingQa,
} from '../lib/exams/boards.js';
import { benchmarkExaminer } from '../lib/exams/simulator.js';
import { parseBoundaryImport } from '../lib/exams/boundaries.js';
import { GraduationCap, ChevronRight } from './icons';

// Exam setup stage, split out of ExamSimulator.jsx: board/tier/theme/mode
// pickers and the boundary import. Pure UI over props from the controller.

// ------------------------------------------------------------------ setup ---

export function Setup({
  board, boardId, setBoardId, tier, setTier, theme, setTheme, themes, mode, setMode,
  examMode, setExamMode, boundarySets, boundarySetId, setBoundarySetId, onBoundarySaved, onStart, error,
}) {
  const bench = benchmarkExaminer(getExaminerScripts());
  const qa = timingQa(boardId);
  const matchingBoundaries = boundarySets.filter((set) => (!set.boardId || set.boardId === boardId) && (!set.tier || set.tier === tier));
  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[820px] mx-auto space-y-5">
        <header className="text-center space-y-1">
          <GraduationCap className="w-7 h-7 mx-auto text-ink2" />
          <h2 className="text-xl font-bold">Exam simulator</h2>
          <p className="text-sm text-ink2">{EXAM_MODES[examMode].description}</p>
        </header>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <Field label="Board">
            <div className="grid grid-cols-2 gap-2">
              {boardList().map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setBoardId(b.id); if (!b.tiers.length) setTier(TIER.HIGHER); }}
                  className={`text-left rounded-xl border px-3 py-2 text-sm transition ${boardId === b.id || (BOARDS[boardId]?.aliasFor === b.id) ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink2'}`}
                >
                  <span className="block font-medium">{b.name}</span>
                  {b.badge && <span className="block text-[10px] opacity-70">{b.badge}</span>}
                  <span className={`text-[11px] ${boardId === b.id ? 'opacity-80' : 'text-ink2'}`}>{b.qualification} · {b.country}</span>
                </button>
              ))}
            </div>
          </Field>

          {board.tiers.length > 0 && (
            <Field label="Tier">
              <Segmented
                options={board.tiers.map((t) => ({ id: t, label: t === TIER.FOUNDATION ? 'Foundation' : 'Higher' }))}
                value={tier}
                onChange={setTier}
              />
            </Field>
          )}

          <Field label="Exam format">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.values(EXAM_MODES).map((format) => (
                <button
                  key={format.id}
                  onClick={() => setExamMode(format.id)}
                  className={`text-left rounded-xl border px-3 py-2 text-sm transition ${examMode === format.id ? 'border-ink bg-ink text-bg' : 'border-line hover:border-ink2'}`}
                >
                  <span className="font-semibold block">{format.label}</span>
                  <span className={`text-[11px] ${examMode === format.id ? 'opacity-80' : 'text-ink2'}`}>{format.id === EXAM_MODE.SPEAKING ? 'Oral' : 'Written paper'}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Mode">
            <Segmented
              options={[
                { id: 'full', label: 'Full paper' },
                { id: 'single', label: 'One task' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Field>

          <Field label="Theme (optional)">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full bg-bg border border-line rounded-xl px-3 py-2 text-sm"
            >
              <option value="">Any theme (as in the real exam)</option>
              {themes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">This paper</h3>
          {examMode === EXAM_MODE.SPEAKING ? (
            <ul className="mt-2 space-y-1.5">
              {board.tasks.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-ink2 text-xs text-right">{t.blurb}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-semibold">One original {EXAM_MODES[examMode].label.toLowerCase()} paper selected for {board.name}.</p>
              <p className="text-xs text-ink2">The prompt bank is tagged by board style. The task is original practice material, not a live or copied paper.</p>
            </div>
          )}
          <p className="text-xs text-ink2 mt-3">Supervised preparation: {fmt(examMode === EXAM_MODE.SPEAKING ? board.prepTotal : 300)}.</p>
        </section>

        <BoundaryImport
          boardId={boardId}
          tier={tier}
          sets={matchingBoundaries}
          selectedId={boundarySetId}
          onSelect={setBoundarySetId}
          onSaved={onBoundarySaved}
        />

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Timing QA</h3>
            <span className={`text-xs font-bold ${qa.ok ? 'text-emerald-600' : 'text-amber-600'}`}>{qa.ok ? 'PASS' : 'CHECK'}</span>
          </div>
          <p className="text-xs text-ink2">{qa.checks} internal timing and mark checks were run for this board. This does not replace the board’s current specification.</p>
          {!qa.ok && qa.issues.map((issue) => <p key={issue} className="text-xs text-amber-600">{issue}</p>)}
        </section>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button onClick={onStart} className="w-full bg-ink text-bg font-bold rounded-[14px] px-5 py-3 text-sm hover:opacity-90 transition">
          Start under exam conditions
        </button>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Before you rely on this</h3>
          <p className="text-xs text-ink2">{specCaveat(boardId)}</p>
          <p className="text-xs text-ink2">
            Marks here are practice feedback, not a predicted grade. {bench.message}
          </p>
        </section>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-bold uppercase tracking-wider text-ink2">{label}</span>
    {children}
  </label>
);

function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-line overflow-hidden">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-4 py-2 text-sm font-semibold transition ${value === o.id ? 'bg-ink text-bg' : 'hover:bg-surface2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BoundaryImport({ boardId, tier, sets, selectedId, onSelect, onSaved }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const importBoundaries = () => {
    try {
      const parsed = parseBoundaryImport(raw, { boardId, tier, sourceUrl });
      parsed.sets.forEach((set) => onSaved(saveExamBoundarySet(set)));
      setSaved(true);
      setError(null);
      setRaw('');
    } catch (e) {
      setSaved(false);
      setError(e.message);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Grade boundaries</h3>
          {/* Made for Wales: no published boundaries exist before the first
              awarding (Summer 2027) — say so instead of implying estimates. */}
          {boardId === 'wjec-gcse-3830' && (
            <p className="mt-1 text-[11px] text-ink2">
              3830QS has no published grade boundaries until its first awarding (Summer 2027) — the simulator shows an indicative band only.
            </p>
          )}
        </div>
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Real grade boundaries</h3>
          <p className="text-xs text-ink2 mt-1">Paste a teacher-checked CSV, TSV or JSON table. Nothing is bundled as official.</p>
        </div>
        <button onClick={() => setOpen((value) => !value)} className="text-xs font-semibold underline text-ink2 hover:text-ink">
          {open ? 'Close' : 'Import'}
        </button>
      </div>

      {sets.length > 0 && (
        <select value={selectedId} onChange={(e) => onSelect(e.target.value)} className="w-full bg-bg border border-line rounded-xl px-3 py-2 text-sm">
          <option value="">No boundary set — show percentage only</option>
          {sets.map((set) => <option key={set.id} value={set.id}>{set.series} · {set.source}</option>)}
        </select>
      )}

      {saved && <p className="text-xs text-emerald-600">Boundary set saved locally for this board and tier.</p>}

      {open && (
        <div className="space-y-2">
          <textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setSaved(false); }}
            rows={6}
            placeholder={'grade,minPercent,series\n9,85,June 2025\n8,76,June 2025\n7,68,June 2025'}
            className="w-full bg-bg border border-line rounded-xl px-3 py-2 text-xs font-mono"
            aria-label="Grade boundary import"
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="Source page or document (optional)"
            className="w-full bg-bg border border-line rounded-xl px-3 py-2 text-sm"
            aria-label="Grade boundary source"
          />
          <button onClick={importBoundaries} disabled={!raw.trim()} className="w-full bg-ink text-bg font-bold rounded-xl px-4 py-2 text-sm disabled:opacity-40">
            Import boundary set
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <p className="text-[11px] text-ink2">Accepted JSON includes <code>boundaries</code> as grade-to-percent values, or rows with <code>grade</code> plus <code>minPercent</code> (or <code>minMark</code> and <code>maxMark</code>).</p>
        </div>
      )}
    </section>
  );
}
