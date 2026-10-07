// Veggjaritill — hreinar rúmfræðiaðgerðir á veggjum borðsins (Agnar 06.10.2026: „venjulegi veggja-generatorinn er
// mjög lélegur, ég get varla eytt veggjum eða bætt nýjum við, ég þarf miklu meiri fídusa til að klára restina sjálfur").
//
// Veggur = LineObject á laginu „Veggir": miðlína (points, afstæð við x/y) + þykkt (strokeWidth) + tegund
// (veggur / gler / hurð). Hér eru aðeins föll sem taka veggi inn og skila nýjum — viðmótið
// (components/kjarni/VeggjaRitill.tsx) skrifar útkomuna í borðið með einni ⌘Z-færslu per aðgerð.
//
//   smella          endapunktar > lína veggjar > hornalás 0/45/90°
//   veggurVid       hvaða veggur er undir bendlinum
//   veggirIKassa    kassaval: „inni" (dregið til hægri) eða „snerta" (dregið til vinstri), eins og í CAD
//   kljufaVegg      einn veggur → tveir við smellinn
//   sameinaVeggi    samlínu veggir → einn
//   lengjaAd        endi lengdur/klipptur að miðlínu annars veggjar
//   bilMilli        bilið milli tveggja samlínu veggja (hurð í bil)
//   rettHyrningur   dreginn kassi → fjórir veggir
//   sameinaVidVeggi samruni greiningar við veggina sem fyrir eru: tvítekningar falla, aðeins óþakið bætist við

import { LAYER_VEGGIR } from "./layers";
import type { VeggTegund } from "./teikning-veggir";
import type { BoardObject, LineObject } from "./types";
import { erVeggur, VEGG_LITIR, VEGG_NOFN } from "./veggja-leidretting";

export type P = [number, number];

/** Þykktir sem boðið er upp á (cm). */
export const THYKKTIR_CM = [10, 15, 20, 30] as const;

// ── grunnur ────────────────────────────────────────────────────────────────────────────────────────────────

export function heimsPunktar(o: LineObject): number[] {
  return o.points.map((v, i) => v + (i % 2 === 0 ? o.x : o.y));
}

/** Heimshnit → punktar afstæðir við x/y hlutarins. */
export function afstaedir(o: Pick<LineObject, "x" | "y">, heims: number[]): number[] {
  return heims.map((v, i) => v - (i % 2 === 0 ? o.x : o.y));
}

function lengdPunkta(pts: number[]): number {
  let s = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return s;
}

export function veggLengd(o: LineObject): number {
  return lengdPunkta(o.points);
}

/** Næsti punktur á brotalínu: fjarlægð, punkturinn, bútur (upphafsvísir í punktum/2) og staða á bútnum (0–1). */
export function naestiPunktur(X: P, pts: number[]): { d: number; Q: P; butur: number; u: number } {
  let best = { d: Infinity, Q: [pts[0], pts[1]] as P, butur: 0, u: 0 };
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((X[0] - ax) * dx + (X[1] - ay) * dy) / L2)) : 0;
    const Q: P = [ax + u * dx, ay + u * dy];
    const d = Math.hypot(X[0] - Q[0], X[1] - Q[1]);
    if (d < best.d) best = { d, Q, butur: i / 2 - 1, u };
  }
  return best;
}

/** Veggirnir sem ritillinn má breyta: sýnilegir, ólæstir veggir. */
export function breytanlegirVeggir(
  objects: BoardObject[],
  synilegt: (o: BoardObject) => boolean,
  laest: (o: BoardObject) => boolean
): LineObject[] {
  return objects.filter((o): o is LineObject => erVeggur(o) && synilegt(o) && !laest(o));
}

// ── hornalás og smellur ────────────────────────────────────────────────────────────────────────────────────

