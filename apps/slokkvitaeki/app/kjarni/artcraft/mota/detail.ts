/** Upplausn eftir gervigreindartól — hreinar aðgerðir, prófaðar í node.
 *
 *  Mörg Replicate-líkön skila minni mynd en þau fá (IC-Light ~0,7 MP, Bria og
 *  Pruna ~1 MP). Ef útkoman væri sett beint inn yrði 5 MP mynd að ~1 MP mynd.
 *  `restoreDetail` setur hana aftur í fulla stærð: lága tíðnin (litur, ljós,
 *  nýtt efni) kemur úr útkomunni, fínu smáatriðin (hár, áferð, letur) úr
 *  frumritinu — en aðeins þar sem útkoman er enn sama myndin. Þar sem líkanið
 *  bjó til nýtt efni (nýr bakgrunnur, fjarlægður hlutur) er smáatriðum
 *  frumritsins sleppt, annars sæjust draugar af gamla bakgrunninum. */

import type { Raster } from "../studio/adjust";

/** Flatarmálsmeðaltal (box) — smækkar `src` (sw×sh, `ch` rásir, Float32 eða
 *  Uint8) í dw×dh. Hver upprunapixill dreifist á 1–2 markpixla í hvora átt
 *  eftir skörun, svo engir pixlar falla út (ólíkt bilinear í einu stökki). */
export function downscaleArea(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  ch: number,
): Float32Array {
  const out = new Float32Array(dw * dh * ch);
  const rx = dw / sw;
  const ry = dh / sh;
  // Fyrir hvern upprunadálk: markdálkur og vægi (skörun í markeiningum).
  const xj = new Int32Array(sw);
  const xw0 = new Float32Array(sw);
  for (let x = 0; x < sw; x++) {
    const a = x * rx;
    const b = (x + 1) * rx;
    const j = Math.min(dw - 1, Math.floor(a));
    xj[x] = j;
    xw0[x] = Math.min(b, j + 1) - a; // afgangurinn (rx - xw0) fer á j+1
  }
  const row = new Float32Array(dw * ch);
  for (let y = 0; y < sh; y++) {
    row.fill(0);
    const base = y * sw * ch;
    for (let x = 0; x < sw; x++) {
      const j = xj[x];
      const w0 = xw0[x];
      const w1 = rx - w0;
      const s = base + x * ch;
      const d = j * ch;
      for (let c = 0; c < ch; c++) {
        const v = src[s + c];
        row[d + c] += v * w0;
        if (w1 > 1e-7 && j + 1 < dw) row[d + ch + c] += v * w1;
      }
    }
    const a = y * ry;
    const b = (y + 1) * ry;
    const i = Math.min(dh - 1, Math.floor(a));
    const wy0 = Math.min(b, i + 1) - a;
    const wy1 = ry - wy0;
    const o0 = i * dw * ch;
    for (let k = 0; k < dw * ch; k++) out[o0 + k] += row[k] * wy0;
    if (wy1 > 1e-7 && i + 1 < dh) {
      const o1 = o0 + dw * ch;
      for (let k = 0; k < dw * ch; k++) out[o1 + k] += row[k] * wy1;
    }
  }
  return out;
}

/** Bilinear gildi úr rist (gw×gh, `ch` rásir) á staðsetningu sem samsvarar
 *  pixlamiðju (x, y) í mynd af stærð W×H. */
function bilinearSampler(grid: Float32Array, gw: number, gh: number, ch: number, W: number, H: number) {
  const sx = gw / W;
  const sy = gh / H;
  const x0s = new Int32Array(W);
  const x1s = new Int32Array(W);
  const fxs = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) * sx - 0.5));
    const x0 = Math.floor(gx);
    x0s[x] = x0;
    x1s[x] = Math.min(gw - 1, x0 + 1);
    fxs[x] = gx - x0;
  }
  return {
    row(y: number) {
      const gy = Math.min(gh - 1, Math.max(0, (y + 0.5) * sy - 0.5));
      const y0 = Math.floor(gy);
      const y1 = Math.min(gh - 1, y0 + 1);
      const fy = gy - y0;
      return { r0: y0 * gw, r1: y1 * gw, fy };
    },
    get(r: { r0: number; r1: number; fy: number }, x: number, c: number): number {
      const a = (r.r0 + x0s[x]) * ch + c;
      const b = (r.r0 + x1s[x]) * ch + c;
      const d = (r.r1 + x0s[x]) * ch + c;
      const e = (r.r1 + x1s[x]) * ch + c;
      const fx = fxs[x];
      const top = grid[a] + (grid[b] - grid[a]) * fx;
      const bot = grid[d] + (grid[e] - grid[d]) * fx;
      return top + (bot - top) * r.fy;
    },
  };
}

