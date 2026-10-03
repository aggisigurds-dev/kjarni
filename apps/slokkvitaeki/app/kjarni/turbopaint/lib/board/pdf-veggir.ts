// Veggir úr VIGUR-PDF (Agnar 03.10.2026: „kanski prófa leita online af pdf to vector", pdf2plot-hugmyndin; TurboPaint
// er vélin, Slökkvitæki-glugginn sýnir). CAD-uppdráttur geymir hverja línu með sinni þykkt. Mælt á Fiskislóð 41:
// 0,24 pt = málsetning, skástrikun og húsgögn · 0,48 pt = VEGGIR · 0,66 = málstrik · 0,96 = hnitakrossar · 1,38 = lóðarmörk.
// Myndgreining á slíkri teikningu sér mjóar tvöfaldar línur í skástrikunarsúpu; hér er AÐEINS veggjaflokkurinn teiknaður
// á auðan grunn og sami holveggja- og miðlínuferill keyrður á hann — engin skástrikun, enginn texti.
//
// flokkaPdfLinur / veljaVeggjaflokk eru fluttar úr Slökkvitæki 383 (sama aðferð, nú í vélinni).

/** Strik [x0, y0, x1, y1] í hnitum síðunnar (pt, efra-vinstra horn = 0,0). */
export type Strik = [number, number, number, number];

type Fylki = [number, number, number, number, number, number];

/** pdf.js OPS-töfluna þarf aðeins að hluta. */
export type PdfOps = Record<string, number>;

/** Flokkar strokuð strik síðunnar eftir línuþykkt (pt, tveir aukastafir). Skilur bæði pdf.js 3.x (constructPath =
 * [aðgerðir, hnit] + málun sér) og 4.x/5.x (málun inni í constructPath). `grunnur` = viewport.transform við scale 1. */
