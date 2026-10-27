// Hrein útreikningseining fyrir 3D-stiga í Hus3D.
// Býr til:
// - Tannskorna steypta burðarplötu (hallandi stigakjarna + þrepakubba með 42 mm þrepanefi) í hlýjum steingráum/hvítum tónum
// - Skarpar dökkar frambrúnir á hverju þrepi svo þrepin lesist bæði beint ofan frá og í sniðsýn
// - Hliðarvanga, extra-skýrt glerhandrið (gler) og dökkt handrið með póstum/festingum við miðopið
// - Sjálfvirka pörun tveggja samsíða stigabúta í tvöfaldan U-stiga með fljótandi stigapalli í hálfri hæð (Type E).

import type { Veggbutur } from "./hus3d";

export interface Kassi3D {
  /** Miðja í 2D-grunnmynd (x, z í Three.js) og hæðarmiðja y. */
  x: number;
  y: number;
  z: number;
  /** Stefnuhorn í radíönum (snúningur um Y-ás í Three.js: -atan2(dz, dx)). */
  horn: number;
  /** Hallahorn í radíönum (snúningur um staðbundinn Z-ás fyrir hallandi stigaplötu, glerhandrið og handrið). */
  halli?: number;
  /** Stærð kassans: lengd (eftir stefnu stigans), hæð (y), breidd (þvert á stiga). */
  lengd: number;
  haed: number;
  breidd: number;
  /** Hex-litur (fyrir þrep sem lýsast eftir hæð). */
  litur: number;
}

export interface Stigar3D {
  threp: Kassi3D[];
  brir: Kassi3D[];
  vangar: Kassi3D[];
  gler: Kassi3D[];
}

const THREPA_DJUP_M = 0.258;
const NEF_UTSKOT_M = 0.042;
const VANGI_BREIDD_M = 0.065;
const BRUN_DJUP_M = 0.045;
const LITUR_NEDST = [0xe0, 0xdc, 0xd2] as const;
const LITUR_EFST = [0xf7, 0xf5, 0xef] as const;
export const STIGA_BRUN_LITUR_3D = 0x4f4a42;
export const STIGA_VANGI_LITUR_3D = 0xcfc9be;
export const STIGA_GLER_LITUR_3D = 0xb8dce8;

function blandaLit(hlutfall: number): number {
  const t = Math.max(0, Math.min(1, hlutfall));
  const r = Math.round(LITUR_NEDST[0] + (LITUR_EFST[0] - LITUR_NEDST[0]) * t);
  const g = Math.round(LITUR_NEDST[1] + (LITUR_EFST[1] - LITUR_NEDST[1]) * t);
  const b = Math.round(LITUR_NEDST[2] + (LITUR_EFST[2] - LITUR_NEDST[2]) * t);
  return (r << 16) | (g << 8) | b;
}

