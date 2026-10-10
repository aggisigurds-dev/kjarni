// Veggir úr SKANNAÐRI teikningu — sama greining og Teikning-glugginn (Slökkvitæki 383-teikning-hreinsa-3d.js:
// hreinsa → veggirUrMynd → grá lóð → gler → hurðargöt → stakir veggir), flutt hingað orðrétt að virkni 07.10.2026.
//
// Agnar 07.10.2026 (Álfaborg 661, 2. hæð): „kerfið fann enga veggi á efri hæð". Hæðin er skönnuð FotoWeb-PDF (ein mynd,
// engin vigurstrik): „Greina veggi" las PDF-ið, fann enga línuflokka og skilaði 0 veggjum — en Teikning sýndi veggi í 3D
// því 383 les þá úr MYNDINNI. Hér er sú greining, svo TurboPaint fái sömu veggi sem breytanlega veggi.
//
// Hrein gagnavinnsla (engin DOM): inn kemur grátónamynd (0 svart – 255 hvítt) af svæði hússins í vinnukvarða, út koma
// bútar [ax, ay, bx, by, þykkt] í dílum FRUMMYNDAR miðað við efra vinstra horn svæðisins (= „stig1" í 383).
// Vafraleiðin (mynd → grátóna) er í skonnun-veggir-mynd.ts.

import { siaVeggi, type SiaTalning } from "./veggja-linur";

export type Butur5 = number[];

/** Punktar (pt) blaðsins á metra í kvarða 1:100 (1 m = 1 cm á blaði). */
const PT_A_METRA_1_100 = 72 / 2.54;

// ── formfræði (383: summutafla, kassi, svaedi) ───────────────────────────────────────────────────────────────────

function summutafla(b: Uint8Array, W: number, H: number) {
  const S = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let rod = 0;
    const o = (y + 1) * (W + 1), u = y * (W + 1), r = y * W;
    for (let x = 0; x < W; x++) {
      rod += b[r + x];
      S[o + x + 1] = S[u + x + 1] + rod;
    }
  }
  return S;
}

/** fullt=true → erode (allur glugginn 1) · fullt=false → dilate (eitthvað í glugganum). */
function kassi(b: Uint8Array, W: number, H: number, r: number, fullt: boolean): Uint8Array {
  if (r <= 0) return b;
  const S = summutafla(b, W, H), ut = new Uint8Array(W * H), W1 = W + 1, fulltGildi = (2 * r + 1) * (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const s = S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0];
      ut[y * W + x] = fullt ? (s === fulltGildi ? 1 : 0) : s > 0 ? 1 : 0;
    }
  }
  return ut;
}
const erode = (b: Uint8Array, W: number, H: number, r: number) => kassi(b, W, H, r, true);
const dilate = (b: Uint8Array, W: number, H: number, r: number) => kassi(b, W, H, r, false);

