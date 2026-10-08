// SJÁLFVIRK HREINSUN VEGGJA (Agnar 08.10.2026: „automater sem reynir að tengja saman veggina og henda burtu stökum
// veggjaeiningum og aðra hluti"). Hreinar föll — línur inn, línur út — notuð af sjálfvirka verkferlinu (sjalfvirkt.ts)
// á veggi sem greiningin skilaði (vigur-PDF, Veggjavél eða myndgreining í vafranum).
//
// Röðin (hver liður telur hvað hann gerði):
//   1. strik-punkt  reglulegar raðir stuttra samlínu búta (ásalínur, falin lína) fara
//   2. rétta        næstum láréttir / lóðréttir (±rettaGradur) verða nákvæmlega 0° / 90°
//   3. sameina      samlínu bútar sömu tegundar sem skarast eða liggja í línu með bili < samlinaBilM renna saman
//   4. smella       endapunktar ≤ smellaM frá öðrum enda (horn) eða frá hlið annars veggjar (T) mætast
//   5. lengja       laus endi lengist að næsta vegg (horn / T / samlína) ef hann er < lengjaM frá
//   6. stakir       bútar < stakurM sem tengjast engu í hvorugum enda fara
//   7. utan húss    (husUtlina — eftir hurðagreiningu, svo hurðargöt loki útlínunni) allt utan útlínu hússins fer
//
// FASTAR LÍNUR (`fastar`): veggir sem Agnar teiknaði / leiðrétti sjálfur. Hreinsunin breytir þeim ALDREI — nýju línurnar
// mega smellast og lengjast AÐ þeim, en þær hreyfast hvorki, sameinast né hverfa.
//
// VIKMÖRK eru í metrum (og gráðum) og reiknast yfir í einingar línanna (borðdílar eða dílar frummyndar) með `dpm`
// (einingar á metra — kvarði teikningarinnar). Sjálfgefin gildi: SJALFGEFIN_VIKMORK; stillanleg með `lesaVikmork`
// (t.d. úr localStorage `tp_sjalfvirkt_vikmork`, JSON með þeim gildum sem á að breyta).

import { tengjaVeggi } from "./veggja-leidretting";
import type { VeggTegund } from "./teikning-veggir";
import type { LineObject } from "./types";

/** Lína í hreinsun: miðlína (x0, y0, x1, y1, …), þykkt og tegund — sömu einingar og `dpm`. */
export interface HLina {
  p: number[];
  t: number;
  tegund?: VeggTegund;
}

export interface Vikmork {
  /** Endapunktar sem eru nær hver öðrum (eða hlið annars veggjar) en þetta mætast — horn og T. Sjálfgefið 0,15 m. */
  smellaM: number;
  /** Samlínu bútar sömu tegundar sem skarast eða hafa minna bil en þetta renna saman. Sjálfgefið 0,10 m. */
  samlinaBilM: number;
  /** Hliðrun þvert á línu sem telst „sama lína" (auk helmings þynnri veggjarins). Sjálfgefið 0,05 m. */
  samlinaThvertM: number;
  /** Næstum láréttur / lóðréttur innan þessa (gráður) verður nákvæmlega 0° / 90°. Sjálfgefið 3°. */
  rettaGradur: number;
  /** Laus endi lengist að næsta vegg ef hann er nær en þetta. Sjálfgefið 0,40 m. */
  lengjaM: number;
  /** Bútar styttri en þetta sem tengjast engu í hvorugum enda fara. Sjálfgefið 0,50 m. */
  stakurM: number;
  /** Sama á SKÖNNUÐUM teikningum (myndgreining / Veggjavél): húsgögn og texti verða að stökum „veggjum" ~0,5–1 m.
   * Mælt 08.10.2026: 1,0 m gaf einni lagfæringu færra á Álfaborg 2. hæð (báðar leiðir) en 4 fleiri á vigur-PDF
   * Fiskislóðar — þess vegna aðeins á skönnunum. Sjálfgefið 1,0 m. */
  stakurSkonnunM: number;
  /** Op í útlínu hússins sem lokast þegar „utan húss" er metið (hurðargöt sem fundust ekki). Sjálfgefið 1,30 m. */
  lokunM: number;
  /** Strik-punkt-línur: a.m.k. `butar` samlínu bútar með reglulegu bili [bilMinM, bilMaxM] sem spanna ≥ spannM. */
  strikPunkt: { butar: number; bilMinM: number; bilMaxM: number; spannM: number };
  /** Hurðir: bil í vegg [minM, maxM] = hurð; [bogiMinM, bogiMaxM] = hurð AÐEINS ef bogi sést á teikningunni;
   * (bilahurdM, bilahurdMaxM] í útvegg = bílahurð. Bil [glerMinM, glerMaxM] með línum þvert yfir (gluggi) = gler. */
  hurd: {
    minM: number;
    maxM: number;
    bogiMinM: number;
    bogiMaxM: number;
    bilahurdM: number;
    bilahurdMaxM: number;
    glerMinM: number;
    glerMaxM: number;
    /** 1 = gat með línum þvert yfir (gluggi) verður gler; 0 = það verður hvorki hurð né gler. */
    glerUrBili: number;
    /** 1 = hurð við laust veggjarend (b) krefst boga á teikningunni. */
    bKrefstBoga: number;
  };
}

