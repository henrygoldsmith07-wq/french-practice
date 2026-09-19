// Today capability awareness — never schedule an activity that cannot run.
//
// The fallback order for the drill slot (product spec):
//
//   AI targeted drill
//   → authored matching drill
//   → correction retype
//   → SRS retrieval
//   → listening/review fallback
//
// Everything here is pure and injectable so a plan built offline stays
// complete: a segment that cannot run is replaced by the next capability in
// the chain, and the session never shows an "unavailable" hole.

// The grammar topic index is INJECTED, not imported: grammar.js composes four
// topic data files (~160 KB of source) that must never ride the boot graph —
// TodaySession is statically imported by App, so a static grammar import here
// put the whole authored-drill library into the entry chunk. ensureGrammarTopics()
// loads it as its own lazy chunk; the plan builder awaits it before building.
// Node tests inject a fixture directly with setGrammarTopics().
let topicList = [];
let topicIdSet = new Set();
let loaderPromise = null;
export function setGrammarTopics(topics) {
  topicList = Array.isArray(topics) ? topics : [];
  topicIdSet = new Set(topicList.map((t) => t && t.id).filter(Boolean));
}
export function grammarTopicsReady() { return topicIdSet.size > 0; }
export function ensureGrammarTopics() {
  if (!loaderPromise) {
    loaderPromise = import('./grammar.js')
      .then((m) => setGrammarTopics(m.GRAMMAR_TOPICS))
      .catch(() => { loaderPromise = null; });
  }
  return loaderPromise;
}
import { GRAMMAR_ALIASES } from './cefr.js';
import { PERSONS } from './conjugationMeta.js';
import { applyCalibration } from './selectionCalibration.js';

// The conj-drill link sits FIRST when present: a trainer gap has a
// purpose-built, exact-form repair (fully offline), which always beats the
// generic AI drill — including mock mode, where the AI drill is canned
// questions that cannot target one specific form.
export const DRILL_FALLBACK_ORDER = [
  'conj-drill', 'dictation-drill', 'accent-drill', 'ai-drill', 'authored-drill', 'retype', 'srs-retrieval', 'listen', 'review',
];

