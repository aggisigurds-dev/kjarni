/** Greining á lagi: bylgjuform til að teikna, slög (taktur) til að smella
 *  klippingu á, og „toppar“ — sterkustu slögin — sem hægt er að láta lenda á
 *  hápunktum í dansinum. Hrein reikniaðgerð, prófuð í node. */

import type { Accent } from "./arrange";

export type Samples = Float32Array | Int16Array;

// ------------------------------------------------------------------ bylgjuform

export type Peaks = {
  /** Sýni í hverju hólfi. */
  bucket: number;
  sampleRate: number;
  /** Hæsta útslag og meðalstyrkur (RMS) hvers hólfs, 0–255. */
  peak: Uint8Array;
  rms: Uint8Array;
};

export function buildPeaks(channels: Samples[], scale: number, sampleRate: number, bucket = 256): Peaks {
  const len = channels[0]?.length ?? 0;
  const n = Math.ceil(len / bucket);
  const peak = new Uint8Array(n);
  const rms = new Uint8Array(n);
  const nch = channels.length || 1;
  for (let b = 0; b < n; b++) {
    const from = b * bucket;
    const to = Math.min(len, from + bucket);
    let mx = 0;
    let sq = 0;
    for (let i = from; i < to; i++) {
      let v = 0;
      for (let c = 0; c < channels.length; c++) v += channels[c][i];
      v = (v / nch) * scale;
      const a = v < 0 ? -v : v;
      if (a > mx) mx = a;
      sq += v * v;
    }
    peak[b] = Math.min(255, Math.round(mx * 255));
    rms[b] = Math.min(255, Math.round(Math.sqrt(sq / Math.max(1, to - from)) * 255));
  }
  return { bucket, sampleRate, peak, rms };
}

/** Útslag (0–1) fyrir `columns` dálka sem spanna [t0, t1] sek í laginu. */
export function columnPeaks(p: Peaks, t0: number, t1: number, columns: number, kind: "peak" | "rms" = "peak"): Float32Array {
  const out = new Float32Array(Math.max(0, columns));
  const src = kind === "peak" ? p.peak : p.rms;
  if (!columns || t1 <= t0) return out;
  const perSec = p.sampleRate / p.bucket;
  const span = ((t1 - t0) * perSec) / columns;
  for (let x = 0; x < columns; x++) {
    const a = Math.floor(t0 * perSec + x * span);
    const b = Math.max(a + 1, Math.ceil(t0 * perSec + (x + 1) * span));
    let mx = 0;
    for (let i = Math.max(0, a); i < b && i < src.length; i++) if (src[i] > mx) mx = src[i];
    out[x] = mx / 255;
  }
  return out;
}

// ------------------------------------------------------------------ taktur

export type Analysis = {
  /** Slög á mínútu (0 ef ekkert fannst). */
  bpm: number;
  /** 0–1: hversu jafn og skýr takturinn er. Undir ~0,12 er honum ekki treyst. */
  steady: number;
  /** Tímar slaganna (sek). */
  beats: Float32Array;
  /** Sterk slög / áherslur, raðað eftir tíma. */
  accents: Accent[];
};

export const STEADY_ENOUGH = 0.12;

/** „Nýtt hljóð“-ferill, 100 gildi á sek: hversu mikið orkan stekkur upp í
 *  bassa, diskanti og heild. */
