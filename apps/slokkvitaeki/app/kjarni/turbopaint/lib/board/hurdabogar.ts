// HURÐABOGAR — hurðir fundnar úr teikningunni sjálfri (Agnar 10.10.2026: „vantar líka eitthvað sem nær að spotta
// hurðarnar automatically"). hurdagreining.ts finnur hurðir aðeins í BILUM veggjanna — en veggjagreiningin brúar oft
// hurðargatið (karmlínur, þröskuldur, blaðið sjálft verða að vegg) og þá er ekkert bil að finna. Hér er leitað að
// hurðartákninu sjálfu: fjórðungshring (boga) frá hjör með radíus ≈ hurðarbreidd, og blaðlínunni hornrétt á vegginn.
//
// Hrein föll á grátónamynd (virkar eins á skönnun og vigur-PDF sem búið er að teikna í mynd):
//   1. dökkir dílar → „þykkir" (veggir, fylling: bæði lárétt og lóðrétt samfella > ~9 cm) felldir, eftir eru mjóar línur;
//   2. stefna hverrar mjórrar línu (fylkisgreining í litlum glugga) → díllinn kýs miðju í r ∈ [rMin, rMax] eftir
//      þverlínunni (Hough-hringur með stigli: bogi gefur skarpan topp í hjörinni, beinar línur smyrjast út);
//   3. hver toppur prófaður beint í myndinni: fjórðungur (4 ásstefnur) og radíus með mestri þekju, innra svæðið autt
//      (ekki parket / skástrikun), ekki heill hringur (borð, salerni), blaðlína og veggur sitt hvoru megin við gatið;
//   4. hurðin: lína eftir veggnum frá hjör að hinum karminum (breidd = radíus), fest á miðlínu veggjar ef veggir eru
//      gefnir; tveir bogar sem mætast = tvöföld hurð.
// Myndin er fyrst minnkuð með lágmarks-samþjöppun (dökkar mjóar línur lifa) niður að ~48 dílum á metra.

import { asStefna, iButa, type HLina } from "./veggja-hreinsun";

export type P = [number, number];

/** Grátóna mynd: 0 = svart, 255 = hvítt; d.length = w·h. */
export interface Gratona {
  w: number;
  h: number;
  d: Uint8Array;
}

export interface Bogi {
  /** Hjörin (miðja bogans), dílar myndarinnar. */
  c: P;
  /** Radíus (≈ breidd hurðarblaðs), dílar. */
  r: number;
  /** Einingarvigur eftir veggnum: hjör → hinn karmurinn (blaðið lokað). */
  u: P;
  /** Einingarvigur opna blaðsins — hliðin sem hurðin opnast inn í. */
  n: P;
  /** Hlutfall bogans sem er teiknað (0–1). */
  thekja: number;
  /** Blaðlínan teiknuð (0–1). */
  blad: number;
  /** Veggur sitt hvoru megin við gatið (0–1). */
  veggur: number;
  /** Innra svæði bogans autt (0–1). */
  tom: number;
  stig: number;
}

export interface BogaStillingar {
  rMinM?: number;
  rMaxM?: number;
  thekjaMin?: number;
  /** Vinnuupplausn, dílar á metra (myndin minnkuð niður að henni með lágmarks-samþjöppun). */
  vinnuDpm?: number;
  /** Aðeins bogar með hjör innan þessa kassa (dílar myndarinnar). */
  kassi?: { x0: number; y0: number; x1: number; y1: number };
  /** Hámark toppa sem eru prófaðir (tími). */
  hamarkToppa?: number;
  /** Mælingar: hver prófaður toppur og hvers vegna honum var hafnað (null = samþykktur). */
  skyrsla?: (k: { c: P; r: number; thekja: number; fj?: P; tom?: number; mjo?: number; skerpa?: number; adrir?: number; blad?: number; veggur?: number; hafnad: string | null }) => void;
}

export const SJALFGEFNIR_BOGAR = { rMinM: 0.55, rMaxM: 1.15, thekjaMin: 0.5, vinnuDpm: 48, hamarkToppa: 20000 };

/** Lágmarks-samþjöppun um heiltöluþátt f (dekksti díll hvers f×f reits) — mjóar dökkar línur lifa minnkunina. */
export function minnka(g: Gratona, f: number): Gratona {
  if (f <= 1) return g;
  const w = Math.floor(g.w / f), h = Math.floor(g.h / f);
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let yy = y * f; yy < y * f + f; yy++) {
        const rod = yy * g.w;
        for (let xx = x * f; xx < x * f + f; xx++) {
          const v = g.d[rod + xx];
          if (v < m) m = v;
        }
      }
      d[y * w + x] = m;
    }
  }
  return { w, h, d };
}

