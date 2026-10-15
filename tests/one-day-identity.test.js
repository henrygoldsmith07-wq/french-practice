import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// One calendar-day identity, one timezone — enforced.
//
// Le Studio once shipped a real bug: weeklyReview sliced the UTC date from an
// ISO timestamp while comparing it against local-time bounds, so any learner
// west of UTC practising in the evening had that session fall past midnight and
// vanish from the week. The fix introduced localDay.js (localDayKey) as the one
// canonical local-day identity. But the ROOT CAUSE was never closed: five lib
// modules and five components still hand-rolled their OWN
// toLocaleDateString('en-CA') day key, each a separate implementation that can
// drift from the canonical one (and does: an invalid Date yields the literal
// string "Invalid Date" instead of a safe null).
//
// These tests close it two ways:
//  1. A source-scan guard: no module may reintroduce a hand-rolled en-CA day
//     key. A new one fails here, loudly — the same guard pattern that caught
//     the exam-countdown and prompt-injection footguns.
//  2. An equivalence proof: localDayKey is byte-identical to the old
//     toLocaleDateString('en-CA') for every valid date, so unifying onto it is
//     a pure refactor with zero behaviour change for real input — only the
//     invalid-date and locale-drift hazards are removed.

const SRC = join(process.cwd(), 'src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('no module hand-rolls a second local-day key', () => {
  // toLocaleDateString('en-CA') as a day key is the drift hazard. The only
  // legitimate en-CA/en-GB uses are human-facing month/day labels in charts,
  // which are NOT day identities (they are never compared or stored as keys).
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    const code = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // A day-key use is en-CA with no date-format options (options => a label).
    const re = /toLocaleDateString\(\s*'en-CA'\s*\)/g;
    if (re.test(code)) {
      offenders.push(file.slice(process.cwd().length + 1));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Every calendar-day identity must come from localDayKey (localDay.js). ` +
    `A hand-rolled toLocaleDateString('en-CA') day key can drift from the ` +
    `canonical boundary (and returns "Invalid Date" for bad input):\n  ${offenders.join('\n  ')}`,
  );
});

test('localDayKey is byte-identical to the old en-CA day key for valid dates', async () => {
  const { localDayKey } = await import('../src/lib/localDay.js');
  const legacy = (d) => d.toLocaleDateString('en-CA');
  // A spread of dates across months, DST boundaries, and single-digit days.
  const samples = [
    new Date(2026, 0, 1, 0, 0, 0),
    new Date(2026, 0, 5, 23, 59, 0),
    new Date(2026, 2, 29, 12, 0, 0), // US DST spring-forward
    new Date(2026, 9, 25, 1, 30, 0), // EU/UK DST fall-back
    new Date(2026, 11, 31, 18, 0, 0),
    new Date(2024, 1, 29, 12, 0, 0), // leap day
  ];
  for (const d of samples) {
    assert.equal(localDayKey(d), legacy(d), `valid date ${d.toISOString()} must match`);
  }
});

test('localDayKey is safe where the en-CA key was not (invalid date)', async () => {
  const { localDayKey } = await import('../src/lib/localDay.js');
  const legacy = (d) => d.toLocaleDateString('en-CA');
  const bad = new Date('not a date');
  assert.equal(localDayKey(bad), null, 'canonical identity returns null for an invalid date');
  assert.notEqual(localDayKey(bad), legacy(bad), 'the old en-CA key returned "Invalid Date" — the bug');
  // A non-date string must not throw either.
  assert.equal(localDayKey('garbage'), null);
});
