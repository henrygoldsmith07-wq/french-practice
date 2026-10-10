// Exam findings → the shared error model.
//
// The acceptance criterion: an Exam Speaking Mode mock must create or update
// weaknesses that appear in the next Today session. That only holds if exam
// sub-scores land in the SAME model every other mode writes to, under the same
// evidence rules — so these tests pin both the mapping and the honesty.

import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { test } from 'node:test';

import {
  findingsFromTask,
  applyPaperFindings,
  examCountdown,
  CRITERION_TO_CATEGORY,
  EXAM_WEAKNESS_FLOOR,
  EXAM_STRENGTH_FLOOR,
} from '../src/lib/exams/findings.js';
import { createLearnerErrorModel, recordLearnerError, prioritiseLearnerErrors } from '../src/lib/learnerErrors.js';

// ---- mapping: exam criteria become the shared weakness vocabulary ----------

test('every exam criterion maps to a real error-model category', () => {
  const allowed = new Set(['grammar', 'vocabulary', 'speaking', 'pronunciation', 'listening', 'reading', 'writing']);
  for (const [criterion, category] of Object.entries(CRITERION_TO_CATEGORY)) {
    ok(allowed.has(category), `${criterion} maps to unknown category "${category}"`);
  }
});

test('a weak accuracy score becomes a grammar weakness', () => {
  const { weaknesses } = findingsFromTask({
    taskId: 'roleplay',
    criteria: [{ criterion: 'accuracy', score: 20 }],
    context: { boardId: 'wjec-gcse-3800', tier: 'foundation', official: false },
  });
  strictEqual(weaknesses.length, 1);
  strictEqual(weaknesses[0].category, 'grammar');
  strictEqual(weaknesses[0].key, 'accuracy', 'the criterion is the key, so it collides across task types');
  strictEqual(weaknesses[0].source, 'exam');
  strictEqual(weaknesses[0].official, false, 'practice papers must never claim to be official');
});

test('pronunciation and communication map to their own categories', () => {
  const { weaknesses } = findingsFromTask({
    taskId: 'conversation',
    criteria: [
      { criterion: 'pronunciation', score: 30 },
      { criterion: 'communication', score: 25 },
    ],
  });
  strictEqual(weaknesses.length, 2);
  const byCriterion = Object.fromEntries(weaknesses.map((w) => [w.criterion, w.category]));
  deepStrictEqual(byCriterion, { pronunciation: 'pronunciation', communication: 'speaking' });
});

// ---- honesty: borderline and unmarked scores are not evidence -------------

test('a borderline criterion is neither a weakness nor a success', () => {
  // The honest middle. Calling it a weakness would nag; calling it success
  // would flatter.
  const { weaknesses, successes, skipped } = findingsFromTask({
    taskId: 'photocard',
    criteria: [{ criterion: 'range', score: 55 }],
  });
  strictEqual(weaknesses.length, 0);
  strictEqual(successes.length, 0);
  deepStrictEqual(skipped, ['range']);
});

test('an unmarked criterion is skipped, never assumed weak', () => {
  const { weaknesses, skipped } = findingsFromTask({
    taskId: 'roleplay',
    criteria: [
      { criterion: 'accuracy', score: 20 },
      { criterion: 'range' }, // no score
    ],
  });
  strictEqual(weaknesses.length, 1, 'only the marked weakness is recorded');
  ok(skipped.includes('range'), 'the unmarked criterion must be reported as skipped');
});

test('an unknown criterion is ignored rather than crashing', () => {
  const { weaknesses, skipped } = findingsFromTask({
    taskId: 'roleplay',
    criteria: [{ criterion: 'not-a-real-criterion', score: 5 }],
  });
  strictEqual(weaknesses.length, 0);
  ok(skipped.length >= 1);
});

test('scores are clamped and never NaN', () => {
  const { weaknesses } = findingsFromTask({
    taskId: 'roleplay',
    criteria: [{ criterion: 'accuracy', score: 999 }],
  });
  strictEqual(weaknesses.length, 0, 'a 999 is not weak');
  const { successes } = findingsFromTask({
    taskId: 'roleplay',
    criteria: [{ criterion: 'accuracy', score: 150 }],
  });
  strictEqual(successes[0].score, 100);
});

test('the weakness and strength floors do not overlap', () => {
  ok(EXAM_STRENGTH_FLOOR > EXAM_WEAKNESS_FLOOR, 'a score can never be both');
});

// ---- integration: an exam finding really reaches the shared model ---------

