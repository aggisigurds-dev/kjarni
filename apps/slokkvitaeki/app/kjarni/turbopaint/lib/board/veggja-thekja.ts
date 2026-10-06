// Þekjumæling veggja (próf/greining, ekki notað í viðmótinu): ná innfluttu miðlínuveggirnir yfir allt sem Teikning-
// glugginn sýndi? Agnar/samræmingin 06.10.2026: þegar hæð er vistuð úr TurboPaint notar Teikning EINGÖNGU veggjaLinur —
// veggur sem kemst ekki yfir hverfur úr 3D. Mælt í dílum frummyndar:
//   þekja  = hlutfall díla upprunalínanna (pdfVeggir-veggflatir + handdregnir, 1 díll breiðar) sem lenda innan
//            innfluttra veggja (teiknaðra í sinni þykkt + `vik` dílar hvoru megin, rúnnaðir endar)
//   utan   = hlutfall af miðlínum innfluttra veggja (sýni á 2 díla fresti) sem hefur enga upprunalínu innan t/2 + vik —
//            veggur sem var ekki á teikningunni

import type { FrumVeggur } from "./teikning-veggir";

export interface ThekjaNidurstada {
  thekja: number;
  utan: number;
  /** Dílar upprunalína sem ná ekki inn í innflutta veggi. */
  othaktir: number;
  upprunaDilar: number;
}

type Lina = ReadonlyArray<number>;

export function maelaThekju(uppruni: Lina[], veggir: FrumVeggur[], vik = 2): ThekjaNidurstada {
  // rammi utan um allt
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const tak = (x: number, y: number) => {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  };
  for (const s of uppruni) { tak(s[0], s[1]); tak(s[2], s[3]); }
  for (const v of veggir) for (let i = 0; i + 1 < v.p.length; i += 2) tak(v.p[i], v.p[i + 1]);
  if (!Number.isFinite(x0)) return { thekja: 1, utan: 0, othaktir: 0, upprunaDilar: 0 };
  const M = 40;
  const ox = Math.floor(x0) - M, oy = Math.floor(y0) - M;
  const W = Math.ceil(x1) - ox + M, H = Math.ceil(y1) - oy + M;

  // upprunalínur, 1 díll
  const S = new Uint8Array(W * H);
  for (const s of uppruni) {
    const ax = s[0] - ox, ay = s[1] - oy, bx = s[2] - ox, by = s[3] - oy;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
      if (x >= 0 && y >= 0 && x < W && y < H) S[y * W + x] = 1;
    }
  }

  // innfluttir veggir sem hylki (miðlína ± t/2 + vik)
  const I = new Uint8Array(W * H);
  for (const v of veggir) {
    const r = v.t / 2 + vik;
    for (let i = 2; i + 1 < v.p.length; i += 2) {
      const ax = v.p[i - 2] - ox, ay = v.p[i - 1] - oy, bx = v.p[i] - ox, by = v.p[i + 1] - oy;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const minx = Math.max(0, Math.floor(Math.min(ax, bx) - r)), maxx = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
      const miny = Math.max(0, Math.floor(Math.min(ay, by) - r)), maxy = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
      for (let y = miny; y <= maxy; y++) {
        for (let x = minx; x <= maxx; x++) {
          const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
          if (Math.hypot(x - (ax + u * dx), y - (ay + u * dy)) <= r) I[y * W + x] = 1;
        }
      }
    }
  }

  let alls = 0, inni = 0;
  for (let p = 0; p < S.length; p++) if (S[p]) { alls++; if (I[p]) inni++; }

  // fjarlægð frá upprunalínum (chamfer 3-4) fyrir „utan"-mælinguna
  const INF = 1e9, D = new Float32Array(W * H);
  for (let p = 0; p < D.length; p++) D[p] = S[p] ? 0 : INF;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (D[i]) D[i] = Math.min(D[i], D[i - 1] + 3, D[i - W] + 3, D[i - W - 1] + 4, D[i - W + 1] + 4);
  }
  for (let y = H - 2; y >= 1; y--) for (let x = W - 2; x >= 1; x--) {
    const i = y * W + x;
    if (D[i]) D[i] = Math.min(D[i], D[i + 1] + 3, D[i + W] + 3, D[i + W + 1] + 4, D[i + W - 1] + 4);
  }
  let syni = 0, utan = 0;
  for (const v of veggir) {
    for (let i = 2; i + 1 < v.p.length; i += 2) {
      const ax = v.p[i - 2] - ox, ay = v.p[i - 1] - oy, bx = v.p[i] - ox, by = v.p[i + 1] - oy;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        syni++;
        if (D[y * W + x] / 3 > v.t / 2 + vik + 1) utan++;
      }
    }
  }
  return { thekja: alls ? inni / alls : 1, utan: syni ? utan / syni : 0, othaktir: alls - inni, upprunaDilar: alls };
}

