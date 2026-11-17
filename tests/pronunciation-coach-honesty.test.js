// The guided pronunciation demo must never fabricate an "AI" analysis.
//
// It used to score non-matching words with Math.random() * 70 + 40, then derive
// overall/clarity/fluency/accuracy from that — numbers in 40..110 shown "out of
// 100", so the UI could display an impossible >100. This pins the replacement:
// a pure, deterministic word-match comparison of the target phrase against the
// transcript the browser actually captured, with an honest empty state.
//
// Run: node --test tests/pronunciation-coach-honesty.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareTranscript } from '../src/lib/pronunciationCoach.js';

test('an exact transcript recognises every target word', () => {
  const r = compareTranscript('Bonjour comment allez vous', 'Bonjour comment allez vous');
  assert.equal(r.available, true);
  assert.equal(r.total, 4);
  assert.equal(r.matched, 4);
  assert.equal(r.recognisedPercent, 100);
  assert.deepEqual(r.hits, [true, true, true, true]);
  assert.deepEqual(r.missedWords, []);
});

test('a partial transcript recognises only the words actually heard', () => {
  const r = compareTranscript('Bonjour comment allez vous', 'bonjour cafe');
  assert.equal(r.matched, 1, 'only "bonjour" was heard');
  assert.equal(r.total, 4);
  assert.equal(r.recognisedPercent, 25);
  assert.deepEqual(r.matchedWords, ['bonjour']);
  assert.deepEqual(r.missedWords, ['comment', 'allez', 'vous']);
});

test('the same inputs always give the same result (no randomness)', () => {
  const a = compareTranscript('Je voudrais un cafe', 'je voudrais un cafe');
  const b = compareTranscript('Je voudrais un cafe', 'je voudrais un cafe');
  assert.deepEqual(a, b);
  // Repeated calls must never drift — the old random scorer failed this.
  for (let i = 0; i < 25; i += 1) {
    assert.deepEqual(compareTranscript('Je voudrais un cafe', 'je voudrais un cafe'), a);
  }
});

test('no reported value can ever exceed 100', () => {
  const cases = [
    ['a b c', 'a b c d e f g h'],   // extra words heard
    ['a b c', 'a'],                 // missing words
    ['a b c', ''],                  // nothing heard
    ['', ''],                       // empty target
  ];
  for (const [target, spoken] of cases) {
    const r = compareTranscript(target, spoken);
    assert.ok(r.recognisedPercent <= 100, `recognisedPercent ${r.recognisedPercent} > 100`);
    assert.ok(r.recognisedPercent >= 0);
    assert.ok(r.matched <= r.total, `matched ${r.matched} > total ${r.total}`);
    assert.equal(r.hits.length, r.total);
  }
});

test('an empty transcript is an honest "no analysis available" state', () => {
  for (const spoken of ['', '   ', undefined, null]) {
    const r = compareTranscript('Bonjour comment allez vous', spoken);
    assert.equal(r.available, false, 'no transcript means analysis is unavailable');
    assert.equal(r.matched, 0, 'no words can be credited when nothing was heard');
    assert.equal(r.recognisedPercent, 0);
    assert.equal(r.heard, String(spoken ?? ''));
    assert.ok(r.hits.every((hit) => hit === false));
  }
});

test('matches ignore case, punctuation and accent composition', () => {
  const decomposed = 'cafe '.replace('e', 'e\u0301'); // "cafe\u0301" (NFC -> café)
  const r = compareTranscript('Ça va bien, café?', 'ça va bien ' + decomposed.trim());
  assert.equal(r.total, 4);
  assert.equal(r.matched, 4);
  assert.equal(r.recognisedPercent, 100);
});
