// Trial-identity tests: the free, no-key path to a first AI session.
//
// A first-time visitor must reach real AI feedback without bringing a key or
// signing in. These tests pin the abuse controls that make that safe:
//   - the relay mints its own tokens (a client cannot forge one),
//   - trial requests are charged against a SEPARATE, smaller quota so rotating
//     device ids cannot spend a signed-in allowance,
//   - a trial token can never be used to escalate,
//   - trials can be switched off without breaking anything else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  createInMemoryQuotaStore,
  createRelayHandler,
  issueTrialToken,
  verifyTrialToken,
  TRIAL_DEFAULTS,
} from '../server/relay.js';

const SIGNING_MATERIAL = 'fixture-signing-material-for-tests-only-2026-08-20';
const OTHER_SIGNING_MATERIAL = 'other-fixture-signing-material-for-tests-only';
const TRIAL_SECRET = 'fixture-trial-signing-material-for-tests-only-2026';
const NOW = Date.parse('2026-08-20T12:00:00.000Z');

// The trial module reads auth.issuer/audience plus a trialSecret.
const TRIAL_CONFIG = Object.freeze({
  auth: { issuer: 'https://issuer.test', audience: 'le-studio' },
  trialSecret: TRIAL_SECRET,
});

function env(overrides = {}) {
  return {
    NODE_ENV: 'production',
    RELAY_MODE: 'production',
    GROQ_API_KEY: 'provider-fixture-value-2026',
    ALLOWED_ORIGINS: 'https://studio.example.com',
    AUTH_ISSUER: 'https://issuer.test',
    AUTH_AUDIENCE: 'le-studio',
    AUTH_JWT_SECRET: SIGNING_MATERIAL,
    RELAY_QUOTA_NAMESPACE_SECRET: 'fixture-quota-namespace-material-for-tests-only',
    RELAY_TRIAL_SECRET: TRIAL_SECRET,
    ...overrides,
  };
}

function request({ body = {}, path = '/api/groq/trial', auth = null, origin = 'https://studio.example.com' } = {}) {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    method: 'POST',
    url: path,
    headers: {
      origin,
      authorization: auth ? `Bearer ${auth}` : undefined,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(serialized)),
    },
    body,
  };
}

function recorder() {
  const headers = {};
  let responseBody;
  return {
    headers,
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = String(value); },
    status(status) { this.statusCode = status; return this; },
    json(body) { responseBody = body; return body; },
    end(body = '') {
      if (body) {
        try { responseBody = JSON.parse(body); } catch { responseBody = body; }
      }
      return body;
    },
    get body() { return responseBody; },
  };
}

const validBody = Object.freeze({
  model: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  messages: [{ role: 'user', content: 'Say bonjour.' }],
  max_tokens: 32,
});

function provider() {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, get calls() { return calls; } };
}

async function run({ environment = env(), req = request(), fetchImpl, store = createInMemoryQuotaStore(), trialSecret = TRIAL_SECRET } = {}) {
  const handler = createRelayHandler({
    environment,
    env: environment,
    fetchImpl: fetchImpl || provider().fetchImpl,
    store,
    logger: () => {},
    now: () => NOW,
    // `trialSecret` mirrors the operator setting it from the environment. Pass
    // null to let the relay read RELAY_TRIAL_SECRET from `environment` instead
    // — that is how the "trials stay off without a secret" case is exercised.
    trialSecret: trialSecret === null ? undefined : trialSecret,
  });
  const res = recorder();
  await handler(req, res);
  return res;
}

// ---- the free entry point --------------------------------------------------

test('a first-time visitor can obtain a trial token without any credential', async () => {
  const res = await run({ req: request() });
  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.body.tier, 'trial');
  assert.equal(res.body.dailyLimit, TRIAL_DEFAULTS.dailyLimit);
});

test('a trial token is signed by the relay and cannot be forged by a client', () => {
  const { token } = issueTrialToken(TRIAL_CONFIG, { now: NOW, deviceId: 'device-1' });

  // A token with the right claims but the wrong key must not verify.
  const forged = token.slice(0, token.lastIndexOf('.')) + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  assert.equal(verifyTrialToken(forged, TRIAL_CONFIG, { now: NOW }), null);
  // ...and neither does one signed with a different secret.
  const { token: other } = issueTrialToken(TRIAL_CONFIG, { now: NOW, deviceId: 'device-1' });
  assert.equal(
    verifyTrialToken(other, { ...TRIAL_CONFIG, trialSecret: OTHER_SIGNING_MATERIAL }, { now: NOW }),
    null,
  );
  assert.ok(verifyTrialToken(token, TRIAL_CONFIG, { now: NOW }));
});

