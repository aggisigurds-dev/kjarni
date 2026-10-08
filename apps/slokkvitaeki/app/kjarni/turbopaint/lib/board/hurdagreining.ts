// HURÐIR ÚR BILUM Í VEGGJUM (sjálfvirka verkferlið, Agnar 08.10.2026: „til aðstoðar við að merkja inn veggi og hurðir").
// Hrein föll: hreinsaðir veggir inn, hurðarlínur (tegund „hurd") út — sama snið og hurðirnar sem Agnar teiknar í
// TurboPaint: lína yfir gatið, endarnir við veggina hvoru megin (mælt á leiðréttingum hans: 160 af 166 hurðarendum liggja
// við vegg, engin hurð ofan á vegg).
//
//   a) bil milli tveggja samlínu veggbúta: [minM, maxM] = hurð; [bogiMinM, bogiMaxM] = hurð aðeins ef BOGI (hurðarblað)
//      sést á teikningunni (tvöfaldar hurðir, mjóar hurðir); > bilahurdM í ÚTVEGG = bílahurð (Teikning teiknar op > 2,4 m
//      sem flekahurð). Lengra en bilahurdMaxM = op, ekki hurð.
//   b) laus veggendi sem horfir beint á þvervegg í [minM, maxM] fjarlægð = hurð við horn.
// Bannað: hurð á SKÁVEGG (aðeins 0° / 90°), hurð í KROSSI (annar veggur gengur inn í gatið), hurð þar sem gler eða hurð er
// þegar, og hurð þar sem línur liggja þvert yfir gatið eftir veggnum (gluggi — `linaIBili`): slíkt gat verður GLER
// (glerMinM–glerMaxM) ef ekkert gler er þar fyrir.

import { asStefna, fjarlaegdFraLinu, iButa, SJALFGEFIN_VIKMORK, type HLina, type Vikmork } from "./veggja-hreinsun";

type P = [number, number];

export interface Hurd {
  p: [number, number, number, number];
  t: number;
  tegund: "hurd";
  /** Op > bilahurdM í útvegg. */
  bilahurd?: boolean;
  /** Bogi (hurðarblað) sást á teikningunni við gatið. */
  bogi?: boolean;
  /** a = bil milli samlínu búta, b = laus endi að þvervegg. */
  gerd: "a" | "b";
}

/** Gler í bili þar sem línur liggja þvert yfir gatið (gluggi sem greiningin náði ekki sem gler). */
export interface GlerUrBili {
  p: [number, number, number, number];
  t: number;
  tegund: "gler";
}

export interface HurdaStillingar {
  vik?: Vikmork["hurd"];
  /** Sést bogi (hurðarblað) við gatið A–B? (myndprófun í vafranum; vantar = enginn bogi þekktur) */
  bogi?: (A: P, B: P, t: number) => boolean;
  /** Liggja línur eftir veggnum þvert yfir gatið (gluggi)? (myndprófun; vantar = nei) */
  linaIBili?: (A: P, B: P, t: number) => boolean;
}

/** Eitt gat sem var skoðað — allar prófanir skráðar (mælingar: hvaða regla hefði gefið hvað). */
export interface HurdKandidat {
  p: [number, number, number, number];
  t: number;
  /** Breidd gatsins í metrum. */
  gm: number;
  gerd: "a" | "b";
  /** Enginn kross, ekkert gler / hurð þegar í gatinu. */
  laust: boolean;
  bogi: boolean;
  lina: boolean;
  utveggur: boolean;
  nidurstada: "hurd" | "bilahurd" | "gler" | null;
}

export interface HurdaNidurstada {
  hurdir: Hurd[];
  gler: GlerUrBili[];
  kandidatar: HurdKandidat[];
  talning: { a: number; b: number; bilahurdir: number; medBoga: number; gler: number; hafnad: { skavegg: number; kross: number; gluggi: number; fyrir: number } };
}

type Butur = { p: number[]; t: number; tegund: string; ax: 0 | 1 | -1 };