export const SJALFGEFIN_VIKMORK: Vikmork = {
  smellaM: 0.15,
  samlinaBilM: 0.1,
  samlinaThvertM: 0.05,
  rettaGradur: 3,
  lengjaM: 0.4,
  stakurM: 0.5,
  stakurSkonnunM: 1,
  lokunM: 1.3,
  strikPunkt: { butar: 4, bilMinM: 0.03, bilMaxM: 0.65, spannM: 3 },
  hurd: { minM: 0.7, maxM: 1.3, bogiMinM: 0.6, bogiMaxM: 1.3, bilahurdM: 2.4, bilahurdMaxM: 6, glerMinM: 0.3, glerMaxM: 8, glerUrBili: 0, bKrefstBoga: 1 },
};

/** Lykill í localStorage fyrir stillt vikmörk (JSON með þeim gildum sem víkja frá sjálfgefnu). */
export const VIKMORK_LYKILL = "tp_sjalfvirkt_vikmork";

/** Sjálfgefin vikmörk + þau sem eru stillt (hlutur eða JSON-strengur). Rusl og ógild gildi hunsast. */
export function lesaVikmork(still?: unknown): Vikmork {
  let o: unknown = still;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      o = null;
    }
  }
  const ut: Vikmork = JSON.parse(JSON.stringify(SJALFGEFIN_VIKMORK));
  if (!o || typeof o !== "object") return ut;
  const blanda = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const k of Object.keys(a)) {
      const v = b[k];
      if (a[k] && typeof a[k] === "object") {
        if (v && typeof v === "object") blanda(a[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else if (typeof v === "number" && Number.isFinite(v) && v >= 0) a[k] = v;
    }
  };
  blanda(ut as unknown as Record<string, unknown>, o as Record<string, unknown>);
  return ut;
}

export interface HreinsunTalning {
  /** Strik-punkt-bútar fjarlægðir. */
  strikPunkt: number;
  /** Bútar réttir í 0° / 90°. */
  rettir: number;
  /** Bútar sem runnu saman við annan (fjöldi búta sem hvarf í samruna). */
  sameinadir: number;
  /** Endar smelltir saman (horn, T, samlína ≤ smellaM). */
  smellt: number;
  /** Lausir endar lengdir að næsta vegg (≤ lengjaM). */
  lengdir: number;
  /** Stakir stuttir bútar fjarlægðir. */
  stakir: number;
}

export interface Fjarlaegd {
  p: number[];
  astaeda: "strikpunkt" | "stakur" | "utan";
}

const tomTalning = (): HreinsunTalning => ({ strikPunkt: 0, rettir: 0, sameinadir: 0, smellt: 0, lengdir: 0, stakir: 0 });

// ── grunnur ────────────────────────────────────────────────────────────────────────────────────────────────

type P = [number, number];

export function lengdLinu(p: number[]): number {
  let s = 0;
  for (let i = 2; i + 1 < p.length; i += 2) s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return s;
}

/** Fjarlægð punkts frá brotalínu. */
export function fjarlaegdFraLinu(x: number, y: number, p: number[]): number {
  let best = Infinity;
  for (let i = 2; i + 1 < p.length; i += 2) {
    const ax = p[i - 2], ay = p[i - 1], dx = p[i] - ax, dy = p[i + 1] - ay, L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + u * dx), y - (ay + u * dy)));
  }
  return best;
}

/** Skerast bútarnir a–b og c–d? */
function skerast(a: P, b: P, c: P, d: P): boolean {
  const den = (d[1] - c[1]) * (b[0] - a[0]) - (d[0] - c[0]) * (b[1] - a[1]);
  if (Math.abs(den) < 1e-12) return false;
  const ua = ((d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0])) / den;
  const ub = ((b[0] - a[0]) * (a[1] - c[1]) - (b[1] - a[1]) * (a[0] - c[0])) / den;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

/** Brotalínur → stakir tveggja punkta bútar (tegund og þykkt fylgja). */
export function iButa(linur: HLina[]): HLina[] {
  const ut: HLina[] = [];
  for (const l of linur) {
    for (let i = 2; i + 1 < l.p.length; i += 2) {
      const p = [l.p[i - 2], l.p[i - 1], l.p[i], l.p[i + 1]];
      if (Math.hypot(p[2] - p[0], p[3] - p[1]) < 1e-6) continue;
      ut.push(l.tegund ? { p, t: l.t, tegund: l.tegund } : { p, t: l.t });
    }
  }
  return ut;
}

