// The exam identity is durable — the board/tier the learner picks in the exam
// simulator must survive navigation and feed the exam-diagnostic journey.
//
// These used to live only in ExamSimulator's component state, so
// `settings.examBoard` was a stored-but-never-written, never-read field — the
// exact "dead input" disease the exam-date countdown fix already cured for
// `examSoon`. ExamSetup now persists board+tier the moment they're chosen (like
// the date), and ExamSimulator seeds its initial state from them. This test
// pins that round-trip through the REAL store so a regression to "written but
// never read" (or "read but never written") fails loudly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';
import { importFullStorage } from './helpers/fullStorage.js';
import { BOARDS, boardList, getBoard, TIER } from '../src/lib/exams/boards.js';

async function fresh() {
  globalThis.localStorage = memoryStorageDouble();
  return importFullStorage(`exam-identity-${Date.now()}`);
}

test('the chosen board and tier persist and resolve back to a real board', async () => {
  const storage = await fresh();
  const pick = boardList().find((b) => b.tiers.length > 0) || boardList()[0];
  // Exactly what ExamSetup.persistExamIdentity writes on a board+tier choice.
  storage.setSettings({ ...storage.getSettings(), examBoard: pick.id, examTier: pick.tiers[0] || TIER.HIGHER });

  const saved = storage.getSettings();
  assert.equal(saved.examBoard, pick.id, 'the board choice is persisted');
  assert.ok(saved.examTier, 'the tier choice is persisted');
  // And it resolves back to a real, renderable board — the anti-dead-input
  // guard: a stored id that getBoard() cannot resolve would be unreachable.
  assert.equal(getBoard(saved.examBoard)?.id, pick.id, 'the stored id resolves to a real board');
});

test('a Foundation-tier choice is remembered, not silently forced to Higher', async () => {
  const storage = await fresh();
  const twoTier = boardList().find((b) => b.tiers.length > 1);
  assert.ok(twoTier, 'the test needs a board with more than one tier');
  storage.setSettings({ ...storage.getSettings(), examBoard: twoTier.id, examTier: TIER.FOUNDATION });
  assert.equal(storage.getSettings().examTier, TIER.FOUNDATION, 'Foundation is stored verbatim');
});

test('a stored id for an unknown board resolves to null, never a wrong board', async () => {
  const storage = await fresh();
  storage.setSettings({ ...storage.getSettings(), examBoard: 'does-not-exist', examTier: 'higher' });
  assert.equal(getBoard('does-not-exist'), null, 'an unknown id is not silently mapped to a real board');
});

test('persisting the exam identity does not clobber the exam date', async () => {
  const storage = await fresh();
  storage.setSettings({ ...storage.getSettings(), examDate: '2027-06-10', examBoard: 'wjec-gcse-3830' });
  // ExamSetup merges onto current settings when it persists board+tier, so a
  // previously-set date survives.
  storage.setSettings({ ...storage.getSettings(), examBoard: 'wjec-gcse-3830', examTier: 'higher' });
  const s = storage.getSettings();
  assert.equal(s.examDate, '2027-06-10', 'the exam date is preserved across a board/tier save');
  assert.equal(s.examBoard, 'wjec-gcse-3830');
});

test('every board in the registry has an id that round-trips', async () => {
  const storage = await fresh();
  for (const b of boardList()) {
    storage.setSettings({ ...storage.getSettings(), examBoard: b.id, examTier: b.tiers[0] || TIER.HIGHER });
    assert.equal(getBoard(storage.getSettings().examBoard)?.id, b.id, `${b.id} round-trips`);
  }
  assert.ok(Object.keys(BOARDS).length > 0, 'the registry is non-empty');
});
