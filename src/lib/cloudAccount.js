// Google account and cross-device sync.
//
// Sync carries exactly the sync code from ./account.js — the same opaque,
// optionally AES-GCM-encrypted envelope you can already copy and paste between
// devices. Signing in does not introduce a second notion of "all my progress";
// it just saves you carrying the code by hand.
//
// That means the privacy story is unchanged: set a passphrase and the server
// stores something it cannot read. Leave the passphrase empty and the stored
// code is a plain backup, exactly as it is when you paste it into a note — the
// UI says so rather than implying an encryption that is not there.

import { makeSyncCode, restoreSyncCode } from './account.js';

const SIGNED_OUT = { available: false, user: null };

/** Who is signed in, and whether sign-in exists on this deployment at all. */
export async function fetchAccount() {
  try {
    const response = await fetch('/api/auth/session', { headers: { accept: 'application/json' } });
    if (!response.ok) return SIGNED_OUT;
    const body = await response.json();
    return { available: Boolean(body.available), user: body.user ?? null };
  } catch {
    // A plain Vite dev server has no API routes; "no accounts" is the right
    // answer there, not a broken screen.
    return SIGNED_OUT;
  }
}

export function startGoogleSignIn() {
  // A full navigation: the consent screen is Google's page, not ours.
  window.location.href = '/api/auth/google';
}

export async function signOut() {
  await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
}

export async function remoteUpdatedAt() {
  const response = await fetch('/api/sync', { headers: { accept: 'application/json' } });
  if (!response.ok) return null;
  const body = await response.json();
  return body.state?.updated_at ?? null;
}

/**
 * Saves this device's progress to the account.
 *
 * `expected` is the timestamp the caller believes is on the server; when the
 * server has moved on, the push is refused as a conflict rather than
 * overwriting a copy this device has never seen. `force` overwrites after the
 * user has been asked.
 */
export async function push(passphrase, expected, force = false) {
  if (!force) {
    const actual = await remoteUpdatedAt();
    if (actual !== expected) return { status: 'conflict', remoteUpdatedAt: actual };
  }
  const code = await makeSyncCode(passphrase || '');
  const response = await fetch('/api/sync', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: { code }, version: 1 }),
  });
  if (response.status === 401) return { status: 'signed-out' };
  if (response.status === 503) return { status: 'unavailable', message: 'Sync is not configured for this deployment.' };
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { status: 'error', message: body.error || `Sync failed (${response.status})` };
  }
  const body = await response.json();
  return { status: 'ok', updatedAt: body.updated_at, encrypted: Boolean(passphrase) };
}

/**
 * Restores this account's progress onto this device.
 *
 * A wrong passphrase surfaces as the sync code's own friendly error rather
 * than as a network failure — only this device can tell those apart.
 */
export async function pull(passphrase) {
  const response = await fetch('/api/sync', { headers: { accept: 'application/json' } });
  if (response.status === 401) return { status: 'signed-out' };
  if (response.status === 503) return { status: 'unavailable', message: 'Sync is not configured for this deployment.' };
  if (!response.ok) return { status: 'error', message: `Sync failed (${response.status})` };
  const body = await response.json();
  if (!body.state?.payload?.code) return { status: 'empty' };
  try {
    const restored = await restoreSyncCode(body.state.payload.code, passphrase || '');
    return { status: 'ok', restored, updatedAt: body.state.updated_at };
  } catch (error) {
    return { status: 'error', message: error.message || 'Could not restore that code.' };
  }
}

/** Removes the account's copy. This device keeps its progress. */
export async function deleteRemote() {
  const response = await fetch('/api/sync', { method: 'DELETE' });
  if (!response.ok) return { status: 'error', message: `Delete failed (${response.status})` };
  return { status: 'empty' };
}
