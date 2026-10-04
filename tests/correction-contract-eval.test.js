// Correction-contract eval: measures how often the structured metadata the
// product depends on actually arrives, and is honest when nothing exists.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  correctionContractEval,
  batchesFromCorpusRows,
  renderEvalSummary,
} from '../src/lib/correctionContractEval.js';

describe('correction-contract eval — coverage measurement', () => {
  it('counts each contract field independently', () => {
    const report = correctionContractEval([
      [
        // Fully structured.
        {
          original: 'J\'ai allé', correction: 'Je suis allé', level: 'definite_error',
          impact: 'grammar', targetSkill: 'past-tense', targetForm: 'passé composé with être',
          severity: 3, confidence: 0.9, interruptRecommended: true,
        },
        // No structure at all: the old contract shape.
        { original: 'le pain', correction: 'la pain', level: 'definite_error' },
      ],
    ]);
    assert.equal(report.sampleSize, 2);
    assert.equal(report.coverage.targetSkill.count, 1);
    assert.equal(report.coverage.targetSkill.rate, 0.5);
    assert.equal(report.coverage.impact.count, 1);
    assert.equal(report.complete, 1);
    assert.equal(report.degraded, 1, 'the unstructured correction degrades to phrase-level transfer');
  });

  it('measures what the validator would ACCEPT, not what the model sent', () => {
    // Out-of-contract values are dropped by the validator before counting:
    // a bogus targetSkill must not inflate coverage.
    const report = correctionContractEval([[
      { original: 'x', correction: 'y', impact: 'catastrophic', targetSkill: 42, confidence: 5 },
    ]]);
    assert.equal(report.coverage.impact.count, 0, 'an invalid impact is not counted as delivered');
    assert.equal(report.coverage.targetSkill.count, 0, 'a non-string targetSkill is not counted');
    assert.equal(report.coverage.confidence.count, 0, 'an out-of-range confidence is not counted');
  });

  it('reports no-data honestly when nothing is measurable', () => {
    const report = correctionContractEval([]);
    assert.equal(report.sampleSize, 0);
    assert.equal(report.coverage.impact.rate, null, 'no rate is invented');
    assert.equal(renderEvalSummary(report), 'No structured corrections to measure yet.');
  });

  it('ignores markdown corrections — there is no structure to measure', () => {
    const batches = batchesFromCorpusRows([
      { aiCorrections: '<s>le</s> pain → <mark>la</mark> pain' },
      { aiCorrections: null },
      {},
    ]);
    assert.equal(batches.length, 0);
    // …but real structured payloads are extracted.
    const good = batchesFromCorpusRows([
      { aiCorrections: JSON.stringify([{ original: 'a', correction: 'b', level: 'definite_error' }]) },
    ]);
    assert.equal(good.length, 1);
  });

  it('malformed JSON in a corpus row is skipped, never thrown on', () => {
    const batches = batchesFromCorpusRows([{ aiCorrections: '[not json' }, { aiCorrections: '{"x":1}' }]);
    assert.equal(batches.length, 0);
  });

  it('summary shows sample size and names the degradation cost', () => {
    const report = correctionContractEval([[
      { original: 'a', correction: 'b', level: 'definite_error', impact: 'grammar' },
      { original: 'c', correction: 'd', level: 'definite_error', impact: 'grammar', targetSkill: 'negation' },
    ]]);
    const text = renderEvalSummary(report);
    assert.ok(text.includes('2 corrections evaluated'), text);
    assert.ok(/degrades to phrase-level transfer/.test(text), text);
    assert.ok(/Descriptive coverage only/.test(text), 'never a pedagogical claim');
  });

  it('per-impact breakdown separates classes', () => {
    const report = correctionContractEval([[
      { original: 'a', correction: 'b', impact: 'meaning', targetSkill: 'negation' },
      { original: 'c', correction: 'd', impact: 'grammar' },
      { original: 'e', correction: 'f' },
    ]]);
    assert.equal(report.byImpact.meaning.withTarget, 1);
    assert.equal(report.byImpact.grammar.withTarget, 0);
    assert.equal(report.byImpact.unclassified.n, 1);
  });
});
