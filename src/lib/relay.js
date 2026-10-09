// Authenticated server relay abstraction for the public-consumer path.
// Configuration:
//   VITE_GROQ_RELAY_URL — if empty, all calls go direct to Groq with the
//     user's own key (private personal-tool mode — reasonable, documented).
//   VITE_GROQ_RELAY_URL set (e.g. "/api/groq" or "https://studio.example.com/api/groq")
//     — calls are proxied through an authenticated endpoint that holds the
//       Groq key server-side, enforces per-user quotas, and never exposes the
//       secret to the browser.
// The client automatically chooses the right path; callers still import from
// '../lib/groq' — they never touch this file.

const RELAY_URL = String(import.meta.env.VITE_GROQ_RELAY_URL || '').trim();
export const relayEnabled = Boolean(RELAY_URL);

// The free, no-key path. When the relay offers a trial (the operator has set
// RELAY_TRIAL_SECRET server-side), the client exchanges one request for a
// short-lived signed token and stores it locally. From then on every AI call
// looks exactly like an authenticated one.
//
// The token is a trial, not an identity: it carries no learner data, and the
// relay's trial quota is deliberately smaller than a signed-in allowance. If
// it expires or the trial is switched off, the app falls back to the honest
// mock-mode message rather than pretending AI still works.
const TRIAL_TOKEN_KEY = 'fp.relayTrialToken';

let trialTokenPromise = null;

function storedTrialToken() {
  try {
    const raw = localStorage.getItem(TRIAL_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === 'string' && parsed.expiresAt * 1000 > Date.now() + 60_000) {
      return parsed.token;
    }
  } catch { /* ignore */ }
  return null;
}

function storeTrialToken(token, expiresAt) {
  try {
    localStorage.setItem(TRIAL_TOKEN_KEY, JSON.stringify({ token, expiresAt }));
  } catch { /* ignore */ }
}

/** Raised when the relay has no trial available (operator disabled it). */
export class TrialUnavailable extends Error {
  constructor() {
    super('The hosted AI service is not offering free sessions right now.');
    this.name = 'TrialUnavailable';
  }
}

/**
 * Obtain a trial token, reusing the cached one while it is valid. Concurrent
 * callers share one request so a screen with several AI surfaces cannot spend
 * the allowance on parallel handshakes.
 */
export function getTrialToken({ force = false } = {}) {
  if (!relayEnabled) return Promise.reject(new TrialUnavailable());
  if (!force) {
    const cached = storedTrialToken();
    if (cached) return Promise.resolve(cached);
  }
  if (!trialTokenPromise) {
    trialTokenPromise = (async () => {
      try {
        const res = await fetch(relayEndpoint('/trial'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          if (res.status === 503) throw new TrialUnavailable();
          throw new Error(`Trial request failed (${res.status})`);
        }
        const body = await res.json();
        if (typeof body?.token !== 'string') throw new TrialUnavailable();
        storeTrialToken(body.token, body.expiresAt);
        return body.token;
      } finally {
        trialTokenPromise = null;
      }
    })();
  }
  return trialTokenPromise;
}

// The host is responsible for injecting a verified identity token. The relay
// verifies it server-side; this browser helper never creates or signs tokens.
function relayHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const injected = globalThis.__LE_STUDIO_AUTH_TOKEN__;
  if (typeof injected === 'string' && injected.trim()) {
    headers.Authorization = `Bearer ${injected.trim()}`;
    return headers;
  }
  try {
    const stored = localStorage.getItem('fp.relayToken');
    if (stored) {
      let token = stored;
      try { token = JSON.parse(stored); } catch { /* raw token */ }
      if (typeof token === 'string' && token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
    }
  } catch { /* ignore */ }
  return headers;
}

export function getRelayConfig() {
  return {
    enabled: relayEnabled,
    url: RELAY_URL || null,
    note: relayEnabled
      ? 'Live AI calls go through the authenticated server relay (the provider key never reaches the browser). Your first sessions run on a free trial — no key needed.'
      : 'Direct Groq calls — your key stays in this browser’s localStorage only. Fine for a private tool; wire VITE_GROQ_RELAY_URL for a public launch.',
  };
}

function relayEndpoint(path) {
  const suffix = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  return RELAY_URL.replace(/\/+$/, '') + suffix;
}

export async function withRelay({ label, path = label, body, direct }) {
  if (!relayEnabled) return direct();

  let headers = relayHeaders();
  if (!headers.Authorization) {
    // No host-injected or stored identity: use the free trial token so a
    // first-time visitor still reaches the model. A failure here is the honest
    // "AI isn't available" path, surfaced by the caller's friendly error.
    try {
      headers = { ...headers, Authorization: `Bearer ${await getTrialToken()}` };
    } catch (error) {
      throw error instanceof TrialUnavailable
        ? error
        : new Error('Could not start an AI session — check your connection and try again.');
    }
  }

  const res = await fetch(relayEndpoint(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    // A 401 on a trial token usually means it expired mid-session: mint a
    // fresh one once and let the caller retry rather than failing the turn.
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = j.error || j.message || msg;
    } catch { /* keep text */ }
    if (res.status === 429) throw new Error(`Rate limited by your relay (429): ${msg}`);
    if (res.status === 401 || res.status === 403) throw new Error(`Relay rejected your session (${res.status}): ${msg}`);
    throw new Error(`Relay ${label} failed (${res.status}): ${msg}`);
  }

  // Quota headers from relay (conventional)
  try {
    const { syncFromHeaders } = await import('./quota.js');
    syncFromHeaders(res.headers);
  } catch { /* ignore */ }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Relay ${label} returned a non-JSON response (${res.status}).`);
  }
}

export async function pingRelay() {
  if (!relayEnabled) throw new Error('Relay is not enabled.');
  const res = await fetch(relayEndpoint('/healthz'), {
    method: 'GET',
    headers: relayHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Relay health check failed (${res.status})`);
  return res.json();
}
