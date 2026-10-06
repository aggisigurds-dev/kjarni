// Skörp skönnun — hreinn kjarni (engin DOM, engin vinnuþráðartenging): lestur TIF-díla í gegnum litaspjald og snúning,
// val snúnings með fylgni við JPEG skjalasafnsins, og endursýnataka TIF-frumritsins inn í ramma JPEG-sins.
//
// Agnar 05.10.2026 (Center Hótel Þingholt): skjalasafnið afhendir 6006 px JPEG sem er mjög þjappað (suð, loðnir stafir)
// en frumritið er TIF (Þingholt kjallari: 7016 × 4961, 8 bita litaspjald, LZW, snúningur 3 = 180°). Teikning-glugginn
// (438-teikning-skarpt.js) sýnir frumritið; TurboPaint setur það nú á borðið. Úttektarmerkin eru vistuð í dílum
// JPEG-sins (frum b × h), svo TIF-ið er teiknað Í RAMMA JPEG-SINS: JPEG-díll j = kp · TIF-díll t + f (kp = frum.b /
// birtingarbreidd TIF, f = hliðrun sem mæld er með fylgni, sbr. 438 hlidrun). Borðmyndin fær þá sömu stærð og JPEG-ið
// hefði fengið og merkin lenda á nákvæmlega sama stað — aðeins skarpari teikning undir þeim.

/** Pakkaður díll: R | G << 8 | B << 16 (sama bætaröð og ImageData á little-endian vél, án alfa). */
export type Dill = number;
export type Lesari = (x: number, y: number) => Dill;

/** Það sem kjarninn þarf úr UTIF-IFD. */
export interface TifIfd {
  width: number;
  height: number;
  data: Uint8Array;
  t262?: number[];
  t258?: number[];
  t320?: number[];
  t274?: number[];
}

/** Lesari hrárra díla: grátóna/tvílit (1/4/8 bita), litaspjald (4/8 bita, t320), RGB(A) 8 bita. Annað fer í gegnum
 * `toRGBA8` (UTIF) — dýrara en virkar á allt. (438 lesari.) */
export function lesari(f: TifIfd, toRGBA8?: () => Uint8Array): Lesari {
  const d = f.data, w = f.width;
  const ip = f.t262 ? f.t262[0] : 2;
  const bps = f.t258 ? f.t258[0] : 1;
  const spp = f.t258 ? f.t258.length : 1;
  const bpl = Math.ceil((w * bps * spp) / 8);
  if ((ip === 0 || ip === 1) && spp === 1 && (bps === 1 || bps === 4 || bps === 8)) {
    const mx = (1 << bps) - 1, lut = new Uint32Array(mx + 1);
    for (let v = 0; v <= mx; v++) {
      let g = Math.round((v * 255) / mx);
      if (ip === 0) g = 255 - g;
      lut[v] = g | (g << 8) | (g << 16);
    }
    if (bps === 8) return (x, y) => lut[d[y * bpl + x]];
    if (bps === 4) return (x, y) => lut[(d[y * bpl + (x >> 1)] >> (4 - 4 * (x & 1))) & 15];
    return (x, y) => lut[(d[y * bpl + (x >> 3)] >> (7 - (x & 7))) & 1];
  }
  if (ip === 3 && spp === 1 && (bps === 4 || bps === 8) && f.t320) {
    const n = 1 << bps, m = f.t320, lut = new Uint32Array(n);
    for (let v = 0; v < n; v++) lut[v] = (m[v] >> 8) | ((m[n + v] >> 8) << 8) | ((m[2 * n + v] >> 8) << 16);
    if (bps === 8) return (x, y) => lut[d[y * bpl + x]];
    return (x, y) => lut[(d[y * bpl + (x >> 1)] >> (4 - 4 * (x & 1))) & 15];
  }
  if (ip === 2 && bps === 8 && (spp === 3 || spp === 4)) {
    return (x, y) => {
      const i = y * bpl + x * spp;
      return d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
    };
  }
  if (!toRGBA8) throw new Error("Óþekkt TIF-snið");
  const r = toRGBA8();
  return (x, y) => {
    const i = (y * w + x) * 4;
    return r[i] | (r[i + 1] << 8) | (r[i + 2] << 16);
  };
}

/** Birtingarstærð eftir snúningi (TIFF Orientation 1–8): 5–8 víxla breidd og hæð. */
export function birtStaerd(o: number, W: number, H: number): { dW: number; dH: number } {
  return o > 4 ? { dW: H, dH: W } : { dW: W, dH: H };
}

/** Lesari í BIRTINGARhnitum: birtingardíll (x, y) → hrár díll, fyrir alla átta snúningana (438 varp). */
export function lesariBirt(les: Lesari, o: number, W: number, H: number): Lesari {
  switch (o) {
    case 2: return (x, y) => les(W - 1 - x, y);
    case 3: return (x, y) => les(W - 1 - x, H - 1 - y);
    case 4: return (x, y) => les(x, H - 1 - y);
    case 5: return (x, y) => les(y, x);
    case 6: return (x, y) => les(y, H - 1 - x);
    case 7: return (x, y) => les(W - 1 - y, H - 1 - x);
    case 8: return (x, y) => les(W - 1 - y, x);
    default: return les;
  }
}

export interface SnuningsKostur {
  o: number;
  dW: number;
  dH: number;
  /** JPEG-dílar á TIF-díl (frum.b / dW). */
  kp: number;
}