/** Þröskuldur dökkra díla: bakgrunnurinn (miðgildi — teikning er að mestu auð) mínus max(25, 18 % af bilinu niður í
 * blekið). Hurðabogar eru oft daufustu línur blaðsins (mælt 10.10.2026, Álfaborg: boginn 180–210 á 245 bakgrunni). */
export function dokkurThroskuldur(g: Gratona): number {
  const hist = new Uint32Array(256);
  const skref = Math.max(1, Math.floor(g.d.length / 400000));
  let n = 0;
  for (let i = 0; i < g.d.length; i += skref) {
    hist[g.d[i]]++;
    n++;
  }
  let s = 0, midgildi = 255, p1 = -1;
  for (let v = 0; v < 256; v++) {
    s += hist[v];
    if (p1 < 0 && s >= n * 0.01) p1 = v;
    if (s >= n / 2) {
      midgildi = v;
      break;
    }
  }
  if (p1 < 0) p1 = 0;
  return Math.max(70, Math.min(225, Math.round(midgildi - Math.max(25, 0.18 * (midgildi - p1)))));
}

/** Bogar hurða á myndinni. `dpm` = dílar myndarinnar á metra. Hnit niðurstöðunnar = dílar myndarinnar. */
export function finnaHurdaboga(g0: Gratona, dpm: number, st: BogaStillingar = {}): Bogi[] {
  const S = { ...SJALFGEFNIR_BOGAR, ...st };
  const f = Math.max(1, Math.floor(dpm / S.vinnuDpm));
  const g = minnka(g0, f);
  const d = dpm / f;
  const W = g.w, H = g.h, N = W * H;
  const thr = dokkurThroskuldur(g);
  const dokk = new Uint8Array(N);
  for (let i = 0; i < N; i++) dokk[i] = g.d[i] < thr ? 1 : 0;

  // ── þykkir dílar (veggir, fylling): samfella bæði lárétt og lóðrétt ≥ Tk ──
  const Tk = Math.max(4, Math.round(0.09 * d));
  const hlaup = new Uint16Array(N);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const i0 = y * W + x;
      if (!dokk[i0]) {
        x++;
        continue;
      }
      let x1 = x;
      while (x1 < W && dokk[y * W + x1]) x1++;
      const L = Math.min(65535, x1 - x);
      for (let k = x; k < x1; k++) hlaup[y * W + k] = L;
      x = x1;
    }
  }
  const thykk = new Uint8Array(N);
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!dokk[y * W + x]) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 < H && dokk[y1 * W + x]) y1++;
      const L = y1 - y;
      if (L >= Tk) for (let k = y; k < y1; k++) if (hlaup[k * W + x] >= Tk) thykk[k * W + x] = 1;
      y = y1;
    }
  }
  // þykkt víkkað um 1 díl (jaðrar veggja eru ekki mjóar línur)
  const mjo = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!dokk[i] || thykk[i]) continue;
      if (thykk[i - 1] || thykk[i + 1] || thykk[i - W] || thykk[i + W]) continue;
      mjo[i] = 1;
    }
  }

  // ── atkvæði: hver mjór díll kýs miðju eftir þverlínu sinni ──
  const rMin = S.rMinM * d, rMax = S.rMaxM * d;
  const r0 = Math.floor(rMin), r1 = Math.ceil(rMax);
  const kg = d >= 60 ? 4 : 3;
  const atkv = new Uint16Array(N);
  /** Stefna (snertill) hverrar mjórrar línu í gráðum 0–179; 255 = engin. */
  const stefna = new Uint8Array(N).fill(255);
  for (let y = kg; y < H - kg; y++) {
    for (let x = kg; x < W - kg; x++) {
      if (!mjo[y * W + x]) continue;
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let dy = -kg; dy <= kg; dy++) {
        const rod = (y + dy) * W + x;
        for (let dx = -kg; dx <= kg; dx++) {
          if (!mjo[rod + dx]) continue;
          n++;
          sx += dx;
          sy += dy;
          sxx += dx * dx;
          syy += dy * dy;
          sxy += dx * dy;
        }
      }
      if (n < kg + 2) continue;
      const mx = sx / n, my = sy / n;
      const a = sxx / n - mx * mx, c = syy / n - my * my, b = sxy / n - mx * my;
      const hm = (a + c) / 2, rot = Math.sqrt(((a - c) / 2) ** 2 + b * b);
      const l1 = hm + rot, l2 = hm - rot;
      if (l1 <= 0 || (l1 - l2) / (l1 + l2 + 1e-9) < 0.5) continue;
      const th = 0.5 * Math.atan2(2 * b, a - c);
      stefna[y * W + x] = (((Math.round((th * 180) / Math.PI) % 180) + 180) % 180) as number;
      const nx = -Math.sin(th), ny = Math.cos(th);
      for (let r = r0; r <= r1; r++) {
        let cx = Math.round(x + r * nx), cy = Math.round(y + r * ny);
        if (cx >= 0 && cy >= 0 && cx < W && cy < H && atkv[cy * W + cx] < 65535) atkv[cy * W + cx]++;
        cx = Math.round(x - r * nx);
        cy = Math.round(y - r * ny);
        if (cx >= 0 && cy >= 0 && cx < W && cy < H && atkv[cy * W + cx] < 65535) atkv[cy * W + cx]++;
      }
    }
  }

  // ── toppar: 3×3 summa MÍNUS bakgrunnur (meðaltal ±0,1 m) — beinar línur smyrja atkvæðum í breið bönd og þar sem mörg
  // bönd skarast (veggjahorn) verður hæð sem gleypir hjörina; boginn gefur mjóan topp ofan á bandinu. Svo gráðug
  // útilokun innan ±0,07 m.
  const minAtkv = 0.3 * (Math.PI / 2) * rMin;
  const kassi = S.kassi ? { x0: S.kassi.x0 / f, y0: S.kassi.y0 / f, x1: S.kassi.x1 / f, y1: S.kassi.y1 / f } : null;
  const toppar: { i: number; v: number }[] = [];
  const s3 = (i: number) => atkv[i - W - 1] + atkv[i - W] + atkv[i - W + 1] + atkv[i - 1] + atkv[i] + atkv[i + 1] + atkv[i + W - 1] + atkv[i + W] + atkv[i + W + 1];
  const wb = Math.max(4, Math.round(0.1 * d));
  const yA = Math.max(wb + 1, kassi ? Math.floor(kassi.y0) : 0), yB = Math.min(H - wb - 2, kassi ? Math.ceil(kassi.y1) : H);
  const xA = Math.max(wb + 1, kassi ? Math.floor(kassi.x0) : 0), xB = Math.min(W - wb - 2, kassi ? Math.ceil(kassi.x1) : W);
  for (let y = yA; y <= yB; y++) {
    for (let x = xA; x <= xB; x++) {
      const i = y * W + x;
      if (atkv[i] < 2) continue;
      const v = s3(i);
      if (v < minAtkv) continue;
      let bg = 0;
      for (let yy = y - wb; yy <= y + wb; yy++) {
        const rod = yy * W;
        for (let xx = x - wb; xx <= x + wb; xx++) bg += atkv[rod + xx];
      }
      const svar = v - (bg * 9) / ((2 * wb + 1) * (2 * wb + 1));
      if (svar >= 0.6 * minAtkv) toppar.push({ i, v: svar });
    }
  }
  toppar.sort((p, q) => q.v - p.v);
  {
    const wn = Math.max(2, Math.round(0.07 * d));
    const tek = new Uint8Array(N);
    const eftir: typeof toppar = [];
    for (const t of toppar) {
      if (tek[t.i]) continue;
      eftir.push(t);
      if (eftir.length >= S.hamarkToppa) break;
      const ty = Math.floor(t.i / W), tx = t.i - ty * W;
      for (let yy = Math.max(0, ty - wn); yy <= Math.min(H - 1, ty + wn); yy++) tek.fill(1, yy * W + Math.max(0, tx - wn), yy * W + Math.min(W - 1, tx + wn) + 1);
    }
    toppar.length = 0;
    toppar.push(...eftir);
  }
  const ntop = toppar.length;

  // ── prófun hvers topps beint í myndinni ──
  const D = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < W && yi < H && dokk[yi * W + xi] === 1;
  };
  /** 0 = ljóst; 1 = dökkt; 3 = dökkt OG línan þar liggur sem snertill hrings um miðjuna (geisli í stefnu `phi`°). */
  const DS = (x: number, y: number, phi: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
    const i = yi * W + xi;
    if (!dokk[i]) return 0;
    const st2 = stefna[i];
    if (st2 === 255) return 1;
    let df = Math.abs(st2 - ((phi + 90 + 360) % 180));
    if (df > 90) df = 180 - df;
    return df <= 25 ? 3 : 1;
  };
  const Mj = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < W && yi < H && mjo[yi * W + xi] === 1;
  };
  const NA = 24;
  const horn: { c: number; s: number }[] = [];
  for (let a = 0; a < NA; a++) {
    const f2 = ((3 + (84 * (a + 0.5)) / NA) * Math.PI) / 180;
    horn.push({ c: Math.cos(f2), s: Math.sin(f2) });
  }
  const FJ = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  const rho0 = Math.max(1, Math.floor(0.3 * r0));
  const nR = r1 + 3 - rho0;
  const hits = new Uint8Array(4 * NA * nR);
  const geislaHorn: number[] = [];
  for (let q = 0; q < 4; q++)
    for (let a = 0; a < NA; a++) geislaHorn.push((Math.atan2(FJ[q][1] * horn[a].s, FJ[q][0] * horn[a].c) * 180) / Math.PI);
  /** Þekja bogans í fjórðungi q við radíus r (úr geislunum); `mid` = aðeins geislar 20°–70° (fjarri blaðinu og
   * veggfletinum sem liggja á ásunum og hitta ystu geislana við alla radíusa). */
  const midA: number[] = [];
  for (let a = 0; a < NA; a++) {
    const f2 = 3 + (84 * (a + 0.5)) / NA;
    if (f2 >= 20 && f2 <= 70) midA.push(a);
  }
  const allA = Array.from({ length: NA }, (_, a) => a);
  /** `bit` 2 = aðeins dílar þar sem línan liggur sem snertill (boginn sjálfur); 1 = allt dökkt (innra svæðið). */
  const thekjaQ = (q: number, r: number, mid = false, bit = 2) => {
    let k = 0;
    const ri = Math.round(r) - rho0;
    const listi = mid ? midA : allA;
    for (const a of listi) {
      const b = (q * NA + a) * nR;
      if ((hits[b + ri] | hits[b + ri - 1] | hits[b + ri + 1]) & bit) k++;
    }
    return k / listi.length;
  };
  /** Lína frá X í stefnu e, frá ρ0 til ρ1 — hlutfall sýna með dökkum díl innan ±1 þvert. */
  const linuThekja = (X: P, e: P, p0: number, p1: number, breidd = 1) => {
    const ns = 16;
    let k = 0;
    for (let s = 0; s < ns; s++) {
      const rho = p0 + ((p1 - p0) * (s + 0.5)) / ns;
      const x = X[0] + e[0] * rho, y = X[1] + e[1] * rho;
      let hit = false;
      for (let o = -breidd; o <= breidd && !hit; o++) hit = D(x - e[1] * o, y + e[0] * o);
      if (hit) k++;
    }
    return k / ns;
  };

  const bogar: Bogi[] = [];
  const tekid = new Uint8Array(N);
  const blokk = Math.max(2, Math.round(0.12 * d));
  for (let ti = 0; ti < ntop; ti++) {
    const { i } = toppar[ti];
    if (tekid[i]) continue;
    const y0 = Math.floor(i / W), x0 = i - y0 * W;
    let best: { c: P; q: number; r: number; th: number } | null = null;
    for (let k9 = 0; k9 < 9; k9++) {
      // miðjan fyrst; nágrannarnir aðeins ef hún lofar góðu (tími)
      const dx = [0, -1, 1, 0, 0, -1, 1, -1, 1][k9], dy = [0, 0, 0, -1, 1, -1, -1, 1, 1][k9];
      if (k9 === 1 && (!best || best.th < 0.75 * S.thekjaMin)) break;
      {
        const cx = x0 + dx, cy = y0 + dy;
        hits.fill(0);
        for (let q = 0; q < 4; q++) {
          const [sx, sy] = FJ[q];
          for (let a = 0; a < NA; a++) {
            const ex = sx * horn[a].c, ey = sy * horn[a].s;
            const b = (q * NA + a) * nR;
            const ph = geislaHorn[q * NA + a];
            for (let rr = r0 - 2; rr <= r1 + 2; rr++) hits[b + rr - rho0] = DS(cx + ex * rr, cy + ey * rr, ph);
          }
        }
        for (let q = 0; q < 4; q++) {
          for (let r = r0; r <= r1; r++) {
            const th = thekjaQ(q, r);
            if (!best || th > best.th + 1e-9) best = { c: [cx, cy], q, r, th };
          }
        }
      }
    }
    const sk = S.skyrsla;
    if (!best || best.th < S.thekjaMin) {
      if (sk && best) sk({ c: [best.c[0] * f, best.c[1] * f], r: best.r * f, thekja: best.th, hafnad: "thekja" });
      continue;
    }
    // fínstilling: hjörin ±4 dílar og radíusinn ±4 — sá hringur sem fellur best að boganum (snertilsdílar)
    {
      const [sx0, sy0] = FJ[best.q];
      const thekjaVid = (cx: number, cy: number, rr: number) => {
        let k = 0;
        for (let a = 0; a < NA; a++) {
          const ex = sx0 * horn[a].c, ey = sy0 * horn[a].s, ph = geislaHorn[best.q * NA + a];
          if ((DS(cx + ex * (rr - 1), cy + ey * (rr - 1), ph) | DS(cx + ex * rr, cy + ey * rr, ph) | DS(cx + ex * (rr + 1), cy + ey * (rr + 1), ph)) & 2) k++;
        }
        return k / NA;
      };
      let bc = best.c, br = best.r, bt = thekjaVid(best.c[0], best.c[1], best.r);
      for (let dy = -4; dy <= 4; dy += 2)
        for (let dx = -4; dx <= 4; dx += 2)
          for (let rr = Math.max(r0, best.r - 4); rr <= Math.min(r1, best.r + 4); rr++) {
            const t = thekjaVid(best.c[0] + dx, best.c[1] + dy, rr);
            if (t > bt + 1e-9) {
              bt = t;
              bc = [best.c[0] + dx, best.c[1] + dy];
              br = rr;
            }
          }
      best.c = bc;
      best.r = br;
      best.th = Math.max(best.th, bt);
    }
    const { c, q, r } = best;
    const rapp = (hafnad: string | null, x: Record<string, number> = {}) => sk?.({ c: [c[0] * f, c[1] * f], r: r * f, thekja: best.th, fj: FJ[q] as unknown as P, ...x, hafnad });
    // reikna geislana aftur fyrir besta miðpunktinn (hringprófun)
    hits.fill(0);
    for (let qq = 0; qq < 4; qq++) {
      const [sx, sy] = FJ[qq];
      for (let a = 0; a < NA; a++) {
        const ex = sx * horn[a].c, ey = sy * horn[a].s;
        const b = (qq * NA + a) * nR;
        const ph = geislaHorn[qq * NA + a];
        for (let rr = rho0; rr <= r1 + 2; rr++) hits[b + rr - rho0] = DS(c[0] + ex * rr, c[1] + ey * rr, ph);
      }
    }
    let adrir = 0;
    for (let qq = 0; qq < 4; qq++) if (qq !== q && thekjaQ(qq, r) >= 0.6) adrir++;
    if (adrir >= 2) {
      rapp("hringur", { adrir }); // heill hringur / ¾ — borð, súla, salerni
      continue;
    }
    const [sx, sy] = FJ[q];
    // innra svæðið autt: meðalþekja minni radíusa (0,35r–0,8r) í sama fjórðungi. Málsetningarlína / texti sker fáa geisla
    // við hvern radíus; parket / skástrikun / stigi sker marga við alla radíusa.
    let tomt = 0, alls = 0, mjoar = 0, dokkar = 0;
    for (let rr = Math.max(rho0 + 1, Math.round(0.35 * r)); rr <= Math.round(0.8 * r); rr++) {
      alls++;
      tomt += 1 - thekjaQ(q, rr, true, 1);
    }
    for (let a = 4; a < NA - 4; a += 2) {
      const ex = sx * horn[a].c, ey = sy * horn[a].s;
      for (let rr = r - 1; rr <= r + 1; rr++) {
        const x = c[0] + ex * rr, y = c[1] + ey * rr;
        if (D(x, y)) {
          dokkar++;
          if (Mj(x, y)) mjoar++;
        }
      }
    }
    // skerpa: boginn er EIN lína — þekjan fellur 4 dílum innan og utan við (mynstur / fylling þekur alla radíusa)
    const skerpa = thekjaQ(q, r, true) - Math.max(thekjaQ(q, Math.max(r0, r - 4), true), thekjaQ(q, Math.min(r1, r + 4), true));
    const tom = alls ? tomt / alls : 0, mjo2 = dokkar ? mjoar / dokkar : 1;
    if (tom < 0.8 || mjo2 < 0.3 || skerpa < 0.2) {
      rapp(tom < 0.8 ? "tom" : mjo2 < 0.3 ? "mjo" : "skerpa", { tom, mjo: mjo2, skerpa });
      continue;
    }
    // hvor ásinn er veggurinn? blaðlína teiknuð á öðrum, veggur heldur áfram sitt hvoru megin gatsins á hinum
    const a1: P = [sx, 0], a2: P = [0, sy];
    const blad1 = linuThekja(c, a1, 0.15 * r, 0.92 * r), blad2 = linuThekja(c, a2, 0.15 * r, 0.92 * r);
    const vegg = (a: P) => (linuThekja(c, [-a[0], -a[1]], 0.08 * r, 0.4 * r, 2) + linuThekja([c[0] + a[0] * r, c[1] + a[1] * r], a, 0.08 * r, 0.4 * r, 2)) / 2;
    const v1 = vegg(a1), v2 = vegg(a2);
    // a1 = veggur ⇒ blaðið á a2
    const s1 = v1 + (blad2 - blad1), s2 = v2 + (blad1 - blad2);
    const ueggur = s1 >= s2;
    const u: P = ueggur ? a1 : a2, n: P = ueggur ? a2 : a1;
    const blad = ueggur ? blad2 : blad1, veggur = ueggur ? v1 : v2;
    if ((blad < 0.6 && best.th < 0.85) || (veggur < 0.3 && blad < 0.6)) {
      rapp("blad", { tom, mjo: mjo2, skerpa, blad, veggur });
      continue;
    }
    rapp(null, { tom, mjo: mjo2, skerpa, blad, veggur });
    const stig = best.th + 0.5 * blad + 0.25 * veggur + 0.25 * tom;
    // nágrannatoppar sama boga teknir
    for (let yy = Math.max(0, c[1] - blokk); yy <= Math.min(H - 1, c[1] + blokk); yy++)
      for (let xx = Math.max(0, c[0] - blokk); xx <= Math.min(W - 1, c[0] + blokk); xx++) tekid[yy * W + xx] = 1;
    bogar.push({ c: [c[0] * f + (f - 1) / 2, c[1] * f + (f - 1) / 2], r: r * f, u, n, thekja: best.th, blad, veggur, tom, stig });
  }
  // sami boginn tvisvar (nálægar hjarir, sama fjórðungur) — sá betri lifir
  bogar.sort((p, q) => q.stig - p.stig);
  const ut: Bogi[] = [];
  for (const b of bogar) {
    const tvi = ut.some((o) => {
      const dd = Math.hypot(o.c[0] - b.c[0], o.c[1] - b.c[1]);
      const samiFj = o.u[0] * b.u[0] + o.u[1] * b.u[1] > 0.5 && o.n[0] * b.n[0] + o.n[1] * b.n[1] > 0.5;
      const samiBogi = Math.sign(o.u[0] + o.n[0]) === Math.sign(b.u[0] + b.n[0]) && Math.sign(o.u[1] + o.n[1]) === Math.sign(b.u[1] + b.n[1]);
      return (samiFj || samiBogi) && dd < 0.5 * Math.max(o.r, b.r);
    });
    if (!tvi) ut.push(b);
  }
  return ut;
}

