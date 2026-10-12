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
    assert.deepEqual(result, { strengths: [], improving: [], weak: [], fixed: [] });
  });

  it('names a DEMONSTRATED cycle as "fixed" — the headline promise', () => {
    // A cycle with an independent held-out transfer AND an independent delayed
    // retest past the 20h floor is the model's strongest claim: DEMONSTRATED.
    // The events carry the provenance the real follow-up runner records
    // (sourceReliability high, a marker confidence) so they clear the
    // independent-strength gate the same way a genuine check does.
    const { fixed } = progressEvidenceStatements({
      now: NOW,
      learningEvidence: {
        cycles: [{
          target: { label: 'past-tense narration' },
          startedAt: at(30),
          interventions: [{ at: at(25), correct: true, independent: true, encounterId: 'i1', score: 90, sourceReliability: 'high', markerConfidence: 0.9 }],
          transfers: [{ at: at(10), correct: true, independent: true, heldOut: true, encounterId: 't1', score: 95, sourceReliability: 'high', markerConfidence: 0.9 }],
          delayed: [{ at: at(2), correct: true, independent: true, heldOut: true, encounterId: 'd1', score: 92, delayHours: 48, sourceReliability: 'high', markerConfidence: 0.9 }],
        }],
      },
    });
    assert.ok(fixed.some((s) => s.toLowerCase().includes('fixed') && s.includes('past-tense narration')), JSON.stringify(fixed));
  });

  it('does NOT call a merely-improving cycle "fixed"', () => {
    // A transfer but no independent delayed pass: NEEDS_CONFIRMATION, not
    // DEMONSTRATED. "Fixed" must stay reserved for the real thing.
    const { fixed } = progressEvidenceStatements({
      now: NOW,
      learningEvidence: {
        cycles: [{
          target: { label: 'adjective agreement' },
          startedAt: at(30),
          interventions: [{ at: at(25), correct: true, independent: true, encounterId: 'i1', score: 90, sourceReliability: 'high', markerConfidence: 0.9 }],
          transfers: [{ at: at(10), correct: true, independent: true, heldOut: true, encounterId: 't1', score: 95, sourceReliability: 'high', markerConfidence: 0.9 }],
          delayed: [],
        }],
      },
    });
    assert.equal(fixed.length, 0, JSON.stringify(fixed));
  });

  it('does not call a same-day retest "fixed" — the delay floor holds', () => {
    // A "delayed" event with no real gap is not retention evidence; the cycle
    // cannot reach DEMONSTRATED, so nothing is named fixed.
    const { fixed } = progressEvidenceStatements({
      now: NOW,
      learningEvidence: {
        cycles: [{
          target: { label: 'negation' },
          startedAt: at(5),
          interventions: [{ at: at(4), correct: true, independent: true, encounterId: 'i1', score: 90, sourceReliability: 'high', markerConfidence: 0.9 }],
          transfers: [{ at: at(3), correct: true, independent: true, heldOut: true, encounterId: 't1', score: 95, sourceReliability: 'high', markerConfidence: 0.9 }],
          delayed: [{ at: at(1), correct: true, independent: true, encounterId: 'd1', score: 92, delayHours: 2, sourceReliability: 'high', markerConfidence: 0.9 }],
        }],
      },
    });
    assert.equal(fixed.length, 0, JSON.stringify(fixed));
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
    for (const line of [...result.strengths, ...result.improving, ...result.weak, ...result.fixed]) {
      for (const bad of ['evidence', 'cycle', 'fp.', 'recurrence', 'transfer', 'engine', 'independent']) {
        assert.ok(!line.toLowerCase().includes(bad), `"${line}" leaks "${bad}"`);
      }
    }
  });
});
