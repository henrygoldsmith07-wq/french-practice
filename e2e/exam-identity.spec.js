import { test, expect } from '@playwright/test';

// The exam identity path, end to end: a learner picks a board (and tier/date)
// in the exam simulator, the choice lands in settings the moment it is made,
// and it survives a full reload — the simulator reopens on it and Today's
// brief names it.
//
// This is the journey the persisted-identity PRs built (settings.examBoard /
// examTier / examBoardName / examSpeakingWeight, written by ExamSetup and read
// by the planner and Today). Until now it only had unit coverage that seeds
// localStorage by hand; these tests make the REAL UI do the writing, then
// check what a returning learner actually sees.
//
// Selection is asserted through user-visible content, not class names: each
// board renders its own task list ("This paper" section), so a label unique to
// one board proves it is the selected one.

const dayIn = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function freshLearner(page) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => {
    localStorage.setItem('fp.onboarded', '1');
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: false, level: 'B1' }));
  });
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

async function openExamSetup(page) {
  await page.getByLabel('Main navigation').getByRole('button', { name: 'Learn' }).click();
  await page.getByRole('button', { name: /Exam simulator/ }).click();
  await expect(page.getByRole('heading', { name: 'Exam simulator' })).toBeVisible({ timeout: 15_000 });
}

async function readExamSettings(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('fp.settings') || '{}'));
}

test('a picked board survives reload and the simulator reopens on it', async ({ page }) => {
  await freshLearner(page);
  await openExamSetup(page);

  // The Made-for-Wales qualification is untiered, and "Presentation &
  // discussion" is a task only it defines — so its visibility is the proof of
  // selection.
  await page.getByRole('button', { name: /Made for Wales/ }).click();
  await expect(page.getByText('Presentation & discussion')).toBeVisible();

  // The identity lands in settings at pick time, including the derived name
  // and oracy weight Today reads so the board registry never enters its bundle.
  let exam = await readExamSettings(page);
  expect(exam.examBoard).toBe('wjec-gcse-3830');
  expect(exam.examBoardName).toBe('WJEC GCSE French (Made for Wales)');
  expect(exam.examSpeakingWeight).toBe(0.3);

  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await openExamSetup(page);
  await expect(page.getByText('Presentation & discussion')).toBeVisible({ timeout: 15_000 });

  exam = await readExamSettings(page);
  expect(exam.examBoard).toBe('wjec-gcse-3830');
});

test('the tier survives reload and Today names the exam with it', async ({ page }) => {
  await freshLearner(page);
  await openExamSetup(page);

  // The legacy 3800QS board is tiered; "Photo card" is a task only it defines.
  await page.getByRole('button', { name: /3800QS/ }).click();
  await expect(page.getByText('Photo card')).toBeVisible();
  await page.getByRole('button', { name: 'Foundation', exact: true }).click();

  // Today's brief names the exam from the persisted identity — tier first.
  await page.getByLabel('Main navigation').getByRole('button', { name: 'Today' }).click();
  await expect(page.getByText(/Foundation tier, WJEC GCSE French/)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Main navigation').getByRole('button', { name: 'Today' }).click();
  await expect(page.getByText(/Foundation tier, WJEC GCSE French/)).toBeVisible({ timeout: 15_000 });

  const exam = await readExamSettings(page);
  expect(exam.examBoard).toBe('wjec-gcse-3800');
  expect(exam.examTier).toBe('foundation');
  expect(exam.examBoardName).toBe('WJEC GCSE French');
});

test('the exam date survives reload and the countdown stays live', async ({ page }) => {
  await freshLearner(page);
  await openExamSetup(page);

  // A computed future date, not a constant: a hardcoded one becomes a past
  // date as real time moves, and a past date correctly yields no countdown.
  const date = dayIn(60);
  await page.getByLabel('Exam date').fill(date);
  await expect(page.getByText(/to go\./)).toBeVisible();

  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await openExamSetup(page);
  await expect(page.getByLabel('Exam date')).toHaveValue(date);
  await expect(page.getByText(/to go\./)).toBeVisible({ timeout: 15_000 });
});

test('Today shows how close the exam is, not just its name', async ({ page }) => {
  await freshLearner(page);
  await openExamSetup(page);

  // Board + a date 30 days out: the brief names the exam AND the countdown on
  // ONE line, so the context does not eat the card's three reason slots.
  await page.getByRole('button', { name: /3800QS/ }).click();
  await page.getByLabel('Exam date').fill(dayIn(30));

  await page.getByLabel('Main navigation').getByRole('button', { name: 'Today' }).click();
  await expect(page.getByText(/WJEC GCSE French · \d+ days to your exam/)).toBeVisible({ timeout: 15_000 });
});

test('an exam with no date shows the name but never a countdown', async ({ page }) => {
  await freshLearner(page);
  await openExamSetup(page);
  await page.getByRole('button', { name: /3800QS/ }).click();

  await page.getByLabel('Main navigation').getByRole('button', { name: 'Today' }).click();
  await expect(page.getByText(/WJEC GCSE French/)).toBeVisible({ timeout: 15_000 });
  // No date set: the brief must not invent urgency.
  await expect(page.getByText(/days to your exam|exam is (today|tomorrow)/)).toHaveCount(0);
});