// ── bogi → hurð í vegglínunni ─────────────────────────────────────────────────────────────────────────────

export interface BogaHurd {
  p: [number, number, number, number];
  t: number;
  tegund: "hurd";
  bogi: true;
  tvofold?: boolean;
  stig: number;
}

type Vb = { a: P; b: P; t: number; ax: 0 | 1 | -1 };

/** Hurðir úr bogum. `veggir` (sömu hnit og bogarnir) — hurðin fest á miðlínu veggjarins sem hjörin situr við; vanti
 * vegg er línan hliðruð hálfa sjálfgefna þykkt aftur fyrir hjörina. */
export function hurdirUrBogum(
  bogar: readonly Bogi[],
  veggir: readonly HLina[],
  dpm: number,
  st: { tSjalfgefidM?: number; /** Bogi sem situr ekki við vegg (húsgagn, skápur) fellur — ef veggir eru gefnir. */ krefjastVeggjar?: boolean } = {}
): BogaHurd[] {
  const t0 = (st.tSjalfgefidM ?? 0.15) * dpm;
  const vb: Vb[] = iButa(veggir as HLina[])
    .filter((l) => (l.tegund ?? "veggur") === "veggur" || l.tegund === "ei60" || l.tegund === "ei30")
    .map((l) => ({ a: [l.p[0], l.p[1]] as P, b: [l.p[2], l.p[3]] as P, t: l.t, ax: asStefna(l.p, 3) }));
  const notad = new Set<number>();
  const ut: BogaHurd[] = [];
  const dot = (p: P, q: P) => p[0] * q[0] + p[1] * q[1];
  const J = (b: Bogi): P => [b.c[0] + b.u[0] * b.r, b.c[1] + b.u[1] * b.r];

  /** Op frá A til B (eftir u), hjörin á n-hlið veggjarins: festa á vegg. */
  const festa = (A: P, B: P, u: P, n: P, stig: number, tvofold: boolean) => {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    let bestV: Vb | null = null, bestS = 0, bestE = Infinity;
    for (const v of vb) {
      const dv: P = [v.b[0] - v.a[0], v.b[1] - v.a[1]];
      const lv = Math.hypot(dv[0], dv[1]) || 1;
      if (Math.abs(dv[0] * u[1] - dv[1] * u[0]) / lv > 0.1) continue;
      // hliðrun miðlínu veggjarins frá hjörinni, mæld eftir n (neikvætt = aftur fyrir hjörina)
      const s = dot([v.a[0] - A[0], v.a[1] - A[1]], n);
      if (s < -0.45 * dpm || s > 0.08 * dpm) continue;
      // veggurinn liggur að gatinu (innan 0,6 m) eftir u
      const ta = dot([v.a[0] - A[0], v.a[1] - A[1]], u), tb = dot([v.b[0] - A[0], v.b[1] - A[1]], u);
      const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
      if (hi < -0.6 * dpm || lo > L + 0.6 * dpm) continue;
      const e = Math.abs(s + v.t / 2);
      if (e < bestE) {
        bestE = e;
        bestV = v;
        bestS = s;
      }
    }
    if (!bestV && st.krefjastVeggjar && vb.length) return;
    let t = t0, sh = -t0 / 2;
    if (bestV) {
      t = bestV.t;
      sh = bestS;
    }
    let A2: P = [A[0] + n[0] * sh, A[1] + n[1] * sh], B2: P = [B[0] + n[0] * sh, B[1] + n[1] * sh];
    // endarnir að veggjarendum á sömu línu (innan 0,2 m) — hurðin fyllir gatið nákvæmlega
    const vik = 0.2 * dpm;
    const naestiEndi = (X: P, inn: number): P => {
      let best: P = X, bd = vik;
      for (const v of vb) {
        for (const E of [v.a, v.b]) {
          const s = dot([E[0] - X[0], E[1] - X[1]], u) * inn, sn = Math.abs(dot([E[0] - X[0], E[1] - X[1]], n));
          if (sn > Math.max(v.t, t) / 2 + 0.05 * dpm) continue;
          const dd = Math.abs(s);
          if (dd < bd) {
            bd = dd;
            best = [X[0] + u[0] * s * inn, X[1] + u[1] * s * inn];
          }
        }
      }
      return best;
    };
    A2 = naestiEndi(A2, 1);
    B2 = naestiEndi(B2, 1);
    const h: BogaHurd = { p: [A2[0], A2[1], B2[0], B2[1]], t, tegund: "hurd", bogi: true, stig };
    if (tvofold) h.tvofold = true;
    ut.push(h);
  };

  // tvöfaldar: tveir bogar á sömu línu, blöðin mætast (J ≈ J'), u andstæð
  for (let i = 0; i < bogar.length; i++) {
    if (notad.has(i)) continue;
    const bi = bogar[i];
    for (let j = i + 1; j < bogar.length; j++) {
      if (notad.has(j)) continue;
      const bj = bogar[j];
      if (dot(bi.u, bj.u) > -0.95 || Math.abs(dot(bi.n, bj.n)) < 0.95) continue;
      const Ji = J(bi), Jj = J(bj);
      if (Math.hypot(Ji[0] - Jj[0], Ji[1] - Jj[1]) > 0.25 * Math.max(bi.r, bj.r)) continue;
      if (Math.abs(dot([bj.c[0] - bi.c[0], bj.c[1] - bi.c[1]], bi.n)) > 0.15 * dpm) continue;
      notad.add(i);
      notad.add(j);
      festa(bi.c, bj.c, bi.u, bi.n, (bi.stig + bj.stig) / 2, true);
      break;
    }
  }
  bogar.forEach((b, i) => {
    if (!notad.has(i)) festa(b.c, J(b), b.u, b.n, b.stig, false);
  });
  // sama gatið tvisvar (tveir bogar sömu hurðar): samsíða, á sömu línu og skarast um > 50 % — sú betri lifir
  ut.sort((p, q) => q.stig - p.stig);
  const eftir: BogaHurd[] = [];
  for (const h of ut) {
    const A: P = [h.p[0], h.p[1]], L = Math.hypot(h.p[2] - h.p[0], h.p[3] - h.p[1]) || 1;
    const e: P = [(h.p[2] - h.p[0]) / L, (h.p[3] - h.p[1]) / L];
    const tvi = eftir.some((o) => {
      const Lo = Math.hypot(o.p[2] - o.p[0], o.p[3] - o.p[1]) || 1;
      if (Math.abs(((o.p[2] - o.p[0]) * e[1] - (o.p[3] - o.p[1]) * e[0]) / Lo) > 0.2) return false;
      const fj = Math.abs((o.p[0] - A[0]) * -e[1] + (o.p[1] - A[1]) * e[0]);
      if (fj > 0.25 * dpm) return false;
      const s0 = dot([o.p[0] - A[0], o.p[1] - A[1]], e), s1 = dot([o.p[2] - A[0], o.p[3] - A[1]], e);
      const skar = Math.min(L, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1));
      return skar > 0.5 * Math.min(L, Lo);
    });
    if (!tvi) eftir.push(h);
  }
  return eftir;
}

