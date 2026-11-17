// Delayed review must record the learner's self-assessment BEFORE revealing
// the answer. A mark made while the correction is on screen is assisted and
// must never feed the mistake graph's mastery lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/TodaySegments.jsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('export function DelayedReview'));

test('the assessment buttons are shown before the correction is revealed', () => {
  // JSX: `{revealed ? (POST) : (PRE)}` — the first branch is the revealed view.
  const branch = body.indexOf(') : (');
  const close = body.lastIndexOf('\n        )}');
  assert.ok(branch > 0 && close > branch, 'the revealed ternary could not be located');
  const postReveal = body.slice(body.indexOf('{revealed ? ('), branch);
  const preReveal = body.slice(branch, close);
  // The buttons that call mark() must live in the pre-reveal branch.
  assert.match(preReveal, /onClick=\{\(\) => mark\(true\)\}/);
  assert.match(preReveal, /onClick=\{\(\) => mark\(false\)\}/);
  assert.doesNotMatch(postReveal, /mark\(true\)/, 'no re-marking after the answer is visible');
  assert.match(postReveal, /onClick=\{next\}/, 'the post-reveal action only advances');
});

test('marking reveals but does not itself advance to the next item', () => {
  const markBody = body.slice(body.indexOf('const mark = ('), body.indexOf('const next = ('));
  assert.match(markBody, /setRevealed\(true\)/);
  assert.doesNotMatch(markBody, /setIdx\(/, 'the retest must not be re-recorded by an advance');
});
