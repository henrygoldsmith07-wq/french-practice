// The browser relay client promised a one-shot token refresh on 401 but never
// did it. These pin the retry: exactly once for a trial identity, never for a
// host-supplied identity, and never on other failures.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
};

const { withRelay } = await import('../src/lib/relay.js');

function response(status, body) {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

function relay({ statuses, tokens = ['old', 'fresh'], auth = null }) {
  const seen = [];
  const fetchImpl = async (_url, options) => {
    seen.push(options.headers.Authorization);
    return response(statuses[seen.length - 1], statuses[seen.length - 1] === 200
      ? '{"ok":true}'
      : '{"error":"unauthorized"}');
  };
  return { seen, fetchImpl, getToken: async () => tokens.shift() || 'fresh', auth };
}

async function call(setup, overrides = {}) {
  delete globalThis.__LE_STUDIO_AUTH_TOKEN__;
  if (setup.auth) globalThis.__LE_STUDIO_AUTH_TOKEN__ = setup.auth;
  try {
    return await withRelay({
      label: 'chat',
      body: { messages: [] },
      relayUrl: 'https://relay.test',
      direct: () => { throw new Error('should not fall back'); },
      fetchImpl: setup.fetchImpl,
      getToken: setup.getToken,
      ...overrides,
    });
  } finally {
    delete globalThis.__LE_STUDIO_AUTH_TOKEN__;
  }
}

test('a rejected trial token is refreshed once and the call succeeds', async () => {
  const setup = relay({ statuses: [401, 200] });
  const result = await call(setup);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(setup.seen, ['Bearer old', 'Bearer fresh']);
});

test('a credential that keeps failing is retried once, not forever', async () => {
  const setup = relay({ statuses: [401, 401] });
  await assert.rejects(call(setup), /Relay rejected your session \(401\)/);
  assert.equal(setup.seen.length, 2, 'no retry loop on a rejected credential');
});

test('a host-supplied identity is never refreshed', async () => {
  const setup = relay({ statuses: [401], auth: 'host-token' });
  await assert.rejects(call(setup), /Relay rejected your session \(401\)/);
  assert.deepEqual(setup.seen, ['Bearer host-token'], 'no trial token was minted');
});

test('rate limiting is reported without minting a new token', async () => {
  const setup = relay({ statuses: [429] });
  await assert.rejects(call(setup), /Rate limited by your relay \(429\)/);
  assert.deepEqual(setup.seen, ['Bearer old']);
});
