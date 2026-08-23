import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusReport,
  renderMarkdown,
  publicPayload,
  EVIDENCE_FLOORS,
} from '../src/lib/validationStatusReport.js';

const BASE_AT = '2026-01-01T00:00:00.000Z';

// Schema-valid placement fixtures (source-tagged so they can never pass as
// real data if a copy ever leaks somewhere).
function placementFixtures(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `fix-pv-${i}`,
    knownLevel: 'B1',
    placedLevel: i % 4 === 0 ? 'B2' : 'B1',
    theta: 0.2,
    se: 0.45,
    itemsAsked: 14,
    rater: 'Fixture Rater',
    source: 'test-fixture',
    at: new Date(Date.parse(BASE_AT) + i * 60000).toISOString(),
  }));
}

describe('statusReport (shared lib)', () => {
  it('empty dataset: every track no-data with n=0', () => {
    const rows = statusReport({});
    assert.equal(rows.length, Object.keys(EVIDENCE_FLOORS).length);
    for (const r of rows) {
      assert.equal(r.n, 0);
      assert.equal(r.status, 'no-data');
      assert.equal(r.headline, '—');
    }
  });

  it('placement at/above floor reports validated with an exact-agreement headline', () => {
    const ds = { ...placementFixtures(24).reduce((acc, e) => {
      (acc.placementValidations ||= []).push(e);
      return acc;
    }, {}) };
    const rows = statusReport(ds);
    const placement = rows.find((r) => r.track === 'placement');
    assert.equal(placement.n, 24);
    assert.ok(['validated', 'provisional'].includes(placement.status));
    assert.match(placement.headline, /exact \d+%/);
  });

  it('fsrs defaults to counts-only without injected metrics', () => {
    const rows = statusReport({ reviewEvents: Array.from({ length: 60 }, (_, i) => ({ id: i })) });
    const fsrs = rows.find((r) => r.track === 'fsrs');
    assert.equal(fsrs.n, 60);
    assert.equal(fsrs.headline, '—'); // no invented fit numbers
  });

  it('injected fsrs metrics surface the full headline', () => {
    const rows = statusReport({}, { fsrs: { n: 200, status: 'validated', logLoss: 0.31, brier: 0.09, calibrationError: 0.04 } });
    const fsrs = rows.find((r) => r.track === 'fsrs');
    assert.match(fsrs.headline, /logLoss 0\.31 · brier 0\.09 · ECE 0\.04/);
  });

  it('floors match VALIDATION.md roadmap targets', () => {
    assert.equal(EVIDENCE_FLOORS.placement, 20);
    assert.equal(EVIDENCE_FLOORS.corpus, 30);
    assert.equal(EVIDENCE_FLOORS.fsrs, 50);
  });
});

describe('renderMarkdown / publicPayload', () => {
  it('markdown contains table header, honesty note and per-track rows', () => {
    const md = renderMarkdown('validation-dataset.json', statusReport({}));
    assert.match(md, /\| track \| n \| floor \| target \| status \| headline \|/);
    assert.match(md, /\| placement \| 0 \| 20 \| 20 \| no-data \| — \|/);
    assert.match(md, /never fabricate rows/);
  });

  it('public payload carries tracks + honestyNote + generatedAt', () => {
    const p = publicPayload('validation-dataset.json', statusReport({}), { generatedAt: '2026-08-23T00:00:00Z' });
    assert.equal(p.generatedAt, '2026-08-23T00:00:00Z');
    assert.equal(p.tracks.length, Object.keys(EVIDENCE_FLOORS).length);
    assert.match(p.honestyNote, /never fabricate/);
  });
});
