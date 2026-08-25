import { voicingF0, syllableNuclei } from './src/lib/acoustics.js';
const RATE = 16000;
const sine = (hz, sec, amp = 0.3) => {
  const out = new Float32Array(Math.round(RATE * sec));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / RATE);
  return out;
};
const v = voicingF0(sine(220, 0.5), RATE);
console.log('f0 median:', v.f0Median);
console.log('series head:', v.f0Series.slice(0, 8));

const s = sine(220, 0.18, 0.4);
const z = new Float32Array(Math.round(RATE * 0.25));
const o = new Float32Array(s.length * 3 + z.length * 2);
let p = 0;
for (let k = 0; k < 3; k++) { o.set(s, p); p += s.length; if (k < 2) { o.set(z, p); p += z.length; } }
const n = syllableNuclei(o, RATE);
console.log('nuclei:', n.count, n.intervalsMs, 'reg:', n.regularity);
