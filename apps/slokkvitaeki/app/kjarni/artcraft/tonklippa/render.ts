/** Blöndun: rútínan (bútar, samskeyti, hraði, styrkur, mjúk byrjun og endir)
 *  reiknuð í eina steríóupptöku. Sama fall er notað fyrir hlustun og
 *  útflutning, svo það sem heyrist er það sem er vistað. Prófað í node. */

import { MIN_SEAM, layout, type Arrangement, type SeamFx } from "./arrange";
import type { Samples } from "./analyze";
import { timeStretch } from "./stretch";

export type TrackAudio = {
  sampleRate: number;
  /** Ein eða tvær rásir. */
  channels: Samples[];
  /** Margfaldari í −1…1 (1/32768 fyrir 16 bita, 1 fyrir fleytitölur). */
  scale: number;
};

export type Mix = {
  sampleRate: number;
  channels: [Float32Array, Float32Array];
  /** Hæsta útslag fyrir sjálfvirka lækkun, og lækkunin sem var beitt (1 = engin). */
  peak: number;
  gain: number;
};

export function trackDuration(t: TrackAudio): number {
  return (t.channels[0]?.length ?? 0) / t.sampleRate;
}

/** Kafli [from, to] sek úr laginu sem steríó fleytitölur á `outRate`.
 *  Utan lagsins er þögn. */
export function extract(track: TrackAudio, from: number, to: number, outRate: number): [Float32Array, Float32Array] {
  const n = Math.max(0, Math.round((to - from) * outRate));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const src = track.channels;
  const len = src[0]?.length ?? 0;
  if (!len || !n) return [left, right];
  const ratio = track.sampleRate / outRate;
  const startSample = from * track.sampleRate;
  const scale = track.scale;
  const same = Math.abs(ratio - 1) < 1e-9;
  for (let c = 0; c < 2; c++) {
    const ch = src[Math.min(c, src.length - 1)];
    const dst = c === 0 ? left : right;
    if (c === 1 && src.length === 1) {
      dst.set(left);
      break;
    }
    if (same) {
      const s0 = Math.round(startSample);
      const a = Math.max(0, -s0);
      const b = Math.min(n, len - s0);
      for (let i = a; i < b; i++) dst[i] = ch[s0 + i] * scale;
    } else {
      for (let i = 0; i < n; i++) {
        const x = startSample + i * ratio;
        const i0 = Math.floor(x);
        if (i0 < 0 || i0 >= len) continue;
        const i1 = Math.min(len - 1, i0 + 1);
        const f = x - i0;
        dst[i] = (ch[i0] * (1 - f) + ch[i1] * f) * scale;
      }
    }
  }
  return [left, right];
}

/** Geymir hraðabreytta búta á milli blandana (dýrasti hlutinn). */
export type StretchCache = Map<string, [Float32Array, Float32Array]>;

const CACHE_MAX = 16;

function stretched(
  cache: StretchCache | undefined,
  key: string,
  make: () => [Float32Array, Float32Array],
): [Float32Array, Float32Array] {
  if (!cache) return make();
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = make();
  cache.set(key, made);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return made;
}

export const HEADROOM = 0.98;

/** Áhrifshljóð á samskeytum, búin til úr suði og sínusbylgju (engar skrár):
 *  „svúss“ sem rís síðustu 1,6 sek fyrir skilin og/eða högg á skilunum. Sama
 *  fræ gefur sama hljóð, svo hlustun og útflutningur eru eins. */
