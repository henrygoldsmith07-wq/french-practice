import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DICTATION_LEVELS, dictationSpeed, diacriticStrict, levelForSrs,
} from '../src/lib/dictationProgression.js';
import { listeningDifficultyLadder } from '../src/lib/learningAdaptation.js';

const IDS = [1, 2, 3, 4, 5];
const text = (lvl) => `${lvl.label} ${lvl.hint}`;

describe('dictation level labels match the behaviour', () => {
  it('keeps exactly five levels, ids 1 through 5', () => {
    assert.deepEqual(DICTATION_LEVELS.map((l) => l.id), IDS);
    assert.equal(DICTATION_LEVELS.length, 5);
  });

  it('never claims authentic or natural (human) speech for synthesized TTS', () => {
    const banned = ['authentic', 'natural speech', 'recording', 'human voice', 'native speaker'];
    for (const lvl of DICTATION_LEVELS) {
      const copy = text(lvl).toLowerCase();
      for (const bad of banned) {
        assert.equal(copy.includes(bad), false, `level ${lvl.id} copy leaks "${bad}": ${text(lvl)}`);
      }
    }
  });

  it('no level fabricates a content tier — only presentation fields exist', () => {
    // The drill draws one arbitrary sentence from the shared pool at every
    // level. A label may describe pace/strictness, but the data must not
    // pretend a level selects word / chunk / sentence / paragraph content.
    for (const lvl of DICTATION_LEVELS) {
      assert.deepEqual(Object.keys(lvl).sort(), ['hint', 'id', 'label']);
    }
  });

  it('the pace words in the labels are backed by the actual TTS speed ramp', () => {
    const speeds = IDS.map(dictationSpeed);
    for (let i = 1; i < speeds.length; i++) {
      assert.ok(speeds[i] >= speeds[i - 1], `speed must not decrease at level ${i + 1}`);
    }
    assert.ok(speeds[0] < speeds[4], 'L5 is genuinely faster than L1');
    assert.match(text(DICTATION_LEVELS[0]).toLowerCase(), /slow/);
    assert.match(text(DICTATION_LEVELS[4]).toLowerCase(), /fast/);
    // Every level describes speech/pace rather than a content tier.
    for (const lvl of DICTATION_LEVELS) {
      assert.match(text(lvl).toLowerCase(), /speech|pace/);
    }
  });

  it('the strictness claimed in the copy matches diacriticStrict', () => {
    // Levels 1-3 are lenient, 4-5 strict (the header prints this from
    // diacriticStrict). The labels must not contradict that ramp.
    assert.deepEqual(IDS.map(diacriticStrict), [false, false, false, true, true]);
  });

  it('L5 is honestly labelled as fast synthesized speech, not authentic audio', () => {
    const l5 = text(DICTATION_LEVELS[4]).toLowerCase();
    assert.match(l5, /fast/);
    assert.match(l5, /synthesized speech/);
    assert.equal(diacriticStrict(5), true);
  });
});

describe('five-level cap is preserved', () => {
  it('levelForSrs never exceeds level 5', () => {
    const manyKnown = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`w${i}`, { reps: 5 }]));
    assert.equal(levelForSrs({}), 1);
    assert.equal(levelForSrs(manyKnown), 5);
    assert.ok(levelForSrs(manyKnown) <= DICTATION_LEVELS.length);
  });

  it('listeningDifficultyLadder caps the stage at 5 even with overwhelming evidence', () => {
    const high = listeningDifficultyLadder({
      level: 'C2',
      srs: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`w${i}`, { reps: 5 }])),
      entries: [],
      metrics: Array.from({ length: 20 }, () => ({ skill: 'listening', score: 100 })),
    });
    assert.equal(high.stage, 5);
    assert.ok(DICTATION_LEVELS.some((l) => l.id === high.stage), 'stage always resolves to a labelled level');

    const low = listeningDifficultyLadder({
      level: 'A1', srs: {}, entries: [], metrics: [],
    });
    assert.ok(low.stage >= 1 && low.stage <= 5);
    assert.ok(low.stage < high.stage);
  });
});
