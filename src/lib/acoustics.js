// Acoustic analysis of a recorded attempt — raw Float32 PCM, mono, any rate.
//
// These are REAL signal measurements (energy envelope, autocorrelation
// voicing + F0, syllable nuclei, band energies), but without forced
// alignment they cannot say "this phoneme was wrong at position 4". The
// scoring layer treats every output here as an estimate and labels it.
//
// Pure functions over Float32Array — synthesizable in tests.

/** RMS frames. Returns { rms: Float32Array, frameSec }. */
export function frameRms(pcm, sampleRate, frameMs = 25, hopMs = 10) {
  const frameLen = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const hopLen = Math.max(1, Math.round((sampleRate * hopMs) / 1000));
  const frames = Math.max(0, Math.floor((pcm.length - frameLen) / hopLen) + 1);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hopLen;
    for (let i = 0; i < frameLen; i++) {
      const v = pcm[start + i] || 0;
      sum += v * v;
    }
    rms[f] = Math.sqrt(sum / frameLen);
  }
  return { rms, frameSec: hopLen / sampleRate };
}

/** Smooth a series with a moving average (odd window). */
function smooth(series, win = 5) {
  const out = new Float32Array(series.length);
  const half = Math.floor(win / 2);
  for (let i = 0; i < series.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(series.length - 1, i + half); j++) {
      sum += series[j]; n += 1;
    }
    out[i] = sum / n;
  }
  return out;
}

/**
 * Syllable nuclei from the energy envelope: local maxima above a fraction of
 * the peak, at least 120ms apart (French syllables rarely run faster).
 * Regularity = coefficient of variation of inter-nucleus intervals — French
 * is syllable-timed, so practiced speech has low CV.
 */
export function syllableNuclei(pcm, sampleRate) {
  const { rms, frameSec } = frameRms(pcm, sampleRate);
  if (!rms.length) return { count: 0, intervalsMs: [], regularity: null, ratePerSec: 0 };
  const env = smooth(rms, 5);
  const peak = Math.max(...env);
  if (peak <= 0) return { count: 0, intervalsMs: [], regularity: null, ratePerSec: 0 };
  const threshold = peak * 0.35;
  const minDistFrames = Math.max(1, Math.round(0.15 / frameSec));
  const nuclei = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < threshold) continue;
    // Local max on at least one side, tolerant of flat tops (a pure tone's
    // RMS plateaus after smoothing): at least one strict inequality.
    const up = env[i] >= env[i - 1];
    const down = env[i] >= env[i + 1];
    if (!(up && down && (env[i] > env[i - 1] || env[i] > env[i + 1]))) continue;
    const last = nuclei[nuclei.length - 1];
    if (last == null) { nuclei.push(i); continue; }
    if (i - last < minDistFrames) {
      // Too close: keep whichever is the stronger peak.
      if (env[i] > env[last]) nuclei[nuclei.length - 1] = i;
      continue;
    }
    // Prominence: the valley since the last nucleus must drop well below
    // this peak, otherwise it is the same syllable's shoulder.
    const valley = Math.min(...env.slice(last, i + 1));
    if (env[i] - valley < peak * 0.25) continue;
    nuclei.push(i);
  }
  const intervalsMs = [];
  for (let i = 1; i < nuclei.length; i++) {
    intervalsMs.push(Math.round((nuclei[i] - nuclei[i - 1]) * frameSec * 1000));
  }
  let regularity = null;
  if (intervalsMs.length >= 3) {
    const mean = intervalsMs.reduce((a, b) => a + b, 0) / intervalsMs.length;
    const variance = intervalsMs.reduce((a, b) => a + (b - mean) ** 2, 0) / intervalsMs.length;
    const cv = Math.sqrt(variance) / mean;
    regularity = Math.max(0, Math.min(1, Math.round((1 - cv) * 100) / 100));
  }
  const speechSec = rms.length * frameSec;
  return { count: nuclei.length, intervalsMs, regularity, ratePerSec: speechSec > 0 ? Math.round((nuclei.length / speechSec) * 100) / 100 : 0 };
}

/**
 * Autocorrelation voicing + F0 per frame. Returns { voicedRatio, f0Median,
 * f0Series } — f0 entries are Hz where voiced, null where not.
 */