/** Finnur breidd og hliðarhliðrun staks stiga út frá þykkt línunnar eða nærliggjandi samsíða stigahúsveggjum. */
export function stigaRummal(
  stigi: Veggbutur,
  veggir: readonly Veggbutur[],
  metri: number
): { breidd: number; hlidrun: number } {
  const dx = stigi.bx - stigi.ax;
  const dy = stigi.by - stigi.ay;
  const lengd = Math.hypot(dx, dy);
  if (lengd < 1e-3 || metri <= 0) return { breidd: Math.max(1, metri * 1.05), hlidrun: 0 };

  if (stigi.thykkt >= metri * 0.55) {
    return { breidd: Math.min(metri * 2.4, stigi.thykkt), hlidrun: 0 };
  }

  const ux = dx / lengd;
  const uy = dy / lengd;
  const nx = -uy;
  const ny = ux;

  let vinstri: number | null = null;
  let haegri: number | null = null;
  const minSkorun = lengd * 0.35;
  const minBil = metri * 0.3;
  const maxBil = metri * 1.45;

  for (const v of veggir) {
    if (v.tegund !== "veggur") continue;
    const vx = v.bx - v.ax;
    const vy = v.by - v.ay;
    const vl = Math.hypot(vx, vy);
    if (vl < minSkorun) continue;
    const dot = Math.abs((vx * ux + vy * uy) / vl);
    if (dot < 0.94) continue;

    const sA = (v.ax - stigi.ax) * ux + (v.ay - stigi.ay) * uy;
    const sB = (v.bx - stigi.ax) * ux + (v.by - stigi.ay) * uy;
    const s0 = Math.max(0, Math.min(sA, sB));
    const s1 = Math.min(lengd, Math.max(sA, sB));
    if (s1 - s0 < minSkorun) continue;

    const midX = (v.ax + v.bx) / 2 - stigi.ax;
    const midY = (v.ay + v.by) / 2 - stigi.ay;
    const dMid = midX * nx + midY * ny;
    const veggTh = Math.min(metri * 0.2, Math.max(metri * 0.12, v.thykkt || metri * 0.15));
    const dInnri = Math.abs(dMid) - veggTh / 2;
    if (dInnri < minBil || dInnri > maxBil) continue;

    if (dMid > 0) {
      if (vinstri === null || dInnri < vinstri) vinstri = dInnri;
    } else {
      if (haegri === null || dInnri < haegri) haegri = dInnri;
    }
  }

  if (vinstri !== null && haegri !== null) {
    const heild = vinstri + haegri;
    if (heild >= metri * 0.75 && heild <= metri * 1.85) {
      return { breidd: heild, hlidrun: (vinstri - haegri) / 2 };
    }
  }

  const sjalfgefin = Math.min(metri * 1.15, Math.max(metri * 0.9, lengd * 0.36));
  return { breidd: sjalfgefin, hlidrun: 0 };
}

/** Kanna hvort þverveggur sé rétt fyrir framan enda stigans (til að ákvarða dýpt stigapalls). */
function finnaPallBreidd(
  endiX: number,
  endiY: number,
  ux: number,
  uy: number,
  minN: number,
  maxN: number,
  veggir: readonly Veggbutur[],
  metri: number
): number | null {
  const nx = -uy;
  const ny = ux;
  let naest: number | null = null;
  const minD = metri * 0.55;
  const maxD = metri * 1.55;

  for (const v of veggir) {
    if (v.tegund !== "veggur") continue;
    const vx = v.bx - v.ax;
    const vy = v.by - v.ay;
    const vl = Math.hypot(vx, vy);
    if (vl < metri * 0.5) continue;
    const dotN = Math.abs((vx * nx + vy * ny) / vl);
    if (dotN < 0.92) continue;

    const midX = (v.ax + v.bx) / 2 - endiX;
    const midY = (v.ay + v.by) / 2 - endiY;
    const dFram = midX * ux + midY * uy;
    const veggTh = Math.min(metri * 0.2, Math.max(metri * 0.12, v.thykkt || metri * 0.15));
    const dInnri = dFram - veggTh / 2;
    if (dInnri < minD || dInnri > maxD) continue;

    const nA = (v.ax - endiX) * nx + (v.ay - endiY) * ny;
    const nB = (v.bx - endiX) * nx + (v.by - endiY) * ny;
    const n0 = Math.max(minN, Math.min(nA, nB));
    const n1 = Math.min(maxN, Math.max(nA, nB));
    if (n1 - n0 < (maxN - minN) * 0.35) continue;

    if (naest === null || dInnri < naest) naest = dInnri;
  }
  return naest;
}

