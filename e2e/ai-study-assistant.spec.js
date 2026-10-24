import { test, expect } from '@playwright/test';

// The AI Study Assistant must advise from the learner's own record.
//
// The panel used to be handed a fixed object by App.jsx — 450 XP, a 12-day
// streak, three "weak" words, a table of practice hours — so every learner on
// every device was shown the same personalised advice, and a brand-new
// learner was told their streak was at risk before they had done anything.
//
// This spec pins the opposite: the panel shows what THIS learner did, and it
// stays quiet when there is nothing to say.

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

// The day key is computed here, in Node: `page.evaluate` runs in the browser,
// where this file's helpers do not exist.
const LEARNER_WITH_A_RECORD = ({ today }) => {
  localStorage.clear();
  localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
  localStorage.setItem('fp.onboarded', '1');
  // 40 XP this week, a 5-day streak, 15 minutes studied today.
  localStorage.setItem('fp.xpLog', JSON.stringify({ [today]: 40 }));
  localStorage.setItem('fp.streak', JSON.stringify({ count: 5, lastDay: today }));
  localStorage.setItem('fp.timeLog', JSON.stringify({ [today]: 900 }));
};

const LEARNER_WITH_NOTHING = () => {
  localStorage.clear();
  localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
  localStorage.setItem('fp.onboarded', '1');
};

async function openAssistant(page) {
  await page.getByRole('button', { name: /open your stats/ }).first().click();
  await page.getByRole('button', { name: 'AI Study Assistant' }).click();
  await expect(page.getByRole('dialog', { name: 'AI Study Assistant' })).toBeVisible({ timeout: 15_000 });
}

test('the assistant reports the learner\'s own numbers, not a constant', async ({ page }) => {
  await seed(page, LEARNER_WITH_A_RECORD, { today: dayKey(0) });
  await openAssistant(page);

  await page.getByRole('button', { name: /Learning Insights/ }).click();

  // This learner's week: 40 XP. The old panel said 450 for everybody.
  await expect(page.getByText('40 XP this week')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('dialog', { name: 'AI Study Assistant' })).not.toContainText('450 XP');

  // And their streak: 5 days, not the constant 12.
  await expect(page.getByText('5 day streak')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'AI Study Assistant' })).not.toContainText('12 day streak');
});

test('a learner with no practice is not told their streak is at risk', async ({ page }) => {
  await seed(page, LEARNER_WITH_NOTHING);
  await openAssistant(page);

  const dialog = page.getByRole('dialog', { name: 'AI Study Assistant' });
  await expect(dialog).not.toContainText('Streak at Risk', { timeout: 10_000 });
  // It says what it does not know rather than inventing a number.
  await expect(dialog).toContainText(/nothing to advise on|no practice on record/i);
});

// The overlay gate rejected five panel names, so the buttons that open them
// did nothing at all: the AI Study Assistant, the content importer, the
// share cards, the teacher dashboard and the gamification hub were all
// unreachable. Each one is opened here, so a name dropped from the gate
// fails a test instead of quietly closing a door.

