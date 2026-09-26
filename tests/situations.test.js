import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { SITUATIONS, getSituations, getScenario, getScenariosAsync } from '../src/lib/data.js';

// Browser fetch handles Vite-emitted scenario assets. Node fetch does not read
// file: URLs, so expose the same transport only inside this test process.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input : new URL(input);
  if (url.protocol === 'file:') {
    const body = await readFile(url, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  }
  return nativeFetch(input, init);
};

// The scenario corpus (FR included) is a per-language registry chunk now, so
// every situation assertion resolves the registry first.
test('four everyday situations lead Speak: cafe, school, directions, home', async () => {
  assert.deepEqual(SITUATIONS.map((s) => s.id), ['cafe', 'ecole', 'directions', 'maison']);
  assert.ok((await getScenariosAsync()).length > 0, 'registry resolves');
  const resolved = getSituations();
  assert.equal(resolved.length, 4);
  for (const sit of resolved) {
    assert.ok(sit.scenario, `${sit.id} resolves to a scenario`);
    assert.ok(sit.scenario.opener && sit.scenario.openerTranslation, `${sit.id} speaks French first`);
    assert.ok(sit.scenario.curveball, `${sit.id} has a curveball`);
    assert.ok(Array.isArray(sit.scenario.staticHints) && sit.scenario.staticHints.length >= 3, `${sit.id} has hints`);
  }
});

test('directions, home and school scenarios exist with full fields', async () => {
  await getScenariosAsync();
  for (const id of ['directions', 'maison', 'ecole']) {
    const s = getScenario(id);
    assert.equal(s.id, id);
    for (const field of ['title', 'setup', 'aiRole', 'opener', 'openerTranslation', 'curveball']) {
      assert.ok(typeof s[field] === 'string' && s[field].length > 0, `${id}.${field}`);
    }
  }
});
