import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAsset, stageFor, mergeCatalogs, playbackPlan,
  progressionFrom, recordAttempt, emptyProgression,
  listeningEvidenceClass, LISTENING_EVIDENCE_CLASSES, LISTENING_EVIDENCE_LABELS,
  validateAsset as validate,
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

describe('stageFor — the S1–S8 ladder', () => {
  it('defines eight explicit learner-facing stages', () => {
    assert.equal(MAX_STAGE, 8);
    assert.equal(Object.keys(STAGES).length, 8);
    for (let stage = 1; stage <= MAX_STAGE; stage++) assert.ok(STAGES[stage]?.label);
  });
  it('TTS maps to stages 1–2 by rate', () => {
    assert.equal(stageFor({ sourceType: 'tts', rate: 0.7 }), 1);
    assert.equal(stageFor({ sourceType: 'tts', rate: 0.95 }), 2);
    assert.equal(stageFor({}), 2);
  });
  it('provenance-backed native recording starts at S3; documented speaker variation → S4', () => {
    assert.equal(stageFor(base), 3);
    assert.equal(stageFor({ ...base, register: 'natural-read' }), 3);
    assert.equal(stageFor({ ...base, speakers: ['A', 'B'] }), 4);
  });
  it('multi-accent → S5; spontaneous → S6; noise/overlap → S7; explicit realistic conversation → S8', () => {
    assert.equal(stageFor({ ...base, accentVariety: true }), 5);
    assert.equal(stageFor({ ...base, register: 'conversation' }), 6);
    assert.equal(stageFor({ ...base, register: 'spontaneous', noise: 'busy' }), 7);
    assert.equal(stageFor({ ...base, overlap: true }), 7);
    assert.equal(stageFor({ ...base, realisticConversation: true }), 8);
  });
  it('never accepts an imported stage claim over derived metadata', () => {
    const { assets } = mergeCatalogs([{ ...base, stage: 8 }]);
    assert.equal(assets[0].stage, 3);
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
    const t = authenticTrackFromAsset({ ...base, cefr: 'B2', stage: 3, speakers: ['Reader'], duration: 42 });
    assert.equal(t.kind, 'authentique');
    assert.equal(t.cefr, 'B2');
    assert.equal(t.audioSrc, base.audioSrc);
    assert.equal(t.sourceType, 'recording');
    assert.equal(t.license, 'public-domain');
    assert.equal(t.sourceUrl, base.sourceUrl);
    assert.deepEqual(t.speakers, ['Reader']);
    assert.equal(t.duration, 42);
  });
});

// ---- listening evidence classes: not all listening is equal ---------------

describe('listeningEvidenceClass — real speech vs studio audio', () => {
  it('TTS practice is never real-speech evidence', () => {
    assert.equal(listeningEvidenceClass({ sourceType: 'tts' }), LISTENING_EVIDENCE_CLASSES.TTS_PRACTICE);
    assert.equal(listeningEvidenceClass(null), LISTENING_EVIDENCE_CLASSES.TTS_PRACTICE);
    assert.equal(listeningEvidenceClass({ sourceType: 'recording' }), LISTENING_EVIDENCE_CLASSES.TTS_PRACTICE,
      'a recording with no audio source claims nothing');
  });

  it('a controlled studio reading is studio-native, not spontaneous', () => {
    assert.equal(listeningEvidenceClass({ ...base, sourceType: 'recording' }), LISTENING_EVIDENCE_CLASSES.STUDIO_NATIVE);
  });

  it('spontaneous registers are flagged distinctly from studio reading', () => {
    assert.equal(
      listeningEvidenceClass({ ...base, sourceType: 'recording', register: 'spontaneous' }),
      LISTENING_EVIDENCE_CLASSES.SPONTANEOUS_NATIVE,
    );
    assert.equal(
      listeningEvidenceClass({ ...base, sourceType: 'recording', register: 'interview' }),
      LISTENING_EVIDENCE_CLASSES.SPONTANEOUS_NATIVE,
    );
  });

  it('noise, overlap and field conditions read as the strongest class', () => {
    assert.equal(
      listeningEvidenceClass({ ...base, sourceType: 'recording', noise: 'busy' }),
      LISTENING_EVIDENCE_CLASSES.NOISY_CONVERSATION,
    );
    assert.equal(
      listeningEvidenceClass({ ...base, sourceType: 'recording', conditions: 'field' }),
      LISTENING_EVIDENCE_CLASSES.NOISY_CONVERSATION,
    );
    assert.equal(
      listeningEvidenceClass({ ...base, sourceType: 'recording', realisticConversation: true }),
      LISTENING_EVIDENCE_CLASSES.NOISY_CONVERSATION,
    );
  });

  it('every class has learner-facing copy and TTS copy admits it is not real evidence', () => {
    for (const cls of Object.values(LISTENING_EVIDENCE_CLASSES)) {
      assert.ok(LISTENING_EVIDENCE_LABELS[cls], `class ${cls} lacks copy`);
    }
    assert.ok(LISTENING_EVIDENCE_LABELS['tts-practice'].toLowerCase().includes('not real-speech evidence'));
  });

  it('the new metadata fields validate without fabricating presence', () => {
    // Absent metadata is legal (never guessed); present-but-wrong is rejected.
    assert.ok(validateAsset(base).ok, 'old assets stay valid');
    assert.ok(validateAsset({ ...base, speakerStatus: 'native', conditions: 'studio', transcription: 'full', difficulty: 'intermediate', topic: 'daily life' }).ok);
    assert.ok(!validateAsset({ ...base, speakerStatus: 'fluent' }).ok, 'unknown speakerStatus rejected');
    assert.ok(!validateAsset({ ...base, conditions: 'outdoors' }).ok, 'unknown conditions rejected');
    assert.ok(!validateAsset({ ...base, transcription: 'yes' }).ok, 'unknown transcription rejected');
    assert.ok(!validateAsset({ ...base, difficulty: 'hard' }).ok, 'unknown difficulty rejected');
  });
});