export function onsetEnvelope(channels: Samples[], scale: number, sampleRate: number): { env: Float32Array; fps: number } {
  const len = channels[0]?.length ?? 0;
  const hop = Math.max(1, Math.round(sampleRate / 100));
  const fps = sampleRate / hop;
  const frames = Math.floor(len / hop);
  const env = new Float32Array(frames);
  if (frames < 4) return { env, fps };
  const nch = channels.length || 1;
  const aLow = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  const aHigh = 1 - Math.exp((-2 * Math.PI * 2500) / sampleRate);
  let lp = 0;
  let lp2 = 0;
  const eLow = new Float32Array(frames);
  const eHigh = new Float32Array(frames);
  const eAll = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sl = 0;
    let sh = 0;
    let sa = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) {
      let v = 0;
      for (let c = 0; c < channels.length; c++) v += channels[c][base + i];
      v = (v / nch) * scale;
      lp += aLow * (v - lp);
      lp2 += aHigh * (v - lp2);
      const hi = v - lp2;
      sl += lp * lp;
      sh += hi * hi;
      sa += v * v;
    }
    eLow[f] = sl / hop;
    eHigh[f] = sh / hop;
    eAll[f] = sa / hop;
  }
  const flux = (e: Float32Array, weight: number) => {
    let prev = Math.log10(1 + 2000 * (e[0] + e[1]));
    for (let f = 2; f < frames; f++) {
      const cur = Math.log10(1 + 2000 * (e[f] + e[f - 1]));
      const d = cur - prev;
      if (d > 0) env[f] += weight * d;
      prev = cur;
    }
  };
  flux(eLow, 1.2);
  flux(eHigh, 1);
  flux(eAll, 0.6);
  // Draga frá staðarmeðaltal (±0,5 s) svo hávær kafli drekki ekki slögunum.
  const half = Math.round(fps / 2);
  const out = new Float32Array(frames);
  const prefix = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) prefix[f + 1] = prefix[f] + env[f];
  for (let f = 0; f < frames; f++) {
    const a = Math.max(0, f - half);
    const b = Math.min(frames, f + half + 1);
    const v = env[f] - (prefix[b] - prefix[a]) / (b - a);
    out[f] = v > 0 ? v : 0;
  }
  // Staðla (staðalfrávik 1).
  let sq = 0;
  for (let f = 0; f < frames; f++) sq += out[f] * out[f];
  const sd = Math.sqrt(sq / frames);
  if (sd > 1e-9) for (let f = 0; f < frames; f++) out[f] /= sd;
  return { env: out, fps };
}

