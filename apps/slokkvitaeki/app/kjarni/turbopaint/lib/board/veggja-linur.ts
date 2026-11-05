// Línur teikningarinnar undir veggjunum (Agnar 10.10.2026, Berjavellir 6: „veggjaleitarvélin er frekar slæm núna og
// koma leiðinlega þykkir út" — grænir veggir lentu á síldarbeinsparketi, húsgögnum og eldhúsbekkjum, og þykktin óx þar
// sem mynstrið liggur að vegg).
//
// Hreint og prófanlegt (engin DOM): sama mæling þjónar tveimur leiðum —
//   • síun greiningar (skonnun-veggir.ts): hver greindur veggur er mældur í myndinni — raunverulegur veggur er tvær
//     samfelldar samsíða línur (holur) eða samfelld fylling, ≤ 35 cm. Breiðari „veggur" klippist í kjarnann (línurnar);
//     engin samfelld lína = ekki veggur (skástrik, letur); ein mjó lína = húsgagn / bekkur / málsetning. Svæði með
//     reglulegu mynstri (parket, flísar) eru hunsuð, og litlir lokaðir klasar stuttra „veggja" (borð, stólar) felldir.
//   • „Smella á línu" í veggjaritlinum: dreginn veggur festist á línur teikningarinnar undir og fær þykktina úr bilinu
//     milli tveggja samsíða lína ef hún er 10–35 cm.
//
// Hnit: dílar grátónamyndarinnar (`gra`, W × H, 0 = svart). `dpm` = dílar myndarinnar á metra.

export type Pt = [number, number];

/** Dökkt blek (sama mörk og hreinsun skönnunar, skonnun-veggir.ts hreinsaGogn). */
export const BLEK = 185;
/** Þykktarþak greindra veggja (cm): breiðara er mynstur sem rann saman við vegg — klippt í kjarnann eða hafnað. */
export const VEGGUR_HAMARK_CM = 35;
/** Minnsta þykkt sem „Smella á línu" tekur úr bili tveggja lína (cm). */
export const SMELLA_LAGMARK_CM = 10;

const dokkur = (gra: Uint8Array, W: number, H: number, x: number, y: number) => {
  const ix = Math.round(x), iy = Math.round(y);
  return ix >= 0 && iy >= 0 && ix < W && iy < H && gra[iy * W + ix] < BLEK;
};

export interface LinuSnid {
  /** Hliðrun hvers sýnis hornrétt á línuna (dílar; + = vinstri normall AB). */
  hlidrun: number[];
  /** Hlutfall lengdarinnar sem SAMFELLDAR dökkar rendur (≥ `renna` dílar) þekja — lína ≈ 1, skástrik / letur ≈ 0. */
  samfella: number[];
  lengd: number;
}

/** Þversnið samfellu meðfram AB: fyrir hverja hliðrun −breidd…+breidd (skref 0,5 díll) hve mikið af lengdinni er samfelld
 * dökk lína. Endarnir (horn, T-mót) eru ekki taldir. */
export function linuSnid(
  gra: Uint8Array,
  W: number,
  H: number,
  A: Pt,
  B: Pt,
  breidd: number,
  o: { renna?: number; bil?: number; skref?: number } = {}
): LinuSnid {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
  const hlidrun: number[] = [], samfella: number[] = [];
  if (L < 2) return { hlidrun, samfella, lengd: L };
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const endar = Math.min(3, L * 0.08);
  const s0 = endar, s1 = L - endar, n = Math.max(1, Math.floor(s1 - s0));
  const renna = Math.max(2, Math.min(o.renna ?? 8, n * 0.4)), bil = o.bil ?? 1;
  const skref = o.skref ?? 0.5;
  for (let h = -breidd; h <= breidd + 1e-9; h += skref) {
    let thakid = 0, rennaLengd = 0, ljos = 0;
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      if (dokkur(gra, W, H, A[0] + ux * s + nx * h, A[1] + uy * s + ny * h)) {
        rennaLengd += 1 + ljos;
        ljos = 0;
      } else if (rennaLengd > 0 && ljos < bil) ljos++;
      else {
        if (rennaLengd >= renna) thakid += rennaLengd;
        rennaLengd = 0;
        ljos = 0;
      }
    }
    if (rennaLengd >= renna) thakid += rennaLengd;
    hlidrun.push(h);
    samfella.push(Math.min(1, thakid / (n + 1)));
  }
  return { hlidrun, samfella, lengd: L };
}