/** Kassaþoka (radíus r) á einni rás — aðskiljanleg, með jaðarklemmu. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[o + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / n;
      s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function luminance(rgba: Float32Array, n: number, ch: number): Float32Array {
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    L[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }
  return L;
}

/** Sama hlutfall breiddar/hæðar (innan `tolerance`)? */
export function sameAspect(aw: number, ah: number, bw: number, bh: number, tolerance = 0.015): boolean {
  const a = aw / ah;
  const b = bw / bh;
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
}

export type RestoreOptions = {
  /** 0–1: hversu mikið af smáatriðum frumritsins kemur aftur (1 = öll). */
  strength?: number;
  /** Lengri hlið greiningarristarinnar (samsvörun reiknuð þar). */
  analysisMax?: number;
};

/** Útkoma gervigreindar (`result`, minni) sett í stærð frumritsins (`source`)
 *  með smáatriðum frumritsins þar sem myndirnar eru enn sama myndin.
 *
 *  Ú = k·F + upp(Ú_lág − k·F_lág)
 *  F = frumrit, F_lág = frumrit smækkað í stærð útkomunnar, k = vægi 0…~2:
 *  samsvörun (staðbundin fylgni birtu — óháð ljósbreytingu — og sami litblær)
 *  × birtuhlutfall
 *  (dekkra svæði fær daufari smáatriði) × `strength`. Þar sem k = 0 er
 *  útkoman einfaldlega stækkuð. */
