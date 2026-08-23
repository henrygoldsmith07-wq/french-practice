import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARDS, QUALIFICATION_VERSIONS, TIER, boardList, getBoard, resolveBoard,
  resolveWjecGcse, specCaveat, timingQa,
} from '../src/lib/exams/boards.js';

describe('WJEC GCSE qualification versions', () => {
  it('exposes two explicit versions — no generic wjec-gcse', () => {
    const v = QUALIFICATION_VERSIONS['wjec-gcse'];
    assert.equal(v.length, 2);
    const codes = v.map((x) => x.qualCode).sort();
    assert.deepEqual(codes, ['3800QS', '3830QS']);
  });

  it('legacy 3800QS: final full assessment Summer 2026, Jan 2027 resit window', () => {
    const legacy = getBoard('wjec-gcse-3800');
    assert.equal(legacy.version, '3800-2016');
    assert.equal(legacy.finalFullAssessment, '2026-summer');
    assert.match(legacy.resitWindow, /2027-january/);
    assert.ok(getBoard('wjec-gcse-3800').tasks.length >= 3);
  });

  it('Made for Wales 3830QS: effectiveFrom 2025-09, first assessment Summer 2027', () => {
    const mfw = getBoard('wjec-gcse-3830');
    assert.equal(mfw.qualCode, '3830QS');
    assert.equal(mfw.version, '3830-2025');
    assert.equal(mfw.effectiveFrom, '2025-09');
    assert.equal(mfw.firstAssessment, '2027-summer');
    assert.equal(mfw.sourceRevision, '2026-03');
    assert.ok(mfw.verifiedAt);
  });

  it('3830QS uses the three Made-for-Wales broad areas as themes', () => {
    const themes = getBoard('wjec-gcse-3830').themes;
    assert.deepEqual(themes, [
      'Language for leisure and wellbeing',
      'Language for travel',
      'Language for study and work',
    ]);
  });

  it('3830QS carries the verified four-unit structure and amendment note', () => {
    const mfw = getBoard('wjec-gcse-3830');
    assert.equal(mfw.units.length, 4);
    assert.equal(mfw.units[0].title, 'Oracy');
    assert.equal(mfw.speakingWeight, 0.30);
    const weightSum = mfw.units.reduce((s, u) => s + u.weighting, 0);
    assert.ok(Math.abs(weightSum - 1) < 1e-9);
    assert.match(mfw.amendments.summary, /Appendix A/);
    assert.equal(mfw.amendments.assessableFrom, '2028-summer');
  });

  it('back-compat: wjec-gcse alias resolves to the legacy qualification', () => {
    const viaAlias = getBoard('wjec-gcse');
    assert.equal(viaAlias.aliasFor, 'wjec-gcse-3800');
    assert.deepEqual(viaAlias.themes, getBoard('wjec-gcse-3800').themes);
    // Alias is hidden from the picker but keeps every field consumers rely on.
    assert.ok(!boardList().some((b) => b.aliasOnly));
    assert.equal(viaAlias.tasks.length, BOARDS['wjec-gcse-3800'].tasks.length);
  });
});

describe('resolveWjecGcse cohort logic', () => {
  it('summer 2024–2026 sittings → legacy 3800QS', () => {
    for (const y of [2024, 2025, 2026]) {
      assert.equal(resolveWjecGcse({ examYear: y }).qualCode, '3800QS', `year ${y}`);
    }
  });

  it('summer 2027+ → Made for Wales 3830QS', () => {
    for (const y of [2027, 2028, 2030]) {
      assert.equal(resolveWjecGcse({ examYear: y }).qualCode, '3830QS', `year ${y}`);
    }
  });

  it('January 2027 is a legacy-only resit; no January series afterwards', () => {
    assert.equal(resolveWjecGcse({ examYear: 2027, sitting: 'january' }).qualCode, '3800QS');
    assert.equal(resolveWjecGcse({ examYear: 2028, sitting: 'january' }).qualCode, '3800QS');
  });

  it('defaults to the next summer series from today (post-August rolls forward)', () => {
    const now = new Date();
    const expectedYear = now.getMonth() + 1 >= 8 ? now.getFullYear() + 1 : now.getFullYear();
    const expected = expectedYear <= 2026 ? '3800QS' : '3830QS';
    assert.equal(resolveWjecGcse().qualCode, expected);
  });

  it('resolveBoard routes WJEC GCSE ids through the resolver and passes others through', () => {
    assert.equal(resolveBoard('wjec-gcse', { examYear: 2027 }).qualCode, '3830QS');
    assert.equal(resolveBoard('aqa-gcse').id, 'aqa-gcse');
  });
});

describe('simulator compatibility across both versions', () => {
  it('timingQa passes for both WJEC qualifications', () => {
    for (const id of ['wjec-gcse-3800', 'wjec-gcse-3830']) {
      const qa = timingQa(id);
      assert.equal(qa.ok, true, `${id}: ${qa.issues.join('; ')}`);
    }
  });

  it('3830QS provisional Unit-1 mark split sums to the 60 Oracy marks', () => {
    const mfw = getBoard('wjec-gcse-3830');
    const total = mfw.tasks.reduce((s, t) => s + t.marks.default, 0);
    assert.equal(total, 60);
    assert.ok(mfw.tasks.every((t) => t.provisionalSplit), 'splits must be flagged provisional');
  });

  it('speaking task targets fit inside the published 7–10 minute window', () => {
    const mfw = getBoard('wjec-gcse-3830');
    const sum = mfw.tasks.reduce((s, t) => s + t.target.default, 0);
    assert.ok(sum >= 7 * 60 && sum <= 10 * 60, `sum=${sum}s`);
  });

  it('specCaveat names the qualification code and version', () => {
    const c = specCaveat('wjec-gcse-3830');
    assert.match(c, /3830QS/);
    assert.match(c, /3830-2025/);
  });
});
