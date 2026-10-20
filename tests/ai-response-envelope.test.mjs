// The AI response envelope.
//
// sendChat() returns the provider payload exactly as it arrives:
//   { choices: [ { message: { content: "..." } } ] }
// That is the shape the provider really uses (see server/relay.js, which
// validates `Array.isArray(payload.choices)` on the provider body and forwards
// it to the client unwrapped) and the shape the repo's own relay tests stub
// (server/relay.test.js, server/relay-trial.test.js).
//
// Every chat caller then destructures `{ data }` out of the result:
//   const { data } = await chatCompletion(apiKey, body, { label });
//   return extractJson(data.choices[0].message.content);
//
// chatCompletion's FALLBACK path returned `{ data }`, so it was correct. Its
// SUCCESS path returned the bare payload, so `data` was undefined and
// `data.choices[0]` threw "Cannot read properties of undefined" — on EVERY
// conversation turn, every quiz and every tutor answer.
//
// Nothing caught it: the e2e suite runs the app in mock mode (which never
// touches the network) and the unit tests stub responses they construct
// themselves. This test stubs the REAL provider shape, so the wire format is
// pinned to what the provider actually sends rather than to what the client
// wishes it sent.
//
// Run: node --import ./tests/register-jsx.mjs tests/ai-response-envelope.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

// The provider's real response shape — copied from the repo's own relay test
// fixtures (server/relay.test.js), not invented here.
const providerReply = () => ({
  choices: [{ message: { content: '{"hint":"Une baguette, s\'il vous plaît."}' } }],
  usage: { total_tokens: 12 },
});

let mode = 'ok';
let calls = 0;
globalThis.fetch = async (_url, init = {}) => {
  calls += 1;
  if (mode === 'reject' && calls === 1) {
    // A provider rejection the client is meant to retry on the fallback model.
    // 404 (not 429) so the client does not burn its own retry backoff first:
    // the point of this test is the FALLBACK path, not the retry policy.
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => 'model not found' };
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => providerReply(),
  };
};

const { getHint, explainMistake } = await import('../src/lib/groq.js');

const scenario = { title: 'At the bakery', setup: 'You want bread.' };

test('a hint survives the real provider response shape', async () => {
  mode = 'ok';
  const hint = await getHint('key', {
    scenario,
    lastAiReply: 'Bonjour, que puis-je vous servir ?',
    level: 1,
    cefr: 'B1',
  });
  assert.equal(hint, 'Une baguette, s\'il vous plaît.',
    'the hint must be read out of the provider payload — if the envelope is ' +
    'wrong this throws before it can be read');
});

test('a rule explanation survives the real provider response shape', async () => {
  mode = 'ok';
  const explanation = await explainMistake('key', {
    userText: 'je voudrais un pain',
    corrections: 'Use "une baguette".',
    level: 'B1',
  });
  assert.ok(typeof explanation === 'string' && explanation.length > 0,
    'the explanation must come back as text');
});

test('the fallback model path returns the same envelope', async () => {
  // The fallback path was ALWAYS correct — it returned `{ data }`. This test
  // pins that the fix did not change it, and that a provider rejection still
  // ends in a usable answer rather than an exception.
  mode = 'reject';
  calls = 0;
  const hint = await getHint('key', {
    scenario,
    lastAiReply: 'Bonjour, que puis-je vous servir ?',
    level: 1,
    cefr: 'B1',
  });
  assert.equal(hint, 'Une baguette, s\'il vous plaît.');
  assert.ok(calls >= 2, 'the client must have retried on the fallback model');
  mode = 'ok';
});

test('the transcript and the vision path read the payload directly', async () => {
  // These two call sendChat() and read `data.choices` on the payload itself.
  // They are the reason sendChat() must keep returning the bare payload — so
  // this test documents that the two conventions in this file are BOTH
  // deliberate, and that the bug was chatCompletion() losing the envelope.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/lib/groq.js', import.meta.url), 'utf8');

  assert.match(src, /const data = await sendChat\(apiKey, body, \{ label \}\);\s*\n\s*return \{ data \};/,
    'chatCompletion must return the { data } envelope its callers destructure');
  assert.match(src, /data = await sendChat\(apiKey, buildBody\(VISION_MODEL\)/,
    'the vision path reads the provider payload directly');
  assert.match(src, /data\?\.choices\?\.\[0\]\?\.message\?\.content/,
    'the transcript path reads the provider payload directly');
});
