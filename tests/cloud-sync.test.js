import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

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
  globalThis.localStorage.setItem('fp.xp', JSON.stringify(123));
  const before = globalThis.localStorage.getItem('fp.lastBackup');
  globalThis.fetch = async () => { throw new Error('offline'); };
  const result = await push('', null);
  assert.equal(result.status, 'error');
  assert.match(result.message, /local progress is unchanged/i);
  assert.equal(globalThis.localStorage.getItem('fp.xp'), JSON.stringify(123));
  assert.equal(globalThis.localStorage.getItem('fp.lastBackup'), before, 'failed cloud push must not claim a successful backup');
});

test('successful push marks backup only after a valid server acknowledgement', async () => {
  const { push } = await loadClient();
  assert.equal(globalThis.localStorage.getItem('fp.lastBackup'), null);
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ updated_at: '2026-09-26T08:00:00.000Z' }),
  });
  const result = await push('', null);
  assert.equal(result.status, 'ok');
  assert.ok(globalThis.localStorage.getItem('fp.lastBackup'));
});

test('malformed successful response is rejected and does not mark a backup', async () => {
  const { push } = await loadClient();
  globalThis.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => { throw new Error('bad json'); },
  });
  const result = await push('', null);
  assert.equal(result.status, 'error');
  assert.match(result.message, /invalid response/i);
  assert.equal(globalThis.localStorage.getItem('fp.lastBackup'), null);
});

test('remote deletion between reads surfaces as a conflict with no remote timestamp', async () => {
  const { push } = await loadClient();
  globalThis.fetch = async () => ({ status: 409, ok: false, json: async () => ({ error: 'Sync conflict', updated_at: null }) });
  const result = await push('', '2026-09-26T07:00:00.000Z');
  assert.deepEqual(result, { status: 'conflict', remoteUpdatedAt: null });
});

test('offline pull and malformed remote state leave local learner data untouched', async () => {
  const { pull } = await loadClient();
  globalThis.localStorage.setItem('fp.xp', JSON.stringify(77));
  globalThis.fetch = async () => { throw new Error('offline'); };
  let result = await pull('');
  assert.equal(result.status, 'error');
  assert.equal(globalThis.localStorage.getItem('fp.xp'), JSON.stringify(77));

  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ state: { payload: {} } }) });
  result = await pull('');
  assert.equal(result.status, 'error');
  assert.match(result.message, /malformed/i);
  assert.equal(globalThis.localStorage.getItem('fp.xp'), JSON.stringify(77));
});

test('corrupt remote LS1 and wrong encrypted passphrase never replace local state', async () => {
  const { pull } = await loadClient();
  globalThis.localStorage.setItem('fp.xp', JSON.stringify(55));
  globalThis.fetch = async () => ({
    status: 200, ok: true,
    json: async () => ({ state: { payload: { code: 'LS1:not-valid-base64' }, updated_at: '2026-09-26T08:00:00.000Z' } }),
  });
  let result = await pull('');
  assert.equal(result.status, 'error');
  assert.equal(globalThis.localStorage.getItem('fp.xp'), JSON.stringify(55));

  const account = await import(`../src/lib/account.js?sync-pass-${++importId}`);
  const encrypted = await account.makeSyncCode('correct horse battery staple');
  // Snapshot generation may update backup metadata, but learner progress stays
  // the same; from this point the failed pull must mutate nothing.
  const xpBefore = globalThis.localStorage.getItem('fp.xp');
  globalThis.fetch = async () => ({
    status: 200, ok: true,
    json: async () => ({ state: { payload: { code: encrypted }, updated_at: '2026-09-26T08:05:00.000Z' } }),
  });
  result = await pull('wrong passphrase');
  assert.equal(result.status, 'error');
  assert.match(result.message, /wrong passphrase|altered/i);
  assert.equal(globalThis.localStorage.getItem('fp.xp'), xpBefore);
});

test('encrypted and unencrypted pushes advertise the real client-side protection state', async () => {
  const { push } = await loadClient();
  const bodies = [];
  globalThis.fetch = async (_url, options = {}) => {
    bodies.push(JSON.parse(options.body));
    return { status: 200, ok: true, json: async () => ({ updated_at: new Date().toISOString() }) };
  };
  const plain = await push('', null);
  const encrypted = await push('secret', null, true);
  assert.equal(plain.encrypted, false);
  assert.equal(encrypted.encrypted, true);
  const account = await import(`../src/lib/account.js?sync-enc-${++importId}`);
  assert.equal(account.isEncryptedCode(bodies[0].payload.code), false);
  assert.equal(account.isEncryptedCode(bodies[1].payload.code), true);
});

test('server outages, expired sessions and offline delete degrade without touching local progress', async () => {
  const { pull, deleteRemote } = await loadClient();
  globalThis.localStorage.setItem('fp.xp', JSON.stringify(88));
  globalThis.fetch = async () => ({ status: 503, ok: false, json: async () => ({ error: 'db down' }) });
  assert.equal((await pull('')).status, 'unavailable');
  assert.equal(globalThis.localStorage.getItem('fp.xp'), JSON.stringify(88));

  globalThis.fetch = async () => ({ status: 401, ok: false, json: async () => ({ error: 'expired' }) });
  assert.equal((await pull('')).status, 'signed-out');
  assert.equal((await deleteRemote()).status, 'signed-out');
  assert.equal(globalThis.localStorage.getItem('fp.xp'), JSON.stringify(88));

  globalThis.fetch = async () => { throw new Error('offline'); };
  const deleted = await deleteRemote();
  assert.equal(deleted.status, 'error');
  assert.match(deleted.message, /keeps its progress/i);
  assert.equal(globalThis.localStorage.getItem('fp.xp'), JSON.stringify(88));
});

test('oversized cloud snapshot is rejected before network I/O and does not mark backup', async () => {
  const { push } = await loadClient();
  // Base64 expansion pushes a ~3.2 MB learner payload above the 4 MB request
  // ceiling. The client should fail locally rather than waste bandwidth or
  // depend on a deployment-specific 413 response.
  globalThis.localStorage.setItem('fp.notebook', JSON.stringify([{ id: 'huge', note: 'x'.repeat(3_200_000) }]));
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    return { status: 200, ok: true, json: async () => ({ updated_at: new Date().toISOString() }) };
  };
  const result = await push('', null);
  assert.equal(result.status, 'error');
  assert.match(result.message, /too large/i);
  assert.equal(fetches, 0, 'oversized payload is rejected before fetch');
  assert.equal(globalThis.localStorage.getItem('fp.lastBackup'), null);
});

test('server sync contract enforces compare-and-swap in the database statement', () => {
  const db = readFileSync(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../api/sync.js', import.meta.url), 'utf8');

  assert.match(db, /user_state\.updated_at = \$4::timestamptz/, 'stale updates must be rejected by the write itself');
  assert.match(db, /return rows\[0\] \?\? null/, 'a failed precondition must be observable by the route');
  assert.match(route, /return json\(res, 409/, 'stale writes must be surfaced as a conflict');
  assert.match(route, /expectedUpdatedAt/);
});