/** Samhangandi svæði (8-tengd), stafli í stað endurkvæmni. */
function svaedi(b: Uint8Array, W: number, H: number) {
  const merki = new Int32Array(W * H), listi: { n: number; flat: number; b: number; h: number }[] = [];
  const stafli = new Int32Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!b[i] || merki[i]) continue;
    n++;
    let top = 0, flat = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    stafli[top++] = i;
    merki[i] = n;
    while (top) {
      const p = stafli[--top], px = p % W, py = (p - px) / W;
      flat++;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= W) continue;
          const q = ny * W + nx;
          if (b[q] && !merki[q]) {
            merki[q] = n;
            stafli[top++] = q;
          }
        }
      }
    }
    listi.push({ n, flat, b: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return { merki, listi };
}

// ── hreinsun: dökkt OG þykkt = veggur (383 hreinsaGogn / hreinsa) ────────────────────────────────────────────────

export interface HreinsunStillingar {
  dokkt?: number;
  thykkt?: number;
  fylla?: boolean;
  /** Viðmiðsbreidd (vinnudílar) sem þröskuldarnir miðast við — 383 VIDMID_3D. */
  vidmid?: number;
  /** Dílar FRUMMYNDAR á metra (kvarði borðsins); vantar = 1:100 reiknað af stærð blaðsins. */
  dilarAMetra?: number | null;
  /** Án síunar veggja (veggja-linur.ts) — aðeins til samanburðar. */
  anSiu?: boolean;
}

export function hreinsaGogn(gra: Uint8Array, W: number, H: number, o: HreinsunStillingar = {}) {
  const dokkt = o.dokkt || 185;
  const Wv = o.vidmid || W;
  const r = Math.max(1, o.thykkt || Math.round(Wv / 1000));
  let blek: Uint8Array = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) blek[i] = gra[i] < dokkt ? 1 : 0;
  if (o.fylla) {
    const f = r + 2;
    blek = erode(dilate(blek, W, H, f), W, H, f);
  }
  let v = dilate(erode(blek, W, H, r), W, H, r);
  v = erode(dilate(v, W, H, r + 1), W, H, r + 1);
  const R = Math.max(r + 4, Math.round(Wv / 140));
  const flekkir = dilate(dilate(erode(v, W, H, R), W, H, R), W, H, 4);
  for (let i = 0; i < W * H; i++) if (flekkir[i]) v[i] = 0;
  const sv = svaedi(v, W, H), lagm = Math.round(Wv / 54), lagmFlat = Math.round((Wv / 170) * (Wv / 170));
  const halda = new Uint8Array(sv.listi.length + 1);
  sv.listi.forEach((s) => {
    if (s.flat >= lagmFlat && Math.max(s.b, s.h) >= lagm) halda[s.n] = 1;
  });
  let fjoldi = 0;
  for (let i = 0; i < W * H; i++) {
    if (v[i] && !halda[sv.merki[i]]) v[i] = 0;
    if (v[i]) fjoldi++;
  }
  const Rf = Math.max(6, Math.round(Wv / 70));
  const lokad = erode(dilate(v, W, H, Rf), W, H, Rf);
  const uti = new Uint8Array(W * H), st = new Int32Array(W * H);
  let top = 0;
  const yta = (p: number) => {
    if (!lokad[p] && !uti[p]) {
      uti[p] = 1;
      st[top++] = p;
    }
  };
  for (let x = 0; x < W; x++) {
    yta(x);
    yta((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    yta(y * W);
    yta(y * W + W - 1);
  }
  while (top) {
    const p = st[--top], px = p % W, py = (p - px) / W;
    if (px > 0) yta(p - 1);
    if (px < W - 1) yta(p + 1);
    if (py > 0) yta(p - W);
    if (py < H - 1) yta(p + W);
  }
  const fotspor = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) fotspor[i] = uti[i] ? 0 : 1;
  return { veggir: v, fotspor, thekja: fjoldi / (W * H), thykkt: r };
}

export interface Hreinsun {
  veggir: Uint8Array;
  /** Fyrsta gríman (dökkt OG þykkt) — veggirUrMynd reynir hana fyrst. */
  thykkir: Uint8Array;
  gra: Uint8Array;
  fotspor: Uint8Array;
  W: number;
  H: number;
  /** Vinnudílar á díl frummyndar. */
  kvardi: number;
  thekja: number;
  thykkt: number;
}

/** 383 hreinsa(…, { anStriga: true }) eftir grátónabreytinguna. */
export function hreinsaGra(gra: Uint8Array, W: number, H: number, kvardi: number, o: HreinsunStillingar = {}): Hreinsun {
  let g = hreinsaGogn(gra, W, H, o);
  const thykkir = g.veggir;
  if (g.thekja < 0.04 && !o.thykkt && !o.fylla) {
    const g2 = hreinsaGogn(gra, W, H, { dokkt: 210, thykkt: 1, fylla: true, vidmid: o.vidmid });
    let fot = 0;
    for (let i = 0; i < g2.fotspor.length; i++) fot += g2.fotspor[i];
    const hluti = fot / (W * H);
    if (g2.thekja >= 0.04 && hluti >= 0.08 && hluti <= 0.88) g = g2;
  }
  return { veggir: g.veggir, thykkir, gra, fotspor: g.fotspor, W, H, kvardi, thekja: g.thekja, thykkt: g.thykkt };
}

/** Grátóni úr RGBA (sama vigtun og 383). */
export function graTonar(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number): Uint8Array {
  const gra = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) gra[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return gra;
}

// ── heilir veggir úr bútum (383 sameinaSamlinu / smellaHornum / fragaVeggi) ─────────────────────────────────────

type PtV = { a: [number, number]; b: [number, number]; t: number };

function sameinaSamlinu(V: PtV[], bil: number, vik: number): PtV[] {
  const L: { th: number; a: [number, number]; b: [number, number]; t: number }[] = [];
  for (const v of V) {
    const dx = v.b[0] - v.a[0], dy = v.b[1] - v.a[1];
    if (Math.hypot(dx, dy) < 0.5) continue;
    let th = Math.atan2(dy, dx);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 0.01) th -= Math.PI;
    L.push({ th, a: v.a, b: v.b, t: v.t });
  }
  L.sort((p, q) => p.th - q.th);
  const ut: PtV[] = [];
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

function smellaHornum(V: PtV[], vik: number) {
  if (V.length > 1500) return;
  const lengd = (v: PtV) => Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]);
  const stefna = (v: PtV): [number, number] => {
    const Lg = lengd(v) || 1;
    return [(v.b[0] - v.a[0]) / Lg, (v.b[1] - v.a[1]) / Lg];
  };
  for (const A of V)
    for (const k of ["a", "b"] as const) {
      const P = A[k], d = stefna(A);
      let best: { fj: number; X: [number, number] } | null = null;
      for (const B of V) {
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

/** Frágangur (einingar: pt): samlínu bútar sameinaðir, horn smellt saman, stubbar felldir → dílar (× k). */
function fragaVeggi(V: PtV[], k: number, vik: number): Butur5[] {
  V = sameinaSamlinu(V, 18, vik);
  smellaHornum(V, 13);
  return V.filter((v) => Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]) >= 7).map((v) => [v.a[0] * k, v.a[1] * k, v.b[0] * k, v.b[1] * k, v.t * k]);
}

// ── veggir úr grímu (383 veggirUrGrimu / heilirUrGrimu) ──────────────────────────────────────────────────────────

