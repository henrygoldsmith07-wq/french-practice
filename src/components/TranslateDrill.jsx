import { useMemo, useRef, useState } from 'react';
import { activeLanguage, langName } from '../lib/i18n';
import { useAllEntries } from '../lib/vocabAsync';
import { recordSkillScore } from '../lib/storage';
import { SpeakButton } from './ui';
import { useTimeout } from '../hooks/useTimeout';
import { Play, RefreshCw, Check, X } from './icons';
import { EMPTY_CARD } from '../components/classNames.js';

// The active language's content code ('fr'/'de'/'es') — used for the
// direction chips and lang attributes so the drill never hard-codes French.
const langCode = () => activeLanguage().id;

// Bidirectional translation drill: EN→target and target→EN sentence rounds
// drawn from the vocabulary library's example sentences, so every sentence
// uses words the packs teach. Checking is accent- and punctuation-tolerant.
// Direction labels are built from the ACTIVE language name — no hard-coded
// "FR" chrome in a mode that must stay multilingual.

const ROUNDS = 8;

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/’/g, "'").replace(/[.,!?;:«»"]/g, '').replace(/\s+/g, ' ').trim();

// Word-level overlap score: quotient of shared words over target words.
const similarity = (a, b) => {
  const ta = new Set(norm(a).split(' '));
  const tb = norm(b).split(' ');
  const hit = tb.filter((w) => ta.has(w)).length;
  return tb.length ? hit / tb.length : 0;
};

export default function TranslateDrill({ onXp }) {
  // The pool comes from the ASYNC library. allEntries() is the sync facade and
  // returns [] for DE/ES until that language's registry chunk resolves; reading
  // it in a `useMemo(..., [])` froze `pool` as [] on a cold start, and
  // `pool[game.idx].exampleEn` then threw into the root ErrorBoundary, which
  // replaced the whole app with "Oups — something broke". `useAllEntries`
  // returns null while loading, so "not ready yet" and "genuinely empty" are
  // different states and the drill can never run on a half-loaded library.
  const entries = useAllEntries();
  const pool = useMemo(
    () => (entries || []).filter((e) => e.example && e.exampleEn && e.example.split(' ').length <= 10),
    [entries],
  );
  const [game, setGame] = useState(null);
  const inputRef = useRef(null);
  // Cleared on unmount, so leaving mid-round cannot refocus a dead ref.
  const scheduleFocus = useTimeout(() => inputRef.current?.focus(), 50);

  // Never ask for more rounds than there are sentences. `draw` used to resample
  // until it found an unused index, which spins forever once the pool is
  // exhausted — a small deck froze the tab instead of ending the round.
  const rounds = Math.min(ROUNDS, pool.length);

  const draw = (used) => {
    const free = pool.map((_, i) => i).filter((i) => !used.includes(i));
    return free.length ? free[Math.floor(Math.random() * free.length)] : 0;
  };

  const start = () => {
    if (!rounds) return;
    const first = draw([]);
    setGame({ n: 1, idx: first, used: [first], toFr: true, input: '', checked: false, correct: 0 });
  };

  const check = () => {
    const e = pool[game.idx];
    if (!e) return;
    const target = game.toFr ? e.example : e.exampleEn;
    const sim = similarity(game.input, target);
    const ok = sim >= 0.6;
    setGame({ ...game, checked: true, lastOk: ok, sim, correct: game.correct + (ok ? 1 : 0) });
  };

  const next = () => {
    if (game.n >= rounds) {
      const score = Math.round((game.correct / rounds) * 100);
      recordSkillScore('writing', score);
      onXp(Math.max(1, game.correct * 3));
      setGame({ ...game, done: true, score });
      return;
    }
    const idx = draw(game.used);
    setGame({ n: game.n + 1, idx, used: [...game.used, idx], toFr: !game.toFr, input: '', checked: false, correct: game.correct });
    scheduleFocus();
  };

  if (entries === null) {
    return (
      <div className={EMPTY_CARD}>
        <p className="text-sm text-ink2">Loading sentences…</p>
      </div>
    );
  }

  if (!pool.length) {
    return (
      <div className={EMPTY_CARD}>
        <p className="text-sm text-ink2">
          No worked sentences are available in {activeLanguage().name} yet, so there is nothing to translate.
        </p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className={EMPTY_CARD}>
        <p className="text-sm text-ink2">
          {rounds} sentence{rounds === 1 ? '' : 's'}, alternating directions: English → {langName()}, then {langName()} → English.
          Close paraphrases count — accents and punctuation are forgiven.
        </p>
        <button onClick={start} className="btn btn-primary min-h-11 px-6 rounded-xl text-sm"><Play size={14} /> Start</button>
      </div>
    );
  }

  if (game.done) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6 text-center space-y-3 fade-in">
        <p className="text-3xl font-bold text-ink tabular-nums">{game.correct}/{rounds}</p>
        <p className="text-xs text-ink2">{game.score >= 75 ? `Solid translation in both directions!` : 'Both directions — that is how it sticks.'}</p>
        <button onClick={start} className="btn btn-secondary min-h-10 px-4 rounded-xl text-xs"><RefreshCw size={12} /> Again</button>
      </div>
    );
  }

  const e = pool[game.idx];
  if (!e) return <div className={EMPTY_CARD}><p className="text-sm text-ink2">Loading sentences…</p></div>;
  const source = game.toFr ? e.exampleEn : e.example;
  const target = game.toFr ? e.example : e.exampleEn;

  return (
    <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between text-[11px] text-ink3 tabular-nums">
        <span>Sentence {game.n}/{rounds}</span>
        <span className="font-semibold">{game.toFr ? `EN → ${langCode().toUpperCase()}` : `${langCode().toUpperCase()} → EN`}</span>
        <span>{game.correct} ✓</span>
      </div>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[15px] text-ink leading-relaxed" lang={game.toFr ? 'en' : langCode()}>{source}</p>
        {!game.toFr && <SpeakButton text={source} label="Listen" />}
      </div>
      <textarea
        ref={inputRef}
        value={game.input}
        onChange={(ev) => setGame({ ...game, input: ev.target.value })}
        disabled={game.checked}
        rows={2}
        lang={game.toFr ? langCode() : 'en'}
        placeholder={game.toFr ? `Write it in ${activeLanguage().name}…` : 'Write it in English…'}
        aria-label="Your translation"
        className="w-full bg-surface2 border border-line rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink resize-none"
      />
      {game.checked ? (
        <div className="space-y-2 fade-in">
          <p className={`text-sm font-semibold inline-flex items-center gap-1.5 ${game.lastOk ? 'text-ink' : 'text-ink2'}`}>
            {game.lastOk ? <Check size={14} /> : <X size={14} />}
            {game.lastOk ? 'That works!' : 'Not quite —'}
          </p>
          <p className="text-sm text-ink bg-surface2 rounded-xl px-3 py-2" lang={game.toFr ? langCode() : 'en'}>{target}</p>
          <button onClick={next} className="btn btn-primary w-full min-h-11 rounded-xl text-sm">
            {game.n >= ROUNDS ? 'See my score' : 'Next'}
          </button>
        </div>
      ) : (
        <button onClick={check} disabled={!game.input.trim()} className="btn btn-primary w-full min-h-11 rounded-xl text-sm disabled:opacity-50">Check</button>
      )}
    </div>
  );
}