/** Er bein lína frá X í stefnu d laus við allar línur út fyrir kassann (útveggur á þeirri hlið)? */
function sleppurUt(X: P, d: P, linur: Butur[], kassi: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const lengd = Math.hypot(kassi.x1 - kassi.x0, kassi.y1 - kassi.y0) + 1;
  const B: P = [X[0] + d[0] * lengd, X[1] + d[1] * lengd];
  for (const l of linur) {
    const a: P = [l.p[0], l.p[1]], b: P = [l.p[2], l.p[3]];
    const den = (b[1] - a[1]) * (B[0] - X[0]) - (b[0] - a[0]) * (B[1] - X[1]);
    if (Math.abs(den) < 1e-12) continue;
    const ua = ((b[0] - a[0]) * (X[1] - a[1]) - (b[1] - a[1]) * (X[0] - a[0])) / den;
    const ub = ((B[0] - X[0]) * (X[1] - a[1]) - (B[1] - X[1]) * (X[0] - a[0])) / den;
    if (ua > 1e-6 && ua <= 1 && ub >= -1e-6 && ub <= 1 + 1e-6) return false;
  }
  return true;
}

/** Hurðir í bilum veggjanna. `veggir` = hreinsaðir veggir (og fastir veggir Agnars); `adrar` = gler og hurðir sem fyrir
 * eru (gatið er þá upptekið). Einingar = `dpm` á metra. */
