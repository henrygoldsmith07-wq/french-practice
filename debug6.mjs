import { voicingF0 } from './src/lib/acoustics.js';
const RATE = 16000;
const pcm = new Float32Array(Math.round(RATE * 0.5));
for (let i = 0; i < pcm.length; i++) pcm[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);

// Verbatim copy of the module's frame-0 pass, with logging:
const frameMs = 40, hopMs = 20, fmin = 70, fmax = 400;
const frameLen = Math.round((RATE * frameMs) / 1000);
const hopLen = Math.round((RATE * hopMs) / 1000);
const lagMin = Math.floor(RATE / fmax);
const lagMax = Math.min(frameLen - 1, Math.ceil(RATE / fmin));
console.log('frameLen', frameLen, 'lagMin', lagMin, 'lagMax', lagMax);
let bestLag = -1, bestR = 0;
for (let lag = lagMin; lag <= lagMax; lag++) {
  let num = 0, e1 = 0, e2 = 0;
  for (let i = 0; i + lag < frameLen; i++) {
    const a = pcm[start0() + i] || 0;
    const b = pcm[start0() + i + lag] || 0;
    num += a * b; e1 += a * a; e2 += b * b;
  }
  const r = num / Math.max(1e-9, Math.sqrt(e1 * e2));
  if (lag >= 210 && lag <= 222) console.log('r', lag, r.toFixed(4));
  if (r > bestR) { bestR = r; bestLag = lag; }
}
console.log('bestLag', bestLag, 'bestR', bestR.toFixed(4));
function start0() { return 0; }
