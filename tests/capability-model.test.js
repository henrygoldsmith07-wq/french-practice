import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapabilityMap, progressOverview, CAPABILITY_STATE,
} from '../src/lib/capabilityModel.js';

describe('learner capability model', () => {
  it('a brand-new learner shows honest insufficient states, not empty failure', () => {
    const map = buildCapabilityMap({});
    assert.ok(map.demonstrated.length === 0);
    assert.ok(map.insufficient.length > 0);
    for (const row of map.insufficient) assert.equal(row.state, CAPABILITY_STATE.INSUFFICIENT);
    assert.ok(map.explanation[CAPABILITY_STATE.INSUFFICIENT].includes('Keep practising'));
  });

  it('derives demonstrated capability from real independent performance', () => {
    const map = buildCapabilityMap({
      errorEntries: [
        {
          category: 'speaking', key: 'personal-questions', label: 'personal questions',
          errorCount: 1, successCount: 4, independentPasses: 3, status: 'resolved', evidence: [], modes: ['conversation'],
        },
      ],
    });
    const row = map.demonstrated.find((r) => r.id === 'personal-questions');
    assert.ok(row, 'personal-questions should be demonstrated');
    assert.equal(row.state, CAPABILITY_STATE.DEMONSTRATED);
  });

  it('assisted-only performance stays developing, never demonstrated', () => {
    const map = buildCapabilityMap({
      errorEntries: [
        {
          category: 'speaking', key: 'personal-questions', label: 'personal questions',
          errorCount: 2, successCount: 5, cleanPasses: 0, independentPasses: 0,
          status: 'recovering', evidence: [], modes: ['conversation'],
        },
      ],
    });
    const row = map.developing.find((r) => r.id === 'personal-questions');
    assert.ok(row, 'should be developing, not demonstrated');
    assert.equal(map.demonstrated.find((r) => r.id === 'personal-questions'), undefined);
  });

  it('a single correct answer never demonstrates', () => {
    const map = buildCapabilityMap({
      errorEntries: [
        {
          category: 'speaking', key: 'past-narration', label: 'past narration',
          errorCount: 2, successCount: 1, independentPasses: 1, status: 'recovering', evidence: [], modes: ['conversation'],
        },
      ],
    });
    const row = map.developing.find((r) => r.id === 'past-narration');
    assert.ok(row);
  });

  it('transfer + delayed cycle evidence demonstrates a capability', () => {
    const map = buildCapabilityMap({
      cycles: [{
        target: { skill: 'listening', key: 'listen-normal', label: 'listening' },
        baseline: [{ phase: 'baseline', at: '2026-01-01T00:00:00Z' }],
        interventions: [{ phase: 'intervention', at: '2026-01-02T00:00:00Z' }],
        transfers: [{ phase: 'transfer', at: '2026-01-03T00:00:00Z', independent: true }],
        delayed: [{ phase: 'delayed', at: '2026-01-05T00:00:00Z', independent: true, delayHours: 30 }],
        recurrences: [],
      }],
    });
    const row = map.demonstrated.find((r) => r.category === 'listening');
    assert.ok(row, 'listening capability should be demonstrated');
  });

  it('groups capabilities by real ability category', () => {
    const map = buildCapabilityMap({});
    const cats = map.groups.map((g) => g.category);
    for (const needed of ['speaking', 'listening', 'vocabulary', 'grammar']) {
      assert.ok(cats.includes(needed), `missing group ${needed}`);
    }
  });

  it('progressOverview answers the four questions with plain copy', () => {
    const overview = progressOverview({
      capabilityMap: buildCapabilityMap({
        errorEntries: [{
          category: 'speaking', key: 'past-narration', label: 'past narration',
          errorCount: 1, successCount: 3, independentPasses: 3, status: 'resolved', evidence: [], modes: [],
        }],
      }),
      weaknessLifecycle: [{ label: 'conditional tense', state: 'confirmed', detail: 'needs work' }],
      nextAction: 'Use adjective agreement correctly in a new speaking situation.',
      level: 'B1',
    });
    assert.equal(overview.level, 'B1');
    assert.ok(overview.canDo.length > 0);
    assert.ok(overview.weak.some((w) => w.label === 'conditional tense'));
    assert.match(overview.next, /adjective agreement/);
  });

  it('capability copy never exposes internal terminology', () => {
    const map = buildCapabilityMap({});
    for (const row of [...map.demonstrated, ...map.developing, ...map.insufficient]) {
      for (const bad of ['fp.', 'evidence', 'engine', 'candidate', 'calibration', 'insufficient']) {
        assert.ok(!row.statement.toLowerCase().includes(bad), `statement leaks "${bad}"`);
      }
    }
    for (const text of Object.values(map.explanation)) {
      assert.ok(!text.toLowerCase().includes('insufficient evidence'));
    }
  });

  it('never throws on junk evidence', () => {
    assert.ok(buildCapabilityMap({ errorEntries: [{}, null, { category: 42 }], cycles: [null], sessions: [{}] }));
  });
});