/** Bætir við einum hallandi stigalegg (tannskornum þrepum á hallandi stigaplötu, 42 mm þrepanefi, glerhandriði og handriði). */
function baetaVidStigalegg(
  ut: Stigar3D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  breidd: number,
  yBotn: number,
  yTopp: number,
  veggH: number,
  metri: number,
  handridHlid: -1 | 1 | 0
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const lengd = Math.hypot(dx, dy);
  const dh = yTopp - yBotn;
  if (lengd < metri * 0.35 || dh <= 0) return;

  const ux = dx / lengd;
  const uy = dy / lengd;
  const nx = -uy;
  const ny = ux;
  const horn = -Math.atan2(dy, dx);
  const halli = Math.atan2(dh, lengd);
  const skaLengd = Math.hypot(lengd, dh);

  const vangaB = Math.max(metri * VANGI_BREIDD_M, veggH * 0.018);
  const brunDjup = Math.max(metri * BRUN_DJUP_M, veggH * 0.014);
  const brunHaed = Math.max(metri * 0.022, veggH * 0.008);
  const kjarniTh = Math.max(metri * 0.163, veggH * 0.054);
  const nefUtskot = Math.max(metri * NEF_UTSKOT_M, veggH * 0.014);
  const nefThykkt = Math.max(metri * 0.038, veggH * 0.013);

  const fjoldi = Math.max(6, Math.min(14, Math.round(lengd / (THREPA_DJUP_M * metri))));
  const threpLengd = lengd / fjoldi;
  const stepH = dh / fjoldi;
  const innriBreidd = Math.max(metri * 0.38, breidd - vangaB * 0.6);

  // 1. Hallandi steypt burðarplata (waist slab, 163 mm) undir tannskornum þrepunum — opið rými undir stiganum.
  const kjarniMidY = (yBotn + yTopp) / 2 - stepH * 0.42;
  ut.vangar.push({
    x: (ax + bx) / 2,
    y: Math.max(kjarniTh * 0.42, kjarniMidY),
    z: (ay + by) / 2,
    horn,
    halli,
    lengd: skaLengd * 0.99,
    haed: kjarniTh,
    breidd: breidd * 0.99,
    litur: STIGA_VANGI_LITUR_3D,
  });

  // 2. Hallandi hliðarvangar (stringers) sitthvorumegin við stigalegginn.
  for (const hlid of [-1, 1] as const) {
    const hlidD = hlid * (breidd / 2 - vangaB / 2);
    ut.vangar.push({
      x: (ax + bx) / 2 + nx * hlidD,
      y: Math.max(kjarniTh * 0.48, (yBotn + yTopp) / 2 - stepH * 0.18),
      z: (ay + by) / 2 + ny * hlidD,
      horn,
      halli,
      lengd: skaLengd,
      haed: kjarniTh * 1.08,
      breidd: vangaB,
      litur: STIGA_VANGI_LITUR_3D,
    });
  }

  // 3. Tannskorin þrep (sawtooth concrete steps) + 42 mm útskots-þrepanef + skörp dökk frambrún á hverju þrepi.
  for (let i = 0; i < fjoldi; i++) {
    const toppY = yBotn + (i + 1) * stepH;
    const botnY = Math.max(0, yBotn + i * stepH - kjarniTh * 0.55);
    const h = Math.max(brunHaed * 2, toppY - botnY);
    const midS = (i + 0.5) * threpLengd;
    const cx = ax + ux * midS;
    const cz = ay + uy * midS;
    const litHlutfall = Math.max(0, Math.min(1, (toppY - stepH * 0.5) / veggH));
    const threpLitur = blandaLit(litHlutfall);

    // Tannskorinn þrepakubbur sem tengist niður í hallandi burðarplötuna
    ut.threp.push({
      x: cx,
      y: botnY + h / 2,
      z: cz,
      horn,
      lengd: threpLengd * 1.02,
      haed: h,
      breidd: breidd * 0.985,
      litur: threpLitur,
    });

    // 42 mm þrepanef (overhanging tread nosing slab) efst á þrepinu eins og á verkfræðiteikningunni (258 + 42 = 300 mm)
    const nefLengd = threpLengd + nefUtskot;
    const nefMidS = (i + 0.5) * threpLengd - nefUtskot * 0.45;
    ut.threp.push({
      x: ax + ux * nefMidS,
      y: toppY - nefThykkt * 0.45,
      z: ay + uy * nefMidS,
      horn,
      lengd: nefLengd,
      haed: nefThykkt,
      breidd: innriBreidd,
      litur: blandaLit(Math.min(1, litHlutfall + 0.08)),
    });

    // Skörp dökk frambrún (nosing contrast line) fremst á hverju þrepi svo þrepin teljist skýrt ofan frá
    const bDjup = Math.min(brunDjup, threpLengd * 0.22);
    const brunS = i * threpLengd - nefUtskot * 0.35 + bDjup / 2;
    ut.brir.push({
      x: ax + ux * brunS,
      y: toppY - brunHaed * 0.35,
      z: ay + uy * brunS,
      horn,
      lengd: bDjup,
      haed: brunHaed * 1.15,
      breidd: breidd * 0.985,
      litur: STIGA_BRUN_LITUR_3D,
    });
  }

  // 4. Extra-skýrt glerhandrið (glass balustrade) + dökkt handrið og póstar á innri brún stigans.
  const hlidar = handridHlid === 0 ? ([-1, 1] as const) : ([handridHlid] as const);
  const handridHaed = veggH * 0.3;
  const handridTh = Math.max(metri * 0.042, veggH * 0.014);
  const glerTh = Math.max(metri * 0.022, veggH * 0.007);
  for (const hlid of hlidar) {
    const hlidD = hlid * (breidd / 2 - vangaB * 0.45);
    // Hallandi glerplata (extra-clear glass balustrade)
    ut.gler.push({
      x: (ax + bx) / 2 + nx * hlidD,
      y: (yBotn + yTopp) / 2 + handridHaed * 0.52,
      z: (ay + by) / 2 + ny * hlidD,
      horn,
      halli,
      lengd: skaLengd * 0.98,
      haed: handridHaed * 0.88,
      breidd: glerTh,
      litur: STIGA_GLER_LITUR_3D,
    });
    // Hallandi dökkt handrið ofan á glerinu
    ut.brir.push({
      x: (ax + bx) / 2 + nx * hlidD,
      y: (yBotn + yTopp) / 2 + handridHaed,
      z: (ay + by) / 2 + ny * hlidD,
      horn,
      halli,
      lengd: skaLengd * 1.01,
      haed: handridTh,
      breidd: handridTh * 1.1,
      litur: STIGA_BRUN_LITUR_3D,
    });
    // Lóðréttir stálpóstar / festingar (4 póstar eftir endilöngum leggnum)
    for (const tPost of [0.05, 0.35, 0.65, 0.95]) {
      const pS = tPost * lengd;
      const grunnY = yBotn + tPost * dh;
      ut.brir.push({
        x: ax + ux * pS + nx * hlidD,
        y: grunnY + handridHaed * 0.48,
        z: ay + uy * pS + ny * hlidD,
        horn,
        lengd: handridTh * 0.75,
        haed: handridHaed * 0.96,
        breidd: handridTh * 0.75,
        litur: STIGA_BRUN_LITUR_3D,
      });
    }
  }
}