/** Upprunalínur sem GETA verið veggflötur skv. reglu Teikning-gluggans (383 heilirVeggir → paraVeggi(1,5; 20; 6) og
 * bútar ≥ 7 pt): a.m.k. 7 pt langar og með samsíða línu 1,5–20 pt frá sér sem skarast um ≥ 6 pt. Hinar — stök
 * hurðarblöð, þröskuldar, karmar/póstar og smákubbar — getur Teikning aldrei sýnt sem veggi. `k` = dílar á pt. */
export function veggjaFletir(strik: ReadonlyArray<ReadonlyArray<number>>, k: number): number[][] {
  type L = { s: number[]; th: number; rho: number; t0: number; t1: number };
  const L: L[] = [];
  for (const s of strik) {
    const x0 = s[0] / k, y0 = s[1] / k, x1 = s[2] / k, y1 = s[3] / k;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) continue;
    let th = Math.atan2(y1 - y0, x1 - x0);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 1e-9) th -= Math.PI;
    const c = Math.cos(th), sn = Math.sin(th);
    const a = c * x0 + sn * y0, b = c * x1 + sn * y1;
    L.push({ s: s.slice(0, 4) as number[], th, rho: -sn * x0 + c * y0, t0: Math.min(a, b), t1: Math.max(a, b) });
  }
  const ut: number[][] = [];
  for (const l of L) {
    if (l.t1 - l.t0 < 7) continue;
    const parad = L.some((m) => {
      if (m === l) return false;
      let dth = Math.abs(m.th - l.th);
      if (dth > Math.PI / 2) dth = Math.PI - dth;
      if (dth > 0.01) return false;
      // sama stefna (nálægt 0/π speglast rho og bil)
      const sami = Math.abs(m.th - l.th) <= 0.01;
      const rho = sami ? m.rho : -m.rho, t0 = sami ? m.t0 : -m.t1, t1 = sami ? m.t1 : -m.t0;
      const d = Math.abs(rho - l.rho);
      return d >= 1.5 && d <= 20 && Math.min(t1, l.t1) - Math.max(t0, l.t0) >= 6;
    });
    if (parad) ut.push(l.s);
  }
  return ut;
}

/** Hlutfall FLATAR viðmiðunarveggja (teiknaðra í sinni þykkt) sem innfluttu veggirnir (í sinni þykkt + `vik`) þekja. */
export function maelaFlatarThekju(vidmid: FrumVeggur[], veggir: FrumVeggur[], vik = 2): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of [...vidmid, ...veggir]) {
    for (let i = 0; i + 1 < v.p.length; i += 2) {
      x0 = Math.min(x0, v.p[i]); y0 = Math.min(y0, v.p[i + 1]); x1 = Math.max(x1, v.p[i]); y1 = Math.max(y1, v.p[i + 1]);
    }
  }
  if (!Number.isFinite(x0)) return 1;
  const M = 40, ox = Math.floor(x0) - M, oy = Math.floor(y0) - M;
  const W = Math.ceil(x1) - ox + M, H = Math.ceil(y1) - oy + M;
  const teikna = (listi: FrumVeggur[], auki: number) => {
    const m = new Uint8Array(W * H);
    for (const v of listi) {
      const r = v.t / 2 + auki;
      for (let i = 2; i + 1 < v.p.length; i += 2) {
        const ax = v.p[i - 2] - ox, ay = v.p[i - 1] - oy, bx = v.p[i] - ox, by = v.p[i + 1] - oy;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + r)); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r)); x++) {
            const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
            if (Math.hypot(x - (ax + u * dx), y - (ay + u * dy)) <= r) m[y * W + x] = 1;
          }
        }
      }
    }
    return m;
  };
  const A = teikna(vidmid, 0), B = teikna(veggir, vik);
  let alls = 0, inni = 0;
  for (let p = 0; p < A.length; p++) if (A[p]) { alls++; if (B[p]) inni++; }
  return alls ? inni / alls : 1;
}