const tegundAf = (l: HLina): VeggTegund => l.tegund ?? "veggur";

/** Stefna búts í [0, π). */
function stefna(p: number[]): number {
  let th = Math.atan2(p[3] - p[1], p[2] - p[0]);
  if (th < 0) th += Math.PI;
  if (th >= Math.PI - 1e-9) th -= Math.PI;
  return th;
}

/** Er búturinn lárétt eða lóðréttur (innan `gradur`)? 0 = lárétt, 1 = lóðrétt, -1 = hvorugt (skáveggur). */
export function asStefna(p: number[], gradur = 1.5): 0 | 1 | -1 {
  const th = (stefna(p) * 180) / Math.PI;
  if (th <= gradur || th >= 180 - gradur) return 0;
  if (Math.abs(th - 90) <= gradur) return 1;
  return -1;
}

// ── 1. strik-punkt-línur ───────────────────────────────────────────────────────────────────────────────────

/** Bútar sem mynda REGLULEGA röð á einni línu (ásalína, falin lína): ≥ `butar` samlínu bútar, öll bil innan
 * [bilMin, bilMax] og svipuð (mesta ≤ 2,2 × minnsta), röðin spannar ≥ spann, og bútarnir eru annaðhvort stuttir
 * (≤ 1,2 m) eða skiptast á langir og örstuttir (punktar ≤ 0,3 m). Hurðargöt (≥ 0,7 m) eru utan bilsins. Skilar
 * vísum búta í `butar`. Aðeins „veggur" — gler og hurðir eru aldrei strik-punkt. */
export function strikPunktLinur(butar: HLina[], dpm: number, st: Vikmork["strikPunkt"] = SJALFGEFIN_VIKMORK.strikPunkt): Set<number> {
  const ut = new Set<number>();
  const m = (x: number) => x * dpm;
  const hopar = new Map<string, { i: number; th: number; rho: number; t0: number; t1: number }[]>();
  butar.forEach((b, i) => {
    if (tegundAf(b) !== "veggur" || b.p.length !== 4) return;
    const th = stefna(b.p), c = Math.cos(th), s = Math.sin(th);
    const rho = (-s * (b.p[0] + b.p[2]) + c * (b.p[1] + b.p[3])) / 2;
    const a = c * b.p[0] + s * b.p[1], e = c * b.p[2] + s * b.p[3];
    // fötur eftir stefnu (~1°) — nágrannafötur eru skoðaðar líka með því að námunda á tvo vegu
    const k = String(Math.round((th * 180) / Math.PI) % 180);
    const l = hopar.get(k) ?? [];
    l.push({ i, th, rho, t0: Math.min(a, e), t1: Math.max(a, e) });
    hopar.set(k, l);
  });
  const vikRho = m(0.06);
  for (const listi of hopar.values()) {
    listi.sort((a, b) => a.rho - b.rho);
    for (let a = 0; a < listi.length; ) {
      let b = a + 1;
      while (b < listi.length && listi[b].rho - listi[b - 1].rho <= vikRho) b++;
      const rod = listi.slice(a, b).sort((x, y) => x.t0 - y.t0);
      a = b;
      if (rod.length < st.butar) continue;
      // samfelldar keðjur með bil innan marka
      let k0 = 0;
      for (let k = 1; k <= rod.length; k++) {
        const bil = k < rod.length ? rod[k].t0 - rod[k - 1].t1 : Infinity;
        if (k < rod.length && bil >= m(st.bilMinM) && bil <= m(st.bilMaxM)) continue;
        const kedja = rod.slice(k0, k);
        k0 = k;
        if (kedja.length < st.butar) continue;
        const spann = kedja[kedja.length - 1].t1 - kedja[0].t0;
        if (spann < m(st.spannM)) continue;
        const bilin: number[] = [];
        for (let j = 1; j < kedja.length; j++) bilin.push(kedja[j].t0 - kedja[j - 1].t1);
        const mn = Math.min(...bilin), mx = Math.max(...bilin);
        if (mx > Math.max(mn, m(0.02)) * 2.2) continue;
        const lengdir = kedja.map((x) => x.t1 - x.t0);
        const stuttir = lengdir.every((L) => L <= m(1.2));
        const punktar = lengdir.filter((L) => L <= m(0.3)).length;
        if (!stuttir && punktar < 2) continue;
        for (const x of kedja) ut.add(x.i);
      }
    }
  }
  return ut;
}

// ── 2. rétta ───────────────────────────────────────────────────────────────────────────────────────────────