/** Halli greinds veggjar leiðréttur að línunum undir (skönnun skekkist, greiningin hallar bútum um 1–7°): snúið um miðjuna
 * um ±`D` díla á endunum og sá halli valinn sem gefur skörpustu samfelldu línuna. */
export function rettaHalla(gra: Uint8Array, W: number, H: number, A: Pt, B: Pt, breidd: number, D: number): { A: Pt; B: Pt; snid: LinuSnid } {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 4 || D < 1) return { A, B, snid: linuSnid(gra, W, H, A, B, breidd) };
  const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
  let best = 0, bestGildi = -1;
  for (let d = -Math.round(D); d <= Math.round(D); d++) {
    const a: Pt = [A[0] - (nx * d) / 2, A[1] - (ny * d) / 2], b: Pt = [B[0] + (nx * d) / 2, B[1] + (ny * d) / 2];
    const s = linuSnid(gra, W, H, a, b, breidd + Math.abs(d) / 2, { skref: 1 });
    // summa tveggja sterkustu (holur veggur = tvær línur) — skarpasti hallinn vinnur, jafntefli → minnsta snúningi
    const r = [...s.samfella].sort((x, y) => y - x);
    const g = (r[0] ?? 0) + (r[1] ?? 0) * 0.5 - Math.abs(d) * 1e-3;
    if (g > bestGildi) {
      bestGildi = g;
      best = d;
    }
  }
  const a: Pt = [A[0] - (nx * best) / 2, A[1] - (ny * best) / 2], b: Pt = [B[0] + (nx * best) / 2, B[1] + (ny * best) / 2];
  return { A: a, B: b, snid: linuSnid(gra, W, H, a, b, breidd) };
}

export type KjarnaGerd = "holur" | "fylltur" | "stok";

export interface VeggKjarni {
  /** Hliðrun miðlínu kjarnans frá AB (dílar). */
  midja: number;
  /** Ytri þykkt kjarnans (dílar) — fyrir „stök" lína: breidd línunnar. */
  thykkt: number;
  gerd: KjarnaGerd;
}

/** Kjarni veggjar úr þversniði: samfelldu línurnar (samfella ≥ `mork`) — tvær samsíða innan `hamark` = holur veggur
 * (þykkt = ytri brúnir), ein breið rönd ≥ `lagmark` = fylltur, annars ein mjó lína („stök"). Valinn er breiðasti kjarninn
 * ≤ hamark sem nær yfir upphaflegu miðlínuna (hliðrun 0); annars sá næsti henni. null = engin samfelld lína. */
