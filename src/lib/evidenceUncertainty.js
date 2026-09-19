// Uncertainty helpers for real-evidence reporting.
//
// When real learner/teacher data arrives, a bare percentage is over-claiming:
// "3 of 3" is not "100%". These helpers quantify how much a small sample can
// be trusted and are deliberately tiny, pure and dependency-free so they can
// ride the research-reporting path (and CLI) without any bundle cost.
//
// The Wilson score interval is used because it stays honest at small n and
// near the boundaries (unlike the normal approximation, which produces
// intervals outside [0,1] or collapses to zero width at n=0).

/** Rounded-up sample size for a proportion estimate.
 *  `margin` is the ± half-width on the 95% Wilson interval (0..1), `p` the
 *  planning proportion. A conservative p=0.5 gives the classic worst-case n. */
export function sampleSizeForMargin(margin = 0.1, p = 0.5) {
  const z = 1.959963984540054; // 95% two-sided
  const m = Math.max(0.001, Number(margin) || 0.1);
  const ph = Math.min(1, Math.max(0, Number(p)));
  const raw = (z * z * ph * (1 - ph)) / (m * m);
  return Math.ceil(raw);
}

/** The 95% Wilson score interval for k successes in n trials.
 *  Returns null when n is 0 (no data → no interval, never [0,1] padding). */
export function wilsonInterval(k, n) {
  const successes = Number(k);
  const trials = Number(n);
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) return null;
  if (successes < 0 || successes > trials) return null;
  const z = 1.959963984540054;
  const phat = successes / trials;
  const denom = 1 + (z * z) / trials;
  const centre = (phat + (z * z) / (2 * trials)) / denom;
  const spread = (z / denom) * Math.sqrt((phat * (1 - phat)) / trials + (z * z) / (4 * trials * trials));
  return {
    lower: Math.max(0, centre - spread),
    upper: Math.min(1, centre + spread),
    level: 0.95,
  };
}

/** Format a proportion with its Wilson interval, sized for a report cell.
 *  No data → '—' (the honesty rule every validation surface follows). */
export function formatWithUncertainty(k, n, { digits = 0 } = {}) {
  const successes = Number(k);
  const trials = Number(n);
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) return '—';
  const interval = wilsonInterval(successes, trials);
  if (!interval) return '—';
  const f = 10 ** digits;
  const pct = (v) => `${Math.round(v * 100 * f) / f}%`;
  return `${pct(successes / trials)} [${pct(interval.lower)}, ${pct(interval.upper)}]`;
}
