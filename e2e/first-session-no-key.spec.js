// First session without a key — the acceptance criterion.
//
// A fresh browser profile must complete onboarding and reach REAL AI feedback
// with no API key. On the hosted app that comes from the free relay trial.
//
// The old bug: Onboarding called onComplete({ mock: true }) unconditionally, so
// even with the relay wired up a brand-new learner was dropped into scripted
// "demo mode" and never saw a live correction.
//
// The live-AI spec runs against a production build compiled WITH the relay env
// set, which is the only honest way to prove the hosted path — a local build
// has no relay configured and correctly reports demo mode.

import { test, expect } from '@playwright/test';

async function seedFresh(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('fp.settings', JSON.stringify({ level: 'B1', ttsRate: 1, theme: null }));
  });
}

test.describe('first session with no key (relay build)', () => {
  // Only meaningful when the build actually has a relay wired in.
  test.skip(
    !process.env.PW_TEST_RELAY,
    'Set PW_TEST_RELAY=1 against a relay-enabled build (VITE_GROQ_RELAY_URL set) to run the live-AI path.',
  );

  test('a brand-new visitor finishes onboarding into a live AI session, with no key', async ({ page }) => {
    await seedFresh(page);
    await page.goto('/');

    const dialog = page.getByRole('dialog', { name: 'Getting started' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole('heading', { name: /Which language/i })).toBeVisible();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await expect(page.getByRole('heading', { name: /What’s your level/i })).toBeVisible();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await expect(page.getByRole('heading', { name: /What do you want to practise/i })).toBeVisible();
    await page.getByRole('button', { name: /^Continue/ }).click();

    // The closing screen must claim the AI that is actually provided.
    await expect(page.getByRole('heading', { name: /Ready to speak French/i })).toBeVisible();
    await expect(page.getByText(/AI feedback included/i)).toBeVisible();
    await expect(page.getByText(/no key needed/i)).toBeVisible();

    await page.getByRole('button', { name: /Start a .*conversation/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Critically: the learner must NOT be left in mock mode.
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.settings') || '{}'));
    expect(settings.mockMode, 'a fresh visitor with a relay must not be parked in mock mode').toBe(false);
  });
});

test.describe('honest fallback with no live AI', () => {
  // Which copy the closing screen shows depends on the BUILD: a relay build
  // offers the free trial and must say so, a plain build must honestly say
  // demo mode. Assert the right one for the build under test rather than
  // hard-coding either — that is the whole point of the honesty contract.
  const hasRelay = process.env.PW_TEST_RELAY === '1';

  test('the closing screen matches the AI the build actually provides', async ({ page }) => {
    await seedFresh(page);
    await page.goto('/');

    const dialog = page.getByRole('dialog', { name: 'Getting started' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /^Continue/ }).click();

    await expect(page.getByRole('heading', { name: /Ready to speak French/i })).toBeVisible();

    if (hasRelay) {
      // A relay build provides real AI with no key, so it must claim exactly that.
      await expect(page.getByText(/AI feedback included/i)).toBeVisible();
      await expect(page.getByText(/no key needed/i)).toBeVisible();
      await expect(page.getByText(/Demo mode is ready now/i)).toHaveCount(0);
    } else {
      // No relay and no key: demo mode, described honestly, with no overclaim.
      await expect(page.getByText(/Demo mode is ready now/i)).toBeVisible();
      await expect(page.getByText(/no live AI/i)).toBeVisible();
      await expect(page.getByText(/AI feedback included/i)).toHaveCount(0);
    }
  });

  test('a fresh profile reaches onboarding rather than crashing', async ({ page }) => {
    // Regression guard: a `const` read before its declaration in this chunk
    // crashed first-run onboarding outright (a TDZ error swallowed by the
    // error boundary as "Oups — something broke").
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await seedFresh(page);
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Getting started' })).toBeVisible({ timeout: 15_000 });
    expect(errors, 'first-run onboarding must not throw').toEqual([]);
    await expect(page.getByRole('heading', { name: /Ready to speak French/i })).toBeHidden();
  });
});