export function voicingF0(pcm, sampleRate, { frameMs = 40, hopMs = 20, fmin = 70, fmax = 400 } = {}) {
  const frameLen = Math.round((sampleRate * frameMs) / 1000);
  const hopLen = Math.round((sampleRate * hopMs) / 1000);
  const lagMin = Math.floor(sampleRate / fmax);
  const lagMax = Math.min(frameLen - 1, Math.ceil(sampleRate / fmin));
  const f0Series = [];
  let voicedFrames = 0;
  for (let start = 0; start + frameLen <= pcm.length; start += hopLen) {
    let energy = 0;
    for (let i = 0; i < frameLen; i++) energy += (pcm[start + i] || 0) ** 2;
    if (Math.sqrt(energy / frameLen) < 0.015) { f0Series.push(null); continue; }
    // Normalised autocorrelation over the lag range, with SUBMULTIPLE
    // descent: a periodic signal correlates ~equally at every integer
    // multiple of the true period, and float noise decides which lag wins.
    // After finding the best lag, repeatedly try dividing it by 2..6 — if
    // the divided lag still correlates strongly, it is the real period.
    const rAt = (lag) => {
      let num = 0, e1 = 0, e2 = 0;
      for (let i = 0; i + lag < frameLen; i++) {
        const a = pcm[start + i] || 0;
        const b = pcm[start + i + lag] || 0;
        num += a * b; e1 += a * a; e2 += b * b;
      }
      return num / Math.max(1e-9, Math.sqrt(e1 * e2));
    };
    let bestLag = -1, bestR = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      const r = rAt(lag);
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    let fundamental = -1;
    if (bestR >= 0.45 && bestLag > 0) {
      fundamental = bestLag;
      let changed = true;
      while (changed && fundamental > lagMin) {
        changed = false;
        for (let d = 2; d <= 6; d++) {
          const cand = Math.round(fundamental / d);
          if (cand < lagMin || cand === fundamental) continue;
          if (Math.abs(fundamental - cand * d) > Math.max(2, cand * 0.08)) continue;
          if (rAt(cand) >= bestR * 0.88) {
            fundamental = cand;
            changed = true;
            break;
          }
        }
      }
      // One-lag walk-down across the near-equal boundary cluster.
      while (fundamental - 1 >= lagMin && rAt(fundamental - 1) >= bestR * 0.98) {
        fundamental -= 1;
      }
    }
    if (fundamental > 0) {
      voicedFrames += 1;
      f0Series.push(Math.round(sampleRate / fundamental));
    } else {
      f0Series.push(null);
    }
  }
  const voiced = f0Series.filter((f) => f != null).sort((a, b) => a - b);
  const f0Median = voiced.length ? voiced[Math.floor(voiced.length / 2)] : null;
  return { voicedRatio: f0Series.length ? Math.round((voicedFrames / f0Series.length) * 100) / 100 : 0, f0Median, f0Series };
}

/**
 * Median F0 over a time window [fromSec, toSec). Null when too few voiced
 * frames — callers treat that as "could not estimate".
 */
export function medianF0InWindow(f0Series, hopSec, fromSec, toSec) {
  const from = Math.floor(fromSec / hopSec);
  const to = Math.ceil(toSec / hopSec);
  const values = f0Series.slice(from, to + 1).filter((f) => f != null).sort((a, b) => a - b);
  return values.length >= 3 ? values[Math.floor(values.length / 2)] : null;
}

/** Semitone distance between two pitches (null-safe). */
export function semitones(f0A, f0B) {
  if (!f0A || !f0B) return null;
  return Math.round(12 * Math.log2(f0B / f0A) * 10) / 10;
}

/**
 * Band energies via per-frame Goertzel at the band centre (a coarse but
 * honest proxy: real formant tracking needs LPC). Returns mean share of
 * total energy in each band, as { [name]: share } with shares in 0..1.
 */
export function bandShares(pcm, sampleRate, bands = [], { frameMs = 25, hopMs = 25 } = {}) {
  const frameLen = Math.round((sampleRate * frameMs) / 1000);
  const hopLen = Math.round((sampleRate * hopMs) / 1000);
  const totals = Object.fromEntries(bands.map((b) => [b.name, 0]));
  let grand = 0;
  const coeffs = bands.map((b) => {
    const freq = (b.lo + b.hi) / 2;
    const w = (2 * Math.PI * freq) / sampleRate;
    return { name: b.name, coeff: 2 * Math.cos(w) };
  });
  for (let start = 0; start + frameLen <= pcm.length; start += hopLen) {
    const powers = Object.fromEntries(bands.map((b) => [b.name, 0]));
    const state = Object.fromEntries(bands.map((b) => [b.name, { s1: 0, s2: 0 }]));
    let frameEnergy = 0;
    for (let i = 0; i < frameLen; i++) {
      const v = pcm[start + i] || 0;
      frameEnergy += v * v;
      for (const c of coeffs) {
        const s = state[c.name];
        const s0 = v + c.coeff * s.s1 - s.s2;
        s.s2 = s.s1; s.s1 = s0;
      }
    }
    for (const c of coeffs) {
      const s = state[c.name];
      const power = s.s1 * s.s1 + s.s2 * s.s2 - c.coeff * s.s1 * s.s2;
      powers[c.name] += Math.max(0, power);
    }
    if (frameEnergy > 0) {
      for (const b of bands) totals[b.name] += powers[b.name];
      grand += frameEnergy;
    }
  }
  const shares = {};
  if (grand > 0) for (const b of bands) shares[b.name] = Math.round((totals[b.name] / grand) * 1000) / 1000;
  return shares;
}

/** Decode a recorded Blob to mono Float32 PCM at ~16 kHz. Browser-only. */
export async function decodeToMono16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('Web Audio unavailable');
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close().catch(() => {});
    const rate = 16000;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new OfflineCtx(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return { pcm: rendered.getChannelData(0), sampleRate: rate, durationSec: rendered.duration };
  } finally {
    try { ctx.close(); } catch { /* already closed */ }
  }
}
