// Lagnir (Agnar 30.10.2026: „búa til layer kerfi inn í turboprint … alveg sér ham … hvað það eru margar þéttingar á
// hverri hæð"). Verkteikningar NLSH (Procore, A1 1:50) og Brunayfirlit (1:250) eru VIGUR-PDF þar sem hvert kerfi hefur
// sinn lit: brunaveggir rauðir (#ff0000) á Brunayfirliti, rásir grá útfyllt á loftræsiblaði. Hér er lesið eftir LIT (ekki
// þykkt eins og pdf-veggir.ts), blað stillt á yfirlitið með tveimur punktapörum og talið hvar lögn sker brunavegg.
//
// Allt í punktum síðunnar (pt, efra-vinstra horn = 0,0), eins og pdf-veggir.ts.

import type { PdfOps } from "./pdf-veggir";

export type Strik = [number, number, number, number];
export type Punktur = [number, number];

export interface LitaStrik {
  /** Litur sem „#rrggbb" (lágstafir). */
  lit: string;
  /** Línuþykkt í pt (eftir varpanir). */
  b: number;
  s: Strik;
}

export interface LitFlatur {
  lit: string;
  /** Jaðar flatarins (bogar sýnishornaðir). */
  p: Punktur[];
}

export interface LitaLog {
  strik: LitaStrik[];
  flatir: LitFlatur[];
}

type Fylki = [number, number, number, number, number, number];

const mul = (a: Fylki, b: Fylki): Fylki => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

/** pdf.js 5 skilar lit sem „#rrggbb"; eldri útgáfur [r, g, b] (0–255). */
export function litTilHex(a: unknown[]): string {
  if (typeof a[0] === "string") return (a[0] as string).toLowerCase();
  const h = (n: unknown) => Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16).padStart(2, "0");
  return `#${h(a[0])}${h(a[1])}${h(a[2])}`;
}

/** Les strokuð strik og útfyllta fleti síðunnar með lit. Skilur pdf.js 4.x/5.x (málun inni í constructPath). */
export function lesaLitaLog(OPS: PdfOps, fnArray: number[], argsArray: unknown[], grunnur: number[]): LitaLog {
  const ap = (m: Fylki, x: number, y: number): Punktur => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const set = (...n: string[]) => new Set(n.map((x) => OPS[x]).filter((x) => x != null));
  const FYLLA = set("fill", "eoFill", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke");
  const STROKA = set("stroke", "closeStroke", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke");
  let ctm = grunnur.slice(0, 6) as Fylki, lw = 1, sLit = "#000000", fLit = "#000000";
  const stafli: [Fylki, number, string, string][] = [];
  const strik: LitaStrik[] = [];
  const flatir: LitFlatur[] = [];
  const kvardi = () => Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i] as unknown[];
    if (fn === OPS.save) stafli.push([ctm.slice() as Fylki, lw, sLit, fLit]);
    else if (fn === OPS.restore) {
      const t = stafli.pop();
      if (t) [ctm, lw, sLit, fLit] = t;
    } else if (fn === OPS.transform) ctm = mul(ctm, a as unknown as Fylki);
    else if (fn === OPS.setLineWidth) lw = a[0] as number;
    else if (fn === OPS.setStrokeRGBColor) sLit = litTilHex(a);
    else if (fn === OPS.setFillRGBColor) fLit = litTilHex(a);
    else if (fn === OPS.setStrokeGray) sLit = litTilHex([Number(a[0]) * 255, Number(a[0]) * 255, Number(a[0]) * 255]);
    else if (fn === OPS.setFillGray) fLit = litTilHex([Number(a[0]) * 255, Number(a[0]) * 255, Number(a[0]) * 255]);
    else if (fn === OPS.constructPath && typeof a[0] === "number") {
      const d = (a[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!d) continue;
      const mal = a[0] as number;
      const undir: Punktur[][] = [];
      let cur: Punktur[] = [];
      let p: Punktur | null = null;
      const byrja = (q: Punktur) => {
        if (cur.length > 1) undir.push(cur);
        cur = [q];
        p = q;
      };
      for (let j = 0; j < d.length; ) {
        const op = d[j++];
        if (op === 0) { byrja(ap(ctm, d[j], d[j + 1])); j += 2; }
        else if (op === 1) { p = ap(ctm, d[j], d[j + 1]); cur.push(p); j += 2; }
        else if (op === 2) {
          const p0: Punktur = p ?? ap(ctm, d[j], d[j + 1]);
          const c1 = ap(ctm, d[j], d[j + 1]), c2 = ap(ctm, d[j + 2], d[j + 3]), e = ap(ctm, d[j + 4], d[j + 5]);
          for (let k = 1; k <= 6; k++) {
            const t = k / 6, u = 1 - t;
            cur.push([
              u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
              u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1],
            ]);
          }
          p = e;
          j += 6;
        } else if (op === 3) {
          const p0: Punktur = p ?? ap(ctm, d[j], d[j + 1]);
          const c1 = ap(ctm, d[j], d[j + 1]), e = ap(ctm, d[j + 2], d[j + 3]);
          for (let k = 1; k <= 5; k++) {
            const t = k / 5, u = 1 - t;
            cur.push([u * u * p0[0] + 2 * u * t * c1[0] + t * t * e[0], u * u * p0[1] + 2 * u * t * c1[1] + t * t * e[1]]);
          }
          p = e;
          j += 4;
        } else if (op === 4) {
          if (cur.length > 1) cur.push(cur[0]);
          if (cur.length) p = cur[0];
        } else break;
      }
      if (cur.length > 1) undir.push(cur);
      if (STROKA.has(mal)) {
        const b = lw * kvardi();
        for (const u of undir) for (let k = 1; k < u.length; k++) strik.push({ lit: sLit, b, s: [u[k - 1][0], u[k - 1][1], u[k][0], u[k][1]] });
      }
      if (FYLLA.has(mal)) for (const u of undir) if (u.length >= 3) flatir.push({ lit: fLit, p: u });
    }
  }
  return { strik, flatir };
}