export function veggirUrGrimu(v: Uint8Array, W: number, H: number): { butar: Butur5[]; thykkt: number; lmin: number; hlutfall: number } | null {
  const N = W * H, hl = new Uint16Array(N), vl = new Uint16Array(N);
  for (let y = 0; y < H; y++) {
    const r = y * W;
    for (let x = 0; x < W; ) {
      if (!v[r + x]) {
        x++;
        continue;
      }
      let x1 = x;
      while (x1 < W && v[r + x1]) x1++;
      const L = Math.min(65535, x1 - x);
      for (let i = x; i < x1; i++) hl[r + i] = L;
      x = x1;
    }
  }
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; ) {
      if (!v[y * W + x]) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 < H && v[y1 * W + x]) y1++;
      const L = Math.min(65535, y1 - y);
      for (let i = y; i < y1; i++) vl[i * W + x] = L;
      y = y1;
    }
  const sulur = new Uint32Array(256);
  let fj = 0;
  for (let i = 0; i < N; i++)
    if (v[i]) {
      sulur[Math.min(255, Math.min(hl[i], vl[i]))]++;
      fj++;
    }
  if (!fj) return null;
  let t = 1, s = 0;
  for (; t < 255; t++) {
    s += sulur[t];
    if (s >= fj / 2) break;
  }
  const Lmin = Math.max(Math.round(t * 2), Math.round(Math.max(W, H) * 0.008)), tMax = t * 3 + 2;
  const butar: Butur5[] = [];
  let tekid = 0;
  const lesa = (larett: boolean) => {
    const m = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (v[i] && (larett ? hl[i] >= vl[i] : vl[i] > hl[i])) m[i] = 1;
    const sv = svaedi(m, W, H), n = sv.listi.length;
    if (!n) return;
    const a0 = new Int32Array(n + 1).fill(1e9), a1 = new Int32Array(n + 1).fill(-1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = sv.merki[y * W + x];
        if (!k) continue;
        const a = larett ? x : y;
        if (a < a0[k]) a0[k] = a;
        if (a > a1[k]) a1[k] = a;
      }
    const byrjun = new Int32Array(n + 2);
    let alls = 0;
    for (let k = 1; k <= n; k++) {
      byrjun[k] = alls;
      if (a1[k] - a0[k] + 1 >= Lmin) alls += a1[k] - a0[k] + 1;
      else a1[k] = -1;
    }
    byrjun[n + 1] = alls;
    const fjoldi = new Uint16Array(alls), summa = new Float64Array(alls);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = sv.merki[y * W + x];
        if (!k || a1[k] < 0) continue;
        const o = byrjun[k] + (larett ? x : y) - a0[k];
        fjoldi[o]++;
        summa[o] += larett ? y : x;
      }
    for (let k = 1; k <= n; k++) {
      if (a1[k] < 0) continue;
      const o0 = byrjun[k], len = a1[k] - a0[k] + 1;
      const rad = Array.from(fjoldi.subarray(o0, o0 + len))
        .filter((c) => c > 0)
        .sort((p, q) => p - q);
      const mid = rad[rad.length >> 1];
      if (!mid || mid > tMax * 1.45) continue;
      const hamark = Math.max(mid * 1.7, mid + 2);
      for (let i = 0; i < len; ) {
        if (!fjoldi[o0 + i] || fjoldi[o0 + i] > hamark) {
          i++;
          continue;
        }
        let j = i;
        while (j < len && fjoldi[o0 + j] && fjoldi[o0 + j] <= hamark) j++;
        if (j - i >= Lmin && j - i >= mid * 2) {
          const P: number[][] = [];
          const skref = Math.max(2, Math.round(mid / 2));
          for (let q = i; q < j; q += skref) {
            const e = Math.min(j, q + skref);
            let sb = 0, sc = 0;
            for (let z = q; z < e; z++) {
              sb += summa[o0 + z];
              sc += fjoldi[o0 + z];
            }
            P.push([(q + e) / 2, sb / sc + 0.5, sc / (e - q)]);
          }
          P[0][0] = i;
          P[P.length - 1][0] = j;
          const vik = 1.2 + mid * 0.12, halda = new Uint8Array(P.length);
          halda[0] = halda[P.length - 1] = 1;
          const st: [number, number][] = [[0, P.length - 1]];
          while (st.length) {
            const [p, q] = st.pop()!;
            let mest = 0, hvar = -1;
            const dx = P[q][0] - P[p][0], dy = P[q][1] - P[p][1], L = Math.hypot(dx, dy) || 1;
            for (let z = p + 1; z < q; z++) {
              const d = Math.abs((P[z][0] - P[p][0]) * dy - (P[z][1] - P[p][1]) * dx) / L;
              if (d > mest) {
                mest = d;
                hvar = z;
              }
            }
            if (mest > vik) {
              halda[hvar] = 1;
              st.push([p, hvar], [hvar, q]);
            }
          }
          let fyrri = 0;
          for (let z = 1; z < P.length; z++) {
            if (!halda[z]) continue;
            const A = P[fyrri], B = P[z], halli = (B[1] - A[1]) / Math.max(1e-6, B[0] - A[0]);
            let th = 0;
            for (let w = fyrri; w <= z; w++) th += P[w][2];
            th = th / (z - fyrri + 1) / Math.sqrt(1 + halli * halli);
            if (Math.hypot(B[0] - A[0], B[1] - A[1]) >= Lmin * 0.6)
              butar.push(larett ? [a0[k] + A[0], A[1], a0[k] + B[0], B[1], th] : [A[1], a0[k] + A[0], B[1], a0[k] + B[0], th]);
            fyrri = z;
          }
          for (let z = i; z < j; z++) tekid += fjoldi[o0 + z];
        }
        i = j;
      }
    }
  };
  lesa(true);
  lesa(false);
  return { butar, thykkt: t, lmin: Lmin, hlutfall: tekid / fj };
}

function heilirUrGrimu(grima: Uint8Array, W: number, H: number, kvardi: number, frumB: number, frumH: number): Butur5[] | null {
  const g = veggirUrGrimu(grima, W, H);
  if (!g || g.butar.length < 6 || g.hlutfall < 0.5) return null;
  const k = Math.max(frumB, frumH) / 2384, f = 1 / kvardi / k;
  const V = fragaVeggi(g.butar.map((v) => ({ a: [v[0] * f, v[1] * f] as [number, number], b: [v[2] * f, v[3] * f] as [number, number], t: v[4] * f })), k, 2);
  let lengd = 0;
  for (const v of V) lengd += Math.hypot(v[2] - v[0], v[3] - v[1]);
  return lengd * kvardi >= Math.max(W, H) * 2 ? V : null;
}

// ── gler, holir veggir, línubönd, lenging, húsklasi, hurðargöt, stakir (383) ─────────────────────────────────────

function glerIBilum(butar: Butur5[], gra: Uint8Array, W: number, H: number, kvardi: number, k: number): Butur5[] {
  const minBil = 8 * k, maxBil = 260 * k, vik = 2 * k, ut: Butur5[] = [], L: { th: number; v: Butur5 }[] = [];
  for (const v of butar) {
    const dx = v[2] - v[0], dy = v[3] - v[1];
    if (Math.hypot(dx, dy) < 1) continue;
    let th = Math.atan2(dy, dx);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 0.01) th -= Math.PI;
    L.push({ th, v });
  }
  L.sort((p, q) => p.th - q.th);
  const sjalfg = 3 * k;
  for (let i = 0; i < L.length; ) {
    let j = i + 1;
    while (j < L.length && L[j].th - L[j - 1].th < 0.01) j++;
    const hopur = L.slice(i, j);
    i = j;
    const th = hopur.reduce((s0, o) => s0 + o.th, 0) / hopur.length, c = Math.cos(th), s = Math.sin(th);
    const ln = hopur
      .map((o) => {
        const v = o.v, t0 = c * v[0] + s * v[1], t1 = c * v[2] + s * v[3];
        return { rho: (-s * v[0] + c * v[1] - s * v[2] + c * v[3]) / 2, t0: Math.min(t0, t1), t1: Math.max(t0, t1), t: v[4] || sjalfg };
      })
      .sort((p, q) => p.rho - q.rho);
    for (let a = 0; a < ln.length; ) {
      let b = a + 1;
      while (b < ln.length && ln[b].rho - ln[b - 1].rho < vik) b++;
      const rod = ln.slice(a, b).sort((p, q) => p.t0 - q.t0);
      a = b;
      let fyrri = rod[0];
      for (let z = 1; z < rod.length; z++) {
        const nu = rod[z], bil = nu.t0 - fyrri.t1;
        if (bil >= minBil && bil <= maxBil) {
          const rho = (fyrri.rho + nu.rho) / 2, t = Math.max(fyrri.t, nu.t), half = Math.ceil((t * kvardi) / 2) + 2;
          let n = 0, tvo = 0;
          for (let u = fyrri.t1 + 2 / kvardi; u < nu.t0 - 2 / kvardi; u += 1 / kvardi) {
            const mx = (c * u - s * rho) * kvardi, my = (s * u + c * rho) * kvardi;
            let hlaup = 0, inni = false;
            for (let w = -half; w <= half; w++) {
              const gx = Math.round(mx - s * w), gy = Math.round(my + c * w);
              const d = gx >= 0 && gy >= 0 && gx < W && gy < H && gra[gy * W + gx] < 205;
              if (d && !inni) hlaup++;
              inni = d;
            }
            n++;
            if (hlaup >= 2) tvo++;
          }
          if (n >= 3 && tvo >= n * 0.6) ut.push([c * fyrri.t1 - s * rho, s * fyrri.t1 + c * rho, c * nu.t0 - s * rho, s * nu.t0 + c * rho, t]);
        }
        if (nu.t1 > fyrri.t1) fyrri = nu;
      }
    }
  }
  return ut;
}

