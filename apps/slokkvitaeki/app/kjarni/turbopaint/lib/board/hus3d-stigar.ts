// Hrein útreikningseining fyrir 3D-stiga í Hus3D.
// Býr til þrep (með hæðarlitbrigði frá gólfi upp á efri hæð), dökkar þrepabrúnir (svo hvert þrep sjáist
// skýrt beint ofan frá í yfirliti) og hliðarvanga. Ef stigalínan liggur milli tveggja samsíða stigahúsveggja
// miðjast stiginn sjálfkrafa á milli þeirra og fyllir breidd stigahússins.

import type { Veggbutur } from "./hus3d";

export interface Kassi3D {
  /** Miðja í 2D-grunnmynd (x, z í Three.js) og hæðarmiðja y. */
  x: number;
  y: number;
  z: number;
  /** Stefnuhorn í radíönum (snúningur um Y-ás í Three.js: -atan2(dz, dx)). */
  horn: number;
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
}

const THREPA_DJUP_M = 0.28;
const VANGI_BREIDD_M = 0.055;
const BRUN_DJUP_M = 0.036;
const LITUR_NEDST = [0xd5, 0xd0, 0xc5] as const;
const LITUR_EFST = [0xf2, 0xee, 0xe6] as const;
export const STIGA_BRUN_LITUR_3D = 0x5c574f;
export const STIGA_VANGI_LITUR_3D = 0x8a8378;

function blandaLit(hlutfall: number): number {
  const t = Math.max(0, Math.min(1, hlutfall));
  const r = Math.round(LITUR_NEDST[0] + (LITUR_EFST[0] - LITUR_NEDST[0]) * t);
  const g = Math.round(LITUR_NEDST[1] + (LITUR_EFST[1] - LITUR_NEDST[1]) * t);
  const b = Math.round(LITUR_NEDST[2] + (LITUR_EFST[2] - LITUR_NEDST[2]) * t);
  return (r << 16) | (g << 8) | b;
}

/** Finnur breidd og hliðarhliðrun stiga út frá þykkt línunnar eða nærliggjandi samsíða stigahúsveggjum. */
export function stigaRummal(
  stigi: Veggbutur,
  veggir: readonly Veggbutur[],
  metri: number
): { breidd: number; hlidrun: number } {
  const dx = stigi.bx - stigi.ax;
  const dy = stigi.by - stigi.ay;
  const lengd = Math.hypot(dx, dy);
  if (lengd < 1e-3 || metri <= 0) return { breidd: Math.max(1, metri * 1.1), hlidrun: 0 };

  // Ef notandi hefur þegar stillt breiða línu (≥ 55 cm) ræður hún breiddinni beint.
  if (stigi.thykkt >= metri * 0.55) {
    return { breidd: Math.min(metri * 2.8, stigi.thykkt), hlidrun: 0 };
  }

  const ux = dx / lengd;
  const uy = dy / lengd;
  const nx = -uy;
  const ny = ux;

  // Leitum að samsíða veggjum sitthvorumegin við stigalínuna (innan 0,30 m .. 1,55 m) sem skarast við stigann.
  let vinstri: number | null = null;
  let haegri: number | null = null;
  const minSkorun = lengd * 0.35;
  const minBil = metri * 0.3;
  const maxBil = metri * 1.55;

  for (const v of veggir) {
    if (v.tegund !== "veggur") continue;
    const vx = v.bx - v.ax;
    const vy = v.by - v.ay;
    const vl = Math.hypot(vx, vy);
    if (vl < minSkorun) continue;
    const dot = Math.abs((vx * ux + vy * uy) / vl);
    if (dot < 0.94) continue;

    // Ofanvarp endapunkta veggsins á ás stigans
    const sA = (v.ax - stigi.ax) * ux + (v.ay - stigi.ay) * uy;
    const sB = (v.bx - stigi.ax) * ux + (v.by - stigi.ay) * uy;
    const s0 = Math.max(0, Math.min(sA, sB));
    const s1 = Math.min(lengd, Math.max(sA, sB));
    if (s1 - s0 < minSkorun) continue;

    // Þverfjarlægð frá miðlínu stigans að innri brún veggsins
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
    if (heild >= metri * 0.75 && heild <= metri * 2.6) {
      return { breidd: heild, hlidrun: (vinstri - haegri) / 2 };
    }
  }

  const sjalfgefin = Math.min(metri * 1.35, Math.max(metri * 0.95, lengd * 0.34));
  return { breidd: sjalfgefin, hlidrun: 0 };
}