/**
 * Reiknar þrívíddarstiga fyrir hæðina.
 * - Ef tveir samsíða stigabútar liggja hlið við hlið í stigahúsi eru þeir tengdir í tvöfaldan U-stiga (Type E)
 *   með neðri legg (0 → 50% hæðar), flötum millipalli (stigapalli í hálfri hæð með opnu rými undir),
 *   180° beygju, efri legg (50% → 100% hæðar), efri komupalli, glerhandriði og handriðum.
 * - Stakur stigabútur myndar beinan stigalegg frá gólfi upp í fulla hæð.
 */
export function stigar3D(
  stigar: readonly Veggbutur[],
  veggir: readonly Veggbutur[],
  veggH: number,
  metri: number
): Stigar3D {
  const ut: Stigar3D = { threp: [], brir: [], vangar: [], gler: [] };
  if (!stigar.length || veggH <= 0 || metri <= 0) return ut;

  const notadir = new Set<number>();

  // 1. Pörum samsíða stigalínur í sama stigahúsi í tvöfaldan U-stiga með stigapalli (Type E).
  for (let i = 0; i < stigar.length; i++) {
    if (notadir.has(i)) continue;
    const a = stigar[i];
    const dxa = a.bx - a.ax;
    const dya = a.by - a.ay;
    const la = Math.hypot(dxa, dya);
    if (la < metri * 0.35) continue;
    const uxa = dxa / la;
    const uya = dya / la;
    const nxa = -uya;
    const nya = uxa;

    let bestJ = -1;
    let bestThver = Infinity;

    for (let j = i + 1; j < stigar.length; j++) {
      if (notadir.has(j)) continue;
      const b = stigar[j];
      const dxb = b.bx - b.ax;
      const dyb = b.by - b.ay;
      const lb = Math.hypot(dxb, dyb);
      if (lb < metri * 0.35) continue;

      const dot = (dxa * dxb + dya * dyb) / (la * lb);
      if (Math.abs(dot) < 0.9) continue;

      const sA = (b.ax - a.ax) * uxa + (b.ay - a.ay) * uya;
      const sB = (b.bx - a.ax) * uxa + (b.by - a.ay) * uya;
      const s0 = Math.max(0, Math.min(sA, sB));
      const s1 = Math.min(la, Math.max(sA, sB));
      if (s1 - s0 < Math.min(la, lb) * 0.55) continue;

      const midBx = (b.ax + b.bx) / 2 - a.ax;
      const midBy = (b.ay + b.by) / 2 - a.ay;
      const dThver = Math.abs(midBx * nxa + midBy * nya);
      if (dThver < metri * 0.55 || dThver > metri * 2.5) continue;

      if (dThver < bestThver) {
        bestThver = dThver;
        bestJ = j;
      }
    }

    if (bestJ !== -1) {
      notadir.add(i);
      notadir.add(bestJ);
      const b = stigar[bestJ];

      const sBa = (b.ax - a.ax) * uxa + (b.ay - a.ay) * uya;
      const sBb = (b.bx - a.ax) * uxa + (b.by - a.ay) * uya;
      const sStart = Math.min(0, Math.min(sBa, sBb));
      const sTurn = Math.max(la, Math.max(sBa, sBb));

      const midBx = (b.ax + b.bx) / 2 - a.ax;
      const midBy = (b.ay + b.by) / 2 - a.ay;
      const dFlug = midBx * nxa + midBy * nya;
      const stefnaEfri: -1 | 1 = dFlug >= 0 ? 1 : -1;
      const bilMidja = Math.abs(dFlug);

      const midOp = Math.min(metri * 0.24, Math.max(metri * 0.14, bilMidja * 0.16));
      const flugBreidd =
        a.thykkt >= metri * 0.55
          ? Math.min(bilMidja - midOp * 0.6, a.thykkt)
          : Math.min(metri * 1.15, Math.max(metri * 0.68, bilMidja - midOp));
      const heildarBreidd = bilMidja + flugBreidd;
      const midN = dFlug / 2;

      const horn = -Math.atan2(dya, dxa);
      const pallY = veggH * 0.5;
      const pallThykkt = Math.max(metri * 0.177, veggH * 0.058);
      const efriPallThykkt = Math.max(metri * 0.24, veggH * 0.078);
      const brunDjup = Math.max(metri * BRUN_DJUP_M, veggH * 0.014);
      const brunHaed = Math.max(metri * 0.022, veggH * 0.008);

      // Neðri leggur (0 → 0.5 * veggH): frá sStart til sTurn á línu a
      const nedriAx = a.ax + uxa * sStart;
      const nedriAy = a.ay + uya * sStart;
      const nedriBx = a.ax + uxa * sTurn;
      const nedriBy = a.ay + uya * sTurn;
      baetaVidStigalegg(ut, nedriAx, nedriAy, nedriBx, nedriBy, flugBreidd, 0, pallY, veggH, metri, stefnaEfri);

      // Efri leggur (0.5 * veggH → 1.0 * veggH): frá sTurn til sStart á línu b
      const efriAx = a.ax + uxa * sTurn + nxa * dFlug;
      const efriAy = a.ay + uya * sTurn + nya * dFlug;
      const efriBx = a.ax + uxa * sStart + nxa * dFlug;
      const efriBy = a.ay + uya * sStart + nya * dFlug;
      baetaVidStigalegg(ut, efriAx, efriAy, efriBx, efriBy, flugBreidd, pallY, veggH, veggH, metri, stefnaEfri);

      // Millipallur (stigapallur í hálfri hæð, 177 mm þykk steypt plata, opið rými undir)
      const minN = Math.min(-flugBreidd / 2, dFlug - flugBreidd / 2);
      const maxN = Math.max(flugBreidd / 2, dFlug + flugBreidd / 2);
      const veggPallDjup = finnaPallBreidd(nedriBx, nedriBy, uxa, uya, minN, maxN, veggir, metri);
      const pallDjup = veggPallDjup ?? Math.max(flugBreidd * 1.05, metri * 0.925);
      const pallMidS = sTurn + pallDjup / 2;
      const pallCx = a.ax + uxa * pallMidS + nxa * midN;
      const pallCz = a.ay + uya * pallMidS + nya * midN;

      // Efri flötur stigapalls
      ut.threp.push({
        x: pallCx,
        y: pallY - pallThykkt * 0.25,
        z: pallCz,
        horn,
        lengd: pallDjup,
        haed: pallThykkt * 0.5,
        breidd: heildarBreidd,
        litur: blandaLit(0.54),
      });
      // Steypt burðarplata undir stigapalli (fljótandi plata í hálfri hæð, opið rými fyrir neðan)
      ut.vangar.push({
        x: pallCx,
        y: pallY - pallThykkt * 0.65,
        z: pallCz,
        horn,
        lengd: pallDjup * 1.005,
        haed: pallThykkt * 0.7,
        breidd: heildarBreidd * 1.005,
        litur: STIGA_VANGI_LITUR_3D,
      });
      // Dökk frambrún á stigapalli þar sem gengið er upp á pallinn og út af honum
      ut.brir.push({
        x: a.ax + uxa * (sTurn + brunDjup * 0.45) + nxa * midN,
        y: pallY - brunHaed * 0.2,
        z: a.ay + uya * (sTurn + brunDjup * 0.45) + nya * midN,
        horn,
        lengd: brunDjup * 0.9,
        haed: brunHaed * 1.15,
        breidd: heildarBreidd,
        litur: STIGA_BRUN_LITUR_3D,
      });
      // Dökk afturbrún á stigapalli svo hann lesist skýrt ofan frá
      ut.brir.push({
        x: a.ax + uxa * (sTurn + pallDjup - brunDjup * 0.35) + nxa * midN,
        y: pallY - brunHaed * 0.2,
        z: a.ay + uya * (sTurn + pallDjup - brunDjup * 0.35) + nya * midN,
        horn,
        lengd: brunDjup * 0.7,
        haed: brunHaed,
        breidd: heildarBreidd,
        litur: STIGA_BRUN_LITUR_3D,
      });

      // Efri komupallur (240 mm steypt loftplata við enda efri leggs, í fullri hæð veggH)
      const komuDjup = Math.max(metri * 0.42, flugBreidd * 0.48);
      const komuS = sStart - komuDjup / 2;
      const komuCx = a.ax + uxa * komuS + nxa * dFlug;
      const komuCz = a.ay + uya * komuS + nya * dFlug;
      ut.threp.push({
        x: komuCx,
        y: veggH - efriPallThykkt * 0.24,
        z: komuCz,
        horn,
        lengd: komuDjup,
        haed: efriPallThykkt * 0.48,
        breidd: flugBreidd,
        litur: blandaLit(1),
      });
      ut.vangar.push({
        x: komuCx,
        y: veggH - efriPallThykkt * 0.64,
        z: komuCz,
        horn,
        lengd: komuDjup * 1.005,
        haed: efriPallThykkt * 0.72,
        breidd: flugBreidd * 1.005,
        litur: STIGA_VANGI_LITUR_3D,
      });
      ut.brir.push({
        x: efriBx - uxa * (brunDjup * 0.45),
        y: veggH - brunHaed * 0.2,
        z: efriBy - uya * (brunDjup * 0.45),
        horn,
        lengd: brunDjup * 0.9,
        haed: brunHaed * 1.15,
        breidd: flugBreidd,
        litur: STIGA_BRUN_LITUR_3D,
      });
      continue;
    }

    // 2. Stakur stigabútur: beinn stigi frá 0 upp í veggH.
    notadir.add(i);
    const { breidd, hlidrun } = stigaRummal(a, veggir, metri);
    const rotAx = a.ax + nxa * hlidrun;
    const rotAy = a.ay + nya * hlidrun;
    const rotBx = a.bx + nxa * hlidrun;
    const rotBy = a.by + nya * hlidrun;
    baetaVidStigalegg(ut, rotAx, rotAy, rotBx, rotBy, breidd, 0, veggH, veggH, metri, 0);
  }

  return ut;
}
