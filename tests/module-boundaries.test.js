// Module-boundary guard — stops the god modules from growing back.
//
// The refactor rule was never "files must be short": it was "domain logic
// lives behind a domain boundary, not inside presentation or one facade".
// These tests pin the boundaries that were actually extracted (today's
// planning out of React, segment runners out of TodaySession, the experiment
// report out of research aggregation) and the growth caps that make the
// next refactor visible before the module becomes a monolith again.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const lines = (p) => read(p).split('\n').length;

describe('module boundaries — the extracted domains stay extracted', () => {
  it('Today plan construction lives in its own testable module, not React', () => {
    const plan = read('src/lib/todayPlan.js');
    assert.ok(/export function buildTodayPlan/.test(plan), 'todayPlan owns plan building');
    assert.ok(!/from 'react'/.test(plan), 'plan building is a pure module, not a component');
    // TodaySession calls the builder instead of rebuilding it inline.
    const session = read('src/components/TodaySession.jsx');
    assert.ok(/buildTodayPlan/.test(session), 'TodaySession consumes the plan builder');
    assert.ok(!/buildDailyCurriculum/.test(session), 'curriculum construction is not duplicated in React');
  });

  it('the segment runners live in TodaySegments, not TodaySession', () => {
    const segments = read('src/components/TodaySegments.jsx');
    assert.ok(/export function DrillChainRunner/.test(segments), 'TodaySegments owns the drill chain');
    assert.ok(/export function RecallRunner/.test(segments), 'TodaySegments owns recall');
    const session = read('src/components/TodaySession.jsx');
    assert.ok(!/^function DrillChainRunner/m.test(session), 'TodaySession does not redefine the chain');
    // Session orchestration stays small: plan + trial + delivery bookkeeping.
    assert.ok(lines('src/components/TodaySession.jsx') < 700,
      `TodaySession regrew to ${lines('src/components/TodaySession.jsx')} lines`);
  });

  it('the experiment report is a pure module with its own contract', () => {
    const report = read('src/lib/experimentReport.js');
    assert.ok(!/from 'react'/.test(report), 'the report is testable without a renderer');
    assert.ok(/MIN_PER_ARM/.test(report), 'floors live with the report');
  });

  it('planner reasoning is data, not presentation', () => {
    const planner = read('src/lib/sessionPlanner.js');
    assert.ok(!/from 'react'/.test(planner), 'the planner is pure');
    assert.ok(/successProof/.test(planner), 'segments carry what a pass would prove');
    assert.ok(/competing/.test(planner), 'segments carry the losing competitor');
  });

  it('speaking-time accounting is pure and independent of storage', () => {
    const st = read('src/lib/speakingTime.js');
    assert.ok(!/localStorage|storageCore|from 'react'/.test(st), 'pure rules, persistence elsewhere');
    assert.ok(/export function spokenProduction/.test(st));
  });
});

describe('growth caps — the hotspots stay under the line that prompted extraction', () => {
  // Caps are set slightly above today's size: they do not freeze the file,
  // they make the next 200-line growth visible in review instead of in six
  // months when the file is a monolith again.
  const caps = [
    ['src/lib/sessionPlanner.js', 600],
    ['src/lib/weaknessLifecycle.js', 350],
    ['src/lib/capabilityModel.js', 400],
    ['src/lib/experimentReport.js', 350],
    ['src/lib/speakingTransfer.js', 500],
    ['src/lib/speakingCoach.js', 300],
    ['src/lib/todayBrief.js', 250],
    ['src/lib/todayPlan.js', 350],
    ['src/lib/progressEvidence.js', 250],
  ];
  for (const [file, cap] of caps) {
    it(`${file} stays under ${cap} lines`, () => {
      const n = lines(file);
      assert.ok(n <= cap, `${file} grew to ${n} lines (cap ${cap}) — split the domain rather than pass the cap`);
    });
  }
});

describe('storage facade — delegation, not accumulation', () => {
  it('storage.js delegates to domain stores instead of owning new logic', () => {
    const storage = read('src/lib/storage.js');
    // The extracted stores are real modules storage re-exports from; the
    // facade may re-export, but the rules live in the domain module.
    assert.ok(/learnerErrorStore/.test(storage), 'learner errors live behind their store');
    assert.ok(/learningEvidenceStore/.test(storage), 'learning evidence lives behind its store');
  });

  it('the pure rules for evidence live outside the facade', () => {
    assert.ok(/export function assistanceTier/.test(read('src/lib/learnerErrors.js')));
    assert.ok(/export (const|function) evidenceStrength/.test(read('src/lib/learnerErrors.js')));
    assert.ok(!/localStorage/.test(read('src/lib/learnerErrors.js')), 'rules stay storage-free');
  });
});
