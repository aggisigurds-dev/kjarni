// Veggir Teikning-gluggans (Slökkvitæki 383) → ritanlegir veggir TurboPaint (Agnar 06.10.2026: TurboPaint verður
// leiðréttingarborðið fyrir grunnmyndir — 1. áfangi).
//
// Hæð í teikning_bord getur borið þrenns konar veggi, allt í dílum FRUMMYNDAR:
//   veggjaLinur  [{ p:[x0,y0,x1,y1,…], t, tegund? }]  — miðlínur sem TurboPaint vistaði áður (ganga fyrir)
//   pdfVeggir    [[x1,y1,x2,y2], …]                   — veggFLETIR úr vigur-PDF: hver veggur er tvær samsíða línur
//   veggir       [[x1,y1,x2,y2], …]                   — handdregnir veggir í Teikning-glugganum (ein lína hver)
// Hér verða pdfVeggir að miðlínum með þykkt (sama aðferð og heilirVeggir í 383: paraVeggi → samlínu-sameining →
// horn smellt saman), og handdregnir fá sjálfgefna þykkt. Útkoman er sama snið og veggjaLinur, svo hún fer á lagið
// „Veggir" eins og vistaðir veggir og skrifast til baka með „Vista í úttekt".
//
// KRAFA: eftir vistun notar Teikning AÐEINS veggjaLinur (merkt `leidrett`), svo allt sem Teikning sýndi verður að
// koma yfir — prófað á Fiskislóð 41 (teikning-veggir.test.ts: 100 % af veggjum Teikning, ≥ 95 % allra PDF-lína).
// Umfram 383: stakur veggflötur sem heldur áfram verður veggur, þunn pör í línu útveggja (gluggar) verða gler,
// og horn klippa ekki vegg sem heldur áfram framhjá þvervegg (T).

import { paraVeggi, type Strik } from "./pdf-veggir";

/** Tegund veggjar. ei60 / ei30 = ELDVEGGUR (Agnar 07.10.2026: „eins og veggi") — veggur með eldflokk, ekki sérstakt yfirlag. */
export type VeggTegund = "veggur" | "gler" | "hurd" | "ei60" | "ei30";
export const VEGG_TEGUNDIR: VeggTegund[] = ["veggur", "gler", "hurd", "ei60", "ei30"];

/** Eldflokkur veggjategundar í mínútum (0 = ekki eldveggur). */
export function eldflokkurTegundar(t: VeggTegund | undefined | null): 0 | 30 | 60 {
  return t === "ei60" ? 60 : t === "ei30" ? 30 : 0;
}

/** Veggur hæðar í dílum frummyndar: p = miðlína (x0, y0, x1, y1, …), t = þykkt.
 *
 * VISTAÐ SNIÐ (teikning_bord.haedir[].veggjaLinur): eldveggur er `{ tegund: "veggur", eld: 60 | 30 }` — Teikning-glugginn
 * (383) les `eld` sem eldflokk veggjarins (rauður í 2D og 3D, brunahólf) en eldri útgáfa hans sér venjulegan vegg, svo
 * ekkert hverfur meðan útgáfurnar tvær lifa hlið við hlið. Inni í TurboPaint er tegundin ei60 / ei30 (sjá vistunarSnid /
 * tegundUrVistun). */
export type FrumVeggur = { p: number[]; t: number; tegund?: VeggTegund; eld?: 30 | 60 };

/** TurboPaint-tegund → vistað snið veggjaLinur (tegund + eld). */
export function vistunarSnid(t: VeggTegund | undefined | null): { tegund: "veggur" | "gler" | "hurd"; eld?: 30 | 60 } {
  if (t === "ei60") return { tegund: "veggur", eld: 60 };
  if (t === "ei30") return { tegund: "veggur", eld: 30 };
  return { tegund: t === "gler" || t === "hurd" ? t : "veggur" };
}

/** Vistað snið (tegund + eld) → TurboPaint-tegund. Les líka `tegund: "ei60"` beint. */
export function tegundUrVistun(tegund: unknown, eld: unknown): VeggTegund {
  if (tegund === "ei60" || tegund === "ei30") return tegund;
  const e = Number(eld);
  if ((tegund == null || tegund === "veggur") && (e === 60 || e === 30)) return e === 60 ? "ei60" : "ei30";
  return tegund === "gler" || tegund === "hurd" ? tegund : "veggur";
}

