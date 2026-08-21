import { useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking, ttsSupported } from '../lib/tts';
import { Play, Square } from './icons';

// ---- monochrome score ramp (shared everywhere) ----
// Score is expressed as ink *intensity* rather than hue: strong scores get
// full-contrast marks, weak ones fade toward the background. color-mix keeps
// it correct on both themes.

export function scoreColor(v) {
  const alpha = v >= 85 ? 100 : v >= 70 ? 75 : v >= 55 ? 52 : 32;
  return {
    alpha,
    text: 'text-ink',
    ring: `color-mix(in srgb, var(--ink) ${alpha}%, transparent)`,
  };
}

export function ScoreBadge({ value, size = 'md' }) {
  const c = scoreColor(value);
  const cls = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-xs';
  return (
    <div
      className={`${cls} text-ink bg-surface rounded-full grid place-items-center font-semibold border-2 shrink-0`}
      style={{ borderColor: c.ring }}
      aria-label={`Score ${value} out of 100`}
    >
      {value}
    </div>
  );
}

// ---- modal shell (dialog semantics + escape/backdrop close) ----
// Focus is moved into the panel on open, Tab cycles within it, and focus is
// restored to the trigger on close — aria-modal without this strands
// keyboard/screen-reader users behind an "inert" background.

export function Modal({ open, onClose, children, wide = false }) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (first || panel).focus();
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const focusables = panel.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      // Hand focus back to whatever opened the dialog.
      if (document.activeElement && document.activeElement !== document.body) {
        try { restoreRef.current?.focus?.(); } catch { /* element gone */ }
      }
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`sheet-enter w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'} max-h-[92dvh] overflow-y-auto nice-scroll bg-surface border border-line rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/50 focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );
}

// ---- minimal markdown → HTML with a strict tag allowlist ----
// The LLM is told to use <s>/<mark>; everything else gets escaped first.

const ALLOWED = ['s', 'del', 'mark', 'strong', 'em', 'code', 'br', 'ul', 'li'];

export function renderMarkdown(md) {
  let html = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // restore allowlisted bare tags (no attributes survive)
  for (const tag of ALLOWED) {
    html = html
      .replace(new RegExp(`&lt;${tag}&gt;`, 'gi'), `<${tag}>`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, 'gi'), `</${tag}>`)
      .replace(new RegExp(`&lt;${tag} ?/&gt;`, 'gi'), `<${tag}/>`);
  }
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  // bullet lists
  html = html.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g, (_, block) => {
    const items = block.trim().split('\n').map((l) => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
    return `\n<ul>${items}</ul>`;
  });
  return html.replace(/\n/g, '<br/>');
}

export function Markdown({ children, className = '' }) {
  return (
    <div
      className={`corrections-body ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(children) }}
    />
  );
}

// ---- TTS replay button (with optional slow-mo rate) ----

export function SpeakButton({ text, rate = 1, slow = false, label }) {
  const [speaking, setSpeaking] = useState(false);
  const timeout = useRef(null);
  useEffect(() => () => clearTimeout(timeout.current), []);
  if (!ttsSupported()) return null;

  const onClick = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(text, { rate: slow ? Math.min(rate, 0.75) : rate, onEnd: () => setSpeaking(false) });
    // Safety: onend is unreliable on some mobile browsers
    timeout.current = setTimeout(() => setSpeaking(false), 30000);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label || (slow ? 'Listen slowly' : 'Listen')}
      className={`inline-flex items-center gap-1 px-2 py-1 min-h-8 rounded-lg text-[11px] font-medium transition-colors ${
        speaking
          ? 'bg-accent text-onaccent'
          : 'bg-surface2 text-ink2 hover:bg-line active:bg-line'
      }`}
    >
      {speaking ? <Square size={10} /> : <Play size={10} />} {slow ? '0.75×' : label || 'Listen'}
    </button>
  );
}

export function RateSlider({ rate, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-ink2 min-w-0">
      <span className="hidden sm:inline text-[10px] text-ink3" aria-hidden="true">0.5×</span>
      <input
        type="range"
        min="0.5"
        max="1.5"
        step="0.1"
        value={rate}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 sm:w-24 accent-ink"
        aria-label="Playback speed"
      />
      <span className="hidden sm:inline text-[10px] text-ink3" aria-hidden="true">1.5×</span>
      <span className="font-mono w-8 shrink-0">{rate.toFixed(1)}×</span>
    </label>
  );
}

export function Spinner({ label }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink2 text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-line border-t-ink animate-spin" />
      {label}
    </span>
  );
}