/** P lagað að næstu stefnu 0/45/90/… frá A; lengdin er ofanvarp P á stefnuna (bendillinn helst nálægt). */
export function hornalas(A: P, X: P): P {
  const dx = X[0] - A[0], dy = X[1] - A[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return [A[0], A[1]];
  const skref = Math.PI / 4;
  const h = Math.round(Math.atan2(dy, dx) / skref) * skref;
  let c = Math.cos(h), s = Math.sin(h);
  if (Math.abs(c) < 1e-9) c = 0;
  if (Math.abs(s) < 1e-9) s = 0;
  const t = dx * c + dy * s;
  return [c === 0 ? A[0] : A[0] + t * c, s === 0 ? A[1] : A[1] + t * s];
}

export type SmellTegund = "endi" | "lina" | "hornalas" | null;

export interface Smellur {
  P: P;
  tegund: SmellTegund;
  veggId?: string;
}

export interface SmellaStillingar {
  /** Vikmörk í heimseiningum (venjulega 10 skjádílar / kvarði). */
  vik: number;
  /** Veggir sem smellast ekki (sá sem er dreginn). */
  undan?: ReadonlySet<string>;
  /** Fyrri punktur keðjunnar — hornalás miðast við hann. */
  akkeri?: P | null;
  hornalas?: boolean;
}

/** Bendill → punktur: endapunktur veggjar (og hornpunktar brotalínu) innan vikmarka gengur fyrir, svo lína veggjar
 * (miðlína), svo hornalásinn. Með hornalás smellur punkturinn á skurðpunkt geislans við næsta vegg. */
export function smella(X: P, veggir: LineObject[], st: SmellaStillingar): Smellur {
  const lasP = st.hornalas && st.akkeri ? hornalas(st.akkeri, X) : null;
  let best: Smellur | null = null;
  let bestD = st.vik;
  for (const o of veggir) {
    if (st.undan?.has(o.id)) continue;
    const pts = heimsPunktar(o);
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const d = Math.hypot(pts[i] - X[0], pts[i + 1] - X[1]);
      if (d <= bestD) {
        bestD = d;
        best = { P: [pts[i], pts[i + 1]], tegund: "endi", veggId: o.id };
      }
    }
  }
  if (best) return best;
  const Y = lasP ?? X;
  bestD = st.vik;
  for (const o of veggir) {
    if (st.undan?.has(o.id)) continue;
    const pts = heimsPunktar(o);
    if (lasP && st.akkeri) {
      // geislinn akkeri → lasP sker miðlínu veggjarins nálægt bendlinum
      const A = st.akkeri, d: P = [lasP[0] - A[0], lasP[1] - A[1]];
      const Ld = Math.hypot(d[0], d[1]);
      if (Ld < 1e-9) continue;
      for (let i = 2; i + 1 < pts.length; i += 2) {
        const a: P = [pts[i - 2], pts[i - 1]], b: P = [pts[i], pts[i + 1]];
        const e: P = [b[0] - a[0], b[1] - a[1]];
        const k = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(k) < 1e-9 * Ld * Math.hypot(e[0], e[1])) continue;
        const w: P = [a[0] - A[0], a[1] - A[1]];
        const s = (w[0] * e[1] - w[1] * e[0]) / k, u = (w[0] * d[1] - w[1] * d[0]) / k;
        if (u < 0 || u > 1 || s <= 0) continue;
        const S: P = [A[0] + d[0] * s, A[1] + d[1] * s];
        const fj = Math.hypot(S[0] - lasP[0], S[1] - lasP[1]);
        if (fj <= bestD) {
          bestD = fj;
          best = { P: S, tegund: "lina", veggId: o.id };
        }
      }
    } else {
      const n = naestiPunktur(Y, pts);
      if (n.d <= bestD) {
        bestD = n.d;
        best = { P: n.Q, tegund: "lina", veggId: o.id };
      }
    }
  }
  if (best) return best;
  return lasP ? { P: lasP, tegund: "hornalas" } : { P: [X[0], X[1]], tegund: null };
}

// ── val ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Veggurinn undir bendlinum: næsta miðlína innan max(vik, hálf þykkt). */
export function veggurVid(X: P, veggir: LineObject[], vik: number): { o: LineObject; d: number; Q: P; butur: number } | null {
  let best: { o: LineObject; d: number; Q: P; butur: number } | null = null;
  for (const o of veggir) {
    const n = naestiPunktur(X, heimsPunktar(o));
    if (n.d > Math.max(vik, o.strokeWidth / 2)) continue;
    if (!best || n.d < best.d) best = { o, d: n.d, Q: n.Q, butur: n.butur };
  }
  return best;
}

export interface Kassi {
  x: number;
  y: number;
  width: number;
  height: number;
}

function inniKassa(x: number, y: number, k: Kassi) {
  return x >= k.x && y >= k.y && x <= k.x + k.width && y <= k.y + k.height;
}