/** 1 pt á blaði í kvarða 1:100 = 0,3528 mm × 100 = 0,03528 m í raun. */
const PT_I_METRUM = (0.0254 / 72) * 100;

/** Dílar frummyndar á pt — A1-forsenda eins og Teikning-glugginn (383 heilirVeggir: lengri hlið 2384 pt). */
export function dilarAPunkt(frum: { b: number; h: number }): number {
  return Math.max(frum.b || 0, frum.h || 0, 1) / 2384;
}

/** Ágiskaðir dílar frummyndar á metra: A1-blað í 1:100 (Fiskislóð 41: 71,4 — mælt 71,44 á málsetningum). */
export function dilarAMetraGisk(frum: { b: number; h: number }): number {
  return dilarAPunkt(frum) / PT_I_METRUM;
}

export function erVeggTegund(x: unknown): x is VeggTegund {
  return x === "veggur" || x === "gler" || x === "hurd" || x === "ei60" || x === "ei30";
}

type PtVeggur = { a: [number, number]; b: [number, number]; t: number };

const lengd = (v: PtVeggur) => Math.hypot(v.b[0] - v.a[0], v.b[1] - v.a[1]);

/** Samlínu bútar (sama stefna, sama miðlína innan `vik`) renna saman þegar bilið er ≤ `bil` — súla eða slitin lína,
 * ekki hurð. Ólíkt 383 renna aðeins bútar af SVIPAÐRI þykkt saman og þykktin er lengdarvegið meðaltal: annars tók
 * 10 cm útveggur þykkt súlnanna (34 cm) á allri lengdinni. Súlan sjálf stendur eftir sem sér bútur. */
function sameinaSamlinu(V: PtVeggur[], bil: number, vik: number): PtVeggur[] {
  type L = { th: number; a: [number, number]; b: [number, number]; t: number };
  const L: L[] = [];
  for (const v of V) {
    const dx = v.b[0] - v.a[0], dy = v.b[1] - v.a[1];
    if (Math.hypot(dx, dy) < 0.5) continue;
    let th = Math.atan2(dy, dx);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 0.01) th -= Math.PI;
    L.push({ th, a: v.a, b: v.b, t: v.t });
  }
  L.sort((p, q) => p.th - q.th);
  const ut: PtVeggur[] = [];
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
      const rod = ln.slice(a, b);
      a = b;
      // þykktarflokkar innan raðarinnar
      rod.sort((p, q) => p.t - q.t);
      const flokkar: (typeof rod)[] = [];
      for (const l of rod) {
        const f = flokkar[flokkar.length - 1];
        if (f && l.t - f[f.length - 1].t <= Math.max(1.5, 0.3 * l.t)) f.push(l);
        else flokkar.push([l]);
      }
      for (const flokkur of flokkar) {
        flokkur.sort((p, q) => p.t0 - q.t0);
        let nu: { t0: number; t1: number; tw: number; rs: number; w: number } | null = null;
        const loka = () => {
          if (!nu) return;
          const rho = nu.rs / nu.w;
          ut.push({ a: [c * nu.t0 - s * rho, s * nu.t0 + c * rho], b: [c * nu.t1 - s * rho, s * nu.t1 + c * rho], t: nu.tw / nu.w });
        };
        for (const l of flokkur) {
          const w = Math.max(1e-6, l.t1 - l.t0);
          if (nu && l.t0 - nu.t1 <= bil) {
            nu.t1 = Math.max(nu.t1, l.t1);
            nu.rs += l.rho * w;
            nu.tw += l.t * w;
            nu.w += w;
          } else {
            loka();
            nu = { t0: l.t0, t1: l.t1, tw: l.t * w, rs: l.rho * w, w };
          }
        }
        loka();
      }
    }
  }
  return ut;
}

