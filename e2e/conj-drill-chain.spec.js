import { test, expect } from '@playwright/test';

// The conj-drill chain link: an active conjugation-trainer gap (failed ≥2×,
// never repaired) must take over the Today drill slot and render the focused
// trainer — offline, no AI, no authored-library match (the trainer's concept
// shape matches no grammar topic). This closes the weakness loop end-to-end:
// the trainer's misses come back as the very next day's drill.

async function seedLocalStorage(page, seed) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(seed);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

const TRAINER_GAP_SEED = () => {
  localStorage.clear();
  localStorage.setItem('fp.settings', JSON.stringify({ mockMode: false, level: 'B1', ttsRate: 1 }));
  localStorage.setItem('fp.onboarded', '1');
  // An active conjugation gap: parler · present · je, failed 3×, never repaired.
  // The model shape mirrors learnerErrors.js normaliseEntry.
  localStorage.setItem('fp.learnerErrors.v1', JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [{
      id: 'grammar:conjugation:parler:present:0',
      category: 'grammar',
      key: 'conjugation:parler:present:0',
      label: 'parler · Présent · je → parle',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      lastErrorAt: new Date().toISOString(),
      lastSuccessAt: null,
      errorCount: 3,
      successCount: 0,
      recurrenceCount: 1,
      cleanPasses: 0,
      status: 'active',
      lastScore: 0,
      modes: ['conjugation-trainer'],
      evidence: [],
    }],
  }));
};

test('a trainer gap owns the drill segment and renders the focused trainer', async ({ page }) => {
  await seedLocalStorage(page, TRAINER_GAP_SEED);
  await page.getByRole('button', { name: 'Speak today' }).click();
  await expect(page.getByText(/Aujourd'hui/i).first()).toBeVisible({ timeout: 10_000 });

  // Advance to the drill segment: complete the mandatory speak turn, then
  // skip any interleaved segments (new-card retrieval may sit between speak
  // and the drill). The drill's own header is the stop signal — checking it
  // BEFORE each skip keeps the drill itself from being skipped while its
  // lazy chunk loads.
  const input = page.getByRole('textbox', { name: /Typed reply/i });
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill('Bonjour, je voudrais un café.');
  await input.press('Enter');
  await page.getByRole('button', { name: /End Session/i }).first().click();

  const drillHeader = page.getByText(/Verb drill — your weak form/i);
  const skip = page.getByRole('button', { name: /Skip/i });
  for (let i = 0; i < 8; i++) {
    // Give the next segment time to actually mount before considering a
    // skip — the drill's lazy chunk must not lose a race with its own Skip.
    const appeared = await drillHeader.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    if (appeared) break;
    if (!(await skip.isVisible({ timeout: 500 }).catch(() => false))) break;
    await skip.click();
  }
  await expect(drillHeader).toBeVisible({ timeout: 10_000 });

  // The focused trainer IS the drill — showing the exact weak form.
  const prompt = page.getByTestId('conj-prompt');
  await expect(prompt).toBeVisible({ timeout: 10_000 });
  await expect(prompt).toContainText('parler');
  await expect(prompt).toContainText('Présent');
  await expect(prompt).toContainText('je');

  // Answer it (the e2e reads data-answer, the app's own data — the trainer
  // itself validates the typed form).
  const answer = await prompt.getAttribute('data-answer');
  // Scope inside the session overlay — the dashboard behind the fixed dialog
  // can carry its own buttons that would trip Playwright's strict mode.
  const session = page.getByRole('dialog', { name: /Today's French/i });
  await session.getByRole('textbox', { name: /Type the conjugated form/i }).fill(answer);
  await session.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText(/Parfait\./)).toBeVisible();

  // And the segment hands back to the session — completed, not skipped.
  await page.getByRole('button', { name: /Done drilling/i }).click();
  await expect(page.getByText(/C'est tout|Aujourd'hui/i).first()).toBeVisible({ timeout: 10_000 });
});
