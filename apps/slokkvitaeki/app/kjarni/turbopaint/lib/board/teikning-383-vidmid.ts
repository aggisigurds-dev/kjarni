// VIÐMIÐ fyrir próf, ekki notað í viðmótinu: veggirnir sem Teikning-glugginn (slokkvitaeki js/patches/
// 383-teikning-hreinsa-3d.js, heilirVeggir/fragaVeggi/sameinaSamlinu/smellaHornum, 06.10.2026) sýnir úr pdfVeggir.
// Afritað orðrétt að virkni (paraVeggi er sama fall og í pdf-veggir.ts). Þekjuprófið sannar að innflutningur TurboPaint
// nái yfir ALLT sem Teikning sýndi — eftir vistun notar Teikning aðeins veggjaLinur, svo það sem vantar hyrfi úr 3D.

import { paraVeggi, type Strik } from "./pdf-veggir";
import type { FrumVeggur } from "./teikning-veggir";

type V = { a: [number, number]; b: [number, number]; t: number };

function sameinaSamlinu383(VV: V[], bil: number, vik: number): V[] {
  const L: { th: number; a: [number, number]; b: [number, number]; t: number }[] = [];
  for (const v of VV) {
    const dx = v.b[0] - v.a[0], dy = v.b[1] - v.a[1];
    if (Math.hypot(dx, dy) < 0.5) continue;
    let th = Math.atan2(dy, dx);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 0.01) th -= Math.PI;
    L.push({ th, a: v.a, b: v.b, t: v.t });
  }
  L.sort((p, q) => p.th - q.th);
  const ut: V[] = [];
  for (let i = 0; i < L.length; ) {
    let j = i + 1;
    while (j < L.length && L[j].th - L[j - 1].th < 0.01) j++;
    const hopur = L.slice(i, j);
    i = j;
    const th = hopur.reduce((s0, l) => s0 + l.th, 0) / hopur.length, c = Math.cos(th), s = Math.sin(th);
    const ln = hopur
      .map((l) => {
        const t0 = c * l.a[0] + s * l.a[1], t1 = c * l.b[0] + s * l.b[1];
        return { rho: (-s * l.a[0] + c * l.a[1] - s * l.b[0] + c * l.b[1]) / 2, t0: Math.min(t0, t1), t1: Math.max(t0, t1), t: l.t };
      })
      .sort((p, q) => p.rho - q.rho);
    for (let a = 0; a < ln.length; ) {
      let b = a + 1;
      while (b < ln.length && ln[b].rho - ln[b - 1].rho < vik) b++;
      const rod = ln.slice(a, b).sort((p, q) => p.t0 - q.t0);
      a = b;
      let nu: { t0: number; t1: number; t: number; rs: number; w: number } | null = null;
      const loka = () => {
        if (!nu) return;
        const rho = nu.rs / nu.w;
        ut.push({ a: [c * nu.t0 - s * rho, s * nu.t0 + c * rho], b: [c * nu.t1 - s * rho, s * nu.t1 + c * rho], t: nu.t });
      };
      for (const l of rod) {
        const w = Math.max(1e-6, l.t1 - l.t0);
        if (nu && l.t0 - nu.t1 <= bil) {
          nu.t1 = Math.max(nu.t1, l.t1);
          nu.t = Math.max(nu.t, l.t);
          nu.rs += l.rho * w;
          nu.w += w;
        } else {
          loka();
          nu = { t0: l.t0, t1: l.t1, t: l.t, rs: l.rho * w, w };
        }
      }
      loka();
    }
  }
  return ut;
}

function smellaHornum383(VV: V[], vik: number) {
  if (VV.length > 1500) return;
  const lengd = (v: V) => Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]);
  const stefna = (v: V): [number, number] => {
    const Lg = lengd(v) || 1;
    return [(v.b[0] - v.a[0]) / Lg, (v.b[1] - v.a[1]) / Lg];
  };
  for (const A of VV) {
    for (const k of ["a", "b"] as const) {
      const P = A[k], d = stefna(A);
      let best: { fj: number; X: [number, number] } | null = null;
      for (const B of VV) {
        if (B === A) continue;
        const e = stefna(B), kross = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(kross) < 0.3) continue;
        const wx = B.a[0] - A.a[0], wy = B.a[1] - A.a[1], sA = (wx * e[1] - wy * e[0]) / kross;
        const X: [number, number] = [A.a[0] + d[0] * sA, A.a[1] + d[1] * sA];
        const u = (X[0] - B.a[0]) * e[0] + (X[1] - B.a[1]) * e[1];
        if (u < -vik || u > lengd(B) + vik) continue;
        const fj = Math.hypot(X[0] - P[0], X[1] - P[1]);
        if (fj <= vik && (!best || fj < best.fj)) best = { fj, X };
      }
      if (best) A[k] = best.X;
    }
  }
}

/** 383 heilirVeggir: strik (dílar frummyndar) → veggir sem Teikning sýnir, í sama sniði og veggjaLinur. */
export function heilirVeggir383(strik: ReadonlyArray<ReadonlyArray<number>>, frumB: number, frumH: number): FrumVeggur[] {
  const k = Math.max(frumB, frumH) / 2384;
  if (!(k > 0) || !strik || !strik.length) return [];
  const pt: Strik[] = strik.map((v) => [v[0] / k, v[1] / k, v[2] / k, v[3] / k]);
  const lengd = (v: V) => Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]);
  let VV: V[] = paraVeggi(pt, { minT: 1.5, maxT: 20, minLengd: 6 }).map((v) => ({ a: v.a, b: v.b, t: v.thykkt }));
  let langt = 0, parad = 0;
  for (const s of pt) {
    const Lg = Math.hypot(s[2] - s[0], s[3] - s[1]);
    if (Lg >= 6) langt += Lg;
  }
  for (const v of VV) parad += lengd(v);
  if (parad * 2 < langt * 0.4) VV = pt.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) >= 6).map((s) => ({ a: [s[0], s[1]], b: [s[2], s[3]], t: 0 }));
  VV = sameinaSamlinu383(VV, 18, 1.2);
  smellaHornum383(VV, 13);
  return VV.filter((v) => lengd(v) >= 7).map((v) => ({ p: [v.a[0] * k, v.a[1] * k, v.b[0] * k, v.b[1] * k], t: Math.max(1, v.t * k) }));
}