/** Endi sem stendur innan `vik` frá miðlínu þverveggjar er færður Á hana — þá mætast veggirnir í horninu (383). */
function smellaHornum(V: PtVeggur[], vik: number) {
  if (V.length > 1500) return;
  const stefna = (v: PtVeggur): [number, number] => {
    const Lg = lengd(v) || 1;
    return [(v.b[0] - v.a[0]) / Lg, (v.b[1] - v.a[1]) / Lg];
  };
  for (const A of V) {
    for (const k of ["a", "b"] as const) {
      const P = A[k], d = stefna(A), O = A[k === "a" ? "b" : "a"];
      const L = lengd(A);
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
        // Ólíkt 383: bútur má ekki styttast um meira en helming né snúast við — annars féll súla (24 dílar) saman í
        // punkt þegar FJÆRI endinn smelltist á vegginn sem hún stendur við, og hvarf.
        const nyL = Math.hypot(X[0] - O[0], X[1] - O[1]);
        if ((X[0] - O[0]) * (P[0] - O[0]) + (X[1] - O[1]) * (P[1] - O[1]) <= 0 || nyL < L * 0.5) continue;
        // Klipping (endi færður INN) mest um þykkt: í horni stendur miðlínan aðeins ~t/2 út fyrir. Lengra yfirskot er T —
        // veggurinn heldur áfram framhjá þverveggnum (stigahúsið á Fiskislóð missti 0,33 m að dyrakarminum).
        if (nyL < L && L - nyL > Math.max(A.t, B.t)) continue;
        if (fj <= vik && (!best || fj < best.fj)) best = { fj, X };
      }
      if (best) A[k] = best.X;
    }
  }
}