/** Lengd slags (í römmum) úr sjálffylgni ferilsins, 60–200 slög/mín. */
export function estimatePeriod(env: Float32Array, fps: number): { period: number; steady: number } {
  const n = env.length;
  const minLag = Math.max(2, Math.floor((fps * 60) / 200));
  const maxLag = Math.ceil((fps * 60) / 60);
  if (n < maxLag * 4) return { period: 0, steady: 0 };
  const acf = new Float32Array(maxLag * 3 + 2);
  let zero = 0;
  for (let t = 0; t < n; t++) zero += env[t] * env[t];
  for (let lag = 1; lag < acf.length; lag++) {
    let s = 0;
    for (let t = 0; t + lag < n; t++) s += env[t] * env[t + lag];
    acf[lag] = s / Math.max(1, n - lag);
  }
  zero /= n;
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const oct = Math.log2(bpm / 120);
    const prior = Math.exp(-0.5 * (oct / 0.9) * (oct / 0.9));
    const score = prior * (acf[lag] + 0.5 * acf[lag * 2] + 0.25 * acf[lag * 3]);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  if (!best || zero <= 0) return { period: 0, steady: 0 };
  // Fínstilla með fleygboga gegnum grannana.
  const y0 = acf[best - 1];
  const y1 = acf[best];
  const y2 = acf[best + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = Math.abs(denom) > 1e-12 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
  return { period: best + shift, steady: Math.max(0, Math.min(1, acf[best] / zero)) };
}

/** Slagaleit (kvik bestun, Ellis 2007): slög sem fylgja ferlinum en halda jöfnu bili. */
export function trackBeats(env: Float32Array, period: number, tightness = 100): number[] {
  const n = env.length;
  if (!(period > 1) || n < period * 2) return [];
  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.max(1, Math.round(period / 2));
  const hi = Math.round(period * 2);
  const cost = new Float32Array(hi + 1);
  for (let d = lo; d <= hi; d++) {
    const l = Math.log(d / period);
    cost[d] = -tightness * l * l;
  }
  for (let t = 0; t < n; t++) {
    let best = -Infinity;
    let bestPrev = -1;
    for (let d = lo; d <= hi; d++) {
      const p = t - d;
      if (p < 0) break;
      const s = score[p] + cost[d];
      if (s > best) {
        best = s;
        bestPrev = p;
      }
    }
    if (bestPrev >= 0 && best > 0) {
      score[t] = env[t] + best;
      back[t] = bestPrev;
    } else {
      score[t] = env[t];
    }
  }
  // Byrja aftast: besti rammi í síðasta slaginu.
  let end = n - 1;
  let bestEnd = -Infinity;
  for (let t = Math.max(0, n - Math.round(period)); t < n; t++) {
    if (score[t] > bestEnd) {
      bestEnd = score[t];
      end = t;
    }
  }
  const beats: number[] = [];
  for (let t = end; t >= 0; t = back[t]) {
    beats.push(t);
    if (back[t] < 0) break;
  }
  return beats.reverse();
}

export function findAccents(env: Float32Array, fps: number): Accent[] {
  const n = env.length;
  if (!n) return [];
  let mean = 0;
  let max = 0;
  for (let f = 0; f < n; f++) {
    mean += env[f];
    if (env[f] > max) max = env[f];
  }
  mean /= n;
  if (max <= 0) return [];
  // Ferillinn er staðlaður (staðalfrávik 1), svo þröskuldurinn er meðaltal + 1.
  const thr = mean + 1;
  const reach = Math.max(1, Math.round(fps * 0.15));
  const out: Accent[] = [];
  for (let f = 1; f < n - 1; f++) {
    const v = env[f];
    if (v < thr) continue;
    let isMax = true;
    for (let j = Math.max(0, f - reach); j <= Math.min(n - 1, f + reach); j++) {
      if (env[j] > v || (env[j] === v && j < f)) {
        isMax = false;
        break;
      }
    }
    if (isMax) out.push({ t: f / fps, strength: v / max });
  }
  return out;
}

export function analyzeTrack(channels: Samples[], scale: number, sampleRate: number): Analysis {
  const { env, fps } = onsetEnvelope(channels, scale, sampleRate);
  const accents = findAccents(env, fps);
  const { period, steady } = estimatePeriod(env, fps);
  if (!period) return { bpm: 0, steady: 0, beats: new Float32Array(0), accents };
  const frames = trackBeats(env, period);
  const beats = Float32Array.from(frames, (f) => f / fps);
  // Slög/mín úr miðgildi bilanna (fylgir því sem slagaleitin fann í raun).
  let bpm = (60 * fps) / period;
  if (beats.length > 4) {
    const gaps = Array.from({ length: beats.length - 1 }, (_, i) => beats[i + 1] - beats[i]).sort((a, b) => a - b);
    const med = gaps[gaps.length >> 1];
    if (med > 0) bpm = 60 / med;
  }
  return { bpm, steady, beats, accents };
}

/** Byrjun (sek) á líflegasta samfellda kaflanum af lengdinni `seconds`. */
export function liveliestWindow(p: Peaks, seconds: number): number {
  const perSec = p.sampleRate / p.bucket;
  const w = Math.max(1, Math.round(seconds * perSec));
  const n = p.rms.length;
  if (n <= w) return 0;
  let sum = 0;
  for (let i = 0; i < w; i++) sum += p.rms[i] * p.rms[i];
  let best = sum;
  let bestAt = 0;
  for (let i = w; i < n; i++) {
    sum += p.rms[i] * p.rms[i] - p.rms[i - w] * p.rms[i - w];
    if (sum > best) {
      best = sum;
      bestAt = i - w + 1;
    }
  }
  return bestAt / perSec;
}
