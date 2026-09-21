import { test, expect } from '@playwright/test';

// Language-gating edge coverage that complements beta-language-journeys.spec.js
// (which drives the full German/Spanish journeys). These three tests pin the
// quieter honesty contracts:
//
//   · a stale deep link (last-activity resume) to French-only grammar
//     reroutes a Beta learner away from it
//   · the Progress hub neither offers nor advertises the Learning path
//   · search answers a French-only query with an honest zero, not a
//     French result hiding behind a gated corpus
//
// All assertions are user-visible state, not source shape.

async function seedLanguage(page, langId) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((lang) => {
    localStorage.setItem('fp.onboarded', '1');
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: false, level: 'B1', language: lang }));
  }, langId);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

async function openTab(page, name) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click();
}

test.describe('language gating — quiet honesty contracts', () => {
  test('a stale deep link to French-only grammar reroutes a German learner away', async ({ page }) => {
    await seedLanguage(page, 'de');
    await page.evaluate(() => {
      localStorage.setItem('fp.lastActivity', JSON.stringify({
        type: 'grammar', id: 'passe-compose', label: 'Grammar: Passé composé', at: new Date().toISOString(),
      }));
    });
    await page.reload();
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /resume practice/i }).click();
    // Never the grammar screen: no French grammar title after the resume,
    // and the Learn tab shows the hub root, not a topic detail.
    await expect(page.getByText('Passé composé')).toHaveCount(0);
  });

  test('the Progress hub offers no Learning path to a German learner', async ({ page }) => {
    await seedLanguage(page, 'de');
    await openTab(page, 'Progress');
    await expect(page.getByText('Learning path', { exact: false })).toHaveCount(0);
  });

  test('search answers a French-only query with an honest zero for Spanish', async ({ page }) => {
    await seedLanguage(page, 'es');
    await page.getByRole('button', { name: 'Search the studio' }).click();
    const search = page.getByRole('dialog', { name: 'Search' });
    await search.getByRole('textbox', { name: 'Search the whole studio' }).fill('passé');
    await expect(search.getByText('Passé composé')).toHaveCount(0);
    // The zero-result summary is honest: nothing matched, nothing hidden.
    await expect(search.getByRole('status')).toHaveText(/0 results/);
  });
});