/** Ás-samsíða umgjörð veggbúts: miðlína ± hálf þykkt þvert á hana (nákvæm fyrir láréttan/lóðréttan vegg). */
function kassi(v: PtVeggur) {
  const L = lengd(v) || 1;
  const nx = (-(v.b[1] - v.a[1]) / L) * (v.t / 2), ny = ((v.b[0] - v.a[0]) / L) * (v.t / 2);
  const xs = [v.a[0] + nx, v.a[0] - nx, v.b[0] + nx, v.b[0] - nx];
  const ys = [v.a[1] + ny, v.a[1] - ny, v.b[1] + ny, v.b[1] - ny];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Kubbar (stuttir og þykkir: súlur, karmar) eru paraðir í BÁÐAR áttir — sami kubbur verður tveir krossaðir bútar.
 * Kubbur sem liggur allur innan annars búts (með vikmörkum) fellur burt; annars stendur einn eftir per kubb. */
function fellaTvitalda(V: PtVeggur[], vik: number): PtVeggur[] {
  const erKubbur = (v: PtVeggur) => lengd(v) <= v.t * 1.6;
  const burt = new Set<number>();
  const staerri = (j: number, i: number) => {
    const fj = lengd(V[j]) * V[j].t, fi = lengd(V[i]) * V[i].t;
    return fj > fi + 1e-6 || (Math.abs(fj - fi) <= 1e-6 && j < i);
  };
  V.forEach((v, i) => {
    const a = kassi(v);
    const L = lengd(v) || 1;
    const d: [number, number] = [(v.b[0] - v.a[0]) / L, (v.b[1] - v.a[1]) / L];
    for (let j = 0; j < V.length; j++) {
      if (j === i || burt.has(j)) continue;
      const w = V[j];
      if (erKubbur(v)) {
        // kubbur: hinn helmingur krossins eða kubbur inni í vegg
        const b = kassi(w);
        const inni = b.x0 - vik <= a.x0 && b.y0 - vik <= a.y0 && b.x1 + vik >= a.x1 && b.y1 + vik >= a.y1;
        if (inni && (!erKubbur(w) || staerri(j, i))) {
          burt.add(i);
          return;
        }
      }
      // samsíða bútur sem liggur allur innan þykkari veggjar (tvöfaldar útlínur: innri og ytri lína hvor sitt par)
      const Lw = lengd(w) || 1;
      const e: [number, number] = [(w.b[0] - w.a[0]) / Lw, (w.b[1] - w.a[1]) / Lw];
      if (Math.abs(d[0] * e[1] - d[1] * e[0]) > 0.02) continue;
      const mx = (v.a[0] + v.b[0]) / 2 - w.a[0], my = (v.a[1] + v.b[1]) / 2 - w.a[1];
      const thvert = Math.abs(mx * e[1] - my * e[0]);
      if (thvert + v.t / 2 > w.t / 2 + vik) continue;
      const ta = (v.a[0] - w.a[0]) * e[0] + (v.a[1] - w.a[1]) * e[1], tb = (v.b[0] - w.a[0]) * e[0] + (v.b[1] - w.a[1]) * e[1];
      if (Math.min(ta, tb) < -vik || Math.max(ta, tb) > Lw + vik) continue;
      if (staerri(j, i)) {
        burt.add(i);
        return;
      }
    }
  });
  return V.filter((_, i) => !burt.has(i));
}

/** Stakur veggflötur: lína sem liggur á FLETI paraðs veggjar (miðlína ± t/2) en heldur áfram þar sem hinn flöturinn
 * er ekki teiknaður (Fiskislóð: vesturveggur stigahússins milli útidyranna — aðeins ytri flöturinn í PDF-flokknum).
 * Sá hluti sem enginn veggur í sömu röð þekur verður veggur með þykkt veggjarins, á miðlínu hans, svo veggurinn
 * hverfi ekki. Línur sem liggja ekki á veggfleti (hurðarblöð, þröskuldar, málsetningar) breytast ekki í veggi. */
function stakirFletir(pt: Strik[], V: PtVeggur[], lagmark: number): PtVeggur[] {
  const ut: PtVeggur[] = [];
  const NAER = 3 / PT_I_METRUM;
  // lína í ÞUNNU pari (gler, karmur) er ekki stakur veggflötur — glerið fær sína eigin meðferð
  const thunnPar = (s: Strik, d: [number, number], Ls: number) =>
    pt.some((q) => {
      if (q === s) return false;
      const Lq = Math.hypot(q[2] - q[0], q[3] - q[1]);
      if (Lq < 1e-6) return false;
      if (Math.abs(d[0] * (q[3] - q[1]) - d[1] * (q[2] - q[0])) / Lq > 0.02) return false;
      const f = Math.abs((q[0] - s[0]) * d[1] - (q[1] - s[1]) * d[0]);
      if (f < 0.2 || f >= 1.5) return false;
      const qa = (q[0] - s[0]) * d[0] + (q[1] - s[1]) * d[1], qb = (q[2] - s[0]) * d[0] + (q[3] - s[1]) * d[1];
      return Math.min(Ls, Math.max(qa, qb)) - Math.max(0, Math.min(qa, qb)) >= Ls * 0.5;
    });
  for (const s of pt) {
    const Ls = Math.hypot(s[2] - s[0], s[3] - s[1]);
    if (Ls < lagmark) continue;
    const d: [number, number] = [(s[2] - s[0]) / Ls, (s[3] - s[1]) / Ls];
    if (thunnPar(s, d, Ls)) continue;
    let best: { w: PtVeggur; e: [number, number]; frav: number } | null = null;
    for (const w of V) {
      const Lw = lengd(w);
      if (Lw < 1e-6) continue;
      const e: [number, number] = [(w.b[0] - w.a[0]) / Lw, (w.b[1] - w.a[1]) / Lw];
      if (Math.abs(d[0] * e[1] - d[1] * e[0]) > 0.02) continue;
      const fa = (s[0] - w.a[0]) * e[1] - (s[1] - w.a[1]) * e[0], fb = (s[2] - w.a[0]) * e[1] - (s[3] - w.a[1]) * e[0];
      // báðir endar á sama fleti (sama hlið, fjarlægð t/2 frá miðlínu, ±0,6 pt)
      if (Math.sign(fa) !== Math.sign(fb) || Math.abs(Math.abs(fa) - w.t / 2) > 0.6 || Math.abs(Math.abs(fb) - w.t / 2) > 0.6) continue;
      const ta = (s[0] - w.a[0]) * e[0] + (s[1] - w.a[1]) * e[1], tb = (s[2] - w.a[0]) * e[0] + (s[3] - w.a[1]) * e[1];
      const bil = Math.max(0, Math.min(ta, tb) - Lw, -Math.max(ta, tb));
      if (bil > NAER) continue;
      const frav = Math.abs(Math.abs(fa) - w.t / 2) + Math.abs(Math.abs(fb) - w.t / 2);
      if (!best || frav < best.frav) best = { w, e, frav };
    }
    if (!best) continue;
    const { w, e } = best;
    const ta = (s[0] - w.a[0]) * e[0] + (s[1] - w.a[1]) * e[1], tb = (s[2] - w.a[0]) * e[0] + (s[3] - w.a[1]) * e[1];
    // dregið frá: allir veggir í sömu röð (sama stefna, miðlína innan hálfrar þykktar)
    let eftir: [number, number][] = [[Math.min(ta, tb), Math.max(ta, tb)]];
    for (const u of [...V, ...ut]) {
      const Lu = lengd(u);
      if (Lu < 1e-6) continue;
      const f: [number, number] = [(u.b[0] - u.a[0]) / Lu, (u.b[1] - u.a[1]) / Lu];
      if (Math.abs(e[0] * f[1] - e[1] * f[0]) > 0.02) continue;
      const um: [number, number] = [(u.a[0] + u.b[0]) / 2, (u.a[1] + u.b[1]) / 2];
      if (Math.abs((um[0] - w.a[0]) * e[1] - (um[1] - w.a[1]) * e[0]) > Math.max(u.t, w.t) / 2 + 1) continue;
      const ua = (u.a[0] - w.a[0]) * e[0] + (u.a[1] - w.a[1]) * e[1], ub = (u.b[0] - w.a[0]) * e[0] + (u.b[1] - w.a[1]) * e[1];
      const c = Math.min(ua, ub), dd = Math.max(ua, ub);
      const n: [number, number][] = [];
      for (const [a, b] of eftir) {
        if (dd <= a || c >= b) { n.push([a, b]); continue; }
        if (c > a) n.push([a, c]);
        if (dd < b) n.push([dd, b]);
      }
      eftir = n;
    }
    const P = (x: number): [number, number] => [w.a[0] + e[0] * x, w.a[1] + e[1] * x];
    for (const [a, b] of eftir) if (b - a >= lagmark) ut.push({ a: P(a), b: P(b), t: w.t });
  }
  return ut;
}

/** Gler: ÞUNN pör (tvær línur nær hvor annarri en veggur — 1–3 dílar) í línu útveggjar eru gluggar/glerveggir (GN,
 * E30-gler á Fiskislóð). Paraveggir sér þau aldrei sem veggi, svo þau hurfu og útveggurinn varð götóttur. Hér verður
 * hvert slíkt par að vegg af tegundinni gler, fært á miðlínu veggjarins sem það er í línu við og með þykkt hans.
 * Þunn pör sem eru ekki í línu við vegg (hurðarblöð, húsgögn) eða ofan á vegg (tvöfaldar útlínur súlna) detta út. */
function glerUrThunnumPorum(pt: Strik[], V: PtVeggur[], lagmark: number): PtVeggur[] {
  const thunn = paraVeggi(pt, { minT: 0.25, maxT: 1.5 - 1e-6, minLengd: 6 });
  const ut: PtVeggur[] = [];
  for (const g of thunn) {
    const Lg = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
    if (Lg < lagmark) continue;
    const d: [number, number] = [(g.b[0] - g.a[0]) / Lg, (g.b[1] - g.a[1]) / Lg];
    const mid: [number, number] = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
    let best: { w: PtVeggur; e: [number, number]; thvert: number } | null = null;
    for (const w of V) {
      const Lw = lengd(w);
      if (Lw < 1e-6) continue;
      const e: [number, number] = [(w.b[0] - w.a[0]) / Lw, (w.b[1] - w.a[1]) / Lw];
      if (Math.abs(d[0] * e[1] - d[1] * e[0]) > 0.02) continue;
      const thvert = Math.abs((mid[0] - w.a[0]) * e[1] - (mid[1] - w.a[1]) * e[0]);
      if (thvert > Math.max(1.5 * w.t, 0.3 / PT_I_METRUM)) continue;
      // bil eftir línunni milli glersins og veggbútsins: ≤ 3 m
      const ta = (g.a[0] - w.a[0]) * e[0] + (g.a[1] - w.a[1]) * e[1], tb = (g.b[0] - w.a[0]) * e[0] + (g.b[1] - w.a[1]) * e[1];
      const bil = Math.max(0, Math.min(ta, tb) - Lw, -Math.max(ta, tb));
      if (bil > 3 / PT_I_METRUM) continue;
      if (!best || thvert < best.thvert) best = { w, e, thvert };
    }
    if (!best) continue;
    const { w, e } = best;
    const ta = (g.a[0] - w.a[0]) * e[0] + (g.a[1] - w.a[1]) * e[1], tb = (g.b[0] - w.a[0]) * e[0] + (g.b[1] - w.a[1]) * e[1];
    const t0 = Math.min(ta, tb), t1 = Math.max(ta, tb);
    // ofan á veggnum sjálfum (meira en hálft): tvöföld útlína, ekki gler
    let skorun = 0;
    for (const u of V) {
      const Lu = lengd(u);
      if (Lu < 1e-6) continue;
      const f: [number, number] = [(u.b[0] - u.a[0]) / Lu, (u.b[1] - u.a[1]) / Lu];
      if (Math.abs(e[0] * f[1] - e[1] * f[0]) > 0.02) continue;
      const um: [number, number] = [(u.a[0] + u.b[0]) / 2, (u.a[1] + u.b[1]) / 2];
      if (Math.abs((um[0] - w.a[0]) * e[1] - (um[1] - w.a[1]) * e[0]) > Math.max(u.t, w.t)) continue;
      const ua = (u.a[0] - w.a[0]) * e[0] + (u.a[1] - w.a[1]) * e[1], ub = (u.b[0] - w.a[0]) * e[0] + (u.b[1] - w.a[1]) * e[1];
      skorun += Math.max(0, Math.min(t1, Math.max(ua, ub)) - Math.max(t0, Math.min(ua, ub)));
    }
    if (skorun > 0.5 * (t1 - t0)) continue;
    // Glerið heldur SINNI miðlínu (gluggi getur staðið innan við veggflötinn, t.d. 10 cm á Fiskislóð) en fær þykkt
    // veggjarins svo það loki gatinu í útveggnum.
    ut.push({ a: g.a, b: g.b, t: Math.max(w.t, g.thykkt) });
  }
  // gler í mörgum rúðum (póstar á milli) verður einn glerbútur
  return sameinaSamlinu(ut, 0.25 / PT_I_METRUM, 1.2);
}

export interface PdfVeggjaStillingar {
  /** Styttri bútar en þetta (metrar) detta út — karmar og afgangar. Sjálfgefið 0,25 m = 7 pt, sama mark og Teikning
   * (383 fragaVeggi): allt sem Teikning sýndi kemur yfir, því eftir vistun notar Teikning AÐEINS veggjaLinur. */
  lagmarkM?: number;
  /** Gler úr þunnum pörum í línu veggja (sjálfgefið já). */
  gler?: boolean;
  /** Einingar strikanna á pt (sjálfgefið: dílar frummyndar, A1-forsenda). Veggjaritillinn les PDF-síðuna sjálfa og
   * gefur strik í ¼ pt (4). */
  dilarAPunkt?: number;
  /** Stakar línur → veggir (veggjaritillinn, Agnar 06.10.2026): lína veggjaflokksins sem enginn paraður veggur þekur
   * og er a.m.k. `stakarLagmarkM` löng verður veggur með dæmigerðri þykkt (miðgildi paraðra veggja). Sjálfgefið nei
   * (innflutningur hæðar heldur reglu Teikning-gluggans). */
  stakar?: boolean;
  /** Sjálfgefið 1,2 m — hurðarblöð (0,8–1,0 m) verða ekki veggir. */
  stakarLagmarkM?: number;
}

/** Línur sem enginn veggur þekur (miðlína ± t/2 + 1,5 pt) og eru ≥ lagmark → veggir með þykkt `t`, á línunni sjálfri.
 * Hver nýr veggur þekur þá næstu (tvær línur þétt saman verða einn veggur). */
function stakarLinur(pt: Strik[], V: PtVeggur[], lagmark: number, t: number): PtVeggur[] {
  const ut: PtVeggur[] = [];
  const thekur = (x: number, y: number, w: PtVeggur) => {
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L2)) : 0;
    return Math.hypot(x - (w.a[0] + u * dx), y - (w.a[1] + u * dy)) <= w.t / 2 + 1.5;
  };
  const rodun = pt
    .map((s) => ({ s, L: Math.hypot(s[2] - s[0], s[3] - s[1]) }))
    .filter((x) => x.L >= lagmark)
    .sort((a, b) => b.L - a.L);
  for (const { s, L } of rodun) {
    const n = Math.max(2, Math.ceil(L / 1)); // sýni á ~1 pt fresti
    const kandidatar = [...V, ...ut].filter((w) => {
      // grófsía: umgjörð veggjar nálægt línunni
      const m = w.t / 2 + 2;
      return !(
        Math.max(w.a[0], w.b[0]) + m < Math.min(s[0], s[2]) ||
        Math.min(w.a[0], w.b[0]) - m > Math.max(s[0], s[2]) ||
        Math.max(w.a[1], w.b[1]) + m < Math.min(s[1], s[3]) ||
        Math.min(w.a[1], w.b[1]) - m > Math.max(s[1], s[3])
      );
    });
    let byrjun = -1;
    const bil: [number, number][] = [];
    for (let k = 0; k <= n; k++) {
      const f = k / n, x = s[0] + (s[2] - s[0]) * f, y = s[1] + (s[3] - s[1]) * f;
      const thakid = kandidatar.some((w) => thekur(x, y, w));
      if (!thakid && byrjun < 0) byrjun = f;
      if ((thakid || k === n) && byrjun >= 0) {
        bil.push([byrjun, thakid ? f : 1]);
        byrjun = -1;
      }
    }
    for (const [f0, f1] of bil) {
      if ((f1 - f0) * L < lagmark) continue;
      ut.push({
        a: [s[0] + (s[2] - s[0]) * f0, s[1] + (s[3] - s[1]) * f0],
        b: [s[0] + (s[2] - s[0]) * f1, s[1] + (s[3] - s[1]) * f1],
        t,
      });
    }
  }
  return ut;
}