/** Sker strik kassann? (Liang–Barsky) */
function strikSkerKassa(ax: number, ay: number, bx: number, by: number, k: Kassi): boolean {
  if (inniKassa(ax, ay, k) || inniKassa(bx, by, k)) return true;
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - k.x, k.x + k.width - ax, ay - k.y, k.y + k.height - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Kassaval: „inni" = allur veggurinn innan kassans, „snerta" = einhver hluti hans. */
export function veggirIKassa(veggir: LineObject[], k: Kassi, ham: "inni" | "snerta"): string[] {
  const ut: string[] = [];
  for (const o of veggir) {
    const pts = heimsPunktar(o);
    let jaa: boolean;
    if (ham === "inni") {
      jaa = true;
      for (let i = 0; i + 1 < pts.length; i += 2) if (!inniKassa(pts[i], pts[i + 1], k)) { jaa = false; break; }
    } else {
      jaa = false;
      for (let i = 2; i + 1 < pts.length && !jaa; i += 2) jaa = strikSkerKassa(pts[i - 2], pts[i - 1], pts[i], pts[i + 1], k);
    }
    if (jaa) ut.push(o.id);
  }
  return ut;
}

// ── nýir veggir ───────────────────────────────────────────────────────────────────────────────────────────

export interface NyrVeggurStillingar {
  id: string;
  /** Þykkt í heimseiningum (borðdílum). */
  thykkt: number;
  tegund: VeggTegund;
  parentId?: string;
  /** Lota „Greina veggi" sem veggurinn kom úr. */
  greining?: string;
}

/** Nýr veggur á laginu „Veggir" (heimshnit, x = y = 0) — sama útlit og innfluttir veggir. */
export function nyrVeggur(heims: number[], st: NyrVeggurStillingar): LineObject {
  const o: LineObject = {
    id: st.id,
    type: "polyline",
    x: 0,
    y: 0,
    points: heims.slice(),
    stroke: VEGG_LITIR[st.tegund],
    strokeWidth: Math.max(1, st.thykkt),
    dash: "solid",
    rotation: 0,
    opacity: 0.9,
    locked: false,
    hidden: false,
    name: VEGG_NOFN[st.tegund],
    veggur: true,
    layerId: LAYER_VEGGIR,
  };
  if (st.parentId) o.parentId = st.parentId;
  if (st.tegund !== "veggur") o.veggTegund = st.tegund;
  if (st.greining) o.greining = st.greining;
  return o;
}

/** Veggir úr „Greina veggi" eftir lotum, nýjasta lotan fyrst (auðkenni `g<tími36>` raðast í tímaröð). */
export function greiningarLotur(veggir: readonly { id: string; greining?: string }[]): { id: string; ids: string[] }[] {
  const lotur = new Map<string, string[]>();
  for (const o of veggir) {
    if (!o.greining) continue;
    const l = lotur.get(o.greining);
    if (l) l.push(o.id);
    else lotur.set(o.greining, [o.id]);
  }
  return [...lotur.entries()]
    .sort((a, b) => b[0].length - a[0].length || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([id, ids]) => ({ id, ids }));
}

/** Auðkenni nýrrar greiningarlotu (tími í grunni 36 — raðast rétt). */
export function nyGreiningarLota(nu = Date.now()): string {
  return "g" + nu.toString(36);
}

/** Afrit af vegg með nýjum punktum (heimshnit) og nýju id — allt annað (tegund, þykkt, festing, lag) helst. */
export function afritMedPunktum(o: LineObject, heims: number[], id: string): LineObject {
  return { ...o, id, points: afstaedir(o, heims) };
}

/** Dreginn kassi A–B → fjórir veggir eftir brúnunum (miðlínur á brúnunum, hornin mætast). */
export function rettHyrningur(A: P, B: P, st: Omit<NyrVeggurStillingar, "id">, nyttId: () => string): LineObject[] {
  const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]);
  if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return [];
  const hlidar: number[][] = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];
  return hlidar.map((p) => nyrVeggur(p, { ...st, id: nyttId() }));
}

// ── breytingar á einum vegg ───────────────────────────────────────────────────────────────────────────────

/** Klýfur vegg við punktinn næst X: tveir veggir sem mætast þar (sama tegund og þykkt). null ef punkturinn er við
 * enda (styttri bútur en `lagmark`). */
