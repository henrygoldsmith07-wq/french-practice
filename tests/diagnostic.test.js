// The spoken diagnostic — first real evidence a new learner produces.
//
// These tests pin the honesty rules that make the diagnostic trustworthy:
// one sample names a candidate weakness and schedules a FUTURE re-check, but
// can never mark anything fixed, and never invents a gap from silence.

import { strictEqual, ok } from 'node:assert';
import { test } from 'node:test';

import {
  diagnoseSpeaking, weakestDimension, DIAGNOSTIC_RECHECK_DAYS,
} from '../src/lib/diagnostic.js';

// ---- weakest-dimension selection -------------------------------------------

test('picks the genuinely weakest dimension', () => {
  const w = weakestDimension({ accuracy: 30, fluency: 70, vocabulary: 55 });
  strictEqual(w.id, 'accuracy');
  strictEqual(w.category, 'grammar');
});

test('a strong sample names no weakness', () => {
  strictEqual(weakestDimension({ accuracy: 85, fluency: 90, vocabulary: 88 }), null);
});

test('ignores dimensions with no score', () => {
  // Only accuracy is present; fluency/vocabulary/pronunciation are absent.
  const w = weakestDimension({ accuracy: 40 });
  strictEqual(w.id, 'accuracy');
});

test('clamps scores and never returns NaN', () => {
  // A raw 999 is not weak — it clamps to 100, which is a strength, so no
  // weakness is named. Use a low out-of-range value to check the clamp.
  const w = weakestDimension({ fluency: -50 });
  strictEqual(w.score, 0, 'a negative score clamps up to 0, still the weakest');
  strictEqual(w.id, 'fluency');
});

// ---- the diagnostic finding -------------------------------------------------

test('a weak sample produces a named weakness and a future re-check', () => {
  const now = Date.now();
  const out = diagnoseSpeaking(
    { transcript: 'Je suis allé au cinéma hier', accuracy: 35, fluency: 80 },
    { now, recordError: () => ({ id: 'grammar:diagnostic:accuracy', status: 'active' }) },
  );
  ok(out.finding, 'a weakness is named');
  strictEqual(out.finding.category, 'grammar');
  strictEqual(out.finding.mode, 'diagnostic');
  strictEqual(out.finding.source, 'spoken-diagnostic');
  ok(out.recheckAt, 'a re-check is scheduled');
  strictEqual(new Date(out.recheckAt).getTime(), now + DIAGNOSTIC_RECHECK_DAYS * 86_400_000);
});

test('the re-check is always in the FUTURE, never today', () => {
  // A check that fired immediately would be a re-take, not a retest.
  const now = Date.now();
  const out = diagnoseSpeaking(
    { transcript: 'un essai', accuracy: 20 },
    { now, recordError: () => null },
  );
  ok(new Date(out.recheckAt).getTime() > now, 're-check is after the diagnostic moment');
  ok(DIAGNOSTIC_RECHECK_DAYS >= 1, 'and at least a day out');
});

test('the note names the gap and when it will be re-checked', () => {
  const out = diagnoseSpeaking(
    { transcript: 'je parle un peu', accuracy: 40 },
    { recordError: () => null },
  );
  ok(out.note.includes('grammar'), 'names the weakness in plain language');
  ok(/day/.test(out.note), 'states when it will be re-checked');
});

// ---- honesty: silence and strong samples invent nothing ---------------------

test('an empty transcript names no weakness and schedules no re-check', () => {
  const out = diagnoseSpeaking({ transcript: '   ', accuracy: 10 }, { recordError: () => null });
  strictEqual(out.finding, null);
  strictEqual(out.recheckAt, null);
  ok(out.note.toLowerCase().includes('nothing'), 'says there is nothing to diagnose');
});

test('a strong transcript says solid-start, not a manufactured gap', () => {
  const out = diagnoseSpeaking(
    { transcript: 'une phrase correcte', accuracy: 92, fluency: 88 },
    { recordError: () => null },
  );
  strictEqual(out.finding, null);
  strictEqual(out.recheckAt, null);
  ok(out.note.toLowerCase().includes('solid'), 'honest about a strong start');
});

// ---- the recording is injectable and feeds the shared model -----------------

test('the finding is passed to the recorder exactly once', () => {
  const seen = [];
  diagnoseSpeaking(
    { transcript: 'j\'ai mal dit', accuracy: 30 },
    { recordError: (finding, opts) => { seen.push([finding, opts]); return { id: 'x', status: 'active' }; } },
  );
  strictEqual(seen.length, 1);
  strictEqual(seen[0][0].category, 'grammar');
  ok(seen[0][1].at, 'an explicit timestamp is passed for a stable record');
});

test('a recording failure still returns the finding, never throws', () => {
  // storage unavailable must not lose the learner's first result
  const out = diagnoseSpeaking(
    { transcript: 'un essai', accuracy: 25 },
    { recordError: () => { throw new Error('storage down'); } },
  );
  ok(out.finding, 'finding survives a recorder failure');
  strictEqual(out.recorded, null);
});

test('one sample can never resolve a weakness — it records an error only', () => {
  // The recorder is only ever called for the finding; there is no success path
  // here, so a single spoken sample cannot flip anything to fixed/mastered.
  let recordedKind = null;
  diagnoseSpeaking(
    { transcript: 'je suis', accuracy: 90, fluency: 90, vocabulary: 90, pronunciation: 95 },
    { recordError: (f) => { recordedKind = f.kind || 'error'; return null; } },
  );
  strictEqual(recordedKind, null, 'a strong sample records nothing at all');
});