/** pdfVeggir (veggflatir, dílar frummyndar) → miðlínuveggir með þykkt (dílar frummyndar). */
export function veggirUrPdfStrikum(
  strik: ReadonlyArray<ReadonlyArray<number>>,
  frum: { b: number; h: number },
  st: PdfVeggjaStillingar = {}
): FrumVeggur[] {
  const k = st.dilarAPunkt && st.dilarAPunkt > 0 ? st.dilarAPunkt : dilarAPunkt(frum);
  const pt: Strik[] = [];
  for (const s of strik || []) {
    if (!Array.isArray(s) || s.length < 4 || !s.slice(0, 4).every((n) => Number.isFinite(n))) continue;
    pt.push([s[0] / k, s[1] / k, s[2] / k, s[3] / k]);
  }
  if (!pt.length) return [];
  let V: PtVeggur[] = paraVeggi(pt, { minT: 1.5, maxT: 20, minLengd: 6 }).map((v) => ({ a: v.a, b: v.b, t: v.thykkt }));
  // Séu strikin EINFALDAR línur (ekki tvær hliðar veggjar) parast fátt — þá er hvert langt strik veggur (eins og 383),
  // með sjálfgefinni þykkt 15 cm.
  let langt = 0, parad = 0;
  for (const s of pt) {
    const Lg = Math.hypot(s[2] - s[0], s[3] - s[1]);
    if (Lg >= 6) langt += Lg;
  }
  for (const v of V) parad += lengd(v);
  if (parad * 2 < langt * 0.4) {
    const t = 0.15 / PT_I_METRUM;
    V = pt.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) >= 6).map((s) => ({ a: [s[0], s[1]], b: [s[2], s[3]], t }));
  }
  V = sameinaSamlinu(V, 18, 1.2);
  V = fellaTvitalda(V, 1);
  const lagmark = (st.lagmarkM ?? 0.25) / PT_I_METRUM;
  const stakir = stakirFletir(pt, V, lagmark);
  if (stakir.length) V = fellaTvitalda(sameinaSamlinu([...V, ...stakir], 18, 1.2), 1);
  const G = st.gler === false ? [] : glerUrThunnumPorum(pt, V, Math.max(lagmark, 0.5 / PT_I_METRUM));
  const glerSet = new Set(G);
  if (st.stakar) {
    const thykktir = V.map((v) => v.t).sort((a, b) => a - b);
    const t = thykktir.length ? thykktir[thykktir.length >> 1] : 0.15 / PT_I_METRUM;
    const S = stakarLinur(pt, [...V, ...G], (st.stakarLagmarkM ?? 1.2) / PT_I_METRUM, t);
    if (S.length) V = [...V, ...S];
  }
  const allir = [...V, ...G];
  smellaHornum(allir, 13);
  return allir
    .filter((v) => lengd(v) >= lagmark)
    .map((v) => {
      const ut: FrumVeggur = {
        p: [v.a[0] * k, v.a[1] * k, v.b[0] * k, v.b[1] * k].map((n) => Math.round(n)),
        t: Math.max(1, Math.round(v.t * k)),
      };
      if (glerSet.has(v)) ut.tegund = "gler";
      return ut;
    });
}