/** Næstum lárétt / lóðrétt (innan `gradur`) → nákvæmlega 0° / 90° um miðju bútsins. Skilar nýjum bút eða null (óbreytt). */
export function retta(p: number[], gradur: number): number[] | null {
  if (p.length !== 4) return null;
  const dx = p[2] - p[0], dy = p[3] - p[1];
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
  const halli = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI; // 0 = lárétt, 90 = lóðrétt
  if (halli > 1e-6 && halli <= gradur) {
    const y = (p[1] + p[3]) / 2;
    return [p[0], y, p[2], y];
  }
  if (90 - halli > 1e-6 && 90 - halli <= gradur) {
    const x = (p[0] + p[2]) / 2;
    return [x, p[1], x, p[3]];
  }
  return null;
}

// ── 3. sameina samlínu ─────────────────────────────────────────────────────────────────────────────────────

/** Sameinar samlínu búta sömu tegundar: sama stefna (< 1°), sama lína (miðlínur innan helmings þynnri + vikThvert),
 * og skarast eða bilið < `bil`. Þykkt = lengdarvegið meðaltal — en bútar af ólíkri þykkt (súla í vegg: > 1,8×) renna
 * ekki saman nema sá þynnri sé ALLUR innan þess þykkari (tvítekning). `fastar` sameinast aldrei; nýr bútur sem liggur
 * allur ofan á fastri línu sömu tegundar fer (tvítekning). Skilar nýjum lista og fjölda búta sem hurfu. */
export function sameinaSamlinur(butar: HLina[], bil: number, vikThvert: number, fastar: HLina[] = []): { butar: HLina[]; horfnir: number } {
  // Hver bútur heldur upprunalegu hnitunum sínum (`b`): bútur sem rennur ekki saman við annan kemur ÓBREYTTUR út. Ofanvarp
  // á sameiginlegan ás hópsins (meðalstefna) — ekki á stefnu hvers búts — annars hliðrast línur í hlutfalli við fjarlægð
  // frá núllpunkti (0,1° × 4.000 dílar = 7 dílar; fannst á Fiskislóð 2. hæð 08.10.2026).
  type L = { b: HLina; th: number; rho: number; t0: number; t1: number; t: number; tegund: VeggTegund; fast: boolean; burt: boolean };
  const allir: L[] = [];
  const bua = (b: HLina, fast: boolean): L | null => {
    if (b.p.length !== 4) return null;
    return { b, th: stefna(b.p), rho: 0, t0: 0, t1: 0, t: b.t, tegund: tegundAf(b), fast, burt: false };
  };
  const ekkiTveir: HLina[] = [];
  for (const b of butar) {
    const l = bua(b, false);
    if (l) allir.push(l);
    else ekkiTveir.push(b);
  }
  for (const f of iButa(fastar)) {
    const l = bua(f, true);
    if (l) allir.push(l);
  }
  const nyirFjoldi = allir.filter((l) => !l.fast).length;
  // stefnuhópar (< 1°)
  allir.sort((a, b) => a.th - b.th);
  const hopar: L[][] = [];
  for (const l of allir) {
    const h = hopar[hopar.length - 1];
    if (h && l.th - h[h.length - 1].th < 0.0175) h.push(l);
    else hopar.push([l]);
  }
  // fyrsti og síðasti hópur geta verið sama stefna (0 ≈ π)
  if (hopar.length > 1 && hopar[0][0].th + Math.PI - hopar[hopar.length - 1][hopar[hopar.length - 1].length - 1].th < 0.0175) {
    const sidasti = hopar.pop()!;
    for (const l of sidasti) l.th -= Math.PI;
    hopar[0].unshift(...sidasti);
  }
  const ut: HLina[] = [...ekkiTveir];
  let eftir = 0;
  for (const h of hopar) {
    const th = h.reduce((s0, l) => s0 + l.th, 0) / h.length, c = Math.cos(th), s = Math.sin(th);
    for (const l of h) {
      const p = l.b.p;
      const a = c * p[0] + s * p[1], e = c * p[2] + s * p[3];
      l.t0 = Math.min(a, e);
      l.t1 = Math.max(a, e);
      l.rho = (-s * (p[0] + p[2]) + c * (p[1] + p[3])) / 2;
    }
    // eftir tegund
    const tegundir = new Map<VeggTegund, L[]>();
    for (const l of h) {
      const x = tegundir.get(l.tegund) ?? [];
      x.push(l);
      tegundir.set(l.tegund, x);
    }
    for (const [tegund, listi] of tegundir) {
      listi.sort((a, b) => a.rho - b.rho);
      // raðir: sama lína
      const radir: L[][] = [];
      for (const l of listi) {
        const r = radir[radir.length - 1];
        const sidast = r?.[r.length - 1];
        if (r && sidast && Math.abs(l.rho - sidast.rho) <= Math.min(l.t, sidast.t) / 2 + vikThvert) r.push(l);
        else radir.push([l]);
      }
      for (const rod of radir) {
        // tvítekningar: nýr bútur allur innan annars (fasts eða nýs) sem er a.m.k. jafn þykkur (innan 15 %)
        for (const l of rod) {
          if (l.fast) continue;
          const yfir = rod.some(
            (o) =>
              o !== l &&
              !o.burt &&
              o.t >= l.t * 0.85 &&
              Math.abs(o.rho - l.rho) <= Math.min(o.t, l.t) / 2 + vikThvert &&
              o.t0 <= l.t0 + 1e-6 &&
              o.t1 >= l.t1 - 1e-6 &&
              (o.fast || o.t1 - o.t0 > l.t1 - l.t0 || (o.t1 - o.t0 === l.t1 - l.t0 && rod.indexOf(o) < rod.indexOf(l)))
          );
          if (yfir) l.burt = true;
        }
        const nyir = rod.filter((l) => !l.fast && !l.burt).sort((a, b) => a.t0 - b.t0);
        // samruni nýrra búta af svipaðri þykkt
        type Q = { t0: number; t1: number; tw: number; rw: number; w: number; tMin: number; tMax: number; med: L[] };
        let nu: Q | null = null;
        const loka = () => {
          if (!nu) return;
          eftir++;
          if (nu.med.length === 1) {
            ut.push(nu.med[0].b);
            return;
          }
          const rho = nu.rw / nu.w, t = nu.tw / nu.w;
          const p = [c * nu.t0 - s * rho, s * nu.t0 + c * rho, c * nu.t1 - s * rho, s * nu.t1 + c * rho];
          ut.push(tegund !== "veggur" ? { p, t, tegund } : { p, t });
        };
        for (const l of nyir) {
          const w = Math.max(1e-6, l.t1 - l.t0);
          const svipad = nu && Math.max(nu.tMax, l.t) <= Math.min(nu.tMin, l.t) * 1.8 + 1e-6;
          if (nu && svipad && l.t0 - nu.t1 <= bil) {
            nu.t1 = Math.max(nu.t1, l.t1);
            nu.tw += l.t * w;
            nu.rw += l.rho * w;
            nu.w += w;
            nu.tMin = Math.min(nu.tMin, l.t);
            nu.tMax = Math.max(nu.tMax, l.t);
            nu.med.push(l);
          } else {
            loka();
            nu = { t0: l.t0, t1: l.t1, tw: l.t * w, rw: l.rho * w, w, tMin: l.t, tMax: l.t, med: [l] };
          }
        }
        loka();
      }
    }
  }
  return { butar: ut, horfnir: nyirFjoldi - eftir };
}

