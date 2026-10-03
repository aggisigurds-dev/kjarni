// Miðlínur veggja: veggjamaskinn (dílar) → fáar brotalínur með þykkt (vektor, KB). Agnar 03.10.2026: „gott Veggja
// möppun … sér layer … mun smærri skrá".
//
// Þynning (Guo–Hall), göngu-reglan um beinagrindina og Douglas–Peucker eru úr Vecline
// (github.com/shunyagatha/Vecline, src/core/centerline.ts) — MIT License, Copyright (c) 2026 Vecline contributors.
// Breytt hér: vinnur beint á Uint8Array-maska (engin þröskuldun), skilar flötum hnitalista, metur þykkt hverrar
// línu úr fjarlægðarvörpun og klippir burt stutta anga sem þynningin skilur eftir í hornum.

export interface Midlina {
  /** x0, y0, x1, y1, … í dílum upprunalega maskans. */
  punktar: number[];
  /** Áætluð þykkt veggjarins í dílum upprunalega maskans. */
  thykkt: number;
  /** Lengd línunnar í dílum. */
  lengd: number;
}

export interface MidlinuStillingar {
  /** Minnkun fyrir þynningu (1 = full upplausn). Sjálfgefið 2 yfir 8 MP. */
  minnkun?: number;
  /** Stakar línur (lausar í báða enda) styttri en þetta detta út (dílar upprunalega maskans). */
  lagmarksLengd?: number;
  /** Douglas–Peucker frávik í dílum minnkaða maskans. */
  einfoldun?: number;
}

type Pt = { x: number; y: number };

const NBRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];
const RING_CW: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/** Maski (1 = veggur) → miðlínur með þykkt. */
export function midlinurUrMaska(maski: Uint8Array, w: number, h: number, st: MidlinuStillingar = {}): Midlina[] {
  const f = Math.max(1, Math.round(st.minnkun ?? (w * h > 8_000_000 ? 2 : 1)));
  const W = Math.ceil(w / f), H = Math.ceil(h / f);
  // Fyllt með 1 díls ramma svo veggur við brún þynnist líka. Meirihluti í f×f reit (≥ helmingur) heldur lögun.
  const P = W + 2, Q = H + 2;
  const m = new Uint8Array(P * Q);
  const helmingur = Math.max(1, Math.ceil((f * f) / 2));
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      let n = 0;
      const y0 = Y * f, x0 = X * f;
      for (let y = y0; y < Math.min(h, y0 + f); y++) {
        const r = y * w;
        for (let x = x0; x < Math.min(w, x0 + f); x++) n += maski[r + x];
      }
      if (n >= helmingur) m[(Y + 1) * P + X + 1] = 1;
    }
  }

  const fjarl = fjarlaegd(m, P, Q);
  guoHallThin(m, P, Q);
  const hrar = walkSkeleton(m, P, Q);

  // Þykkt línu = 2 × miðgildi fjarlægðar beinagrindardíla frá brún − 1 (í minnkuðum dílum).
  const thykktLinu = (poly: Pt[]) => {
    const d: number[] = [];
    for (const p of poly) d.push(fjarl[p.y * P + p.x]);
    d.sort((a, b) => a - b);
    return Math.max(1, 2 * d[d.length >> 1] - 1);
  };

  type Hrá = { pts: Pt[]; thykkt: number; lengd: number };
  let linur: Hrá[] = hrar.map((pts) => ({ pts, thykkt: thykktLinu(pts), lengd: polylineLength(pts) }));

  // Angar: þynning skilur eftir stutta stubba frá hornum/þykkum blettum út í brún. Stubbur með lausan enda sem er
  // styttri en tvöföld þykkt er angi — burt. Endurtekið tvisvar því nýir lausir endar geta myndast.
  const lykill = (p: Pt) => p.y * P + p.x;
  for (let umferd = 0; umferd < 2; umferd++) {
    const fjoldiVid = new Map<number, number>();
    for (const l of linur) for (const p of [l.pts[0], l.pts[l.pts.length - 1]]) fjoldiVid.set(lykill(p), (fjoldiVid.get(lykill(p)) ?? 0) + 1);
    const laus = (p: Pt) => (fjoldiVid.get(lykill(p)) ?? 0) <= 1;
    linur = linur.filter((l) => {
      const a = laus(l.pts[0]), b = laus(l.pts[l.pts.length - 1]);
      if (a && b) return true; // stök lína — metin á lengd síðar
      if (a || b) return l.lengd >= Math.max(3, l.thykkt * 2);
      return true;
    });
    linur = sameinaVidTvennu(linur, lykill);
  }

  const lagmark = (st.lagmarksLengd ?? 0) / f;
  const eps = st.einfoldun ?? 1.5;
  const ut: Midlina[] = [];
  for (const l of linur) {
    if (l.lengd < Math.max(2, lagmark) && l.pts.length > 0) {
      // stakar, stuttar línur detta út; tengdar stuttar línur (milli tveggja veggja) haldast
      const fyrsti = l.pts[0], sidasti = l.pts[l.pts.length - 1];
      const tengd = linur.some((o) => o !== l && [o.pts[0], o.pts[o.pts.length - 1]].some((p) => (p.x === fyrsti.x && p.y === fyrsti.y) || (p.x === sidasti.x && p.y === sidasti.y)));
      if (!tengd || l.lengd < 2) continue;
    }
    const einf = simplify(l.pts, eps);
    if (einf.length < 2) continue;
    const punktar: number[] = [];
    // −1 fyrir rammann, +0,5 í miðju díls, ×f aftur í upprunalega upplausn
    for (const p of einf) punktar.push((p.x - 1 + 0.5) * f, (p.y - 1 + 0.5) * f);
    ut.push({ punktar, thykkt: l.thykkt * f, lengd: l.lengd * f });
  }
  return ut;
}

