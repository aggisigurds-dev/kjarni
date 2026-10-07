// EI-merki → eldveggur á RAUNVERULEGUM vegg (Agnar 07.10.2026, Álfaborg 2. hæð: „brunaveggirnir eru svoldi skrítnir").
//
// Áður rakti EI-greiningin (detect-firewalls traceWall) LÍNU á myndinni frá miðanum í báðar áttir og stoppaði ekki fyrr
// en línan endaði. Ásalínur / hnitalínur blaðsins (strik-punktalínur við ása 2, 4, 5, 6, 7) liggja oft þétt við eða ofan
// á brunaveggjunum — rakningin elti þær þvert yfir blaðið, út í ásahringina langt utan hússins.
//
// Nú er ENGIN lína rakin á myndinni. Miðinn er festur við næsta vegg hússins (veggirnir á borðinu, eða greindir veggir
// ef borðið á enga), og eldveggurinn er aðeins sá BÚTUR þess veggjar sem miðinn stendur við — milli næstu horna /
// samskeyta (þar sem annar veggur mætir honum) eða enda veggjarins. Finnist enginn veggur nálægt miðanum er engin lína
// dregin (miðinn stendur) — betra en að giska. Allt er auk þess klippt við hús-rammann.
//
// Hreinar föll: heimshnit (borðdílar) inn og út.

import type { VeggTegund } from "./teikning-veggir";

export type P = [number, number];

/** EI-miði í borðhnitum: miðja, stefna textans, flokkur. */
export interface EiMidi {
  x: number;
  y: number;
  /** Textinn er lóðréttur (les neðan-upp / ofan-niður) — eldveggurinn þá líklegast lóðréttur. */
  lodrett: boolean;
  minutur: 30 | 60;
  /** EI-CS (reykþétt hurð) — hurð, ekki veggur: engin festing. */
  reyk?: boolean;
}

/** Veggur sem miði getur fest sig við (heimshnit, brotalína). */
export interface FestiVeggur {
  id: string;
  p: number[];
  t: number;
  tegund?: VeggTegund;
}

export interface Rammi {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FestiStillingar {
  /** Lengsta fjarlægð miða frá yfirborði veggjar (heimseiningar) — ≈ 1 m. */
  seiling: number;
  /** Húsið (heimshnit): miðar utan þess festast ekki og eldveggur nær aldrei út fyrir það. */
  hus?: Rammi | null;
  /** Lágmarkslengd eldveggjarbúts (heimseiningar). */
  lagmark?: number;
}

/** Eldveggjarbútur: á vegg `veggId`, bút `butur` (punktar butur og butur+1), frá s0 til s1 (fjarlægð eftir bútnum). */
export interface Festing {
  veggId: string;
  butur: number;
  s0: number;
  s1: number;
  minutur: 30 | 60;
  /** Númer miðanna (í `midar`) sem festust hér. */
  midar: number[];
}

export interface FestiNidurstada {
  festingar: Festing[];
  /** Miðar sem fundu engan vegg (eða standa utan húss) — engin lína, miðinn einn. */
  lausir: number[];
}

type Butur = { id: string; i: number; a: P; b: P; L: number; d: P; t: number; tegund: VeggTegund };

function butarVeggja(veggir: FestiVeggur[]): Butur[] {
  const ut: Butur[] = [];
  for (const v of veggir) {
    for (let i = 2; i + 1 < v.p.length; i += 2) {
      const a: P = [v.p[i - 2], v.p[i - 1]], b: P = [v.p[i], v.p[i + 1]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-6) continue;
      ut.push({ id: v.id, i: i / 2 - 1, a, b, L, d: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], t: v.t, tegund: v.tegund ?? "veggur" });
    }
  }
  return ut;
}

/** Veggir sem eldveggur getur legið á: venjulegir veggir og eldveggir (ekki gler eða hurðir). */
const festanleg = (t: VeggTegund) => t === "veggur" || t === "ei60" || t === "ei30";

