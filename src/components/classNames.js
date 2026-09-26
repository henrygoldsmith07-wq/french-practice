// Shared Tailwind class strings.
//
// These exact strings recur across many per-screen chunks. Rollup keeps every
// chunk's string literals independent, so each copy used to ship in every
// chunk that rendered it; naming them once in a shared module ships ONE copy
// (in the ui.js chunk) and references it everywhere else. Tailwind v4 scans
// this file like any other source file, so generated CSS is unchanged.

export const CARD_ROW =
  'w-full flex items-center gap-3.5 bg-surface border border-line rounded-2xl px-4 py-3.5 text-left hover:border-ink3 transition-colors';

export const CARD_ROW_ACCENT =
  'w-full flex items-center gap-3.5 bg-accent text-onaccent rounded-2xl px-4 py-3.5 text-left hover:opacity-90 transition-opacity';

export const ICON_BTN_ROUND =
  'w-10 h-10 grid place-items-center rounded-full bg-surface2 text-ink2 hover:bg-line';

export const ICON_BTN_ROUND_SOFT =
  'w-10 h-10 grid place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink';

export const ICON_BTN_SQUARE =
  'w-10 h-10 shrink-0 grid place-items-center rounded-xl bg-surface2 text-ink';

export const ICON_BTN_SQUARE_SM =
  'w-9 h-9 shrink-0 grid place-items-center rounded-xl bg-surface2 text-ink';

export const TOP_BAR =
  'flex items-center gap-2 px-4 py-3 border-b border-line bg-surface shrink-0';

export const INPUT_FIELD =
  'flex-1 min-w-0 bg-surface border border-line rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink3 focus:outline-none focus:border-ink';

export const TAG_PILL =
  'shrink-0 px-1.5 py-0.5 rounded-md border border-line text-[10px] font-semibold text-ink3';

export const EMPTY_CARD =
  'bg-surface border border-line rounded-2xl p-6 text-center space-y-3';

export const CHIP =
  'inline-block bg-surface border border-line rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink2';

export const SECTION_LABEL_SM =
  'text-[11px] font-bold uppercase tracking-wider text-ink2 mb-1';
