import { test, expect } from '@playwright/test';

// Every panel behind a button must actually open.
//
// `makeOverlay` in src/lib/overlayNav.js rejects any name that is not in
// OVERLAY_TYPES, and the reducer drops the open action when it is rejected —
// silently. Five panels were rendered by App.jsx and missing from that list:
// the AI Study Assistant, the content importer, the share cards, the teacher
// dashboard and the gamification hub. The buttons that open them did
// nothing, and the end-to-end suite had no way to reach them, so nobody
// noticed.
//
// Each panel is opened here, so a name dropped from the gate fails a test
// instead of quietly closing a door.

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
  localStorage.setItem('fp.xpLog', JSON.stringify({ [today]: 40 }));
  localStorage.setItem('fp.streak', JSON.stringify({ count: 5, lastDay: today }));
  localStorage.setItem('fp.timeLog', JSON.stringify({ [today]: 900 }));
};

test('every panel behind a button opens', async ({ page }) => {
  await seed(page, LEARNER, { today: dayKey(0) });

  // From the profile: the study assistant.
  await page.getByRole('button', { name: /open your stats/ }).first().click();
  await page.getByRole('button', { name: 'AI Study Assistant' }).click();
  await expect(page.getByRole('dialog', { name: 'AI Study Assistant' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Close AI assistant' }).click();
  await expect(page.getByRole('dialog', { name: 'AI Study Assistant' })).toBeHidden();

  // From the Learn tab: the share cards and the teacher dashboard.
  await page.getByRole('button', { name: 'Learn', exact: true }).first().click();
  await page.getByRole('button', { name: /Share Progress/ }).click();
  await expect(page.getByRole('dialog', { name: 'Share progress' })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Learn', exact: true }).first().click();
  await page.getByRole('button', { name: /Teacher Dashboard/ }).click();
  await expect(page.getByRole('dialog', { name: 'Teacher dashboard' })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  // From the Review tab: the content importer.
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await page.getByRole('button', { name: /Import your content/ }).click();
  await expect(page.getByRole('dialog', { name: 'Import content' })).toBeVisible({ timeout: 15_000 });
});