export function kljufaVegg(o: LineObject, X: P, nyttId: () => string, lagmark = 1): [LineObject, LineObject] | null {
  const pts = heimsPunktar(o);
  const n = naestiPunktur(X, pts);
  const i = n.butur; // bútur i: punktar i og i+1
  const fyrri = pts.slice(0, (i + 1) * 2).concat([n.Q[0], n.Q[1]]);
  const seinni = [n.Q[0], n.Q[1]].concat(pts.slice((i + 1) * 2));
  // punktur ofan á hornpunkti: ekki tvöfalda hann
  const hreinsa = (p: number[]) => {
    const ut: number[] = [];
    for (let k = 0; k + 1 < p.length; k += 2) {
      const m = ut.length;
      if (m >= 2 && Math.hypot(p[k] - ut[m - 2], p[k + 1] - ut[m - 1]) < 1e-6) continue;
      ut.push(p[k], p[k + 1]);
    }
    return ut;
  };
  const a = hreinsa(fyrri), b = hreinsa(seinni);
  if (a.length < 4 || b.length < 4 || lengdPunkta(a) < lagmark || lengdPunkta(b) < lagmark) return null;
  return [afritMedPunktum(o, a, nyttId()), afritMedPunktum(o, b, nyttId())];
}

/** Endapunktur veggjar færður (heimshnit). hlid 0 = fyrsti punktur, 1 = síðasti. */
export function faeraEnda(o: LineObject, hlid: 0 | 1, X: P): LineObject {
  const pts = o.points.slice();
  const i = hlid === 0 ? 0 : pts.length - 2;
  pts[i] = X[0] - o.x;
  pts[i + 1] = X[1] - o.y;
  return { ...o, points: pts };
}

