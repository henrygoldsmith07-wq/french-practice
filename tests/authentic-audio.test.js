import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAsset, stageFor, mergeCatalogs, playbackPlan,
  progressionFrom, recordAttempt, emptyProgression,
  STAGES, MAX_STAGE,
} from '../src/lib/authenticAudio.js';
import { AUTHENTIC_AUDIO_SEED } from '../src/lib/content/authenticAudioSeed.js';
import { authenticTrackFromAsset } from '../src/lib/listening.js';

const base = {
  id: 'test-asset',
  title: 'Test recording',
  license: 'public-domain',
  consentBasis: 'public-domain-recording',
  sourceUrl: 'https://archive.org/details/test',
  audioSrc: 'https://archive.org/download/test/test.mp3',
  register: 'clear-read',
  noise: 'quiet',
};

describe('validateAsset — provenance is strict', () => {
  it('accepts a fully-attributed asset', () => {
    assert.equal(validateAsset(base).ok, true);
  });
  it('rejects missing license / consent / source / audioSrc', () => {
    for (const drop of ['license', 'consentBasis', 'sourceUrl', 'audioSrc']) {
      const { ok, errors } = validateAsset({ ...base, [drop]: undefined });
      assert.equal(ok, false, `should reject missing ${drop}`);
      assert.ok(errors[0].includes(drop));
    }
  });
  it('rejects unknown enum values instead of guessing', () => {
    assert.equal(validateAsset({ ...base, region: 'mars' }).ok, false);
    assert.equal(validateAsset({ ...base, register: 'whispering' }).ok, false);
  });

  it('seed catalog entries are all valid and stage-tagged', () => {
    const { assets, rejected } = mergeCatalogs(AUTHENTIC_AUDIO_SEED);
    assert.deepEqual(rejected, []);
    assert.ok(assets.length >= 2);
    for (const a of assets) assert.ok(a.stage >= 3 && a.stage <= 4, `seed ${a.id} stage=${a.stage}`);
  });
});

describe('stageFor — the S1–S7 ladder', () => {
  it('TTS maps to stages 1–2 by rate', () => {
    assert.equal(stageFor({ sourceType: 'tts', rate: 0.7 }), 1);
    assert.equal(stageFor({ sourceType: 'tts', rate: 0.95 }), 2);
    assert.equal(stageFor({}), 2);
  });
  it('clean native recording → S3; natural/radio → S4', () => {
    assert.equal(stageFor(base), 3);
    assert.equal(stageFor({ ...base, register: 'radio' }), 4);
  });
  it('multi-accent sets → S5; spontaneous → S6; noise/overlap → S7 (highest wins)', () => {
    assert.equal(stageFor({ ...base, accentVariety: true }), 5);
    assert.equal(stageFor({ ...base, register: 'conversation' }), 6);
    assert.equal(stageFor({ ...base, register: 'spontaneous', noise: 'busy' }), 7);
    assert.equal(stageFor({ ...base, overlap: true }), 7);
  });
});

describe('progression gating', () => {
  it('starts at stage 1 with no attempts', () => {
    const p = progressionFrom(emptyProgression().attempts);
    assert.equal(p.currentStage, 1);
  });
  it('unlocks the next stage after ≥5 attempts at ≥80% accuracy', () => {
    let p = emptyProgression();
    for (let i = 0; i < 5; i++) p = recordAttempt(p, { itemId: `s1-${i}`, stage: 1, correct: true });
    assert.equal(p.currentStage, 2);
    assert.equal(p.stageStats.find((s) => s.stage === 1).passed, true);
  });
  it('does NOT advance at 79% or on too few attempts', () => {
    let p = emptyProgression();
    for (let i = 0; i < 5; i++) p = recordAttempt(p, { itemId: `a${i}`, stage: 1, correct: i < 4 }); // 80%... boundary
    // 4/5 = exactly 0.8 → passes
    assert.equal(p.currentStage, 2);
    p = emptyProgression();
    for (let i = 0; i < 5; i++) p = recordAttempt(p, { itemId: `b${i}`, stage: 1, correct: i < 3 }); // 60%
    assert.equal(p.currentStage, 1);
    p = emptyProgression();
    for (let i = 0; i < 4; i++) p = recordAttempt(p, { itemId: `c${i}`, stage: 1, correct: true }); // n<5
    assert.equal(p.currentStage, 1);
  });
  it('caps currentStage at MAX_STAGE', () => {
    let p = emptyProgression();
    for (let s = 1; s <= MAX_STAGE + 2; s++) {
      for (let i = 0; i < 5; i++) p = recordAttempt(p, { itemId: `x-${s}-${i}`, stage: s, correct: true });
    }
    assert.equal(p.currentStage, MAX_STAGE);
  });
});

describe('playbackPlan + track conversion', () => {
  it('prefers a catalog recording over TTS and carries attribution', () => {
    const plan = playbackPlan({ audioId: 'test-asset' }, [base]);
    assert.equal(plan.type, 'recording');
    assert.match(plan.attribution, /public-domain/);
  });
  it('falls back to TTS with a stage when no recording exists', () => {
    const plan = playbackPlan({ ttsRate: 0.7 }, []);
    assert.equal(plan.type, 'tts');
    assert.equal(plan.stage, 1);
  });
  it('pack assets convert to listening tracks tagged kind authentique', () => {
    const t = authenticTrackFromAsset({ ...base, cefr: 'B2' });
    assert.equal(t.kind, 'authentique');
    assert.equal(t.cefr, 'B2');
    assert.equal(t.audioSrc, base.audioSrc);
  });
});