/** Prófun fyrir hurdagreining.finnaHurdir: sést bogi við gatið A–B? (hjör við annan endann, radíus ≈ breiddin, eða
 * tveir bogar — tvöföld hurð). */
export function bogaProf(bogar: readonly Bogi[], dpm: number): (A: P, B: P, t: number) => boolean {
  return (A, B, t) => {
    const g = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (g < 1e-6) return false;
    const e: P = [(B[0] - A[0]) / g, (B[1] - A[1]) / g];
    const vik = Math.max(0.3 * dpm, t);
    return bogar.some((b) => {
      if (Math.abs(b.u[0] * e[0] + b.u[1] * e[1]) < 0.9) return false;
      const dA = Math.hypot(b.c[0] - A[0], b.c[1] - A[1]), dB = Math.hypot(b.c[0] - B[0], b.c[1] - B[1]);
      if (Math.min(dA, dB) > vik) return false;
      const hl = b.r / g;
      return (hl >= 0.6 && hl <= 1.3) || (hl >= 0.35 && hl < 0.6);
    });
  };
}

/** Bogahurðir sem bætast við hurðirnar úr bilunum: þær sem liggja ekki ofan á hurð / gleri sem fyrir er. */
export function nyjarBogahurdir<T extends { p: number[]; t: number }>(boga: readonly BogaHurd[], fyrir: readonly T[], dpm: number): BogaHurd[] {
  return boga.filter((h) => {
    const mx = (h.p[0] + h.p[2]) / 2, my = (h.p[1] + h.p[3]) / 2;
    const L = Math.hypot(h.p[2] - h.p[0], h.p[3] - h.p[1]) || 1;
    return !fyrir.some((o) => {
      const ox = (o.p[0] + o.p[o.p.length - 2]) / 2, oy = (o.p[1] + o.p[o.p.length - 1]) / 2;
      const ol = Math.hypot(o.p[o.p.length - 2] - o.p[0], o.p[o.p.length - 1] - o.p[1]) || 1;
      const samsida = Math.abs(((h.p[2] - h.p[0]) * (o.p[o.p.length - 1] - o.p[1]) - (h.p[3] - h.p[1]) * (o.p[o.p.length - 2] - o.p[0])) / (L * ol)) < 0.3;
      return samsida && Math.hypot(mx - ox, my - oy) < Math.max(0.5 * dpm, L / 2);
    });
  });
}