export function finnaHurdir(veggir: HLina[], adrar: HLina[], dpm: number, st: HurdaStillingar = {}): HurdaNidurstada {
  const v = st.vik ?? SJALFGEFIN_VIKMORK.hurd;
  const m = (x: number) => x * dpm;
  const hafnad = { skavegg: 0, kross: 0, gluggi: 0, fyrir: 0 };
  const butar: Butur[] = iButa(veggir)
    .filter((b) => (b.tegund ?? "veggur") === "veggur" || b.tegund === "ei60" || b.tegund === "ei30")
    .map((b) => ({ p: b.p, t: b.t, tegund: b.tegund ?? "veggur", ax: asStefna(b.p, 1.5) }));
  const upptekid: Butur[] = iButa(adrar).map((b) => ({ p: b.p, t: b.t, tegund: b.tegund ?? "veggur", ax: asStefna(b.p, 3) }));
  const allar = [...butar, ...upptekid];
  let kassi = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const b of allar) {
    kassi = { x0: Math.min(kassi.x0, b.p[0], b.p[2]), y0: Math.min(kassi.y0, b.p[1], b.p[3]), x1: Math.max(kassi.x1, b.p[0], b.p[2]), y1: Math.max(kassi.y1, b.p[1], b.p[3]) };
  }
  const hurdir: Hurd[] = [];
  const gler: GlerUrBili[] = [];
  const kandidatar: HurdKandidat[] = [];
  const talning = { a: 0, b: 0, bilahurdir: 0, medBoga: 0, gler: 0, hafnad };

  /** Gatið A–B (á ás `ax`, þykkt t): er það laust (enginn kross, ekkert gler/hurð, enginn gluggi)? */
  const laust = (A: P, B: P, t: number, undan: Set<Butur>): boolean => {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-6) return false;
    const d: P = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    // Innri hluti gatsins: veggur sem mætir línunni VIÐ karminn (T við hlið hurðar) er ekki kross — aðeins það sem gengur
    // inn í miðju gatsins (15–85 %).
    const inn = L * 0.15;
    const A2: P = [A[0] + d[0] * inn, A[1] + d[1] * inn], B2: P = [B[0] - d[0] * inn, B[1] - d[1] * inn];
    // gler / hurð þegar í gatinu
    for (const o of upptekid) {
      const mx = (o.p[0] + o.p[2]) / 2, my = (o.p[1] + o.p[3]) / 2;
      const ol = Math.hypot(o.p[2] - o.p[0], o.p[3] - o.p[1]) || 1;
      const samsida = Math.abs((o.p[2] - o.p[0]) * d[1] - (o.p[3] - o.p[1]) * d[0]) / ol < 0.2;
      if (samsida && fjarlaegdFraLinu(mx, my, [A[0], A[1], B[0], B[1]]) <= t / 2 + o.t / 2 + m(0.1)) {
        hafnad.fyrir++;
        return false;
      }
    }
    // kross: annar veggur sker gatið eða endar inni í því
    for (const o of butar) {
      if (undan.has(o)) continue;
      const a: P = [o.p[0], o.p[1]], b: P = [o.p[2], o.p[3]];
      const den = (b[1] - a[1]) * (B2[0] - A2[0]) - (b[0] - a[0]) * (B2[1] - A2[1]);
      if (Math.abs(den) > 1e-12) {
        const ua = ((b[0] - a[0]) * (A2[1] - a[1]) - (b[1] - a[1]) * (A2[0] - a[0])) / den;
        const ub = ((B2[0] - A2[0]) * (A2[1] - a[1]) - (B2[1] - A2[1]) * (A2[0] - a[0])) / den;
        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
          hafnad.kross++;
          return false;
        }
      }
      for (const E of [a, b]) {
        const s = (E[0] - A[0]) * d[0] + (E[1] - A[1]) * d[1];
        if (s < inn || s > L - inn) continue;
        if (fjarlaegdFraLinu(E[0], E[1], [A2[0], A2[1], B2[0], B2[1]]) <= (t + o.t) / 2 + m(0.03)) {
          hafnad.kross++;
          return false;
        }
      }
    }
    return true;
  };

  /** Er gatið í útvegg: bein lína þvert á það sleppur út fyrir húsið á annarri hliðinni. */
  const utveggur = (A: P, B: P): boolean => {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    const n: P = [-(B[1] - A[1]) / L, (B[0] - A[0]) / L];
    const M: P = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    return sleppurUt(M, n, allar, kassi) || sleppurUt(M, [-n[0], -n[1]], allar, kassi);
  };

  const baeta = (A: P, B: P, t: number, gerd: "a" | "b", undan: Set<Butur>) => {
    const g = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const gm = g / dpm;
    if (gm < Math.min(v.bogiMinM, v.glerMinM) || gm > Math.max(v.bilahurdMaxM, v.glerMaxM)) return;
    if (gerd === "b" && (gm < v.bogiMinM || gm > v.bogiMaxM)) return;
    const M: P = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    // ekki tvisvar sama gatið (a og b geta fundið það bæði)
    if (kandidatar.some((k) => fjarlaegdFraLinu(M[0], M[1], k.p) <= t + m(0.05))) return;
    const k: HurdKandidat = {
      p: [A[0], A[1], B[0], B[1]],
      t,
      gm: Math.round(gm * 100) / 100,
      gerd,
      laust: laust(A, B, t, undan),
      bogi: !!st.bogi?.(A, B, t),
      lina: !!st.linaIBili?.(A, B, t),
      utveggur: gerd === "a" && gm > v.maxM ? utveggur(A, B) : false,
      nidurstada: null,
    };
    k.nidurstada = hurdaRegla(k, v);
    kandidatar.push(k);
    if (k.nidurstada === "gler") {
      gler.push({ p: k.p, t: Math.max(1, t * 0.6), tegund: "gler" });
      talning.gler++;
      return;
    }
    if (k.lina && k.laust) hafnad.gluggi++;
    if (!k.nidurstada) return;
    const h: Hurd = { p: k.p, t, tegund: "hurd", gerd };
    if (k.nidurstada === "bilahurd") h.bilahurd = true;
    if (k.bogi) h.bogi = true;
    hurdir.push(h);
    talning[gerd]++;
    if (h.bilahurd) talning.bilahurdir++;
    if (h.bogi) talning.medBoga++;
  };

  // a) bil milli samlínu búta (aðeins lárétt / lóðrétt)
  for (const ax of [0, 1] as const) {
    const listi = butar
      .filter((b) => b.ax === ax)
      .map((b) => {
        const rho = ax === 0 ? (b.p[1] + b.p[3]) / 2 : (b.p[0] + b.p[2]) / 2;
        const a = ax === 0 ? b.p[0] : b.p[1], e = ax === 0 ? b.p[2] : b.p[3];
        return { b, rho, t0: Math.min(a, e), t1: Math.max(a, e) };
      })
      .sort((p, q) => p.rho - q.rho);
    for (let i = 0; i < listi.length; ) {
      let j = i + 1;
      while (j < listi.length && listi[j].rho - listi[j - 1].rho <= Math.max(m(0.06), Math.min(listi[j].b.t, listi[j - 1].b.t) / 2)) j++;
      const rod = listi.slice(i, j).sort((p, q) => p.t0 - q.t0);
      i = j;
      let fyrri = rod[0];
      for (let k = 1; k < rod.length; k++) {
        const nu = rod[k];
        const g = nu.t0 - fyrri.t1;
        if (g > 1e-6) {
          const rho = (fyrri.rho + nu.rho) / 2, t = Math.max(fyrri.b.t, nu.b.t);
          const A: P = ax === 0 ? [fyrri.t1, rho] : [rho, fyrri.t1];
          const B: P = ax === 0 ? [nu.t0, rho] : [rho, nu.t0];
          baeta(A, B, t, "a", new Set([fyrri.b, nu.b]));
        }
        if (nu.t1 > fyrri.t1) fyrri = nu;
      }
    }
  }
  // skáveggir: talið hvað var ekki skoðað
  hafnad.skavegg = butar.filter((b) => b.ax === -1).length;

  // b) laus endi → þverveggur beint fram undan
  for (const b of butar) {
    if (b.ax === -1) continue;
    for (const e of [0, 1] as const) {
      const X: P = e ? [b.p[2], b.p[3]] : [b.p[0], b.p[1]];
      const Y: P = e ? [b.p[0], b.p[1]] : [b.p[2], b.p[3]];
      const L = Math.hypot(X[0] - Y[0], X[1] - Y[1]) || 1;
      const d: P = [(X[0] - Y[0]) / L, (X[1] - Y[1]) / L];
      // endinn laus? (snertir enga aðra línu)
      if (allar.some((o) => o !== b && fjarlaegdFraLinu(X[0], X[1], o.p) <= (o.t + b.t) / 2 + m(0.03))) continue;
      let naest = Infinity, hitt: Butur | null = null;
      for (const o of butar) {
        if (o === b || o.ax === -1 || o.ax === b.ax) continue;
        const ox = o.p[2] - o.p[0], oy = o.p[3] - o.p[1];
        const den = d[0] * oy - d[1] * ox;
        if (Math.abs(den) < 1e-9) continue;
        const s = ((o.p[0] - X[0]) * oy - (o.p[1] - X[1]) * ox) / den;
        const u = ((o.p[0] - X[0]) * d[1] - (o.p[1] - X[1]) * d[0]) / den;
        if (s > 0 && s < naest && u >= -0.02 && u <= 1.02) {
          naest = s;
          hitt = o;
        }
      }
      if (!hitt) continue;
      // gatið nær að yfirborði þverveggjarins
      const g = naest - hitt.t / 2;
      if (g < m(v.bogiMinM) || g > m(v.bogiMaxM)) continue;
      const B: P = [X[0] + d[0] * g, X[1] + d[1] * g];
      baeta(X, B, b.t, "b", new Set([b, hitt]));
    }
  }
  return { hurdir, gler, kandidatar, talning };
}

