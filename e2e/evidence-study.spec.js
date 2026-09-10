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
  test.slow();
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
  // Honesty: status prints Not-enough-evidence/Provisional/Collecting.
  await expect(page.getByTestId('study-status')).toContainText(/Provisional|Not enough evidence|Collecting/);
  await expect(page.getByTestId('study-comparison')).toContainText(/needs at least/i);
  // Research diagnostics open behind progressive disclosure.
  const diagnostics = page.locator('details');
  await expect(diagnostics).toBeVisible();
  await diagnostics.locator('summary').click();
  await expect(page.getByText(/Protocol version:/i)).toBeVisible();
  await expect(page.getByText(/Exclusions by reason:/i)).toBeVisible();
  await expect(page.getByText(/Rejected imports:/i)).toBeVisible();
});

test('held-out check rides the session on a check day and scores measurement-only', async ({ page }) => {
  test.slow();
  await boot(page);
  // participant 'participant-e2e-check' is scheduled for a check on study
  // day 3 (isCheckDay is deterministic); day 3 → ordinal 0 → vocabulary.
  await page.evaluate(() => {
    localStorage.setItem('fp.study.state.v1', JSON.stringify({
      schemaVersion: 1,
      engineVersion: 1,
      protocolVersion: 1,
      participantId: 'participant-e2e-check',
      arm: 'adaptive',
      armSource: 'sync-id-hash',
      enrolledAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      startLevel: 'B1',
      startTheta: null,
      weeks: 8,
      status: 'active',
    }));
    localStorage.setItem('fp.study.consent.v1', JSON.stringify({ decision: 'accepted', at: new Date().toISOString(), version: 1 }));
  });
  await page.getByRole('button', { name: 'Speak today' }).click();
  const overlay = page.locator('[aria-label="Today\'s French"]');
  await expect(overlay).toBeVisible({ timeout: 20_000 });
  // Walk to the check: complete the speak segment with a mock turn, then
  // skip any middle segments until the scheduled check appears.
  const input = page.getByRole('textbox', { name: /Typed reply/i });
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill('Bonjour, je voudrais un café.');
  await input.press('Enter');
  await page.getByRole('button', { name: /End Session/i }).first().click();
  const checkPrompt = page.getByText(/check 1\/\d/i);
  for (let i = 0; i < 8 && !(await checkPrompt.isVisible().catch(() => false)); i++) {
    const skip = page.getByRole('button', { name: /^Skip/i });
    if (!(await skip.isVisible({ timeout: 2500 }).catch(() => false))) break;
    await skip.click();
    await page.waitForTimeout(250);
  }
  // Day 3 is a scheduled check day, so the check MUST have arrived.
  await expect(checkPrompt).toBeVisible({ timeout: 20_000 });
  // Answer EVERY item until the check finishes (vocabulary MCQ items).
  for (let guard = 0; guard < 12; guard++) {
    const finishBtn = page.getByRole('button', { name: /^Finish check$/i });
    const nextBtn = page.getByRole('button', { name: /^Next$/i });
    const group = page.getByRole('group', { name: /Choose the matching French word/i });
    if (await finishBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await finishBtn.click();
      break;
    }
    if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await nextBtn.click();
      continue;
    }
    if (await group.isVisible({ timeout: 500 }).catch(() => false)) {
      await group.locator('button').first().click();
      continue;
    }
    break; // check already completed
  }
  // The session completed → dismiss the takeaway screen.
  const completeScreen = page.getByRole('dialog', { name: "Today's French complete" });
  await expect(completeScreen).toBeVisible({ timeout: 10_000 });
  await completeScreen.getByRole('button', { name: /^Close$/i }).click();
  // Study store: one check, results recorded, frozen payloads, explicit
  // correct options, no feedback contamination of the mistake graph.
  const stored = await page.evaluate(() => {
    const checks = JSON.parse(localStorage.getItem('fp.study.checks.v1') || '[]');
    const graph = JSON.parse(localStorage.getItem('fp.mistakeGraph.v1') || '[]');
    const outcomes = JSON.parse(localStorage.getItem('fp.study.outcomes.v1') || '[]');
    return { checks, graph, outcomes };
  });
  expect(stored.checks).toHaveLength(1);
  const chk = stored.checks[0];
  expect(chk.results, 'check reached the end and recorded results').not.toBeNull();
  expect(chk.skills).toContain('vocabulary');
  expect(chk.items.length).toBeGreaterThan(0);
  // Every MCQ payload carries an explicit correctOptionId (never inferred).
  for (const item of chk.items) {
    expect(item.sourceItemId).toMatch(/^chk-/);
    expect(item.correctOptionId).toBeTruthy();
    expect(item.options.some((o) => o.id === item.correctOptionId)).toBe(true);
    expect(item.skill).toBe('vocabulary');
  }
  // Measurement-only: nothing entered the mistake graph.
  expect(stored.graph).toHaveLength(0);
  // Same-day reopen must NOT create a second check (dedupe by id).
  await page.getByRole('button', { name: 'Speak today' }).click();
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: "End today's session" }).click().catch(() => {});
  const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.study.checks.v1') || '[]'));
  expect(reopened).toHaveLength(1);
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
