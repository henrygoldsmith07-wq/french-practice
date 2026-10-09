// Anonymous trial identity for the free, no-key path.
//
// A first-time visitor must be able to reach a real AI-powered session within
// minutes without bringing a key or signing in. That requires the relay to
// issue a *scoped* identity of its own — but a self-asserted client identity is
// worthless for abuse control, so the relay signs it server-side.
//
// Model:
//   - The client asks for a trial token (POST /relay/trial) once per device.
//   - The relay mints a signed JWT whose subject is an opaque device id and
//     whose claims declare tier='trial' and a hard expiry.
//   - Trial requests are authenticated exactly like signed-in ones, but are
//     charged against a SEPARATE, smaller daily quota so an abuser rotating
//     device ids cannot spend the signed-in allowance, and a shared deployment
//     can disable trials outright.
//   - The token is NOT a session: it carries no learner data, and the relay
//     never writes it anywhere. Losing it only costs the learner their trial.
//
// Deliberately NOT included: any notion of "sign in to raise the quota" beyond
// issuing a normal JWT from the operator's own issuer. Joining trial identity
// to the app's Google sign-in is a deployment decision, recorded in docs/.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TRIAL_DAYS = 1;
const TRIAL_EXPIRY_SECONDS = 14 * 24 * 60 * 60; // 14 days — long enough to matter, short enough to expire.

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(algorithm, signingInput, secret) {
  // HS256 only: the trial issuer is the relay itself, so there is no key
  // distribution to get wrong.
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

function equalStrings(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

// The signing secret may arrive as `config.trialSecret` (how the relay passes
// it) or `config.trial.secret` (a nested config shape). Reading both keeps the
// module usable from either call style without silently signing with undefined.
function trialSecretOf(config) {
  const candidate = config?.trialSecret ?? config?.trial?.secret;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

/**
 * Mint a trial token. Returns the compact JWS.
 *
 * @param {object} config  relay config plus `trialSecret` (auth.issuer/audience are read from config.auth)
 * @param {object} options { now, deviceId }
 */
export function issueTrialToken(config, { now = Date.now(), deviceId = null } = {}) {
  const secret = trialSecretOf(config);
  if (!secret) throw new Error('trial_secret_missing');
  const issuedAt = Math.floor(Number(now) / 1000);
  const subject = String(deviceId || randomUUID()).slice(0, 128);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: config.auth.issuer,
    aud: config.auth.audience,
    sub: subject,
    iat: issuedAt,
    exp: issuedAt + TRIAL_EXPIRY_SECONDS,
    tier: 'trial',
    // Single-use scope marker: a trial token can never be mistaken for a
    // signed-in identity downstream.
    scope: 'le-studio-trial',
  }));
  const signingInput = `${header}.${claims}`;
  const signature = sign('HS256', signingInput, secret);
  return { token: `${signingInput}.${signature}`, subject, expiresAt: issuedAt + TRIAL_EXPIRY_SECONDS };
}

/** Verify a token this relay minted. Returns claims or null. */
export function verifyTrialToken(token, config, { now = Date.now(), skewSeconds = 30 } = {}) {
  const secret = trialSecretOf(config);
  if (!secret) return null;
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  const signingInput = `${parts[0]}.${parts[1]}`;
  const expected = sign('HS256', signingInput, secret);
  if (!equalStrings(parts[2], expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || claims.tier !== 'trial' || claims.scope !== 'le-studio-trial') return null;
  const nowSeconds = Math.floor(Number(now) / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds - skewSeconds) return null;
  if (claims.iss !== config.auth.issuer || claims.aud !== config.auth.audience) return null;
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) return null;
  return claims;
}

export const TRIAL_DEFAULTS = Object.freeze({
  // A trial is deliberately small: enough for one honest first session
  // (a diagnostic, a few conversation turns and one report), not enough to
  // run a bot farm. Signed-in users get the operator's normal daily limit.
  dailyLimit: 30,
  rateLimitPerMinute: 6,
  windowDays: TRIAL_DAYS,
});
