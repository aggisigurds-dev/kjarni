/** „Búnaður af teikningu" — tákn með EINUM staf í ramma (Agnar 15.10.2026, Trönuhraun 10 / Lindaberg, skýringar
 * blaðsins): R í kassa = reykskynjari, H í kassa = hitaskynjari, S í hring = segulloki, B í hring = viðvörunarbjalla.
 *
 * OCR les ekki stakan staf í ramma: Tesseract (PSM 11) fann 0 af 9 á Trönuhraun 10, 1. hæð (5200 px), þótt „30m" og
 * „BO" læsust. Þess vegna er RAMMINN fundinn fyrst í blekgrímunni og stafurinn lesinn á eftir, einn og sér, í þrefaldri
 * stækkun (detect-firewalls.ts lesaStafi, PSM 10). Mælt á Trönuhraun 10 1. hæð (2012-blaðið): 8 kassar með R og 1 hringur
 * með S, enginn rangur (málsetningarkassar „EICS-30 / 1000" hafa tvær línur og falla á innri-þátta-reglunni; herbergja-
 * númer og flatarmál standa án ramma).
 *
 * Hreinar aðgerðir — engin skrif. */

import type { TaekjaTegund } from "./sjalftenging";
import type { Blek, Svaedi } from "./slt-brsl";

export interface RammaMerki {
  /** Miðja rammans (myndardílar). */
  x: number;
  y: number;
  /** Hálf breidd rammans (myndardílar). */
  r: number;
  form: "kassi" | "hringur";
  /** Innri þættir (stafurinn: 1, stundum 2 ef skönnunin klýfur hann). */
  inni: number;
  /** Rammi stafsins sjálfs (myndardílar) — reiturinn sem er lesinn. */
  stafur: Svaedi;
}

export interface BunadurStadur {
  x: number;
  y: number;
  tegund: TaekjaTegund;
  stafur: string;
  vissa: number;
  form: "kassi" | "hringur";
}

/** Stafur í ramma → tegund búnaðar. Formið er vísbending (log), ekki skilyrði: sumir hönnuðir setja R í hring. */
export function flokkaBunad(stafur: string): TaekjaTegund | null {
  const c = String(stafur || "").trim().toUpperCase();
  if (c === "R" || c === "K") return "reykskynjari"; // K: Tesseract les feitt R stundum sem K
  if (c === "S" || c === "5" || c === "$") return "segull";
  if (c === "H") return "hitaskynjari";
  if (c === "B" || c === "8") return "bjalla";
  return null;
}

/** Rammar með einum staf í blekgrímu OCR-myndarinnar (sjá detect-firewalls.ts lesaTextaTeikningar). `svaedi` = húsið á
 * myndinni (myndardílar) — rammar utan þess (skýringar, titilreitur) sleppt. `stafah` = dæmigerð stafahæð í myndardílum
 * (ræður stærðarbilinu: ramminn er 1,3–4 stafahæðir á kant); sjálfgefið 20. */