// ── 4–5. smella og lengja (veggja-leidretting.ts tengjaVeggi) ──────────────────────────────────────────────

function semLinur(listi: HLina[], forskeyti: string): LineObject[] {
  return listi.map((l, i) => ({
    id: forskeyti + i,
    type: "polyline",
    x: 0,
    y: 0,
    points: l.p.slice(),
    stroke: "#000",
    strokeWidth: l.t,
    dash: "solid",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Veggur",
    veggur: true,
  }));
}

/** Lausir endar nýju línanna mætast (horn, T, samlína) — fastar línur eru skotmörk en hreyfast aldrei. `vik` = mesta
 * lenging/færsla enda, `vikSamlina` = mesta bil sem lokast milli samlínu enda. Skilar línunum og fjölda tenginga. */
export function tengjaEnda(butar: HLina[], fastar: HLina[], vik: number, vikSamlina: number): { butar: HLina[]; fjoldi: number } {
  if (!butar.length) return { butar, fjoldi: 0 };
  const nyir = semLinur(butar, "n");
  const fast = semLinur(fastar, "f");
  const r = tengjaVeggi(nyir, [...nyir, ...fast], { vik, vikSamlina });
  const ut = butar.map((b, i) => {
    const np = r.punktar.get("n" + i);
    return np ? { ...b, p: np } : b;
  });
  return { butar: ut, fjoldi: r.fjoldi };
}

// ── 6. stakir stuttir bútar ────────────────────────────────────────────────────────────────────────────────

/** Er endinn (x, y) tengdur annarri línu (snertir hana innan hálfrar þykktar beggja + `bil`)? */
function endiTengdur(x: number, y: number, t: number, sjalfur: number, allar: HLina[], bil: number): boolean {
  for (let j = 0; j < allar.length; j++) {
    if (j === sjalfur) continue;
    const o = allar[j];
    if (fjarlaegdFraLinu(x, y, o.p) <= (t + o.t) / 2 + bil) return true;
  }
  return false;
}