export function restoreDetail(source: Raster, result: Raster, options: RestoreOptions = {}): Raster {
  const strength = Math.max(0, Math.min(1, options.strength ?? 1));
  const W = source.width;
  const H = source.height;
  const w = result.width;
  const h = result.height;
  const out = new Uint8ClampedArray(W * H * 4);

  // 1) Frumritið smækkað í stærð útkomunnar.
  const sLow = downscaleArea(source.data, W, H, w, h, 4);
  const rLow = Float32Array.from(result.data);

  // 2) Greiningarrist: samsvörun og birtuhlutfall.
  const amax = Math.max(16, options.analysisMax ?? 640);
  const ak = Math.min(1, amax / Math.max(w, h));
  const aw = Math.max(1, Math.round(w * ak));
  const ah = Math.max(1, Math.round(h * ak));
  const Ls = downscaleArea(luminance(sLow, w * h, 4), w, h, aw, ah, 1);
  const Lr = downscaleArea(luminance(rLow, w * h, 4), w, h, aw, ah, 1);
  const n = aw * ah;
  const ss = new Float32Array(n);
  const rr = new Float32Array(n);
  const sr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ss[i] = Ls[i] * Ls[i];
    rr[i] = Lr[i] * Lr[i];
    sr[i] = Ls[i] * Lr[i];
  }
  const R = 2;
  const ms = boxBlur(Ls, aw, ah, R);
  const mr = boxBlur(Lr, aw, ah, R);
  const mss = boxBlur(ss, aw, ah, R);
  const mrr = boxBlur(rr, aw, ah, R);
  const msr = boxBlur(sr, aw, ah, R);
  // Litblær (rgb deilt með summu) — ljósbreyting hnikar honum lítið, nýtt
  // efni (blár veggur í stað grás) mikið. Grípur nýtt efni sem er slétt í
  // lágri upplausn en þar sem frumritið hafði fína áferð (sem yrði draugur).
  const Cs = downscaleArea(sLow, w, h, aw, ah, 4);
  const Cr = downscaleArea(rLow, w, h, aw, ah, 4);
  const chromaDiff = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const ts = Cs[o] + Cs[o + 1] + Cs[o + 2] + 30;
    const tr = Cr[o] + Cr[o + 1] + Cr[o + 2] + 30;
    chromaDiff[i] =
      Math.abs((Cs[o] + 10) / ts - (Cr[o] + 10) / tr) + Math.abs((Cs[o + 2] + 10) / ts - (Cr[o + 2] + 10) / tr);
  }
  const cd = boxBlur(chromaDiff, aw, ah, R);
  const k = new Float32Array(n);
  const FLAT = 9; // dreifni (≈ 3 gráþrep staðalfrávik) — undir því telst svæðið slétt
  for (let i = 0; i < n; i++) {
    const vs = Math.max(0, mss[i] - ms[i] * ms[i]);
    const vr = Math.max(0, mrr[i] - mr[i] * mr[i]);
    let match: number;
    if (vs < FLAT) {
      match = 1; // slétt í lágri upplausn: sama efni nema litblærinn segi annað (hér að neðan)
    } else if (vr < FLAT) {
      match = 0; // frumritið með mynstri, útkoman slétt: nýtt eða lagfært efni
    } else {
      const ncc = (msr[i] - ms[i] * mr[i]) / Math.sqrt(vs * vr);
      const t = Math.min(1, Math.max(0, (ncc - 0.35) / 0.4));
      match = t * t * (3 - 2 * t);
    }
    const tc = Math.min(1, Math.max(0, (cd[i] - 0.1) / 0.15));
    match *= 1 - tc * tc * (3 - 2 * tc);
    const gain = Math.min(2, Math.max(0.3, (mr[i] + 8) / (ms[i] + 8)));
    k[i] = match * gain * strength;
  }
  const kSmooth = boxBlur(k, aw, ah, 1);

  // 3) Grunnurinn í lágri upplausn: Ú_lág − k·F_lág (alfa: bara útkoman).
  const kLow = bilinearSampler(kSmooth, aw, ah, 1, w, h);
  const baseLow = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const kr = kLow.row(y);
    for (let x = 0; x < w; x++) {
      const kv = kLow.get(kr, x, 0);
      const o = (y * w + x) * 4;
      baseLow[o] = rLow[o] - kv * sLow[o];
      baseLow[o + 1] = rLow[o + 1] - kv * sLow[o + 1];
      baseLow[o + 2] = rLow[o + 2] - kv * sLow[o + 2];
      baseLow[o + 3] = rLow[o + 3];
    }
  }

  // 4) Full stærð: k·F + upp(grunnur). Lóðrétt brúun fyrst í eina röð, svo
  //    lárétt með fyrirfram reiknuðum vísum — hraðara en sýnataka á pixil.
  const src = source.data;
  const axis = (len: number, gridLen: number) => {
    const i0 = new Int32Array(len);
    const i1 = new Int32Array(len);
    const f = new Float32Array(len);
    const sc = gridLen / len;
    for (let i = 0; i < len; i++) {
      const g = Math.min(gridLen - 1, Math.max(0, (i + 0.5) * sc - 0.5));
      const a = Math.floor(g);
      i0[i] = a;
      i1[i] = Math.min(gridLen - 1, a + 1);
      f[i] = g - a;
    }
    return { i0, i1, f };
  };
  const bx = axis(W, w);
  const by = axis(H, h);
  const kx = axis(W, aw);
  const ky = axis(H, ah);
  const baseRow = new Float32Array(w * 4);
  const kRow = new Float32Array(aw);
  for (let y = 0; y < H; y++) {
    const b0 = by.i0[y] * w * 4;
    const b1 = by.i1[y] * w * 4;
    const fyb = by.f[y];
    for (let i = 0; i < w * 4; i++) baseRow[i] = baseLow[b0 + i] + (baseLow[b1 + i] - baseLow[b0 + i]) * fyb;
    const k0 = ky.i0[y] * aw;
    const k1 = ky.i1[y] * aw;
    const fyk = ky.f[y];
    for (let i = 0; i < aw; i++) kRow[i] = kSmooth[k0 + i] + (kSmooth[k1 + i] - kSmooth[k0 + i]) * fyk;
    let o = y * W * 4;
    for (let x = 0; x < W; x++, o += 4) {
      const ka = kRow[kx.i0[x]];
      const kv = ka + (kRow[kx.i1[x]] - ka) * kx.f[x];
      const p0 = bx.i0[x] * 4;
      const p1 = bx.i1[x] * 4;
      const fx = bx.f[x];
      out[o] = kv * src[o] + baseRow[p0] + (baseRow[p1] - baseRow[p0]) * fx;
      out[o + 1] = kv * src[o + 1] + baseRow[p0 + 1] + (baseRow[p1 + 1] - baseRow[p0 + 1]) * fx;
      out[o + 2] = kv * src[o + 2] + baseRow[p0 + 2] + (baseRow[p1 + 2] - baseRow[p0 + 2]) * fx;
      out[o + 3] = baseRow[p0 + 3] + (baseRow[p1 + 3] - baseRow[p0 + 3]) * fx;
    }
  }
  return { data: out, width: W, height: H };
}

// ---------------------------------------------------------------- ljós eingöngu

