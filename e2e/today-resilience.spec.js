import { test, expect } from '@playwright/test';

// Today-loop resilience: capability fallback (no AI → authored drill instead
// of a dead segment), offline recovery and session persistence. These run on
// every browser project; the service-worker path registers explicitly because
// production-only registration keeps dev sessions uncached.

async function seedLocalStorage(page, seed) {
  // The very first goto can land while the dev server is still compiling.
  // localStorage is denied on any non-app document, so wait for the app to
  // have committed before touching storage.
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  // WebKit quirk: writes made in the same task as localStorage.clear() are
  // dropped, so the wipe and the seed must run in separate tasks. Seed
  // functions must NOT clear again — clear-then-write in one task is exactly
  // the dropped-write pattern.
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(seed);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  // Vite dev-server artifact (not an app race): the first import of a lazy
  // chunk can trigger dependency pre-optimisation, which full-reloads the
  // page — swallowing the overlay state a click sets immediately after.
  // Warm the Today chunk graph here, during seeding, so the click lands on
  // an already-optimised server and the overlay opens deterministically.
  await page.evaluate(() => import('/src/components/TodaySession.jsx').catch(() => {})).catch(() => {});
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

const MISTAKE_SEED = () => {
  localStorage.setItem('fp.settings', JSON.stringify({ mockMode: false, level: 'B1', ttsRate: 1 }));
  localStorage.setItem('fp.onboarded', '1');
  // A mistake-graph node makes the drill segment appear, and a matching
  // grammar-library topic gives the authored fallback something to run.
  localStorage.setItem('fp.mistakeGraph.v1', JSON.stringify([{
    id: 'mg-test1', type: 'tense', concept: 'passe-compose', source: 'conversation',
    attempt: 'Hier je vais', corrected: 'Hier je suis allé', confidence: 0.8,
    asrUncertain: false, related: [], createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(), lastRetestAt: null, recurrence: 2,
    retests: [], mastery: 10, status: 'active', schemaVersion: 1, engineVersion: 3,
  }]));
  localStorage.setItem('fp.errorNotebook', JSON.stringify([{
    id: 'nb-test1', original: 'Hier je vais au cinéma', corrected: 'Hier je suis allé au cinéma',
    why: 'passé composé', ruleId: 'passe-compose', mistakeId: 'mg-test1',
    at: new Date().toISOString(), count: 1, recurrence: 0, correctedByLearner: false,
  }]));
};

test('offline Today session stays complete: authored drill replaces the AI drill', async ({ page }) => {
  await seedLocalStorage(page, MISTAKE_SEED);
  // Mock off + no key = no AI capability; the authored library drill must
  // appear instead of an "unavailable" screen.
  await page.getByRole('button', { name: 'Speak today' }).click();
  await expect(page.getByText(/Aujourd'hui/i).first()).toBeVisible({ timeout: 10_000 });
  // Either the authored drill rendered questions, or the chain walked on to
  // retype/SRS — but never an unavailable hole.
  expect(await page.getByText(/Nothing available for this segment/i).count()).toBe(0);
});

test('service worker serves the app shell offline (Chromium only)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'service-worker offline navigation is a Chromium-family path');
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  // Production registers the SW on load; in dev we drive the real
  // registration manually so the caching logic itself is what's tested.
  const registered = await page.evaluate(() => navigator.serviceWorker
    .register('./sw.js').then(() => true).catch(() => false));
  expect(registered).toBe(true);
  // Activation + clients.claim() puts the worker in control of this page.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20_000 });
  const shell = await page.evaluate(() => new Promise(async (resolve) => {
    try {
      const cacheKeys = await caches.keys();
      for (const key of cacheKeys) {
        const hit = await caches.open(key).then((c) => c.match('./'));
        if (hit) { resolve({ cachedShell: true, key }); return; }
      }
      resolve({ cachedShell: false, cacheKeys });
    } catch (e) { resolve({ error: String(e) }); }
  }));
  expect(shell.cachedShell).toBe(true);
  // And the SW really answers navigation requests from cache: abort the
  // network at the context level, then reload — the shell must still come up.
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
  await page.context().setOffline(false);
});

test('in-flight conversation survives a reload (active-session restore)', async ({ page }) => {
  // The historical WebKit-only skip is gone for good: the two app bugs it
  // inherited from (seeded fp.onboarded parsed as number 1 vs the '1' string
  // check; the wizard overlay intercepting clicks) are fixed, and restore
  // now passes on every engine with task-separated seeding.
  await seedLocalStorage(page, () => {
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'A1', ttsRate: 1 }));
    localStorage.setItem('fp.onboarded', '1');
    localStorage.setItem('fp.activeSession', JSON.stringify({
      scenarioId: 'libre',
      history: [{
        userText: 'Bonjour, je voudrais un café.',
        evaluation: {
          reply: 'Bien sûr, tout de suite ! Autre chose ?',
          translation: 'Of course, right away! Anything else?',
          corrections: 'Très bien !',
          corrections_detailed: [],
          native_alternative: 'Bonjour !',
          grammar_topic: null,
          scores: { grammar: 80, naturalness: 80, relevance: 90, fluency: 85, overall: 83 },
        },
        reply: 'Bien sûr, tout de suite ! Autre chose ?',
      }],
    }));
  });
  // seedLocalStorage already warmed the Today chunk graph, so the click
  // lands on the already-optimised dev server and the overlay opens
  // deterministically — no mid-click full reload.
  await page.getByRole('button', { name: 'Speak', exact: true }).click();
  // The restored turn must still be on screen after reload.
  await expect(page.getByText(/je voudrais un café/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/tout de suite/i).first()).toBeVisible({ timeout: 10_000 });
});

