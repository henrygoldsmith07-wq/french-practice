// The service worker is part of the privacy boundary: CacheStorage is readable
// by any script on the origin and survives sign-out. Account routes are
// same-origin, so a naive "cache every 200" rule would persist the learner's
// sync code. These tests exercise the real worker handler with a fake self.
import test from 'node:test';
import assert from 'node:assert/strict';

const WORKER = new URL('../public/sw.js', import.meta.url).href;
const ORIGIN = 'https://le-studio.test';

function installWorker({ fetchImpl, cachedResponse = null }) {
  const handlers = {};
  const puts = [];
  const cache = {
    put: async (request, response) => { puts.push({ url: String(request.url || request), response }); },
    keys: async () => [],
  };
  globalThis.self = {
    addEventListener(type, fn) { handlers[type] = fn; },
    location: { origin: ORIGIN },
    skipWaiting() {},
    clients: { claim() {} },
  };
  globalThis.caches = {
    open: async () => cache,
    match: async () => cachedResponse,
    keys: async () => [],
    delete: async () => true,
  };
  globalThis.fetch = fetchImpl;
  return { handlers, puts };
}

function basicResponse(body = 'ok', headers = {}) {
  const response = new Response(body, { status: 200, headers });
  // Node's synthetic Responses are type "default"; a same-origin fetch in a
  // worker is type "basic", which is what the caching branch checks.
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

async function fetchThrough(handlers, request) {
  let pending;
  handlers.fetch({ request, respondWith: (promise) => { pending = promise; } });
  assert.ok(pending, 'the worker must handle a same-origin GET');
  const result = await pending;
  // The copy is cached in a fire-and-forget .then(); let it settle.
  await new Promise((resolve) => setImmediate(resolve));
  return result;
}

test('a private API response is never written to the runtime cache', async () => {
  const { handlers, puts } = installWorker({
    fetchImpl: async () => basicResponse('{"code":"LS1:private-snapshot"}', {
      'cache-control': 'no-store',
      'content-type': 'application/json',
    }),
  });
  await import(`${WORKER}?api-${Date.now()}`);

  const response = await fetchThrough(handlers, new Request(`${ORIGIN}/api/sync`));
  assert.equal(response.status, 200, 'the live response is still returned');
  assert.equal(await response.text(), '{"code":"LS1:private-snapshot"}');
  assert.equal(puts.length, 0, 'no copy of the sync code may be cached');
});

test('a no-store response from any path is not cached', async () => {
  const { handlers, puts } = installWorker({
    fetchImpl: async () => basicResponse('private', { 'cache-control': 'no-store' }),
  });
  await import(`${WORKER}?nostore-${Date.now()}`);

  await fetchThrough(handlers, new Request(`${ORIGIN}/some-private.json`));
  assert.equal(puts.length, 0);
});

test('ordinary app assets are still cached for offline use', async () => {
  const { handlers, puts } = installWorker({ fetchImpl: async () => basicResponse('console.log(1)') });
  await import(`${WORKER}?asset-${Date.now()}`);

  await fetchThrough(handlers, new Request(`${ORIGIN}/assets/index-abc.js`));
  assert.equal(puts.length, 1, 'the offline cache must still fill for real assets');
});

test('an offline API request cannot be answered from a stale cached copy', async () => {
  const stale = basicResponse('LS1:old-snapshot');
  const { handlers } = installWorker({
    fetchImpl: async () => { throw new TypeError('offline'); },
    cachedResponse: stale,
  });
  await import(`${WORKER}?offline-${Date.now()}`);

  const result = await fetchThrough(handlers, new Request(`${ORIGIN}/api/sync`));
  assert.equal(result, undefined, 'a failed API fetch must not serve cached private data');
});
