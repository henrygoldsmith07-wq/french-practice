import { useMemo, useState } from 'react';
import {
  selectImportantErrors, comparisonView, buildRepairTasks, repairSummary, groupErrorsByCategory,
} from '../lib/writingRepair';
import { Check } from './icons';

// The active repair step after writing feedback. The rule the product
// promises: at most three errors worth learning from, each shown as
// Your version / Improved version / Why — and the learner TYPES the fix
// themselves, then rewrites their piece. The AI never rewrites it for them.

export default function WritingRepairLoop({ corrections = [], onRepaired, onRecorded }) {
  const [repairedIds, setRepairedIds] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [rewrite, setRewrite] = useState('');
  const [rewriteDone, setRewriteDone] = useState(false);

  const selected = useMemo(() => selectImportantErrors(corrections, { max: 3 }), [corrections]);
  const tasks = useMemo(() => buildRepairTasks(selected), [selected]);
  const groups = useMemo(() => groupErrorsByCategory(corrections), [corrections]);

  if (!tasks.length) return null;

  const checkRepair = (task) => {
    const typed = String(drafts[task.id] || '').trim();
    if (!typed) return;
    const normalise = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const ok = task.accept.some((a) => normalise(a) === normalise(typed));
    if (ok && !repairedIds.includes(task.id)) {
      const next = [...repairedIds, task.id];
      setRepairedIds(next);
      // Record through the app's real paths so the repaired sentence returns
      // later in a different task (the error notebook schedules retypes).
      onRecorded?.({ task, typed });
      if (next.length === tasks.length) onRepaired?.(next);
    }
    return ok;
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-4" aria-label="Repair the important ones">
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Fix these three</h4>
        <p className="text-xs text-ink2 mt-1">
          {groups.length > 1
            ? `${groups.map((g) => `${g.count} ${g.label.toLowerCase()}`).join(' · ')} — the ones below are worth your time.`
            : 'The corrections below are worth your time — fix them yourself so they stick.'}
        </p>
      </div>

      <ol className="space-y-3">
        {tasks.map((task, i) => {
          const view = comparisonView(task.original, task.improved, task.why);
          const done = repairedIds.includes(task.id);
          return (
            <li key={task.id} className="rounded-xl border border-line bg-surface2 p-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ink text-bg uppercase">{i + 1}</span>
                <span className="text-[10px] uppercase tracking-wider text-ink3">{task.category}</span>
                {done && <span className="text-[10px] font-semibold text-success">Repaired</span>}
              </div>
              <div className="space-y-1">
                <p className="text-sm"><span className="text-[10px] uppercase tracking-wider text-ink3 block">Your version</span><span className="text-ink2 line-through" lang="fr">{view.yourVersion}</span></p>
                <p className="text-sm"><span className="text-[10px] uppercase tracking-wider text-ink3 block">Improved version</span><span className="font-semibold text-ink" lang="fr">{view.improvedVersion}</span></p>
                <p className="text-xs"><span className="text-[10px] uppercase tracking-wider text-ink3 block">Why</span><span className="text-ink2">{view.why}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex-1">
                  <span className="sr-only">Type the corrected sentence</span>
                  <input
                    value={drafts[task.id] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
                    placeholder={task.repairPrompt}
                    lang="fr"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => checkRepair(task)}
                  disabled={!String(drafts[task.id] || '').trim()}
                  className="inline-flex items-center gap-1 bg-ink text-bg font-semibold rounded-lg px-3 py-2 text-xs disabled:opacity-40"
                >
                  <Check size={12} /> Check
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Now rewrite it</h4>
        <p className="text-xs text-ink2">{tasks[0].rewriteInstruction} Your own words — this is the part that makes it stick.</p>
        <label className="block">
          <span className="sr-only">Your rewritten version</span>
          <textarea
            value={rewrite}
            onChange={(e) => { setRewrite(e.target.value); setRewriteDone(false); }}
            rows={3}
            lang="fr"
            placeholder="Rewrite your piece with the fixes in place…"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <button
          type="button"
          onClick={() => { setRewriteDone(true); onRepaired?.(repairedIds, rewrite); }}
          disabled={rewrite.trim().length < 10}
          className="btn btn-secondary w-full min-h-10 rounded-xl text-xs"
        >
          Save my rewrite
        </button>
        {rewriteDone && <p className="text-xs text-success">{repairSummary(repairedIds)}</p>}
      </div>
    </section>
  );
}
