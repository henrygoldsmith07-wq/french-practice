// Error copy must match the actual failure. A free-trial learner has no key,
// so a rejected relay session must not tell them to open Settings for one.
import test from 'node:test';
import assert from 'node:assert/strict';

const { friendlyError } = await import('../src/lib/groq.js');

test('a rejected relay session does not tell a trial learner to check a key', () => {
  const message = friendlyError(new Error('Relay rejected your session (401): unauthorized'));
  assert.match(message, /reload/i);
  assert.doesNotMatch(message, /check or re-enter it/i);
});

test('a genuinely rejected BYO key still points at Settings', () => {
  const message = friendlyError(new Error('validate-key failed (401): bad key'));
  assert.match(message, /Settings/i);
});

test('other relays errors keep their calm wording', () => {
  assert.match(friendlyError(new Error('Rate limited by your relay (429): slow down')), /busy/i);
  assert.match(friendlyError(new Error('Relay chat failed (500): boom')), /hiccup/i);
  assert.match(friendlyError(new Error('fetch failed')), /offline/i);
});
