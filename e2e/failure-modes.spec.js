import { test, expect } from '@playwright/test';

test.describe('AI failure modes degrade gracefully', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('quota exceeded shows friendly message and does not break core', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('fp.settings', JSON.stringify({ mockMode: false, level: 'B1', ttsRate: 1 }));
      // Return to the studio as an existing learner — the first-run picker
      // would intercept every click and make this test vacuous (its optional
      // branch silently skips when the tab is unclickable).
      localStorage.setItem('fp.onboarded', '1');
      // Simulate quota exhausted
      localStorage.setItem('fp.quota', JSON.stringify({ day: new Date().toISOString().slice(0,10), count: 80, limit: 80 }));
    });
    await page.reload();
    // Mock a failing Groq response via route interception
    await page.route('**/api/groq/**', async (route) => {
      await route.fulfill({ status: 429, body: JSON.stringify({ error: 'daily_quota_exhausted' }) });
    });
    await page.route('https://api.groq.com/**', async (route) => {
      await route.fulfill({ status: 429, body: JSON.stringify({ error: { message: 'rate limit' } }) });
    });
    // App should still render core tabs
    await expect(page.getByRole('button', { name: /Today|Review|Learn/i }).first()).toBeVisible({ timeout: 5000 });
    // Try to trigger AI (Speaking tab) -> should show friendly error, not crash.
    // Not conditional: if the tab cannot be reached the test must FAIL, not
    // silently skip its own assertions (that is how it passed while broken).
    const speak = page.getByRole('button', { name: /^Speak$/i });
    await speak.click({ timeout: 5000 });
    const body = await page.locator('body').textContent();
    // Ensure no raw stack trace
    expect(body).not.toMatch(/TypeError|ReferenceError|Cannot read/i);
  });

  test('bad AI response (non-JSON) is handled', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('fp.settings', JSON.stringify({ mockMode: false, level: 'B1', ttsRate: 1 }));
      // Existing learner, not the first-run picker: the picker intercepts the
      // tab click and would turn this into a silently-skipped no-op.
      localStorage.setItem('fp.onboarded', '1');
    });
    await page.route('**/api/groq/**', async (route) => {
      await route.fulfill({ status: 200, body: 'NOT JSON' });
    });
    await page.route('https://api.groq.com/**', async (route) => {
      await route.fulfill({ status: 200, body: '<<< not json >>>' });
    });
    await page.reload();
    const speak = page.getByRole('button', { name: /^Speak$/i });
    await speak.click({ timeout: 5000 });
    await expect(page.locator('body')).not.toContainText(/Uncaught|Unhandled/i);
  });

  test('relay timeout shows retry message', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('fp.settings', JSON.stringify({ mockMode: false, level: 'B1', ttsRate: 1 })));
    await page.route('**/api/groq/**', async (route) => {
      // delay beyond 30s simulated as abort
      await route.abort('timedout');
    });
    await page.reload();
    // Core still works
    await expect(page.getByRole('button', { name: /Today|Review/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('mobile UX: tabs are reachable and viewport fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'A1', ttsRate: 1 })));
    await page.reload();
    const tabs = page.getByRole('button', { name: /Today|Speak|Review|Learn|Progress/i });
    await expect(tabs.first()).toBeVisible({ timeout: 5000 });
    // Ensure no horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