/** Klippir [s0, s1] eftir bút við ramma (Liang–Barsky). null ef ekkert er eftir. */
function klippaVidRamma(B: Butur, s0: number, s1: number, r: Rammi): [number, number] | null {
  const x0 = B.a[0] + B.d[0] * s0, y0 = B.a[1] + B.d[1] * s0;
  const dx = B.d[0] * (s1 - s0), dy = B.d[1] * (s1 - s0);
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy], q = [x0 - r.x0, r.x1 - x0, y0 - r.y0, r.y1 - y0];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return null;
      continue;
    }
    const t = q[k] / p[k];
    if (p[k] < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [s0 + (s1 - s0) * t0, s0 + (s1 - s0) * t1];
}

/** Samskeyti á bútnum B: þar sem annar veggur (ekki samsíða) mætir honum eða sker hann — fjarlægðir eftir B. */
export function samskeyti(B: { a: P; b: P; t: number }, allir: FestiVeggur[], sjalfur?: { id: string; i: number }): number[] {
  const L = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]);
  if (L < 1e-6) return [];
  const d: P = [(B.b[0] - B.a[0]) / L, (B.b[1] - B.a[1]) / L];
  const ut: number[] = [];
  for (const C of butarVeggja(allir)) {
    if (sjalfur && C.id === sjalfur.id && C.i === sjalfur.i) continue;
    const kross = d[0] * C.d[1] - d[1] * C.d[0];
    if (Math.abs(kross) < 0.3) continue; // samsíða (< ~17°) — sami veggur í línu, ekki samskeyti
    // skurðpunktur línanna: A + d·s = C.a + C.d·w
    const wx = C.a[0] - B.a[0], wy = C.a[1] - B.a[1];
    const s = (wx * C.d[1] - wy * C.d[0]) / kross;
    const w = (wx * d[1] - wy * d[0]) / kross;
    // hinn veggurinn nær að miðlínu B (með hálfri þykkt B + smá svigrúmi): T-mót, horn eða kross
    const vik = B.t / 2 + C.t / 2 + 2;
    if (w < -vik || w > C.L + vik) continue;
    if (s <= 1e-6 || s >= L - 1e-6) continue;
    ut.push(s);
  }
  return ut.sort((x, y) => x - y);
}

/** Festir hvern EI-miða við næsta vegg og finnur bútinn milli samskeyta sem hann á við. */
export function festaEiVidVeggi(midar: EiMidi[], veggir: FestiVeggur[], st: FestiStillingar): FestiNidurstada {
  const butar = butarVeggja(veggir).filter((b) => festanleg(b.tegund));
  const festingar: Festing[] = [];
  const lausir: number[] = [];
  const lagmark = st.lagmark ?? 0;
  const innanHuss = (x: number, y: number) => !st.hus || (x >= st.hus.x0 && x <= st.hus.x1 && y >= st.hus.y0 && y <= st.hus.y1);
  midar.forEach((m, mi) => {
    if (m.reyk) return; // EI-CS: hurð, ekki veggur
    if (!innanHuss(m.x, m.y)) {
      lausir.push(mi);
      return;
    }
    // næsti bútur: samsíða textanum gengur fyrir; þvert á hann aðeins ef hann er mjög nálægt
    let best: { B: Butur; s: number; d: number } | null = null;
    for (const B of butar) {
      const u = (m.x - B.a[0]) * B.d[0] + (m.y - B.a[1]) * B.d[1];
      // miðinn verður að standa VIÐ bútinn (ofanvarp innan hans, smá svigrúm við endana)
      if (u < -B.t || u > B.L + B.t) continue;
      const s = Math.max(0, Math.min(B.L, u));
      const Q: P = [B.a[0] + B.d[0] * s, B.a[1] + B.d[1] * s];
      const d = Math.max(0, Math.hypot(m.x - Q[0], m.y - Q[1]) - B.t / 2);
      const larettur = Math.abs(B.d[1]) < Math.sin((25 * Math.PI) / 180);
      const lodrettur = Math.abs(B.d[0]) < Math.sin((25 * Math.PI) / 180);
      const samsida = m.lodrett ? lodrettur : larettur;
      const virk = samsida ? d : d * 2.5;
      if (virk > st.seiling) continue;
      if (!best || virk < best.d) best = { B, s, d: virk };
    }
    if (!best) {
      lausir.push(mi);
      return;
    }
    const { B, s } = best;
    const sk = samskeyti(B, veggir, { id: B.id, i: B.i });
    let s0 = 0, s1 = B.L;
    for (const x of sk) {
      if (x <= s && x > s0) s0 = x;
      if (x >= s && x < s1) s1 = x;
    }
    if (st.hus) {
      const k = klippaVidRamma(B, s0, s1, st.hus);
      if (!k) {
        lausir.push(mi);
        return;
      }
      [s0, s1] = k;
    }
    if (s1 - s0 < Math.max(lagmark, 1e-6)) {
      lausir.push(mi);
      return;
    }
    // sami bútur úr öðrum miða: sameinað, hærri flokkurinn ræður
    const til = festingar.find((f) => f.veggId === B.id && f.butur === B.i && Math.abs(f.s0 - s0) < 1e-6 && Math.abs(f.s1 - s1) < 1e-6);
    if (til) {
      til.midar.push(mi);
      if (m.minutur > til.minutur) til.minutur = m.minutur;
      return;
    }
    festingar.push({ veggId: B.id, butur: B.i, s0, s1, minutur: m.minutur, midar: [mi] });
  });
  return { festingar, lausir };
}

