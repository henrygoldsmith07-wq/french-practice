// Learner-facing explanations for Today's segments — the "why this?" layer.
//
// Pure and injectable: the session's plan builder feeds in what it already
// computed (no extra storage reads), and this composes honest, human copy for
// every targeted segment:
//   What you're practising · Why it was selected · The evidence · What success requires
//
// Copy rules (enforced by tests/segment-explain.test.js):
//   - no internal identifiers (candidate ids, "fp." keys, "producer", "P1/P2",
//     engine names, trial/calibration vocabulary) reach the learner
//   - unknown/absent state degrades to honest generic copy, never a blank
//     panel or fabricated specifics

const FORBIDDEN = [
  'fp.', 'producer', 'calibration', 'P1', 'P2', 'trial', 'engine',
  'learner-specific', 'balanced', 'variant', 'candidate', 'adaptive-arm',
];

function assertClean(parts) {
  for (const text of parts) {
    const s = String(text || '');
    for (const bad of FORBIDDEN) {
      if (s.toLowerCase().includes(bad.toLowerCase())) {
        throw new Error(`segment-explain: learner copy leaked "${bad}"`);
        }
    }
  }
}

// Segment ids → learner names for "What you're practising".
const SEGMENT_NAMES = {
  speak: 'Speaking practice',
  retrieve: 'Retrieval review',
  drill: 'Targeted drill',
  review: 'Reviewing recent corrections',
  listen: 'Listening comprehension',
};

export function segmentName(id) {
  return SEGMENT_NAMES[id] || 'Practice';
}

// The headline a targeted segment shows: "Present tense: je + parler".
export function targetHeadline(concept, fallback) {
  const c = String(concept || '').trim();
  if (!c) return String(fallback || 'Your next step');
  // Trainer-gap shape: "conjugating parler (present · je)" → readable order.
  const m = /^conjugating\s+(\S+)\s*\(([^)]+)\)$/i.exec(c);
  if (m) {
    const [tense, person] = m[2].split('·').map((s) => s.trim());
    const tenseName = TENSE_LABELS[tense?.toLowerCase()] || tense || 'Verb drill';
    return `${tenseName}: ${person ? person + ' + ' : ''}${m[1]}`;
  }
  return c;
}

const TENSE_LABELS = {
  present: 'Present tense',
  passe: 'Past tense (passé composé)',
  futur: 'Future tense',
  imparfait: 'Imperfect',
};

// "3 recent mistakes · due for retrieval" style evidence, from real counters.
export function evidenceLines(target) {
  if (!target || typeof target !== 'object') return [];
  const lines = [];
  const mistakes = Number(target.errorCount ?? target.recurrence ?? target.mistakes) || 0;
  const overdue = Number(target.overdueBy ?? 0);
  const lowRetention = target.lowRetention === true;
  const modes = Array.isArray(target.modes) ? target.modes.filter((m) => typeof m === 'string' && m.trim()).slice(0, 3) : [];
  if (mistakes > 0) lines.push(`${mistakes} recent mistake${mistakes === 1 ? '' : 's'}`);
  if (overdue > 0) lines.push('due for retrieval');
  if (lowRetention) lines.push('your recall has slipped here');
  for (const mode of modes) lines.push(`seen in ${mode}`);
  return lines;
}

// What "done" means for this segment, per drill kind.
export function successRequirement(kind) {
  switch (kind) {
    case 'conj-drill': return 'One clean pass on the missed form, then a few more on the same verb.';
    case 'dictation-drill': return 'One sentence written back at 80% accuracy or better.';
    case 'accent-drill': return 'A full round with every accent in place (8 of 10 or better).';
    case 'ai-drill': return 'Two correct answers on questions built from this exact weakness.';
    case 'authored-drill': return 'Two correct answers on the matching grammar questions.';
    case 'retype': return 'Every correction retyped correctly from memory.';
    default: return 'A clean pass on this material.';
  }
}

// Visible recovery states for the closed loop:
//   Active weakness → Improving → Resolved
// Derived ONLY from the learner-error model's own counters (successCount,
// cleanPasses, status, lastEvidence) — never from a single lucky answer, and
// never fabricated when the model has nothing. Evidence-weighted: a clean
// DELAYED recall (next-day SRS review, scheduled retest) is the strong
// signal the whole loop wants, so it reads as recovery, while same-session
// passes honestly stay "so far" until they hold up later.
export function recoveryStatus(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const successes = Number(entry.successCount) || 0;
  const clean = Number(entry.cleanPasses) || 0;
  if (entry.status === 'resolved' || clean >= 2) {
    return { state: 'Resolved', detail: `${Math.max(clean, successes)} independent correct recall${Math.max(clean, successes) === 1 ? '' : 's'}.` };
  }
  if (entry.status === 'recovering' || successes > 0) {
    if (entry.lastEvidence === 'delayed') {
      return { state: 'Improving', detail: 'Clean recall a day later — one more pass and it is yours.' };
    }
    return { state: 'Improving', detail: `${successes} correct recall${successes === 1 ? '' : 's'} so far — it needs to hold up later too.` };
  }
  const mistakes = Number(entry.errorCount) || 0;
  return { state: 'Active weakness', detail: `${mistakes} recent mistake${mistakes === 1 ? '' : 's'} · due for retrieval` };
}

/**
 * Compose the full panel payload for a segment.
 * @param {{
 *   segId: string,
 *   concept?: string|null,
 *   drillKind?: string|null,
 *   target?: {errorCount?, recurrence?, mistakes?, overdueBy?, lowRetention?, modes?}|null,
 *   fallbackWhy?: string|null,
 *   targeted?: boolean,
 * }} input
 * @returns {{ name: string, headline: string, why: string, evidence: string[], success: string } | null}
 *   null when the segment is not targeted (retrieve/listen keep their existing why line).
 */
export function segmentExplain({ segId, concept = null, drillKind = null, target = null, fallbackWhy = null, targeted = true } = {}) {
  if (!targeted) return null;
  const name = segmentName(segId);
  const headline = targetHeadline(concept, name);
  const evidence = evidenceLines(target);
  let why;
  if (drillKind === 'conj-drill' || drillKind === 'dictation-drill' || drillKind === 'accent-drill') {
    why = 'You missed this specific form more than once recently, and it has not been repaired yet — so it comes first today.';
  } else if (drillKind === 'ai-drill' || drillKind === 'authored-drill') {
    why = evidence.length
      ? 'This came up in your recent work and the fastest way to fix it is a few questions on exactly that.'
      : 'This is your weakest area right now, so today works directly on it.';
  } else if (segId === 'review') {
    why = 'You corrected these recently — reviewing them now is what turns a correction into a habit.';
  } else {
    why = 'This is where your practice will make the most difference today.';
  }
  const success = successRequirement(drillKind || segId);
  const parts = [headline, why, ...evidence, success, fallbackWhy || ''];
  assertClean(parts);
  return { name, headline, why, evidence, success };
}
