// The Gamification Hub must show the learner's own game.
//
// The panel used to be a fiction. It carried a fixed user (47 sessions, 523
// words, a 12-day streak, 87% accuracy, 250 coins) and invented the rest: four
// rivals with random XP, a random rank out of an invented field of 15,000
// players, a percentile derived from that rank, a random challenge picked on
// every render, and a "Complete Challenge" button with no handler behind it.
//
// These tests pin the replacements: the hub reads the app's real game, the
// league is seeded rather than random, the daily challenges are the same
// three every time, and the only boost on offer is the one the studio
// actually sells.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { installMemoryStorage, freshModuleTag } from './helpers/memory-storage.js';

const repoFile = (p) => new URL(p, import.meta.url);

test('the invented gamification module is gone', () => {
  assert.equal(
    existsSync(repoFile('../src/lib/gamification.js')), false,
    'src/lib/gamification.js existed only to feed the panel invented numbers, and nothing else imported it',
  );
});

test('the hub reads the app\'s real game, not a parallel copy', () => {
  const source = readFileSync(repoFile('../src/components/GamificationHub.jsx'), 'utf8');
  // The comments in the file describe what the panel used to do, so the scan
  // looks at code only.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /from '\.\.\/lib\/gamification'/, 'the hub must not import the invented module');
  assert.match(source, /from '\.\.\/lib\/game\.js'/, 'the hub reads the real game');
  assert.match(source, /from '\.\.\/lib\/gameStats\.js'/, 'the hub reads the same stats the badges are measured against');
  // The four invented rivals and the invented field of players.
  for (const fiction of ['Alex', 'Sam', 'Jordan', 'Taylor', 'totalPlayers', 'friendsRank', 'globalRank', 'percentile']) {
    assert.doesNotMatch(code, new RegExp(fiction), `the hub still shows ${fiction}`);
  }
  // A hard-coded learner.
  assert.doesNotMatch(code, /sessionsCompleted:\s*47|streakDays:\s*12|vocabularyLearned:\s*523|weeklyXP:\s*450/, 'the hub still carries a fixed learner');
});

test('the league is seeded, so the same week always gives the same board', async () => {
  const { weeklyLeague, leagueTier } = await import(`../src/lib/game.js${freshModuleTag()}`);
  const tier = leagueTier(3);
  const first = weeklyLeague('2026-10-19', 120, 0.4, tier.index, { name: 'You', avatar: '🙂' });
  const second = weeklyLeague('2026-10-19', 120, 0.4, tier.index, { name: 'You', avatar: '🙂' });
  assert.deepEqual(first.standings, second.standings, 'the board changed between two calls with the same week');
  assert.ok(first.count < 100, `a league of ${first.count} is not a global ranking`);
  // The learner is on the board, and the others are pace-setters.
  assert.equal(first.standings.filter((s) => s.isUser).length, 1);
});

test('the daily challenges are the same three every time the day is read', async () => {
  const { dailyChallenges } = await import(`../src/lib/game.js${freshModuleTag()}`);
  const a = dailyChallenges('2026-10-21');
  const b = dailyChallenges('2026-10-21');
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id), 'the challenges changed between two reads of the same day');
  // A different day is a different set - but still three, still deterministic.
  const other = dailyChallenges('2026-10-22');
  assert.equal(other.length, 3);
  assert.deepEqual(other.map((c) => c.id), dailyChallenges('2026-10-22').map((c) => c.id));
});

test('the streak freeze is real: it costs coins, and it counts', async () => {
  installMemoryStorage();
  const storage = await import(`../src/lib/storage.js${freshModuleTag()}`);
  const { FREEZE_COST, MAX_FREEZES } = storage;

  assert.equal(storage.getFreezes(), 0, 'a new learner has no freezes');
  // Not enough coins: nothing is bought.
  storage.addCoins(FREEZE_COST - 1);
  assert.equal(storage.buyFreeze(), null, 'a freeze was bought without the coins for it');
  assert.equal(storage.getCoins(), FREEZE_COST - 1, 'and the coins were taken anyway');
  assert.equal(storage.getFreezes(), 0);

  // With the coins: one freeze, and the coins are spent.
  storage.addCoins(1);
  storage.buyFreeze();
  assert.equal(storage.getFreezes(), 1);
  assert.equal(storage.getCoins(), 0, 'the coins were not spent');

  // The cap holds.
  storage.addCoins(FREEZE_COST * MAX_FREEZES);
  for (let i = 0; i < MAX_FREEZES + 2; i += 1) storage.buyFreeze();
  assert.equal(storage.getFreezes(), MAX_FREEZES, 'more freezes were bought than the cap allows');
});

test('the two boosts that never existed are not on offer', async () => {
  const source = readFileSync(repoFile('../src/components/GamificationHub.jsx'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /double_xp|Double XP Boost/, 'a double-XP boost was never part of the game');
  assert.doesNotMatch(code, /instant_review|Instant Review Pack/, 'an instant review pack was never part of the game');
  // The freeze is the real one, bought at the app's real price.
  assert.match(code, /FREEZE_COST/);
  assert.match(code, /buyFreeze/);
});

test('claiming the last daily challenge awards the postcard', async () => {
  // The profile has always paid out the postcard when the third challenge of
  // the day is claimed. The hub claims challenges too, so it has to pay out
  // the same way - otherwise a learner who claims from the hub is short of
  // the postcard they earned.
  installMemoryStorage();
  const storage = await import(`../src/lib/storage.js${freshModuleTag()}`);
  const { dailyChallenges } = await import(`../src/lib/game.js${freshModuleTag()}`);
  const { claimDailyChallenge } = await import(`../src/lib/gameGrants.js${freshModuleTag()}`);

  const todays = dailyChallenges(storage.getChallengeState().day);
  assert.equal(todays.length, 3);

  // Meet every target, so each one can be claimed.
  for (const c of todays) {
    storage.bumpChallengeMetric(c.metric, c.target);
  }

  let postcard = null;
  for (const c of todays) {
    postcard = claimDailyChallenge(c, todays);
  }

  assert.ok(postcard, 'the third challenge of the day did not award a postcard');
  const owned = storage.getCollectibles();
  assert.ok(owned[postcard], 'the postcard was not recorded as owned');
  // The coins were paid, once per challenge.
  const coins = todays.reduce((sum, c) => sum + c.coins, 0);
  assert.equal(storage.getCoins(), coins, 'the challenge coins were not paid');
});
