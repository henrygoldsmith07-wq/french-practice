// Local-calendar-day countdown correctness.
//
// Bug: examCountdown used Date.parse('YYYY-MM-DD') (UTC midnight) and an
// elapsed-ms floor. For UTC+0/+1 learners an exam dated "today" flipped to
// negative — and therefore null, dropping "exam is today" from Today — after
// local midnight, while the evening before computed days === 0 ("today"
// instead of "tomorrow"). The countdown must be a CALENDAR-day difference:
// today is always 0 and tomorrow always 1, at every hour and in every zone.

import { strictEqual, ok, match } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { examCountdown } from '../src/lib/exams/findings.js';

// Local YYYY-MM-DD for a Date, so the date string means the learner's own
// calendar day regardless of the process timezone.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fixed local "now" values: early morning (just after midnight) and late
// evening, on a fixed local date. Injected via the function's `now` option,
// so these assertions are deterministic and timezone-independent.
const EARLY = new Date(2026, 5, 15, 0, 30).getTime(); // 00:30 local
const LATE = new Date(2026, 5, 15, 23, 30).getTime(); // 23:30 local
const DAY = 86_400_000;

const today = ymd(new Date(EARLY));
const tomorrow = ymd(new Date(EARLY + DAY));
const yesterday = ymd(new Date(EARLY - DAY));

for (const [label, now] of [['early morning', EARLY], ['late evening', LATE]]) {
  test(`today's date string yields days === 0 (${label})`, () => {
    const c = examCountdown(today, { now });
    ok(c, 'today must still produce a countdown, never null');
    strictEqual(c.days, 0);
    strictEqual(c.band, 'final-weeks');
  });

  test(`tomorrow's date string yields days === 1 (${label})`, () => {
    const c = examCountdown(tomorrow, { now });
    ok(c, 'tomorrow must produce a countdown');
    strictEqual(c.days, 1);
  });

  test(`yesterday's date string is history, not a countdown (${label})`, () => {
    strictEqual(examCountdown(yesterday, { now }), null);
  });
}

test('a Date object at a fixed local instant is read as its local calendar day', () => {
  // Reading-aloud material and other callers may hand in a Date/ISO instant;
  // its local day, not the raw UTC millisecond count, drives the countdown.
  const c = examCountdown(new Date(2026, 5, 17), { now: LATE });
  strictEqual(c.days, 2);
});

test('the fix keeps invalid and empty exam dates as null', () => {
  strictEqual(examCountdown('not-a-date', { now: EARLY }), null);
  strictEqual(examCountdown('', { now: EARLY }), null);
  strictEqual(examCountdown(null, { now: EARLY }), null);
  strictEqual(examCountdown('2026-02-31', { now: EARLY }), null); // rolled-over date rejected
});

// Bug 2 — untiered board labelled "Higher tier".
// Setup.jsx is JSX and cannot be imported by plain `node --test` here (no
// render harness in this file), so the persisted-tier fix is guarded at the
// source level instead: the untiered branch must persist null, not TIER.HIGHER.
test('ExamSetup persists a null tier for an untiered board (source guard)', () => {
  const src = readFileSync(new URL('../src/components/ExamSetup.jsx', import.meta.url), 'utf8');
  match(src, /const nextTier = b\.tiers\.length \? tier : null;/,
    'the chosen tier for an untiered board must be null');
  match(src, /persistExamIdentity\(b\.id, nextTier\)/,
    'the computed (possibly null) tier must be what gets persisted');
  ok(!/b\.tiers\.length \? tier : TIER\.HIGHER/.test(src),
    'an untiered board must no longer be persisted as Higher');
});
