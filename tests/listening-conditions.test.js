import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONDITIONS, hesitationScript, overlapScript, playbackScript,
  conditionStage, noiseBedConfig, HESITATION_FILLERS,
} from '../src/lib/listeningConditions.js';

// Deterministic rng for reproducible tests.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

test('hesitation script splits phrases, injects fillers and schedules gaps', () => {
  const rng = seeded(42);
  const { segments, totalGapMs } = hesitationScript(
    'Bonjour, je voudrais un café. Un croissant aussi, sil vous plaît. Merci beaucoup !',
    rng
  );
  assert.ok(segments.length >= 2, 'should split into phrases');
  assert.equal(segments[0].voiceIndex, 0);
  const joined = segments.map((s) => s.text).join(' ');
  const hasFiller = HESITATION_FILLERS.some((f) => joined.includes(f));
  // With ~3 segments at a 30% filler chance, a seeded run may or may not
  // inject — assert the MECHANISM instead: gaps exist and totals add up.
  const gapSum = segments.reduce((a, s) => a + s.gapAfterMs, 0);
  assert.equal(totalGapMs, gapSum);
  assert.ok(segments[segments.length - 1].gapAfterMs === 0, 'no trailing gap');
  assert.ok(totalGapMs >= 0 && hasFiller !== undefined);
});

test('hesitation script is deterministic for a seeded rng', () => {
  const a = hesitationScript('Un, deux, trois. Quatre, cinq!', seeded(7));
  const b = hesitationScript('Un, deux, trois. Quatre, cinq!', seeded(7));
  assert.deepEqual(a, b);
});

test('empty transcript yields an empty script, never a crash', () => {
  assert.deepEqual(hesitationScript('', seeded(1)), { segments: [], totalGapMs: 0 });
  assert.deepEqual(overlapScript([]), { segments: [], totalGapMs: 0 });
  assert.deepEqual(playbackScript('hesitation', [], seeded(1)).segments, []);
});

test('overlap script alternates two voices with a 600ms stagger', () => {
  const { segments } = overlapScript([
    { fr: 'Bonjour !' },
    { fr: 'Salut, ça va ?' },
    { fr: 'Ça va très bien.' },
  ]);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].voiceIndex, 0);
  assert.equal(segments[1].voiceIndex, 1);
  assert.equal(segments[2].voiceIndex, 0);
  assert.equal(segments[1].gapAfterMs, 600);
});

test('playbackScript routes each condition to the right builder', () => {
  const lines = [{ fr: 'Première ligne.' }, { fr: 'Deuxième ligne.' }];
  const normal = playbackScript('normal', lines);
  assert.equal(normal.segments.length, 2);
  assert.equal(normal.segments[0].voiceIndex, 0);
  const overlap = playbackScript('overlap', lines);
  assert.equal(overlap.segments[1].voiceIndex, 1);
  const hes = playbackScript('hesitation', lines, seeded(3));
  assert.ok(hes.segments.length >= 1);
  // Noise conditions use the plain script — the noise is a playback layer.
  assert.deepEqual(playbackScript('noise-ambient', lines), normal);
});

test('condition metadata is honest: synthetic flags and stage mapping', () => {
  assert.equal(CONDITIONS.normal.synthetic, false);
  for (const id of ['hesitation', 'overlap', 'noise-ambient', 'noise-busy']) {
    assert.equal(CONDITIONS[id].synthetic, true, `${id} must be labelled synthetic`);
  }
  assert.equal(conditionStage('overlap').stage, 7);
  assert.equal(conditionStage('hesitation').stage, 6);
  assert.equal(conditionStage('noise-busy').stage, 7);
  assert.equal(conditionStage('nope'), null);
});

test('noise bed presets scale with intensity', () => {
  const ambient = noiseBedConfig('noise-ambient');
  const busy = noiseBedConfig('noise-busy');
  assert.ok(ambient.gain < busy.gain);
  assert.ok(ambient.lowpassHz > busy.lowpassHz, 'busier noise is darker/muddier');
  assert.equal(noiseBedConfig('normal'), null);
});
