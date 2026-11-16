// Client-side quota guard for Groq calls.
// Mirrors what a server relay would enforce. When a relay is configured,
// the server is the source of truth; this is the honest local preview.
//
// The counter is stored through storageCore, not raw localStorage, so it is
// learner-owned: the allowance belongs to the member whose BYOK key is being
// spent. It used to live at a bare `fp.quota` read straight from localStorage,
// which made it one shared counter per device — in a household one learner's AI
// practice silently exhausted the other's for the rest of the day.
import { KEYS, read as readKey, write as writeKey } from './storageCore.js';
import { localDayKey } from './localDay.js';

// VITE_AI_DAILY_LIMIT is the current name; VITE_GROQ_DAILY_LIMIT kept for
// older deployments that already set it.
const DEFAULT_LIMIT = Number(import.meta.env?.VITE_AI_DAILY_LIMIT || import.meta.env?.VITE_GROQ_DAILY_LIMIT || 80);

function dayStamp(d = new Date()) {
  // The canonical local-day identity (localDay.js). Do not hand-roll another
  // toLocaleDateString here: five modules once had their own and the day
  // boundary drifted between them.
  return localDayKey(d);
}

function read() {
  try {
    const j = readKey(KEYS.quota, null);
    if (!j || typeof j !== 'object') return { day: dayStamp(), count: 0, limit: DEFAULT_LIMIT };
    if (j.day !== dayStamp()) return { day: dayStamp(), count: 0, limit: j.limit ?? DEFAULT_LIMIT };
    return { day: j.day, count: j.count || 0, limit: j.limit ?? DEFAULT_LIMIT };
  } catch {
    return { day: dayStamp(), count: 0, limit: DEFAULT_LIMIT };
  }
}

function write(state) {
  writeKey(KEYS.quota, state);
}

export function getQuota() {
  return read();
}

export function getRemaining() {
  const q = read();
  return Math.max(0, q.limit - q.count);
}

export function canCall(n = 1) {
  const q = read();
  return q.count + n <= q.limit;
}

export function consume(n = 1) {
  const q = read();
  // day rollover handled in read()
  if (q.count + n > q.limit) return { ok: false, quota: q, reason: 'daily quota exhausted' };
  q.count += n;
  write(q);
  return { ok: true, quota: q };
}

// For server relay responses that include quota headers
export function syncFromHeaders(headers) {
  try {
    const rawLimit = headers.get?.('x-ratelimit-limit');
    const rawRemaining = headers.get?.('x-ratelimit-remaining');
    // Number(null) and Number('') are both 0. Trusting those would silently
    // set the learner's allowance to zero whenever a relay or proxy omits the
    // headers. Only a real, positive number is evidence of a server quota.
    if (typeof rawLimit !== 'string' || !rawLimit.trim()) return;
    const limit = Number(rawLimit);
    if (!Number.isFinite(limit) || limit <= 0) return;

    const q = read();
    q.limit = limit;
    if (typeof rawRemaining === 'string' && rawRemaining.trim()) {
      const remaining = Number(rawRemaining);
      if (Number.isFinite(remaining) && remaining >= 0) {
        q.count = Math.max(0, Math.min(limit, limit - remaining));
      }
    }
    write(q);
  } catch { /* ignore */ }
}

export function formatQuota() {
  const q = read();
  return `${q.count}/${q.limit} today · ${getRemaining()} remaining`;
}