test('an exam finding lands in the same model Today reads', () => {
  // This is the acceptance criterion in one test: a mock Exam Speaking paper
  // must produce a weakness that prioritiseLearnerErrors() (what Today and the
  // repair planner consume) can actually see.
  const { weaknesses } = findingsFromTask({
    taskId: 'roleplay',
    criteria: [{ criterion: 'accuracy', score: 25 }],
  });
  strictEqual(weaknesses.length, 1);

  let model = createLearnerErrorModel();
  for (const w of weaknesses) {
    model = recordLearnerError(model, {
      category: w.category,
      key: w.key,
      label: w.label,
      detail: 'Exam speaking practice',
      mode: 'exam',
      source: 'exam',
    });
  }

  const ranked = prioritiseLearnerErrors(model);
  strictEqual(ranked.length, 1, 'the exam finding is a real weakness in the shared model');
  strictEqual(ranked[0].category, 'grammar');
  strictEqual(ranked[0].key, 'accuracy');
  strictEqual(ranked[0].status, 'active');
});

test('two tasks with the same criterion stay ONE weakness', () => {
  // A candidate weak on accuracy in a role-play AND a photo card has one gap,
  // not two. Otherwise the error model double-counts a single real weakness.
  const { weaknesses } = findingsFromTask({
    taskId: 'photocard',
    criteria: [{ criterion: 'accuracy', score: 30 }],
  });
  let model = createLearnerErrorModel();
  for (const w of weaknesses) {
    model = recordLearnerError(model, { category: w.category, key: w.key, label: w.label, encounterId: 'e1' });
  }
  const second = findingsFromTask({ taskId: 'roleplay', criteria: [{ criterion: 'accuracy', score: 28 }] });
  for (const w of second.weaknesses) {
    model = recordLearnerError(model, { category: w.category, key: w.key, label: w.label, encounterId: 'e2' });
  }
  strictEqual(model.entries.length, 1, 'one weakness, however many tasks exposed it');
  strictEqual(model.entries[0].errorCount, 2, 'but every occurrence is counted');
});

test('applyPaperFindings reports what it recorded and what it skipped', () => {
  const errors = [];
  const successes = [];
  const summary = applyPaperFindings(
    [
      { taskId: 'roleplay', criteria: [{ criterion: 'accuracy', score: 20 }, { criterion: 'communication', score: 85 }] },
      { taskId: 'photocard', criteria: [{ criterion: 'range', score: 50 }] },
    ],
    {
      recordError: (f) => errors.push(f),
      recordSuccess: (f) => successes.push(f),
      context: { boardId: 'aqa-gcse', official: false },
    },
  );
  strictEqual(errors.length, 1);
  strictEqual(successes.length, 1);
  strictEqual(summary.weaknesses, 1);
  strictEqual(summary.successes, 1);
  deepStrictEqual(summary.skipped, ['range']);
  strictEqual(errors[0].boardId, 'aqa-gcse', 'provenance travels with the finding');
});

test('a strength is recorded as success evidence, never as mastery', () => {
  // One good exam answer must not resolve anything. The recorder is given the
  // finding; whether it advances anything is the error model's decision, made
  // under the same rules as every other mode.
  const seen = [];
  applyPaperFindings(
    [{ taskId: 'conversation', criteria: [{ criterion: 'accuracy', score: 95 }] }],
    { recordSuccess: (f) => seen.push(f) },
  );
  strictEqual(seen.length, 1);
  strictEqual(seen[0].kind, 'success');
});

// ---- the countdown --------------------------------------------------------

test('no exam date means no invented urgency', () => {
  strictEqual(examCountdown(null), null);
  strictEqual(examCountdown(''), null);
  strictEqual(examCountdown('not-a-date'), null);
});

test('a past exam date is history, not a countdown', () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  strictEqual(examCountdown(yesterday, { now: Date.now() }), null);
});

test('the countdown bands scale speaking pressure toward the paper', () => {
  const now = Date.now();
  const soon = examCountdown(new Date(now + 10 * 86_400_000).toISOString(), { now });
  const mid = examCountdown(new Date(now + 45 * 86_400_000).toISOString(), { now });
  const early = examCountdown(new Date(now + 200 * 86_400_000).toISOString(), { now });

  strictEqual(soon.band, 'final-weeks');
  strictEqual(mid.band, 'building');
  strictEqual(early.band, 'early');
  ok(soon.speakWeight > mid.speakWeight, 'closer to the paper means more speaking pressure');
  ok(mid.speakWeight > early.speakWeight);
  strictEqual(early.speakWeight, 1, 'far out, the mix is unchanged');
  ok(soon.note && mid.note && early.note, 'each band explains itself in plain language');
});

test('a due-date object is accepted as well as a string', () => {
  const soon = examCountdown(new Date(Date.now() + 5 * 86_400_000), { now: Date.now() });
  strictEqual(soon.band, 'final-weeks');
  strictEqual(soon.days, 5);
});