/** Veggir undir hurðum klipptir: hurð liggur í gatinu, aldrei ofan á vegg (mælt á leiðréttingum Agnars). Aðeins beinir
 * bútar samsíða hurðinni og innan hálfrar þykktar; afgangar < 5 cm falla. */
export function skeraVeggiUndirHurdum<T extends HLina>(veggir: readonly T[], hurdir: readonly { p: number[]; t: number }[], dpm: number): { veggir: T[]; skornir: number } {
  let skornir = 0;
  let listi: T[] = [...veggir];
  for (const h of hurdir) {
    const A: P = [h.p[0], h.p[1]], B: P = [h.p[h.p.length - 2], h.p[h.p.length - 1]];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-6) continue;
    const u: P = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const nyr: T[] = [];
    for (const v of listi) {
      const tg = v.tegund ?? "veggur";
      if (v.p.length !== 4 || !(tg === "veggur" || tg === "ei60" || tg === "ei30")) {
        nyr.push(v);
        continue;
      }
      const a: P = [v.p[0], v.p[1]], b: P = [v.p[2], v.p[3]];
      const lv = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const samsida = Math.abs(((b[0] - a[0]) * u[1] - (b[1] - a[1]) * u[0]) / lv) < 0.1;
      const fj = Math.abs((a[0] - A[0]) * -u[1] + (a[1] - A[1]) * u[0]);
      if (!samsida || fj > (v.t + h.t) / 2) {
        nyr.push(v);
        continue;
      }
      const sa = (a[0] - A[0]) * u[0] + (a[1] - A[1]) * u[1], sb = (b[0] - A[0]) * u[0] + (b[1] - A[1]) * u[1];
      const lo = Math.min(sa, sb), hi = Math.max(sa, sb);
      const k0 = Math.max(lo, 0), k1 = Math.min(hi, L);
      if (k1 - k0 < 0.05 * dpm) {
        nyr.push(v);
        continue;
      }
      skornir++;
      // stefna veggjarins haldið: punktur á vegglínunni við s
      const pt = (s: number): number[] => {
        const f = (s - sa) / (sb - sa || 1);
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      };
      const lagm = 0.05 * dpm;
      if (k0 - lo >= lagm) nyr.push({ ...v, p: sa < sb ? [...pt(lo), ...pt(k0)] : [...pt(k0), ...pt(lo)] });
      if (hi - k1 >= lagm) nyr.push({ ...v, p: sa < sb ? [...pt(k1), ...pt(hi)] : [...pt(hi), ...pt(k1)] });
    }
    listi = nyr;
  }
  return { veggir: listi, skornir };
}