/** Veggur hliðraður um (dx, dy). */
export function hlidra(o: LineObject, dx: number, dy: number): LineObject {
  return { ...o, points: o.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
}

/** Endapunktar annarra veggja sem liggja ofan á P (innan `vik`) — þeir fylgja þegar horn er dregið. */
export function tengdirEndar(P: P, veggir: LineObject[], undan: string, vik: number): { id: string; hlid: 0 | 1 }[] {
  const ut: { id: string; hlid: 0 | 1 }[] = [];
  for (const o of veggir) {
    if (o.id === undan) continue;
    const pts = heimsPunktar(o);
    const n = pts.length;
    if (Math.hypot(pts[0] - P[0], pts[1] - P[1]) <= vik) ut.push({ id: o.id, hlid: 0 });
    else if (Math.hypot(pts[n - 2] - P[0], pts[n - 1] - P[1]) <= vik) ut.push({ id: o.id, hlid: 1 });
  }
  return ut;
}

// ── tveir eða fleiri veggir ───────────────────────────────────────────────────────────────────────────────

interface Lina {
  o: LineObject;
  a: P;
  b: P;
  L: number;
  d: P;
}

function sem2Punkta(o: LineObject, beinVik: number): Lina | null {
  const pts = heimsPunktar(o);
  const n = pts.length;
  const a: P = [pts[0], pts[1]], b: P = [pts[n - 2], pts[n - 1]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1e-6) return null;
  const d: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  // brotalína sem er ekki bein (hornpunktur út fyrir línuna) telst ekki
  for (let i = 2; i + 3 < n; i += 2) {
    const f = Math.abs((pts[i] - a[0]) * d[1] - (pts[i + 1] - a[1]) * d[0]);
    if (f > beinVik) return null;
  }
  return { o, a, b, L, d };
}

const HORN_SAMSIDA = Math.sin((3 * Math.PI) / 180);

/** Samlínu veggir → einn: frá ysta enda til ysta enda á lengdarvegnu meðallínunni, lengdarvegin þykkt, tegund og
 * eiginleikar lengsta veggjarins. Skilar villu ef veggirnir eru ekki í beinni línu. */
export function sameinaVeggi(
  veggir: LineObject[],
  nyttId: () => string
): { nyr: LineObject; eyda: string[] } | { villa: string } {
  if (veggir.length < 2) return { villa: "Veldu tvo eða fleiri veggi í beinni línu" };
  const tMax = Math.max(...veggir.map((o) => o.strokeWidth));
  const L: Lina[] = [];
  for (const o of veggir) {
    const l = sem2Punkta(o, Math.max(1, o.strokeWidth / 2));
    if (!l) return { villa: "Bognir veggir sameinast ekki — kljúfðu þá fyrst" };
    L.push(l);
  }
  L.sort((p, q) => q.L - p.L);
  const ref = L[0];
  let d: P = ref.d;
  for (const l of L) {
    if (Math.abs(d[0] * l.d[1] - d[1] * l.d[0]) > HORN_SAMSIDA) return { villa: "Veggirnir eru ekki samsíða" };
  }
  // meðalstefna (allar snúnar í sömu átt)
  let sx = 0, sy = 0;
  for (const l of L) {
    const s = l.d[0] * d[0] + l.d[1] * d[1] < 0 ? -1 : 1;
    sx += l.d[0] * s * l.L;
    sy += l.d[1] * s * l.L;
  }
  const Ls = Math.hypot(sx, sy);
  d = [sx / Ls, sy / Ls];
  const nrm: P = [-d[1], d[0]];
  // meðal-hliðrun þvert og útmörk eftir línunni
  let rho = 0, wsum = 0, t0 = Infinity, t1 = -Infinity, tw = 0;
  for (const l of L) {
    for (const X of [l.a, l.b]) {
      const t = X[0] * d[0] + X[1] * d[1];
      t0 = Math.min(t0, t);
      t1 = Math.max(t1, t);
    }
    const m: P = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
    rho += (m[0] * nrm[0] + m[1] * nrm[1]) * l.L;
    tw += l.o.strokeWidth * l.L;
    wsum += l.L;
  }
  rho /= wsum;
  for (const l of L) {
    for (const X of [l.a, l.b]) {
      if (Math.abs(X[0] * nrm[0] + X[1] * nrm[1] - rho) > tMax + 1) return { villa: "Veggirnir eru ekki á sömu línu" };
    }
  }
  const A: P = [d[0] * t0 + nrm[0] * rho, d[1] * t0 + nrm[1] * rho];
  const B: P = [d[0] * t1 + nrm[0] * rho, d[1] * t1 + nrm[1] * rho];
  // haldið stefnu lengsta veggjarins (fyrsti punktur hans er „a")
  const snua = ref.d[0] * d[0] + ref.d[1] * d[1] < 0;
  const heims = snua ? [B[0], B[1], A[0], A[1]] : [A[0], A[1], B[0], B[1]];
  const nyr: LineObject = { ...ref.o, id: nyttId(), points: afstaedir(ref.o, heims), strokeWidth: tw / wsum };
  return { nyr, eyda: veggir.map((o) => o.id) };
}

/** Bilið milli tveggja samlínu veggja (næstu endar þeirra), á miðlínunni — fyrir „Hurð í bil". null ef þeir eru ekki
 * samlínu eða skarast. */
export function bilMilli(a: LineObject, b: LineObject): { heims: number[]; thykkt: number } | null {
  const la = sem2Punkta(a, Math.max(1, a.strokeWidth / 2)), lb = sem2Punkta(b, Math.max(1, b.strokeWidth / 2));
  if (!la || !lb) return null;
  if (Math.abs(la.d[0] * lb.d[1] - la.d[1] * lb.d[0]) > HORN_SAMSIDA) return null;
  const d = la.d, nrm: P = [-d[1], d[0]];
  const tA = [la.a, la.b].map((X) => X[0] * d[0] + X[1] * d[1]).sort((p, q) => p - q);
  const tB = [lb.a, lb.b].map((X) => X[0] * d[0] + X[1] * d[1]).sort((p, q) => p - q);
  const rA = la.a[0] * nrm[0] + la.a[1] * nrm[1], rB = lb.a[0] * nrm[0] + lb.a[1] * nrm[1];
  if (Math.abs(rA - rB) > Math.max(a.strokeWidth, b.strokeWidth) + 1) return null;
  let s: number, e: number;
  if (tA[1] <= tB[0]) [s, e] = [tA[1], tB[0]];
  else if (tB[1] <= tA[0]) [s, e] = [tB[1], tA[0]];
  else return null;
  if (e - s < 1e-6) return null;
  const rho = (rA * la.L + rB * lb.L) / (la.L + lb.L);
  const P0 = [d[0] * s + nrm[0] * rho, d[1] * s + nrm[1] * rho];
  const P1 = [d[0] * e + nrm[0] * rho, d[1] * e + nrm[1] * rho];
  return { heims: [P0[0], P0[1], P1[0], P1[1]], thykkt: (a.strokeWidth + b.strokeWidth) / 2 };
}

/** Lengir eða klippir þann enda veggjarins sem er nær marki að miðlínu marksins (skurðpunktur línanna). null ef
 * veggirnir eru samsíða eða endabúturinn myndi snúast við. */
export function lengjaAd(o: LineObject, mark: LineObject): LineObject | null {
  const pts = heimsPunktar(o);
  const n = pts.length;
  if (n < 4) return null;
  const mpts = heimsPunktar(mark);
  const endar: { hlid: 0 | 1; P: P; Q: P }[] = [
    { hlid: 0, P: [pts[0], pts[1]], Q: [pts[2], pts[3]] },
    { hlid: 1, P: [pts[n - 2], pts[n - 1]], Q: [pts[n - 4], pts[n - 3]] },
  ];
  let best: { hlid: 0 | 1; X: P; fj: number } | null = null;
  for (const e of endar) {
    const L = Math.hypot(e.P[0] - e.Q[0], e.P[1] - e.Q[1]);
    if (L < 1e-9) continue;
    const d: P = [(e.P[0] - e.Q[0]) / L, (e.P[1] - e.Q[1]) / L];
    for (let i = 2; i + 1 < mpts.length; i += 2) {
      const a: P = [mpts[i - 2], mpts[i - 1]], b: P = [mpts[i], mpts[i + 1]];
      const ex: P = [b[0] - a[0], b[1] - a[1]];
      const Le = Math.hypot(ex[0], ex[1]);
      if (Le < 1e-9) continue;
      const k = d[0] * ex[1] - d[1] * ex[0];
      if (Math.abs(k) / Le < 0.05) continue; // samsíða (< ~3°)
      const w: P = [a[0] - e.Q[0], a[1] - e.Q[1]];
      const s = (w[0] * ex[1] - w[1] * ex[0]) / k; // frá Q eftir d
      if (s <= Math.max(1, L * 0.05)) continue; // endabúturinn myndi snúast við / hverfa
      const X: P = [e.Q[0] + d[0] * s, e.Q[1] + d[1] * s];
      // fjarlægð endans frá marki (bútnum sjálfum) ræður hvaða endi er „nær"
      const fj = naestiPunktur(e.P, mpts).d;
      if (!best || fj < best.fj) best = { hlid: e.hlid, X, fj };
    }
  }
  return best ? faeraEnda(o, best.hlid, best.X) : null;
}

// ── samruni greiningar við veggina sem fyrir eru ──────────────────────────────────────────────────────────

/** Veggur í samruna: miðlína (heimshnit eða dílar frummyndar — bara sama kerfi beggja megin), þykkt, tegund. */
export interface Butur {
  p: number[];
  t: number;
  tegund?: VeggTegund;
}

export interface SamrunaStillingar {
  /** Aukasvigrúm þvert á vegg (sömu einingar) — tveir veggir eru „sami veggur" ef miðlínur eru innan hálfrar þykktar
   * stærri veggjarins + vik. */
  vik: number;
  /** Óþaktir hlutar styttri en þetta falla burt. */
  lagmark: number;
}

export interface SamrunaNidurstada {
  /** Það sem bætist við (nýir veggir, eða óþaktir hlutar þeirra). */
  baeta: Butur[];
  /** Nýir veggir sem voru þegar allir á teikningunni. */
  tviteknir: number;
  /** Nýir veggir sem voru að hluta til — aðeins óþakti hlutinn bætist við. */
  styttir: number;
}

/** Bætir greiningu við veggina sem fyrir eru án tvítekninga: hver nýr bútur sem liggur ofan á samsíða vegg (sama
 * miðlína innan þykktar) fellur burt, og sá sem liggur að hluta ofan á styttist í óþakta hlutann. Veggirnir sem
 * fyrir eru breytast aldrei — leiðréttingar (gler, hurð, færslur) haldast. */
export function sameinaVidVeggi(fyrir: Butur[], nyir: Butur[], st: SamrunaStillingar): SamrunaNidurstada {
  type S = { a: P; b: P; d: P; L: number; t: number };
  const butar = (v: Butur): S[] => {
    const ut: S[] = [];
    for (let i = 2; i + 1 < v.p.length; i += 2) {
      const a: P = [v.p[i - 2], v.p[i - 1]], b: P = [v.p[i], v.p[i + 1]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-9) continue;
      ut.push({ a, b, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], L, t: v.t });
    }
    return ut;
  };
  const gamlir = fyrir.flatMap(butar);
  const baeta: Butur[] = [];
  let tviteknir = 0, styttir = 0;
  for (const v of nyir) {
    let eftirAlls = 0, alls = 0;
    const partar: Butur[] = [];
    for (const s of butar(v)) {
      alls += s.L;
      let eftir: [number, number][] = [[0, s.L]];
      for (const g of gamlir) {
        if (Math.abs(s.d[0] * g.d[1] - s.d[1] * g.d[0]) > 0.06) continue; // ~3,5°
        const thol = Math.max(s.t, g.t) / 2 + st.vik;
        const f = (X: P) => Math.abs((X[0] - s.a[0]) * s.d[1] - (X[1] - s.a[1]) * s.d[0]);
        if (f(g.a) > thol || f(g.b) > thol) continue;
        const ta = (g.a[0] - s.a[0]) * s.d[0] + (g.a[1] - s.a[1]) * s.d[1];
        const tb = (g.b[0] - s.a[0]) * s.d[0] + (g.b[1] - s.a[1]) * s.d[1];
        const c = Math.min(ta, tb) - st.vik, e = Math.max(ta, tb) + st.vik;
        const n: [number, number][] = [];
        for (const [x0, x1] of eftir) {
          if (e <= x0 || c >= x1) { n.push([x0, x1]); continue; }
          if (c > x0) n.push([x0, c]);
          if (e < x1) n.push([e, x1]);
        }
        eftir = n;
        if (!eftir.length) break;
      }
      for (const [x0, x1] of eftir) {
        if (x1 - x0 < st.lagmark) continue;
        eftirAlls += x1 - x0;
        const p = [s.a[0] + s.d[0] * x0, s.a[1] + s.d[1] * x0, s.a[0] + s.d[0] * x1, s.a[1] + s.d[1] * x1];
        partar.push(v.tegund ? { p, t: v.t, tegund: v.tegund } : { p, t: v.t });
      }
    }
    if (!partar.length) {
      tviteknir++;
      continue;
    }
    // óbreyttur nýr veggur heldur brotalínunni sinni; annars koma óþöktu hlutarnir
    if (eftirAlls >= alls - 1e-6 && partar.length === Math.max(1, (v.p.length >> 1) - 1)) baeta.push(v);
    else {
      styttir++;
      baeta.push(...partar);
    }
  }
  return { baeta, tviteknir, styttir };
}