function linuhnit(v: Butur5) {
  let th = Math.atan2(v[3] - v[1], v[2] - v[0]);
  if (th < 0) th += Math.PI;
  if (th >= Math.PI - 0.01) th -= Math.PI;
  const c = Math.cos(th), s = Math.sin(th), t0 = c * v[0] + s * v[1], t1 = c * v[2] + s * v[3];
  return { th, rho: (-s * v[0] + c * v[1] - s * v[2] + c * v[3]) / 2, t0: Math.min(t0, t1), t1: Math.max(t0, t1) };
}

function greidusia(V: Butur5[]): boolean[] {
  const lina = V.map(linuhnit), lengd = (v: Butur5) => Math.hypot(v[2] - v[0], v[3] - v[1]);
  const grannar = V.map((v, i) => {
    const ut: number[] = [];
    for (let j = 0; j < V.length; j++) {
      if (j === i || Math.abs(lina[j].th - lina[i].th) > 0.05) continue;
      const d = Math.abs(lina[j].rho - lina[i].rho);
      if (d < 1 || d > Math.max(v[4], V[j][4]) * 3.5) continue;
      const skor = Math.min(lina[i].t1, lina[j].t1) - Math.max(lina[i].t0, lina[j].t0);
      if (skor >= Math.min(lengd(v), lengd(V[j])) * 0.5) ut.push(j);
    }
    return ut;
  });
  const greida = grannar.map((g) => g.length >= 2);
  return V.map((v, i) => !greida[i] && !grannar[i].some((j) => greida[j]));
}

function holirVeggir(gra: Uint8Array, W: number, H: number, kvardi: number, k: number): Butur5[] {
  const N = W * H, pt = k * kvardi;
  const g0 = Math.max(2, Math.round(1.6 * pt)), g1 = Math.max(g0 + 2, Math.round(9 * pt));
  const blek = new Uint8Array(N);
  for (let i = 0; i < N; i++) blek[i] = gra[i] < 205 ? 1 : 0;
  const hw = new Uint16Array(N), vw = new Uint16Array(N);
  for (let y = 0; y < H; y++) {
    const r = y * W;
    for (let x = 0; x < W; ) {
      if (blek[r + x]) {
        x++;
        continue;
      }
      let x1 = x;
      while (x1 < W && !blek[r + x1]) x1++;
      const L = x === 0 || x1 === W ? 65535 : Math.min(65535, x1 - x);
      for (let i = x; i < x1; i++) hw[r + i] = L;
      x = x1;
    }
  }
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; ) {
      if (blek[y * W + x]) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 < H && !blek[y1 * W + x]) y1++;
      const L = y === 0 || y1 === H ? 65535 : Math.min(65535, y1 - y);
      for (let i = y; i < y1; i++) vw[i * W + x] = L;
      y = y1;
    }
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (blek[i]) continue;
    const a = hw[i], b = vw[i];
    if ((a >= g0 && a <= g1 && b >= a * 4) || (b >= g0 && b <= g1 && a >= b * 4)) m[i] = 1;
  }
  const r = veggirUrGrimu(m, W, H);
  if (!r) return [];
  const V = r.butar.map((v) => [v[0], v[1], v[2], v[3], v[4] + 2]);
  const lengd = (v: Butur5) => Math.hypot(v[2] - v[0], v[3] - v[1]);
  const halda = greidusia(V), lina = V.map(linuhnit);
  const langt = 34 * pt, stutt = 11 * pt;
  const ut: Butur5[] = [];
  for (let i = 0; i < V.length; i++) {
    if (!halda[i]) continue;
    const L = lengd(V[i]);
    if (L >= langt) {
      ut.push(V[i]);
      continue;
    }
    if (L < stutt) continue;
    let studd = false;
    for (let j = 0; j < V.length && !studd; j++) {
      if (j === i || !halda[j] || lengd(V[j]) < langt) continue;
      if (Math.abs(lina[j].th - lina[i].th) < 0.02 && Math.abs(lina[j].rho - lina[i].rho) < 2.5) studd = true;
    }
    if (studd) ut.push(V[i]);
  }
  return ut;
}