/** Liggja línur eftir veggnum þvert yfir gatið A–B (gluggi)? Sama prófun og sjálfvirka verkferlið gerir í vafranum
 * (sjalfvirkt.myndSyni), hér á grátónamynd í dílum hennar. */
export function linaIBiliProf(g: Gratona, thr = 140): (A: P, B: P, t: number) => boolean {
  const dimmt = (x: number, y: number) => {
    const px = Math.round(x), py = Math.round(y);
    for (let yy = py - 1; yy <= py + 1; yy++) {
      if (yy < 0 || yy >= g.h) continue;
      for (let xx = px - 1; xx <= px + 1; xx++) if (xx >= 0 && xx < g.w && g.d[yy * g.w + xx] < thr) return true;
    }
    return false;
  };
  return (A, B, t) => {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-6) return false;
    const u: P = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n: P = [-u[1], u[0]];
    for (const off of [-0.35, 0, 0.35]) {
      let hit = 0;
      const N = 16;
      for (let q = 0; q < N; q++) {
        const f = 0.12 + (0.76 * q) / (N - 1);
        if (dimmt(A[0] + u[0] * L * f + n[0] * t * off, A[1] + u[1] * L * f + n[1] * t * off)) hit++;
      }
      if (hit / N >= 0.85) return true;
    }
    return false;
  };
}