/** Ljósið úr endurlýstri útkomu (`result`, minni) flutt á frumritið
 *  (`source`) — en ALDREI lögun, andlit eða litir hluta. IC-Light teiknar alla
 *  myndina upp á nýtt (önnur manneskja, rós sem verður græn); hér er aðeins
 *  notað hvernig BIRTAN breyttist staðbundið og hvaða LITBLÆ ljósið hefur.
 *
 *  1) Birta: staðbundin línuleg vörpun (guided filter) á birtugildum,
 *     L' ≈ a·L + b. Þar sem útkoman fylgir frumritinu nær hún skuggum og
 *     glampa; þar sem líkanið teiknaði annað (lág fylgni) verður hún hreinn
 *     styrkur a = meðal(L_ú)/meðal(L_f).
 *  2) Litblær ljóssins: mjög mjúkt (≈20 % af myndinni) hlutfall litar/birtu,
 *     svo hlýtt sólsetur litar myndina en einstakir hlutir halda sínum lit.
 *  Útkoma: F · (L'/L) · litblær — sama myndin, ný lýsing. Reiknað í lágri
 *  upplausn, beitt á fulla. */
export function transferLighting(source: Raster, result: Raster, options: { radius?: number } = {}): Raster {
  const W = source.width;
  const H = source.height;
  const w = result.width;
  const h = result.height;
  const n = w * h;
  const r = Math.max(2, Math.round(options.radius ?? Math.max(w, h) * 0.008));
  const rTint = Math.max(4, Math.round(Math.max(w, h) * 0.2));
  const sLow = downscaleArea(source.data, W, H, w, h, 4);
  const Ls = luminance(sLow, n, 4);
  const rLow = Float32Array.from(result.data);
  const Lr = luminance(rLow, n, 4);

  // 1) Birta: a, b.
  const II = new Float32Array(n);
  const IP = new Float32Array(n);
  const PP = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    II[i] = Ls[i] * Ls[i];
    IP[i] = Ls[i] * Lr[i];
    PP[i] = Lr[i] * Lr[i];
  }
  const mI = boxBlur(Ls, w, h, r);
  const mP = boxBlur(Lr, w, h, r);
  const mII = boxBlur(II, w, h, r);
  const mIP = boxBlur(IP, w, h, r);
  const mPP = boxBlur(PP, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  const EPS = 25; // dreifni (5 gráþrep) — hindrar að suð í sléttum flötum ráði a
  for (let i = 0; i < n; i++) {
    const varI = Math.max(0, mII[i] - mI[i] * mI[i]);
    const varP = Math.max(0, mPP[i] - mP[i] * mP[i]);
    const cov = mIP[i] - mI[i] * mP[i];
    const gain = Math.min(4, Math.max(0.05, (mP[i] + 4) / (mI[i] + 4)));
    const fit = cov / (varI + EPS);
    const rho = cov / Math.sqrt(varI * varP + 1);
    const t0 = Math.min(1, Math.max(0, (rho - 0.4) / 0.4));
    const t = t0 * t0 * (3 - 2 * t0);
    // Andstæður mega ekki hverfa (a ≥ 35 % af styrknum) né springa (≤ 3×).
    const av = Math.min(gain * 3, Math.max(gain * 0.35, t * fit + (1 - t) * gain));
    a[i] = av;
    b[i] = mP[i] - av * mI[i];
  }
  const A = boxBlur(a, w, h, r);
  const B = boxBlur(b, w, h, r);

  // 2) Litblær ljóssins (mjúkur).
  const T: Float32Array[] = [];
  const LsBig = boxBlur(Ls, w, h, rTint);
  const LrBig = boxBlur(Lr, w, h, rTint);
  const chan = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) chan[i] = sLow[i * 4 + c];
    const sBig = boxBlur(chan, w, h, rTint);
    for (let i = 0; i < n; i++) chan[i] = rLow[i * 4 + c];
    const rBig = boxBlur(chan, w, h, rTint);
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = ((rBig[i] + 4) / (LrBig[i] + 4)) / ((sBig[i] + 4) / (LsBig[i] + 4));
      t[i] = Math.min(1.25, Math.max(0.8, v));
    }
    T.push(t);
  }

  // Fullri upplausn: F · (a·L + b)/L · litblær, öll gildi brúuð línulega.
  const out = new Uint8ClampedArray(W * H * 4);
  const src = source.data;
  const sx = w / W;
  const sy = h / H;
  const x0 = new Int32Array(W);
  const x1 = new Int32Array(W);
  const fx = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const g = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
    x0[x] = Math.floor(g);
    x1[x] = Math.min(w - 1, x0[x] + 1);
    fx[x] = g - x0[x];
  }
  const grids = [A, B, T[0], T[1], T[2]];
  const rows = grids.map(() => new Float32Array(w));
  const vals = new Float32Array(grids.length);
  for (let y = 0; y < H; y++) {
    const g = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(g);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = g - y0;
    const o0 = y0 * w;
    const o1 = y1 * w;
    for (let k = 0; k < grids.length; k++) {
      const grid = grids[k];
      const row = rows[k];
      for (let x = 0; x < w; x++) row[x] = grid[o0 + x] + (grid[o1 + x] - grid[o0 + x]) * fy;
    }
    let o = y * W * 4;
    for (let x = 0; x < W; x++, o += 4) {
      const i0 = x0[x];
      const i1 = x1[x];
      const f = fx[x];
      for (let k = 0; k < grids.length; k++) {
        const row = rows[k];
        vals[k] = row[i0] + (row[i1] - row[i0]) * f;
      }
      const R = src[o];
      const G = src[o + 1];
      const Bl = src[o + 2];
      const L = 0.299 * R + 0.587 * G + 0.114 * Bl;
      const ratio = Math.min(6, Math.max(0.03, (vals[0] * L + vals[1] + 2) / (L + 2)));
      out[o] = R * ratio * vals[2];
      out[o + 1] = G * ratio * vals[3];
      out[o + 2] = Bl * ratio * vals[4];
      out[o + 3] = src[o + 3];
    }
  }
  return { data: out, width: W, height: H };
}

