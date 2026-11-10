/** „Besti kaflinn“: finnur hvar í lagi hápunktar tónlistarinnar falla best að
 *  hápunktunum í dansinum, og raðar lögum eftir því hversu vel þau passa.
 *  Hrein reikniaðgerð — prófuð í node. */

import type { Highlight } from "./analyze";

export type Match = {
  /** Hvar kaflinn byrjar í laginu (sek). */
  start: number;
  /** 0–1: meðalstyrkur þeirra hápunkta lagsins sem lenda á dansinum. */
  score: number;
  /** Hversu margir hápunktar í dansinum fá hápunkt í laginu á sig (innan ~0,35 sek). */
  hits: number;
  total: number;
};

const SIGMA = 0.25;
const TOLERANCE = 0.35;

function scoreAt(start: number, highlights: Highlight[], markers: number[], tempo: number): { score: number; hits: number } {
  let sum = 0;
  let hits = 0;
  for (const m of markers) {
    const want = start + m * tempo;
    let best = 0;
    let hit = false;
    for (const h of highlights) {
      const d = h.t - want;
      if (d < -1.5) continue;
      if (d > 1.5) break;
      const v = h.score * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      if (v > best) best = v;
      if (Math.abs(d) <= TOLERANCE && h.score >= 0.15) hit = true;
    }
    sum += best;
    if (hit) hits++;
  }
  return { score: markers.length ? sum / markers.length : 0, hits };
}

/** Bestu staðirnir í laginu fyrir kafla af lengdinni `length` (sek á tímalínu
 *  rútínunnar) þar sem `markers` (sek frá byrjun kaflans) eiga að lenda á
 *  hápunktum lagsins. Skilar mest `top` kostum, bestur fyrst, með minnst
 *  2 sek á milli. Tómt ef engir hápunktar eru í dansinum. */
export function bestMatches(
  highlights: Highlight[],
  markers: number[],
  length: number,
  duration: number,
  tempo = 1,
  top = 3,
): Match[] {
  const inside = markers.filter((m) => m >= 0 && m <= length);
  const lastStart = duration - length * tempo;
  if (!inside.length || !highlights.length || lastStart < 0) return [];
  const sorted = highlights.slice().sort((a, b) => a.t - b.t);
  // Hver hápunktur lagsins á hvern hápunkt dansins gefur einn kost.
  const seen = new Set<number>();
  const options: Match[] = [];
  for (const h of sorted) {
    for (const m of inside) {
      const start = Math.min(lastStart, Math.max(0, h.t - m * tempo));
      const key = Math.round(start * 20);
      if (seen.has(key)) continue;
      seen.add(key);
      const { score, hits } = scoreAt(start, sorted, inside, tempo);
      options.push({ start, score, hits, total: inside.length });
    }
  }
  options.sort((a, b) => b.hits - a.hits || b.score - a.score);
  const picked: Match[] = [];
  for (const o of options) {
    if (picked.length >= top) break;
    if (picked.every((p) => Math.abs(p.start - o.start) >= 2)) picked.push(o);
  }
  return picked;
}

/** Hversu vel lag passar við dansinn (besti kaflinn í því), 0–1. */
export function songFit(highlights: Highlight[] | undefined, markers: number[], length: number, duration: number): Match | null {
  if (!highlights?.length) return null;
  return bestMatches(highlights, markers, length, duration, 1, 1)[0] ?? null;
}
