import { analyzeFrenchText } from './src/lib/frenchG2P.js';
const a = analyzeFrenchText('ils chantent trois chansons');
for (const w of a.words) console.log(w.word, JSON.stringify(w.phonemes), 'silent:', w.silentEnding);
console.log('silentEndings:', a.silentEndings);

// DSP debug
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
const { voicingF0 } = await import('./src/lib/acoustics.js');
const pcm = sine(220, 0.5);
const v = voicingF0(pcm, RATE);
console.log('f0 median:', v.f0Median, 'voicedRatio:', v.voicedRatio);
console.log('first 12 f0:', v.f0Series.slice(0, 12));
const n = (await import('./src/lib/acoustics.js')).syllableNuclei(concat(sine(220, 0.18, 0.4), silence(0.25), sine(220, 0.18, 0.4), silence(0.25), sine(220, 0.18, 0.4)), RATE);
console.log('nuclei:', n.count, n.intervalsMs, 'reg:', n.regularity);
