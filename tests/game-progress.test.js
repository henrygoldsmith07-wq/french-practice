// The badge progress the Gamification Hub shows must agree with the badge's
// unlock condition.
//
// Each achievement in src/lib/game.js carries a `check(stats)` ("is this
// earned?") and now a `value(stats)` and a `target` ("how far along is it?").
// The hub puts the second pair on screen, so a learner can see "4 / 5
// sessions" and know what is left. If the two ever disagree, the number on
// screen is a lie: it would say 5/5 while the badge stayed locked, or count
// down to a badge that arrives early.
//
// This test finds, for each badge, the one stat it is measured by, and
// checks that the badge is locked one step below the target and unlocked at
// it, with the progress number agreeing at both ends.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS } from '../src/lib/game.js';

// Every stat a badge can be measured by, with a value that is NOT enough on
// its own.
const STAT_FIELDS = {
  xp: 0,
  level: 0,
  streak: 0,
  sessions: 0,
  reviews: 0,
  grammarMastered: 0,
  notebook: 0,
  collectibles: 0,
  drills: 0,
  starred: 0,
};

const emptyStats = () => ({ ...STAT_FIELDS });

// The stat a badge is measured by: the one field that makes `check` true
// when it is set to the badge's target.
function fieldBehind(achievement) {
  for (const field of Object.keys(STAT_FIELDS)) {
    const stats = { ...emptyStats(), [field]: achievement.target };
    if (achievement.check(stats)) return field;
  }
  return null;
}

test('every badge says what it is measured by', () => {
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.check, 'function', `${a.id} has no check()`);
    assert.equal(typeof a.value, 'function', `${a.id} has no value() to show progress with`);
    assert.equal(typeof a.target, 'number', `${a.id} has no target`);
    assert.ok(a.target > 0, `${a.id} has a target of ${a.target}`);
    assert.ok(fieldBehind(a), `${a.id} cannot be met by any known stat`);
  }
});

test('a badge unlocks exactly when its progress reaches the target', () => {
  for (const a of ACHIEVEMENTS) {
    const field = fieldBehind(a);
    const below = { ...emptyStats(), [field]: a.target - 1 };
    const at = { ...emptyStats(), [field]: a.target };

    assert.equal(
      a.check(below), false,
      `${a.id} is unlocked with ${field} = ${a.target - 1}, one short of its target`,
    );
    assert.equal(
      a.value(below) < a.target, true,
      `${a.id} shows progress ${a.value(below)} at ${field} = ${a.target - 1}, which is not short of the target`,
    );

    assert.equal(
      a.check(at), true,
      `${a.id} is still locked at ${field} = ${a.target}, which is its target`,
    );
    assert.equal(
      a.value(at) >= a.target, true,
      `${a.id} shows progress ${a.value(at)} at ${field} = ${a.target}, short of the target it has reached`,
    );
  }
});

test('a badge never counts past its target', () => {
  for (const a of ACHIEVEMENTS) {
    const field = fieldBehind(a);
    const far = { ...emptyStats(), [field]: a.target * 10 + 5 };
    assert.ok(a.value(far) >= a.target, `${a.id} reports less than its target once reached`);
  }
});