/** Tegund eldveggjar úr flokki. */
export const eiTegund = (min: 30 | 60): VeggTegund => (min === 60 ? "ei60" : "ei30");

/** Brotalína veggjar (heimshnit) með eldveggjabútum → hlutar með tegund. Hlutar í röð sem hafa sömu tegund renna
 * saman. Eldveggur fyrir lækkar aldrei (EI-60 verður ekki EI-30). Engin festing → einn hluti, óbreyttur. */
export function skiptaVeggEftirFestingum(
  p: number[],
  tegund: VeggTegund,
  festingar: Pick<Festing, "butur" | "s0" | "s1" | "minutur">[]
): { p: number[]; tegund: VeggTegund }[] {
  const ut: { p: number[]; tegund: VeggTegund }[] = [];
  const baeta = (A: P, B: P, tg: VeggTegund) => {
    if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 1e-6) return;
    const s = ut[ut.length - 1];
    if (s && s.tegund === tg && Math.hypot(s.p[s.p.length - 2] - A[0], s.p[s.p.length - 1] - A[1]) < 1e-6) s.p.push(B[0], B[1]);
    else ut.push({ p: [A[0], A[1], B[0], B[1]], tegund: tg });
  };
  const haerri = (a: VeggTegund, min: 30 | 60): VeggTegund => {
    if (a === "ei60") return "ei60";
    if (a === "ei30") return min === 60 ? "ei60" : "ei30";
    return eiTegund(min);
  };
  for (let i = 2; i + 1 < p.length; i += 2) {
    const a: P = [p[i - 2], p[i - 1]], b: P = [p[i], p[i + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const d: P = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const at = (s: number): P => [a[0] + d[0] * s, a[1] + d[1] * s];
    // bil á þessum bút: [s0, s1, flokkur], sameinuð
    const bil = festingar
      .filter((f) => f.butur === i / 2 - 1)
      .map((f) => [Math.max(0, f.s0), Math.min(L, f.s1), f.minutur] as [number, number, 30 | 60])
      .filter((x) => x[1] - x[0] > 1e-6)
      .sort((x, y) => x[0] - y[0]);
    let s = 0;
    for (const [s0, s1, min] of bil) {
      const byrja = Math.max(s, s0);
      if (byrja > s) baeta(at(s), at(byrja), tegund);
      if (s1 > byrja) baeta(at(byrja), at(s1), haerri(tegund, min));
      s = Math.max(s, s1);
    }
    if (s < L) baeta(at(s), b, tegund);
  }
  return ut.length ? ut : [{ p: p.slice(), tegund }];
}
