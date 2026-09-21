import { useEffect, useMemo, useState } from 'react';import { getErrorNotebook, markCorrectedByLearner,
} from '../lib/errorNotebook';
import { getLearnerErrors, recordLearnerSuccess } from '../lib/storage';
import { Pencil } from './icons';

// Retype queue for notebook corrections: the mistake was captured in the
// Arena; here the learner proves the fix by typing it. Accent-insensitive
// check (markCorrectedByLearner), XP on success, entry retires on pass.
//
// Lives in its own module (split out of Memory.jsx) so TodaySession — which
// is part of the entry chunk — can import it without dragging the Memory
// dashboard (and, through it, the whole lazy vocab library) into the first
// bundle.

export function NotebookRetype({ onXp, onCleared }) {
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState('');
  const [wrong, setWrong] = useState(false);
  const [rehearsed, setRehearsed] = useState(false);
  const pending = useMemo(() => {
    void tick; // refresh signal: re-scan the notebook after corrections
    return getErrorNotebook().filter((e) => {
      if (e.correctedByLearner) return false;
      // A rehearsed entry comes back for its DELAYED proof the next day —
      // typing it right after seeing the answer was exposure, not learning.
      return !e.rehearsedAt || Date.now() - e.rehearsedAt >= 86400000;
    });
  }, [tick]);
  useEffect(() => { if (!pending.length) onCleared?.(); }, [pending.length, onCleared]);
  if (!pending.length) return null;
  const entry = pending[0];

  const check = () => {
    if (!draft.trim()) return;
    const outcome = markCorrectedByLearner(entry.id, draft);
    if (!outcome) { setWrong(true); return; }
    setWrong(false);
    setDraft('');
    if (outcome === 'retired') {
      onXp(5);
      setRehearsed(false);
      setTick((t) => t + 1);
      // Close the loop on the learnerErrors side too: a typed-from-memory
      // correction is a clean pass for the matching grammar gap (if one is
      // being tracked). Its second clean pass resolves the entry — this
      // component never resolves a gap on its own.
      try {
        const gap = getLearnerErrors({ limit: 40 }).find((e) =>
          e.category === 'grammar'
          && (e.label === entry.original || e.label === entry.corrected
            || e.label.toLowerCase().includes(entry.original.toLowerCase())));
        if (gap) recordLearnerSuccess({ category: 'grammar', key: gap.key, mode: 'retype', score: 100, source: 'notebook-retype' });
      } catch { /* loop bookkeeping must never break the retype */ }
    } else {
      // Rehearsed: the delayed proof arrives tomorrow.
      onXp(2);
      setRehearsed(true);
      setTick((t) => t + 1);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Retype the correction</h3>
        <span className="text-[11px] text-ink3 tabular-nums">{pending.length} pending</span>
      </div>
      <p className="text-sm text-ink2">
        You wrote: <span className="line-through decoration-ink3" lang="fr">«{entry.original}»</span>
      </p>
      <p className="text-sm text-ink">
        Write it right: <span className="font-semibold" lang="fr">{entry.corrected}</span>
      </p>
      {entry.why && <p className="text-xs text-ink3">{entry.why}</p>}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setWrong(false); }}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          placeholder="Type the corrected sentence…"
          lang="fr"
          aria-label="Retype the corrected sentence"
          className={`flex-1 min-w-0 bg-surface2 border rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink3 focus:outline-none ${wrong ? 'border-red-400' : 'border-line focus:border-ink'}`}
        />
        <button onClick={check} disabled={!draft.trim()} className="btn btn-primary px-4 rounded-xl text-sm min-h-11 inline-flex items-center gap-1.5 disabled:opacity-40">
          <Pencil size={13} /> Check
        </button>
      </div>
      {wrong && <p className="text-xs text-red-500" role="status">Not quite — match the corrected sentence exactly (accents forgiven).</p>}
      {rehearsed && (
        <p className="text-xs text-ink2 bg-surface2 border border-line rounded-lg px-3 py-2" role="status">
          Rehearsed — that was exposure, not proof. This correction returns tomorrow for the delayed check; passing it is what retires it.
        </p>
      )}
    </section>
  );
}
