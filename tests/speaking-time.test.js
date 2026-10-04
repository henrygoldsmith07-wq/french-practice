import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spokenProduction, accumulateSpoken, spokenProductionLabel } from '../src/lib/speakingTime.js';

describe('speaking-time capture — honesty rules', () => {
  it('counts only voiced production, never silence', () => {
    // A one-minute attempt where the learner spoke 12 s is 12 s of speech,
    // not a minute — silence never inflates the total.
    const result = spokenProduction([
      { voicedMs: 12000, encounterId: 'e1', sessionId: 's1' },
      { voicedMs: 0, encounterId: 'e2', sessionId: 's1' },
      { voicedMs: 0, encounterId: 'e3', sessionId: 's1' },
    ]);
    assert.equal(result.seconds, 12, 'unvoiced attempts contribute zero');
    assert.equal(result.attempts, 3, 'but they are still real attempts');
  });

  it('an unmeasured recording adds no production and is not silently guessed', () => {
    const result = spokenProduction([{ encounterId: 'e1' }, { voicedMs: null, encounterId: 'e2' }]);
    assert.equal(result.seconds, 0);
    assert.equal(result.droppedInvalid, 1, 'a missing measurement is flagged, not zero-filled');
  });

  it('repeated events for one presentation are not double-counted', () => {
    // A re-submit of the same recording (same encounter) must never mint a
    // second attempt's worth of speech.
    const result = spokenProduction([
      { voicedMs: 5000, encounterId: 'e1', sessionId: 's1' },
      { voicedMs: 5000, encounterId: 'e1', sessionId: 's1' },
      { voicedMs: 3000, encounterId: 'e2', sessionId: 's1' },
    ]);
    assert.equal(result.seconds, 8);
    assert.equal(result.attempts, 2);
    assert.equal(result.droppedDuplicates, 1);
  });

  it('identity-less events dedupe by their fallback key, not by accident', () => {
    const result = spokenProduction([
      { voicedMs: 4000, sessionId: 's1', at: '2026-01-01T10:00:00Z' },
      { voicedMs: 4000, sessionId: 's1', at: '2026-01-01T10:00:00Z' },
    ]);
    assert.equal(result.droppedDuplicates, 1);
  });

  it('an abandoned session records only what was genuinely spoken', () => {
    // The learner walked away after two real turns: the total is those turns,
    // never a number derived from how long the screen was open.
    const result = spokenProduction([
      { voicedMs: 9000, encounterId: 'e1', sessionId: 'abandoned' },
      { voicedMs: 7000, encounterId: 'e2', sessionId: 'abandoned' },
    ]);
    assert.equal(result.seconds, 16);
    assert.ok(result.seconds < 60, 'no fabricated session-length total');
  });

  it('accumulating an attempt is idempotent per presentation', () => {
    let state = { seconds: 0, attempts: 0, seenKeys: [] };
    state = accumulateSpoken(state, { voicedMs: 2000, encounterId: 'e1' });
    state = accumulateSpoken(state, { voicedMs: 2000, encounterId: 'e1' });
    assert.equal(state.seconds, 2, 'the second submit adds no speech');
    assert.equal(state.attempts, 1, 'one presentation is one attempt, however often it is submitted');
  });

  it('AI playback is never an input — only mic events reach this module', () => {
    // There is no path from TTS playback to spokenProduction: the API accepts
    // mic-attempt events only. A caller passing zero voicedMs (a playback
    // period) contributes nothing.
    const result = spokenProduction([{ voicedMs: 0, activityId: 'partner-spoke' }]);
    assert.equal(result.seconds, 0);
  });

  it('labels totals in plain learner language', () => {
    assert.ok(spokenProductionLabel(12).toLowerCase().includes('short'));
    assert.ok(spokenProductionLabel(65).toLowerCase().includes('minute'));
    assert.ok(spokenProductionLabel(300).includes('5 minutes'));
    for (const bad of ['voiced', 'ms', 'recorder', 'acoustic']) {
      assert.ok(!spokenProductionLabel(300).toLowerCase().includes(bad), `label leaks "${bad}"`);
    }
  });
});
