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

import { GRAMMAR_TOPICS } from './grammar.js';
import { GRAMMAR_ALIASES } from './cefr.js';

export const DRILL_FALLBACK_ORDER = [
  'ai-drill', 'authored-drill', 'retype', 'srs-retrieval', 'listen', 'review',
];

const TOPIC_IDS = new Set(GRAMMAR_TOPICS.map((t) => t.id));

/** Normalise a mistake concept (AI topic id or free text) to a library topic id. */
export function conceptToTopicId(concept) {
  const c = String(concept || '').trim().toLowerCase();
  if (!c) return null;
  if (TOPIC_IDS.has(c)) return c;
  const alias = GRAMMAR_ALIASES[c];
  if (alias && TOPIC_IDS.has(alias)) return alias;
  // Loose containment: "passé composé" → passe-compose, "passe-compose vs
  // imparfait" → either topic; prefer the longest library id contained.
  const norm = (s) => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
  const target = norm(c);
  let best = null;
  for (const id of TOPIC_IDS) {
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
  const topic = GRAMMAR_TOPICS.find((t) => t.id === topicId);
  const drills = Array.isArray(topic?.drills) ? topic.drills.filter((d) => d && d.q && Array.isArray(d.options)) : [];
  if (!drills.length) return null;
  return { topicId, title: topic.title, exercises: drills.slice(0, 4) };
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
  return {
    concept: concept || null,
    'ai-drill': Boolean(hasAi) && Boolean(concept),
    'authored-drill': Boolean(authored),
    'retype': pendingRetypes > 0,
    'srs-retrieval': srsDue > 0,
    'listen': Boolean(listeningTrack),
    'review': recentCorrections > 0,
    'speak': hasScenario,
    authoredDrill: authored,
  };
}

/**
 * The ordered drill payloads that can actually run, best first. Each payload
 * carries the remaining chain so a runtime failure (e.g. the AI drill returns
 * nothing mid-session) can fall through without an "unavailable" screen.
 */
export function drillChain(caps) {
  const chain = [];
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