export function veggKjarni(s: LinuSnid, st: { hamark: number; lagmark: number; mork?: number; midja?: number }): VeggKjarni | null {
  const mork = st.mork ?? 0.45, m0 = st.midja ?? 0;
  // samfelldar rendur yfir mörkunum → línubil [lo, hi]
  const linur: [number, number][] = [];
  for (let i = 0; i < s.hlidrun.length; i++) {
    if (s.samfella[i] < mork) continue;
    const h = s.hlidrun[i];
    const sid = linur[linur.length - 1];
    if (sid && h - sid[1] <= 0.51) sid[1] = h;
    else linur.push([h, h]);
  }
  if (!linur.length) return null;
  type K = { lo: number; hi: number; gerd: KjarnaGerd };
  const kostir: K[] = [];
  for (let i = 0; i < linur.length; i++) {
    const [lo, hi] = linur[i];
    kostir.push({ lo, hi, gerd: hi - lo + 1 >= st.lagmark ? "fylltur" : "stok" });
    for (let j = i + 1; j < linur.length; j++) {
      const w = linur[j][1] - lo + 1;
      if (w > st.hamark) break;
      kostir.push({ lo, hi: linur[j][1], gerd: "holur" });
    }
  }
  const gildir = kostir.filter((k) => k.hi - k.lo + 1 <= st.hamark);
  if (!gildir.length) {
    // ein breið rönd yfir þakinu (mynstur rann saman við vegg): miðjan á þakinu
    const k = kostir.reduce((a, b) => (Math.abs((a.lo + a.hi) / 2 - m0) <= Math.abs((b.lo + b.hi) / 2 - m0) ? a : b));
    return { midja: (k.lo + k.hi) / 2, thykkt: st.hamark, gerd: "fylltur" };
  }
  // ein lína sem er hluti af holum vegg er ekki sjálfstæður veggur
  const holir = gildir.filter((k) => k.gerd === "holur");
  const veggir = gildir.filter((k) => k.gerd === "holur" || (k.gerd === "fylltur" && !holir.some((h) => h.lo <= k.lo && h.hi >= k.hi)));
  const urval = veggir.length ? veggir : gildir;
  const breidd = (k: K) => k.hi - k.lo;
  const nerMidju = urval.filter((k) => k.lo - 1 <= m0 && k.hi + 1 >= m0);
  let k: K;
  if (nerMidju.length) k = nerMidju.reduce((a, b) => (breidd(b) > breidd(a) ? b : a));
  else {
    // næsti kjarninn — og breiðasti kjarninn sem skarast við hann (ytri brúnir veggjar, ekki innri lína)
    const n = urval.reduce((a, b) => (Math.abs((a.lo + a.hi) / 2 - m0) <= Math.abs((b.lo + b.hi) / 2 - m0) ? a : b));
    k = urval.filter((b) => b.lo <= n.hi && b.hi >= n.lo).reduce((a, b) => (breidd(b) > breidd(a) ? b : a), n);
  }
  return { midja: (k.lo + k.hi) / 2, thykkt: k.hi - k.lo + 1, gerd: k.gerd };
}

// ── mynstur: parket / flísar ─────────────────────────────────────────────────────────────────────────────────

function summa(b: Uint8Array, W: number, H: number): Int32Array {
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
const kassaSumma = (S: Int32Array, W: number, H: number, x: number, y: number, r: number) => {
  const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1), W1 = W + 1;
  return S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0];
};
function kassi(b: Uint8Array, W: number, H: number, r: number, fullt: boolean): Uint8Array {
  const S = summa(b, W, H), ut = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = kassaSumma(S, W, H, x, y, r);
      const fl = (Math.min(W, x + r + 1) - Math.max(0, x - r)) * (Math.min(H, y + r + 1) - Math.max(0, y - r));
      ut[y * W + x] = fullt ? (s === fl ? 1 : 0) : s > 0 ? 1 : 0;
    }
  return ut;
}

export interface MynsturStillingar {
  /** Hálf breidd gluggans sem mynstrið er metið í (dílar). */
  r?: number;
  /** Lágmarksþéttleiki skipta ljóst↔dökkt í BÁÐAR áttir (á díl) — beinar línur skipta aðeins í aðra áttina. */
  thettleiki?: number;
  /** Hálf breidd opnunarinnar: mynstursvæði þarf að vera ≥ 2R+1 dílar á alla vegu (veggur með skástrikun er mjórri). */
  R?: number;
}

/** Gríma reglulegs mynsturs (parket, flísar, skástrikuð gólf): skiptin ljóst↔dökkt eru þétt BÆÐI lárétt og lóðrétt (stuttar
 * skálínur með jöfnu bili). Línur veggja skipta aðeins í aðra áttina; letur og tákn eru of lítil og hverfa í opnuninni,
 * og skástrikaður steyptur veggur (≤ 35 cm) er mjórri en opnunin. */