export function addSeamFx(L: Float32Array, R: Float32Array, at: number, sampleRate: number, fx: SeamFx, seed = 1): void {
  const n = L.length;
  let state = (seed * 2654435761) >>> 0 || 1;
  const noise = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 2147483648 - 1;
  };
  if (fx === "riser" || fx === "both") {
    // Suð í gegnum bandsíu sem sópar upp úr 300 Hz í 9 kHz, styrkur rís.
    const len = Math.round(1.6 * sampleRate);
    const cut = Math.round(0.006 * sampleRate);
    let lowL = 0;
    let bandL = 0;
    let lowR = 0;
    let bandR = 0;
    for (let k = 0; k < len; k++) {
      const j = at - len + k;
      const x = k / len;
      const f = 2 * Math.sin((Math.PI * Math.min(0.24 * sampleRate, 300 * Math.pow(30, x))) / sampleRate);
      const q = 0.35;
      const inL = noise();
      const inR = noise();
      lowL += f * bandL;
      bandL += f * (inL - lowL - q * bandL);
      lowR += f * bandR;
      bandR += f * (inR - lowR - q * bandR);
      if (j < 0 || j >= n) continue;
      const g = 0.2 * x * x * (k > len - cut ? (len - k) / cut : 1);
      L[j] += bandL * g;
      R[j] += bandR * g;
    }
  }
  if (fx === "impact" || fx === "both") {
    // Djúpur dynkur sem fellur úr 95 í 38 Hz + suðskvetta + langur hali.
    const len = Math.round(1.5 * sampleRate);
    let phase = 0;
    let lp = 0;
    for (let k = 0; k < len; k++) {
      const j = at + k;
      if (j >= n) break;
      const t = k / sampleRate;
      phase += (2 * Math.PI * (38 + 57 * Math.exp(-t / 0.09))) / sampleRate;
      const boom = 0.5 * Math.exp(-t / 0.22) * Math.sin(phase);
      const a = noise();
      const b = noise();
      lp += 0.25 * ((a + b) / 2 - lp);
      const burst = 0.26 * Math.exp(-t / 0.07) * lp;
      const tail = 0.07 * Math.exp(-t / 0.45);
      const ramp = Math.min(1, k / (0.002 * sampleRate));
      if (j < 0) continue;
      L[j] += (boom + burst + tail * a) * ramp;
      R[j] += (boom + burst + tail * b) * ramp;
    }
  }
}

export function renderMix(
  arr: Arrangement,
  tracks: ReadonlyMap<string, TrackAudio>,
  sampleRate: number,
  cache?: StretchCache,
): Mix {
  const lay = layout(arr);
  const n = Math.max(0, Math.round(lay.total * sampleRate));
  const L = new Float32Array(n);
  const R = new Float32Array(n);

  arr.parts.forEach((p, i) => {
    const track = tracks.get(p.trackId);
    if (!track) return;
    const halfIn = lay.half[i];
    const halfOut = i + 1 < arr.parts.length ? lay.half[i + 1] : 0;
    // Bútnum fylgir „handfang“ út fyrir skilin sem samskeytin nota.
    const from = p.start - halfIn * p.tempo;
    const to = p.end + halfOut * p.tempo;
    const seg =
      Math.abs(p.tempo - 1) < 1e-4
        ? extract(track, from, to, sampleRate)
        : stretched(cache, `${p.trackId}|${from.toFixed(4)}|${to.toFixed(4)}|${p.tempo}|${sampleRate}`, () => {
            const raw = extract(track, from, to, sampleRate);
            const out = timeStretch(raw, p.tempo, sampleRate);
            return [out[0], out[1]];
          });
    const gain = Math.pow(10, p.gainDb / 20);
    const first = Math.round((lay.pos[i] - halfIn) * sampleRate);
    const inLen = Math.round(2 * halfIn * sampleRate);
    const outLen = Math.round(2 * halfOut * sampleRate);
    const segLen = Math.min(seg[0].length, Math.round((lay.len[i] + halfIn + halfOut) * sampleRate));
    const outStart = segLen - outLen;
    for (let k = 0; k < segLen; k++) {
      const j = first + k;
      if (j < 0 || j >= n) continue;
      let g = gain;
      // Jafnafls-samskeyti: sin inn, cos út.
      if (k < inLen) g *= Math.sin(((k + 0.5) / inLen) * (Math.PI / 2));
      if (k >= outStart && outLen > 0) g *= Math.cos(((k - outStart + 0.5) / outLen) * (Math.PI / 2));
      L[j] += seg[0][k] * g;
      R[j] += seg[1][k] * g;
    }
  });

  arr.parts.forEach((p, i) => {
    if (i > 0 && p.fx) addSeamFx(L, R, Math.round(lay.pos[i] * sampleRate), sampleRate, p.fx, i);
  });

  // Mjúk byrjun og endir (alltaf að minnsta kosti örstutt, svo ekki smelli).
  const fade = (seconds: number) => Math.min(Math.round(Math.max(seconds, MIN_SEAM) * sampleRate), n >> 1);
  const fin = fade(arr.fadeIn);
  for (let i = 0; i < fin; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * (i + 0.5)) / fin);
    L[i] *= g;
    R[i] *= g;
  }
  const fout = fade(arr.fadeOut);
  for (let i = 0; i < fout; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * (i + 0.5)) / fout);
    L[n - 1 - i] *= g;
    R[n - 1 - i] *= g;
  }

  let peak = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(L[i]);
    const b = Math.abs(R[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  let gain = 1;
  if (peak > HEADROOM) {
    gain = HEADROOM / peak;
    for (let i = 0; i < n; i++) {
      L[i] *= gain;
      R[i] *= gain;
    }
  }
  return { sampleRate, channels: [L, R], peak, gain };
}
