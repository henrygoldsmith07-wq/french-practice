import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { progressEvidenceStatements } from '../src/lib/progressEvidence.js';

const NOW = new Date('2026-01-20T12:00:00Z').getTime();
const DAY = 86400000;
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

describe('progress evidence statements', () => {
  it('reports independent transfer as a concrete statement', () => {
    const { strengths } = progressEvidenceStatements({
      now: NOW,
      learningEvidence: {
        cycles: [{
          target: { label: 'past-tense narration' },
          transfers: [
            { at: at(2), independent: true },
            { at: at(5), independent: true },
          ],
          delayed: [],
        }],
      },
    });
    assert.ok(strengths.some((s) => s.includes('past-tense narration') && s.includes('2 new contexts')), JSON.stringify(strengths));
  });

  it('counts vocabulary that survived delayed recall', () => {
    const { strengths } = progressEvidenceStatements({
      now: NOW,
      errorEntries: [
        { category: 'vocabulary', key: 'w1', label: 'comprendre', status: 'recovering', lastEvidence: 'delayed', lastSuccessAt: at(1) },
        { category: 'vocabulary', key: 'w2', label: 'acheter', status: 'recovering', lastEvidence: 'delayed', lastSuccessAt: at(2) },
        { category: 'vocabulary', key: 'w3', label: 'vendre', status: 'recovering', lastEvidence: 'delayed', lastSuccessAt: at(40) },
      ],
    });
    assert.ok(strengths.some((s) => s.includes('2 vocabulary items survived delayed recall')), JSON.stringify(strengths));
  });

  it('names what still needs work, with where it happens', () => {
    const { weak } = progressEvidenceStatements({
      now: NOW,
      errorEntries: [
        {
          category: 'grammar', key: 'adjective-agreement', label: 'adjective agreement',
          status: 'active', errorCount: 3, recurrenceCount: 1, modes: ['speaking'],
          lastErrorAt: at(1),
        },
      ],
    });
    assert.ok(weak.some((s) => s.includes('adjective agreement') && s.includes('speaking')), JSON.stringify(weak));
    assert.ok(weak.some((s) => s.includes('came back after improving')));
  });

  it('shows production gaps as work in progress, not failures', () => {
    const { improving } = progressEvidenceStatements({
      now: NOW,
      errorEntries: [
        { category: 'vocabulary', key: 'comprendre::productive', label: 'comprendre', status: 'active', errorCount: 1 },
      ],
    });
    assert.ok(improving.some((s) => s.includes('already recognise')), JSON.stringify(improving));
  });

  it('an empty learner state produces no fabricated statements', () => {
    const result = progressEvidenceStatements({ now: NOW });
    assert.deepEqual(result, { strengths: [], improving: [], weak: [] });
  });

  it('never leaks internal terminology', () => {
    const result = progressEvidenceStatements({
      now: NOW,
      learningEvidence: {
        cycles: [{
          target: { label: 'past-tense narration' },
          transfers: [{ at: at(1), independent: true }],
          delayed: [{ at: at(2), independent: true, delayHours: 30 }],
        }],
      },
      errorEntries: [
        { category: 'grammar', key: 'negation', label: 'negation', status: 'active', errorCount: 2, recurrenceCount: 1, modes: ['writing'] },
      ],
    });
    for (const line of [...result.strengths, ...result.improving, ...result.weak]) {
      for (const bad of ['evidence', 'cycle', 'fp.', 'recurrence', 'transfer', 'engine', 'independent']) {
        assert.ok(!line.toLowerCase().includes(bad), `"${line}" leaks "${bad}"`);
      }
    }
  });
});