/** Vísar stuttra búta (< lagmark) sem tengjast engu í hvorugum enda og skera enga aðra línu. `fastar` telja sem tengi. */
export function stakirButar(butar: HLina[], fastar: HLina[], lagmark: number, bil: number): Set<number> {
  const allar = [...butar, ...fastar];
  const ut = new Set<number>();
  butar.forEach((b, i) => {
    if (lengdLinu(b.p) >= lagmark) return;
    const n = b.p.length;
    const a = endiTengdur(b.p[0], b.p[1], b.t, i, allar, bil);
    const e = endiTengdur(b.p[n - 2], b.p[n - 1], b.t, i, allar, bil);
    if (a || e) return;
    // sker hann aðra línu (kross)?
    const A: P = [b.p[0], b.p[1]], B: P = [b.p[n - 2], b.p[n - 1]];
    for (let j = 0; j < allar.length; j++) {
      if (j === i) continue;
      const o = allar[j].p;
      for (let k = 2; k + 1 < o.length; k += 2) if (skerast(A, B, [o[k - 2], o[k - 1]], [o[k], o[k + 1]])) return;
    }
    ut.add(i);
  });
  return ut;
}

// ── heildarhreinsun (1–6) ──────────────────────────────────────────────────────────────────────────────────

export interface HreinsunNidurstada {
  linur: HLina[];
  talning: HreinsunTalning;
  fjarlaegdar: Fjarlaegd[];
}

/** Liðir 1–6 á nýju línunum (`nyjar`); `fastar` (veggir Agnars) eru óbreyttar. `dpm` = einingar línanna á metra. */
export function hreinsaVeggi(nyjar: HLina[], fastar: HLina[], dpm: number, vik: Vikmork = SJALFGEFIN_VIKMORK): HreinsunNidurstada {
  const talning = tomTalning();
  const fjarlaegdar: Fjarlaegd[] = [];
  const m = (x: number) => x * dpm;
  let butar = iButa(nyjar);
  // 1. strik-punkt
  const sp = strikPunktLinur(butar, dpm, vik.strikPunkt);
  if (sp.size) {
    butar.forEach((b, i) => sp.has(i) && fjarlaegdar.push({ p: b.p, astaeda: "strikpunkt" }));
    butar = butar.filter((_, i) => !sp.has(i));
    talning.strikPunkt = sp.size;
  }
  // 2. rétta
  butar = butar.map((b) => {
    const r = retta(b.p, vik.rettaGradur);
    if (!r) return b;
    talning.rettir++;
    return { ...b, p: r };
  });
  // 3. sameina samlínu (og tvítekningar ofan á föstum línum)
  const s = sameinaSamlinur(butar, m(vik.samlinaBilM), m(vik.samlinaThvertM), fastar);
  butar = s.butar;
  talning.sameinadir = s.horfnir;
  // 4. smella (≤ smellaM): horn, T og samlína
  const t1 = tengjaEnda(butar, fastar, m(vik.smellaM), m(vik.smellaM));
  butar = t1.butar;
  talning.smellt = t1.fjoldi;
  // 5. lengja (≤ lengjaM) að næsta vegg
  const t2 = tengjaEnda(butar, fastar, m(vik.lengjaM), m(vik.lengjaM));
  butar = t2.butar;
  talning.lengdir = t2.fjoldi;
  // samlína sem lokaðist í 4–5 rennur saman (endar mætast á miðju)
  const s2 = sameinaSamlinur(butar, m(0.01), m(vik.samlinaThvertM), fastar);
  butar = s2.butar;
  talning.sameinadir += s2.horfnir;
  // 6. stakir stuttir (tvær umferðir: brottfall getur losað næsta)
  for (let umf = 0; umf < 2; umf++) {
    const st = stakirButar(butar, fastar, m(vik.stakurM), m(0.04));
    if (!st.size) break;
    butar.forEach((b, i) => st.has(i) && fjarlaegdar.push({ p: b.p, astaeda: "stakur" }));
    butar = butar.filter((_, i) => !st.has(i));
    talning.stakir += st.size;
  }
  butar = butar.filter((b) => lengdLinu(b.p) > m(0.02));
  return { linur: butar, talning, fjarlaegdar };
}

// ── 7. utan húss ───────────────────────────────────────────────────────────────────────────────────────────

