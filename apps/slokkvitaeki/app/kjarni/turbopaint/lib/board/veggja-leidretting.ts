// Leiðrétting veggja á laginu „Veggir" (Agnar 06.10.2026 — TurboPaint sem leiðréttingarborð, 1. áfangi).
// Valdir veggir fá tegund (veggur / gler / hurð) og „Tengja" lætur lausa enda mætast. Hreinar föll — stikan
// (VeggjaStika) kallar á þau og skrifar útkomuna í borðið með einni ⌘Z-færslu.

import { LAYER_VEGGIR } from "./layers";
import { dilarAMetraGisk, type VeggTegund } from "./teikning-veggir";
import type { BoardObject, LineObject } from "./types";

export const VEGG_LITIR: Record<VeggTegund, string> = {
  veggur: "#1c1917",
  gler: "#2563eb",
  hurd: "#b45309",
};

/** Nafnið heldur „Veggur"-forskeytinu: gegnumtök (crossings) og 3D (hus3d) þekkja veggi á því. */
export const VEGG_NOFN: Record<VeggTegund, string> = {
  veggur: "Veggur",
  gler: "Veggur · gler",
  hurd: "Veggur · hurð",
};

/** Veggur á borðinu: greindur/innfluttur (veggur), á laginu „Veggir", eða teiknaður með Veggja-tólinu (W). Eldveggir
 * (EI-veggur / Eldveggur) eru merkingar, ekki veggir hússins. */
export function erVeggur(o: BoardObject): o is LineObject {
  if (o.type !== "polyline" && o.type !== "line") return false;
  if (o.points.length < 4) return false;
  return o.veggur === true || o.layerId === LAYER_VEGGIR || /^Vegg(ur|ir)/.test(o.name);
}

export function veggTegundAf(o: LineObject): VeggTegund {
  return o.veggTegund ?? "veggur";
}

/** Tegund sett á vegg: litur og nafn fylgja, og hann telst veggur héðan í frá (vistast í úttekt). */
export function stillaVeggTegund(o: LineObject, tegund: VeggTegund): LineObject {
  return { ...o, veggur: true, veggTegund: tegund, stroke: VEGG_LITIR[tegund], name: VEGG_NOFN[tegund] };
}

/** Borðdílar á metra: kvarðinn (K) ef hann er til, annars ágiskun út frá tengdu úttektarmyndinni (A1 í 1:100). */
export function bordDilarAMetra(objects: BoardObject[], pixelsPerMeter: number | null): number | null {
  if (pixelsPerMeter && pixelsPerMeter > 0) return pixelsPerMeter;
  for (const o of objects) {
    if (o.type !== "image" || !o.uttekt) continue;
    const { frumB, frumH } = o.uttekt;
    if (!(frumB > 0) || !(frumH > 0) || !(o.width > 0)) continue;
    return (o.width / frumB) * dilarAMetraGisk({ b: frumB, h: frumH });
  }
  return null;
}

type P = [number, number];

interface Endi {
  id: string;
  hlid: 0 | 1;
  P: P;
  /** Einingarvigur ÚT frá veggnum við endann. */
  d: P;
  /** Lengd endabútsins (sá má ekki snúast við þegar endinn er klipptur). */
  butur: number;
  t: number;
}

const kross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const punkt = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];

function heimsPunktar(o: LineObject): number[] {
  return o.points.map((v, i) => v + (i % 2 === 0 ? o.x : o.y));
}

function endiAf(id: string, pts: number[], hlid: 0 | 1, t: number): Endi | null {
  const n = pts.length / 2;
  if (n < 2) return null;
  const i = hlid === 0 ? 0 : n - 1;
  const P: P = [pts[i * 2], pts[i * 2 + 1]];
  // fyrsti punktur sem er ekki ofan á endanum gefur stefnuna
  for (let k = 1; k < n; k++) {
    const j = hlid === 0 ? k : n - 1 - k;
    const Q: P = [pts[j * 2], pts[j * 2 + 1]];
    const L = Math.hypot(P[0] - Q[0], P[1] - Q[1]);
    if (L > 1e-6) return { id, hlid, P, d: [(P[0] - Q[0]) / L, (P[1] - Q[1]) / L], butur: L, t };
  }
  return null;
}

