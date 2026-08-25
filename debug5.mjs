import { voicingF0 } from './src/lib/acoustics.js';
const RATE = 16000;
const pcm = new Float32Array(Math.round(RATE * 0.5));
for (let i = 0; i < pcm.length; i++) pcm[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
const v = voicingF0(pcm, RATE);
console.log('module median:', v.f0Median);
// Count distribution of the series:
const dist = {};
for (const f of v.f0Series) if (f != null) dist[f] = (dist[f] || 0) + 1;
console.log('distribution:', dist);
console.log('series head:', v.f0Series.slice(0, 6));