export function mynsturGrima(gra: Uint8Array, W: number, H: number, dpm: number, o: MynsturStillingar = {}): Uint8Array {
  const r = o.r ?? Math.max(2, Math.round(0.1 * dpm));
  const R = o.R ?? Math.max(3, Math.round(0.22 * dpm));
  const thett = o.thettleiki ?? 0.16;
  const blek = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) blek[i] = gra[i] < BLEK ? 1 : 0;
  const th = new Uint8Array(W * H), tv = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x + 1 < W && blek[i] !== blek[i + 1]) th[i] = 1;
      if (y + 1 < H && blek[i] !== blek[i + W]) tv[i] = 1;
    }
  const Sh = summa(th, W, H), Sv = summa(tv, W, H);
  const tex = new Uint8Array(W * H), fl = (2 * r + 1) * (2 * r + 1), mork = thett * fl;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (Math.min(kassaSumma(Sh, W, H, x, y, r), kassaSumma(Sv, W, H, x, y, r)) >= mork) tex[y * W + x] = 1;
    }
  return kassi(kassi(tex, W, H, R, true), W, H, R, false);
}

// ── síun greindra veggja ─────────────────────────────────────────────────────────────────────────────────────

/** Greindur veggur: [ax, ay, bx, by, þykkt] í dílum myndarinnar. */
export type Veggur5 = number[];

export interface SiaTalning {
  /** Á reglulegu mynstri (parket / flísar). */
  mynstur: number;
  /** Engin samfelld lína undir (skástrik, letur). */
  ekkiLina: number;
  /** Ein mjó lína (húsgagn, bekkur, málsetning). */
  stakLina: number;
  /** Litlir lokaðir klasar stuttra veggja (borð, stólar, hreinlætistæki). */
  smaklasar: number;
  /** Þykkt klippt í kjarnann (var yfir þakinu eða fjarri línunum). */
  klippt: number;
  /** Lentu á sama vegg og lengri bútur. */
  tviteknir: number;
}

export interface SiaStillingar {
  /** Dílar myndarinnar á metra. */
  dpm: number;
  hamarkCm?: number;
  /** Mynstursgríma (reiknuð ef vantar). */
  grima?: Uint8Array | null;
  mynstur?: MynsturStillingar;
  /** Skýring hvers veggjar (mælingar / villuleit). */
  skra?: (v: Veggur5, astaeda: "mynstur" | "ekkiLina" | "stakLina" | "haldid") => void;
}

const lengdV = (v: Veggur5) => Math.hypot(v[2] - v[0], v[3] - v[1]);

