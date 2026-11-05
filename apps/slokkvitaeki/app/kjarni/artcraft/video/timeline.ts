/** Tímalína fyrir myndbandaklippur sem eru klipptar (inn/út-punktar) og
 *  skeyttar saman — hrein föll, prófuð í node. Notuð af Skýjahreyfimynd,
 *  Myndband-framhaldi og myndbandsham Móta. */

export type Segment = {
  /** Lengd skrárinnar sjálfrar í sekúndum. */
  duration: number;
  /** Byrjar hér (sek). */
  inT: number;
  /** Endar hér (sek). */
  outT: number;
};

export function segmentLength(s: Segment): number {
  const a = Math.max(0, Math.min(s.inT, s.duration));
  const b = Math.max(a, Math.min(s.outT, s.duration));
  return b - a;
}

export function totalLength(segs: readonly Segment[]): number {
  return segs.reduce((sum, s) => sum + segmentLength(s), 0);
}

/** Hvaða klippa og hvaða staður í henni samsvarar tíma `t` á tímalínunni. */
export function locate(segs: readonly Segment[], t: number): { index: number; local: number } {
  if (segs.length === 0) return { index: -1, local: 0 };
  let rest = Math.max(0, t);
  for (let i = 0; i < segs.length; i++) {
    const len = segmentLength(segs[i]);
    // Á mörkum tveggja klippa: byrjun næstu (nema í allra síðustu).
    if (rest < len || i === segs.length - 1) {
      return { index: i, local: Math.max(segs[i].inT, 0) + Math.min(rest, len) };
    }
    rest -= len;
  }
  return { index: segs.length - 1, local: segs[segs.length - 1].outT };
}

/** Tími á tímalínunni fyrir stað `local` í klippu `index`. */
export function globalTime(segs: readonly Segment[], index: number, local: number): number {
  let t = 0;
  for (let i = 0; i < index && i < segs.length; i++) t += segmentLength(segs[i]);
  const s = segs[index];
  if (!s) return t;
  return t + Math.min(segmentLength(s), Math.max(0, local - s.inT));
}

/** Sjálfgefinn staður til að halda áfram frá: sekúndu fyrir enda. Myndbönd
 *  úr myndlíkönum enda oft nálægt upphafsstöðunni („boomerang“) — framhald
 *  úr allra síðasta rammanum endurtekur þá sömu hreyfingu. */
export function defaultContinueTime(duration: number, before = 1): number {
  if (!(duration > 0)) return 0;
  return Math.max(0, Math.min(duration, duration - before));
}

export function snapToFrame(t: number, fps: number): number {
  if (!(fps > 0)) return t;
  return Math.round(t * fps) / fps;
}

/** Halda áfram frá tíma `t`: klippan sem `t` lendir í er klippt þar, klippur
 *  á eftir henni detta út, og nýja klippan bætist við — fyrsti rammi hennar
 *  er sá sem hún var búin til úr, svo honum er sleppt (annars kemur hann
 *  tvisvar við samskeytin). */
export function continueAt<T extends Segment>(segs: readonly T[], t: number, next: T, fps = 16): T[] {
  if (segs.length === 0) return [next];
  const { index, local } = locate(segs, t);
  const kept = segs.slice(0, index + 1).map((s, i) => (i === index ? { ...s, outT: local } : s));
  const skip = fps > 0 ? 1 / fps : 0;
  return [...kept, { ...next, inT: Math.min(next.duration, Math.max(next.inT, skip)) }];
}

/** „6,3“ — íslensk tugabrot, ein aukastafur. */
export function formatSeconds(t: number): string {
  return (Math.round(Math.max(0, t) * 10) / 10).toFixed(1).replace(".", ",");
}
