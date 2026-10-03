import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normaliseTrackMetadata, trackQualifiesForStage, selectTrackForStage,
  listeningEvidenceLabel, nextListeningStage, listeningLadder,
  LISTENING_PROGRESSION,
} from '../src/lib/listeningProgression.js';

const ttsTrack = (over = {}) => ({
  id: 't1', kind: 'podcast', cefr: 'B1', title: 'A track',
  lines: [{ fr: 'Bonjour.', en: 'Hello.' }],
  sourceType: 'tts', ...over,
});

const recordingTrack = (over = {}) => ({
  id: 'r1', kind: 'authentique', cefr: 'B1', title: 'A recording',
  lines: [{ fr: 'Bonjour.', en: 'Hello.' }, { fr: 'Salut.', en: 'Hi.', speaker: 'B' }],
  sourceType: 'recording', ...over,
});

describe('listening metadata honesty', () => {
  it('a synthetic track never claims to be a real recording', () => {
    const meta = normaliseTrackMetadata(ttsTrack());
    assert.equal(meta.audioType, 'tts');
    assert.equal(meta.licence, 'synthetic');
    assert.ok(meta.provenance.toLowerCase().includes('studio'));
  });

  it('licence claims are never invented for recordings', () => {
    const unknown = normaliseTrackMetadata(recordingTrack({ licence: undefined }));
    assert.equal(unknown.licence, 'unknown', 'absent licence stays unknown');
    const declared = normaliseTrackMetadata(recordingTrack({ licence: 'CC-BY 4.0' }));
    assert.equal(declared.licence, 'CC-BY 4.0');
  });

  it('metadata covers the full provenance surface', () => {
    const meta = normaliseTrackMetadata(ttsTrack({ speaker: 'Claire', accent: 'fr-ca', speed: 'fast', formality: 'formal', spontaneity: 'semi-spontaneous', noise: 'light', topic: 'food' }));
    assert.equal(meta.speaker, 'Claire');
    assert.equal(meta.accent, 'fr-ca');
    assert.equal(meta.speed, 'fast');
    assert.equal(meta.formality, 'formal');
    assert.equal(meta.spontaneity, 'semi-spontaneous');
    assert.equal(meta.noise, 'light');
    assert.equal(meta.topic, 'food');
    assert.equal(meta.transcript, 'available');
  });

  it('unknown values fall back safely instead of being guessed wrong', () => {
    const meta = normaliseTrackMetadata({ id: 'x', lines: [] });
    assert.equal(meta.licence, 'synthetic');
    assert.equal(meta.transcript, 'unavailable');
    assert.ok(meta.audioType === 'tts');
  });
});

describe('listening progression ladder', () => {
  it('runs slow → normal → speakers → accents → spontaneous → noise', () => {
    assert.deepEqual(LISTENING_PROGRESSION.map((s) => s.id), [
      'slow-clear', 'normal-speed', 'different-speakers', 'accent-variation', 'spontaneous', 'noise',
    ]);
  });

  it('each stage has plain learner-facing copy', () => {
    for (const stage of LISTENING_PROGRESSION) {
      assert.ok(stage.label.length > 3);
      assert.ok(stage.description.length > 10);
      for (const bad of ['tts', 'metadata', 'provenance', 'cefr']) {
        assert.ok(!stage.label.toLowerCase().includes(bad), `label leaks "${bad}"`);
      }
    }
  });

  it('stage qualification respects the criteria', () => {
    const slow = LISTENING_PROGRESSION[0];
    const spontaneous = LISTENING_PROGRESSION.find((s) => s.id === 'spontaneous');
    assert.equal(trackQualifiesForStage(ttsTrack({ speed: 'slow' }), slow), true);
    assert.equal(trackQualifiesForStage(ttsTrack({ speed: 'fast' }), slow), false);
    assert.equal(trackQualifiesForStage(ttsTrack({ spontaneity: 'spontaneous' }), spontaneous), true);
    assert.equal(trackQualifiesForStage(ttsTrack({ spontaneity: 'scripted' }), spontaneous), false);
  });

  it('selection falls back gracefully when nothing qualifies', () => {
    const tracks = [ttsTrack({ id: 'a', speed: 'slow' })];
    const wanted = LISTENING_PROGRESSION.find((s) => s.id === 'noise');
    const result = selectTrackForStage(tracks, wanted.id, {});
    assert.ok(result.track, 'a track is still offered');
    assert.equal(result.fallback, true, 'the fallback is flagged, not hidden');
    assert.ok(result.stage.id !== 'noise', 'the stage is stepped down honestly');
  });

  it('excluded tracks are not reused', () => {
    const tracks = [ttsTrack({ id: 'a' }), ttsTrack({ id: 'b' })];
    const result = selectTrackForStage(tracks, 'normal-speed', { excludeIds: ['a'] });
    assert.equal(result.track.id, 'b');
  });

  it('the ladder reports done/current/ahead states', () => {
    const ladder = listeningLadder('normal-speed');
    assert.equal(ladder.find((s) => s.id === 'slow-clear').state, 'done');
    assert.equal(ladder.find((s) => s.id === 'normal-speed').state, 'current');
    assert.equal(ladder.find((s) => s.id === 'noise').state, 'ahead');
    assert.equal(nextListeningStage('normal-speed').id, 'different-speakers');
    assert.equal(nextListeningStage('noise').id, 'noise', 'stays at the top, never past it');
  });
});

describe('synthetic vs real listening evidence', () => {
  it('distinguishes studio audio from real recordings in plain language', () => {
    const synthetic = listeningEvidenceLabel(ttsTrack());
    const real = listeningEvidenceLabel(recordingTrack());
    assert.ok(synthetic.includes('studio audio'));
    assert.ok(synthetic.includes('not yet verified'));
    assert.ok(real.includes('real recording'));
    for (const text of [synthetic, real]) {
      for (const bad of ['tts', 'provenance', 'metadata', 'synthetic']) {
        assert.ok(!text.toLowerCase().includes(bad), `copy leaks "${bad}"`);
      }
    }
  });
});
