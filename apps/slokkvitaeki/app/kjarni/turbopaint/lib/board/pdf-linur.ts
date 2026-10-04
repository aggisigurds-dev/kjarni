// „Eyða línu" (Agnar 04.10.2026: „ef maður gæti valið ákveðnar línur sem maður vill helst ekki hafa þarna og eytt
// þeim"): smellt á línu í vigur-PDF teikningu → strikið sem smellt var á og samliggjandi bútar þess (strikalína, CAD
// sem brýtur línu upp) í sama línuflokki finnast. Hrein reikniföll — engin pdf.js hér.

import type { Strik } from "./pdf-veggir";

function fjarlaegdAdStriki(px: number, py: number, s: Strik) {
  const [ax, ay, bx, by] = s;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Finnur línuna við punktinn (pt): næsta strik innan `vik` og öll samliggjandi strik í sama flokki — sama stefna,
 * á sömu línu, og bil milli búta ≤ `bil` (strikalínur, brotnar línur). Skilar strikum og flokknum (línuþykkt). */
export function finnaLinu(
  flokkar: Record<string, Strik[]>,
  p: [number, number],
  vik: number,
  bil = 14
): { strik: Strik[]; flokkur: string } | null {
  // Löng lína vinnur stutt strik sem liggur aðeins nær (bílar, tákn og letur eru úr örstuttum strikum — prófað á
  // Fiskislóð 04.10.2026: sveimi yfir skálínu sem lá yfir bíl valdi útlínu bílsins). Stig = fjarlægð/vik − lengdarbónus.
  let best: { s: Strik; l: string; d: number; stig: number } | null = null;
  for (const l of Object.keys(flokkar)) {
    for (const s of flokkar[l]) {
      if (s[0] === s[2] && s[1] === s[3]) continue;
      const d = fjarlaegdAdStriki(p[0], p[1], s);
      if (d > vik) continue;
      const lengd = Math.hypot(s[2] - s[0], s[3] - s[1]);
      const stig = d / vik - 0.6 * Math.min(1, lengd / (12 * vik));
      if (!best || stig < best.stig) best = { s, l, d, stig };
    }
  }
  if (!best) return null;
  const [ax, ay, bx, by] = best.s;
  const L = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const nx = -uy, ny = ux;
  const thol = Math.max(0.6, vik * 0.5);
  // frambjóðendur: sama flokkur, samsíða (< ~0,7°), báðir endar á línunni
  const kandidatar: { s: Strik; t0: number; t1: number }[] = [];
  for (const s of flokkar[best.l]) {
    const sx = s[2] - s[0], sy = s[3] - s[1], sl = Math.hypot(sx, sy);
    if (!sl) continue;
    if (Math.abs((sx / sl) * nx + (sy / sl) * ny) > 0.012) continue;
    const d0 = (s[0] - ax) * nx + (s[1] - ay) * ny, d1 = (s[2] - ax) * nx + (s[3] - ay) * ny;
    if (Math.abs(d0) > thol || Math.abs(d1) > thol) continue;
    const t0 = (s[0] - ax) * ux + (s[1] - ay) * uy, t1 = (s[2] - ax) * ux + (s[3] - ay) * uy;
    kandidatar.push({ s, t0: Math.min(t0, t1), t1: Math.max(t0, t1) });
  }
  // keðja út frá smellta strikinu í báðar áttir meðan bilið er ≤ `bil`
  let a = 0, b = L;
  const valin = new Set<Strik>([best.s]);
  let breytt = true;
  while (breytt) {
    breytt = false;
    for (const k of kandidatar) {
      if (valin.has(k.s)) continue;
      if (k.t1 >= a - bil && k.t0 <= b + bil) {
        valin.add(k.s);
        a = Math.min(a, k.t0);
        b = Math.max(b, k.t1);
        breytt = true;
      }
    }
  }
  return { strik: [...valin], flokkur: best.l };
}
