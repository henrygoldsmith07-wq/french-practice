import { test, expect } from '@playwright/test';

// The Gamification Hub must show the learner's own game.
//
// The panel used to carry a fixed learner (47 sessions, a 12-day streak,
// 250 coins) and invent four rivals with random XP, a random rank out of an
// invented field of 15,000 players, and a percentile derived from it. It also
// offered a "Complete Challenge" button with nothing behind it.
//
// These checks open the hub and read what it says.

const dayKey = (offsetDays = 0) => {
  const d = new Date(Date.now() - offsetDays * 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

async function seed(page, seedFn, arg) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(seedFn, arg);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

const LEARNER = ({ today }) => {
  localStorage.clear();
  localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
  localStorage.setItem('fp.onboarded', '1');
  localStorage.setItem('fp.xp', JSON.stringify(120));
  localStorage.setItem('fp.xpLog', JSON.stringify({ [today]: 40 }));
  localStorage.setItem('fp.streak', JSON.stringify({ count: 5, lastDay: today }));
};

async function openHub(page) {
  await page.getByRole('button', { name: /open your stats/ }).first().click();
  await page.getByRole('button', { name: 'Gamification Hub' }).click();
  await expect(page.getByRole('dialog', { name: 'Gamification Hub' })).toBeVisible({ timeout: 15_000 });
}

test('the hub shows the learner\'s own badges, and no invented rivals', async ({ page }) => {
  await seed(page, LEARNER, { today: dayKey(0) });
  await openHub(page);

  const hub = page.getByRole('dialog', { name: 'Gamification Hub' });

  // The header carries this learner's own numbers: 120 XP, a 5-day streak.
  await expect(hub).toContainText('120 XP', { timeout: 10_000 });
  await expect(hub).toContainText('5-day streak');

  // The badges are the app's own fourteen. This learner has earned two of
  // them - one for XP, one for the streak - and the hub says so.
  await expect(hub).toContainText('2/14');
  await expect(hub).toContainText('Earned');

  // None of the invented furniture.
  for (const fiction of ['Alex', 'Sam', 'Jordan', 'Taylor', '15000', '15,000', 'percentile', '#1 of 15000']) {
    await expect(hub).not.toContainText(fiction);
  }
});

test('the league is the seeded local league, and the boost is the real one', async ({ page }) => {
  await seed(page, LEARNER, { today: dayKey(0) });
  await openHub(page);

  const hub = page.getByRole('dialog', { name: 'Gamification Hub' });

  // The league is the app's own: pace-setters, not players.
  await hub.getByRole('button', { name: 'League' }).click();
  await expect(hub).toContainText(/league/i, { timeout: 10_000 });
  await expect(hub).toContainText(/pace-setters are seeded practice challengers/i);

  // The only boost on offer is the streak freeze, at the app's real price.
  await hub.getByRole('button', { name: 'Boosts' }).click();
  await expect(hub).toContainText('150 coins each', { timeout: 10_000 });
  await expect(hub).not.toContainText('Double XP Boost');
  await expect(hub).not.toContainText('Instant Review Pack');
});
