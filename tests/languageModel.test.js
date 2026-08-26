import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LANGUAGE_STAGES,
  applyLanguageEvidence,
  buildLanguageMap,
  nextLanguageStep,
} from '../src/lib/languageModel.js';

describe('living language model', () => {
  it('keeps grammar quiz evidence below transfer', () => {
    const map = buildLanguageMap({
      grammarProgress: {
        'passe-compose': { best: 94, attempts: 3, lastAt: '2026-08-20T10:00:00Z' },
      },
    });
    const entry = map.find((item) => item.id === 'passe-compose');
    assert.equal(entry.stage, 2);
    assert.equal(entry.status, 'Prompted');
    assert.equal(entry.nextStageMeta.id, 'delayed');
  });

  it('does not allow a learner to skip the transfer ladder', () => {
    let progress = {};
    progress = applyLanguageEvidence(progress, 'subjonctif', { stage: 1, source: 'test' });
    progress = applyLanguageEvidence(progress, 'subjonctif', { stage: 5, source: 'test' });
    const entry = progress.subjonctif;
    assert.equal(entry.stage, 2);
    assert.equal(nextLanguageStep({ stage: entry.stage, nextContext: 'a request' }).stage, 3);
  });

  it('records slips without deleting successful transfer', () => {
    let progress = {};
    progress = applyLanguageEvidence(progress, 'pronoms', { stage: 4, allowJump: true, source: 'test' });
    progress = applyLanguageEvidence(progress, 'pronoms', { outcome: 'slip', context: 'a shop return', source: 'test' });
    const map = buildLanguageMap({ progress });
    const entry = map.find((item) => item.id === 'pronoms');
    assert.equal(entry.stage, 4);
    assert.equal(entry.status, 'Unstable');
    assert.equal(entry.slips, 1);
  });

  it('exposes the five transfer stages as the product vocabulary', () => {
    assert.deepEqual(LANGUAGE_STAGES.map((stage) => stage.id), [
      'recognise', 'controlled', 'delayed', 'contextual', 'spontaneous',
    ]);
  });
});
