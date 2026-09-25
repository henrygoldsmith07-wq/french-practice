// Learning-evidence identity — the provenance every recovery signal carries.
//
// The recovery loop resolves a weakness on independent evidence: a genuine
// delayed recall, or multiple successful recalls from DISTINCT encounters.
// "Encounter" = one presentation of a drill to the learner (one conversation
// turn, one card presentation, one quiz question). Re-answering the SAME
// drill — a redo of the same turn, a re-rate of the same presentation — is
// the same encounter and must never count twice toward mastery.
//
//   sessionId   — one app visit (page load). Two successes sharing only a
//                 session are same-session evidence; a success from another
//                 session is structurally separated in time.
//   encounterId — one drill presentation, unique per presentation. Deduping
//                 by encounterId is what makes "independent" mean something.
//   activityId  — the drill the evidence came from (scenario id, card key…).
//
// Identity is always OPTIONAL evidence metadata: callers who cannot know it
// simply omit it, and the learner model treats unknown-identity evidence
// conservatively (it can extend "improving", never by itself prove mastery).

let session = null;
let counter = 0;

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  const randomness = uuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomness}`;
}

/** The evidence session id for this app visit (stable across the page). */
export function currentSessionId() {
  if (!session) session = makeId('ses');
  return session;
}

/**
 * A fresh encounter id for one drill presentation. Stable per presentation:
 * keep it and reuse it if the SAME presentation produces more than one
 * evidence event (e.g. a redo of the same conversation turn).
 */
export function newEncounterId() {
  counter += 1;
  return `${currentSessionId()}:enc${counter}`;
}

/**
 * `newEncounterId` for refs: create the id AND return it in one call.
 * Producers bind one encounter per presentation by initialising a ref with
 * this, then re-minting with `newEncounterId()` only when the presentation
 * itself changes. `peek` makes the pure rule testable without a UI: the
 * SAME ref keeps returning the same id across every "retry" of that
 * presentation, and a new id only appears after the presentation changes.
 */
export function peekEncounterId() {
  return newEncounterId();
}

/** The evidence-identity fields an evidence event may carry. */
export function evidenceIdentity({ sessionId, encounterId, activityId } = {}) {
  const pick = (v) => {
    const s = String(v || '').trim();
    return s ? s.slice(0, 80) : null;
  };
  return { sessionId: pick(sessionId), encounterId: pick(encounterId), activityId: pick(activityId) };
}

/**
 * The dedupe key for "one independent encounter". Only an explicit
 * encounterId can prove two successes are the same encounter — and only an
 * explicit encounterId can prove they are different ones. Anything else
 * stays identity-less and the model refuses to invent independence.
 */
export function encounterKeyOf(identity) {
  return identity && identity.encounterId ? `enc:${identity.encounterId}` : null;
}
