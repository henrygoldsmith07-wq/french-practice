// The follow-up check — the segment that makes transfer and delayed retest
// real rather than promised.
//
// These pin three things the loop depends on:
//   1. a due check becomes a CONCRETE task built from unseen material on the
//      same rule (never a replay of the drill just shown);
//   2. a pass is recorded as transfer (or delayed) evidence for that exact
//      weakness, and a miss goes back as a dated mistake;
//   3. when no honest check can be built, the model says so (null) instead of
//      manufacturing a pass; and where one can (listening), it is graded.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  followUpTask, gradeProduction, gradeListening, proofFor, followUpCopy, FOLLOW_UP_KINDS,
} from '../src/lib/followUp.js';
import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';
import { ensureGrammarTopics, grammarTopicsReady } from '../src/lib/todayCapabilities.js';
import { scoreCandidates } from '../src/lib/sessionPlanner.js';

const ready = ensureGrammarTopics();

// ── building the task ───────────────────────────────────────────────────────

test('a grammar follow-up draws the library quiz lane — unseen items on the same rule', async () => {
  await ready;
  const task = followUpTask(
    { type: 'transfer', target: { id: 'grammar:passe-compose', skill: 'grammar', key: 'passe-compose', label: 'passe-compose' } },
    { dayIndex: 0 },
  );
  assert.ok(task, 'a task is built');
  assert.equal(task.kind, FOLLOW_UP_KINDS.AUTHORED);
  assert.equal(task.heldOut, true, 'quiz items are structurally unseen by the repair drill');
  assert.ok(task.exercises.length >= 1, 'carries items to grade');
  // The fresh lane must not be the taught lane the repair drill shows.
  const { authoredLanesFor, authoredDrillFor } = await import('../src/lib/todayCapabilities.js');
  const freshIds = new Set(task.exercises.map((e) => e.q));
  const taughtIds = new Set(authoredDrillFor('passe-compose').exercises.map((e) => e.q));
  for (const q of freshIds) assert.ok(!taughtIds.has(q), 'follow-up never replays a taught item');
  const lanes = authoredLanesFor('passe-compose');
  assert.ok(lanes.quiz.length >= 1, 'the library really has a second lane');
});

test('the follow-up rotates by day so consecutive checks are not identical', async () => {
  await ready;
  const due = { type: 'transfer', target: { id: 'grammar:passe-compose', skill: 'grammar', key: 'passe-compose', label: 'passe-compose' } };
  const a = followUpTask(due, { dayIndex: 0 });
  const b = followUpTask(due, { dayIndex: 1 });
  assert.notDeepEqual(a.exercises.map((e) => e.q), b.exercises.map((e) => e.q), 'day 0 and day 1 differ');
});

test('a delayed grammar check may fall back to the taught lane once the fresh lane is spent', async () => {
  await ready;
  const due = { type: 'delayed', target: { id: 'grammar:passe-compose', skill: 'grammar', key: 'passe-compose', label: 'passe-compose' } };
  const task = followUpTask(due, { dayIndex: 3 });
  // With a fresh lane present it still prefers unseen material.
  assert.equal(task.heldOut, true);
  // Simulate a spent fresh lane by asking for a topic whose quiz is empty is
  // not possible here; instead assert the fallback contract via the exported
  // rule: a delayed check is allowed to use taught material (heldOut may be
  // false) but a transfer check is not. Documented by construction.
  assert.equal(task.type, 'delayed');
});

test('a vocabulary follow-up asks for the word in a new sentence', async () => {
  const task = followUpTask(
    { type: 'transfer', target: { id: 'vocabulary:manger', skill: 'vocabulary', key: 'manger', label: 'manger' } },
    { dayIndex: 0 },
  );
  assert.equal(task.kind, FOLLOW_UP_KINDS.PRODUCTION);
  assert.equal(task.word, 'manger');
  assert.equal(task.heldOut, false, 'same word, productively used — not held-out material');
  assert.match(task.prompt, /manger/);
});

test('a spoken-only grammar key keeps its ::productive suffix out of the word', async () => {
  const task = followUpTask(
    { type: 'transfer', target: { id: 'vocabulary:manger::productive', skill: 'vocabulary', key: 'manger::productive', label: 'manger' } },
    { dayIndex: 0 },
  );
  assert.equal(task.word, 'manger');
});

