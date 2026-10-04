import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';

function memoryStorage(seed) {
  return memoryStorageDouble(seed);
}

test('exam boundaries, human marks and real results persist locally', async () => {
  globalThis.localStorage = memoryStorage();
  const storage = await (await import("./helpers/fullStorage.js")).importFullStorage(`exam-features-${Date.now()}`);

  storage.saveExamBoundarySet({ id: 'aqa-june-2025', boardId: 'aqa-gcse', tier: 'higher', boundaries: { 9: 85, 8: 76 } });
  storage.recordExaminerMark({ boardId: 'aqa-gcse', appPercent: 72, examinerPercent: 70 });
  storage.recordRealExamResult({ boardId: 'aqa-gcse', predictedGrade: '7', actualGrade: '7' });

  assert.equal(storage.getExamBoundarySets().length, 1);
  assert.equal(storage.getExaminerScripts()[0].examinerPercent, 70);
  assert.equal(storage.getRealExamResults()[0].actualGrade, '7');
});