export interface Rammi {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HusUtlina {
  /** Er punkturinn innan útlínu hússins (eða húskassans ef útlínan lokaðist ekki)? */
  inni: (x: number, y: number) => boolean;
  /** Lokaðist útlínan (rými inni ≥ fjórðungur kassans)? Annars er aðeins kassinn notaður. */
  lokud: boolean;
  /** Kassi hússins (aðalhluti). */
  kassi: Rammi | null;
  /** Rúðustærð (einingar) — fyrir prófanir. */
  reitur: number;
}

/** Útlína hússins úr línunum: línurnar teiknaðar þykkar (lokunM / 2 hvoru megin, svo op ≤ lokunM lokist), flætt utan frá
 * og stærsti samfelldi hlutinn sem flóðið náði ekki = húsið (veggir + rými). Stakir hlutir utan þess (lóðarmörk,
 * nágrannahús, norðurör, titilreitur) eru utan húss. Leki útlínan (stórt op án hurðar) er aðeins kassinn notaður. */
export function husUtlina(linur: HLina[], dpm: number, lokunM = SJALFGEFIN_VIKMORK.lokunM): HusUtlina {
  const reitur = Math.max(1e-6, 0.1 * dpm);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of linur)
    for (let i = 0; i + 1 < l.p.length; i += 2) {
      x0 = Math.min(x0, l.p[i]);
      x1 = Math.max(x1, l.p[i]);
      y0 = Math.min(y0, l.p[i + 1]);
      y1 = Math.max(y1, l.p[i + 1]);
    }
  if (!Number.isFinite(x0)) return { inni: () => true, lokud: false, kassi: null, reitur };
  const sp = 3 * dpm;
  x0 -= sp;
  y0 -= sp;
  x1 += sp;
  y1 += sp;
  const W = Math.max(1, Math.ceil((x1 - x0) / reitur)), H = Math.max(1, Math.ceil((y1 - y0) / reitur));
  if (W * H > 12e6) return { inni: () => true, lokud: false, kassi: null, reitur };
  const veggur = new Uint8Array(W * H);
  const R = (lokunM / 2) * dpm;
  for (const l of linur) {
    for (let i = 2; i + 1 < l.p.length; i += 2) {
      const ax = l.p[i - 2], ay = l.p[i - 1], bx = l.p[i], by = l.p[i + 1];
      const h = l.t / 2 + R;
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - h - x0) / reitur)), cx1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + h - x0) / reitur));
      const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - h - y0) / reitur)), cy1 = Math.min(H - 1, Math.ceil((Math.max(ay, by) + h - y0) / reitur));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      for (let cy = cy0; cy <= cy1; cy++) {
        const py = y0 + (cy + 0.5) * reitur;
        for (let cx = cx0; cx <= cx1; cx++) {
          const px = x0 + (cx + 0.5) * reitur;
          const u = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
          if (Math.hypot(px - (ax + u * dx), py - (ay + u * dy)) <= h) veggur[cy * W + cx] = 1;
        }
      }
    }
  }
  // flóð utan frá (4-tengt)
  const uti = new Uint8Array(W * H);
  const stafli = new Int32Array(W * H);
  let top = 0;
  const yta = (q: number) => {
    if (!uti[q] && !veggur[q]) {
      uti[q] = 1;
      stafli[top++] = q;
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
    const q = stafli[--top], qx = q % W;
    if (qx > 0) yta(q - 1);
    if (qx < W - 1) yta(q + 1);
    if (q >= W) yta(q - W);
    if (q < W * (H - 1)) yta(q + W);
  }
  // samfelldir hlutar hússins (allt sem flóðið náði ekki)
  const merki = new Int32Array(W * H);
  let n = 0, best = 0, bestFlat = 0;
  const kassar: Rammi[] = [];
  const flatar: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (uti[i] || merki[i]) continue;
    n++;
    let flat = 0, kx0 = W, ky0 = H, kx1 = 0, ky1 = 0;
    stafli[(top = 0)] = i;
    top = 1;
    merki[i] = n;
    while (top) {
      const q = stafli[--top], qx = q % W, qy = (q - qx) / W;
      flat++;
      if (qx < kx0) kx0 = qx;
      if (qx > kx1) kx1 = qx;
      if (qy < ky0) ky0 = qy;
      if (qy > ky1) ky1 = qy;
      const nb = [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, q >= W ? q - W : -1, q < W * (H - 1) ? q + W : -1];
      for (const r of nb) {
        if (r < 0 || uti[r] || merki[r]) continue;
        merki[r] = n;
        stafli[top++] = r;
      }
    }
    kassar[n] = { x0: kx0, y0: ky0, x1: kx1, y1: ky1 };
    flatar[n] = flat;
    if (flat > bestFlat) {
      bestFlat = flat;
      best = n;
    }
  }
  if (!best) return { inni: () => true, lokud: false, kassi: null, reitur };
  const k = kassar[best];
  let rymi = 0;
  for (let i = 0; i < W * H; i++) if (merki[i] === best && !veggur[i]) rymi++;
  const kassiFlat = (k.x1 - k.x0 + 1) * (k.y1 - k.y0 + 1);
  const lokud = rymi >= kassiFlat * 0.25;
  const kassi: Rammi = { x0: x0 + k.x0 * reitur, y0: y0 + k.y0 * reitur, x1: x0 + (k.x1 + 1) * reitur, y1: y0 + (k.y1 + 1) * reitur };
  const inni = (x: number, y: number) => {
    const cx = Math.floor((x - x0) / reitur), cy = Math.floor((y - y0) / reitur);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return false;
    if (lokud) return merki[cy * W + cx] === best;
    return x >= kassi.x0 - dpm && x <= kassi.x1 + dpm && y >= kassi.y0 - dpm && y <= kassi.y1 + dpm;
  };
  return { inni, lokud, kassi, reitur };
}