export function flokkaPdfLinur(OPS: PdfOps, fnArray: number[], argsArray: unknown[], grunnur: number[]): Record<string, Strik[]> {
  const mul = (a: Fylki, b: Fylki): Fylki => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const ap = (m: Fylki, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const STROK = new Set<number>();
  for (const n of ["stroke", "closeStroke", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke"]) if (OPS[n] != null) STROK.add(OPS[n]);
  const MALUN = new Set<number>();
  for (const n of ["stroke", "closeStroke", "fill", "eoFill", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke", "endPath"]) if (OPS[n] != null) MALUN.add(OPS[n]);
  let ctm = grunnur.slice(0, 6) as Fylki, lw = 1;
  let bid: Strik[] = [];
  const stafli: [Fylki, number][] = [];
  const flokkar: Record<string, Strik[]> = {};
  const skra = (b: number, strik: Strik[]) => {
    const l = b.toFixed(2);
    (flokkar[l] ??= []).push(...strik);
  };
  const kvardi = () => Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i] as unknown[];
    if (fn === OPS.save) stafli.push([ctm.slice() as Fylki, lw]);
    else if (fn === OPS.restore) {
      const t = stafli.pop();
      if (t) [ctm, lw] = t;
    } else if (fn === OPS.transform) ctm = mul(ctm, a as unknown as Fylki);
    else if (fn === OPS.setLineWidth) lw = a[0] as number;
    else if (fn === OPS.constructPath) {
      const strik: Strik[] = [];
      let p: [number, number] | null = null, byrjun: [number, number] | null = null;
      const lina = (x: number, y: number) => {
        const q = ap(ctm, x, y);
        if (p) strik.push([p[0], p[1], q[0], q[1]]);
        p = q;
      };
      if (typeof a[0] === "number") {
        // pdf.js 4.x/5.x: [málunaraðgerð, [Float32Array slóðar], minMax]
        const d = (a[1] as ArrayLike<number>[] | undefined)?.[0];
        if (!d) continue;
        for (let j = 0; j < d.length; ) {
          const op = d[j++];
          if (op === 0) { p = ap(ctm, d[j], d[j + 1]); byrjun = p; j += 2; }
          else if (op === 1) { lina(d[j], d[j + 1]); j += 2; }
          else if (op === 2) { p = ap(ctm, d[j + 4], d[j + 5]); j += 6; }
          else if (op === 3) { p = ap(ctm, d[j + 2], d[j + 3]); j += 4; }
          else if (op === 4) { if (p && byrjun) strik.push([p[0], p[1], byrjun[0], byrjun[1]]); p = byrjun; }
          else break;
        }
        if (STROK.has(a[0] as number)) skra(lw * kvardi(), strik);
      } else {
        // pdf.js 3.x: [aðgerðir, hnit]
        const ops = a[0] as number[], d = a[1] as number[];
        let j = 0;
        for (const op of ops) {
          if (op === OPS.moveTo) { p = ap(ctm, d[j], d[j + 1]); byrjun = p; j += 2; }
          else if (op === OPS.lineTo) { lina(d[j], d[j + 1]); j += 2; }
          else if (op === OPS.curveTo) { p = ap(ctm, d[j + 4], d[j + 5]); j += 6; }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { p = ap(ctm, d[j + 2], d[j + 3]); j += 4; }
          else if (op === OPS.closePath) { if (p && byrjun) strik.push([p[0], p[1], byrjun[0], byrjun[1]]); p = byrjun; }
          else if (op === OPS.rectangle) {
            const x = d[j], y = d[j + 1], w = d[j + 2], h = d[j + 3];
            j += 4;
            const A = ap(ctm, x, y), B = ap(ctm, x + w, y), C = ap(ctm, x + w, y + h), D = ap(ctm, x, y + h);
            strik.push([A[0], A[1], B[0], B[1]], [B[0], B[1], C[0], C[1]], [C[0], C[1], D[0], D[1]], [D[0], D[1], A[0], A[1]]);
            p = A;
            byrjun = A;
          }
        }
        bid = bid.concat(strik);
      }
    } else if (MALUN.has(fn)) {
      if (bid.length && STROK.has(fn)) skra(lw * kvardi(), bid);
      bid = [];
    }
  }
  return flokkar;
}

export interface FlokkaYfirlit {
  breidd: string;
  strik: number;
  long: number;
  lengd: number;
}

/** Giskar á veggjaflokkinn: mest samanlögð lengd LANGRA strika (strikuð lína er mörg stutt strik og telst ekki), með
 * lágmarksfjölda svo tvær rammalínur vinni ekki; hárlínur (< 0,3 pt) eru aldrei veggir. */
export function veljaVeggjaflokk(flokkar: Record<string, Strik[]>, bladB: number, bladH: number): { valinn: string | null; yfirlit: FlokkaYfirlit[] } {
  const lagm = Math.max(bladB, bladH) * 0.004;
  let best: string | null = null, bestS = 0;
  const yfirlit: FlokkaYfirlit[] = [];
  for (const l of Object.keys(flokkar)) {
    const b = +l, strik = flokkar[l];
    let n = 0, lengd = 0;
    for (const v of strik) {
      const d = Math.hypot(v[2] - v[0], v[3] - v[1]);
      if (d >= lagm) { n++; lengd += d; }
    }
    yfirlit.push({ breidd: l, strik: strik.length, long: n, lengd: Math.round(lengd) });
    if (b < 0.3 || n < 40) continue;
    if (lengd > bestS) { bestS = lengd; best = l; }
  }
  yfirlit.sort((a, c) => c.lengd - a.lengd);
  return { valinn: best, yfirlit };
}

/** Teiknar strik (pt) í blekmaska w×h við `kvardi` dílar á punkt, `breidd` dílar á þykkt. */
export function teiknaStrikIMaska(strik: Strik[], w: number, h: number, kvardi: number, breidd = 2): Uint8Array {
  const m = new Uint8Array(w * h);
  const r0 = Math.floor((breidd - 1) / 2), r1 = breidd - 1 - r0;
  const stimpla = (x: number, y: number) => {
    for (let yy = y - r0; yy <= y + r1; yy++) {
      if (yy < 0 || yy >= h) continue;
      const rod = yy * w;
      for (let xx = x - r0; xx <= x + r1; xx++) if (xx >= 0 && xx < w) m[rod + xx] = 1;
    }
  };
  for (const [ax, ay, bx, by] of strik) {
    const x0 = ax * kvardi, y0 = ay * kvardi, x1 = bx * kvardi, y1 = by * kvardi;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let k = 0; k <= n; k++) stimpla(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n));
  }
  return m;
}

/** Veggur úr pöruðum línum: miðlína [x0, y0, x1, y1] (pt) og þykkt (pt). */
export interface PdfVeggur {
  a: [number, number];
  b: [number, number];
  thykkt: number;
}

type Bil = [number, number];

/** Sameinar bil (raðað, með vikmörkum) og dregur frá. */
function sameinaBil(bil: Bil[], vik: number): Bil[] {
  const r = bil.slice().sort((x, y) => x[0] - y[0]);
  const ut: Bil[] = [];
  for (const [a, b] of r) {
    const s = ut[ut.length - 1];
    if (s && a <= s[1] + vik) s[1] = Math.max(s[1], b);
    else ut.push([a, b]);
  }
  return ut;
}
function dragaFra(bil: Bil[], burt: Bil[]): Bil[] {
  let ut = bil;
  for (const [c, d] of burt) {
    const n: Bil[] = [];
    for (const [a, b] of ut) {
      if (d <= a || c >= b) { n.push([a, b]); continue; }
      if (c > a) n.push([a, c]);
      if (d < b) n.push([d, b]);
    }
    ut = n;
  }
  return ut;
}
function snidBil(x: Bil[], y: Bil[]): Bil[] {
  const ut: Bil[] = [];
  for (const [a, b] of x) for (const [c, d] of y) {
    const s = Math.max(a, c), e = Math.min(b, d);
    if (e > s) ut.push([s, e]);
  }
  return ut;
}

/** Parar samsíða veggjalínur í veggi (pdf2plot-hugsunin: CAD teiknar vegg sem tvær samsíða línur með veggþykkt á milli).
 * Línur eru fyrst sameinaðar (CAD brýtur þær oft upp); hver hluti línu parast við NÆSTU samsíða línu hvoru megin innan
 * [minT, maxT], svo útveggur parist ekki við næsta vegg. Allt í pt. */
export function paraVeggi(strik: Strik[], opt: { minT?: number; maxT?: number; minLengd?: number } = {}): PdfVeggur[] {
  const minT = opt.minT ?? 1.5, maxT = opt.maxT ?? 20, minLengd = opt.minLengd ?? 6;
  type Lina = { th: number; rho: number; bil: Bil[] };
  const hrar: Lina[] = [];
  for (const [x0, y0, x1, y1] of strik) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 1) continue;
    let th = Math.atan2(dy, dx);
    if (th < 0) th += Math.PI;
    if (th >= Math.PI - 1e-9) th -= Math.PI;
    const c = Math.cos(th), s = Math.sin(th);
    const t0 = c * x0 + s * y0, t1 = c * x1 + s * y1;
    hrar.push({ th, rho: -s * x0 + c * y0, bil: [[Math.min(t0, t1), Math.max(t0, t1)]] });
  }
  // flokka eftir stefnu (0,6°) og fjarlægð frá upphafi (0,3 pt), sameina bil
  hrar.sort((p, q) => p.th - q.th || p.rho - q.rho);
  const STEFNA = 0.01;
  const hopar: Lina[][] = [];
  for (const l of hrar) {
    const h = hopar[hopar.length - 1];
    if (h && l.th - h[h.length - 1].th < STEFNA) h.push(l);
    else hopar.push([l]);
  }
  // stefna nálægt π er sama og nálægt 0
  if (hopar.length > 1 && Math.PI - hopar[hopar.length - 1][0].th + hopar[0][hopar[0].length - 1].th < STEFNA) {
    const sidast = hopar.pop()!;
    for (const l of sidast) { l.th -= Math.PI; l.rho = -l.rho; l.bil = l.bil.map(([a, b]) => [-b, -a]); }
    hopar[0].unshift(...sidast);
  }
  const veggir: PdfVeggur[] = [];
  for (const hopur of hopar) {
    const th = hopur.reduce((s, l) => s + l.th, 0) / hopur.length;
    const c = Math.cos(th), s = Math.sin(th);
    hopur.sort((p, q) => p.rho - q.rho);
    const linur: Lina[] = [];
    for (const l of hopur) {
      const f = linur[linur.length - 1];
      if (f && l.rho - f.rho < 0.3) f.bil.push(...l.bil);
      else linur.push({ th, rho: l.rho, bil: l.bil.slice() });
    }
    for (const l of linur) l.bil = sameinaBil(l.bil, 0.5).filter(([a, b]) => b - a >= minLengd * 0.5);
    // Pör tekin í vaxandi fjarlægð yfir allan hópinn; hver hluti línu tilheyrir AÐEINS einum vegg (einn flötur veggjar),
    // svo lína sem þegar er pöruð parast ekki þvert yfir þröngt bil við næsta vegg.
    const por: [number, number, number][] = [];
    for (let i = 0; i < linur.length; i++) {
      for (let j = i + 1; j < linur.length; j++) {
        const d = linur[j].rho - linur[i].rho;
        if (d > maxT) break;
        if (d >= minT) por.push([d, i, j]);
      }
    }
    por.sort((x, y) => x[0] - y[0]);
    const notad: Bil[][] = linur.map(() => []);
    for (const [d, i, j] of por) {
      const sam = snidBil(dragaFra(linur[i].bil, notad[i]), dragaFra(linur[j].bil, notad[j])).filter(([a, b]) => b - a >= minLengd);
      if (!sam.length) continue;
      const rho = (linur[i].rho + linur[j].rho) / 2;
      for (const [a, b] of sam) {
        veggir.push({ a: [c * a - s * rho, s * a + c * rho], b: [c * b - s * rho, s * b + c * rho], thykkt: d });
      }
      notad[i].push(...sam);
      notad[j].push(...sam);
    }
  }
  return veggir;
}