test('Today delivery is recorded on the selection trial after a run', async ({ page }) => {
  await seedLocalStorage(page, () => {
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
    localStorage.setItem('fp.onboarded', '1');
    localStorage.setItem('fp.mistakeGraph.v1', JSON.stringify([{
      id: 'mg-test2', type: 'tense', concept: 'passe-compose', source: 'conversation',
      attempt: 'Hier je vais', corrected: 'Hier je suis allé', confidence: 0.8,
      asrUncertain: false, related: [], createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(), lastRetestAt: null, recurrence: 2,
      retests: [], mastery: 10, status: 'active', schemaVersion: 1, engineVersion: 3,
    }]));
  });
  await page.getByRole('button', { name: 'Speak today' }).click();
  await expect(page.getByText(/Aujourd'hui/i).first()).toBeVisible({ timeout: 10_000 });
  // The speak segment cannot be skipped by design: complete one mock turn,
  // then end the conversation so the session advances.
  const input = page.getByRole('textbox', { name: /Typed reply/i });
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill('Bonjour, je voudrais un café.');
  await input.press('Enter');
  await page.getByRole('button', { name: /End Session/i }).first().click();
  // Skip through every remaining segment until the session completes.
  const skipButton = page.getByRole('button', { name: /Skip/i });
  for (let i = 0; i < 10; i++) {
    if (!(await skipButton.isVisible({ timeout: 1500 }).catch(() => false))) break;
    await skipButton.click();
    await page.waitForTimeout(200);
  }
  await expect(page.getByText(/C'est tout/i).first()).toBeVisible({ timeout: 10_000 });
  const trial = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('fp.selectionTrial.v1') || '[]');
    return list[list.length - 1] || null;
  });
  expect(trial).toBeTruthy();
  expect(Array.isArray(trial.delivered)).toBe(true);
  expect(trial.delivered.length).toBeGreaterThan(0);
  expect(typeof trial.timeSpent).toBe('number');
  // Honesty rule: tapping through in under 5s/segment is NOT a completed
  // session — the flag must reflect that rather than flatter the run.
  expect(trial.completed).toBe(false);
});