export interface LitYfirlit {
  lit: string;
  fjoldi: number;
  /** Samanlögð lengd strika (pt) — eða jaðarlengd flata. */
  lengd: number;
}

/** Litir síðunnar, fjölmennastir fyrst — notandinn velur hvaða litur er brunaveggur og hvaða litur er lögn. */
export function litirStrika(strik: LitaStrik[]): LitYfirlit[] {
  const m = new Map<string, LitYfirlit>();
  for (const x of strik) {
    const y = m.get(x.lit) ?? { lit: x.lit, fjoldi: 0, lengd: 0 };
    y.fjoldi++;
    y.lengd += Math.hypot(x.s[2] - x.s[0], x.s[3] - x.s[1]);
    m.set(x.lit, y);
  }
  return [...m.values()].sort((a, b) => b.fjoldi - a.fjoldi);
}

export function litirFlata(flatir: LitFlatur[]): LitYfirlit[] {
  const m = new Map<string, LitYfirlit>();
  for (const x of flatir) {
    const y = m.get(x.lit) ?? { lit: x.lit, fjoldi: 0, lengd: 0 };
    y.fjoldi++;
    for (let k = 1; k < x.p.length; k++) y.lengd += Math.hypot(x.p[k][0] - x.p[k - 1][0], x.p[k][1] - x.p[k - 1][1]);
    m.set(x.lit, y);
  }
  return [...m.values()].sort((a, b) => b.fjoldi - a.fjoldi);
}

/** Litur sem sjálfgefinn brunaveggur: hreint rautt strik. */
export const BRUNAVEGGUR_LITUR = "#ff0000";

/** Gráir fletir sem sjálfgefnar rásir (mældir á M215/M216: 0,71 og 0,84). */
export function giskaARasalitum(flatir: LitYfirlit[]): string[] {
  return flatir
    .filter((x) => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(x.lit);
      if (!m) return false;
      const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
      return r === g && g === b && r >= 140 && r <= 230 && x.fjoldi >= 40;
    })
    .map((x) => x.lit);
}

// --- Stilling: tvö punktapör → líking (snúningur, kvarði, færsla) ---------------------------------------------------

/** z' = c·z + t á tvinntölum: c = (re, im). */
export interface Liking {
  re: number;
  im: number;
  tx: number;
  ty: number;
}

/** Líking sem varpar blaðpunktum m1, m2 á yfirlitspunkta y1, y2. null ef punktarnir falla saman. */
export function likingUrPunktapari(m1: Punktur, m2: Punktur, y1: Punktur, y2: Punktur): Liking | null {
  const dmx = m2[0] - m1[0], dmy = m2[1] - m1[1];
  const dyx = y2[0] - y1[0], dyy = y2[1] - y1[1];
  const n = dmx * dmx + dmy * dmy;
  if (n < 1e-9) return null;
  const re = (dyx * dmx + dyy * dmy) / n;
  const im = (dyy * dmx - dyx * dmy) / n;
  return { re, im, tx: y1[0] - (re * m1[0] - im * m1[1]), ty: y1[1] - (im * m1[0] + re * m1[1]) };
}

export function beitaLikingu(l: Liking, p: Punktur): Punktur {
  return [l.re * p[0] - l.im * p[1] + l.tx, l.im * p[0] + l.re * p[1] + l.ty];
}

export function andhverfLiking(l: Liking): Liking {
  const n = l.re * l.re + l.im * l.im;
  const re = l.re / n, im = -l.im / n;
  return { re, im, tx: -(re * l.tx - im * l.ty), ty: -(im * l.tx + re * l.ty) };
}

/** Kvarði líkingar (yfirlit pt á blað pt) — 0,2 þegar 1:250 er stillt á 1:50. */
export function kvardiLikingar(l: Liking): number {
  return Math.hypot(l.re, l.im);
}