/** LineObject-veggur → Butur (heimshnit). */
export function semButur(o: LineObject): Butur {
  const b: Butur = { p: heimsPunktar(o), t: o.strokeWidth };
  if (o.veggTegund && o.veggTegund !== "veggur") b.tegund = o.veggTegund;
  return b;
}

// ── talning ───────────────────────────────────────────────────────────────────────────────────────────────

export interface VeggjaTalning {
  veggur: number;
  gler: number;
  hurd: number;
  /** Eldveggir (EI-60 + EI-30). */
  eld: number;
  alls: number;
}

export function veggjaTalning(objects: BoardObject[]): VeggjaTalning {
  const t: VeggjaTalning = { veggur: 0, gler: 0, hurd: 0, eld: 0, alls: 0 };
  for (const o of objects) {
    if (!erVeggur(o) || o.hidden) continue;
    const tg = o.veggTegund ?? "veggur";
    if (tg === "ei60" || tg === "ei30") t.eld++;
    else t[tg]++;
    t.alls++;
  }
  return t;
}

/** Eintala í íslensku: 1, 21, 31 … (ekki 11). */
function eintala(n: number) {
  return n % 10 === 1 && n % 100 !== 11;
}

/** „62 veggir · 5 gler · 3 hurðir" */
export function talningTexti(t: VeggjaTalning): string {
  const hlutar = [`${t.veggur} ${eintala(t.veggur) ? "veggur" : "veggir"}`];
  if (t.gler) hlutar.push(`${t.gler} gler`);
  if (t.hurd) hlutar.push(`${t.hurd} ${eintala(t.hurd) ? "hurð" : "hurðir"}`);
  if (t.eld) hlutar.push(`${t.eld} ${eintala(t.eld) ? "eldveggur" : "eldveggir"}`);
  return hlutar.join(" · ");
}

/** Metrar með íslenskri kommu: 3,45 m */
export function metraTexti(px: number, dilarAMetra: number | null): string {
  if (!dilarAMetra || !(dilarAMetra > 0)) return `${Math.round(px)} dílar`;
  const m = px / dilarAMetra;
  return (m < 10 ? m.toFixed(2) : m.toFixed(1)).replace(".", ",") + " m";
}
