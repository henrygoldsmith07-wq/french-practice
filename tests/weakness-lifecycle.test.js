import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAKNESS_LIFECYCLE, weaknessLifecycle, mistakeConfidence, lifecycleCopy,
  whyThisSentence,
} from '../src/lib/weaknessLifecycle.js';

const entry = (over = {}) => ({
  id: 'grammar:adjective-agreement',
  category: 'grammar',
  key: 'adjective-agreement',
  label: 'adjective agreement',
  errorCount: 1, successCount: 0, cleanPasses: 0, recurrenceCount: 0,
  independentPasses: 0, status: 'active', lastEvidence: null, modes: ['conversation'],
  evidence: [], ...over,
});

describe('weakness lifecycle', () => {
  it('a single isolated mistake is a slip, not a confirmed weakness', () => {
    const life = weaknessLifecycle(entry());
    assert.equal(life.state, WEAKNESS_LIFECYCLE.DETECTED);
    assert.equal(life.confidence, 'single');
  });

  it('an uncertain one-off stays detected with honest copy', () => {
    const life = weaknessLifecycle(entry({ evidence: [{ detail: 'asr uncertain' }] }));
    assert.equal(life.confidence, 'uncertain');
    assert.equal(life.state, WEAKNESS_LIFECYCLE.DETECTED);
  });

  it('repeated mistakes confirm the weakness', () => {
    const life = weaknessLifecycle(entry({ errorCount: 2 }));
    assert.equal(life.state, WEAKNESS_LIFECYCLE.CONFIRMED);
    assert.equal(life.confidence, 'repeated');
  });

  it('cross-mode mistakes read as persistent', () => {
    const confidence = mistakeConfidence(entry({ errorCount: 2, modes: ['speaking', 'writing'] }));
    assert.equal(confidence, 'persistent');
  });

  it('one correct answer never implies mastery', () => {
    const life = weaknessLifecycle(entry({
      errorCount: 2, successCount: 1, status: 'recovering', cleanPasses: 1, independentPasses: 1,
    }));
    assert.equal(life.state, WEAKNESS_LIFECYCLE.IMPROVING);
    assert.notEqual(life.state, WEAKNESS_LIFECYCLE.DEMONSTRATED);
  });

  it('assisted progress stays improving and never demonstrates', () => {
    const life = weaknessLifecycle(entry({
      errorCount: 2, successCount: 3, cleanPasses: 0, independentPasses: 0, status: 'recovering',
    }));
    assert.equal(life.state, WEAKNESS_LIFECYCLE.IMPROVING);
  });

  it('several clean successes ask for a fresh-context transfer check', () => {
    const life = weaknessLifecycle(entry({
      errorCount: 2, successCount: 3, cleanPasses: 2, independentPasses: 1, status: 'recovering',
    }));
    assert.equal(life.state, WEAKNESS_LIFECYCLE.TRANSFER_CHECK);
  });

  it('a delayed clean recall reaches delayed confirmation', () => {
    const life = weaknessLifecycle(entry({
      errorCount: 2, successCount: 2, status: 'recovering', lastEvidence: 'delayed', independentPasses: 1,
    }));
    assert.equal(life.state, WEAKNESS_LIFECYCLE.DELAYED_CONFIRMATION);
    assert.equal(life.hasDelayedProof, true);
  });

  it('a resolved weakness reads as demonstrated', () => {
    const life = weaknessLifecycle(entry({
      errorCount: 2, successCount: 3, status: 'resolved', independentPasses: 2,
      lastErrorAt: '2026-01-01T10:00:00Z', lastSuccessAt: '2026-01-03T10:00:00Z',
    }));
    assert.equal(life.state, WEAKNESS_LIFECYCLE.DEMONSTRATED);
  });

  it('a mistake after repair reopens as recurred', () => {
    const life = weaknessLifecycle(entry({
      errorCount: 3, successCount: 2, recurrenceCount: 1, status: 'active',
      lastErrorAt: '2026-01-05T10:00:00Z', lastSuccessAt: '2026-01-03T10:00:00Z',
    }));
    assert.equal(life.state, WEAKNESS_LIFECYCLE.RECURRED);
  });

  it('a learning-evidence cycle can demonstrate with real transfer + delayed proof', () => {
    const cycle = {
      target: { skill: 'grammar', key: 'adjective-agreement', label: 'adjective agreement' },
      startedAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-06T10:00:00Z',
      transfers: [{
        independent: true, correct: true, heldOut: true, encounterId: 'enc-1',
        at: '2026-01-04T10:00:00Z', phase: 'transfer',
        difficulty: 3, markerConfidence: 0.85, promptNovelty: 0.8, sourceReliability: 'high',
      }],
      delayed: [{
        independent: true, correct: true, encounterId: 'enc-2',
        at: '2026-01-06T10:00:00Z', phase: 'delayed', delayHours: 30,
        difficulty: 3, markerConfidence: 0.85, sourceReliability: 'high',
      }],
    };
    const life = weaknessLifecycle(entry({ errorCount: 2, successCount: 2, status: 'recovering' }), {
      cycle,
      now: new Date('2026-01-07T10:00:00Z').getTime(),
    });
    assert.equal(life.state, WEAKNESS_LIFECYCLE.DEMONSTRATED);
    assert.equal(life.hasTransferProof, true);
    assert.equal(life.hasDelayedProof, true);
  });

  it('a cycle without proof never fabricates one', () => {
    const cycle = {
      target: { skill: 'grammar', key: 'x', label: 'x' },
      transfers: [], delayed: [],
    };
    const life = weaknessLifecycle(entry({ errorCount: 1 }), { cycle });
    assert.equal(life.state, WEAKNESS_LIFECYCLE.DETECTED);
    assert.equal(life.hasTransferProof, false);
    assert.equal(life.hasDelayedProof, false);
  });

  it('state copy is learner-friendly and leak-free', () => {
    for (const state of Object.values(WEAKNESS_LIFECYCLE)) {
      const copy = lifecycleCopy(state);
      assert.ok(copy.label, `missing label for ${state}`);
      for (const bad of ['evidence', 'recurrence detected', 'insufficient', 'engine', 'cycle', 'transfer evidence']) {
        assert.ok(!copy.detail.toLowerCase().includes(bad), `copy for ${state} leaks "${bad}"`);
      }
    }
  });

  it('why-this sentence uses real counts and no internal terms', () => {
    const sentence = whyThisSentence(entry({ errorCount: 2, modes: ['speaking', 'writing'] }));
    assert.ok(sentence.includes('twice'));
    assert.ok(sentence.toLowerCase().includes('adjective agreement'));
    for (const bad of ['fp.', 'engine', 'candidate', 'trial', 'calibration']) {
      assert.ok(!sentence.toLowerCase().includes(bad), `leaks "${bad}"`);
    }
  });

  it('explains a recurred weakness with plain language', () => {
    const sentence = whyThisSentence(entry({
      errorCount: 3, successCount: 2, recurrenceCount: 1, status: 'active',
      lastErrorAt: '2026-01-05T10:00:00Z', lastSuccessAt: '2026-01-03T10:00:00Z',
    }));
    assert.ok(sentence.toLowerCase().includes('came back'));
  });

  it('no entry returns null and never throws on junk', () => {
    assert.equal(weaknessLifecycle(null), null);
    assert.equal(weaknessLifecycle(undefined), null);
    assert.ok(weaknessLifecycle({ errorCount: 'x', successCount: null }));
  });
});