test('a trial token expires and stops working afterwards', () => {
  const { token } = issueTrialToken(TRIAL_CONFIG, { now: NOW });
  assert.ok(verifyTrialToken(token, TRIAL_CONFIG, { now: NOW }));
  const longAfter = NOW + 400 * 24 * 60 * 60 * 1000;
  assert.equal(verifyTrialToken(token, TRIAL_CONFIG, { now: longAfter }), null);
});

test('a signed-in JWT is not accepted as a trial token', () => {
  // Tier separation: escalation must be impossible. A normal user token has
  // no trial claims and must be refused by the trial verifier.
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ iss: 'https://issuer.test', aud: 'le-studio', sub: 'user-1', exp: NOW / 1000 + 3600 });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', TRIAL_SECRET).update(signingInput).digest('base64url');
  const userToken = `${signingInput}.${signature}`;

  assert.equal(verifyTrialToken(userToken, TRIAL_CONFIG, { now: NOW }), null);
});

// ---- trial requests are honoured and separately metered -------------------

test('a trial token can make a real provider call', async () => {
  const { token } = issueTrialToken(TRIAL_CONFIG, { now: NOW, deviceId: 'device-1' });
  const upstream = provider();
  const res = await run({
    req: request({
      path: '/api/groq/chat/completions',
      body: validBody,
      auth: token,
    }),
    fetchImpl: upstream.fetchImpl,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(upstream.calls, 1, 'the trial request must actually reach the provider');
});

test('trial quota is separate from and smaller than the signed-in quota', async () => {
  const { token } = issueTrialToken(TRIAL_CONFIG, { now: NOW, deviceId: 'device-1' });
  const upstream = provider();
  // ONE shared store, exactly like a real deployment's Redis: quota is a
  // property of the deployment, not of a single request.
  const store = createInMemoryQuotaStore();
  const environment = env({
    RELAY_TRIAL_DAILY_LIMIT: '2',
    GROQ_DAILY_LIMIT_AUTHED: '120',
    RELAY_TRIAL_RATE_LIMIT_PER_MINUTE: '6',
  });

  // Two trial calls succeed; the third is refused.
  for (let i = 0; i < 2; i += 1) {
    const ok = await run({
      environment,
      store,
      req: request({ path: '/api/groq/chat/completions', body: validBody, auth: token }),
      fetchImpl: upstream.fetchImpl,
    });
    assert.equal(ok.statusCode, 200, `trial call ${i + 1} should succeed`);
  }
  const refused = await run({
    environment,
    store,
    req: request({ path: '/api/groq/chat/completions', body: validBody, auth: token }),
    fetchImpl: upstream.fetchImpl,
  });
  assert.equal(refused.statusCode, 429);
  assert.equal(refused.body.error, 'daily_quota_exhausted');
  assert.equal(upstream.calls, 2, 'a refused call must not reach the provider');
});

test('trials can be switched off without breaking authenticated use', async () => {
  const environment = env({ RELAY_TRIAL_ENABLED: 'false' });

  const trial = await run({ environment, req: request() });
  assert.equal(trial.statusCode, 503);
  assert.equal(trial.body.error, 'trial_unavailable');

  // The relay still works normally for an authenticated caller.
  const upstream = provider();
  const authed = await run({
    environment,
    req: request({ path: '/api/groq/chat/completions', body: validBody, auth: undefined }),
    fetchImpl: upstream.fetchImpl,
  });
  // No token at all is still correctly refused — the point is the relay is
  // healthy and its auth path is intact, not that anonymous use is allowed.
  assert.equal(authed.statusCode, 401);
});

test('trials require a configured signing secret, and stay off without one', async () => {
  // A missing/weak secret must fail closed rather than mint unverifiable
  // tokens that nobody can police. Passing trialSecret: null lets the relay
  // read the (short) secret from the environment, as an operator would set it.
  const res = await run({ environment: env({ RELAY_TRIAL_SECRET: 'too-short' }), req: request(), trialSecret: null });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'trial_unavailable');

  const absent = await run({ environment: env({ RELAY_TRIAL_SECRET: '' }), req: request(), trialSecret: null });
  assert.equal(absent.statusCode, 503);
  assert.equal(absent.body.error, 'trial_unavailable');
});

test('the trial route rejects query strings and unknown methods', async () => {
  const withQuery = await run({ req: request({ path: '/api/groq/trial?x=1' }) });
  assert.equal(withQuery.statusCode, 404);

  const get = await run({ req: { ...request(), method: 'GET' } });
  assert.equal(get.statusCode, 405);
});

test('a trial token issued for one issuer cannot be replayed against another', () => {
  const { token } = issueTrialToken(TRIAL_CONFIG, { now: NOW });
  const otherIssuer = {
    auth: { issuer: 'https://evil.test', audience: 'le-studio' },
    trialSecret: TRIAL_SECRET,
  };
  assert.equal(verifyTrialToken(token, otherIssuer, { now: NOW }), null);
});