/** Reiknar þrep, þrepabrúnir og hliðarvanga fyrir alla stiga á hæðinni. */
export function stigar3D(
  stigar: readonly Veggbutur[],
  veggir: readonly Veggbutur[],
  veggH: number,
  metri: number
): Stigar3D {
  const threp: Kassi3D[] = [];
  const brir: Kassi3D[] = [];
  const vangar: Kassi3D[] = [];
  if (!stigar.length || veggH <= 0 || metri <= 0) return { threp, brir, vangar };

  const vangaB = Math.max(metri * VANGI_BREIDD_M, veggH * 0.016);
  const brunDjup = Math.max(metri * BRUN_DJUP_M, veggH * 0.012);
  const brunHaed = Math.max(metri * 0.022, veggH * 0.008);

  for (const s of stigar) {
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const lengd = Math.hypot(dx, dy);
    if (lengd < metri * 0.35) continue;

    const ux = dx / lengd;
    const uy = dy / lengd;
    const nx = -uy;
    const ny = ux;
    const horn = -Math.atan2(dy, dx);

    const { breidd, hlidrun } = stigaRummal(s, veggir, metri);
    const rotX = s.ax + nx * hlidrun;
    const rotY = s.ay + ny * hlidrun;

    const fjoldi = Math.max(6, Math.min(18, Math.round(lengd / (THREPA_DJUP_M * metri))));
    const threpLengd = lengd / fjoldi;
    const innriBreidd = Math.max(metri * 0.4, breidd - vangaB * 2);

    for (let i = 0; i < fjoldi; i++) {
      const hlutfall = (i + 1) / fjoldi;
      const toppY = hlutfall * veggH;
      // Stallurinn nær niður fyrir næsta þrep á undan svo stiginn sé samfelldur bæði ofan frá og frá hlið.
      const botnY = Math.max(0, ((i - 1.2) / fjoldi) * veggH);
      const h = Math.max(brunHaed * 2, toppY - botnY);
      const midS = (i + 0.5) * threpLengd;
      const cx = rotX + ux * midS;
      const cz = rotY + uy * midS;

      threp.push({
        x: cx,
        y: botnY + h / 2,
        z: cz,
        horn,
        lengd: threpLengd * 1.02,
        haed: h,
        breidd: innriBreidd,
        litur: blandaLit(i / Math.max(1, fjoldi - 1)),
      });

      // Dökk brún fremst á hverju þrepi svo þrepin lesist skýrt beint ofan frá.
      const brunS = i * threpLengd + Math.min(brunDjup, threpLengd * 0.35) / 2;
      brir.push({
        x: rotX + ux * brunS,
        y: toppY + brunHaed * 0.35,
        z: rotY + uy * brunS,
        horn,
        lengd: Math.min(brunDjup, threpLengd * 0.35),
        haed: brunHaed,
        breidd: innriBreidd,
        litur: STIGA_BRUN_LITUR_3D,
      });

      // Hliðarvangar sitthvorumegin sem fylgja stöllunum upp.
      const vangaH = h + brunHaed * 1.2;
      for (const hlid of [-1, 1] as const) {
        const hlidD = hlid * (breidd / 2 - vangaB / 2);
        vangar.push({
          x: cx + nx * hlidD,
          y: botnY + vangaH / 2,
          z: cz + ny * hlidD,
          horn,
          lengd: threpLengd * 1.04,
          haed: vangaH,
          breidd: vangaB,
          litur: STIGA_VANGI_LITUR_3D,
        });
      }
    }
  }

  return { threp, brir, vangar };
}