// --- Gegnumtök -------------------------------------------------------------------------------------------------------

export interface Texti {
  s: string;
  x: number;
  y: number;
}

export interface Gegnumtak {
  x: number;
  y: number;
  /** Vísir í flatir listann sem skar vegginn. */
  flatur: number;
  /** Stærð af blaðinu næst skurðinum („Ø250", „250/Ø160", „800x900") eða null. */
  staerd: string | null;
}

/** Stærðarmerking rásar á lagnablaði. */
export const STAERD_MYNSTUR = /^(?:\d{2,4}\s*[x×]\s*\d{2,4}|(?:\d{2,4}\s*\/\s*)?[Øø⌀�]\s*\d{2,4})$/;

export function erStaerd(s: string): boolean {
  return STAERD_MYNSTUR.test(s.trim());
}

function skurdur(p1: Punktur, p2: Punktur, p3: Punktur, p4: Punktur): Punktur | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

export interface TalningStillingar {
  /** Skurðir sama flatar nær en þetta (pt á blaði) eru einn. 40 pt á 1:50 = 0,7 m. */
  badiVeggir?: number;
  /** Skurðir ólíkra flata nær en þetta eru ein rás sem er skipt í marga fleti. */
  saman?: number;
  /** Lengsta fjarlægð merkingar frá skurði. */
  taksFjarlaegd?: number;
  /** Stysta strik rásar sem er talið (pt) — sleppir smágerðum teikniflækjum. */
  minStrik?: number;
}

/** Telur hvar rásafletir (blaðhnit) skera brunaveggi (líka í blaðhnitum). Einn skurður per flöt og vegg — tvær brúnir
 * rásar og tvær hliðar veggjar gefa 4 skurðpunkta sem verða eitt gegnumtak. */
export function talaGegnumtok(veggir: Strik[], flatir: Punktur[][], texti: Texti[], st: TalningStillingar = {}): Gegnumtak[] {
  const badi = st.badiVeggir ?? 40, saman = st.saman ?? 25, taks = st.taksFjarlaegd ?? 260, lagm = st.minStrik ?? 3;
  const wb = veggir.map((v) => [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])]);
  const per: { x: number; y: number; flatur: number }[] = [];
  flatir.forEach((f, fi) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of f) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    const nalaegir = wb.map((b, i) => (b[2] >= x0 && b[0] <= x1 && b[3] >= y0 && b[1] <= y1 ? i : -1)).filter((i) => i >= 0);
    if (!nalaegir.length) return;
    const mal = [...f, f[0]];
    const flokkur: { x: number; y: number }[] = [];
    for (let k = 1; k < mal.length; k++) {
      if (Math.hypot(mal[k][0] - mal[k - 1][0], mal[k][1] - mal[k - 1][1]) < lagm) continue;
      for (const i of nalaegir) {
        const v = veggir[i];
        const q = skurdur(mal[k - 1], mal[k], [v[0], v[1]], [v[2], v[3]]);
        if (!q) continue;
        if (!flokkur.some((c) => Math.hypot(c.x - q[0], c.y - q[1]) < badi)) flokkur.push({ x: q[0], y: q[1] });
      }
    }
    for (const c of flokkur) per.push({ ...c, flatur: fi });
  });
  const ut: Gegnumtak[] = [];
  for (const c of per) {
    if (ut.some((m) => Math.hypot(m.x - c.x, m.y - c.y) < saman)) continue;
    let best: Texti | null = null, bd = taks;
    for (const t of texti) {
      const d = Math.hypot(t.x - c.x, t.y - c.y);
      if (d < bd && erStaerd(t.s)) { bd = d; best = t; }
    }
    ut.push({ x: c.x, y: c.y, flatur: c.flatur, staerd: best ? best.s.replace(/\s+/g, "").replace("�", "Ø") : null });
  }
  return ut;
}

/** Fjöldi gegnumtaka per stærð, fjölmennust fyrst. */
export function taldarStaerdir(g: Gegnumtak[]): { staerd: string; fjoldi: number }[] {
  const m = new Map<string, number>();
  for (const x of g) m.set(x.staerd ?? "óþekkt", (m.get(x.staerd ?? "óþekkt") ?? 0) + 1);
  return [...m].map(([staerd, fjoldi]) => ({ staerd, fjoldi })).sort((a, b) => b.fjoldi - a.fjoldi);
}

/** CSV (semikomma, íslenskt Excel): ein lína per gegnumtak. */
export function gegnumtokCsv(blod: { nafn: string; gegnumtok: Gegnumtak[] }[]): string {
  const l = ["Blað;Stærð;X;Y"];
  for (const b of blod) for (const g of b.gegnumtok) l.push([b.nafn, g.staerd ?? "", g.x.toFixed(1), g.y.toFixed(1)].join(";"));
  return l.join("\n");
}
