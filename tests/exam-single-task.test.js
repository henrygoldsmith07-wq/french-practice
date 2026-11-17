// "One task" mode must actually build one task. The Setup UI now collects a
// taskId and the controller forwards it to buildPaper; without it the whole
// paper ran with prep time divided by the number of tasks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPaper } from '../src/lib/exams/simulator.js';
import { BOARDS } from '../src/lib/exams/boards.js';

const BOARD = 'wjec-gcse-3830';
const taskId = BOARDS[BOARD].tasks[0].id;

test('a chosen task builds exactly one section with the shared prep time', () => {
  const one = buildPaper({ boardId: BOARD, mode: 'single', examMode: 'speaking', taskId });
  assert.equal(one.sections.length, 1);
  assert.equal(one.sections[0].taskId, taskId);
  assert.ok(one.prepSeconds > 0, 'the single task still gets supervised prep time');
});

test('without a task id buildPaper would run the whole paper — the old bug', () => {
  const all = buildPaper({ boardId: BOARD, mode: 'single', examMode: 'speaking', taskId: null });
  assert.equal(all.sections.length, BOARDS[BOARD].tasks.length);
});

test('the controller forwards the selected task and refuses to start without one', () => {
  const sim = readFileSync(new URL('../src/components/ExamSimulator.jsx', import.meta.url), 'utf8');
  assert.match(sim, /taskId: mode === 'single' \? taskId : null/,
    'buildPaper must receive the selected task in single mode');
  assert.match(sim, /mode === 'single' && examMode === EXAM_MODE\.SPEAKING && !taskId\) return/,
    'starting with no chosen task must be refused');

  const setup = readFileSync(new URL('../src/components/ExamSetup.jsx', import.meta.url), 'utf8');
  assert.match(setup, /setTaskId\(t\.id\)/, 'Setup must let the learner choose a task');
  assert.match(setup, /disabled=\{mode === 'single' && examMode === EXAM_MODE\.SPEAKING && !taskId\}/,
    'Start must stay disabled until a task is chosen');
});
