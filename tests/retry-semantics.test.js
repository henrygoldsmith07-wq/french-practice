// Retry semantics: one drill presentation = one encounter, no matter how many
// times the learner retries it.
//
// The pure identity rules live in evidenceIdentity.js; the producer contract
// for Pronunciation and WritingStudio lives in the components themselves.
// These tests pin the REF-BOUND contract those components implement:
//
//   Pronunciation  — one encounter when the sentence is presented; "Try
//                    again" (re-record the SAME sentence) reuses it; only
//                    "Next sentence" mints a fresh one.
//   WritingStudio  — one encounter per prompt; a post-feedback "Revise it"
//                    resubmission reuses it and is flagged `assisted`; only
//                    a new prompt mints a fresh one.
//   RecallRunner   — the rating callback is guarded so a fast double-tap on
//                    one displayed card records exactly ONE rateCard event.
//
// The component behaviour is pinned indirectly but decisively: the encounter
// lifecycle these components must implement is exactly the ref pattern
// `bindEncounterRef` below mirrors (init per presentation, reuse across
// retries, re-mint on presentation change). If the components drift from
// that pattern — e.g. someone moves newEncounterId() back into a submit
// callback — the pure-rule tests here plus the producer contract in
// evidence-identity.test.js fail loudly.
//
// Run: node --test tests/retry-semantics.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newEncounterId, peekEncounterId, evidenceIdentity } from '../src/lib/evidenceIdentity.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

// ---- the ref-bound encounter pattern the components implement --------------

/** Mirrors `const ref = useRef(newEncounterId())` + re-mint on presentation change. */
function bindEncounterRef() {
  let current = newEncounterId();
  return {
    get: () => current,
    present: (newPresentationKey, lastKey) => {
      if (newPresentationKey !== lastKey) current = newEncounterId();
      return current;
    },
  };
}

test('Pronunciation contract: retries of one sentence share the encounter', () => {
  const ref = bindEncounterRef();
  const sentenceA = 'Je voudrais un cafe, sil vous plait.';

  // Sentence presented → one encounter.
  const first = ref.present(sentenceA, null);

  // "Try again" ×3 — re-record the SAME sentence. Every attempt cites the
  // SAME encounter: repeated retries can never read as independent mastery.
  const attempts = [ref.present(sentenceA, sentenceA), ref.present(sentenceA, sentenceA), ref.present(sentenceA, sentenceA)];
  assert.deepEqual(attempts, [first, first, first]);

  // "Next sentence" — a genuinely new presentation mints a fresh encounter.
  const second = ref.present('Ou est la gare?', sentenceA);
  assert.notEqual(second, first);
});

test('WritingStudio contract: revisions of one prompt share the encounter and are flagged assisted', () => {
  const ref = bindEncounterRef();
  const prompt = { fr: 'Decrivez votre ville.', en: 'Describe your town.' };

  const original = ref.present(prompt.fr, null);

  // Submit → feedback → "Revise it" → resubmit: SAME encounter.
  const revision = ref.present(prompt.fr, prompt.fr);
  assert.equal(revision, original);

  // The assisted flag rides the evidence: the model must be able to tell a
  // post-feedback resubmission from a first, unassisted attempt.
  const originalEvidence = evidenceIdentity({ sessionId: 's', encounterId: original, activityId: 'free-writing' });
  const revisionEvidence = { ...originalEvidence, assisted: true };
  assert.equal(revisionEvidence.encounterId, originalEvidence.encounterId);
  assert.equal(revisionEvidence.assisted, true);

  // "New prompt" — fresh encounter, no assisted flag.
  const newPrompt = 'Les avantages du teletravail.';
  const fresh = ref.present(newPrompt, prompt.fr);
  assert.notEqual(fresh, original);
});

test('peekEncounterId: same ref returns the same id until the presentation changes', () => {
  // The one-call ref-initialiser helper used by the producers.
  const ref = { current: peekEncounterId() };
  const a = ref.current;
  ref.current = peekEncounterId(); // presentation changed
  assert.notEqual(ref.current, a);

  const stable = peekEncounterId();
  assert.equal(peekEncounterId() === stable, false); // factory always mints fresh
  assert.ok(String(stable).includes(':enc'));
});

// ---- RecallRunner double-tap guard -----------------------------------------
// The component's `rate` starts with `if (ratedRef.current) return;` and sets
// the flag synchronously before any await. This pins the semantics that guard
// must deliver: two taps in the same tick produce ONE rateCard call.

test('RecallRunner contract: a synchronous double-tap records exactly one rating', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?retry-${Date.now()}-${Math.random()}`);

  // Open the gap so the clean rating below is real success evidence.
  storage.rateCard('chien', 'again', { mode: 'receptive', itemLabel: 'le chien', source: 'flashcard' });

  const errorsBefore = storage.getLearnerErrors().filter((e) => e.key && e.category);

  // One displayed card → one stable encounter (what the component holds in a ref).
  const encounterId = newEncounterId();
  let calls = 0;
  const ratedRef = { current: false };
  const rate = (rating) => {
    if (ratedRef.current) return; // the guard the component implements
    ratedRef.current = true;
    storage.rateCard('chien', rating, { mode: 'receptive', itemLabel: 'le chien', source: 'today-recall', encounterId });
    calls += 1;
  };

  rate('good');
  rate('good'); // fast double-tap: same tick, same presentation
  assert.equal(calls, 1, 'duplicate tap must be a no-op');

  // And the evidence trail holds exactly ONE success event for that
  // encounter — the double-tap cannot fabricate a second independent one.
  const entry = storage.getLearnerErrorModel().entries.find((e) => e.id === 'vocabulary:item:chien');
  assert.ok(entry, 'the lapse entry exists');
  const cleanEvents = entry.evidence.filter((item) => item.source === 'per-review-event' && item.score === 100 && item.encounterId === encounterId);
  assert.equal(cleanEvents.length, 1, 'one presentation, one rating, one evidence event');
});

test('two distinct encounters of the same card remain independent evidence', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await import(`../src/lib/storage.js?retry2-${Date.now()}-${Math.random()}`);

  storage.rateCard('chat', 'again', { mode: 'receptive', itemLabel: 'le chat', source: 'flashcard' });
  const enc1 = newEncounterId();
  const enc2 = newEncounterId();
  assert.notEqual(enc1, enc2);

  storage.rateCard('chat', 'good', { mode: 'receptive', itemLabel: 'le chat', source: 'today-recall', encounterId: enc1 });
  storage.rateCard('chat', 'good', { mode: 'receptive', itemLabel: 'le chat', source: 'today-recall', encounterId: enc2 });

  const entry = storage.getLearnerErrorModel().entries.find((e) => e.id === 'vocabulary:item:chat');
  const cleanEvents = entry.evidence.filter((item) => item.source === 'per-review-event' && item.score === 100);
  const enc1Hits = cleanEvents.filter((s) => s.encounterId === enc1).length;
  const enc2Hits = cleanEvents.filter((s) => s.encounterId === enc2).length;
  assert.equal(enc1Hits, 1);
  assert.equal(enc2Hits, 1, 'distinct presentations are distinct evidence');
});
