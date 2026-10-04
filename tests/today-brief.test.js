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
});
