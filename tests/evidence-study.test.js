import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  enrolStudy, withdrawStudy, isEnrolled, studyDay, assignArm,
  isCheckDay, buildHeldOutPool, makeCheckRecord, recordCheckResult, checkScore,
  makeOutcomeRecord, applyRetestToOutcome, applyRecurrenceToOutcome,
  studyAggregates, personalOutcomes,
  MIN_N_PER_ARM, MIN_TRANSFER_N,
} from '../src/lib/evidenceStudy.js';

const T0 = Date.parse('2026-09-01T09:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;

// ── enrolment ──────────────────────────────────────────────────────────────

test('enrolment generates an anonymous id, freezes start level and locks the arm', () => {
  const s = enrolStudy(null, { syncId: 'device-42', startLevel: 'B1', startTheta: 0.4, seed: 'participant-abc', now: T0 });
  assert.equal(s.participantId, 'participant-abc');
  assert.equal(s.startLevel, 'B1');
  assert.equal(s.startTheta, 0.4);
  assert.equal(s.status, 'active');
  assert.ok(['adaptive', 'balanced'].includes(s.arm), 'arm is one of the two');
  assert.equal(s.enrolledAt, iso(T0));
  assert.ok(s.weeks >= 4 && s.weeks <= 26);
});

test('re-enrolment while active is a no-op (no participant forking)', () => {
  const s = enrolStudy(null, { seed: 'participant-abc', now: T0 });
  const s2 = enrolStudy(s, { seed: 'participant-zzz', now: T0 + 1000 });
  assert.equal(s2, s, 'same object returned');
  assert.equal(s2.participantId, 'participant-abc');
});

test('invalid start levels are dropped, not coerced', () => {
  const s = enrolStudy(null, { seed: 'p1', startLevel: 'Z9', now: T0 });
  assert.equal(s.startLevel, null);
});

test('withdrawal stops collection but preserves the record', () => {
  const s = enrolStudy(null, { seed: 'p1', now: T0 });
  const w = withdrawStudy(s, { now: T0 + 5 * DAY });
  assert.equal(w.status, 'withdrawn');
  assert.ok(w.withdrawnAt);
  assert.equal(isEnrolled(w), false);
  assert.equal(withdrawStudy(w), w, 'already withdrawn is a no-op');
});

test('study day counts whole days since enrolment', () => {
  const s = enrolStudy(null, { seed: 'p1', now: T0 });
  assert.equal(studyDay(s, T0), 0);
  assert.equal(studyDay(s, T0 + 17 * DAY + 3600000), 17);
  assert.equal(studyDay(null, T0), null);
});

test('arm assignment is deterministic per participant and never flips', () => {
  const a1 = assignArm('participant-abc', 'device-42');
  const a2 = assignArm('participant-abc', 'device-42');
  assert.equal(a1.arm, a2.arm);
  const arms = new Set(Array.from({ length: 40 }, (_, i) => assignArm(`participant-${i}`, 'd').arm));
  assert.ok(arms.has('adaptive') && arms.has('balanced'), 'both arms get participants');
});

// ── held-out schedule + pool ───────────────────────────────────────────────

test('check days are deterministic, periodic, and never in the warm-up', () => {
  const pid = 'participant-abc';
  const days = Array.from({ length: 30 }, (_, d) => isCheckDay(pid, d));
  assert.equal(days[0], false, 'day 0 is warm-up');
  assert.equal(days[1], false, 'day 1 is warm-up');
  const checkDays = days.flatMap((v, d) => (v ? [d] : []));
  assert.ok(checkDays.length >= 5, 'roughly every 3rd day');
  for (let i = 1; i < checkDays.length; i++) {
    const gap = checkDays[i] - checkDays[i - 1];
    assert.ok(gap >= 1 && gap <= 3, `gap ${gap} within phase window`);
  }
  assert.deepEqual(days, Array.from({ length: 30 }, (_, d) => isCheckDay(pid, d)), 'stable across calls');
});

test('held-out pool only contains unseen vocabulary at the learner level', () => {
  const vocabEntries = [
    { id: 'a1-1', cefr: 'A1', fr: 'bonjour' },
    { id: 'b1-1', cefr: 'B1', fr: 'toutefois' },
    { id: 'free-1', fr: 'grincer' },
    { id: 'free-2', fr: 'affleurer' },
    { id: 'seen-1', fr: 'déjà-vu' },
  ];
  const pool = buildHeldOutPool({
    participantId: 'p1', day: 3, level: 'B1', vocabEntries,
    srsMap: { 'free-2': { interval: 3 }, 'seen-1': { interval: 1 } },
    listeningTracks: [],
  });
  const ids = pool.words.map((w) => w.id);
  assert.ok(!ids.includes('seen-1'), 'already-seen words excluded');
  assert.ok(!ids.includes('free-2'), 'srs entries excluded');
  assert.ok(!ids.includes('b1-1'), 'banded level words are curriculum, not held-out');
  assert.ok(ids.includes('free-1'), 'unseen unbanded words included');
});

test('pool selection is stable per (participant, day) — reload cannot reshuffle', () => {
  const vocabEntries = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}`, fr: `mot${i}` }));
  const args = { participantId: 'p9', day: 6, vocabEntries, listeningTracks: [{ id: 't1' }, { id: 't2' }] };
  const a = buildHeldOutPool({ ...args, srsMap: {} });
  const b = buildHeldOutPool({ ...args, srsMap: {} });
  assert.deepEqual(a.words.map((w) => w.id), b.words.map((w) => w.id));
  assert.equal(a.track?.id, b.track?.id);
});

test('check records are measurement-only and score correctly', () => {
  const vocabEntries = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, fr: `mot${i}` }));
  const pool = buildHeldOutPool({ participantId: 'p1', day: 2, vocabEntries, listeningTracks: [{ id: 'tr1' }] });
  assert.ok(pool.words.length >= 2, 'fixture sanity: pool has words');
  let chk = makeCheckRecord({ participantId: 'p1', day: 2, pool, now: T0 });
  assert.equal(chk.results, null, 'results start empty');
  assert.equal(checkScore(chk), null);
  chk = recordCheckResult(chk, { correct: 4, total: 5, secondsSpent: 90 });
  assert.equal(checkScore(chk), 80);
  assert.equal(chk.results.secondsSpent, 90);
  assert.equal(chk.wordIds.length, pool.words.length, 'word ids frozen');
  assert.equal(chk.trackId, 'tr1');
  const bad = recordCheckResult(chk, { correct: -3, total: 'x' });
  assert.equal(bad.results.total, 0, 'malformed input clamps, never fabricates');
});

// ── outcome windows ────────────────────────────────────────────────────────

function mkOutcome() {
  return makeOutcomeRecord({
    trial: { at: iso(T0), activity: 'ai-drill', variant: 'adaptive', selectedId: 'mg-1', selectedConcept: 'passe-compose', masteryBefore: 30 },
    graphNode: { concept: 'passe-compose', type: 'tense' },
    now: T0,
  });
}

test('immediate retries land in `immediate`, never the retention windows', () => {
  const o = mkOutcome();
  applyRetestToOutcome(o, { at: iso(T0 + 120000), correct: true, immediate: true });
  assert.equal(o.immediate.correct, true);
  assert.equal(o.delayedShort, null);
  assert.equal(o.delayedLong, null);
  // evidenceClass REHEARSAL also guards even without the immediate flag
  const o2 = mkOutcome();
  applyRetestToOutcome(o2, { at: iso(T0 + 120000), correct: true, evidenceClass: 'REHEARSAL' });
  assert.equal(o2.immediate.correct, true);
  assert.equal(o2.delayedShort, null);
});

test('1–3 day retests are short-delay retention; 7d+ are long-delay', () => {
  const o = mkOutcome();
  applyRetestToOutcome(o, { at: iso(T0 + 2 * DAY), correct: true, evidenceClass: 'DELAYED' });
  assert.equal(o.delayedShort.correct, true);
  assert.equal(o.delayedLong, null);
  const o2 = mkOutcome();
  applyRetestToOutcome(o2, { at: iso(T0 + 9 * DAY), correct: false, evidenceClass: 'DELAYED' });
  assert.equal(o2.delayedShort, null, 'beyond 3d is not short-delay');
  assert.equal(o2.delayedLong.correct, false);
});

test('retests sooner than 1 day are neither immediate nor retention', () => {
  const o = mkOutcome();
  applyRetestToOutcome(o, { at: iso(T0 + 6 * 3600000), correct: true });
  assert.equal(o.immediate, null, 'not flagged immediate by the caller');
  assert.equal(o.delayedShort, null, 'but also too soon to be retention');
  assert.equal(o.delayedLong, null);
});

test('recurrence folds in as a boolean', () => {
  const o = mkOutcome();
  applyRecurrenceToOutcome(o, { recurred: true });
  assert.equal(o.recurred, true);
  applyRecurrenceToOutcome(o, { recurred: false });
  assert.equal(o.recurred, false);
});

// ── aggregates ─────────────────────────────────────────────────────────────

function armOutcomes(variant, count, { delayed = true, transfer = null, recurred = null } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const o = makeOutcomeRecord({
      trial: { at: iso(T0 - i), activity: 'ai-drill', variant, selectedId: `mg-${variant}-${i}`, selectedConcept: 'c' },
      now: T0,
    });
    if (delayed !== null) o.delayedShort = { correct: delayed, at: iso(T0 + 2 * DAY), delayDays: 2 };
    if (transfer != null) o.transfer = { score: transfer, checkId: `chk-${i}` };
    if (recurred != null) o.recurred = recurred;
    return o;
  });
}

test('aggregates print nothing until each arm clears the floor', () => {
  const few = [...armOutcomes('adaptive', MIN_N_PER_ARM - 1), ...armOutcomes('balanced', MIN_N_PER_ARM - 1)];
  const gated = studyAggregates(few);
  assert.equal(gated.adaptive.delayedShort.rate, null);
  assert.equal(gated.balanced.delayedShort.rate, null);
  assert.equal(gated.comparison.comparable, false);
  assert.match(gated.comparison.message, /needs at least/);
  const enough = [...armOutcomes('adaptive', MIN_N_PER_ARM, { delayed: true }), ...armOutcomes('balanced', MIN_N_PER_ARM, { delayed: false })];
  const open = studyAggregates(enough);
  assert.equal(open.adaptive.delayedShort.rate, 1);
  assert.equal(open.balanced.delayedShort.rate, 0);
  assert.equal(open.comparison.comparable, true);
  assert.match(open.comparison.message, /descriptive only/);
});

test('transfer and recurrence rates respect their own (lower) floors', () => {
  const rows = [...armOutcomes('adaptive', MIN_N_PER_ARM, { delayed: null }), ...armOutcomes('balanced', MIN_N_PER_ARM, { delayed: null })];
  const agg = studyAggregates(rows);
  assert.equal(agg.adaptive.transfer.rate, null, 'no transfer rows at all');
  const withFew = [...rows.slice(0, MIN_TRANSFER_N).map((o) => ({ ...o, transfer: { score: 70 } }))];
  const agg2 = studyAggregates(withFew);
  assert.equal(agg2.adaptive.transfer.rate, null, 'arm n still below MIN_N_PER_ARM');
});

test('personal outcomes are participant-level and sample-honest', () => {
  assert.equal(personalOutcomes([]).delayedShort, null);
  const rows = armOutcomes('adaptive', 4, { delayed: false });
  const p = personalOutcomes(rows);
  assert.equal(p.n, 4);
  assert.equal(p.delayedShort, 0);
  assert.equal(p.transfer, null, 'no transfer rows');
  const withT = rows.map((o, i) => ({ ...o, transfer: { score: [60, 70, 80, 90][i] } }));
  assert.equal(personalOutcomes(withT).transfer, 75);
});
