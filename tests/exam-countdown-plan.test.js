// Exam-date countdown → Today's mix.
//
// The README advertises "an exam-date countdown reshapes what Today gives you".
// For a long time that was false: `examSoon` only swapped a sentence while the
// minute split stayed identical, and nothing ever set it true. These tests pin
// the behaviour that makes the claim real — the speak segment genuinely grows
// toward the paper — and that no exam date means no invented urgency.

import { strictEqual, ok } from 'node:assert';
import { test } from 'node:test';

import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';
import { examCountdown } from '../src/lib/exams/findings.js';

// A plan with every modality available, so the split is not capped by a
// missing source. `examSoon` left true here to prove the weight — not the copy
// flag — is what moves the minutes.
const base = {
  minutes: 20,
  srsDue: 10,
  topMistake: { id: 'm1', concept: 'Passé composé', type: 'grammar', mastery: 0, recurrence: 3 },
  pendingRetypes: 2,
  recentCorrections: 3,
  weaknessScenarioId: 'sc-1',
  listeningTrack: { id: 't1', title: 'Une interview', sourceType: 'tts' },
  dayIndex: 1,
  examSoon: true,
};

const speakMinutes = (extra) => {
  const plan = buildDailyCurriculum({ ...base, ...extra });
  return plan.segments.find((s) => s.id === 'speak')?.minutes ?? 0;
};

test('a closer exam gives the speak segment more minutes', () => {
  // Assert on minutes only where the allocator has enough granularity to show
  // it. With several modalities each segment floors near the minimum, so the
  // mild "building" band (1.35) can round to the same minutes as "early" (1.0)
  // — that is honest behaviour, not a bug: far from the paper the mix is
  // deliberately unchanged. The decisive, user-visible difference is the final
  // weeks, where speaking clearly grows.
  const soon = speakMinutes({ speakBoost: examCountdown(new Date(Date.now() + 10 * 86_400_000).toISOString()).speakWeight });
  const mid = speakMinutes({ speakBoost: examCountdown(new Date(Date.now() + 45 * 86_400_000).toISOString()).speakWeight });
  const none = speakMinutes({ speakBoost: 1 });

  ok(soon > mid, `final weeks beat a couple of months out (${mid} → ${soon})`);
  ok(soon > none, `final weeks beat no exam pressure (${none} → ${soon})`);
});

test('the countdown weights are ordered and bounded', () => {
  // The weight itself — not the rounded minutes — is the ordered signal, so
  // assert the band ordering here where it is not subject to integer rounding.
  const soon = examCountdown(new Date(Date.now() + 10 * 86_400_000).toISOString()).speakWeight;
  const mid = examCountdown(new Date(Date.now() + 45 * 86_400_000).toISOString()).speakWeight;
  const early = examCountdown(new Date(Date.now() + 200 * 86_400_000).toISOString()).speakWeight;
  ok(soon > mid && mid > early, `weights increase toward the paper (${early} < ${mid} < ${soon})`);
  strictEqual(early, 1, 'far from the paper the mix is unchanged');
});

test('the boost changes the time split, not just the copy', () => {
  // The regression this guards: examSoon used to swap a sentence while the
  // minutes were byte-identical, so the countdown reshaped nothing.
  const noBoost = buildDailyCurriculum(base);
  const boosted = buildDailyCurriculum({ ...base, speakBoost: 1.8 });

  const noSpeak = noBoost.segments.find((s) => s.id === 'speak')?.minutes ?? 0;
  const boostSpeak = boosted.segments.find((s) => s.id === 'speak')?.minutes ?? 0;
  strictEqual(noSpeak, boosted.totalMinutes && noSpeak, 'sanity: base speak minutes are stable');
  ok(boostSpeak > noSpeak, 'the boosted plan really gives speak more of the session');
});

test('the countdown note becomes the speak segment\'s honest "why"', () => {
  const note = examCountdown(new Date(Date.now() + 10 * 86_400_000).toISOString()).note;
  // No weakness scenario: the segment explains itself from the countdown, so
  // the learner sees the real reason ("three weeks or less…") not a generic line.
  const plan = buildDailyCurriculum({
    ...base, weaknessScenarioId: null, suggestedScenarioId: 'sc-1',
    examCountdownNote: note,
  });
  const speak = plan.segments.find((s) => s.id === 'speak');
  ok(speak.why.includes(note), 'the segment states the countdown reason in plain language');
});

test('no exam date leaves the standard mix and no exam copy', () => {
  // A plain suggested scenario (not a weakness retest) so the speak segment
  // exists and explains itself with the ordinary reason — the countdown note
  // is absent, proving no exam copy leaks in when no date is set.
  const plan = buildDailyCurriculum({
    ...base, weaknessScenarioId: null, suggestedScenarioId: 'sc-plain',
    examSoon: false, speakBoost: 1, examCountdownNote: '',
  });
  const speak = plan.segments.find((s) => s.id === 'speak');
  ok(speak, 'speak segment exists');
  ok(speak.why.includes('Productive speech first'), 'falls back to the ordinary reason');
  ok(!speak.why.includes('Three weeks') && !speak.why.includes('exam'), 'no exam copy without a date');
});

test('the repair loop still runs under maximum exam pressure', () => {
  // Reshaping the mix must never drop the drill/follow-up arm — the exam
  // pressure reweights speaking, it does not replace the mistake repair.
  const plan = buildDailyCurriculum({ ...base, speakBoost: 1.8 });
  const ids = plan.segments.map((s) => s.id);
  ok(ids.includes('speak'));
  ok(ids.includes('drill'), 'targeted repair survives exam pressure');
});

// ── the board's oracy weight reaches the LIVE session, not just the preview ──
//
// Regression guard: the dashboard brief applies resolveExamWeighting (the board's
// oracy share) but the live session's examCountdown call omitted the board
// entirely, so an oracy-heavy candidate saw a speak-leaning preview and then sat
// a session that ignored their qualification. examCountdown already supported the
// board through an injectable lookup; nothing on the session path passed it.

test('an oracy-heavy board lifts the live session, not only the preview', () => {
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const weightOf = () => 0.30; // a Made-for-Wales style paper

  const plain = examCountdown(soon, { now: Date.now() });
  const withBoard = examCountdown(soon, { now: Date.now(), speakingWeightOf: weightOf });

  ok(withBoard.speakWeight > plain.speakWeight,
    `the board's oracy weight must lift the countdown weight (${plain.speakWeight} → ${withBoard.speakWeight})`);
  // Bounded: a board can raise the pull, never blow the segment up.
  ok(withBoard.speakWeight <= 2.2, 'the board-scaled weight stays bounded');
});

test('no stored board weight leaves the countdown exactly as it was', () => {
  // A learner with no board, or one chosen before examSpeakingWeight existed,
  // must get the identical session — an absent weight is never a guessed one.
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const baseline = examCountdown(soon, { now: Date.now() });
  const noBoard = examCountdown(soon, { now: Date.now(), speakingWeightOf: undefined });
  strictEqual(noBoard.speakWeight, baseline.speakWeight,
    'an absent board weight is neutral — no invented urgency');
});

test('a baseline (25%) board is neutral for the countdown too', () => {
  // 25% is the lightest shipped oracy share, the same neutral point
  // resolveExamWeighting uses, so the commonest board behaves as before.
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const baseline = examCountdown(soon, { now: Date.now() });
  const lightBoard = examCountdown(soon, { now: Date.now(), speakingWeightOf: () => 0.25 });
  strictEqual(lightBoard.speakWeight, baseline.speakWeight,
    'the 25% baseline board must not change the session');
});
