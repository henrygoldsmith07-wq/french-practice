import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPES, makeEvent, dropoutPoint, researchExport, weeklyRetention,
  INSTRUMENTATION_VERSION,
} from '../src/lib/instrumentation.js';

describe('product instrumentation', () => {
  it('creates only known event types with bounded payloads', () => {
    const event = makeEvent(EVENT_TYPES.SESSION_STARTED, {
      minutes: 14, segment: 'speak', transcript: 'x'.repeat(500),
    });
    assert.equal(event.type, EVENT_TYPES.SESSION_STARTED);
    assert.equal(event.version, INSTRUMENTATION_VERSION);
    assert.equal(typeof event.at, 'string');
    assert.ok(event.transcript.length <= 80, 'string payloads are bounded');
    assert.equal(makeEvent('not.a.real.type', {}), null);
  });

  it('tracks the drop-out point through a session', () => {
    assert.equal(dropoutPoint([]), null);
    const point = dropoutPoint([
      { id: 'warmup' }, { id: 'input' }, { id: 'speak', skipped: true },
    ]);
    assert.equal(point.segment, 'speak');
    assert.equal(point.index, 2);
    assert.equal(point.completed, false);
  });

  it('summarises a pilot window without any raw learner text', () => {
    const events = [
      makeEvent(EVENT_TYPES.FIRST_SESSION, {}, '2026-01-01T09:00:00Z'),
      makeEvent(EVENT_TYPES.SESSION_STARTED, { minutes: 14 }, '2026-01-01T09:01:00Z'),
      makeEvent(EVENT_TYPES.SEGMENT_COMPLETED, { segment: 'speak' }, '2026-01-01T09:06:00Z'),
      makeEvent(EVENT_TYPES.SPEAKING_DURATION, { seconds: 240 }, '2026-01-01T09:06:00Z'),
      makeEvent(EVENT_TYPES.TRANSFER_RESULT, { success: true }, '2026-01-01T09:12:00Z'),
      makeEvent(EVENT_TYPES.DELAYED_RESULT, { success: false }, '2026-01-02T09:12:00Z'),
      makeEvent(EVENT_TYPES.REVIEW_COMPLETED, { cards: 6 }, '2026-01-02T09:20:00Z'),
      makeEvent(EVENT_TYPES.WEAKNESS_RECURRED, {}, '2026-01-02T09:25:00Z'),
      makeEvent(EVENT_TYPES.SESSION_COMPLETED, {}, '2026-01-02T09:30:00Z'),
    ];
    const report = researchExport({ events });
    assert.equal(report.sessions.started, 1);
    assert.equal(report.sessions.completed, 1);
    assert.equal(report.practice.transferSuccess, 1);
    assert.equal(report.practice.delayedSuccess, 0);
    assert.equal(report.practice.reviewsCompleted, 1);
    assert.equal(report.weaknesses.recurred, 1);
    assert.equal(report.speaking.totalSeconds, 240);
    assert.ok(Number.isFinite(report.timeToFirstSession));
    const asJson = JSON.stringify(report);
    assert.ok(!asJson.includes('x'.repeat(40)), 'no raw text in export');
  });

  it('filters the export window', () => {
    const events = [
      makeEvent(EVENT_TYPES.SESSION_STARTED, {}, '2026-01-01T09:00:00Z'),
      makeEvent(EVENT_TYPES.SESSION_STARTED, {}, '2026-02-01T09:00:00Z'),
    ];
    const report = researchExport({ events, since: '2026-01-15T00:00:00Z' });
    assert.equal(report.sessions.started, 1);
  });

  it('reports weekly retention as counts, not conclusions', () => {
    const events = [
      makeEvent(EVENT_TYPES.SESSION_STARTED, {}, '2026-01-01T09:00:00Z'),
      makeEvent(EVENT_TYPES.SESSION_STARTED, {}, '2026-01-01T18:00:00Z'),
      makeEvent(EVENT_TYPES.SESSION_STARTED, {}, '2026-01-03T09:00:00Z'),
    ];
    const now = new Date('2026-01-05T09:00:00Z').getTime();
    const retention = weeklyRetention(events, { weeks: 1, now });
    assert.equal(retention.activeDays.length, 2);
  });

  it('an empty history yields honest nulls and zeros', () => {
    const report = researchExport({ events: [] });
    assert.equal(report.sessions.started, 0);
    assert.equal(report.sessions.completionRate, null);
    assert.equal(report.timeToFirstSession, null);
  });
});
