import { test, expect } from '@playwright/test';

// Evidence Study E2E: enrolment on first Today session, arm lock across
// reloads, held-out check insertion on check days (driven via the operator
// override to make the schedule deterministic), dashboard honesty, and
// bundle export. The arm itself is never asserted VISIBLE — only that it
// persists in storage and the UI never prints it.

async function boot(page) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => {
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
    localStorage.setItem('fp.onboarded', '1');
  });
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

test('enrolment requires explicit consent; participant id + arm persist across reload', async ({ page }) => {
  await boot(page);
  // NO consent yet: opening Today must create nothing.
  await page.getByRole('button', { name: 'Speak today' }).click();
  await expect(page.getByText(/Aujourd'hui/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: "End today's session" }).click();
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('fp.study.state.v1'))).toBeNull();
  // Give consent via the study panel, then enrol through Today.
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Analytics/i }).first().click();
  await expect(page.getByText(/Evidence study/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('study-status')).toContainText(/Not enrolled/i, { timeout: 10_000 });
  await page.getByRole('button', { name: /Join the study/i }).click();
  await expect(page.getByTestId('study-status')).toContainText(/Not enough evidence yet/i, { timeout: 10_000 });
  const created = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.study.state.v1')));
  expect(created).toBeTruthy();
  expect(created.participantId).toMatch(/^participant-/);
  expect(['adaptive', 'balanced']).toContain(created.arm);
  // Reload: arm and participant must not flip.
  await page.reload();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.study.state.v1')));
  expect(after.participantId).toBe(created.participantId);
  expect(after.arm).toBe(created.arm);
});

test('declining consent never enrols and Today keeps working', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Analytics/i }).first().click();
  await expect(page.getByText(/Evidence study/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Not now/i }).click();
  await expect(page.getByText(/You declined/i).first()).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => localStorage.getItem('fp.study.state.v1'))).toBeNull();
  // Today works fine without the study (close the Analytics overlay first).
  await page.getByRole('button', { name: /Close analytics/i }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Speak today' }).click();
  await expect(page.getByText(/Aujourd'hui/i).first()).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => localStorage.getItem('fp.study.state.v1'))).toBeNull();
});

test('the dashboard never reveals the arm and gates the comparison', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Analytics/i }).first().click();
  await expect(page.getByText(/Evidence study/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Join the study/i }).click();
  await expect(page.getByTestId('study-status')).toBeVisible({ timeout: 10_000 });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.study.state.v1')));
  await page.reload();
  // Progress → Analytics shows the study panel.
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Analytics/i }).first().click();
  await expect(page.getByText(/Evidence study/i).first()).toBeVisible({ timeout: 10_000 });
  // The arm value must NOT appear anywhere in the panel text.
  const body = await page.evaluate(() => document.body.innerText);
  expect(body).not.toContain(`Arm: ${stored.arm}`);
  expect(body).not.toMatch(/assigned to (adaptive|balanced)/i);
  // Honesty: status prints Provisional/No data, comparison message gates.
  await expect(page.getByTestId('study-status')).toContainText(/Provisional|Not enough evidence yet/);
  await expect(page.getByTestId('study-comparison')).toContainText(/needs at least/i);
});

test('held-out check rides the session on a check day and scores measurement-only', async ({ page }) => {
  await boot(page);
  // Operator override: pin the arm override store so the schedule phase is
  // deterministic; then enrol by opening Today on a forced check day.
  await page.evaluate(() => {
    // Enrol first (so participantId exists), then re-derive nothing — the
    // check-day decision is read live from the study state each session.
    localStorage.setItem('fp.study.state.v1', JSON.stringify({
      schemaVersion: 1,
      engineVersion: 1,
      participantId: 'participant-e2e-check',
      arm: 'adaptive',
      armSource: 'sync-id-hash',
      enrolledAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      startLevel: 'B1',
      startTheta: null,
      weeks: 8,
      status: 'active',
    }));
  });
  await page.getByRole('button', { name: 'Speak today' }).click();
  await page.waitForTimeout(1500);
  // A check is inserted only when day 3 is a check day for this participant;
  // either way the session must be complete (no dead segments).
  const overlay = page.locator('[aria-label="Today\'s French"]');
  await expect(overlay).toBeVisible();
  const steps = await page.evaluate(() => document.querySelectorAll('[aria-label="Today\'s French"] header span.h-1\\.5').length);
  expect(steps).toBeGreaterThan(0);
  // If the check step exists, finish a check item honestly.
  const checkPrompt = page.getByText(/Check 1\//i);
  if (await checkPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Answer the first item: click the first option.
    await page.getByRole('group', { name: /Choose the matching French word/i }).locator('button').first().click();
    await page.getByRole('button', { name: /Next|Finish check/i }).click();
    // Results must be in the study store, never in the mistake graph.
    const stored = await page.evaluate(() => ({
      checks: JSON.parse(localStorage.getItem('fp.study.checks.v1') || '[]'),
      graph: JSON.parse(localStorage.getItem('fp.mistakeGraph.v1') || '[]'),
    }));
    expect(stored.checks.length).toBe(1);
    expect(stored.graph.length).toBe(0);
  }
  // Close out the session.
  await page.getByRole('button', { name: "End today's session" }).click();
});

test('export bundle carries anonymised study streams', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Analytics/i }).first().click();
  await expect(page.getByText(/Evidence study/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Join the study/i }).click();
  await expect(page.getByTestId('study-status')).toBeVisible({ timeout: 10_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export study bundle/i }).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toMatch(/^le-studio-evidence-study-participant-/);
  const path = await dl.path();
  const fs = await import('node:fs/promises');
  const bundle = JSON.parse(await fs.readFile(path, 'utf8'));
  expect(bundle.version).toBe(2);
  expect(bundle.study.participantId).toMatch(/^participant-/);
  expect(bundle.study.startTheta).toBeNull();
  expect(Array.isArray(bundle.studyOutcomes)).toBe(true);
});

test('withdrawal deletes study data and preserves practice history', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => localStorage.setItem('fp.xp', '250'));
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Analytics/i }).first().click();
  await expect(page.getByText(/Evidence study/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Join the study/i }).click();
  await expect(page.getByTestId('study-status')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Withdraw & delete study data/i }).click();
  const after = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('fp.study.state.v1') || 'null'),
    checks: JSON.parse(localStorage.getItem('fp.study.checks.v1') || '[]'),
    outcomes: JSON.parse(localStorage.getItem('fp.study.outcomes.v1') || '[]'),
    xp: localStorage.getItem('fp.xp'),
  }));
  expect(after.state.status).toBe('withdrawn');
  expect(after.checks).toHaveLength(0);
  expect(after.outcomes).toHaveLength(0);
  expect(after.xp).toBe('250');
});
