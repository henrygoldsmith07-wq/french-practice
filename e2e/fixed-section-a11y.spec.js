import { test, expect } from '@playwright/test';

// Accessibility of the "Fixed & proven" Analytics section.
//
// The section shows each demonstrated weakness as a completed journey. It must
// expose real list semantics (an ordered list of steps, not a pile of divs),
// hide the decorative checkmark from assistive tech, and never render for a
// learner with nothing fixed. These are asserted through ROLES and structure —
// what a screen reader actually consumes — not visual classes.

// A cycle the evidence model judges DEMONSTRATED: an independent held-out
// transfer AND an independent delayed retest past the 20h floor, with the
// provenance (sourceReliability, markerConfidence) the real runner records so
// the events clear the independent-strength gate.
const DEMONSTRATED_CYCLE = {
  version: 1,
  updatedAt: new Date().toISOString(),
  cycles: [
    {
      id: 'cycle:grammar:passe-compose',
      target: { id: 'grammar:passe-compose', skill: 'grammar', key: 'passe-compose', label: 'the passé composé' },
      startedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      baseline: [{ phase: 'baseline', at: new Date(Date.now() - 30 * 86400000).toISOString(), correct: false, score: 30, encounterId: 'b1', skill: 'grammar', targetKey: 'passe-compose' }],
      interventions: [{ phase: 'intervention', at: new Date(Date.now() - 25 * 86400000).toISOString(), correct: true, independent: true, encounterId: 'i1', score: 90, sourceReliability: 'high', markerConfidence: 0.9, skill: 'grammar', targetKey: 'passe-compose' }],
      transfers: [{ phase: 'transfer', at: new Date(Date.now() - 10 * 86400000).toISOString(), correct: true, independent: true, heldOut: true, encounterId: 't1', score: 95, sourceReliability: 'high', markerConfidence: 0.9, skill: 'grammar', targetKey: 'passe-compose' }],
      delayed: [{ phase: 'delayed', at: new Date(Date.now() - 2 * 86400000).toISOString(), correct: true, independent: true, heldOut: true, encounterId: 'd1', score: 92, delayHours: 192, sourceReliability: 'high', markerConfidence: 0.9, skill: 'grammar', targetKey: 'passe-compose' }],
      recurrences: [],
    },
  ],
};

async function boot(page, { seed } = {}) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate((cycleJson) => {
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1, devPanel: true }));
    localStorage.setItem('fp.onboarded', '1');
    if (cycleJson) localStorage.setItem('fp.learningEvidence.v1', cycleJson);
  }, seed ? JSON.stringify(seed) : null);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

async function openAnalytics(page) {
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByTestId('progress-section-analytics').click();
  await expect(page.getByRole('dialog', { name: 'Analytics' })).toBeVisible({ timeout: 15_000 });
}

test('the Fixed section renders a demonstrated weakness as an ordered list of steps', async ({ page }) => {
  await boot(page, { seed: DEMONSTRATED_CYCLE });
  await openAnalytics(page);

  const section = page.getByRole('heading', { name: /Fixed & proven/i });
  await expect(section).toBeVisible({ timeout: 15_000 });

  // The journey is a real ordered list, so assistive tech announces it as a
  // sequence with a position — not three loose divs.
  const list = page.locator('ol', { has: page.getByText(/First flagged as a gap/i) }).first();
  await expect(list).toBeVisible();
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText(/First flagged as a gap/i);
  await expect(items.nth(1)).toContainText(/new situation/i);
  await expect(items.nth(2)).toContainText(/after a delay/i);

  // The decorative checkmark is hidden from the accessibility tree, so a screen
  // reader hears the step text, not a bare "✓".
  const firstCheck = items.nth(0).locator('[aria-hidden="true"]').first();
  await expect(firstCheck).toHaveCount(1);
});

test('no Fixed section for a learner with nothing demonstrated', async ({ page }) => {
  await boot(page); // no learning-evidence seed
  await openAnalytics(page);
  await expect(page.getByRole('dialog', { name: 'Analytics' })).toBeVisible({ timeout: 15_000 });
  // Nothing fixed → the section must not appear at all (no empty "Fixed & proven").
  await expect(page.getByRole('heading', { name: /Fixed & proven/i })).toHaveCount(0);
});