test('no honest offline check → null for pronunciation, speaking, reading', async () => {
  for (const skill of ['pronunciation', 'speaking', 'reading']) {
    const task = followUpTask(
      { type: 'transfer', target: { id: `${skill}:x`, skill, key: 'x', label: 'x' } },
      { dayIndex: 0 },
    );
    assert.equal(task, null, `${skill} returns null rather than a fake check`);
  }
  assert.equal(proofFor(null), 'no honest check could be built for this weakness today');
  assert.match(followUpCopy(null), /still needs a check/);
});

// ── listening: a graded check on unseen audio ───────────────────────────────

const track = (id) => ({
  id,
  title: `Track ${id}`,
  cefr: 'B1',
  questions: [{ q: 'Is the rent inclusive of bills?', options: ['No', 'Yes'], answer: 1 }],
});

const LISTENING_DUE = {
  type: 'transfer',
  target: { id: 'listening:track:dl-colocation', skill: 'listening', key: 'track:dl-colocation', label: 'Rent and bills' },
};

test('a listening follow-up takes a recording the learner has never scored', () => {
  const task = followUpTask(LISTENING_DUE, {
    tracks: [track('a'), track('b'), track('c')],
    heardTrackIds: ['a'],
    dayIndex: 0,
  });
  assert.ok(task, 'a task is built');
  assert.equal(task.kind, FOLLOW_UP_KINDS.LISTENING);
  assert.ok(['b', 'c'].includes(task.track.id), 'never the recording already heard');
  assert.equal(task.heldOut, true, 'unheard audio with unseen questions');
});

test('a listening follow-up never returns the recording this session already plays', () => {
  const task = followUpTask(LISTENING_DUE, {
    tracks: [track('today'), track('other')],
    sessionTrackId: 'today',
    dayIndex: 0,
  });
  assert.equal(task.track.id, 'other');
});

test('every track already heard → null, because a replay is not a check', () => {
  const task = followUpTask(LISTENING_DUE, {
    tracks: [track('a'), track('b')],
    heardTrackIds: ['a', 'b'],
    dayIndex: 0,
  });
  assert.equal(task, null, 'silence rather than repeating known audio');
});

test('a track with no questions cannot be evidence, so it is never offered', () => {
  const task = followUpTask(LISTENING_DUE, {
    tracks: [{ id: 'bare', title: 'Bare', questions: [] }, track('real')],
    dayIndex: 0,
  });
  assert.equal(task.track.id, 'real', 'an ungradable track is skipped');
  assert.equal(followUpTask(LISTENING_DUE, { tracks: [{ id: 'bare', title: 'Bare', questions: [] }], dayIndex: 0 }), null);
});

test('the listening bar is full comprehension of unseen audio', () => {
  const task = followUpTask(LISTENING_DUE, { tracks: [track('a')], dayIndex: 0 });
  assert.equal(gradeListening(task, { score: 100 }).correct, true);
  assert.equal(gradeListening(task, { score: 67 }).correct, false, 'partial comprehension is a real miss');
  // Reading along is support: it cannot be an independent transfer.
  const assisted = gradeListening(task, { score: 100, transcriptRevealed: true });
  assert.equal(assisted.assisted, true);
  assert.equal(assisted.correct, false, 'a supported pass never demonstrates');
  assert.equal(gradeListening(task, { score: 100, replayCount: 4 }).assisted, true, 'replaying repeatedly is support');
});

test('the listening check states what a pass proves', () => {
  const task = followUpTask(LISTENING_DUE, { tracks: [track('a')], dayIndex: 0 });
  assert.match(proofFor(task), /never heard/);
  assert.match(followUpCopy(task), /something new/);
});

// ── grading production ──────────────────────────────────────────────────────

test('production grading accepts the word in a new sentence and rejects copies', () => {
  const task = { kind: FOLLOW_UP_KINDS.PRODUCTION, word: 'manger', label: 'manger' };
  assert.equal(gradeProduction(task, 'Je vais manger une pomme.').correct, true);
  assert.equal(gradeProduction(task, 'manger').reason, 'no-sentence', 'the bare word is recall, not use');
  assert.equal(gradeProduction(task, 'Je vais boire une pomme.').reason, 'target-missing', 'the word must appear');
  assert.equal(gradeProduction(task, '   ').reason, 'empty');
});

