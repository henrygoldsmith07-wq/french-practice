import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SITUATIONS, getSituations, getScenario } from '../src/lib/data.js';

test('four everyday situations lead Speak: cafe, school, directions, home', () => {
  assert.deepEqual(SITUATIONS.map((s) => s.id), ['cafe', 'ecole', 'directions', 'maison']);
  const resolved = getSituations();
  assert.equal(resolved.length, 4);
  for (const sit of resolved) {
    assert.ok(sit.scenario, `${sit.id} resolves to a scenario`);
    assert.ok(sit.scenario.opener && sit.scenario.openerTranslation, `${sit.id} speaks French first`);
    assert.ok(sit.scenario.curveball, `${sit.id} has a curveball`);
    assert.ok(Array.isArray(sit.scenario.staticHints) && sit.scenario.staticHints.length >= 3, `${sit.id} has hints`);
  }
});

test('directions, home and school scenarios exist with full fields', () => {
  for (const id of ['directions', 'maison', 'ecole']) {
    const s = getScenario(id);
    assert.equal(s.id, id);
    for (const field of ['title', 'setup', 'aiRole', 'opener', 'openerTranslation', 'curveball']) {
      assert.ok(typeof s[field] === 'string' && s[field].length > 0, `${id}.${field}`);
    }
  }
});