/** Úrskurður um eitt gat — hreinar reglur (sjá haus skrárinnar), svo þær séu prófanlegar og mælanlegar sér. */
export function hurdaRegla(k: Pick<HurdKandidat, "gm" | "gerd" | "laust" | "bogi" | "lina" | "utveggur">, v: Vikmork["hurd"]): HurdKandidat["nidurstada"] {
  // Mælt 08.10.2026 á 137 götum fjögurra hæða á móti leiðréttingum Agnars (hurdir_greining.py):
  //   a 0,7–1,3 m laust: 34 hurðir af 37 (línur yfir gatið án boga = ekki hurð: 0 af 3)
  //   b (laus endi) MEÐ boga: 15 af 15 — ÁN boga: 2 af 8 → b krefst boga
  //   a 1,3–2,4 m: 2 hurðir af 10 (líka með boga) → ekki hurð
  //   a > 2,4 m í útvegg: 6 af 6 bílahurðir — þær eru teiknaðar MEÐ línu yfir gatið (flekahurð), svo línan bannar ekki
  //   gler úr gati með línum: 1 gler af 13 (6 voru bílahurðir) → sjálfgefið af
  if (!k.laust) return null;
  const bil = (a: number, b: number) => k.gm >= a && k.gm <= b;
  if (k.gerd === "b") return bil(v.minM, v.maxM) && (k.bogi || !v.bKrefstBoga) && (!k.lina || k.bogi) ? "hurd" : null;
  if (k.gm > v.bilahurdM && k.gm <= v.bilahurdMaxM) return k.utveggur ? "bilahurd" : null;
  // Línur þvert yfir gatið án boga: gluggi — gler ef það er stillt svo, annars ekkert.
  if (k.lina && !k.bogi) return v.glerUrBili && bil(v.glerMinM, v.glerMaxM) ? "gler" : null;
  if (bil(v.minM, v.maxM)) return "hurd";
  if (bil(v.bogiMinM, v.bogiMaxM) && k.bogi) return "hurd";
  return null;
}
