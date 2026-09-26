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
import { markBackup } from './storage.js';

const SIGNED_OUT = { available: false, user: null };
const MAX_SYNC_REQUEST_BYTES = 4 * 1024 * 1024;
const encoder = new TextEncoder();

async function responseJson(response) {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

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
  try {
    const response = await fetch('/api/sync', { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const body = await responseJson(response);
    return body?.state?.updated_at ?? null;
  } catch {
    return null;
  }
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
  // Conflict detection has to happen at the write. A separate GET immediately
  // before an unconditional PUT is racy: another device can save between those
  // requests and still be overwritten. The server performs an atomic
  // compare-and-swap against expectedUpdatedAt instead.
  let code;
  let response;
  try {
    // Cloud generation must be side-effect free until the remote write really
    // succeeds. Manual sync-code generation keeps account.js's default marker.
    code = await makeSyncCode(passphrase || '', { mark: false });
    const requestBody = JSON.stringify({
      payload: { code },
      version: 1,
      expectedUpdatedAt: expected ?? null,
      force: Boolean(force),
    });
    if (encoder.encode(requestBody).byteLength > MAX_SYNC_REQUEST_BYTES) {
      return { status: 'error', message: 'This snapshot is too large for account sync. Your local progress is unchanged.' };
    }
    response = await fetch('/api/sync', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: requestBody,
    });
  } catch {
    return { status: 'error', message: 'Could not reach account sync. Your local progress is unchanged.' };
  }
  if (response.status === 409) {
    const body = await responseJson(response);
    return { status: 'conflict', remoteUpdatedAt: body?.updated_at ?? null };
  }
  if (response.status === 401) return { status: 'signed-out' };
  if (response.status === 503) return { status: 'unavailable', message: 'Sync is not configured for this deployment.' };
  if (!response.ok) {
    const body = await responseJson(response);
    return { status: 'error', message: body?.error || `Sync failed (${response.status})` };
  }
  const body = await responseJson(response);
  if (!body || typeof body.updated_at !== 'string' || !Number.isFinite(Date.parse(body.updated_at))) {
    return { status: 'error', message: 'Account sync returned an invalid response. Your local progress is unchanged.' };
  }
  markBackup();
  return { status: 'ok', updatedAt: body.updated_at, encrypted: Boolean(passphrase) };
}

/**
 * Restores this account's progress onto this device.
 *
 * A wrong passphrase surfaces as the sync code's own friendly error rather
 * than as a network failure — only this device can tell those apart.
 */
export async function pull(passphrase) {
  let response;
  try {
    response = await fetch('/api/sync', { headers: { accept: 'application/json' } });
  } catch {
    return { status: 'error', message: 'Could not reach account sync. Your local progress is unchanged.' };
  }
  if (response.status === 401) return { status: 'signed-out' };
  if (response.status === 503) return { status: 'unavailable', message: 'Sync is not configured for this deployment.' };
  if (!response.ok) return { status: 'error', message: `Sync failed (${response.status})` };
  const body = await responseJson(response);
  if (!body) return { status: 'error', message: 'Account sync returned an invalid response. Your local progress is unchanged.' };
  if (body.state == null) return { status: 'empty' };
  const code = body.state?.payload?.code;
  if (typeof code !== 'string' || !code) {
    return { status: 'error', message: 'The remote snapshot is malformed. Your local progress is unchanged.' };
  }
  try {
    const restored = await restoreSyncCode(code, passphrase || '');
    return { status: 'ok', restored, updatedAt: body.state.updated_at };
  } catch (error) {
    return { status: 'error', message: `${error.message || 'Could not restore that code.'} Local progress was not replaced.` };
  }
}

/** Removes the account's copy. This device keeps its progress. */
export async function deleteRemote() {
  let response;
  try {
    response = await fetch('/api/sync', { method: 'DELETE' });
  } catch {
    return { status: 'error', message: 'Could not reach account sync. This device keeps its progress.' };
  }
  if (response.status === 401) return { status: 'signed-out' };
  if (response.status === 503) return { status: 'unavailable', message: 'Sync is not configured for this deployment.' };
  if (!response.ok) return { status: 'error', message: `Delete failed (${response.status})` };
  return { status: 'empty' };
}