/** Liggur (styttri) veggurinn v á vegg u: samsíða (< 6°), miðlínan innan hálfrar þykktar og ≥ 60 % lengdarinnar yfir u. */
function skorast(v: Veggur5, u: Veggur5): boolean {
  const Lu = lengdV(u), Lv = lengdV(v);
  if (Lu < 1 || Lv < 1) return false;
  const ux = (u[2] - u[0]) / Lu, uy = (u[3] - u[1]) / Lu;
  if (Math.abs(ux * (v[3] - v[1]) - uy * (v[2] - v[0])) / Lv > 0.105) return false;
  const mx = (v[0] + v[2]) / 2 - u[0], my = (v[1] + v[3]) / 2 - u[1];
  if (Math.abs(mx * uy - my * ux) > Math.max(u[4] || 0, v[4] || 0) / 2 + 1) return false;
  const t0 = (v[0] - u[0]) * ux + (v[1] - u[1]) * uy, t1 = (v[2] - u[0]) * ux + (v[3] - u[1]) * uy;
  const yfir = Math.min(Lu, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
  return yfir >= 0.6 * Lv;
}

/** Greina veggi betur: hver veggur mældur í myndinni og annaðhvort felldur eða færður á kjarnann (≤ hamark). */
export function siaVeggi(veggir: Veggur5[], gra: Uint8Array, W: number, H: number, st: SiaStillingar): { veggir: Veggur5[]; talning: SiaTalning } {
  const talning: SiaTalning = { mynstur: 0, ekkiLina: 0, stakLina: 0, smaklasar: 0, klippt: 0, tviteknir: 0 };
  const hamark = ((st.hamarkCm ?? VEGGUR_HAMARK_CM) / 100) * st.dpm;
  const lagmark = Math.max(1.5, 0.05 * st.dpm);
  const grima = st.grima ?? mynsturGrima(gra, W, H, st.dpm, st.mynstur);
  const ut: Veggur5[] = [];
  const iGrimu = (A: Pt, B: Pt) => {
    let a = 0;
    for (let q = 0.1; q < 0.95; q += 0.1) {
      const x = Math.round(A[0] + (B[0] - A[0]) * q), y = Math.round(A[1] + (B[1] - A[1]) * q);
      if (x >= 0 && y >= 0 && x < W && y < H && grima[y * W + x]) a++;
    }
    return a >= 5;
  };
  for (const v of veggir) {
    const A0: Pt = [v[0], v[1]], B0: Pt = [v[2], v[3]], L0 = lengdV(v);
    if (L0 < 1) continue;
    // 1) kjarninn: samfelldar línur undir veggnum (hallinn leiðréttur fyrst — greindur bútur hallar oft um nokkra díla)
    const breidd = Math.max(v[4] || 0, hamark) / 2 + 2;
    const { A, B, snid: s } = rettaHalla(gra, W, H, A0, B0, breidd, Math.min(12, L0 * 0.12));
    const k = veggKjarni(s, { hamark, lagmark });
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
    const A1: Pt = k ? [A[0] + nx * k.midja, A[1] + ny * k.midja] : A0, B1: Pt = k ? [B[0] + nx * k.midja, B[1] + ny * k.midja] : B0;
    // 2) mynstur: miðlína kjarnans liggur að mestu á parket- / flísasvæði
    if (iGrimu(A1, B1)) {
      st.skra?.(v, "mynstur");
      talning.mynstur++;
      continue;
    }
    if (!k) {
      st.skra?.(v, "ekkiLina");
      talning.ekkiLina++;
      continue;
    }
    if (k.gerd === "stok") {
      st.skra?.(v, "stakLina");
      talning.stakLina++;
      continue;
    }
    if ((v[4] || 0) > k.thykkt + 1 || Math.abs(k.midja) > 0.75) talning.klippt++;
    st.skra?.(v, "haldid");
    ut.push([A1[0], A1[1], B1[0], B1[1], k.thykkt]);
  }
  // 3) tvítekningar: tveir bútar sem kjarnaðust á sama vegg (t.d. parketbútur sem rann á línu veggjarins)
  const rod = ut.map((v, i) => i).sort((a, b) => lengdV(ut[b]) - lengdV(ut[a]));
  const haldnir: Veggur5[] = [];
  for (const i of rod) {
    const v = ut[i];
    if (haldnir.some((u) => skorast(v, u))) {
      talning.tviteknir++;
      continue;
    }
    haldnir.push(v);
  }
  ut.length = 0;
  ut.push(...haldnir);
  const eftir = fellaSmaklasa(ut, { tengibil: Math.max(2, 0.12 * st.dpm), stuttur: 1.0 * st.dpm, klasi: 1.6 * st.dpm });
  talning.smaklasar = ut.length - eftir.length;
  return { veggir: eftir, talning };
}

/** Litlar lokaðar myndir: klasi tengdra veggja þar sem ALLIR eru stuttir (< `stuttur`) og allur klasinn rúmast innan
 * `klasi` (hornalína umgjarðar) — borð, stólar, bekkir og hreinlætistæki, ekki herbergi (veggir þeirra tengjast restinni). */
export function fellaSmaklasa(veggir: Veggur5[], st: { tengibil: number; stuttur: number; klasi: number }): Veggur5[] {
  const n = veggir.length;
  const foreldri = veggir.map((_, i) => i);
  const rot = (i: number): number => (foreldri[i] === i ? i : (foreldri[i] = rot(foreldri[i])));
  const fjarlaegd = (px: number, py: number, v: Veggur5) => {
    const dx = v[2] - v[0], dy = v[3] - v[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - v[0]) * dx + (py - v[1]) * dy) / L2));
    return Math.hypot(px - v[0] - t * dx, py - v[1] - t * dy);
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = veggir[i], b = veggir[j];
      const tb = st.tengibil + ((a[4] || 0) + (b[4] || 0)) / 2;
      if (
        fjarlaegd(a[0], a[1], b) <= tb ||
        fjarlaegd(a[2], a[3], b) <= tb ||
        fjarlaegd(b[0], b[1], a) <= tb ||
        fjarlaegd(b[2], b[3], a) <= tb
      )
        foreldri[rot(i)] = rot(j);
    }
  const klasar = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = rot(i);
    const k = klasar.get(r);
    if (k) k.push(i);
    else klasar.set(r, [i]);
  }
  const fella = new Set<number>();
  for (const ids of klasar.values()) {
    if (ids.some((i) => lengdV(veggir[i]) >= st.stuttur)) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of ids) {
      const v = veggir[i];
      x0 = Math.min(x0, v[0], v[2]);
      y0 = Math.min(y0, v[1], v[3]);
      x1 = Math.max(x1, v[0], v[2]);
      y1 = Math.max(y1, v[1], v[3]);
    }
    if (Math.hypot(x1 - x0, y1 - y0) <= st.klasi) for (const i of ids) fella.add(i);
  }
  return veggir.filter((_, i) => !fella.has(i));
}

