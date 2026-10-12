import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { memoryStorage as memoryStorageDouble } from './helpers/memory-storage.js';

function memoryStorage(seed) {
  return memoryStorageDouble(seed);
}

async function freshBrief() {
  globalThis.localStorage = memoryStorage();
  // Unique query suffix forces a fresh module instance per test (storage keeps
  // module-level state the way the weekly-practice tests already handle it).
  return import(`../src/lib/todayBrief.js?brief=${Date.now()}.${Math.random()}`);
}

describe('today brief', () => {
  test('one dominant CTA with the session length', async () => {
    const { todayBrief } = await freshBrief();
    const brief = todayBrief({ entries: [], minutes: 14, hasListeningContent: true, hasScenario: true });
    assert.match(brief.cta, /^Start today's session — \d+ min$/);
    assert.ok(brief.minutes >= 5);
    assert.ok(brief.shape.length >= 1);
  });

  test('reports due items plainly', async () => {
    const { todayBrief } = await freshBrief();
    const brief = todayBrief({
      entries: [
        { id: 'w1', fr: 'la maison', en: 'house', cefr: 'A1', example: 'x', exampleEn: 'x', freq: 1 },
        { id: 'w2', fr: 'le pain', en: 'bread', cefr: 'A1', example: 'x', exampleEn: 'x', freq: 2 },
      ],
      minutes: 15,
    });
    assert.ok(brief.lines.some((l) => /item/.test(l)), `lines: ${JSON.stringify(brief.lines)}`);
  });

  test('at most three reason lines and no engine terminology', async () => {
    const { todayBrief } = await freshBrief();
    const brief = todayBrief({ entries: [], minutes: 15 });
    assert.ok(brief.lines.length <= 3);
    const all = `${brief.cta} ${brief.lines.join(' ')} ${brief.demonstrate}`;
    for (const bad of ['fp.', 'producer', 'calibration', 'engine', 'variant', 'arm', 'evidence', 'srs', 'fsrs']) {
      assert.ok(!all.toLowerCase().includes(bad), `brief leaks "${bad}"`);
    }
  });

  test('a new learner gets an honest session, not an empty screen', async () => {
    const { todayBrief } = await freshBrief();
    const brief = todayBrief({ entries: [], minutes: 10 });
    assert.equal(brief.empty, false);
    assert.ok(brief.cta.length > 0);
    assert.ok(brief.demonstrate.length > 0);
  });

  test('todayOutcome summarises real activity in learner language', async () => {
    const { todayOutcome } = await freshBrief();
    const now = Date.now();
    const at = new Date(now).toISOString();
    const summary = todayOutcome({
      now,
      events: [
        { type: 'session.completed', at, segments: ['speak', 'repair', 'retrieve'] },
        { type: 'weakness.improved', at },
        { type: 'review.completed', at },
        { type: 'review.completed', at },
      ],
    });
    assert.ok(summary.includes('3 skills practised'), summary);
    assert.ok(summary.includes('1 weakness improved'), summary);
    assert.ok(summary.includes('2 reviews completed'), summary);
  });

  test('a quiet day returns null instead of a fake score', async () => {
    const { todayOutcome } = await freshBrief();
    assert.equal(todayOutcome({ now: Date.now(), events: [] }), null);
  });

  test('names the exam the learner picked, with its tier', async () => {
    // freshBrief() resets localStorage, so seed the settings AFTER the module
    // graph is in place. ExamSetup persists the board id, tier AND the display
    // name together; Today reads the name from settings, never the registry.
    const { todayBrief } = await freshBrief();
    const settingsMod = await import('../src/lib/stores/settingsStore.js');
    settingsMod.setSettings({
      ...settingsMod.getSettings(),
      examBoard: 'aqa-gcse',
      examTier: 'foundation',
      examBoardName: 'AQA GCSE French',
    });
    const brief = todayBrief({ entries: [], minutes: 15 });
    assert.ok(
      brief.lines.some((l) => /Foundation tier, AQA GCSE French/.test(l)),
      `lines: ${JSON.stringify(brief.lines)}`,
    );
  });

  test('an approaching exam shows how close it is', async () => {
    // The countdown comes from the same examCountdown the session planner
    // reads, so the brief's urgency always matches the session's mix.
    const { todayBrief } = await freshBrief();
    const settingsMod = await import('../src/lib/stores/settingsStore.js');
    const dayIn = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    settingsMod.setSettings({
      ...settingsMod.getSettings(),
      examBoard: 'aqa-gcse',
      examBoardName: 'AQA GCSE French',
      examDate: dayIn(12),
    });
    const brief = todayBrief({ entries: [], minutes: 15 });
    assert.ok(
      // The day count floors the remaining time, so it depends on the hour the
      // test runs: seed with a fixed `now` mindset — assert the countdown line
      // exists and counts 1..12, not a hardcoded number that flips at midnight.
      brief.lines.some((l) => {
        const m = l.match(/^(\d+) days to your exam$/);
        return m !== null && Number(m[1]) >= 1 && Number(m[1]) <= 12;
      }),
      `lines: ${JSON.stringify(brief.lines)}`,
    );
  });

  test('a learner with an exam but no date gets no countdown line — no invented urgency', async () => {
    const { todayBrief } = await freshBrief();
    const settingsMod = await import('../src/lib/stores/settingsStore.js');
    settingsMod.setSettings({
      ...settingsMod.getSettings(),
      examBoard: 'aqa-gcse',
      examBoardName: 'AQA GCSE French',
    });
    const brief = todayBrief({ entries: [], minutes: 15 });
    assert.ok(!brief.lines.some((l) => /days to your exam|Exam is (today|tomorrow)/.test(l)),
      `lines: ${JSON.stringify(brief.lines)}`);
  });

  test('a countdown without a named exam shows nothing — a bare date is not their exam', async () => {
    // A date alone reads as a random deadline; without a board name the brief
    // cannot tie it to the learner's qualification, so it stays silent.
    const { todayBrief } = await freshBrief();
    const settingsMod = await import('../src/lib/stores/settingsStore.js');
    const dayIn = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    settingsMod.setSettings({
      ...settingsMod.getSettings(),
      examDate: dayIn(12),
    });
    const brief = todayBrief({ entries: [], minutes: 15 });
    assert.ok(!brief.lines.some((l) => /days to your exam|Exam is (today|tomorrow)/.test(l)),
      `lines: ${JSON.stringify(brief.lines)}`);
  });

  test('a learner with no exam selection gets no exam line — the brief never invents a target', async () => {
    const { todayBrief } = await freshBrief();
    const brief = todayBrief({ entries: [], minutes: 15 });
    assert.ok(!brief.lines.some((l) => /tier|GCSE|A-level|DELF/i.test(l)), `lines: ${JSON.stringify(brief.lines)}`);
  });

  test('an exam with no stored name (chosen before the field existed) names nothing', async () => {
    // Today cannot verify a label it was never given, so it shows none rather
    // than guessing one from an id it cannot resolve without the registry.
    const { todayBrief } = await freshBrief();
    const settingsMod = await import('../src/lib/stores/settingsStore.js');
    settingsMod.setSettings({ ...settingsMod.getSettings(), examBoard: 'aqa-gcse', examTier: 'higher' });
    const brief = todayBrief({ entries: [], minutes: 15 });
    assert.ok(!brief.lines.some((l) => /tier|GCSE|A-level|DELF/i.test(l)), `lines: ${JSON.stringify(brief.lines)}`);
  });
});