/** Handdregnir veggir Teikning-gluggans ([x1,y1,x2,y2], ein lína hver) → veggir með sjálfgefinni þykkt (15 cm). */
export function veggirUrHanddregnum(
  linur: ReadonlyArray<ReadonlyArray<number>>,
  frum: { b: number; h: number },
  thykktM = 0.15
): FrumVeggur[] {
  const t = Math.max(1, Math.round(thykktM * dilarAMetraGisk(frum)));
  const ut: FrumVeggur[] = [];
  for (const s of linur || []) {
    if (!Array.isArray(s) || s.length < 4 || !s.slice(0, 4).every((n) => Number.isFinite(n))) continue;
    if (Math.hypot(s[2] - s[0], s[3] - s[1]) < 1) continue;
    ut.push({ p: [s[0], s[1], s[2], s[3]].map((n) => Math.round(n)), t });
  }
  return ut;
}

/** Gildir vistaðir veggir (veggjaLinur) hæðar — annað (rusl, of fáir punktar) síast burt. */
export function lesaVeggjaLinur(x: unknown): FrumVeggur[] {
  if (!Array.isArray(x)) return [];
  const ut: FrumVeggur[] = [];
  for (const v of x) {
    if (!v || typeof v !== "object") continue;
    const o = v as { p?: unknown; t?: unknown; tegund?: unknown; eld?: unknown };
    if (!Array.isArray(o.p) || o.p.length < 4 || !o.p.every((n) => Number.isFinite(n))) continue;
    const vg: FrumVeggur = { p: (o.p as number[]).slice(0, o.p.length - (o.p.length % 2)), t: Number(o.t) > 0 ? Number(o.t) : 1 };
    // eldveggur (`eld: 60/30` á vegg) → ei60 / ei30
    if (erVeggTegund(o.tegund) || o.eld != null) vg.tegund = tegundUrVistun(o.tegund, o.eld);
    ut.push(vg);
  }
  return ut;
}

