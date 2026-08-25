import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeFrenchText, voicedShare } from '../src/lib/frenchG2P.js';
import { syllableNuclei, voicingF0, bandShares, medianF0InWindow, semitones } from '../src/lib/acoustics.js';
import { analyzePhonology } from '../src/lib/phonologicalScore.js';

const RATE = 16000;
const sine = (hz, sec, amp = 0.3) => {
  const out = new Float32Array(Math.round(RATE * sec));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / RATE);
  return out;
};
const silence = (sec) => new Float32Array(Math.round(RATE * sec));
const concat = (...parts) => {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

test('G2P detects nasals, /y/, /u/, /R/ and liaison opportunities', () => {
  const a = analyzeFrenchText('Un lundi pluvieux, vous roulez partout');
  assert.ok(a.counts.nasals >= 1, 'un should yield a nasal');
  assert.ok(a.counts.y >= 1, 'u in lundi should yield /y/');
  assert.ok(a.counts.u >= 1, 'ou in roulez should yield /u/');
  assert.ok(a.counts.r >= 1, 'roulez should yield /R/');
  const liaison = analyzeFrenchText('les amis arrivent ce soir');
  assert.ok(liaison.liaisonOpportunities >= 2, 'les_amis and ce_soir are links');
});

test('G2P strips silent endings and counts them', () => {
  const a = analyzeFrenchText('ils chantent trois chansons');
  assert.ok(a.silentEndings >= 2, 'chantent and trois end silent');
  assert.ok(a.syllables >= 4);
});

test('voiced share sits in a sane band for ordinary French', () => {
  const a = analyzeFrenchText('bonjour, je voudrais un cafe au lait sil vous plait');
  const share = voicedShare(a);
  assert.ok(share > 0.45 && share < 0.9, `unexpected voiced share ${share}`);
});

test('autocorrelation finds the F0 of a synthesized vowel', () => {
  const pcm = sine(220, 0.5);
  const { voicedRatio, f0Median } = voicingF0(pcm, RATE);
  assert.ok(voicedRatio > 0.8, `voiced ratio ${voicedRatio}`);
  assert.ok(Math.abs(f0Median - 220) <= 8, `f0 ${f0Median} vs 220`);
});

test('syllable nuclei count four tone bursts separated by silence', () => {
  const burst = () => sine(220, 0.18, 0.4);
  const pcm = concat(burst(), silence(0.25), burst(), silence(0.25), burst(), silence(0.25), burst());
  const n = syllableNuclei(pcm, RATE);
  assert.equal(n.count, 4);
  assert.equal(n.intervalsMs.length, 3);
  assert.ok(n.regularity > 0.8, `regular bursts: ${n.regularity}`);
});

test('band shares localise energy where it was put', () => {
  const pcm = sine(1900, 0.4, 0.4);
  const shares = bandShares(pcm, RATE, [
    { name: 'front', lo: 1500, hi: 2200 },
    { name: 'back', lo: 650, hi: 1100 },
    { name: 'murmur', lo: 150, hi: 450 },
  ]);
  assert.ok(shares.front > shares.back, `front ${shares.front} vs back ${shares.back}`);
  assert.ok(shares.front > shares.murmur);
});

test('median F0 windows and semitone maths behave', () => {
  const pcm = concat(sine(200, 0.5), silence(0.1), sine(250, 0.5));
  const { f0Series } = voicingF0(pcm, RATE);
  const body = medianF0InWindow(f0Series, 0.02, 0, 0.5);
  const end = medianF0InWindow(f0Series, 0.02, 0.6, 1.1);
  assert.ok(Math.abs(body - 200) <= 8, `body ${body}`);
  assert.ok(Math.abs(end - 250) <= 10, `end ${end}`);
  assert.equal(semitones(200, 250), 3.9);
  assert.equal(semitones(200, null), null);
});

test('phonological analysis: components, confidence tiers, weakest drill', () => {
  const target = 'Un lundi pluvieux, vous roulez partout';
  const pcm = concat(
    sine(220, 0.25, 0.35), silence(0.12),
    sine(220, 0.25, 0.35), silence(0.12),
    sine(215, 0.25, 0.35), silence(0.12),
    sine(220, 0.25, 0.35)
  );
  const r = analyzePhonology({ target, accuracy: 78, audio: { pcm, sampleRate: RATE, durationSec: pcm.length / RATE } });
  const byId = Object.fromEntries(r.components.map((c) => [c.id, c]));
  assert.equal(byId.intelligibility.score, 78);
  assert.equal(byId.intelligibility.confidence, 'measured');
  assert.ok(byId.rhythm, 'tone bursts give rhythm');
  assert.equal(byId.rhythm.confidence, 'measured');
  assert.ok(byId['u-ou'], 'target has both /y/ and /u/ words');
  assert.ok(byId['r'], 'target has /R/');
  assert.ok(byId.liaison, 'vous_roulez is a link');
  for (const c of r.components) {
    assert.ok(['measured', 'estimated', 'text-derived'].includes(c.confidence), c.id);
  }
  assert.ok(r.weakest && r.weakest.id !== 'intelligibility');
  assert.ok(r.overall >= 0 && r.overall <= 100);
});

test('phonological analysis degrades gracefully without audio', () => {
  const r = analyzePhonology({ target: 'les amis', accuracy: 64, audio: null });
  assert.equal(r.overall, 64);
  assert.equal(r.components.length, 1);
  assert.equal(r.weakest, null);
});
