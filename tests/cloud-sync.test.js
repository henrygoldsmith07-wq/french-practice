import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

let importId = 0;
async function loadClient() {
  globalThis.localStorage = memoryStorage();
  importId += 1;
  return import(`../src/lib/cloudAccount.js?sync-${importId}`);
}

test('cloud push performs one atomic write request — never a racy GET-then-PUT', async () => {
  const { push } = await loadClient();
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      status: 200,
      ok: true,
      json: async () => ({ updated_at: '2026-09-26T06:00:00.000Z' }),
    };
  };

  const expected = '2026-09-25T18:30:00.000Z';
  const result = await push('', expected);

  assert.equal(result.status, 'ok');
  assert.equal(calls.length, 1, 'conflict detection must not use a preflight GET');
  assert.equal(calls[0].url, '/api/sync');
  assert.equal(calls[0].options.method, 'PUT');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.expectedUpdatedAt, expected);
  assert.equal(body.force, false);
  assert.match(body.payload.code, /^LS1:/);
});

test('cloud push surfaces server compare-and-swap conflicts without overwriting', async () => {
  const { push } = await loadClient();
  const newer = '2026-09-26T06:10:00.000Z';
  globalThis.fetch = async () => ({
    status: 409,
    ok: false,
    json: async () => ({ error: 'Sync conflict', updated_at: newer }),
  });

  const result = await push('', '2026-09-25T18:30:00.000Z');
  assert.deepEqual(result, { status: 'conflict', remoteUpdatedAt: newer });
});

test('force overwrite is explicit in the write request', async () => {
  const { push } = await loadClient();
  let body;
  globalThis.fetch = async (_url, options = {}) => {
    body = JSON.parse(options.body);
    return { status: 200, ok: true, json: async () => ({ updated_at: '2026-09-26T06:20:00.000Z' }) };
  };

  const result = await push('', '2026-09-25T18:30:00.000Z', true);
  assert.equal(result.status, 'ok');
  assert.equal(body.force, true);
});

test('network failure leaves local-first practice usable and reports a safe error', async () => {
  const { push } = await loadClient();
  globalThis.fetch = async () => { throw new Error('offline'); };
  const result = await push('', null);
  assert.equal(result.status, 'error');
  assert.match(result.message, /local progress is unchanged/i);
});

test('server sync contract enforces compare-and-swap in the database statement', () => {
  const db = readFileSync(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../api/sync.js', import.meta.url), 'utf8');

  assert.match(db, /user_state\.updated_at = \$4::timestamptz/, 'stale updates must be rejected by the write itself');
  assert.match(db, /return rows\[0\] \?\? null/, 'a failed precondition must be observable by the route');
  assert.match(route, /return json\(res, 409/, 'stale writes must be surfaced as a conflict');
  assert.match(route, /expectedUpdatedAt/);
});