// ---------------------------------------------------------------- IC-Light

/** Stærðirnar sem IC-Light (zsxkib/ic-light og ic-light-background) tekur. */
export const IC_LIGHT_SIZES = [256, 320, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024] as const;

/** Breidd og hæð fyrir IC-Light sem næst hlutföllum myndarinnar, með lengri
 *  hlið í mesta lagi `maxSide` (líkanið er SD 1.5 — ~768 er þægilegt, og
 *  highres-skrefið stækkar svo). Sjálfgefið skilar líkanið 512×640 og klippir
 *  myndina í 4:5 — það var villan. */
export function icLightSize(width: number, height: number, maxSide = 768): { width: number; height: number } {
  const target = width / Math.max(1, height);
  let best = { width: 512, height: 640, err: Infinity, area: 0 };
  for (const w of IC_LIGHT_SIZES) {
    for (const h of IC_LIGHT_SIZES) {
      if (Math.max(w, h) > maxSide) continue;
      if (Math.max(w, h) < Math.min(maxSide, 640)) continue; // ekki of smátt
      const err = Math.abs(Math.log(w / h / target));
      const area = w * h;
      if (err < best.err - 1e-9 || (Math.abs(err - best.err) <= 1e-9 && area > best.area)) {
        best = { width: w, height: h, err, area };
      }
    }
  }
  return { width: best.width, height: best.height };
}

/** Hve mikið þarf að bæta við (hvorum megin) svo mynd sw×sh fái hlutfallið
 *  tw/th án þess að klippa — IC-Light klippir annars miðjuna út. */
export function padToAspect(sw: number, sh: number, tw: number, th: number): { width: number; height: number; x: number; y: number } {
  const target = tw / th;
  if (sw / sh < target) {
    const width = Math.round(sh * target);
    return { width, height: sh, x: Math.floor((width - sw) / 2), y: 0 };
  }
  const height = Math.round(sw / target);
  return { width: sw, height, x: 0, y: Math.floor((height - sh) / 2) };
}

// ---------------------------------------------------------------- skráarheiti

/** Nýtt skráarheiti í hvert sinn: „<nafn>-mota-20261105-143012.jpg“. Fyrri
 *  „-mota…“-endingar eru teknar af svo opnuð-og-vistuð mynd verði ekki
 *  „…-mota-mota.jpg“. Tími úr staðarklukku tækisins. */
export function motaFileName(name: string, ext: string, when: Date = new Date(), suffix = "mota", seq = 1): string {
  const base =
    name
      .replace(/\.[^.]+$/, "")
      .replace(/(-mota(-topaz)?(-\d{8}-\d{6}(-\d+)?)?)+$/i, "")
      .trim() || "mynd";
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`;
  return `${base}-${suffix}-${stamp}${seq > 1 ? `-${seq}` : ""}.${ext}`;
}
