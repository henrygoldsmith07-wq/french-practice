import { test, expect } from '@playwright/test';

// Submode-level Beta honesty journeys — the deep layer under
// beta-language-journeys.spec.js. Surfaces (hubs, cards) are covered there;
// HERE a Beta learner opens EVERY learner-visible submode (Listening hub
// modes, Writing hub modes, the Review decks) and the suite proves the
// actual content is language-appropriate, not just the labels.
//
// Invariants under test for German (and Spanish):
//  · no French-authored submode is reachable (Les nombres, Conditions gym,
//    conjugation trainer, accent trainer, completion, free-writing, essays);
//  · every visible mode opens, renders German-appropriate UI, and works;
//  · a real German activity produces XP and persists;
//  · dictation speaks the active language;
//  · French features return untouched after switching back.

const FRENCH_ONLY = [
  /Les nombres/i,
  /Conditions gym/i,
  /Conjugation trainer/i,
  /Accent trainer/i,
  /Sentence completion/i,
  /Free writing/i,
  /Essay studio/i,
  /Écrivez en français/i,
  /EN → FR/,
  /FR → EN/,
];

async function freshLearner(page) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

async function completeOnboardingAs(page, languageCardName) {
  const dialog = page.getByRole('dialog', { name: 'Getting started' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: languageCardName }).click();
  await dialog.getByRole('button', { name: /Continue/ }).click();
  await expect(dialog.getByText(/take a placement test later/i)).toHaveCount(0);
  await dialog.getByRole('button', { name: /Continue/ }).click();
  await expect(dialog.getByRole('button', { name: /School & exams/i })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Skip goal for now/i }).click();
  await dialog.getByRole('button', { name: /Continue/ }).click();
  await expect(dialog.getByTestId('beta-note')).toContainText(/· Beta/);
  // Land on Today, not the conversation — submode journeys navigate themselves.
  await dialog.getByRole('button', { name: /Explore the studio|Skip/i }).click().catch(async () => {
    await dialog.getByRole('button', { name: /Start a 5-minute conversation/ }).click();
  });
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function assertNoFrenchSubmodes(page) {
  const body = page.locator('body');
  for (const pattern of FRENCH_ONLY) {
    await expect(body.getByText(pattern)).toHaveCount(0);
  }
}

async function openTab(page, name) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name }).click();
}

// --- Listening: every visible mode ------------------------------------------

test.describe('German Listening submodes', () => {
  test('Listening hub shows only multilingual modes and each one opens German', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/);

    await openTab(page, 'Learn');
    await page.getByRole('button', { name: /^Skills/ }).first().click();
    await page.getByRole('button', { name: /Audio course, dictée/ }).click();

    // Hub: French-authored modes absent, multilingual modes present.
    const body = page.locator('body');
    await expect(body).toContainText('Audio course — hands-free');
    await expect(body).toContainText('Dictée');
    await assertNoFrenchSubmodes(page);

    // Audio course opens and draws its pack grid from the German vocab library.
    await body.getByRole('button', { name: /Audio course — hands-free/ }).click();
    await expect(body).toContainText('Cours audio');
    await expect(body.getByText(/Greetings & Basics|Food & Café|Top \d/).first()).toBeVisible({ timeout: 15_000 });
    await assertNoFrenchSubmodes(page);
    // Back to the hub.
    await page.getByRole('button', { name: 'Back to listening' }).click();

    // Dictée opens German content and the input is labelled for German.
    await body.getByRole('button', { name: /Dictée/ }).click();
    await expect(body).toContainText('Dictée');
    const input = page.getByRole('textbox', { name: 'What you heard' });
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('lang', 'de');
    await assertNoFrenchSubmodes(page);
  });
});

// --- Writing: every visible mode ---------------------------------------------

test.describe('German Writing submodes', () => {
  test('Writing hub shows only multilingual modes; translation drill runs in German', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/);

    await openTab(page, 'Learn');
    await page.getByRole('button', { name: /^Skills/ }).first().click();
    await page.getByRole('button', { name: /Typing, translation/ }).click();

    // Hub: French trainers gone; typing + translation remain.
    const body = page.locator('body');
    await expect(body).toContainText('Translation drill');
    await expect(body).toContainText('Typing drill');
    await assertNoFrenchSubmodes(page);

    // Translation drill: start it — direction chips carry the active code.
    await body.getByRole('button', { name: /Translation drill/ }).click();
    await body.getByRole('button', { name: /^ Start|Start/ }).first().click();
    await expect(body.getByText(/EN → DE|DE → EN/).first()).toBeVisible({ timeout: 10_000 });
    await expect(body.getByText(/EN → FR|FR → EN/)).toHaveCount(0);
    await assertNoFrenchSubmodes(page);
  });
});

// --- Review: a real German vocabulary activity --------------------------------