/** Sameinar tvær línur sem mætast í punkti þar sem engin önnur lína endar (eftir að angi var klipptur). */
function sameinaVidTvennu<T extends { pts: Pt[]; thykkt: number; lengd: number }>(linur: T[], lykill: (p: Pt) => number): T[] {
  let breytt = true;
  while (breytt) {
    breytt = false;
    const endar = new Map<number, number[]>();
    linur.forEach((l, i) => {
      const a = lykill(l.pts[0]), b = lykill(l.pts[l.pts.length - 1]);
      if (a === b) return; // lokuð lykkja
      for (const k of [a, b]) { const v = endar.get(k); if (v) v.push(i); else endar.set(k, [i]); }
    });
    for (const [k, ix] of endar) {
      if (ix.length !== 2 || ix[0] === ix[1]) continue;
      const A = linur[ix[0]], B = linur[ix[1]];
      const a = lykill(A.pts[0]) === k ? [...A.pts].reverse() : A.pts; // a endar í k
      const b = lykill(B.pts[0]) === k ? B.pts : [...B.pts].reverse(); // b byrjar í k
      const pts = a.concat(b.slice(1));
      const lengd = A.lengd + B.lengd;
      const thykkt = (A.thykkt * A.lengd + B.thykkt * B.lengd) / Math.max(1e-9, lengd);
      const ny = { ...A, pts, lengd, thykkt: Math.round(thykkt) };
      linur = linur.filter((_, i) => i !== ix[0] && i !== ix[1]);
      linur.push(ny);
      breytt = true;
      break;
    }
  }
  return linur;
}

/** Chamfer-fjarlægð (3-4, deilt með 3) frá næsta bakgrunnsdíl; 1 = brúnardíll. */
function fjarlaegd(m: Uint8Array, P: number, Q: number): Float32Array {
  const d = new Float32Array(P * Q);
  const INF = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? INF : 0;
  for (let y = 1; y < Q - 1; y++) {
    for (let x = 1; x < P - 1; x++) {
      const i = y * P + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i - 1] + 3, d[i - P] + 3, d[i - P - 1] + 4, d[i - P + 1] + 4);
    }
  }
  for (let y = Q - 2; y >= 1; y--) {
    for (let x = P - 2; x >= 1; x--) {
      const i = y * P + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], d[i + 1] + 3, d[i + P] + 3, d[i + P + 1] + 4, d[i + P - 1] + 4);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i] / 3;
  return d;
}

/** Guo–Hall þynning, á staðnum (Vecline, MIT). Nágrannar p2..p9 réttsælis frá norðri. */
function guoHallThin(m: Uint8Array, P: number, Q: number): void {
  let changed = true;
  const del: number[] = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      del.length = 0;
      for (let y = 1; y < Q - 1; y++) {
        for (let x = 1; x < P - 1; x++) {
          const i = y * P + x;
          if (!m[i]) continue;
          const p2 = m[i - P], p3 = m[i - P + 1], p4 = m[i + 1], p5 = m[i + P + 1];
          const p6 = m[i + P], p7 = m[i + P - 1], p8 = m[i - 1], p9 = m[i - P - 1];
          const c = (p2 === 0 && (p3 === 1 || p4 === 1) ? 1 : 0)
            + (p4 === 0 && (p5 === 1 || p6 === 1) ? 1 : 0)
            + (p6 === 0 && (p7 === 1 || p8 === 1) ? 1 : 0)
            + (p8 === 0 && (p9 === 1 || p2 === 1) ? 1 : 0);
          if (c !== 1) continue;
          const n1 = (p9 | p2) + (p3 | p4) + (p5 | p6) + (p7 | p8);
          const n2 = (p2 | p3) + (p4 | p5) + (p6 | p7) + (p8 | p9);
          const n = n1 < n2 ? n1 : n2;
          if (n < 2 || n > 3) continue;
          const cond = step === 0 ? ((p6 | p7 | (p9 ^ 1)) & p8) : ((p2 | p3 | (p5 ^ 1)) & p4);
          if (cond !== 0) continue;
          del.push(i);
        }
      }
      if (del.length > 0) {
        changed = true;
        for (const i of del) m[i] = 0;
      }
    }
  }
}