function lengjaVeggi(butar: Butur5[], gra: Uint8Array, W: number, H: number, kvardi: number): Butur5[] {
  const N = W * H, dokkt = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && gra[y * W + x] < 205;
  const fyrir = new Int32Array(N);
  const V = butar.map((v) => {
    const ax = v[0] * kvardi, ay = v[1] * kvardi, bx = v[2] * kvardi, by = v[3] * kvardi, L = Math.hypot(bx - ax, by - ay) || 1;
    return { ax, ay, bx, by, L, ux: (bx - ax) / L, uy: (by - ay) / L, half: Math.max(1, ((v[4] || 0) * kvardi) / 2) };
  });
  V.forEach((w, i) => {
    for (let s = 0; s <= w.L; s += 0.5)
      for (let d = -w.half; d <= w.half; d += 0.5) {
        const x = Math.round(w.ax + w.ux * s - w.uy * d), y = Math.round(w.ay + w.uy * s + w.ux * d);
        if (x >= 0 && y >= 0 && x < W && y < H) fyrir[y * W + x] = i + 1;
      }
  });
  const snid = (w: (typeof V)[number], px: number, py: number) => {
    const h = Math.round(w.half);
    let d = 0, n = 0, vinstri = false, haegri = false;
    for (let q = -h - 2; q <= h + 2; q++) {
      const dk = dokkt(Math.round(px - w.uy * q), Math.round(py + w.ux * q));
      if (q >= -h && q <= h) {
        n++;
        if (dk) d++;
      }
      if (dk && q <= -h + 2) vinstri = true;
      if (dk && q >= h - 2) haegri = true;
    }
    return { fyllt: d / n, jadrar: vinstri && haegri };
  };
  return butar.map((v, i) => {
    const w = V[i];
    if (!v[4] || w.L < 6) return v;
    let f = 0, m = 0;
    for (let s = w.L * 0.15; s <= w.L * 0.85; s += Math.max(1, w.L / 24)) {
      f += snid(w, w.ax + w.ux * s, w.ay + w.uy * s).fyllt;
      m++;
    }
    const thykkur = m && f / m >= 0.6;
    const likt = (px: number, py: number) => {
      const o = snid(w, px, py);
      return thykkur ? o.fyllt >= 0.6 : o.jadrar && o.fyllt < 0.75;
    };
    const rof = Math.max(5, Math.round(w.half * 2.5)), hamark = Math.max(W, H);
    const ganga = (x0: number, y0: number, sx: number, sy: number) => {
      let sidast = 0;
      for (let s = 1; s < hamark; s++) {
        const px = x0 + sx * s, py = y0 + sy * s, gx = Math.round(px), gy = Math.round(py);
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) break;
        const hver = fyrir[gy * W + gx];
        if (hver && hver !== i + 1) {
          if (s - sidast <= rof) sidast = s;
          break;
        }
        if (likt(px, py)) sidast = s;
        else if (s - sidast > rof) break;
      }
      return sidast;
    };
    const fram = ganga(w.bx, w.by, w.ux, w.uy), aftur = ganga(w.ax, w.ay, -w.ux, -w.uy);
    if (fram < 3 && aftur < 3) return v;
    return [
      (w.ax - w.ux * (aftur >= 3 ? aftur : 0)) / kvardi,
      (w.ay - w.uy * (aftur >= 3 ? aftur : 0)) / kvardi,
      (w.bx + w.ux * (fram >= 3 ? fram : 0)) / kvardi,
      (w.by + w.uy * (fram >= 3 ? fram : 0)) / kvardi,
      v[4],
    ];
  });
}

function linubond(gra: Uint8Array, W: number, H: number, kvardi: number, k: number): Butur5[] {
  const N = W * H, pt = k * kvardi;
  let b: Uint8Array = new Uint8Array(N);
  for (let i = 0; i < N; i++) b[i] = gra[i] < 215 ? 1 : 0;
  b = dilate(erode(b, W, H, 1), W, H, 1);
  const r = veggirUrGrimu(b, W, H);
  if (!r) return [];
  const B = r.butar.filter((v) => v[4] >= 3.5 && v[4] <= 14 * pt && Math.hypot(v[2] - v[0], v[3] - v[1]) >= 56 * pt);
  const halda = greidusia(B);
  return B.filter((v, i) => halda[i]);
}

const pkt = (px: number, py: number, v: Butur5) => {
  const dx = v[2] - v[0], dy = v[3] - v[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - v[0]) * dx + (py - v[1]) * dy) / L2));
  return Math.hypot(px - (v[0] + dx * t), py - (v[1] + dy * t));
};
const skerast = (a: Butur5, b: Butur5) => {
  const d = (b[3] - b[1]) * (a[2] - a[0]) - (b[2] - b[0]) * (a[3] - a[1]);
  if (Math.abs(d) < 1e-9) return false;
  const ua = ((b[2] - b[0]) * (a[1] - b[1]) - (b[3] - b[1]) * (a[0] - b[0])) / d, ub = ((a[2] - a[0]) * (a[1] - b[1]) - (a[3] - a[1]) * (a[0] - b[0])) / d;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
};