// A conjugation-trainer gap surfaces as a concept shaped
// "conjugating parler (present)" or — with the exact missed cell —
// "conjugating parler (present · je)". No grammar-library topic matches
// either shape, so the chain needs its own link: the trainer itself, focused
// on that exact form, fully offline. `conj-drill` only enters the chain when
// the concept has this shape — every other concept drills exactly as before.
const TRAINER_GAP_RE = /^conjugating\s+(\S+)\s*\((?:([a-z0-9-]+))(?:\s*·\s*([a-z/']+))?\)$/i;
export function trainerDrillFor(concept) {
  const m = TRAINER_GAP_RE.exec(String(concept || '').trim());
  if (!m) return null;
  const personIdx = m[3] ? PERSONS.indexOf(m[3].toLowerCase()) : -1;
  return { verb: m[1].toLowerCase(), tense: m[2].toLowerCase(), personIndex: personIdx >= 0 ? personIdx : null };
}

// The other learner-error categories get the same treatment conjugation
// gets from conj-drill: a concept recorded by a practice mode (storage.js's
// recordLearningActivity) is matched to a purpose-built, offline drill that
// repairs it. Key shapes must never collide with a grammar-library topic id —
// the `authored-drill` link would otherwise claim them.
const DICTATION_GAP_RE = /^(dictée listening accuracy|dictation)$/i;
const PRONUNCIATION_GAP_RE = /^pronunciation clarity$/i;
export function dictationDrillFor(concept) {
  return DICTATION_GAP_RE.test(String(concept || '').trim()) ? { kind: 'dictation-drill' } : null;
}
export function accentDrillFor(concept) {
  return PRONUNCIATION_GAP_RE.test(String(concept || '').trim()) ? { kind: 'accent-drill' } : null;
}

/** Normalise a mistake concept (AI topic id or free text) to a library topic id. */
export function conceptToTopicId(concept) {
  const c = String(concept || '').trim().toLowerCase();
  if (!c || !topicIdSet.size) return null;
  if (topicIdSet.has(c)) return c;
  const alias = GRAMMAR_ALIASES[c];
  if (alias && topicIdSet.has(alias)) return alias;
  // Loose containment: "passé composé" → passe-compose, "passe-compose vs
  // imparfait" → either topic; prefer the longest library id contained.
  const norm = (s) => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
  const target = norm(c);
  let best = null;
  for (const id of topicIdSet) {
    const nid = norm(id);
    if (target.includes(nid) || nid.includes(target)) {
      if (!best || id.length > best.length) best = id;
    }
  }
  return best;
}

/** An authored drill exists for this concept and has usable questions. */
export function authoredDrillFor(concept) {
  const topicId = conceptToTopicId(concept);
  if (!topicId) return null;
  const topic = topicList.find((t) => t.id === topicId);
  const drills = Array.isArray(topic?.drills) ? topic.drills.filter((d) => d && d.q && Array.isArray(d.options)) : [];
  if (!drills.length) return null;
  return { topicId, title: topic.title, exercises: drills.slice(0, 4) };
}

// ---- the drill slot's producer registry -------------------------------------
//
// The drill slot used to hand-wire every weakness producer into the session's
// plan builder: a trainer gap's priority was implicit in array order (and
// actually inverted — applyCalibration's overdueBy×weight sort demoted the
// zero-mastery gap below any real graph node), the balanced-arm gate lived at
// each call site (and was genuinely missed once — trainer gaps leaked into
// the control arm), and the selection-trial freeze could drift away from what
// was actually chosen. This registry is the ONE place that decides which
// producer owns the drill slot, in what order, and under which gates.
//
// A producer:
//   id               stable identifier; becomes the candidate's `source` so
//                    the selection-trial record shows who nominated a pick
//   learnerSpecific  when true, the producer is skipped in the balanced
//                    (control) arm — study validity is enforced HERE, once,
//                    instead of relying on every future producer's author
//                    remembering the gate
//   build(ctx)       candidate object | candidate array | null. `ctx` carries
//                    everything the producer needs (already-fetched storage
//                    reads, calibration) so this module stays free of storage
//                    imports and pure-node tests keep working.
//
// Producer order = priority: the first producer that yields anything owns
// the slot (its list is sorted by calibration WITHIN the producer), and the
// remaining producers' candidates still join the frozen candidate list so the
// P1 analysis keeps the full context of each selection.

export const DRILL_PRODUCERS = [
  {
    id: 'learner-errors',
    learnerSpecific: true,
    // Conjugation-trainer misses (failed ≥2×, never repaired) come first:
    // zero mastery, an exact-form repair exists (the focused trainer), and
    // the mistake graph may never have seen the concept at all.
    build: ({ trainerGap }) => trainerGap || null,
  },
  {
    id: 'learner-errors-generic',
    learnerSpecific: true,
    // Dictée and pronunciation misses recorded by recordLearningActivity:
    // each category has a purpose-built offline drill (dictation-drill,
    // accent-drill), so an active gap with a repairable shape wins its slot
    // — the same argument as the trainer gap, one tier down.
    build: ({ dictationGap, pronunciationGap }) => dictationGap || pronunciationGap || null,
  },
  {
    id: 'mistake-graph',
    learnerSpecific: true,
    // The mistake graph's due retests in urgency order (already limited to
    // the top few by the caller); applyCalibration applies the P2 per-type
    // weights within this list.
    build: ({ dueRetestCandidates }) => dueRetestCandidates || [],
  },
];

/**
 * Build the drill slot: run every eligible producer, freeze the combined
 * candidate list, and pick the winner. Pure.
 *
 * Returns { candidates, top, producer }:
 *   candidates  the frozen candidate list — exactly what the selection-trial
 *               record freezes, so selectedId can only ever name a frozen id
 *   top         the winning candidate (null when nothing fired, or when the
 *               balanced arm stripped all learner-specific targeting)
 *   producer    the winning producer's id (null with `top`)
 */
export function buildDrillSlot(ctx = {}) {
  const balanced = Boolean(ctx.balanced);
  const candidates = [];
  let producer = null;
  for (const p of DRILL_PRODUCERS) {
    if (balanced && p.learnerSpecific) continue;
    let built = null;
    try { built = p.build(ctx) || null; } catch { built = null; }
    if (!built || (Array.isArray(built) && built.length === 0)) continue;
    const list = Array.isArray(built) ? built : [built];
    const sorted = applyCalibration(list, ctx.calibration || { ready: false, weights: {} })
      .map((c) => ({ ...c, source: c.source || p.id }));
    if (!candidates.length) producer = p.id;
    candidates.push(...sorted);
  }
  return { candidates, top: candidates[0] || null, producer };
}

/**
 * Probe what this session can actually run, given the environment and the
 * learner's current state. `hasAi` = API key, relay or mock mode — the same
 * gate the AI drill's own runner checks.
 */
export function probeCapabilities({
  hasAi = false,
  hasScenario = false,
  concept = null,
  pendingRetypes = 0,
  srsDue = 0,
  listeningTrack = null,
  recentCorrections = 0,
} = {}) {
  const authored = concept ? authoredDrillFor(concept) : null;
  const trainer = concept ? trainerDrillFor(concept) : null;
  const dictation = concept ? dictationDrillFor(concept) : null;
  const accent = concept ? accentDrillFor(concept) : null;
  return {
    concept: concept || null,
    'ai-drill': Boolean(hasAi) && Boolean(concept),
    'conj-drill': Boolean(trainer),
    'dictation-drill': Boolean(dictation),
    'accent-drill': Boolean(accent),
    'authored-drill': Boolean(authored),
    'retype': pendingRetypes > 0,
    'srs-retrieval': srsDue > 0,
    'listen': Boolean(listeningTrack),
    'review': recentCorrections > 0,
    'speak': hasScenario,
    authoredDrill: authored,
    trainerDrill: trainer,
    dictationDrill: dictation,
    accentDrill: accent,
  };
}

/**
 * The ordered drill payloads that can actually run, best first. Each payload
 * carries the remaining chain so a runtime failure (e.g. the AI drill returns
 * nothing mid-session) can fall through without an "unavailable" screen.
 */
export function drillChain(caps) {
  const chain = [];
  if (caps['conj-drill']) {
    chain.push({ kind: 'conj-drill', verb: caps.trainerDrill.verb, tense: caps.trainerDrill.tense, personIndex: caps.trainerDrill.personIndex });
  }
  if (caps['dictation-drill']) chain.push({ kind: 'dictation-drill' });
  if (caps['accent-drill']) chain.push({ kind: 'accent-drill' });
  if (caps['ai-drill']) {
    chain.push({ kind: 'ai-drill', concept: caps.concept ?? null });
  }
  if (caps['authored-drill']) {
    chain.push({ kind: 'authored-drill', topicId: caps.authoredDrill.topicId, title: caps.authoredDrill.title, exercises: caps.authoredDrill.exercises });
  }
  if (caps['retype']) chain.push({ kind: 'retype' });
  if (caps['srs-retrieval']) chain.push({ kind: 'srs-retrieval', cardCap: Math.max(3, caps.srsDue ? Math.min(6, caps.srsDue) : 3) });
  if (caps['listen']) chain.push({ kind: 'listen', track: caps.listeningTrack });
  if (caps['review']) chain.push({ kind: 'review', count: Math.min(6, caps.recentCorrections) });
  return chain.map((payload, i) => ({ ...payload, fallbacks: chain.slice(i + 1).map((p) => p.kind) }));
}

/** Next link in the chain after `kind` failed at runtime. Pure. */
export function nextFallback(chain, kind) {
  const idx = chain.findIndex((p) => p.kind === kind);
  if (idx < 0) return null;
  return chain[idx + 1] || null;
}

/**
 * Given the curriculum plan and the capability set, return a plan whose
 * segments can all run:
 *   - a drill segment gets its resolved payload (first chain link) plus the
 *     full chain for runtime fallback;
 *   - a speak segment without a scenario is dropped (its minutes re-flow to
 *     the next runnable segment) rather than rendering a hole;
 *   - a listen segment without a track is dropped the same way.
 * The result is always a complete session — never an unavailable segment.
 */
export function resolvePlanCapabilities(plan, caps) {
  if (!plan || !Array.isArray(plan.segments)) return plan;
  const segments = [];
  const skipped = [...(plan.skipped || [])];
  const chain = drillChain(caps);
  for (const seg of plan.segments) {
    if (seg.id === 'drill') {
      if (!chain.length) { skipped.push('drill'); continue; }
      segments.push({
        ...seg,
        payload: { ...chain[0], chain, concept: caps.concept ?? chain[0].concept ?? null },
      });
      continue;
    }
    if (seg.id === 'speak' && !caps.speak) { skipped.push('speak'); continue; }
    if (seg.id === 'listen' && (!seg.payload?.track || !caps.listen)) { skipped.push('listen'); continue; }
    segments.push(seg);
  }
  // Re-flow minutes from dropped segments into the largest remaining one so
  // the session still fills its budget.
  const planned = segments.reduce((a, s) => a + (s.minutes || 0), 0);
  const missing = Math.max(0, (plan.totalMinutes || 0) - planned);
  if (missing > 0 && segments.length) {
    const biggest = segments.reduce((a, b) => ((b.minutes || 0) > (a.minutes || 0) ? b : a));
    biggest.minutes = (biggest.minutes || 0) + missing;
  }
  if (!segments.length && chain.length) {
    segments.push({ id: 'drill', label: 'Targeted drill', minutes: plan.totalMinutes || 5, payload: { ...chain[0], chain }, why: 'Targeted practice while speaking is unavailable.' });
  }
  return {
    ...plan,
    segments,
    skipped: [...new Set(skipped)],
    totalMinutes: segments.reduce((a, s) => a + (s.minutes || 0), 0),
  };
}