// ── „Smella á línu" ──────────────────────────────────────────────────────────────────────────────────────────

export interface LinuSmellur {
  A: Pt;
  B: Pt;
  /** Þykkt úr bili tveggja samsíða lína (dílar) — null ef bilið er utan 10–35 cm (þá gildir valin þykkt). */
  thykkt: number | null;
  gerd: KjarnaGerd;
}

/** Dreginn veggur AB festist á línur teikningarinnar undir: leitað `radius` dílar til hvorrar hliðar. Tvær samsíða línur
 * með 10–35 cm bili → miðja milli þeirra og þykktin úr bilinu; ein lína / fylling → miðjan á henni, valin þykkt.
 * `fastir` = endar sem eru þegar festir (smellur á annan vegg) og hreyfast ekki. null = engin lína nálægt. */
export function smellaALinu(
  gra: Uint8Array,
  W: number,
  H: number,
  A: Pt,
  B: Pt,
  st: { dpm: number | null; radius: number; fastir?: [boolean, boolean] }
): LinuSmellur | null {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 4) return null;
  const dpm = st.dpm && st.dpm > 0 ? st.dpm : null;
  const hamark = dpm ? (VEGGUR_HAMARK_CM / 100) * dpm : st.radius * 2;
  const lagmark = dpm ? (SMELLA_LAGMARK_CM / 100) * dpm : 3;
  // leitað radíus + þak til hvorrar hliðar: lína innan radíussins finnst ásamt samsíða línu hinum megin veggjarins
  const s = linuSnid(gra, W, H, A, B, st.radius + hamark, { renna: Math.min(8, L * 0.3) });
  const k = veggKjarni(s, { hamark, lagmark: Math.max(1.5, lagmark * 0.5), mork: 0.4 });
  if (!k || Math.abs(k.midja) > st.radius + k.thykkt / 2) return null;
  const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
  const [fA, fB] = st.fastir ?? [false, false];
  const h = fA && fB ? 0 : k.midja;
  const thykkt = k.gerd === "holur" && k.thykkt >= lagmark && k.thykkt <= hamark ? k.thykkt : null;
  return {
    A: fA ? A : [A[0] + nx * h, A[1] + ny * h],
    B: fB ? B : [B[0] + nx * h, B[1] + ny * h],
    thykkt,
    gerd: k.gerd,
  };
}
