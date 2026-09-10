import { test, expect } from '@playwright/test';
import { PROTOCOL } from '../src/lib/studyProtocol.js';
import { isCheckDay } from '../src/lib/evidenceStudy.js';

// True six-skill production cycle: real Today overlay, real held-out check
// runner, real bank items, real storage → export → import → pool.
//
// MODALITY NOTES (honest limitations, not hidden):
//   · Desktop Chromium runs with a FAKE microphone device (--use-fake-
//     device-for-media-stream) and MOCK AI. That proves the recording →
//     transcription → scoring WIRING end-to-end — it does NOT prove real
//     speech recognition accuracy or hardware behaviour. Real mic / TTS /
//     Bluetooth behaviour is covered by docs/RECRUITMENT_CHECKLIST.md
//     manual device passes, not by these tests.
//   · Firefox/WebKit headless cannot grant fake audio; for speaking they
//     assert the graceful unavailable path instead.

const SCHED = PROTOCOL.transfer.skillSchedule;
const FIRST = PROTOCOL.duration.firstCheckDay;
const EVERY = PROTOCOL.duration.checkEveryDays;

function firstScheduledDay(pid, skill) {
  for (let day = FIRST; day < FIRST + EVERY * 80; day++) {
    if (!isCheckDay(pid, day)) continue;
    const ordinal = Math.floor((day - FIRST) / EVERY);
    if (SCHED[((ordinal % SCHED.length) + SCHED.length) % SCHED.length] === skill) return day;
  }
  return null;
}

async function seedStudy(page, pid, day, extra = {}) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(({ pid, day, extra }) => {
    localStorage.setItem('fp.settings', JSON.stringify({ mockMode: true, level: 'B1', ttsRate: 1 }));
    localStorage.setItem('fp.onboarded', '1');
    localStorage.setItem('fp.study.state.v1', JSON.stringify({
      schemaVersion: 1, engineVersion: 1, protocolVersion: 1,
      participantId: pid, arm: 'adaptive', armSource: 'sync-id-hash',
      enrolledAt: new Date(Date.now() - day * 86400000).toISOString(),
      startLevel: 'B1', startTheta: null, weeks: 8, status: 'active',
      baseline: { speakingAverage: null },
      ...extra,
    }));
    localStorage.setItem('fp.study.consent.v1', JSON.stringify({ decision: 'accepted', at: new Date().toISOString(), version: 1 }));
  }, { pid, day, extra });
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
}

async function walkToCheck(page) {
  await page.getByRole('button', { name: 'Speak today' }).click();
  await expect(page.locator('[aria-label="Today\'s French"]')).toBeVisible({ timeout: 20_000 });
  const input = page.getByRole('textbox', { name: /Typed reply/i });
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill('Bonjour, je voudrais un café.');
  await input.press('Enter');
  await page.getByRole('button', { name: /End Session/i }).first().click();
}

async function reachCheck(page) {
  const prompt = page.getByText(/check 1\/\d/i);
  for (let i = 0; i < 10 && !(await prompt.isVisible().catch(() => false)); i++) {
    const skip = page.getByRole('button', { name: /^Skip/i });
    if (!(await skip.isVisible({ timeout: 2000 }).catch(() => false))) break;
    await skip.click();
    await page.waitForTimeout(200);
  }
  await expect(prompt, 'the scheduled held-out check must appear').toBeVisible({ timeout: 20_000 });
  return prompt;
}

// Answer ONE item straight from its frozen payload, then continue.
async function answerItem(page, item) {
  switch (item.skill) {
    case 'vocabulary': {
      await page.getByRole('group', { name: /Choose the matching French word/i }).locator('button').first().click();
      break;
    }
    case 'listening': {
      await page.getByRole('button', { name: /Play listening item/i }).click();
      await page.waitForTimeout(400);
      // If the platform has no usable TTS voice the runner marks the item
      // unavailable immediately — then there is nothing to select.
      if (!(await page.getByRole('button', { name: /Record & next|Finish check/i }).isVisible().catch(() => false))) {
        await page.getByRole('group', { name: /Choose the meaning you heard/i }).locator('button').first().click();
      }
      break;
    }
    case 'reading': {
      await page.getByRole('group', { name: /Choose the correct meaning/i }).locator('button').first().click();
      break;
    }
    case 'grammar':
    case 'vocabulary-prod': {
      const accept = (item.accept && item.accept[0]) || 'test';
      await page.getByRole('textbox', { name: /Your answer in French/i }).fill(accept);
      await page.getByRole('button', { name: /Submit answer/i }).click();
      break;
    }
    case 'speaking': {
      const startBtn = page.getByTestId('start-speaking-attempt');
      await expect(startBtn, 'speaking runner must present its start action').toBeVisible({ timeout: 10_000 });
      await startBtn.click();
      await page.getByRole('button', { name: /Record my speaking attempt/i }).click();
      await page.waitForTimeout(600);
      const stop = page.getByRole('button', { name: /Stop recording/i });
      if (await stop.isVisible({ timeout: 3_000 }).catch(() => false)) await stop.click();
      // Mock transcribe+evaluate resolve quickly; if infrastructure stalls
      // the runner must fall back to unscored — never a dead end.
      await expect(page.getByRole('button', { name: /Record & next|Finish check/i })).toBeVisible({ timeout: 30_000 });
      break;
    }
    default:
      throw new Error(`no renderer for skill ${item.skill}`);
  }
}

async function completeCheck(page, pre) {
  for (let i = 0; i < pre.items.length; i++) {
    await answerItem(page, pre.items[i]);
    const cont = page.getByRole('button', { name: /Record & next|Finish check/i });
    await expect(cont).toBeVisible({ timeout: 5_000 });
    await cont.click();
    await page.waitForTimeout(150);
  }
}

