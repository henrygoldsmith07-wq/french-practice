import { test, expect } from '@playwright/test';

// The spoken diagnostic — the product's core entry point — driven through the
// REAL UI for the first time. Until now it was only unit-tested with injected
// recorders; no spec made the onboarding Speak step actually produce a named
// weakness. This does, in mock mode via the "type instead" path (no mic, no AI
// key), and asserts the honesty the product promises: a named weakness comes
// back, it is labelled an offline estimate, and it is recorded so the next
// Today session can see it.

async function bootToDiagnostic(page) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  // mockMode: the honest no-key path. The diagnostic grades delivery only and
  // must say so.
  await page.evaluate(() => {
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
    localStorage.setItem('fp.onboarded', '1');
  });
  // Not onboarded-yet: we want the onboarding dialog with the Speak step. Clear
  // the onboarded flag we just set and reload into a fresh onboarding.
  await page.evaluate(() => localStorage.removeItem('fp.onboarded'));
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });

  const dialog = page.getByRole('dialog', { name: 'Getting started' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // Walk to the spoken-diagnostic step, anchoring each step's own heading so a
  // slow engine never races the transition (same discipline as the other specs).
  await expect(dialog.getByText(/Which language/i).first()).toBeVisible();
  await dialog.getByRole('button', { name: /^Continue/ }).click();
  await expect(dialog.getByText(/your level/i).first()).toBeVisible();
  await dialog.getByRole('button', { name: /^Continue/ }).click();
  await expect(dialog.getByText(/What do you want to practise/i).first()).toBeVisible();
  await dialog.getByRole('button', { name: /Skip goal for now/i }).click();
  await dialog.getByRole('button', { name: /^Continue/ }).click();

  await expect(dialog.getByText(/Say a few sentences/i).first()).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test('the typed diagnostic produces a named weakness and records it for Today', async ({ page }) => {
  const dialog = await bootToDiagnostic(page);

  // Type a short answer (no mic, no AI) and check it.
  const box = dialog.getByLabel(/Type your answer instead of speaking/i);
  await box.fill('Je suis allé au marché avec mon frère.');
  await dialog.getByRole('button', { name: /Check what I wrote/i }).click();

  // A named weakness comes back — the whole point of the step.
  const result = dialog.getByTestId('diagnostic-result');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText(/Your first named weakness/i)).toBeVisible();
  // The weakness has a real label (a dimension name), not a placeholder.
  const label = result.locator('p.text-lg').first();
  await expect(label).not.toBeEmpty();

  // Honesty: mock mode is an offline estimate, plainly stated.
  await expect(result.getByText(/Estimated offline from delivery/i)).toBeVisible();

  // The re-check is scheduled and named.
  await expect(result.getByText(/Re-check in \d+ day/i)).toBeVisible();

  // And it is RECORDED into the shared model, so the next Today session can see
  // it — the finding is not just a screen, it is persisted.
  const recorded = await page.evaluate(() => {
    const raw = localStorage.getItem('fp.learnerErrors.v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(recorded, 'the diagnostic weakness is written to the learner-error model').toBeTruthy();
  const entries = recorded.entries || [];
  expect(entries.length, 'at least one weakness entry is recorded').toBeGreaterThan(0);
  expect(entries.some((e) => String(e.key || '').startsWith('diagnostic:')), 'the entry is the diagnostic weakness').toBe(true);
});

test('an empty typed answer is not diagnosed — silence names nothing', async ({ page }) => {
  const dialog = await bootToDiagnostic(page);
  const box = dialog.getByLabel(/Type your answer instead of speaking/i);
  // Leave it empty and try to check: the step must refuse, not invent a gap.
  await dialog.getByRole('button', { name: /Check what I wrote/i }).click();
  await expect(dialog.getByText(/Write a sentence or two first/i)).toBeVisible();
  await expect(dialog.getByTestId('diagnostic-result')).toHaveCount(0);
});