function husklasi(butar: Butur5[], tengibil: number, naerri: number, alma: number): Butur5[] {
  const n = butar.length;
  if (n < 4) return butar;
  const rot = Array.from({ length: n }, (_, i) => i);
  const finna = (i: number) => {
    while (rot[i] !== i) {
      rot[i] = rot[rot[i]];
      i = rot[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = butar[i], b = butar[j], bil = tengibil + ((a[4] || 0) + (b[4] || 0)) / 2;
      if (
        Math.min(a[0], a[2]) - bil > Math.max(b[0], b[2]) ||
        Math.min(b[0], b[2]) - bil > Math.max(a[0], a[2]) ||
        Math.min(a[1], a[3]) - bil > Math.max(b[1], b[3]) ||
        Math.min(b[1], b[3]) - bil > Math.max(a[1], a[3])
      )
        continue;
      if (skerast(a, b) || Math.min(pkt(a[0], a[1], b), pkt(a[2], a[3], b), pkt(b[0], b[1], a), pkt(b[2], b[3], a)) <= bil) rot[finna(i)] = finna(j);
    }
  const lengd = new Map<number, number>();
  butar.forEach((v, i) => {
    const r = finna(i);
    lengd.set(r, (lengd.get(r) || 0) + Math.hypot(v[2] - v[0], v[3] - v[1]));
  });
  let adal = -1, mest = 0;
  lengd.forEach((l, r) => {
    if (l > mest) {
      mest = l;
      adal = r;
    }
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  butar.forEach((v, i) => {
    if (finna(i) !== adal) return;
    x0 = Math.min(x0, v[0], v[2]);
    x1 = Math.max(x1, v[0], v[2]);
    y0 = Math.min(y0, v[1], v[3]);
    y1 = Math.max(y1, v[1], v[3]);
  });
  const sp = Math.max(x1 - x0, y1 - y0) * 0.03;
  x0 -= sp;
  y0 -= sp;
  x1 += sp;
  y1 += sp;
  const haldid = butar.map((v, i) => {
    const r = finna(i);
    if (r === adal || (lengd.get(r) ?? 0) >= mest * 0.25) return true;
    const mx = (v[0] + v[2]) / 2, my = (v[1] + v[3]) / 2;
    return mx >= x0 && mx <= x1 && my >= y0 && my <= y1;
  });
  if (naerri > 0) {
    const bilMilli = (a: Butur5, b: Butur5) => (skerast(a, b) ? 0 : Math.min(pkt(a[0], a[1], b), pkt(a[2], a[3], b), pkt(b[0], b[1], a), pkt(b[2], b[3], a)));
    for (let breytt = true; breytt; ) {
      breytt = false;
      lengd.forEach((l, r) => {
        if (l < (alma || 0)) return;
        const felagar: number[] = [];
        for (let i = 0; i < n; i++) if (finna(i) === r) felagar.push(i);
        if (!felagar.length || haldid[felagar[0]]) return;
        let naer = false;
        for (let j = 0; j < n && !naer; j++) {
          if (!haldid[j]) continue;
          for (const i of felagar)
            if (bilMilli(butar[i], butar[j]) <= naerri) {
              naer = true;
              break;
            }
        }
        if (naer) {
          felagar.forEach((i) => {
            haldid[i] = true;
          });
          breytt = true;
        }
      });
    }
  }
  return butar.filter((v, i) => haldid[i]);
}

const aSomuLinu = (v: Butur5, u: Butur5) => {
  const ux = u[2] - u[0], uy = u[3] - u[1], L = Math.hypot(ux, uy) || 1, vx = v[2] - v[0], vy = v[3] - v[1], Lv = Math.hypot(vx, vy) || 1;
  if (Math.abs(ux * vy - uy * vx) / (L * Lv) > 0.08) return false;
  const mx = (v[0] + v[2]) / 2 - u[0], my = (v[1] + v[3]) / 2 - u[1];
  return Math.abs(mx * uy - my * ux) / L <= (u[4] + v[4]) / 2 + 3 && (mx * ux + my * uy) / L >= -2 && (mx * ux + my * uy) / L <= L + 2;
};

function hurdagot(butar: Butur5[], gler: Butur5[] | null, k: number): Butur5[] {
  const minnst = 8 * k, mest = 78 * k, vik = 2 * k, ut: Butur5[] = [], n = butar.length;
  const L = butar.map(linuhnit), sjalfg = 3 * k;
  const erGler = (ax: number, ay: number, bx: number, by: number) => (gler || []).some((g) => aSomuLinu([ax, ay, bx, by, sjalfg], g));
  const bruad = new Uint8Array(n * 2);
  const rad = butar.map((v, i) => i).sort((p, q) => L[p].th - L[q].th);
  for (let a = 0; a < n; ) {
    let b = a + 1;
    while (b < n && L[rad[b]].th - L[rad[b - 1]].th < 0.01) b++;
    const hopur = rad.slice(a, b);
    a = b;
    const th = hopur.reduce((s0, i) => s0 + L[i].th, 0) / hopur.length, c = Math.cos(th), sn = Math.sin(th);
    const ln = hopur
      .map((i) => {
        const v = butar[i], t0 = c * v[0] + sn * v[1], t1 = c * v[2] + sn * v[3];
        return { i, rho: (-sn * v[0] + c * v[1] - sn * v[2] + c * v[3]) / 2, t0: Math.min(t0, t1), t1: Math.max(t0, t1), snuid: t0 > t1 };
      })
      .sort((p, q) => p.rho - q.rho);
    for (let x = 0; x < ln.length; ) {
      let y = x + 1;
      while (y < ln.length && ln[y].rho - ln[y - 1].rho < vik) y++;
      const rod = ln.slice(x, y).sort((p, q) => p.t0 - q.t0);
      x = y;
      let fyrri = rod[0];
      for (let z = 1; z < rod.length; z++) {
        const nu = rod[z], bil = nu.t0 - fyrri.t1;
        if (bil >= minnst && bil <= mest) {
          const rho = (fyrri.rho + nu.rho) / 2, ax = c * fyrri.t1 - sn * rho, ay = sn * fyrri.t1 + c * rho, bx = c * nu.t0 - sn * rho, by = sn * nu.t0 + c * rho;
          bruad[fyrri.i * 2 + (fyrri.snuid ? 0 : 1)] = 1;
          bruad[nu.i * 2 + (nu.snuid ? 1 : 0)] = 1;
          if (!erGler(ax, ay, bx, by)) ut.push([ax, ay, bx, by, Math.max(butar[fyrri.i][4] || 0, butar[nu.i][4] || 0) || sjalfg]);
        } else if (bil < minnst) {
          bruad[fyrri.i * 2 + (fyrri.snuid ? 0 : 1)] = 1;
          bruad[nu.i * 2 + (nu.snuid ? 1 : 0)] = 1;
        }
        if (nu.t1 > fyrri.t1) fyrri = nu;
      }
    }
  }
  for (let i = 0; i < n; i++)
    for (const e of [0, 1]) {
      if (bruad[i * 2 + e]) continue;
      const v = butar[i], px = e ? v[2] : v[0], py = e ? v[3] : v[1], Lv = Math.hypot(v[2] - v[0], v[3] - v[1]) || 1;
      const ux = ((e ? 1 : -1) * (v[2] - v[0])) / Lv, uy = ((e ? 1 : -1) * (v[3] - v[1])) / Lv;
      let snertir = false, naest = mest + 1, hitt: number | null = null;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const w = butar[j];
        if (pkt(px, py, w) <= ((w[4] || 0) + (v[4] || 0)) / 2 + 3 * k) {
          snertir = true;
          break;
        }
        const wx = w[2] - w[0], wy = w[3] - w[1], d = ux * wy - uy * wx;
        if (Math.abs(d) < 0.3 * Math.hypot(wx, wy)) continue;
        const tt = ((w[0] - px) * wy - (w[1] - py) * wx) / d, uu = ((w[0] - px) * uy - (w[1] - py) * ux) / d;
        if (tt > minnst && tt < naest && uu >= -0.02 && uu <= 1.02) {
          naest = tt;
          hitt = j;
        }
      }
      if (snertir || hitt == null) continue;
      const bx = px + ux * naest, by = py + uy * naest;
      if (!erGler(px, py, bx, by)) ut.push([px, py, bx, by, v[4] || sjalfg]);
    }
  return ut;
}

function tengdirVeggir(butar: Butur5[], gler: Butur5[] | null, hurdir: Butur5[] | null, k: number, langur: number): boolean[] {
  const n = butar.length, tengi = (gler || []).concat(hurdir || []);
  const snertast = (a: Butur5, b: Butur5, bil: number) =>
    skerast(a, b) || Math.min(pkt(a[0], a[1], b), pkt(a[2], a[3], b), pkt(b[0], b[1], a), pkt(b[2], b[3], a)) <= bil;
  return butar.map((v, i) => {
    if (Math.hypot(v[2] - v[0], v[3] - v[1]) >= langur) return true;
    for (let j = 0; j < n; j++) if (j !== i && snertast(v, butar[j], ((v[4] || 0) + (butar[j][4] || 0)) / 2 + 4 * k)) return true;
    for (const g of tengi) if (snertast(v, g, (v[4] || 0) / 2 + 4 * k)) return true;
    return false;
  });
}

export interface Talning {
  thykkir?: number;
  bond?: number;
  holir?: number;
  fyrirLengingu?: number;
  utanHuss?: number;
  veggir?: number;
  utiSia?: number;
  stakir?: number;
  gler?: number;
  hurdir?: number;
  metrar?: number;
  ms?: number;
  /** Felldir / klipptir í síun veggja (parket, skástrik, húsgögn, þykktarþak). */
  sia?: SiaTalning;
}

/** 383 veggirUrMynd: veggir skönnunar sem heilir bútar í dílum myndarinnar sem hreinsað var (skurðurinn). */
export function veggirUrMynd(r: Hreinsun, fb: number, fh: number, talning: Talning, anKlasa = false): Butur5[] | null {
  let butar: Butur5[] | null = null;
  const kpt = Math.max(fb, fh) / 2384, deila = (V: Butur5[]) => V.map((v) => v.map((n) => n / r.kvardi));
  const ipt = (V: Butur5[]): PtV[] => V.map((v) => ({ a: [v[0] / kpt, v[1] / kpt], b: [v[2] / kpt, v[3] / kpt], t: v[4] / kpt }));
  let thykk: Butur5[] | null = null;
  const kostir = r.thykkir && r.thykkir !== r.veggir ? [r.thykkir, r.veggir] : [r.veggir];
  for (const gr of kostir) {
    thykk = heilirUrGrimu(gr, r.W, r.H, r.kvardi, fb, fh);
    if (thykk) break;
  }
  let grunnur: Butur5[] = thykk || [];
  const bond = deila(linubond(r.gra, r.W, r.H, r.kvardi, kpt));
  grunnur = grunnur.concat(bond.filter((v) => !grunnur.some((u) => aSomuLinu(v, u))));
  let hol = deila(holirVeggir(r.gra, r.W, r.H, r.kvardi, kpt));
  if (hol.length && grunnur.length) {
    const gl0 = glerIBilum(grunnur, r.gra, r.W, r.H, r.kvardi, kpt);
    const fyrir = grunnur.concat(gl0);
    hol = hol.filter((v) => !fyrir.some((u) => aSomuLinu(v, u)));
  }
  const allir = grunnur.concat(hol);
  talning.thykkir = thykk ? thykk.length : 0;
  talning.bond = grunnur.length - talning.thykkir;
  talning.holir = hol.length;
  let lengd = 0;
  for (const v of allir) lengd += Math.hypot(v[2] - v[0], v[3] - v[1]);
  if (lengd * r.kvardi >= Math.max(r.W, r.H) * 2) {
    butar = fragaVeggi(ipt(allir), kpt, 2);
    talning.fyrirLengingu = butar.length;
    butar = fragaVeggi(ipt(lengjaVeggi(butar, r.gra, r.W, r.H, r.kvardi)), kpt, 2);
    const fyrirKlasa = butar.length;
    if (!anKlasa) butar = husklasi(butar, 30 * kpt, 115 * kpt, 115 * kpt);
    talning.utanHuss = fyrirKlasa - butar.length;
    talning.veggir = butar.length;
  }
  return butar;
}

/** Grá lóð (135–215) er ekki hús (383 erGraLod / golfMedUti). */
const erGraLod = (l: number) => l >= 135 && l <= 215;

/** Fastur greiningarkvarði eftir stærð BLAÐSINS (383 greiningarkvardi): allt blaðið ≈ 2800 vinnudílar. */
export const VIDMID_3D = 2200;
export function greiningarkvardi(fb: number, fh: number): number {
  return Math.min(1, 2800 / Math.max(fb, fh, 1));
}

export interface SkonnunarVeggir {
  /** Veggir [ax, ay, bx, by, t] í dílum frummyndar miðað við horn svæðisins. */
  veggir: Butur5[];
  /** Gler í bilum milli veggja (gluggar, glerveggir). */
  gler: Butur5[];
  /** Hurðargöt (aðeins til tengingar — 383 finnur þau sjálft úr bilunum). */
  hurdir: Butur5[];
  talning: Talning;
}

/** Allt ferli 383 undirbua fyrir skönnun: hreinsun → veggirUrMynd → veggir á grárri lóð felldir → gler → hurðargöt →
 * stakir veggir úti á gólfi felldir. `gra` = grátónamynd svæðisins í vinnukvarða (`kvardi` vinnudílar á díl frummyndar);
 * fb × fh = stærð frummyndar (blaðsins) — kvarði tákna (dílar á pt) miðast við hana. */
export function skonnunarVeggir(gra: Uint8Array, W: number, H: number, kvardi: number, fb: number, fh: number, o: HreinsunStillingar = {}): SkonnunarVeggir {
  const r = hreinsaGra(gra, W, H, kvardi, { thykkt: o.thykkt || 0, fylla: !!o.fylla, vidmid: o.vidmid ?? VIDMID_3D });
  const talning: Talning = {};
  let butar = veggirUrMynd(r, fb, fh, talning);
  if (!butar || !butar.length) return { veggir: [], gler: [], hurdir: [], talning };
  const inni = (x: number, y: number) => {
    const px = Math.round(x * r.kvardi), py = Math.round(y * r.kvardi);
    return px >= 0 && py >= 0 && px < r.W && py < r.H && !erGraLod(r.gra[py * r.W + px]);
  };
  const hlid = 14 * (Math.max(fb, fh) / 2384);
  const sia = butar.filter((v) => {
    const L = Math.hypot(v[2] - v[0], v[3] - v[1]) || 1, nx = -(v[3] - v[1]) / L, ny = (v[2] - v[0]) / L, d = (v[4] || 0) / 2 + hlid;
    return [0.2, 0.5, 0.8].some((q) => [0, d, -d].some((off) => inni(v[0] + (v[2] - v[0]) * q + nx * off, v[1] + (v[3] - v[1]) * q + ny * off)));
  });
  talning.utiSia = butar.length - sia.length;
  if (sia.length >= butar.length * 0.5) butar = sia;
  const kE = Math.max(fb, fh) / 2384;
  // Greina veggi betur (Agnar 10.10.2026, Berjavellir 6): hver veggur mældur í myndinni — parket / flísar, skástrik,
  // húsgögn og bekkir felld, þykktin klippt í kjarnann (≤ 35 cm). Kvarðinn: borðsins, annars 1:100 af stærð blaðsins.
  if (!o.anSiu) {
    const dpmFrum = o.dilarAMetra && o.dilarAMetra > 0 ? o.dilarAMetra : PT_A_METRA_1_100 * kE;
    const k = r.kvardi;
    const s = siaVeggi(
      butar.map((v) => [v[0] * k, v[1] * k, v[2] * k, v[3] * k, (v[4] || 0) * k]),
      r.gra,
      r.W,
      r.H,
      { dpm: dpmFrum * k }
    );
    talning.sia = s.talning;
    butar = s.veggir.map((v) => v.map((n) => n / k));
  }
  const gler = glerIBilum(butar, r.gra, r.W, r.H, r.kvardi, kE);
  const hurdir = hurdagot(butar, gler, kE);
  const tengdir = tengdirVeggir(butar, gler, hurdir, kE, 170 * kE);
  const fyrir = butar.length;
  butar = butar.filter((_, i) => tengdir[i]);
  talning.stakir = fyrir - butar.length;
  talning.veggir = butar.length;
  talning.gler = gler.length;
  talning.hurdir = hurdir.length;
  const mpx = ((0.0254 / 72) * 100) / kE;
  talning.metrar = Math.round(butar.reduce((s, v) => s + Math.hypot(v[2] - v[0], v[3] - v[1]), 0) * mpx);
  return { veggir: butar, gler, hurdir, talning };
}

// ── vörpun: teikning á borðinu ↔ svæðið sem greint er ───────────────────────────────────────────────────────────

type Svaedi = { x: number; y: number; w: number; h: number };
const gilt = (s: Svaedi | null | undefined): s is Svaedi =>
  !!s && [s.x, s.y, s.w, s.h].every((n) => Number.isFinite(n)) && s.w > 8 && s.h > 8;

export interface GreiningarSvaedi {
  /** Stærð frummyndar (blaðsins) — kvarði greiningarinnar miðast við hana. */
  frum: { b: number; h: number };
  /** Svæðið sem myndin á borðinu sýnir af blaðinu (dílar frummyndar). */
  myndSvaedi: Svaedi;
  /** Svæðið sem er greint: skurður hæðarinnar (húsið) innan myndarinnar, annars öll myndin. */
  sk: Svaedi;
  /** Vinnudílar á díl frummyndar og stærð vinnumyndarinnar. */
  kvardi: number;
  W: number;
  H: number;
  /** Svæðið í dílum MYNDARINNAR (eignarinnar) sem teiknað er í vinnumyndina. */
  uppspretta: { x: number; y: number; w: number; h: number };
}

/** Hvaða hluti myndarinnar er greindur og í hvaða kvarða — sama og Teikning: skurður hæðarinnar á frummyndinni, í föstum
 * kvarða eftir stærð blaðsins. `mynd` = stærð eignarinnar (dílar), `plan` = teikningin á borðinu. */
export function greiningarSvaedi(
  plan: { uttekt?: { frumB: number; frumH: number; skurdur?: Svaedi | null; myndSkurdur?: Svaedi | null } | null },
  mynd: { w: number; h: number }
): GreiningarSvaedi {
  const t = plan.uttekt;
  const frum = t && t.frumB > 0 && t.frumH > 0 ? { b: t.frumB, h: t.frumH } : { b: mynd.w, h: mynd.h };
  const myndSvaedi = t && gilt(t.myndSkurdur) ? t.myndSkurdur : { x: 0, y: 0, w: frum.b, h: frum.h };
  let sk: Svaedi = myndSvaedi;
  if (t && gilt(t.skurdur)) {
    const x0 = Math.max(myndSvaedi.x, t.skurdur.x), y0 = Math.max(myndSvaedi.y, t.skurdur.y);
    const x1 = Math.min(myndSvaedi.x + myndSvaedi.w, t.skurdur.x + t.skurdur.w), y1 = Math.min(myndSvaedi.y + myndSvaedi.h, t.skurdur.y + t.skurdur.h);
    if (x1 - x0 > 8 && y1 - y0 > 8) sk = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const kvardi = greiningarkvardi(frum.b, frum.h);
  const ax = mynd.w / myndSvaedi.w, ay = mynd.h / myndSvaedi.h;
  return {
    frum,
    myndSvaedi,
    sk,
    kvardi,
    W: Math.max(1, Math.round(sk.w * kvardi)),
    H: Math.max(1, Math.round(sk.h * kvardi)),
    uppspretta: { x: (sk.x - myndSvaedi.x) * ax, y: (sk.y - myndSvaedi.y) * ay, w: sk.w * ax, h: sk.h * ay },
  };
}

/** Bútar greiningarinnar (dílar frummyndar miðað við horn svæðisins) → borðhnit teikningarinnar `plan`. */
export function butarIBord(
  butar: Butur5[],
  g: Pick<GreiningarSvaedi, "myndSvaedi" | "sk">,
  plan: { x: number; y: number; width: number; height: number }
): { p: number[]; t: number }[] {
  const kx = plan.width / g.myndSvaedi.w, ky = plan.height / g.myndSvaedi.h;
  const X = (v: number) => plan.x + (g.sk.x - g.myndSvaedi.x + v) * kx;
  const Y = (v: number) => plan.y + (g.sk.y - g.myndSvaedi.y + v) * ky;
  return butar.map((v) => ({ p: [X(v[0]), Y(v[1]), X(v[2]), Y(v[3])], t: Math.max(1, (v[4] || 0) * kx) }));
}