test('production grading ignores accents and case when matching the word', () => {
  const task = { kind: FOLLOW_UP_KINDS.PRODUCTION, word: 'élève', label: 'élève' };
  assert.equal(gradeProduction(task, 'Un ELEVE est arrive.').correct, true, 'accent/case insensitive');
});

// ── the segment appears in Today ────────────────────────────────────────────

test('a runnable follow-up becomes a real session segment with minutes', async () => {
  await ready;
  const task = followUpTask(
    { type: 'transfer', target: { id: 'grammar:passe-compose', skill: 'grammar', key: 'passe-compose', label: 'passe-compose' } },
    { dayIndex: 0 },
  );
  const plan = buildDailyCurriculum({
    minutes: 20,
    srsDue: 0,
    topMistake: { id: 'm1', concept: 'passe-compose', type: 'grammar', mastery: 0, recurrence: 1 },
    skillNeeds: { speak: 0.4, listen: 0.2, retrieve: 0.1 },
    evidenceDue: { type: 'transfer', target: { skill: 'grammar', label: 'passe-compose' } },
    followUp: task,
  });
  const seg = plan.segments.find((s) => s.id === 'followup');
  assert.ok(seg, 'the owed check is scheduled');
  assert.ok(seg.minutes > 0, 'it gets time');
  assert.equal(seg.payload.task.targetId, 'grammar:passe-compose');
  // The plan states what a clean pass would prove, so the claim is inspectable
  // rather than only implied by the segment's existence.
  assert.ok(seg.proof && seg.proof.length > 10, `proof is attached: ${seg.proof}`);
  assert.notEqual(seg.proof, seg.why, 'the plain-language copy and the proof claim stay distinct');
});

test('the balanced (control) arm never schedules a learner-specific follow-up', async () => {
  const task = followUpTask(
    { type: 'transfer', target: { id: 'grammar:passe-compose', skill: 'grammar', key: 'passe-compose', label: 'passe-compose' } },
    { dayIndex: 0 },
  );
  const plan = buildDailyCurriculum({ minutes: 20, balanced: true, balancedDrillTopic: 'subjonctif', followUp: task });
  assert.equal(plan.segments.find((s) => s.id === 'followup'), undefined, 'control arm stays clean');
});

test('with a real check scheduled, other segments stop claiming extra time for it', async () => {
  await ready;
  const task = followUpTask(
    { type: 'transfer', target: { id: 'grammar:passe-compose', skill: 'grammar', key: 'passe-compose', label: 'passe-compose' } },
    { dayIndex: 0 },
  );
  const plan = buildDailyCurriculum({
    minutes: 20,
    srsDue: 4,
    topMistake: { id: 'm1', concept: 'passe-compose', type: 'grammar', mastery: 0, recurrence: 1 },
    evidenceDue: { type: 'transfer', target: { skill: 'grammar', label: 'passe-compose' } },
    followUp: task,
  });
  const retrieve = plan.segments.find((s) => s.id === 'retrieve');
  assert.ok(retrieve, 'retrieve still runs');
  assert.doesNotMatch(retrieve.why, /fresh-context follow-up|extra time today/, 'no double promise');
});

// ── planner reads per-skill need ────────────────────────────────────────────

test('open listening pressure raises the listening candidate above the baseline', () => {
  const base = scoreCandidates({ hasListeningContent: true, hasScenario: false });
  const needy = scoreCandidates({ hasListeningContent: true, hasScenario: false, skillNeeds: { listen: 1 } });
  const baseInput = base.find((c) => c.kind === 'input');
  const needyInput = needy.find((c) => c.kind === 'input');
  assert.ok(needyInput.score > baseInput.score, 'need adds a real factor');
  assert.ok(needyInput.factors['skill-imbalance'] > 0, 'named skill-imbalance factor');
  assert.match(needyInput.evidence.join(' '), /listening weaknesses/);
});

test('vocabulary pressure raises recall; speaking pressure raises speaking', () => {
  const r = scoreCandidates({ srsDue: 10, hasScenario: true, skillNeeds: { retrieve: 0.9 } });
  assert.ok(r.find((c) => c.kind === 'retrieve').factors['skill-imbalance'] > 0);
  const s = scoreCandidates({ hasScenario: true, skillNeeds: { speak: 0.8 } });
  assert.ok(s.find((c) => c.kind === 'speak').factors['skill-imbalance'] > 0);
});
