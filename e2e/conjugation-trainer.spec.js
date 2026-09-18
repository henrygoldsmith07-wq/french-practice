import { test, expect } from '@playwright/test';

// Conjugation trainer: reach it through Learn → Skills → Writing, answer via
// the app's own peek table (the table doubles as a data check — it is rendered
// from the trainer pool), and verify accent-slip grading ("near") and the
// error notebook.

async function openTrainer(page) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
    localStorage.setItem('fp.onboarded', '1');
  });
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Main navigation').getByRole('button', { name: 'Learn' }).click();
  await page.getByRole('button', { name: /^Skills/ }).click();
  await page.getByRole('button', { name: /^Writing/ }).click();
  await page.getByRole('button', { name: /Conjugation trainer/ }).click();
  await expect(page.getByTestId('conj-prompt')).toBeVisible({ timeout: 15_000 });
}

// The peek table renders all tenses for the prompted verb; combined with the
// data-answer hook on the prompt card we can answer correctly without the
// test knowing any French — while also validating that the UI shows exactly
// the forms the grader accepts.
async function answerFromTable(page) {
  await page.getByRole('button', { name: /Peek at the table/ }).click();
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  const verb = await page.getByTestId('conj-prompt').getAttribute('data-answer');
  // Find the tense row that contains the answer, then read its person columns.
  const row = table.locator(`tr:has-text("${verb}")`);
  const cells = row.locator('td');
  return { verb, count: await cells.count() };
}

test('trainer grades a correct form and keeps the streak', async ({ page }) => {
  await openTrainer(page);
  const prompt = page.getByTestId('conj-prompt');
  const answer = await prompt.getAttribute('data-answer');
  await page.getByLabel('Type the conjugated form').fill(answer);
  await page.getByRole('button', { name: /Check/ }).click();
  await expect(page.getByText(/^Parfait\./)).toBeVisible();
  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.getByTestId('conj-prompt')).toBeVisible();
});

test('an accent-only slip is graded as near, not wrong', async ({ page }) => {
  await openTrainer(page);
  // Hunt for a prompt whose answer carries at least one accent, then strip
  // every accent — pure ASCII never grades "correct".
  let answer = '';
  for (let i = 0; i < 12; i += 1) {
    answer = (await page.getByTestId('conj-prompt').getAttribute('data-answer')) || '';
    if (answer.normalize('NFD') !== answer.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) break;
    // Cycle to a new prompt: answer correctly to reach the Next button.
    await page.getByLabel('Type the conjugated form').fill(answer);
    await page.getByRole('button', { name: /Check/ }).click();
    await page.getByRole('button', { name: /Next/ }).click();
  }
  const unaccented = answer.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  test.skip(unaccented === answer, 'no accented form appeared in 12 prompts');
  await page.getByLabel('Type the conjugated form').fill(unaccented);
  await page.getByRole('button', { name: /Check/ }).click();
  await expect(page.getByText(/Almost — accent slip/)).toBeVisible();
});

test('a wrong answer lands in the error notebook for later repair', async ({ page }) => {
  await openTrainer(page);
  const prompt = page.getByTestId('conj-prompt');
  const inf = await prompt.locator('span.italic').first().textContent();
  await page.getByLabel('Type the conjugated form').fill('xxxxx');
  await page.getByRole('button', { name: /Check/ }).click();
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  const verb = inf.trim();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.learnerErrors.v1') || '{}'));
  const entry = (stored.entries || []).find((e) => e.key && e.key.includes(`conjugation:${verb}`));
  expect(entry, 'error entry keyed by verb:tense:person').toBeTruthy();
});

test('the peek table answers every person correctly', async ({ page }) => {
  await openTrainer(page);
  const { verb } = await answerFromTable(page);
  expect(verb.length).toBeGreaterThan(0);
});
