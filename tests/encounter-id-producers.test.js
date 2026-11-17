import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encounterKeyOf, newEncounterId } from '../src/lib/evidenceIdentity.js';
import {
  createLearnerErrorModel,
  recordLearnerError,
  recordLearnerSuccess,
} from '../src/lib/learnerErrors.js';

// Several skill producers filed a scored activity event with only a sessionId
// stamped at the composition root (App.jsx). Without an encounterId the learner
// model's encounterKeyOf() is null and a same-session success can never advance
// independentPasses, so the weakness stays open forever. These four components
// are JSX with heavy props, so a precise source-level guard on the scored event
// is the right level: it proves the success path carries an encounterId minted
// once per presentation and reused across retries (never a fresh id per retry,
// which would fabricate duplicate independent passes).

const COMPONENTS = join(process.cwd(), 'src', 'components');
const read = (name) => readFileSync(join(COMPONENTS, name), 'utf8');

/** The `onActivity?.({ ... })` payload whose `type` field matches. */
function scoredActivityPayload(src, type) {
  const call = /onActivity\?\.\(\{([\s\S]*?)\}\);/g;
  let match;
  while ((match = call.exec(src))) {
    if (new RegExp(`type:\\s*'${type}'`).test(match[1])) return match[1];
  }
  return null;
}

const PRODUCERS = [
  ['ConjugationDrill.jsx', 'conjugation'],
  ['Listening.jsx', 'listening'],
  ['Pronunciation.jsx', 'pronunciation'],
  ['AccentDrill.jsx', 'writing'],
];

test('every scored activity event carries an encounterId', () => {
  for (const [file, type] of PRODUCERS) {
    const payload = scoredActivityPayload(read(file), type);
    assert.ok(payload, `${file}: could not find the scored ${type} onActivity payload`);
    assert.match(payload, /\bencounterId\b/,
      `${file}: the scored ${type} event must carry an encounterId for the ` +
      'learner model to count a same-session pass as independent evidence');
  }
});

test('ConjugationDrill mints once per submitted item and reuses that id', () => {
  const src = read('ConjugationDrill.jsx');
  assert.match(src, /import\s*\{\s*newEncounterId\s*\}\s*from\s*'[^']*evidenceIdentity/,
    'ConjugationDrill must import newEncounterId from evidenceIdentity');
  const submit = src.slice(src.indexOf('const submit'), src.indexOf('const advance'));
  assert.match(submit, /const encounterId\s*=\s*newEncounterId\(\);/,
    'mint exactly one encounter id at submit time (one id per queued item)');
  const payload = scoredActivityPayload(src, 'conjugation');
  assert.match(payload, /\bencounterId\s*,/, 'reuse the local id on the scored event (shorthand)');
  assert.doesNotMatch(payload, /newEncounterId/,
    'do not mint a fresh id inside the scored event');
});

test('Listening mints one encounter per quiz run and reuses it on the score', () => {
  const src = read('Listening.jsx');
  assert.match(src, /import\s*\{\s*newEncounterId\s*\}\s*from\s*'[^']*evidenceIdentity/);
  const freshQuiz = src.slice(src.indexOf('const freshQuiz'), src.indexOf('const answer'));
  assert.match(freshQuiz, /encounterId:\s*newEncounterId\(\)/,
    'mint the encounter when the quiz run is created (Retake makes a new run)');
  const payload = scoredActivityPayload(src, 'listening');
  assert.match(payload, /encounterId:\s*quiz\.encounterId/,
    'reuse the quiz-run id on the scored event');
  assert.doesNotMatch(payload, /newEncounterId/,
    'do not mint a fresh id inside the scored event');
});

test('Pronunciation reuses its per-sentence encounter ref on the success event', () => {
  const src = read('Pronunciation.jsx');
  assert.match(src, /const encounterRef\s*=\s*useRef\([^)]*newEncounterId\(\)[^)]*\)/,
    'one encounter ref is minted once per presented sentence');
  const payload = scoredActivityPayload(src, 'pronunciation');
  assert.match(payload, /encounterId:\s*encounterRef\.current/,
    'the success event must cite the same ref the gap event cites — a retry ' +
    'keeps it, so it can never count as a second independent pass');
  assert.doesNotMatch(payload, /newEncounterId/,
    'do not mint a fresh id on the scored/retry path');
});

test('AccentDrill mints once per round and reuses it on the final score', () => {
  const src = read('AccentDrill.jsx');
  assert.match(src, /import\s*\{\s*newEncounterId\s*\}\s*from\s*'[^']*evidenceIdentity/);
  const start = src.slice(src.indexOf('const start'), src.indexOf('const insert'));
  assert.match(start, /encounterId:\s*newEncounterId\(\)/,
    'mint the encounter when the 10-word round starts (Again makes a new round)');
  const payload = scoredActivityPayload(src, 'writing');
  assert.match(payload, /encounterId:\s*game\.encounterId/,
    'reuse the round id on the scored event');
  assert.doesNotMatch(payload, /newEncounterId/,
    'do not mint a fresh id inside the scored event');
});

test('encounterKeyOf requires a real encounterId', () => {
  // The behavioural root of the whole fix: identity-less evidence yields no
  // dedupe key, so independentPasses never advances; a real id yields a key.
  assert.equal(encounterKeyOf({ encounterId: null }), null);
  assert.equal(encounterKeyOf({ encounterId: undefined }), null);
  assert.equal(encounterKeyOf({ encounterId: '' }), null);
  assert.equal(encounterKeyOf({}), null);
  const id = newEncounterId();
  assert.ok(id, 'newEncounterId returns a real id');
  assert.equal(encounterKeyOf({ encounterId: id }), `enc:${id}`);
});

test('real encounter ids let a same-session success resolve a weakness; null ids never do', () => {
  const at = '2026-11-17T10:00:00.000Z';
  const withError = () => recordLearnerError(createLearnerErrorModel(), {
    category: 'grammar', key: 'articles', label: 'Articles',
    mode: 'conversation', score: 45,
  }, { at });

  const success = (encounterId) => ({
    category: 'grammar', key: 'articles', mode: 'targeted-drill',
    score: 90, delayed: false, encounterId,
  });

  let noId = withError();
  noId = recordLearnerSuccess(noId, success(null), { at });
  noId = recordLearnerSuccess(noId, success(null), { at });
  assert.equal(noId.entries[0].independentPasses, 0,
    'identity-less passes never advance independence');
  assert.equal(noId.entries[0].status, 'recovering');

  let withId = withError();
  withId = recordLearnerSuccess(withId, success(newEncounterId()), { at });
  withId = recordLearnerSuccess(withId, success(newEncounterId()), { at });
  assert.equal(withId.entries[0].independentPasses, 2,
    'two distinct real encounters each count as an independent pass');
  assert.equal(withId.entries[0].status, 'resolved');
});
