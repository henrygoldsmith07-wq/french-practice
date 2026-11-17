// Integration guard for the exam → weakness-tracker journey.
//
// The bug this pins: ExamReview.finish() used to build `criteria` from
// `scoreTask(...).scores`, but scoreTask() never returns a `scores` property —
// so criteria was ALWAYS empty and the "Added to your weakness tracker" copy
// plus the exam→Today feed were false in the real UI. Unit tests passed only
// because they call findingsFromTask() with hand-built data.
//
// We import the real helper from the real component (through the project's JSX
// loader) and assert that the ACTUAL run state — entered per-criterion marks +
// an auto-scored objectiveScore — produces non-empty criteria that reach the
// shared finding model.

import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { test } from 'node:test';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scoreTask } from '../src/lib/exams/simulator.js';
import { applyPaperFindings } from '../src/lib/exams/findings.js';

// Plain `node --test` has no JSX support; register the same esbuild loader the
// render tests use, then dynamically import the component's pure helper.
register('./jsx-loader.mjs', pathToFileURL('./tests/'));
const { criteriaFromRunState } = await import('../src/components/ExamReview.jsx');

// ---- entered criterion marks ----------------------------------------------

test('entered per-criterion marks from real run state produce non-empty criteria', () => {
  const sections = [{ taskId: 'roleplay' }, { taskId: 'photocard' }];
  const scores = {
    roleplay: { accuracy: 30, communication: 85 },
    photocard: { range: 40, pronunciation: 90 },
  };
  const tasks = criteriaFromRunState(sections, scores, []);

  strictEqual(tasks.length, 2);
  deepStrictEqual(tasks[0], {
    taskId: 'roleplay',
    criteria: [
      { criterion: 'accuracy', score: 30 },
      { criterion: 'communication', score: 85 },
    ],
  });
  deepStrictEqual(tasks[1].criteria, [
    { criterion: 'range', score: 40 },
    { criterion: 'pronunciation', score: 90 },
  ]);
});

test('unmarked / non-finite marks are skipped, never invented', () => {
  const sections = [{ taskId: 'roleplay' }];
  const scores = { roleplay: { accuracy: 30, range: undefined, communication: null } };
  const tasks = criteriaFromRunState(sections, scores, []);
  deepStrictEqual(tasks[0].criteria, [{ criterion: 'accuracy', score: 30 }]);
});

// ---- auto-scored papers ----------------------------------------------------

test('an objectiveScore becomes a comprehension criterion for auto-scored papers', () => {
  const sections = [{ taskId: 'reading' }, { taskId: 'listening' }];
  const transcripts = [
    { taskId: 'reading', responseData: { objectiveScore: 35 } },
    { taskId: 'listening', responseData: { objectiveScore: 88 } },
  ];
  const tasks = criteriaFromRunState(sections, {}, transcripts);

  deepStrictEqual(tasks[0].criteria, [{ criterion: 'comprehension', score: 35 }]);
  deepStrictEqual(tasks[1].criteria, [{ criterion: 'comprehension', score: 88 }]);
});

test('an entered comprehension mark is not duplicated by an objectiveScore', () => {
  const sections = [{ taskId: 'listening' }];
  const scores = { listening: { comprehension: 82 } };
  const transcripts = [{ taskId: 'listening', responseData: { objectiveScore: 40 } }];
  const tasks = criteriaFromRunState(sections, scores, transcripts);
  deepStrictEqual(tasks[0].criteria, [{ criterion: 'comprehension', score: 82 }]);
});

// ---- the original bug ------------------------------------------------------

test('the old scoreTask().scores shape would have produced NO criteria', () => {
  const scores = { roleplay: { accuracy: 30, communication: 85 } };
  // scoreTask() never returns a `scores` property — this was the whole bug.
  const s = scoreTask({ boardId: 'wjec-gcse', taskId: 'roleplay', scores: scores.roleplay, outOf: 30 });
  strictEqual(s.scores, undefined);
  deepStrictEqual(Object.entries(s.scores || {}), [], 'the old path always yielded an empty criteria list');

  // The fixed path reads the component state instead and finds real marks.
  const tasks = criteriaFromRunState([{ taskId: 'roleplay' }], scores, []);
  ok(tasks[0].criteria.length > 0, 'the fixed path produces findings where the old path produced none');
  deepStrictEqual(tasks[0].criteria, [
    { criterion: 'accuracy', score: 30 },
    { criterion: 'communication', score: 85 },
  ]);
});

// ---- the journey: real state → criteria → shared finding model -------------

test('criteria built from real run state reach the shared finding model', () => {
  const tasks = criteriaFromRunState(
    [{ taskId: 'roleplay' }],
    { roleplay: { accuracy: 25, communication: 85 } },
    [],
  );
  const errors = [];
  const successes = [];
  const summary = applyPaperFindings(tasks, {
    recordError: (f) => errors.push(f),
    recordSuccess: (f) => successes.push(f),
    context: { boardId: 'wjec-gcse', official: false },
  });

  strictEqual(summary.weaknesses, 1);
  strictEqual(summary.successes, 1);
  strictEqual(errors[0].category, 'grammar');
  strictEqual(errors[0].key, 'accuracy');
  strictEqual(successes[0].category, 'speaking');
  strictEqual(successes[0].key, 'communication');
});