/** Veggirnir sem hæðin opnast með í TurboPaint: vistaðar veggjaLinur ganga fyrir; annars veggir Teikning-gluggans
 * (pdfVeggir paraðir + handdregnir) svo hægt sé að leiðrétta þá. */
export function veggirHaedar(
  haed: { veggjaLinur?: unknown; pdfVeggir?: unknown; veggir?: unknown; leidrett?: unknown },
  frum: { b: number; h: number }
): { veggir: FrumVeggur[]; heimild: "turbopaint" | "teikning" | null } {
  const vistadir = lesaVeggjaLinur(haed.veggjaLinur);
  // `leidrett` + fylki merkir að TurboPaint-yfirferðin sé sannleikurinn, líka þegar fylkið er tómt. Annars myndu
  // PDF-veggirnir lifna aftur eftir að notandinn eyddi röngum veggjum og 3D sýndi annað en samþykkta 2D-yfirlagið.
  if (vistadir.length || (haed.leidrett && Array.isArray(haed.veggjaLinur))) {
    return { veggir: vistadir, heimild: "turbopaint" };
  }
  const pdf = Array.isArray(haed.pdfVeggir) ? veggirUrPdfStrikum(haed.pdfVeggir as number[][], frum) : [];
  const hand = Array.isArray(haed.veggir) ? veggirUrHanddregnum(haed.veggir as number[][], frum) : [];
  const veggir = [...pdf, ...hand];
  return { veggir, heimild: veggir.length ? "teikning" : null };
}
