import { useEffect, useMemo, useState } from 'react';
import {
  FIELD_NOTE_CONTEXTS,
  FIELD_NOTE_STAGES,
  contextLabel,
  fieldNoteStage,
  fieldNoteStats,
  isFieldNoteDue,
  nextFieldNote,
} from '../lib/fieldNotes';
import {
  getFieldNotes,
  practiceFieldNote,
  removeFieldNote,
  saveFieldNote,
} from '../lib/storage';
import { ArrowRight, Bookmark, Check, Clock, Copy, Mic, Plus, Sparkles, Trash, X } from './icons';
import { SpeakButton } from './ui';

const EMPTY_FORM = { french: '', meaning: '', context: 'message', source: '' };
const FILTERS = [
  ['all', 'All notes'],
  ['due', 'Due now'],
  ['moving', 'In motion'],
  ['reused', 'Reused'],
];

/**
 * Field Notes is the app's “your life becomes the syllabus” loop. A learner
 * captures a line from a menu, message or film, then earns its way through
 * rehearsal, delayed recall and reuse. Every step is a self-report, so the UI
 * never turns a saved phrase into a false mastery claim.
 */
export default function FieldNotes({ onXp, onActivity, onOpenSpeaking }) {
  const [notes, setNotes] = useState(() => getFieldNotes());
  const [selectedId, setSelectedId] = useState(() => nextFieldNote(getFieldNotes())?.id || null);
  const [captureOpen, setCaptureOpen] = useState(() => getFieldNotes().length === 0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState('all');
  const [revealed, setRevealed] = useState(false);
  const [variant, setVariant] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => fieldNoteStats(notes), [notes]);
  const selected = notes.find((note) => note.id === selectedId) || nextFieldNote(notes);
  const selectedStage = fieldNoteStage(selected);

  useEffect(() => {
    if (!selected) {
      setSelectedId(null);
      return;
    }
    if (selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    setRevealed(selected?.stage === 0);
    setVariant('');
    setCopied(false);
  }, [selected?.id, selected?.stage]);

  const visible = useMemo(() => notes.filter((note) => {
    if (filter === 'due') return isFieldNoteDue(note);
    if (filter === 'moving') return note.stage > 0 && note.stage < FIELD_NOTE_STAGES.length - 1;
    if (filter === 'reused') return note.stage === FIELD_NOTE_STAGES.length - 1;
    return true;
  }), [filter, notes]);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const capture = (event) => {
    event.preventDefault();
    const result = saveFieldNote(form);
    if (!result.note) {
      setFeedback({ kind: 'error', text: 'Add the French line first — even a short one is enough.' });
      return;
    }
    setNotes(result.notes);
    setSelectedId(result.note.id);
    setForm(EMPTY_FORM);
    setCaptureOpen(false);
    if (result.duplicate) {
      setFeedback({ kind: 'neutral', text: 'That line is already here — picked up your existing note.' });
      return;
    }
    setFeedback({ kind: 'success', text: 'Captured. One spoken rep turns this moment into memory.' });
    onXp?.(3);
    onActivity?.({
      type: 'field-note',
      noteId: result.note.id,
      stage: result.note.stage,
      outcome: 'capture',
      context: result.note.context,
    });
  };

  const practise = (outcome = 'success') => {
    if (!selected) return;
    const previousStage = selected.stage;
    const mode = FIELD_NOTE_STAGES[Math.min(previousStage, FIELD_NOTE_STAGES.length - 1)].id;
    const updated = practiceFieldNote(selected.id, {
      outcome,
      mode,
      variant: previousStage >= 2 ? variant : '',
    });
    if (!updated) return;
    const nextNotes = getFieldNotes();
    setNotes(nextNotes);
    setCopied(false);
    setVariant('');
    onActivity?.({
      type: 'field-note',
      noteId: updated.id,
      stage: updated.stage,
      outcome,
      context: updated.context,
      score: outcome === 'success' ? 100 : 0,
    });
    if (outcome === 'slip') {
      setFeedback({ kind: 'neutral', text: `Kept at ${fieldNoteStage(updated).label.toLowerCase()} — it will wait for another pass.` });
      setRevealed(true);
      return;
    }
    const advanced = updated.stage > previousStage;
    setFeedback({
      kind: 'success',
      text: advanced
        ? `Nice. This note is now ${fieldNoteStage(updated).label.toLowerCase()}.`
        : 'Logged again — spaced reuse keeps the phrase alive.',
    });
    onXp?.(previousStage === FIELD_NOTE_STAGES.length - 2 ? 7 : previousStage === FIELD_NOTE_STAGES.length - 1 ? 2 : 3);
    const next = nextFieldNote(nextNotes);
    setSelectedId(next?.id || updated.id);
  };

  const copyPhrase = async () => {
    if (!selected?.french) return;
    try {
      await navigator.clipboard?.writeText(selected.french);
      setCopied(true);
      setFeedback({ kind: 'neutral', text: 'Copied — take the line back to the place you found it.' });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFeedback({ kind: 'error', text: 'Clipboard is unavailable here. Select the line to copy it.' });
    }
  };

  const deleteNote = (id) => {
    const remaining = removeFieldNote(id);
    setNotes(remaining);
    setSelectedId(nextFieldNote(remaining)?.id || null);
    setFeedback({ kind: 'neutral', text: 'Field note removed.' });
  };

  return (
    <div className="h-full overflow-y-auto nice-scroll px-[22px] py-6">
      <div className="max-w-[940px] mx-auto space-y-4">
        <header className="text-center space-y-1">
          <Bookmark className="w-7 h-7 mx-auto text-ink2" />
          <h2 className="text-xl font-bold">Field Notes</h2>
          <p className="text-sm text-ink2 max-w-2xl mx-auto">
            Capture the French you actually meet. Le Studio turns one real-life moment into a private loop you can reuse.
          </p>
        </header>

        <section className="bg-ink text-onaccent rounded-2xl p-5 grid gap-5 lg:grid-cols-[1fr_auto] items-center" aria-labelledby="field-notes-usp-title">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider opacity-75">
              <Sparkles size={14} /> Your life → your curriculum
            </div>
            <div>
              <h3 id="field-notes-usp-title" className="text-2xl font-bold tracking-tight">Never lose a phrase that mattered.</h3>
              <p className="text-sm opacity-80 mt-1.5 max-w-xl">
                Menus, messages, films and work chats become your next practice. No generic deck knows your moments like you do.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              {FIELD_NOTE_STAGES.map((stage, index) => (
                <span key={stage.id} className="inline-flex items-center gap-1.5 rounded-full bg-onaccent/10 px-2.5 py-1">
                  <span className="w-4 h-4 rounded-full border border-onaccent/40 grid place-items-center text-[9px]">{index + 1}</span>
                  {stage.shortLabel}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center min-w-[170px]">
            <DarkMetric value={stats.total} label="moments" />
            <DarkMetric value={stats.due} label="due now" />
            <DarkMetric value={stats.reused} label="reused" />
            <DarkMetric value={`${stats.total ? Math.round((stats.reused / stats.total) * 100) : 0}%`} label="alive" />
          </div>
        </section>

        {feedback && (
          <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${feedback.kind === 'error' ? 'border-danger/30 bg-dangersoft text-danger' : feedback.kind === 'success' ? 'border-success/30 bg-successsoft text-success' : 'border-line bg-surface2 text-ink2'}`} role="status">
            {feedback.kind === 'success' ? <Check size={13} /> : <Clock size={13} />}
            <span className="flex-1">{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss message" className="text-current opacity-60 hover:opacity-100"><X size={13} /></button>
          </div>
        )}

        <section className="bg-surface border border-line rounded-2xl overflow-hidden" aria-labelledby="capture-title">
          <button type="button" onClick={() => setCaptureOpen((open) => !open)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-surface2 transition-colors">
            <span className="w-9 h-9 grid place-items-center rounded-xl bg-surface2 text-ink"><Plus size={17} /></span>
            <span className="flex-1 min-w-0">
              <span id="capture-title" className="block text-sm font-bold">Capture a real moment</span>
              <span className="block text-xs text-ink3 mt-0.5">Paste a line you want to be able to say, not just understand.</span>
            </span>
            <ArrowRight size={15} className={`text-ink3 transition-transform ${captureOpen ? 'rotate-90' : ''}`} />
          </button>
          {captureOpen && (
            <form onSubmit={capture} className="border-t border-line p-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-[11px] font-semibold text-ink2">French line <span className="text-danger">*</span></span>
                <textarea
                  value={form.french}
                  onChange={(event) => updateForm('french', event.target.value)}
                  placeholder="« Je vous en prie, prenez votre temps. »"
                  maxLength={240}
                  rows={2}
                  required
                  lang="fr"
                  className="mt-1 w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink resize-none"
                  aria-label="French line to capture"
                />
              </label>
              <label>
                <span className="text-[11px] font-semibold text-ink2">What it means</span>
                <input
                  value={form.meaning}
                  onChange={(event) => updateForm('meaning', event.target.value)}
                  placeholder="You're welcome — take your time."
                  maxLength={240}
                  className="mt-1 w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink"
                />
              </label>
              <label>
                <span className="text-[11px] font-semibold text-ink2">Where did you meet it?</span>
                <select
                  value={form.context}
                  onChange={(event) => updateForm('context', event.target.value)}
                  className="mt-1 w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ink"
                  aria-label="Where did you meet this phrase"
                >
                  {FIELD_NOTE_CONTEXTS.map((context) => <option key={context.id} value={context.id}>{context.label}</option>)}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="text-[11px] font-semibold text-ink2">A tiny source note <span className="font-normal text-ink3">(optional)</span></span>
                <input
                  value={form.source}
                  onChange={(event) => updateForm('source', event.target.value)}
                  placeholder="e.g. Camille's voice note · café menu · episode 4"
                  maxLength={100}
                  className="mt-1 w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink"
                />
              </label>
              <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-ink3">Kept on this device. No account, no shared deck.</p>
                <button type="submit" disabled={!form.french.trim()} className="btn btn-primary min-h-10 px-4 rounded-xl text-xs disabled:opacity-40">
                  <Bookmark size={13} /> Capture phrase
                </button>
              </div>
            </form>
          )}
        </section>

        {selected ? (
          <Spotlight
            note={selected}
            stage={selectedStage}
            revealed={revealed}
            setRevealed={setRevealed}
            variant={variant}
            setVariant={setVariant}
            copied={copied}
            copyPhrase={copyPhrase}
            onPractise={practise}
            onOpenSpeaking={onOpenSpeaking}
          />
        ) : (
          <EmptyState onCapture={() => setCaptureOpen(true)} />
        )}

        {notes.length > 0 && (
          <section className="space-y-3" aria-labelledby="notes-list-title">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="notes-list-title" className="text-[11px] font-bold uppercase tracking-wider text-ink2">Your field notes</h3>
                <p className="text-xs text-ink3 mt-1">The context is part of the memory — keep it attached.</p>
              </div>
              <div className="flex gap-1.5 overflow-x-auto snap-rail" role="tablist" aria-label="Filter field notes">
                {FILTERS.map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${filter === id ? 'bg-accent text-onaccent border-accent' : 'bg-surface text-ink2 border-line hover:border-ink3'}`}>
                    {label}{id === 'due' && stats.due > 0 ? ` · ${stats.due}` : ''}
                  </button>
                ))}
              </div>
            </div>
            {visible.length > 0 ? (
              <div className="grid gap-2.5 md:grid-cols-2">
                {visible.map((note) => <NoteCard key={note.id} note={note} selected={note.id === selected?.id} onSelect={() => setSelectedId(note.id)} onDelete={() => deleteNote(note.id)} />)}
              </div>
            ) : (
              <div className="bg-surface border border-line rounded-2xl px-4 py-5 text-center text-xs text-ink3">No notes in this view yet. Your phrase bank is quiet here.</div>
            )}
          </section>
        )}

        <section className="bg-surface border border-line rounded-2xl p-4 flex gap-3 items-start">
          <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-surface2 text-ink"><Mic size={15} /></span>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Why this is different</h3>
            <p className="text-xs text-ink2 leading-relaxed">
              A phrase is useful when it survives outside the lesson that introduced it. Field Notes keeps the place, person or moment attached, then asks you to bring the line back after a delay and in a new situation.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Spotlight({ note, stage, revealed, setRevealed, variant, setVariant, copied, copyPhrase, onPractise, onOpenSpeaking }) {
  const isRecall = note.stage > 0 && !revealed;
  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-4" aria-labelledby="field-note-spotlight-title">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-10 h-10 shrink-0 grid place-items-center rounded-xl bg-speaksoft text-speak"><Mic size={18} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-speak">Next useful rep</p>
            <span className="px-2 py-0.5 rounded-full border border-line text-[10px] font-semibold text-ink3">{stage.label}</span>
            {isFieldNoteDue(note) && <span className="px-2 py-0.5 rounded-full bg-reviewsoft text-review text-[10px] font-bold">Due now</span>}
          </div>
          <h3 id="field-note-spotlight-title" className="text-lg font-bold tracking-tight mt-1">{stage.prompt}</h3>
          <p className="text-xs text-ink3 mt-1">{contextLabel(note.context)}{note.source ? ` · ${note.source}` : ''}</p>
        </div>
        <button type="button" onClick={copyPhrase} aria-label="Copy French line" className="w-9 h-9 grid place-items-center rounded-full text-ink3 hover:bg-surface2 hover:text-ink" title="Copy French line">
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>

      <div className="rounded-xl bg-surface2 p-4 space-y-2">
        {isRecall ? (
          <>
            <p className="text-[11px] uppercase tracking-wider font-bold text-ink3">Recall from your cue</p>
            <p className="text-base text-ink leading-relaxed">{note.meaning || 'Your saved meaning is the cue — what French line belongs here?'}</p>
            <button type="button" onClick={() => setRevealed(true)} className="text-xs font-semibold text-ink underline underline-offset-2">Reveal the line</button>
          </>
        ) : (
          <>
            <p className="text-base text-ink leading-relaxed" lang="fr">{note.french}</p>
            {note.meaning && <p className="text-xs text-ink3 italic">{note.meaning}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <SpeakButton text={note.french} label="Listen" />
              <SpeakButton text={note.french} label="Listen slowly" slow />
              {note.stage > 0 && <span className="text-[11px] text-ink3">Say it before you press the button.</span>}
            </div>
          </>
        )}
      </div>

      {note.stage >= 2 && (
        <label className="block">
          <span className="text-[11px] font-semibold text-ink2">New-context remix <span className="font-normal text-ink3">(optional)</span></span>
          <input value={variant} onChange={(event) => setVariant(event.target.value)} placeholder="Change one detail: « Je vous en prie, installez-vous. »" lang="fr" maxLength={240} className="mt-1 w-full bg-surface2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink" />
        </label>
      )}

      <div className="grid grid-cols-4 gap-1.5" aria-label={`${note.stage + 1} of ${FIELD_NOTE_STAGES.length} field note stages complete`}>
        {FIELD_NOTE_STAGES.map((item, index) => <div key={item.id} className={`h-1.5 rounded-full ${index <= note.stage ? 'bg-speak' : 'bg-line'}`} />)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onPractise('success')} className="btn btn-primary min-h-10 px-3.5 rounded-xl text-xs">
          <Check size={13} /> {stage.cta}
        </button>
        <button type="button" onClick={() => onPractise('slip')} className="btn btn-secondary min-h-10 px-3 rounded-xl text-xs">I slipped</button>
        {note.stage >= 2 && onOpenSpeaking && <button type="button" onClick={onOpenSpeaking} className="text-[11px] font-semibold text-ink3 underline underline-offset-2 hover:text-ink">Put it into Speak</button>}
      </div>
      <p className="text-[11px] text-ink3">{note.successes} successful rep{note.successes === 1 ? '' : 's'} · {note.slips} slip{note.slips === 1 ? '' : 's'} · next {nextDue(note)}</p>
    </section>
  );
}

function NoteCard({ note, selected, onSelect, onDelete }) {
  const stage = fieldNoteStage(note);
  return (
    <article className={`bg-surface border rounded-2xl p-4 transition-colors ${selected ? 'border-ink3' : 'border-line'}`}>
      <button type="button" onClick={onSelect} className="w-full text-left space-y-2.5" aria-pressed={selected}>
        <div className="flex items-start gap-2">
          <span className="flex-1 min-w-0 text-sm font-semibold text-ink leading-relaxed" lang="fr">{note.french}</span>
          <span className={`shrink-0 px-2 py-1 rounded-full border text-[10px] font-bold ${note.stage === FIELD_NOTE_STAGES.length - 1 ? 'bg-successsoft text-success border-success/30' : 'bg-surface2 text-ink2 border-line'}`}>{stage.shortLabel}</span>
        </div>
        {note.meaning && <p className="text-xs text-ink3 truncate">{note.meaning}</p>}
        <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
          {FIELD_NOTE_STAGES.map((item, index) => <div key={item.id} className={`h-1 rounded-full ${index <= note.stage ? 'bg-speak' : 'bg-line'}`} />)}
        </div>
        <p className="text-[11px] text-ink3">{contextLabel(note.context)} · {isFieldNoteDue(note) ? 'Due now' : nextDue(note)}</p>
      </button>
      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-line">
        <span className="text-[10px] text-ink3">{note.successes} rep{note.successes === 1 ? '' : 's'}</span>
        <button type="button" onClick={onDelete} className="text-[10px] text-ink3 hover:text-danger inline-flex items-center gap-1" aria-label={`Remove ${note.french}`}><Trash size={11} /> Remove</button>
      </div>
    </article>
  );
}

function EmptyState({ onCapture }) {
  return (
    <section className="bg-surface border border-dashed border-line rounded-2xl p-8 text-center space-y-3">
      <span className="w-11 h-11 mx-auto grid place-items-center rounded-2xl bg-surface2 text-ink"><Bookmark size={19} /></span>
      <h3 className="text-base font-bold">Your first real-life phrase is waiting.</h3>
      <p className="text-sm text-ink2 max-w-md mx-auto">Save a line from today — even if you only half-understood it. We will give it a place to grow.</p>
      <button type="button" onClick={onCapture} className="btn btn-primary min-h-10 px-4 rounded-xl text-xs"><Plus size={13} /> Capture a phrase</button>
    </section>
  );
}

function DarkMetric({ value, label }) {
  return <div className="rounded-xl bg-onaccent/10 p-2.5"><strong className="block text-xl tabular-nums">{value}</strong><span className="text-[10px] opacity-70">{label}</span></div>;
}

function nextDue(note) {
  if (!note?.nextReviewAt) return 'now';
  const days = Math.max(1, Math.ceil((new Date(note.nextReviewAt).getTime() - Date.now()) / 86400000));
  return days === 1 ? 'tomorrow' : `in ${days}d`;
}
