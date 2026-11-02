// The writing surface must offer prompts at the learner's own level.
//
// The pools used to be picked at random: an A2 learner could be handed a
// C1 essay question ("La cuisine d'un pays raconte-t-elle son histoire ?")
// with nothing on screen to say how hard it was. Each item now carries a
// `cefr` tag, and the picker chooses at the learner's level.
//
// The rules this test pins:
//   1. every prompt and starter carries a level from the app's spine
//   2. a learner at level X gets an item at X when the pool has one
//   3. when the pool has none at X, the nearest level below is used
//      (stretching is better than being asked for something far out of
//      reach), and failing that the nearest one above
//   4. the picker never returns nothing — an empty writing screen would be
//      worse than a prompt one band off
//   5. the level spine in lib/writing.js is the app's spine (lib/cefr.js),
//      so the two cannot drift apart silently
//
// Run: node --test tests/writing-levels.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMPLETION_STARTERS,
  WRITING_PROMPTS,
  ESSAY_PROMPTS,
  pickForLevel,
} from '../src/lib/writing.js';
import { ALL_LEVELS, levelIndex } from '../src/lib/cefr.js';

const POOLS = { COMPLETION_STARTERS, WRITING_PROMPTS, ESSAY_PROMPTS };

test('every writing item carries a level from the app spine', () => {
  for (const [name, pool] of Object.entries(POOLS)) {
    assert.ok(pool.length > 0, `${name} is empty`);
    for (const item of pool) {
      assert.ok(
        ALL_LEVELS.includes(item.cefr),
        `${name} item "${item.fr}" has level ${item.cefr}, which is not on the app spine`,
      );
    }
  }
});

test('a learner at level X is offered an item at level X', () => {
  for (const level of ['A2', 'B1']) {
    for (const [name, pool] of Object.entries(POOLS)) {
      const atLevel = pool.filter((i) => i.cefr === level);
      if (!atLevel.length) continue; // this pool has nothing at that level
      // 30 draws: every one of them must be at the learner's level.
      for (let n = 0; n < 30; n += 1) {
        const picked = pickForLevel(pool, undefined, level);
        assert.equal(picked.cefr, level, `${name} handed a ${picked.cefr} item to a ${level} learner`);
      }
    }
  }
});

test('when the pool has nothing at the learner level, the nearest below is used', () => {
  const pool = [
    { fr: 'a', en: 'a', cefr: 'A1' },
    { fr: 'b', en: 'b', cefr: 'B2' },
  ];
  for (let n = 0; n < 30; n += 1) {
    const picked = pickForLevel(pool, undefined, 'B1');
    assert.equal(picked.cefr, 'A1', 'a B1 learner should be stretched to A1, not thrown at B2');
  }
});

test('when the pool has nothing at or below the learner level, the nearest above is used', () => {
  const pool = [
    { fr: 'a', en: 'a', cefr: 'B2' },
    { fr: 'b', en: 'b', cefr: 'C1' },
  ];
  for (let n = 0; n < 30; n += 1) {
    const picked = pickForLevel(pool, undefined, 'A1');
    assert.equal(picked.cefr, 'B2', 'an A1 learner with nothing below should get the nearest above');
  }
});

test('the picker always returns something', () => {
  const pool = [{ fr: 'a', en: 'a', cefr: 'A1' }];
  assert.ok(pickForLevel(pool, undefined, 'C1'), 'a pool with one item still returns it');
  // Excluding the only item leaves nothing: the picker must not throw.
  assert.equal(pickForLevel(pool, pool[0], 'A1'), undefined, 'an emptied pool returns undefined, not a crash');
  // A pool with no tags at all still returns an item.
  const untagged = [{ fr: 'x', en: 'x' }];
  assert.ok(pickForLevel(untagged, undefined, 'B1'), 'an untagged pool still returns an item');
});

test('the writing spine matches the app spine', () => {
  const source = readFileSync(new URL('../src/lib/writing.js', import.meta.url), 'utf8');
  const match = source.match(/const LEVEL_ORDER = \[([^\]]+)\]/);
  assert.ok(match, 'LEVEL_ORDER is declared in lib/writing.js');
  const local = match[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.deepEqual(local, ALL_LEVELS, 'lib/writing.js and lib/cefr.js disagree about the level order');
  assert.equal(levelIndex('B1'), local.indexOf('B1'));
});
