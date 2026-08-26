import { useMemo, useState } from 'react';
import {
  LANGUAGE_STAGES,
  STAGE_COUNT,
  buildLanguageMap,
  nextLanguageStep,
} from '../lib/languageModel';
import {
  getGrammarErrors,
  getGrammarProgress,
  getLanguageModelProgress,
  recordLanguageEvidence,
} from '../lib/storage';
import { Book, Check, ChevronRight, Layers, MessageCircle, Mic, Target } from './icons';

const FILTERS = [
  ['all', 'All structures'],
  ['in-motion', 'In motion'],
  ['attention', 'Needs attention'],
  ['spontaneous', 'Spontaneous'],
];

const STATUS_STYLE = {
  'Not started': 'bg-surface2 text-ink3 border-line',
  Recognise: 'bg-surface2 text-ink2 border-line',
  Prompted: 'bg-reviewsoft text-review border-review/30',
  Delayed: 'bg-speaksoft text-speak border-speak/30',
  'New context': 'bg-speaksoft text-speak border-speak/30',
  Spontaneous: 'bg-successsoft text-success border-success/30',
  Unstable: 'bg-dangersoft text-danger border-danger/30',
};

export default function LivingLanguage({ onOpenGrammar, onOpenSpeaking }) {
  const [filter, setFilter] = useState('all');
  const [tick, setTick] = useState(0);

  const structures = useMemo(() => buildLanguageMap({
    progress: getLanguageModelProgress(),
    grammarProgress: getGrammarProgress(),
    grammarErrors: getGrammarErrors(),
  }), [tick]);

  const counts = useMemo(() => ({
    spontaneous: structures.filter((entry) => entry.stage >= STAGE_COUNT).length,
    inMotion: structures.filter((entry) => entry.stage > 0 && entry.stage < STAGE_COUNT).length,
    attention: structures.filter((entry) => entry.unstable || entry.stage === 0).length,
  }), [structures]);

  const nextMove = useMemo(
    () => structures.find((entry) => entry.unstable) || structures.find((entry) => entry.stage < STAGE_COUNT) || structures[0],
    [structures],
  );

  const visible = structures.filter((entry) => {
    if (filter === 'in-motion') return entry.stage > 0 && entry.stage < STAGE_COUNT;
    if (filter === 'attention') return entry.unstable || entry.stage === 0;
    if (filter === 'spontaneous') return entry.stage >= STAGE_COUNT;
    return true;
  });

  const logNextStep = (entry) => {
    const step = nextLanguageStep(entry);
    recordLanguageEvidence(entry.id, {
      stage: step.stage,
      context: step.context,
      source: 'language-map',
    });
    setTick((value) => value + 1);
    if (step.stage >= STAGE_COUNT) onOpenSpeaking?.();
  };

  const logSlip = (entry) => {
    recordLanguageEvidence(entry.id, {
      outcome: 'slip',
      context: entry.nextContext,
      source: 'language-map',
    });
    setTick((value) => value + 1);
  };

  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[900px] mx-auto space-y-4">
        <header className="text-center space-y-1">
          <Layers className="w-7 h-7 mx-auto text-ink2" />
          <h2 className="text-xl font-bold">Living language</h2>
          <p className="text-sm text-ink2 max-w-2xl mx-auto">
            A CEFR score tells you what you studied. This map shows what you can actually reach for in a conversation.
          </p>
        </header>

        <section className="bg-surface border border-line rounded-2xl p-5 grid gap-5 lg:grid-cols-[1fr_auto] items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink3">
              <Target size={14} /> Usable French
            </div>
            <div>
              <h3 className="text-2xl font-bold tracking-tight">Make the next step smaller than “mastery”.</h3>
              <p className="text-sm text-ink2 mt-1.5 max-w-xl">
                Structures move one rung at a time: recognise → produce deliberately → retrieve later → change context → speak without reaching for help.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Metric value={counts.spontaneous} label="spontaneous" tone="success" />
              <Metric value={counts.inMotion} label="in motion" tone="speak" />
              <Metric value={counts.attention} label="need attention" tone="review" />
            </div>
          </div>
          <div className="w-full lg:w-64 space-y-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-ink">Spontaneous coverage</span>
              <span className="tabular-nums text-ink2">{counts.spontaneous}/{structures.length}</span>
            </div>
            <div className="h-2 rounded-full bg-surface2 overflow-hidden" aria-label={`${counts.spontaneous} of ${structures.length} structures spontaneous`}>
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(counts.spontaneous / Math.max(1, structures.length)) * 100}%` }} />
            </div>
            <p className="text-[11px] text-ink3">Only the last rung counts as spontaneous.</p>
          </div>
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby="transfer-ladder-title">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 id="transfer-ladder-title" className="text-[11px] font-bold uppercase tracking-wider text-ink2">The transfer ladder</h3>
              <p className="text-xs text-ink3 mt-1">A correct answer is a beginning, not a finish line.</p>
            </div>
            <span className="hidden sm:inline text-[11px] text-ink3">Evidence fades unless you reuse it.</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5" role="list" aria-label="Language transfer stages">
            {LANGUAGE_STAGES.map((stage, index) => (
              <div key={stage.id} role="listitem" className="min-w-0 text-center space-y-1.5">
                <div className="flex items-center">
                  <span className="w-5 h-5 mx-auto grid place-items-center rounded-full border border-line bg-surface2 text-[10px] font-bold text-ink3">{index + 1}</span>
                </div>
                <p className="text-[10px] sm:text-[11px] font-semibold text-ink leading-tight">{stage.shortLabel}</p>
              </div>
            ))}
          </div>
        </section>

        {nextMove && (
          <section className="bg-ink text-onaccent rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3" aria-labelledby="next-move-title">
            <span className="w-10 h-10 shrink-0 grid place-items-center rounded-xl bg-onaccent/10"><MessageCircle size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">Your next useful move</p>
              <h3 id="next-move-title" className="font-bold text-base" lang="fr">{nextMove.title}</h3>
              <p className="text-xs opacity-75 mt-0.5">
                {nextMove.unstable ? 'It is showing signs of instability. Rebuild it once, then retest it later.' : `${nextMove.nextStageMeta?.label || 'Keep using it'}${nextMove.nextContext ? ` · try it in ${nextMove.nextContext}` : ''}.`}
              </p>
            </div>
            <button onClick={() => logNextStep(nextMove)} className="btn bg-onaccent text-ink min-h-10 px-3.5 rounded-xl text-xs shrink-0 hover:opacity-90">
              {nextMove.unstable ? 'Rebuild once' : nextMove.nextStageMeta?.cta || 'Log use'} <ChevronRight size={13} />
            </button>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink2">Your structures</h3>
            <p className="text-xs text-ink3 mt-1">Progress from quizzes is capped at deliberate production; transfer is earned here.</p>
          </div>
          <div className="flex gap-1.5 overflow-x-auto snap-rail" role="tablist" aria-label="Filter structures">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${filter === id ? 'bg-accent text-onaccent border-accent' : 'bg-surface text-ink2 border-line hover:border-ink3'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((entry) => (
            <StructureCard
              key={entry.id}
              entry={entry}
              onLog={() => logNextStep(entry)}
              onSlip={() => logSlip(entry)}
              onOpenGrammar={() => onOpenGrammar?.(entry.topicId)}
            />
          ))}
        </div>

        <section className="bg-surface border border-line rounded-2xl p-4 flex gap-3 items-start">
          <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-surface2 text-ink"><Mic size={15} /></span>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">What “spontaneous” means here</h3>
            <p className="text-xs text-ink2 leading-relaxed">
              It is not a permanent badge. A structure stays usable when you keep meeting it after time has passed, across more than one situation. A slip makes it <strong className="text-ink">Unstable</strong> without erasing the work you have already done.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function StructureCard({ entry, onLog, onSlip, onOpenGrammar }) {
  const statusClass = STATUS_STYLE[entry.status] || STATUS_STYLE['Not started'];
  const lastEvidence = entry.lastAt ? `Last evidence ${relativeDate(entry.lastAt)}` : 'No transfer evidence yet';

  return (
    <article className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 grid place-items-center rounded-xl bg-surface2 text-ink"><Book size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink" lang="fr">{entry.title}</h3>
            <span className="px-1.5 py-0.5 rounded-md border border-line text-[10px] font-semibold text-ink3">{entry.cefr}</span>
          </div>
          <p className="text-xs text-ink3 mt-0.5">{entry.summary}</p>
        </div>
        <span className={`shrink-0 px-2 py-1 rounded-full border text-[10px] font-bold ${statusClass}`}>{entry.status}</span>
      </div>

      <div className="rounded-xl bg-surface2 px-3 py-2.5">
        <p className="text-sm text-ink" lang="fr">{entry.example}</p>
        <p className="text-[11px] text-ink3 italic mt-0.5">{entry.translation}</p>
      </div>

      <div className="grid grid-cols-5 gap-1.5" aria-label={`${entry.stage} of ${STAGE_COUNT} transfer stages complete`}>
        {LANGUAGE_STAGES.map((stage, index) => {
          const complete = index < entry.stage;
          const current = index === entry.stage && entry.stage < STAGE_COUNT;
          return (
            <div key={stage.id} className="space-y-1">
              <div className={`h-1.5 rounded-full ${complete ? 'bg-success' : current ? 'bg-ink' : 'bg-line'}`} />
              <p className={`text-[9px] leading-tight ${complete || current ? 'text-ink2' : 'text-ink3'}`}>{stage.shortLabel}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-ink3">
        <span>{lastEvidence}{entry.errorCount > 0 ? ` · ${entry.errorCount} grammar slip${entry.errorCount === 1 ? '' : 's'}` : ''}</span>
        {entry.lastContext && <span className="truncate max-w-[38%]">last: {entry.lastContext}</span>}
      </div>

      <div className="border-t border-line pt-3 flex flex-wrap items-center gap-2">
        <button onClick={onLog} className="btn btn-primary min-h-10 px-3.5 rounded-xl text-xs">
          {entry.nextStageMeta?.cta || 'Log spontaneous use'} <ChevronRight size={13} />
        </button>
        <button onClick={onOpenGrammar} className="btn btn-secondary min-h-10 px-3 rounded-xl text-xs">Review lesson</button>
        {entry.stage > 0 && (
          <button onClick={onSlip} className="text-[11px] font-semibold text-ink3 underline underline-offset-2 hover:text-danger">I slipped</button>
        )}
      </div>
      {entry.nextContext && entry.stage < STAGE_COUNT && (
        <p className="text-[11px] text-ink2"><span className="font-semibold">Next context:</span> {entry.nextContext}</p>
      )}
    </article>
  );
}

function Metric({ value, label, tone }) {
  const toneClass = tone === 'success' ? 'bg-successsoft text-success border-success/30' : tone === 'speak' ? 'bg-speaksoft text-speak border-speak/30' : 'bg-reviewsoft text-review border-review/30';
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${toneClass}`}><strong className="tabular-nums">{value}</strong> {label}</span>;
}

function relativeDate(value) {
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