/** Fjarlægð punkts frá brotalínu. */
function fjarlaegdFraLinu(X: P, pts: number[]): number {
  let best = Infinity;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? Math.max(0, Math.min(1, ((X[0] - ax) * dx + (X[1] - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(X[0] - (ax + u * dx), X[1] - (ay + u * dy)));
  }
  return best;
}

export interface TengjaStillingar {
  /** Mesta færsla enda (borðdílar) í horn- og T-tengingu. */
  vik: number;
  /** Mesta bil sem lokast milli samlínu enda (hurðargat lokast aðeins ef notandinn vill það — tveir valdir). */
  vikSamlina: number;
}

/** Sjálfgefin vikmörk Tengja: 1,2 m (3 m þegar nákvæmlega tveir veggir eru valdir — þá á að tengja ÞÁ).
 * Samlínubil lokast aðeins upp að 0,3 m nema tveir séu valdir, svo hurðargöt lokist ekki í stóru vali. */
export function tengjaVikmork(fjoldiValinna: number, dilarAMetra: number | null, thykktir: number[]): TengjaStillingar {
  const t = thykktir.length ? thykktir.slice().sort((a, b) => a - b)[thykktir.length >> 1] : 8;
  const m = dilarAMetra && dilarAMetra > 0 ? dilarAMetra : Math.max(10, t * 10); // ~10 cm veggur ef kvarði er óþekktur
  const tveir = fjoldiValinna === 2;
  return { vik: (tveir ? 3 : 1.2) * m, vikSamlina: (tveir ? 3 : 0.3) * m };
}

export interface TengjaNidurstada {
  /** Nýir punktar (afstæðir við x/y hlutarins) þeirra veggja sem breyttust. */
  punktar: Map<string, number[]>;
  /** Fjöldi tenginga (horn, T eða samlína). */
  fjoldi: number;
}

/** Lætur lausa enda valinna veggja mætast: tveir endar í horn (framlengt eða klippt að skurðpunkti), endi að hlið
 * annars veggjar (T), eða samlínu endar saman. Minnsta færsla fyrst; hver endi færist mest einu sinni. Endar sem
 * þegar liggja á öðrum vegg eru ekki lausir og haldast. Óvaldir veggir hreyfast aldrei. */
export function tengjaVeggi(valdir: LineObject[], allir: LineObject[], st: TengjaStillingar): TengjaNidurstada {
  const valdirIds = new Set(valdir.map((o) => o.id));
  const pts = new Map<string, number[]>();
  for (const o of valdir) pts.set(o.id, heimsPunktar(o));
  const adrir = allir.filter((o) => !valdirIds.has(o.id)).map((o) => ({ id: o.id, pts: heimsPunktar(o), t: o.strokeWidth }));
  const allarLinur = [...valdir.map((o) => ({ id: o.id, pts: pts.get(o.id)!, t: o.strokeWidth })), ...adrir];

  const lausir: Endi[] = [];
  for (const o of valdir) {
    for (const hlid of [0, 1] as const) {
      const e = endiAf(o.id, pts.get(o.id)!, hlid, o.strokeWidth);
      if (!e) continue;
      const fastur = allarLinur.some((l) => l.id !== o.id && fjarlaegdFraLinu(e.P, l.pts) <= Math.max(1, l.t / 2, e.t / 2) * 0.6);
      if (!fastur) lausir.push(e);
    }
  }

  type Kostur = { kostn: number; endar: Endi[]; X: P[] };
  const HALLI = 0.26; // ~15°: minna er samsíða
  const notad = new Set<string>();
  const lykill = (e: Endi) => e.id + ":" + e.hlid;
  // Klipping (endi færður INN á vegginn sinn) er takmörkuð: yfirskot í horni er stutt — annars klippti horn-tenging
  // hálfan þvervegg þegar T var meint.
  const klippMest = (e: Endi) => Math.min(e.butur * 0.9, Math.max(2 * e.t, 0.25 * st.vik));
  let fjoldi = 0;
  const beita = (kostir: Kostur[]) => {
    kostir.sort((p, q) => p.kostn - q.kostn);
    for (const k of kostir) {
      if (k.endar.some((e) => notad.has(lykill(e)))) continue;
      k.endar.forEach((e, i) => {
        const p = pts.get(e.id)!;
        const n = p.length;
        if (e.hlid === 0) {
          p[0] = k.X[i][0];
          p[1] = k.X[i][1];
        } else {
          p[n - 2] = k.X[i][0];
          p[n - 1] = k.X[i][1];
        }
        notad.add(lykill(e));
      });
      fjoldi++;
    }
  };

  // 1) tveir lausir endar valinna veggja: horn (framlengt eða klippt að skurðpunkti) eða samlína. Fyrst — tveir lausir
  //    endar nálægt hvor öðrum eru horn, ekki T.
  const por: Kostur[] = [];
  for (let i = 0; i < lausir.length; i++) {
    for (let j = i + 1; j < lausir.length; j++) {
      const A = lausir[i], B = lausir[j];
      if (A.id === B.id) continue;
      const k = kross(A.d, B.d);
      if (Math.abs(k) > HALLI) {
        const w: P = [B.P[0] - A.P[0], B.P[1] - A.P[1]];
        const sA = kross(w, B.d) / k;
        const X: P = [A.P[0] + A.d[0] * sA, A.P[1] + A.d[1] * sA];
        const sB = punkt([X[0] - B.P[0], X[1] - B.P[1]], B.d);
        if (sA < -klippMest(A) || sB < -klippMest(B)) continue;
        if (Math.max(sA, sB) > st.vik) continue;
        por.push({ kostn: Math.abs(sA) + Math.abs(sB), endar: [A, B], X: [X, X] });
      } else if (punkt(A.d, B.d) < -0.9) {
        // samsíða og snúa hvor að öðrum: á sömu línu (innan þykktar) → endarnir mætast á miðjunni
        const w: P = [B.P[0] - A.P[0], B.P[1] - A.P[1]];
        const thvert = Math.abs(kross(w, A.d)), eftir = punkt(w, A.d);
        const bil = Math.hypot(w[0], w[1]);
        if (thvert > Math.max(A.t, B.t) * 1.5 + 1 || eftir < -Math.min(A.butur, B.butur) * 0.5 || bil > st.vikSamlina) continue;
        const M: P = [(A.P[0] + B.P[0]) / 2, (A.P[1] + B.P[1]) / 2];
        por.push({ kostn: bil, endar: [A, B], X: [M, M] });
      }
    }
  }
  beita(por);

  // 2) endar sem enn eru lausir festast á hlið annars veggjar (valins eða óvalins): T — aðeins endinn færist.
  //    Reiknað á NÝJU stöðunni eftir hornin.
  const T: Kostur[] = [];
  for (const gamall of lausir) {
    if (notad.has(lykill(gamall))) continue;
    const A = endiAf(gamall.id, pts.get(gamall.id)!, gamall.hlid, gamall.t);
    if (!A) continue;
    for (const l of allarLinur) {
      if (l.id === A.id) continue;
      for (let i = 2; i < l.pts.length; i += 2) {
        const a: P = [l.pts[i - 2], l.pts[i - 1]], b: P = [l.pts[i], l.pts[i + 1]];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) continue;
        const e: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
        const k = kross(A.d, e);
        if (Math.abs(k) < HALLI) continue;
        const w: P = [a[0] - A.P[0], a[1] - A.P[1]];
        const sA = kross(w, e) / k;
        const X: P = [A.P[0] + A.d[0] * sA, A.P[1] + A.d[1] * sA];
        const u = punkt([X[0] - a[0], X[1] - a[1]], e);
        if (u < -l.t / 2 || u > L + l.t / 2) continue;
        if (sA < -klippMest(A) || sA > st.vik) continue;
        T.push({ kostn: Math.abs(sA), endar: [A], X: [X] });
      }
    }
  }
  beita(T);

  const punktar = new Map<string, number[]>();
  for (const o of valdir) {
    const p = pts.get(o.id)!;
    const ny = p.map((v, i) => v - (i % 2 === 0 ? o.x : o.y));
    if (ny.some((v, i) => Math.abs(v - o.points[i]) > 1e-9)) punktar.set(o.id, ny);
  }
  return { punktar, fjoldi };
}
