import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOARDS, boardList, resolveWjecGcse, resolveBoard, specCaveat, timingQa, targetSeconds, TIER,
} from '../src/lib/exams/boards.js';
import { buildPaper } from '../src/lib/exams/simulator.js';
import { WJEC_3830_THEME_MAP } from '../src/lib/exams/tasks.js';

test('the resolver routes sittings to the correct qualification version', () => {
  assert.equal(resolveWjecGcse({ examYear: 2025, sitting: 'summer' }).id, 'wjec-gcse-3800');
  assert.equal(resolveWjecGcse({ examYear: 2026, sitting: 'summer' }).id, 'wjec-gcse-3800');
  // Final full assessment for 3800QS was Summer 2026; January 2027 is a
  // legacy-only resit where offered.
  assert.equal(resolveWjecGcse({ examYear: 2027, sitting: 'january' }).id, 'wjec-gcse-3800');
  // Made for Wales first assessment: Summer 2027.
  assert.equal(resolveWjecGcse({ examYear: 2027, sitting: 'summer' }).id, 'wjec-gcse-3830');
  assert.equal(resolveWjecGcse({ examYear: 2030, sitting: 'summer' }).id, 'wjec-gcse-3830');
  // No year given: the next summer series (August rolls forward).
  assert.equal(resolveWjecGcse().id, 'wjec-gcse-3830');
});

test('the generic wjec-gcse id is an explicit alias for the legacy 3800QS', () => {
  assert.equal(BOARDS['wjec-gcse'].aliasOnly, true);
  assert.equal(BOARDS['wjec-gcse'].qualCode, '3800QS');
  assert.ok(!boardList().some((b) => b.id === 'wjec-gcse'));
  assert.equal(resolveBoard('wjec-gcse', { examYear: 2026 }).qualCode, '3800QS');
  assert.equal(resolveBoard('wjec-gcse-3830', { examYear: 2027 }).qualCode, '3830QS');
});

test('3830QS carries the full versioned data model', () => {
  const b = BOARDS['wjec-gcse-3830'];
  assert.equal(b.version, '3830-2025');
  assert.equal(b.effectiveFrom, '2025-09');
  assert.equal(b.firstAssessment, '2027-summer');
  assert.equal(b.sourceRevision, '2026-03');
  assert.ok(b.verifiedAt);
  assert.equal(b.supersededBy, null);
  // Untiered, three broad areas, amendments recorded.
  assert.deepEqual(b.tiers, []);
  assert.deepEqual(b.themes, [
    'Language for leisure and wellbeing',
    'Language for travel',
    'Language for study and work',
  ]);
  assert.ok(b.amendments?.assessableFrom);
  // Legacy carries its retirement dates instead.
  const legacy = BOARDS['wjec-gcse-3800'];
  assert.equal(legacy.finalFullAssessment, '2026-summer');
  assert.equal(legacy.supersededBy, 'wjec-gcse-3830');
});

test('a Made-for-Wales speaking paper builds all three oracy tasks', () => {
  const paper = buildPaper({ boardId: 'wjec-gcse-3830', mode: 'full', examMode: 'speaking' });
  assert.deepEqual(paper.sections.map((s) => s.taskId), [
    'read-aloud-roleplay',
    'presentation-discussion',
    'conversation',
  ]);
  assert.equal(paper.totalMarks, 60); // 3 × 20, provisional split
  assert.equal(paper.tier, null); // untiered
  assert.match(paper.caveat, /3830QS/);
  for (const section of paper.sections) {
    assert.ok(section.material, `${section.taskId} must carry material`);
    assert.ok(section.seconds > 0);
  }
});

test('3830QS themes select related legacy bank material', () => {
  const related = WJEC_3830_THEME_MAP['Language for travel'];
  assert.ok(related.includes('Travel and tourism'));
  const paper = buildPaper({
    boardId: 'wjec-gcse-3830',
    mode: 'single',
    examMode: 'speaking',
    taskId: 'presentation-discussion',
    theme: 'Language for travel',
  });
  const material = paper.sections[0].material;
  assert.ok(related.includes(material.theme), `expected a travel-related theme, got ${material.theme}`);
});

test('legacy 3800QS papers keep their tiered structure', () => {
  const paper = buildPaper({ boardId: 'wjec-gcse-3800', tier: TIER.HIGHER, mode: 'full', examMode: 'speaking' });
  assert.deepEqual(paper.sections.map((s) => s.taskId), ['roleplay', 'photocard', 'conversation']);
  assert.equal(paper.tier, TIER.HIGHER);
  assert.equal(targetSeconds('wjec-gcse-3800', 'roleplay', TIER.HIGHER), 120);
  assert.equal(targetSeconds('wjec-gcse-3800', 'roleplay', TIER.FOUNDATION), 90);
});

test('non-speaking 3830QS papers draw from the shared WJEC bank', () => {
  for (const mode of ['listening', 'reading', 'writing']) {
    const paper = buildPaper({ boardId: 'wjec-gcse-3830', mode: 'single', examMode: mode });
    assert.equal(paper.sections.length, 1, mode);
    assert.ok(paper.sections[0].material, `${mode} must carry material`);
  }
});

test('timing QA passes for both qualification versions', () => {
  for (const id of ['wjec-gcse-3800', 'wjec-gcse-3830']) {
    const qa = timingQa(id);
    assert.equal(qa.ok, true, `${id}: ${qa.issues.join('; ')}`);
    assert.match(specCaveat(id), new RegExp(id === 'wjec-gcse-3830' ? '3830QS' : '3800QS'));
  }
});
