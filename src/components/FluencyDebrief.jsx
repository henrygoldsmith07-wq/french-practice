import { SpeakButton } from './ui';

// Fluency-mode debrief — shown with the session report after a no-interruption
// conversation. Only the 2–3 highest-value corrections surface here; the full
// transcript stays available in the report's own sections. Every correction
// has already been written into the mistake graph + notebook, so these retype
// and reappear in future review on the same schedule as Coach-mode mistakes.

const TYPE_LABEL = {
  grammar: 'Grammar', vocabulary: 'Vocabulary', tense: 'Tense',
  agreement: 'Agreement', 'word-order': 'Word order',
  pronunciation: 'Pronunciation', comprehension: 'Comprehension', fluency: 'Flow',
};

export default function FluencyDebrief({ review, pending }) {
  if (pending) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4 space-y-1.5" aria-live="polite" aria-busy="true">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Fluency debrief</h3>
        <p className="text-sm text-ink2">Listening back through your conversation…</p>
      </section>
    );
  }
  if (!review) return null;
  const { corrections = [], carriedWell = [], summary } = review;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Fluency debrief</h3>
        <span className="text-[10px] text-ink3">you spoke uninterrupted — these matter most</span>
      </div>
      {summary && <p className="text-sm text-ink leading-snug">{summary}</p>}
      {corrections.length === 0 ? (
        <p className="text-sm text-ink2">Nothing needed correcting — keep that streak going.</p>
      ) : (
        <ol className="space-y-3" aria-label="Top corrections">
          {corrections.map((c, i) => (
            <li key={i} className="rounded-xl bg-surface2 border border-line p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ink text-bg uppercase tracking-wide">{i + 1}</span>
                {c.topic && <span className="text-[10px] uppercase tracking-wider text-ink3">{TYPE_LABEL[c.type] || 'Grammar'}</span>}
                {c.recurrences > 1 && <span className="text-[10px] text-amber-700 font-semibold">×{c.recurrences} turns</span>}
              </div>
              <p className="text-sm">
                <span className="text-ink3 line-through mr-1.5" lang="fr">{c.original}</span>
                <span className="font-semibold text-ink" lang="fr">{c.correction}</span>
              </p>
              {c.why && <p className="text-xs text-ink2 leading-snug">{c.why}</p>}
              <SpeakButton text={c.correction} label="Listen" />
            </li>
          ))}
        </ol>
      )}
      {carriedWell.length > 0 && (
        <div className="pt-1 border-t border-line space-y-1">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-ink3">Carried it well</h4>
          <ul className="space-y-0.5">
            {carriedWell.map((p, i) => <li key={i} className="text-xs text-ink2 leading-snug">· {p}</li>)}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-ink3">
        These join your mistake graph — they'll come back as retypes and delayed review.
      </p>
    </section>
  );
}
