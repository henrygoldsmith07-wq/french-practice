import { test, expect } from '@playwright/test';

// Beta-language honesty journeys — the E2E counterpart to the capability
// matrix. Source-level gating tests pin the code shape; THESE tests drive the
// real product through a full German journey (onboarding → Today → Learn →
// Skills → Search → deep navigation → a live German demo activity), repeat the
// key checks in Spanish, and return to French to verify nothing was lost.
//
// The invariant under test: French-authored learning surfaces — grammar
// topics, the reading library, listening tracks, culture, exam boards, the
// learning path, French-branded copy — are unreachable for a Beta language
// through ANY user path, while the core loop (Today, conversation, vocab,
// dictée, tutor) stays fully usable.

const FRENCH_ONLY_COPY = [
  // Home dashboard cards / session headers that used to hardcode "French".
  /Make today’s French stick/i,
  /Today's French/i,
  /Aujourd'hui/,
  // Learn hub sections gated to French.
  /60 CEFR topics/i,
  /WJEC|AQA · Edexcel|Exam simulator/i,
  // Skills areas gated to French.
  /Conjugation trainer/i,
  /Accent trainer/i,
];

async function freshLearner(page) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

async function completeOnboardingAs(page, languageCardName, expectedBetaName) {
  // Onboarding auto-opens for a brand-new learner (no key/XP/sessions).
  const dialog = page.getByRole('dialog', { name: 'Getting started' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // Step 1 — language: pick the Beta language.
  await dialog.getByRole('button', { name: languageCardName }).click();
  await dialog.getByRole('button', { name: /Continue/ }).click();

  // Step 2 — level (B1 preselected): the placement promise must be gone.
  await expect(dialog.getByText(/take a placement test later/i)).toHaveCount(0);
  await dialog.getByRole('button', { name: /Continue/ }).click();

  // Step 3 — goal: French-authored goals (exam prep, culture) must not be
  // offered to a Beta language.
  await expect(dialog.getByRole('button', { name: /School & exams/i })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Culture & fun/i })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Skip goal for now/i }).click();
  await dialog.getByRole('button', { name: /Continue/ }).click();

  // Step 4 — the Beta note must tell the truth about what's ready.
  const note = dialog.getByTestId('beta-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText(`${expectedBetaName} · Beta`);
  await dialog.getByRole('button', { name: /Start a 5-minute conversation/ }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function assertNoFrenchSurfaces(page) {
  const body = page.locator('body');
  for (const pattern of FRENCH_ONLY_COPY) {
    await expect(body.getByText(pattern)).toHaveCount(0);
  }
}

async function openTab(page, name) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click();
}

test.describe('German Beta journey', () => {
  test('onboarding → Today → Learn → Skills → Search stay German and French-free', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/, 'German');

    // The studio chrome follows the language.
    await expect(page.getByText('Das Studio').first()).toBeVisible({ timeout: 10_000 });

    // Today — the session header carries the ACTIVE language name, never
    // hardcoded French.
    await openTab(page, 'Today');
    await page.getByRole('button', { name: /Speak today/ }).click();
    const todayDialog = page.getByRole('dialog', { name: /Today's German/ });
    await expect(todayDialog).toBeVisible({ timeout: 15_000 });
    // The plan built for German: no French-authored segment may appear.
    await assertNoFrenchSurfaces(page);
    await page.keyboard.press('Escape');
    await expect(todayDialog).toBeHidden();

    // Learn hub — core sections visible, French-only sections gone.
    await openTab(page, 'Learn');
    await expect(page.getByRole('button', { name: /Skills/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /AI tutor/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Field Notes/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Real-world/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reference/ })).toBeVisible();
    await expect(page.getByText('60 CEFR topics')).toHaveCount(0);
    await expect(page.getByText(/Exam simulator/i)).toHaveCount(0);
    await assertNoFrenchSurfaces(page);

    // Skills — Reading library gated away, the rest stays.
    await page.getByRole('button', { name: /^Skills/ }).first().click();
    await expect(page.getByText(/Pronunciation, shadowing/)).toBeVisible();
    await expect(page.getByText('Stories, articles, classics, tap-to-translate')).toHaveCount(0);
    await expect(page.getByText(/Typing, translation/)).toBeVisible();

    // Writing — French-authored trainers gated, typing practice stays.
    await page.getByRole('button', { name: /Typing, translation/ }).click();
    await expect(page.getByText(/Conjugation trainer/i)).toHaveCount(0);
    await expect(page.getByText(/Accent trainer/i)).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Search — French corpora unreachable, German vocabulary reachable.
    await page.getByRole('button', { name: 'Search the studio' }).click();
    const search = page.getByRole('dialog', { name: 'Search' });
    const input = search.getByRole('textbox', { name: 'Search the whole studio' });
    await input.fill('Lyon'); // a French graded reader title
    await expect(search.getByText('Un week-end à Lyon')).toHaveCount(0);
    await input.fill('subjonctif'); // a French grammar topic
    await expect(search.getByText(/taming the subjonctif/i)).toHaveCount(0);
    await input.fill('Kaffee'); // German vocabulary
    await expect(search.getByText('der Kaffee').first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    // Deep navigation attempt: Progress renders (never a French screen).
    await openTab(page, 'Progress');
    await expect(page.locator('body')).not.toContainText('60 CEFR topics');
  });

  test('a German demo activity answers in German', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/, 'German');
    // Onboarding hands the learner to the speak tab in demo mode.
    const input = page.getByRole('textbox', { name: /Typed reply/i });
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('Hallo, ich hätte gern einen Kaffee, bitte.');
    await input.press('Enter');
    // The mock partner speaks the learner's language (never French).
    await expect(page.getByText(/Sehr gute Wahl/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Très bon choix/i)).toHaveCount(0);
  });

  test('replaying onboarding shows the honest German note', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/, 'German');
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: /Settings/i });
    await settings.getByRole('button', { name: /Replay onboarding/i }).click();
    const dialog = page.getByRole('dialog', { name: 'Getting started' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Continue/ }).click();
    await dialog.getByRole('button', { name: /Continue/ }).click();
    await dialog.getByRole('button', { name: /Skip goal for now/i }).click();
    await dialog.getByRole('button', { name: /Continue/ }).click();
    await expect(dialog.getByTestId('beta-note')).toContainText('German · Beta');
    // Escape closes the actual open overlay (onboarding is topmost now).
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('Spanish Beta journey', () => {
  test('switching to Spanish keeps every French surface out', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/, 'German');

    // German → Spanish via Settings.
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: /Settings/i });
    await settings.getByRole('radio', { name: /Español/ }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText('El Estudio').first()).toBeVisible({ timeout: 10_000 });
    await assertNoFrenchSurfaces(page);

    // Today speaks Spanish now.
    await openTab(page, 'Today');
    await page.getByRole('button', { name: /Speak today/ }).click();
    await expect(page.getByRole('dialog', { name: /Today's Spanish/ })).toBeVisible({ timeout: 15_000 });
    await assertNoFrenchSurfaces(page);
    await page.keyboard.press('Escape');

    // Learn/Skills gates hold for Spanish too.
    await openTab(page, 'Learn');
    await expect(page.getByText('60 CEFR topics')).toHaveCount(0);
    await expect(page.getByText(/Exam simulator/i)).toHaveCount(0);
    await page.getByRole('button', { name: /^Skills/ }).first().click();
    await expect(page.getByText('Stories, articles, classics, tap-to-translate')).toHaveCount(0);

    // The Spanish demo conversation answers in Spanish.
    await openTab(page, 'Speak');
    const input = page.getByRole('textbox', { name: /Typed reply/i });
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('Buenos días, quiero un café con leche, por favor.');
    await input.press('Enter');
    await expect(page.getByText(/Muy buena elección/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('French full-feature return', () => {
  test('switching back to French restores every French-only surface', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/, 'German');

    // German → French via Settings.
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: /Settings/i });
    await settings.getByRole('radio', { name: /Français/ }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText('Le Studio').first()).toBeVisible({ timeout: 10_000 });

    // Learn hub: grammar, culture and exam sections are back.
    await openTab(page, 'Learn');
    await expect(page.getByText('60 CEFR topics')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Exam simulator/i).first()).toBeVisible();

    // Skills: the Reading library returns.
    await page.getByRole('button', { name: /^Skills/ }).first().click();
    await expect(page.getByText('Stories, articles, classics, tap-to-translate')).toBeVisible();

    // Search: the French corpora are reachable again.
    await page.getByRole('button', { name: 'Search the studio' }).click();
    const search = page.getByRole('dialog', { name: 'Search' });
    await search.getByRole('textbox', { name: 'Search the whole studio' }).fill('Lyon');
    await expect(search.getByText('Un week-end à Lyon').first()).toBeVisible({ timeout: 10_000 });

    // Today carries the French brand again.
    await page.keyboard.press('Escape');
    await openTab(page, 'Today');
    await page.getByRole('button', { name: /Speak today/ }).click();
    await expect(page.getByRole('dialog', { name: /Today's French/ })).toBeVisible({ timeout: 15_000 });
  });
});