async function readCheckRecord(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('fp.study.checks.v1') || '[]')[0] || null);
}

test.describe('six-skill production cycle (desktop chromium: fake mic + mock AI)', () => {
  test.use({ }); // chromium project carries the fake-device launch args

  for (const skill of SCHED) {
    test(`${skill} check completes with modality-correct evidence`, async ({ page }, testInfo) => {
      test.slow();
      const pid = `participant-cycle-${skill.replace(/[^a-z]/gi, '')}`;
      const day = firstScheduledDay(pid, skill);
      test.skip(!day, `no scheduled ${skill} day inside the horizon`);
      if (skill === 'speaking') {
        test.skip(testInfo.project.name !== 'chromium', 'fake-microphone capture is only wired in the desktop Chromium project');
      }
      await seedStudy(page, pid, day);
      await walkToCheck(page);
      await reachCheck(page);
      const pre = await readCheckRecord(page);
      expect(pre.items.length).toBeGreaterThan(0);
      expect(pre.scheduledSkill).toBe(skill);
      // Frozen payloads present BEFORE answering (reload resilience below).
      for (const it of pre.items) {
        expect(it.sourceItemId).toMatch(/^chk-/);
        expect(it.skill).toBe(skill);
      }
      await completeCheck(page, pre);
      // Completion screen reached without crashing.
      await expect(page.getByText(/C'est tout/i)).toBeVisible({ timeout: 15_000 });
      const chk = await readCheckRecord(page);
      expect(chk.results, 'results persisted').not.toBeNull();
      expect(chk.results.perItem.length).toBe(pre.items.length);
      for (const e of chk.results.perItem) {
        expect(e.skill).toBe(skill);
        expect(['scored', 'unscored', 'unavailable']).toContain(e.status);
        if (skill === 'speaking') {
          expect(e.correct).toBeNull(); // speaking never claims boolean correctness
          if (e.status === 'scored') expect(typeof e.aiScore).toBe('number');
          else expect(e.aiScore).toBeNull();
        } else if (e.status === 'scored') {
          expect(typeof e.correct).toBe('boolean');
        } else {
          expect(e.correct).toBeNull();
        }
        if (e.status === 'unavailable') expect(e.reason, 'unavailable must explain itself').toBeTruthy();
      }
      // Export → import → pool carries valid per-item evidence (node side).
      // Dismiss the completion screen first, then navigate to Analytics.
      const completeScreen = page.getByRole('dialog', { name: "Today's French complete" });
      if (await completeScreen.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await completeScreen.getByRole('button', { name: /^Close$/i }).click();
      }
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await page.getByRole('button', { name: /Analytics/i }).first().click();
      const exportBtn = page.getByRole('button', { name: /Export study bundle/i });
      await expect(exportBtn).toBeVisible({ timeout: 15_000 });
      const download = page.waitForEvent('download');
      await exportBtn.click();
      const dl = await download;
      {
        const fs = await import('node:fs/promises');
        const bundle = JSON.parse(await fs.readFile(await dl.path(), 'utf8'));
        const imported = bundle.studyChecks[0];
        expect(imported.results.perItem.length).toBe(chk.results.perItem.length);
        const { poolStudyData } = await import('../src/lib/researchAggregation.js');
        const pool = poolStudyData({ imports: [{ study: bundle.study, outcomes: bundle.studyOutcomes, checks: bundle.studyChecks, participantId: bundle.study.participantId }] });
        expect(pool.rejected, JSON.stringify(pool.rejected)).toHaveLength(0);
        // Speaking evidence is either a pooled score or honestly absent —
        // never a fabricated 0.
        if (skill === 'speaking') {
          const scored = chk.results.perItem.filter((e) => e.status === 'scored');
          const pooled = pool.outcomes.filter((o) => o.transfer && o.transfer.speaking);
          if (!scored.length) expect(pooled).toHaveLength(0);
        }
      }
      // Payload survives reload; the same day never re-presents a completed
      // check (no recycling, no second measurement).
      await page.reload();
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
      await walkToCheck(page);
      const again = await readCheckRecord(page);
      expect(again.id).toBe(chk.id);
      expect(again.items.map((i) => i.sourceItemId)).toEqual(chk.items.map((i) => i.sourceItemId));
      const listCount = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.study.checks.v1') || '[]').length);
      expect(listCount, 'no duplicate check created on reopen').toBe(1);
      // Walk ends at the done screen (no second check prompt); close it.
      const rePrompt = page.getByText(/check 1\/\d/i);
      if (await rePrompt.isVisible({ timeout: 2_000 }).catch(() => false)) throw new Error('completed check re-presented');
      const doneScreen = page.getByRole('dialog', { name: "Today's French complete" });
      if (await doneScreen.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await doneScreen.getByRole('button', { name: /^Close$/i }).click();
      }
      // Next scheduled day must not reuse these items.
      const nextDay = (() => { for (let d = day + 1; d < day + 30; d++) if (isCheckDay(pid, d)) return d; return null; })();
      if (nextDay) {
        await seedStudy(page, pid, nextDay);
        await walkToCheck(page);
        const next = await page.evaluate((nd) => (JSON.parse(localStorage.getItem('fp.study.checks.v1') || '[]').find((c) => c.day === nd)) || null, nextDay);
        if (next) {
          const priorIds = new Set(chk.items.map((i) => i.sourceItemId));
          for (const it of next.items) expect(priorIds.has(it.sourceItemId), 'held-out items never repeat').toBe(false);
        }
      }
    });
  }
});