/** Snúningar sem passa við hlutföll JPEG-sins (innan 1,5 %), eins og 438 saekjaTif. */
export function snuningsKostir(W: number, H: number, frum: { b: number; h: number }): SnuningsKostur[] {
  const ut: SnuningsKostur[] = [];
  for (let o = 1; o <= 8; o++) {
    const { dW, dH } = birtStaerd(o, W, H);
    const kp = frum.b / dW;
    if (!frum.h || Math.abs(dH * kp - frum.h) < frum.h * 0.015) ut.push({ o, dW, dH, kp });
  }
  return ut;
}

/** n × n grátónanet af svæði í birtingarhnitum (5 × 5 sýni í reit) — mælistika snúnings (438 „syni"). */
export function synishornTif(lesB: Lesari, dW: number, dH: number, r: { x: number; y: number; w: number; h: number }, n: number): Float32Array {
  const a = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let b = 0; b < 5; b++) {
        for (let k = 0; k < 5; k++) {
          const x = Math.min(dW - 1, Math.max(0, Math.floor(r.x + ((i + (k + 0.5) / 5) * r.w) / n)));
          const y = Math.min(dH - 1, Math.max(0, Math.floor(r.y + ((j + (b + 0.5) / 5) * r.h) / n)));
          const u = lesB(x, y);
          s += (u & 255) + ((u >> 8) & 255) + ((u >> 16) & 255);
        }
      }
      a[j * n + i] = s / 75;
    }
  }
  return a;
}

/** Pearson-fylgni tveggja jafnlangra raða. */
export function fylgni(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

export function midgildi(v: number[]): number {
  const a = v.slice().sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Stærð borðmyndarinnar (dílar) í ramma JPEG-sins: upplausn TIF-sins (aldrei uppskalað), langhlið ≤ maxPx og flatarmál
 * ≤ maxArea (sama 40 MP þak og annar innflutningur). Hlutföll = hlutföll JPEG-sins, svo hnit merkja haldast. */
export function rammaStaerd(dW: number, frum: { b: number; h: number }, maxPx: number, maxArea: number): { w: number; h: number } {
  let w = dW, h = (dW * frum.h) / frum.b;
  const lang = Math.max(w, h);
  if (lang > maxPx) {
    w *= maxPx / lang;
    h *= maxPx / lang;
  }
  if (w * h > maxArea) {
    const k = Math.sqrt(maxArea / (w * h));
    w *= k;
    h *= k;
  }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/** Flatarvægi einnar víddar: úttaksdíll u nær yfir [u·c, (u+1)·c) í JPEG-dílum = [(u·c − f)/k, ((u+1)·c − f)/k) í
 * TIF-dílum. Skilar fyrsta TIF-díl, fjölda og vægi (summa 1) fyrir hvern úttaksdíl. Dílar utan TIF-sins fá vægi
 * eins og aðrir (lesnir sem hvítt). */
export function vaegiVidd(n: number, c: number, f: number, k: number) {
  const spann = c / k;
  const K = Math.ceil(spann) + 1;
  const byrjun = new Int32Array(n), fjoldi = new Uint8Array(n), vaegi = new Float32Array(n * K);
  for (let u = 0; u < n; u++) {
    const s0 = (u * c - f) / k, s1 = ((u + 1) * c - f) / k;
    const i0 = Math.floor(s0);
    byrjun[u] = i0;
    let m = 0;
    for (let i = i0; i < s1 && m < K; i++, m++) vaegi[u * K + m] = (Math.min(s1, i + 1) - Math.max(s0, i)) / spann;
    fjoldi[u] = m;
  }
  return { byrjun, fjoldi, vaegi, K };
}

/** TIF-frumritið endursýnt Í RAMMA JPEG-SINS: úttak w × h RGBA, þar sem úttaksdíll (u, v) = JPEG-svæðið
 * [u·frum.b/w, …) × [v·frum.h/h, …), og JPEG-díll j = kp · t + f. Flatarvegið meðaltal (rétt minnkun, engin
 * „nearest neighbour"-gára). Utan TIF-sins: hvítt. */
export function teiknaIRamma(
  lesB: Lesari,
  dW: number,
  dH: number,
  ut: { w: number; h: number },
  frum: { b: number; h: number },
  vorpun: { kpx: number; kpy: number; fx: number; fy: number },
  framvinda?: (hlutfall: number) => void
): Uint8ClampedArray {
  const X = vaegiVidd(ut.w, frum.b / ut.w, vorpun.fx, vorpun.kpx);
  const Y = vaegiVidd(ut.h, frum.h / ut.h, vorpun.fy, vorpun.kpy);
  const px = new Uint8ClampedArray(ut.w * ut.h * 4);
  const HVITT = 255 | (255 << 8) | (255 << 16);
  const les = (x: number, y: number) => (x < 0 || y < 0 || x >= dW || y >= dH ? HVITT : lesB(x, y));
  for (let v = 0; v < ut.h; v++) {
    const y0 = Y.byrjun[v], ny = Y.fjoldi[v], oy = v * Y.K;
    for (let u = 0; u < ut.w; u++) {
      const x0 = X.byrjun[u], nx = X.fjoldi[u], ox = u * X.K;
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < ny; j++) {
        const wy = Y.vaegi[oy + j];
        for (let i = 0; i < nx; i++) {
          const wgt = wy * X.vaegi[ox + i];
          const d = les(x0 + i, y0 + j);
          r += (d & 255) * wgt;
          g += ((d >> 8) & 255) * wgt;
          b += ((d >> 16) & 255) * wgt;
        }
      }
      const o = (v * ut.w + u) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
    if (framvinda && (v & 255) === 0) framvinda(v / ut.h);
  }
  return px;
}
