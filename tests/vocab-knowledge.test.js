import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  knowledgeProfile, knowledgeLabel, productiveGaps, nextVocabMode,
  recallModesFor, BANDS,
} from '../src/lib/vocabKnowledge.js';

const NOW = Date.now();
const DAY = 86400000;

// Fresh-ish FSRS cards: the shape fsrs.js persists (reps, S stability,
// lastReviewed, ease or D).
const card = (reps, stabilityDays, reviewedDaysAgo = 1) => ({
  reps,
  S: stabilityDays,
  ease: 2.5,
  lastReviewed: new Date(NOW - reviewedDaysAgo * DAY).toISOString(),
});

describe('vocabulary knowledge profiles', () => {
  it('an unseen word is unknown in every dimension', () => {
    const profile = knowledgeProfile({}, 'w1', { now: NOW });
    assert.equal(profile.recognition.band, 'unknown');
    assert.equal(profile.production.band, 'unknown');
    assert.equal(profile.listening.band, 'unknown');
  });

  it('recognition and production are tracked separately', () => {
    const srs = {
      'w1::receptive': card(5, 20),
      'w1::productive': card(1, 2),
    };
    const profile = knowledgeProfile(srs, 'w1', { now: NOW });
    assert.equal(profile.recognition.band, 'strong');
    assert.equal(profile.production.band, 'weak');
    assert.notEqual(profile.recognition.band, profile.production.band);
  });

  it('recognises-but-cannot-produce words are the productive gap', () => {
    const srs = {
      'w1::receptive': card(5, 20),
      'w1::productive': card(1, 1),
      'w2::receptive': card(5, 25),
    };
    const entries = [
      { id: 'w1', fr: 'comprendre', en: 'to understand', freq: 1 },
      { id: 'w2', fr: 'acheter', en: 'to buy', freq: 3 },
    ];
    const gaps = productiveGaps(srs, entries, 10, { now: NOW });
    const ids = gaps.map((g) => g.id);
    assert.ok(ids.includes('w1'), 'w1 recognised but weak in production');
    assert.ok(ids.includes('w2'), 'w2 recognised with no production at all');
    // Frequency order preserved (w1 freq 1 before w2 freq 3).
    assert.equal(ids[0], 'w1');
  });

  it('listening stays unknown without real listening evidence', () => {
    const srs = { 'w1::receptive': card(5, 20) };
    const profile = knowledgeProfile(srs, 'w1', { now: NOW, listeningEvidence: null });
    assert.equal(profile.listening.band, 'unknown');
    const withEvidence = knowledgeProfile(srs, 'w1', { now: NOW, listeningEvidence: { attempts: 4, correct: 4 } });
    assert.equal(withEvidence.listening.band, 'strong');
  });

  it('the label is plain learner language', () => {
    const srs = { 'w1::receptive': card(5, 20), 'w1::productive': card(1, 1) };
    const label = knowledgeLabel(knowledgeProfile(srs, 'w1', { now: NOW }));
    assert.match(label, /^Recognition: strong · Production: weak · Listening: unknown$/);
    for (const bad of ['fsrs', 'srs', 'retention', 'reps', 'stability']) {
      assert.ok(!label.toLowerCase().includes(bad), `label leaks "${bad}"`);
    }
  });

  it('production practice is chosen when recognition is solid but production is not', () => {
    const strong = knowledgeProfile({ 'w1::receptive': card(5, 20), 'w1::productive': card(1, 1) }, 'w1', { now: NOW });
    assert.equal(nextVocabMode(strong), 'production');
    const balanced = knowledgeProfile({ 'w1::receptive': card(4, 12), 'w1::productive': card(4, 12) }, 'w1', { now: NOW });
    assert.equal(nextVocabMode(balanced), 'recognition');
    const unheard = knowledgeProfile(
      { 'w1::receptive': card(5, 20), 'w1::productive': card(4, 12) },
      'w1',
      { now: NOW, listeningEvidence: { attempts: 4, correct: 1 } },
    );
    assert.equal(nextVocabMode(unheard), 'listening');
    assert.equal(nextVocabMode(null), 'recognition');
  });

  it('recall modes interleave direction and task shape', () => {
    const profile = knowledgeProfile({ 'w1::receptive': card(5, 20) }, 'w1', { now: NOW });
    const modes = recallModesFor(profile);
    assert.ok(modes.includes('target→native'));
    assert.ok(modes.includes('context choice'));
    const fresh = knowledgeProfile({}, 'w1', { now: NOW });
    assert.ok(!recallModesFor(fresh).includes('spoken production'), 'production modes wait for unlock');
  });

  it('never throws on junk and keeps bands valid', () => {
    const profile = knowledgeProfile({ 'w1::receptive': { reps: 'x' } }, 'w1', { now: NOW });
    for (const dim of ['recognition', 'production', 'listening']) {
      assert.ok(BANDS.includes(profile[dim].band), `band ${profile[dim].band} not in BANDS`);
    }
    assert.deepEqual(productiveGaps({}, null, 5, { now: NOW }), []);
  });
});
