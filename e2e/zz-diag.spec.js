import { test, expect } from '@playwright/test';
import { firstScheduledDay, seedStudy, walkToCheck } from './six-skill-cycle.spec.js';

test('diagnose: listening item stability on webkit', async ({ page }) => {
  const day = firstScheduledDay('diag-listen', 'listening');
  if (!day) { console.log('NO LISTENING DAY in horizon'); return; }
  await seedStudy(page, 'diag-listen', day);
  await walkToCheck(page);
  const cont = page.getByRole('button', { name: /Record & next|Finish check/i });
  const play = page.getByRole('button', { name: /Play listening item/i });
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const cb = await cont.boundingBox().catch(() => null);
    const pl = await play.getAttribute('aria-label').catch(() => null);
    const vis = await cont.isVisible().catch(() => false);
    const en = await play.isEnabled().catch(() => null);
    rows.push(`tick ${i}: cont=${JSON.stringify(cb)} playLabel=${pl} playEnabled=${en} contVis=${vis}`);
    await page.waitForTimeout(400);
  }
  for (const r of rows) console.log(r);
  console.log('FINAL cont.boundingBox = ' + JSON.stringify(await cont.boundingBox().catch(() => 'none')));
  console.log('FINAL play.innerHTML = ' + (await play.innerHTML().catch(() => 'n/a')).slice(0, 80));
});