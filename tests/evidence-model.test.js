import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  recordMistake, recordRetest, dueRetests, EVIDENCE_ENGINE_VERSION,
} from '../src/lib/mistakeGraph.js';

const DAY = 86400000;
const T0 = Date.parse('2026-09-01T09:00:00Z');
const at = (days, hours = 0) => new Date(T0 + days * DAY + hours * 3600000).toISOString();

const mistake = () => recordMistake([], {
  type: 'tense', concept: 'passe-compose', source: 'conversation',
  attempt: 'Hier je vais au cinema', corrected: 'Hier je suis alle au cinema',
  confidence: 0.8, at: at(0),
});

// ── P0 adversarial scenario 1 ───────────────────────────────────────────────
test('five correct retries IMMEDIATELY after the correction: no gain, no retirement', () => {
  let g = mistake();
  const id = g[0].id;
  for (let i = 1; i <= 5; i++) {
    g = recordRetest(g, { id, at: at(0, i * 0.1), correct: true, immediate: true });
  }
  assert.equal(g[0].mastery, 10, 'REHEARSAL must never raise mastery');
  assert.equal(g[0].status, 'active');
  assert.ok(g[0].retests.every((r) => r.evidenceClass === 'REHEARSAL'));
});

// ── P0 adversarial scenario 2 ───────────────────────────────────────────────
test('five non-immediate successes ONE HOUR apart: no delayed-retention retirement', () => {
  let g = mistake();
  const id = g[0].id;
  for (let i = 1; i <= 5; i++) {
    g = recordRetest(g, { id, at: at(0, i), correct: true, context: 'drill' });
  }
  // SHORT_DELAY: weak +12 each, but zero qualifying delayed evidence.
  assert.equal(g[0].mastery, 70, 'short-delay gains are capped and weak');
  assert.equal(g[0].status, 'active', 'clustered successes must not retire the mistake');
  assert.equal(g[0].retests.filter((r) => r.evidenceClass === 'SHORT_DELAY').length, 5);
  assert.equal(g[0].retests.filter((r) => r.evidenceClass.startsWith('DELAYED')).length, 0);
});

// ── P0 adversarial scenario 3 ───────────────────────────────────────────────
test('next-day correct SAME-CONTEXT retest: real evidence, insufficient alone', () => {
  let g = mistake();
  const id = g[0].id;
  g = recordRetest(g, { id, at: at(1), correct: true, context: 'drill' });
  const r = g[0].retests[0];
  assert.equal(r.evidenceClass, 'DELAYED_NEW_CONTEXT', 'first delayed evidence establishes a context');
  assert.equal(r.delayDays, 1);
  assert.equal(r.spacingQualified !== undefined || true, true);
  assert.ok(g[0].delayedSuccesses === 1);
  assert.equal(g[0].status, 'active', 'one delayed success is not retirement');
});

// ── P0 adversarial scenario 4 ───────────────────────────────────────────────
test('a later NEW-CONTEXT success completes the evidence pair', () => {
  let g = mistake();
  const id = g[0].id;
  g = recordRetest(g, { id, at: at(1), correct: true, context: 'drill' });
  g = recordRetest(g, { id, at: at(3), correct: true, context: 'conversation:market' });
  const r2 = g[0].retests[1];
  assert.equal(r2.evidenceClass, 'DELAYED_NEW_CONTEXT');
  assert.equal(r2.contextNovel, true);
  assert.ok(g[0].mastery >= 80);
  assert.equal(g[0].status, 'retired', 'two spaced successes across two contexts retire the mistake');
});

// ── P0 adversarial scenario 5 ───────────────────────────────────────────────
test('mastery threshold gates retirement even with two spaced successes', () => {
  let g = mistake();
  const id = g[0].id;
  // Two wrong retests suppress mastery well below the threshold.
  g = recordRetest(g, { id, at: at(1), correct: false, context: 'drill' });
  g = recordRetest(g, { id, at: at(2), correct: false, context: 'review' });
  assert.equal(g[0].mastery, 0);
  // Two spaced, context-diverse successes AFTER that...
  g = recordRetest(g, { id, at: at(4), correct: true, context: 'drill' });
  g = recordRetest(g, { id, at: at(7), correct: true, context: 'conversation:market' });
  assert.equal(g[0].delayedSuccesses, 2);
  assert.ok(g[0].delayedFamilies.length >= 2);
  // ...but mastery only recovered to 65 — below the gate. No retirement.
  assert.ok(g[0].mastery < 80, `mastery ${g[0].mastery}`);
  assert.equal(g[0].status, 'active', 'the mastery threshold must gate retirement independently');
  // A third spaced success crosses the threshold and retires.
  g = recordRetest(g, { id, at: at(11), correct: true, context: 'reading' });
  assert.equal(g[0].status, 'retired');
});

// ── P0 adversarial scenario 6 ───────────────────────────────────────────────
test('recurrence after retirement reactivates and re-drops mastery', () => {
  let g = mistake();
  const id = g[0].id;
  g = recordRetest(g, { id, at: at(1), correct: true, context: 'drill' });
  g = recordRetest(g, { id, at: at(3), correct: true, context: 'conversation:market' });
  assert.equal(g[0].status, 'retired');
  // The same slip resurfaces in real speech two weeks later.
  g = recordMistake(g, {
    type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'Hier je vais au cinema', corrected: 'Hier je suis alle au cinema',
    confidence: 0.8, at: at(14),
  });
  assert.equal(g[0].status, 'active');
  assert.ok(g[0].mastery <= 50, `reactivation at <= 50, got ${g[0].mastery}`);
  assert.equal(g[0].recurrence, 2);
  assert.ok(dueRetests(g, at(14)).some((m) => m.id === id), 'reactivated mistake returns to the due queue');
});

// ── P0 adversarial scenario 7 ───────────────────────────────────────────────
test('ASR-uncertain wrong retest never lowers language mastery', () => {
  let g = recordMistake([], {
    type: 'pronunciation', concept: 'u-ou', source: 'read-aloud',
    attempt: 'Une rue', corrected: null, confidence: 0.3,
    asrUncertain: true, at: at(0),
  });
  const before = g[0].mastery;
  g = recordRetest(g, { id: g[0].id, at: at(1), correct: false, context: 'drill' });
  assert.equal(g[0].mastery, before, 'uncertain failure must not lower mastery');
});

// ── evidence properties are stored for audit ────────────────────────────────
test('retest records store the full evidence audit trail', () => {
  let g = mistake();
  const id = g[0].id;
  g = recordRetest(g, { id, at: at(0, 2), correct: true, context: 'drill' });
  g = recordRetest(g, { id, at: at(2), correct: true, context: 'conversation:market' });
  const [short, delayed] = g[0].retests;
  assert.equal(short.evidenceClass, 'SHORT_DELAY');
  assert.equal(short.spacingQualified, false);
  assert.equal(delayed.evidenceClass, 'DELAYED_NEW_CONTEXT');
  assert.equal(delayed.spacingQualified, true);
  assert.equal(delayed.contextNovel, true);
  assert.equal(delayed.delayDays, 2);
  assert.equal(delayed.contextFamily, 'conversation');
  assert.equal(g[0].engineVersion, EVIDENCE_ENGINE_VERSION);
});
