import { useMemo, useState } from 'react';
import { freshContextChallenge, evaluateTransfer, transferResultCopy } from '../lib/speakingTransfer';
import { SpeakButton } from './ui';
import { ArrowRight, Check } from './icons';

// The fresh-context step of the flagship speaking loop:
//   correction → redo → USE IT SOMEWHERE NEW → (delayed retest later)
//
// Shown after a successful redo. The learner must produce the repaired form
// in a genuinely different situation — the prompt is the only scaffold, and
// at higher difficulty there is no hint at all. One clean pass is real
// transfer evidence but never mastery: the copy says exactly that.

export default function TransferPrompt({ correction, contextId, difficulty = 2, onSubmit, onSkip }) {
  const challenge = useMemo(
    () => freshContextChallenge(correction, { originalContext: contextId, difficulty }),
    [correction, contextId, difficulty],
  );
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(null);

  if (!challenge) return null;

  const check = () => {
    const value = text.trim();
    if (!value) return;
    // The transfer step checks that the learner produced something in the new
    // context that exercises the TARGET — not a verbatim repeat of the
    // corrected phrase (that would be memorisation, not transfer).
    const usedStructure = structurePresent(value, challenge.structure);
    const result = evaluateTransfer({
      correct: usedStructure,
      assisted: false,
      hinted: !challenge.requiresIndependence && Boolean(challenge.hint) && text.includes(challenge.structure),
      novelContext: true,
      attemptText: value,
      correction,
    });
    setChecked({ usedStructure, result });
    onSubmit?.({ challenge, text: value, result, usedStructure });
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 space-y-3" aria-label="Use it somewhere new">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-speak">Use it somewhere new</span>
        <span className="text-[10px] text-ink3">no prompt from the situation you practised</span>
      </div>
      <p className="text-sm text-ink leading-snug">{challenge.prompt}</p>
      {challenge.hint && (
        <p className="text-xs text-ink2">
          <SpeakButton text={challenge.structure} label="Hear it" /> {challenge.hint}
        </p>
      )}
      <label className="block">
        <span className="sr-only">Your sentence in the new situation</span>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setChecked(null); }}
          rows={2}
          className="w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
          placeholder="Say or type your sentence…"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={check}
          disabled={!text.trim()}
          className="inline-flex items-center gap-1.5 bg-ink text-bg font-semibold rounded-xl px-4 py-2 text-xs disabled:opacity-40"
        >
          <Check size={13} /> Check it
        </button>
        <button type="button" onClick={onSkip} className="text-xs text-ink3 hover:text-ink px-2 py-2">
          Do this later <ArrowRight size={12} className="inline" />
        </button>
      </div>
      {checked && (
        <p className={`text-xs rounded-xl px-3 py-2 border ${checked.usedStructure ? 'border-success/40 bg-successsoft text-success' : 'border-line bg-surface2 text-ink2'}`}>
          {transferResultCopy(checked.result)}
        </p>
      )}
      <p className="text-[10px] text-ink3">{challenge.successCriteria}</p>
    </section>
  );
}

function structurePresent(text, structure) {
  const normalize = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const target = normalize(structure);
  const said = normalize(text);
  if (!target) return false;
  if (said.includes(target)) return true;
  // Allow a content-word overlap of at least two words: the learner may have
  // adapted the form legitimately while keeping the repaired structure.
  const tWords = target.match(/[\p{L}\p{N}]+/gu) || [];
  const sWords = new Set(said.match(/[\p{L}\p{N}]+/gu) || []);
  const hits = tWords.filter((w) => sWords.has(w)).length;
  return tWords.length > 0 && hits >= Math.min(3, tWords.length);
}