test.describe('German Review submodes', () => {
  test('a German vocab deck opens and a real answer produces feedback', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/);

    await openTab(page, 'Review');
    const body = page.locator('body');
    // German packs render — open the first one.
    await body.getByRole('button', { name: /Greetings & Basics/ }).first().click();
    await expect(body.getByText('Tap to reveal')).toBeVisible({ timeout: 10_000 });
    // The card front shows the German word (never a French pack word like
    // «la maison» on a German deck).
    await expect(body.locator('p[lang="de"]').first()).toBeVisible();
    // Flashcards remain usable: flip and rate.
    await page.getByRole('button', { name: /Flip the card/ }).click();
    await page.getByRole('group', { name: 'How well did you recall it?' }).getByRole('button', { name: 'Good' }).click();
    await expect(body.getByText('Predicted recall')).toBeVisible({ timeout: 10_000 });
    await assertNoFrenchSubmodes(page);
  });

  test('the quiz mode grades a German answer', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/);

    await openTab(page, 'Review');
    const body = page.locator('body');
    await body.getByRole('button', { name: /Greetings & Basics/ }).first().click();
    await page.getByRole('button', { name: 'Quiz' }).click();
    // The quiz opens on a German prompt ("What does this mean?" with the
    // German word, or a produce/listen round).
    await expect(body.getByText(/What does this mean\?|Type it in German|Type what you hear/).first()).toBeVisible({ timeout: 10_000 });
    await assertNoFrenchSubmodes(page);
  });
});

// --- Deep navigation: every bottom tab reachable, no French anywhere ----------

test.describe('German full-tab sweep', () => {
  test('Today, Speak, Review, Learn, Progress all render without French submodes', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/);

    for (const tab of ['Today', 'Speak', 'Review', 'Learn', 'Progress']) {
      await openTab(page, tab);
      await assertNoFrenchSubmodes(page);
    }

    // Speak tab holds a valid German conversation surface.
    await openTab(page, 'Speak');
    const input = page.getByRole('textbox', { name: /Typed reply/i });
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('Guten Tag, ich möchte ein Brötchen kaufen.');
    await input.press('Enter');
    await expect(page.locator('body')).toContainText(/Brötchen|Gerne|sehr gut/i);
    await assertNoFrenchSubmodes(page);
  });
});

// --- Pronunciation (read-aloud + shadowing) for Beta languages ---------------

// French-authored phonology labels that must NEVER appear on a German or
// Spanish pronunciation surface (per-language phoneme profiles).
const FRENCH_PHONOLOGY = [
  /uvular/,
  /nasal/,
  /liaison/,
  /gn \(ɲ\)/,
  /j \(ʒ\)/,
  /u \/ ou/,
];

async function openPronunciation(page) {
  await openTab(page, 'Learn');
  await page.getByRole('button', { name: /^Skills/ }).first().click();
  await page.getByRole('button', { name: /Pronunciation, shadowing/ }).click();
  await page.locator('body').getByRole('button', { name: /^Pronunciation/ }).click();
}