/** Gengur 1 díls beinagrind í opnar brotalínur, skipt aðeins við raunveruleg mót (Vecline, MIT). */
function walkSkeleton(m: Uint8Array, P: number, Q: number): Pt[][] {
  const fg = (x: number, y: number): boolean => m[y * P + x] === 1;
  // krossatala: 1 = endi, 2 = gegnumgangur (líka rétt horn), ≥3 = mót
  const crossing = (x: number, y: number): number => {
    let c = 0;
    for (let k = 0; k < 8; k++) {
      const a = fg(x + RING_CW[k][0], y + RING_CW[k][1]) ? 1 : 0;
      const b = fg(x + RING_CW[(k + 1) % 8][0], y + RING_CW[(k + 1) % 8][1]) ? 1 : 0;
      if (a === 0 && b === 1) c++;
    }
    return c;
  };
  const used = new Set<number>();
  // línulegur lykill fyrir brún milli 8-nágranna (mismunur er 1, P−1, P eða P+1)
  const edgeKey = (ax: number, ay: number, bx: number, by: number): number => {
    const a = ay * P + ax, b = by * P + bx;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const delta = hi - lo;
    const dir = delta === 1 ? 0 : delta === P - 1 ? 1 : delta === P ? 2 : 3;
    return lo * 4 + dir;
  };
  // ská-brún yfir fyllt horn er flýtileið sem myndi skera hornið — sleppt
  const allowed = (ax: number, ay: number, bx: number, by: number): boolean => {
    if (Math.abs(ax - bx) === 1 && Math.abs(ay - by) === 1) return !(fg(ax, by) || fg(bx, ay));
    return true;
  };
  const walk = (sx: number, sy: number): Pt[] => {
    const pts: Pt[] = [{ x: sx, y: sy }];
    let cx = sx, cy = sy;
    for (;;) {
      let next: [number, number, number] | null = null;
      for (const [dx, dy] of NBRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!fg(nx, ny) || !allowed(cx, cy, nx, ny)) continue;
        const key = edgeKey(cx, cy, nx, ny);
        if (used.has(key)) continue;
        next = [nx, ny, key];
        break;
      }
      if (!next) break;
      used.add(next[2]);
      cx = next[0]; cy = next[1];
      pts.push({ x: cx, y: cy });
      if (crossing(cx, cy) !== 2) break;
    }
    return pts;
  };
  const hasUnusedEdge = (x: number, y: number): boolean => {
    for (const [dx, dy] of NBRS) {
      const nx = x + dx, ny = y + dy;
      if (fg(nx, ny) && allowed(x, y, nx, ny) && !used.has(edgeKey(x, y, nx, ny))) return true;
    }
    return false;
  };
  const out: Pt[][] = [];
  for (let y = 1; y < Q - 1; y++) {
    for (let x = 1; x < P - 1; x++) {
      if (!fg(x, y) || crossing(x, y) === 2) continue;
      while (hasUnusedEdge(x, y)) {
        const poly = walk(x, y);
        if (poly.length >= 2) out.push(poly);
      }
    }
  }
  for (let y = 1; y < Q - 1; y++) {
    for (let x = 1; x < P - 1; x++) {
      if (fg(x, y) && hasUnusedEdge(x, y)) {
        const poly = walk(x, y);
        if (poly.length >= 2) out.push(poly);
      }
    }
  }
  return out;
}

/** Douglas–Peucker (Vecline, MIT). */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1, worstDist = eps;
    const ax = pts[first].x, ay = pts[first].y;
    const bx = pts[last].x, by = pts[last].y;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    for (let i = first + 1; i < last; i++) {
      const dist = len === 0
        ? Math.hypot(pts[i].x - ax, pts[i].y - ay)
        : Math.abs(dy * pts[i].x - dx * pts[i].y + bx * ay - by * ax) / len;
      if (dist > worstDist) { worstDist = dist; worst = i; }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function polylineLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}