export function finnaRammaMerki(blek: Blek, svaedi?: Svaedi | null, stafah = 20, skra?: (lina: string) => void): RammaMerki[] {
  const { w: W, h: H, data: g, kvardi: k } = blek;
  const hk = Math.max(6, stafah * k);
  const MIN = Math.round(1.3 * hk), MAX = Math.round(4.2 * hk);
  // samfelldir þættir (8-nágrannar) á hrárri grímunni — merkt í einni umferð, bbox hvers þáttar geymt
  const lab = new Int32Array(W * H);
  const stafli = new Int32Array(W * H);
  type Th = { id: number; n: number; x0: number; y0: number; x1: number; y1: number };
  const thaettir: Th[] = [];
  let id = 0;
  for (let s = 0; s < W * H; s++) {
    if (!g[s] || lab[s]) continue;
    id++;
    let sp = 0;
    stafli[sp++] = s;
    lab[s] = id;
    let n = 0, mnx = W, mny = H, mxx = 0, mxy = 0;
    while (sp) {
      const j = stafli[--sp];
      n++;
      const x = j % W, y = (j / W) | 0;
      if (x < mnx) mnx = x;
      if (x > mxx) mxx = x;
      if (y < mny) mny = y;
      if (y > mxy) mxy = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (g[q] && !lab[q]) {
            lab[q] = id;
            stafli[sp++] = q;
          }
        }
      }
    }
    thaettir.push({ id, n, x0: mnx, y0: mny, x1: mxx, y1: mxy });
  }
  const ut: RammaMerki[] = [];
  for (const c of thaettir) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    if (bw < MIN || bh < MIN || bw > MAX || bh > MAX) continue;
    if (Math.max(bw, bh) / Math.min(bw, bh) > 1.35) continue;
    if (c.n / (bw * bh) > 0.45) continue; // gegnheilt: súla, fyllt tákn
    const mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2;
    if (svaedi && (mx / k < svaedi.x0 || my / k < svaedi.y0 || mx / k > svaedi.x1 || my / k > svaedi.y1)) continue;
    // lokað form: allar 32 stefnur frá miðjunni rekast á þáttinn
    const NA = 32, R = Math.max(bw, bh) * 0.8;
    let lok = 0;
    for (let a = 0; a < NA; a++) {
      const cs = Math.cos((2 * Math.PI * a) / NA), sn = Math.sin((2 * Math.PI * a) / NA);
      let hit = false;
      for (let r = 1; r <= R; r++) {
        const xx = Math.round(mx + r * cs), yy = Math.round(my + r * sn);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
        if (lab[yy * W + xx] === c.id) {
          hit = true;
          break;
        }
      }
      if (hit) lok++;
    }
    if (lok < NA - 2) continue;
    // innri þættir: alveg innan rammans (2 díla svigrúm), ekki ryk; 1–3 þættir sem saman eru 30–85 % af hæð rammans
    const inni = thaettir.filter((o) => o.id !== c.id && o.x0 > c.x0 + 2 && o.y0 > c.y0 + 2 && o.x1 < c.x1 - 2 && o.y1 < c.y1 - 2 && o.n >= 6);
    if (!inni.length || inni.length > 3) continue;
    const sy0 = Math.min(...inni.map((o) => o.y0)), sy1 = Math.max(...inni.map((o) => o.y1));
    const sx0 = Math.min(...inni.map((o) => o.x0)), sx1 = Math.max(...inni.map((o) => o.x1));
    const sh = sy1 - sy0 + 1, sw = sx1 - sx0 + 1;
    if (sh < bh * 0.3 || sh > bh * 0.85) continue;
    if (sw > bw * 0.85) continue;
    // kassi eða hringur: lengsta beina lárétta blekröð rammans ≥ 70 % af breiddinni = kassi
    let lengst = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      let run = 0;
      for (let x = c.x0; x <= c.x1; x++) {
        if (lab[y * W + x] === c.id) {
          run++;
          if (run > lengst) lengst = run;
        } else run = 0;
      }
    }
    const form: RammaMerki["form"] = lengst >= 0.7 * bw ? "kassi" : "hringur";
    skra?.(`rammi ${form} ${Math.round(mx / k)},${Math.round(my / k)} ${Math.round(bw / k)}×${Math.round(bh / k)} inni ${inni.length} stafur ${Math.round(sw / k)}×${Math.round(sh / k)}`);
    ut.push({
      x: mx / k,
      y: my / k,
      r: (bw + bh) / 4 / k,
      form,
      inni: inni.length,
      stafur: { x0: (sx0 - 1) / k, y0: (sy0 - 1) / k, x1: (sx1 + 2) / k, y1: (sy1 + 2) / k },
    });
  }
  return ut.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Rammar + lesnir stafir → búnaður. Rammi án læsilegs stafs (eða stafur sem er ekki R/S/H/B) er sleppt — betra að
 * vanta merki en að setja rangt. `lesid[i]` = stafur rammans `rammar[i]` (null = ólesið). */
export function bunadurUrRommum(rammar: RammaMerki[], lesid: ({ text: string; confidence: number } | null)[]): BunadurStadur[] {
  const ut: BunadurStadur[] = [];
  rammar.forEach((r, i) => {
    const l = lesid[i];
    if (!l) return;
    const tegund = flokkaBunad(l.text);
    if (!tegund) return;
    ut.push({ x: r.x, y: r.y, tegund, stafur: l.text.trim().toUpperCase(), vissa: l.confidence, form: r.form });
  });
  return ut;
}

/** Talning búnaðar eftir tegund (sticky-miðinn, toast, sjálfvirka verkferlið). */
export function teljaBunad(stadir: { tegund: TaekjaTegund }[]): Partial<Record<TaekjaTegund, number>> {
  const t: Partial<Record<TaekjaTegund, number>> = {};
  for (const s of stadir) t[s.tegund] = (t[s.tegund] ?? 0) + 1;
  return t;
}