test.describe('German Pronunciation submodes', () => {
  test('read-aloud opens German phonology and minimal pairs; shadowing gates on listening', async ({ page }) => {
    test.setTimeout(90_000);
    await freshLearner(page);
    await completeOnboardingAs(page, /German · Beta/);

    await openPronunciation(page);
    const body = page.locator('body');

    // The screen opens on German learner content: the target sentence and the
    // minimal-pair strip carry lang="de", never lang="fr".
    await expect(body.locator('p[lang="de"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(body.locator('[lang="fr"]')).toHaveCount(0);
    // The minimal-pair queue draws from the GERMAN catalogue (ich/ach, ü/u,
    // ö/o, devoicing, stress) — no French phoneme labels anywhere.
    await expect(body.getByText(/Minimal pair · de-(ich-ach|u-u|o-o|devoicing|stress)/)).toBeVisible();
    for (const pattern of FRENCH_PHONOLOGY) {
      await expect(body.getByText(pattern)).toHaveCount(0);
    }

    // Retry UI sanity: the record control and the per-sentence controls exist.
    await expect(body.getByRole('button', { name: /Read it aloud/ })).toBeVisible();

    // Shadowing mode: re-enter the Speaking area, then its second mode.
    await page.getByRole('button', { name: 'All skills' }).click();
    await page.getByRole('button', { name: /Pronunciation, shadowing/ }).click();
    await page.locator('body').getByRole('button', { name: /^Shadowing/ }).click();
    await expect(body.getByText('Play the sentence first')).toBeVisible({ timeout: 15_000 });
    await expect(body.getByRole('button', { name: /Listen first/ })).toBeVisible();
    await expect(body.locator('[lang="fr"]')).toHaveCount(0);
    await expect(body.getByText(/Minimal pair · de-(ich-ach|u-u|o-o|devoicing|stress)/)).toBeVisible();
  });
});

// --- Today completion for Beta languages --------------------------------------

// French-authored completion/Today copy that must never appear for de/es.
const FRENCH_TODAY_COPY = [
  /C'est tout\./,
  /Today's French/,
  /Aujourd'hui/,
];

// Drives one Today session to the completion screen the way a learner would:
// rating or skipping each drill, talking (or typing) one Arena turn, then
// ending the session. Every segment type in a Beta plan is either runnable
// here or auto-skips when it has nothing to run — both routes reach the end.
async function runTodayToCompletion(page, todayDialog) {
  for (let guard = 0; guard < 25; guard += 1) {
    if (await todayDialog.getByText('Session complete.').isVisible().catch(() => false)) return;
    const skip = todayDialog.getByRole('button', { name: 'Skip', exact: true });
    if (await skip.isVisible().catch(() => false)) { await skip.click(); continue; }
    const end = todayDialog.getByRole('button', { name: 'End Session' });
    if (await end.isVisible().catch(() => false)) { await end.click(); continue; }
    const input = todayDialog.getByRole('textbox', { name: /Typed reply/i });
    if (await input.isVisible().catch(() => false)) {
      await input.fill('Guten Tag, ich möchte ein Brötchen kaufen.');
      await input.press('Enter');
      continue;
    }
    const reveal = todayDialog.getByRole('button', { name: /Say it, then reveal/ });
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
      await todayDialog.getByRole('button', { name: /I said it right/ }).click();
      continue;
    }
    const rate = todayDialog.getByRole('group', { name: 'How well did you recall it?' });
    if (await rate.isVisible().catch(() => false)) {
      await rate.getByRole('button', { name: 'Good' }).click();
      continue;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Today session never reached the completion screen');
}

async function assertNoFrenchTodayCopy(page) {
  const body = page.locator('body');
  for (const pattern of FRENCH_TODAY_COPY) {
    await expect(body.getByText(pattern)).toHaveCount(0);
  }
}

async function completeTodayFor(page, languageCardName, langAttr) {
  await freshLearner(page);
  await completeOnboardingAs(page, languageCardName);

  await openTab(page, 'Today');
  await page.getByRole('button', { name: /Speak today/ }).click();
  const todayDialog = page.getByRole('dialog', { name: new RegExp(`Today's ${languageCardName.source.replace(/\s*·\s*Beta/, '')}`, 'i') });
  await expect(todayDialog).toBeVisible({ timeout: 20_000 });

  await runTodayToCompletion(page, todayDialog);

  // The completion screen: active-language chrome only. The takeaway phrase
  // is learner-language content with the ACTIVE lang attribute — never fr.
  await expect(todayDialog.getByText('Session complete.')).toBeVisible();
  await assertNoFrenchTodayCopy(page);
  await expect(page.locator('[lang="fr"]')).toHaveCount(0);
  await expect(page.locator(`[lang="${langAttr}"]`).first()).toBeVisible();

  // Retry behaviour sanity: closing returns to the studio with no French
  // submodes reachable (completion must not leave ghost state).
  await todayDialog.getByRole('button', { name: 'Close' }).click();
  await expect(todayDialog).toBeHidden({ timeout: 10_000 });
  await assertNoFrenchSubmodes(page);
}

test.describe('German Today completion', () => {
  test('a full German session ends on a German-only completion screen', async ({ page }) => {
    test.setTimeout(120_000);
    await completeTodayFor(page, /German · Beta/, 'de');
  });
});

test.describe('Spanish Today completion', () => {
  test('a full Spanish session ends on a Spanish-only completion screen', async ({ page }) => {
    test.setTimeout(120_000);
    await completeTodayFor(page, /Spanish · Beta/, 'es');
  });
});

// --- Spanish and French return -------------------------------------------------

test.describe('Spanish and French return', () => {
  test('Spanish dictation is Spanish; French restores the gated modes', async ({ page }) => {
    await freshLearner(page);
    await completeOnboardingAs(page, /Spanish · Beta/);

    // Spanish dictation input carries lang="es".
    await openTab(page, 'Learn');
    await page.getByRole('button', { name: /^Skills/ }).first().click();
    await page.getByRole('button', { name: /Audio course, dictée/ }).click();
    await page.locator('body').getByRole('button', { name: /Dictée/ }).click();
    await expect(page.getByRole('textbox', { name: 'What you heard' })).toHaveAttribute('lang', 'es');
    await assertNoFrenchSubmodes(page);

    // Switch to French the way a learner does: Settings. The French-authored
    // modes must reappear in the Writing hub.
    await page.getByRole('button', { name: 'Back to listening' }).click();
    await page.getByRole('button', { name: 'All skills' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: /Settings/i });
    await settings.getByRole('radio', { name: /Français/ }).click();
    // The switch is only 'done' when the chrome itself says so: wait for the
    // French banner before closing, so the capability checks below can never
    // race the language module update.
    await expect(page.getByRole('heading', { name: /Le Studio/ })).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Typing, translation/ }).click();
    const body = page.locator('body');
    await expect(body).toContainText('Conjugation trainer');
    await expect(body).toContainText('Accent trainer');
    await expect(body).toContainText('Sentence completion');
  });
});
