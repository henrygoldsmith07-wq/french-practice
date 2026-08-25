import { voicingF0 } from './src/lib/acoustics.js';
const RATE = 16000;
const pcm = new Float32Array(Math.round(RATE * 0.5));
for (let i = 0; i < pcm.length; i++) pcm[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
// Reproduce the frame + dump raw r(lag) for lags 65..80 on frame 0.
const frameLen = 640;
const r = (lag) => {
  let num = 0, e1 = 0, e2 = 0;
  for (let i = 0; i + lag < frameLen; i++) {
    const a = pcm[i], b = pcm[i + lag];
    num += a * b; e1 += a * a; e2 += b * b;
  }
  return num / Math.max(1e-9, Math.sqrt(e1 * e2));
};
for (let lag = 65; lag <= 80; lag++) console.log(lag, r(lag).toFixed(4));