/** Vísar línanna (`nyjar`) sem standa utan húss: minna en helmingur sýna á miðlínunni er innan útlínunnar. */
export function utanHuss(nyjar: HLina[], hus: HusUtlina): Set<number> {
  const ut = new Set<number>();
  nyjar.forEach((l, i) => {
    let alls = 0, inni = 0;
    for (let k = 2; k + 1 < l.p.length; k += 2) {
      const ax = l.p[k - 2], ay = l.p[k - 1], bx = l.p[k], by = l.p[k + 1];
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        alls++;
        if (hus.inni(ax + (bx - ax) * f, ay + (by - ay) * f)) inni++;
      }
    }
    if (alls && inni * 2 < alls) ut.add(i);
  });
  return ut;
}

// ── húsið á blaðinu (skurður) ──────────────────────────────────────────────────────────────────────────────

/** Kassi hússins á blaðinu úr veggjunum: klasar veggjanetsins (veggir sem snertast innan `tengiM`), vegnir með lengd ×
 * þykkt (hús er úr þykkum veggjum, titilreitur og málsetning úr línum); stærsti klasinn + álmur (≥ 20 % af honum, innan
 * `almaM` frá því sem er með). Skilar kassanum með `spassia` (hlutfall lengri hliðar) hvoru megin, eða null. */
export function husKassi(linur: HLina[], dpm: number, st: { tengiM?: number; almaM?: number; spassia?: number } = {}): (Rammi & { veggir: number; klasar: number }) | null {
  const butar = iButa(linur).filter((b) => tegundAf(b) !== "hurd");
  const n = butar.length;
  if (n < 4) return null;
  const tengi = (st.tengiM ?? 1) * dpm, alma = (st.almaM ?? 4) * dpm;
  const rot = Array.from({ length: n }, (_, i) => i);
  const finna = (i: number): number => {
    while (rot[i] !== i) {
      rot[i] = rot[rot[i]];
      i = rot[i];
    }
    return i;
  };
  const kassi = butar.map((b) => [Math.min(b.p[0], b.p[2]), Math.min(b.p[1], b.p[3]), Math.max(b.p[0], b.p[2]), Math.max(b.p[1], b.p[3])]);
  const rod = butar.map((_, i) => i).sort((a, b) => kassi[a][0] - kassi[b][0]);
  for (let ii = 0; ii < n; ii++) {
    const i = rod[ii];
    for (let jj = ii + 1; jj < n; jj++) {
      const j = rod[jj];
      const bil = tengi + (butar[i].t + butar[j].t) / 2;
      if (kassi[j][0] - bil > kassi[i][2]) break;
      if (kassi[i][1] - bil > kassi[j][3] || kassi[j][1] - bil > kassi[i][3]) continue;
      const a = butar[i].p, b = butar[j].p;
      const d = skerast([a[0], a[1]], [a[2], a[3]], [b[0], b[1]], [b[2], b[3]])
        ? 0
        : Math.min(fjarlaegdFraLinu(a[0], a[1], b), fjarlaegdFraLinu(a[2], a[3], b), fjarlaegdFraLinu(b[0], b[1], a), fjarlaegdFraLinu(b[2], b[3], a));
      if (d <= bil) rot[finna(i)] = finna(j);
    }
  }
  const K = new Map<number, { flat: number; x0: number; y0: number; x1: number; y1: number; med: boolean }>();
  butar.forEach((b, i) => {
    const r = finna(i);
    const q = K.get(r) ?? { flat: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, med: false };
    q.flat += lengdLinu(b.p) * Math.max(b.t, 0.05 * dpm);
    q.x0 = Math.min(q.x0, kassi[i][0]);
    q.y0 = Math.min(q.y0, kassi[i][1]);
    q.x1 = Math.max(q.x1, kassi[i][2]);
    q.y1 = Math.max(q.y1, kassi[i][3]);
    K.set(r, q);
  });
  let adal: { flat: number; x0: number; y0: number; x1: number; y1: number; med: boolean } | null = null;
  for (const q of K.values()) if (!adal || q.flat > adal.flat) adal = q;
  if (!adal) return null;
  adal.med = true;
  const bilK = (a: Rammi, b: Rammi) => Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
  for (let breytt = true; breytt; ) {
    breytt = false;
    for (const q of K.values()) {
      if (q.med || q.flat < adal.flat * 0.2) continue;
      for (const o of K.values()) {
        if (o.med && bilK(o, q) <= alma) {
          q.med = true;
          breytt = true;
          break;
        }
      }
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of K.values()) {
    if (!q.med) continue;
    x0 = Math.min(x0, q.x0);
    y0 = Math.min(y0, q.y0);
    x1 = Math.max(x1, q.x1);
    y1 = Math.max(y1, q.y1);
  }
  const sp = Math.max(x1 - x0, y1 - y0) * (st.spassia ?? 0.025);
  return { x0: x0 - sp, y0: y0 - sp, x1: x1 + sp, y1: y1 + sp, veggir: n, klasar: K.size };
}
