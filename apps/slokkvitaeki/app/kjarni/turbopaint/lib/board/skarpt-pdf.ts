// Skarpt við aðdrátt úr vigur-PDF (3. áfangi — myndgæði Teikning-gluggans, 438-teikning-skarpt.js, í TurboPaint).
//
// PDF-teikning er á borðinu sem rastamynd (≤ 40 MP — Fiskislóð 41: 227 DPI) og verður loðin þegar þysjað er nær en
// það. Þegar skjárinn sýnir fleiri díla á borðeiningu en myndin á, er SÝNILEGI hlutinn teiknaður aftur beint úr
// PDF-frumskránni (frumAssetId) í skjáupplausn og lagður ofan á myndina — eins og 438 gerir í Teikning-glugganum.
//
// Breytingar notandans á myndinni (Hreinsa svæði, strokleður, Eyða línu, Hreinsa teikningu) mega ekki vakna aftur:
// skarpa lagið sýnir PDF-ið AÐEINS þar sem myndin sjálf ber blek (gríma úr myndinni, víkkuð um 1 díl). Þar sem
// myndin er hvít — hvort sem blaðið var autt eða notandinn strokaði út — sést myndin óbreytt. Engin gögn breytast;
// lagið er aðeins á skjánum („ui-only", fer ekki í útflutning).

/** Skjádílar á borðeiningu ÞURFA að vera þetta mörgum sinnum fleiri en myndin á svo skarpa lagið kvikni. */
export const SKARPT_THROSKULDUR = 1.2;
/** Hámarkshlið skarpa lagsins (dílar) — minni símans og pdf.js-teiknitími. */
export const SKARPT_HAMARK = 4096;

export interface SkarptSvaedi {
  /** Svæðið í borðeiningum MIÐAÐ VIÐ MYNDINA (upphaf efst til vinstri). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stærð skarpa strigans (dílar). */
  cw: number;
  ch: number;
  /** Dílar skarpa strigans á borðeiningu. */
  k: number;
}

/** Hvaða hluta myndarinnar á að teikna skarpt, og í hvaða upplausn — null ef ekki þarf (myndin nógu skörp, utan
 * skjás, snúin mynd). `rasterB` = breidd myndarinnar í dílum; `skjar` = stærð sviðsins í CSS-dílum. */
export function skarptSvaedi(
  plan: { x: number; y: number; width: number; height: number; rotation?: number },
  cam: { x: number; y: number; scale: number },
  skjar: { w: number; h: number },
  dpr: number,
  rasterB: number
): SkarptSvaedi | null {
  if (plan.rotation || !(plan.width > 0) || !(plan.height > 0) || !(rasterB > 0)) return null;
  const skjarK = cam.scale * dpr;
  if (skjarK <= (rasterB / plan.width) * SKARPT_THROSKULDUR) return null;
  const vx0 = -cam.x / cam.scale, vy0 = -cam.y / cam.scale;
  const vx1 = (skjar.w - cam.x) / cam.scale, vy1 = (skjar.h - cam.y) / cam.scale;
  const x0 = Math.max(0, vx0 - plan.x), y0 = Math.max(0, vy0 - plan.y);
  const x1 = Math.min(plan.width, vx1 - plan.x), y1 = Math.min(plan.height, vy1 - plan.y);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  // heilar borðeiningar út á við svo jaðrar falli ekki á milli
  const x = Math.floor(x0), y = Math.floor(y0), w = Math.min(plan.width, Math.ceil(x1)) - x, h = Math.min(plan.height, Math.ceil(y1)) - y;
  const k = Math.min(skjarK, SKARPT_HAMARK / Math.max(w, h));
  return { x, y, w, h, cw: Math.max(1, Math.round(w * k)), ch: Math.max(1, Math.round(h * k)), k };
}

/** Er sama svæði þegar teiknað (innan hálfs skjádíls og 2 % upplausnar)? Þá er ekki teiknað aftur. */
export function samaSvaedi(a: SkarptSvaedi | null, b: SkarptSvaedi | null): boolean {
  if (!a || !b) return false;
  const tol = 0.5 / b.k;
  return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.w - b.w) < tol && Math.abs(a.h - b.h) < tol && Math.abs(a.k / b.k - 1) < 0.02;
}

/** Passar PDF-síðan við myndina (sömu hlutföll)? Skorin mynd hefur önnur hlutföll og passar ekki lengur. */
export function sidaPassar(plan: { width: number; height: number }, sida: { b: number; h: number }): boolean {
  return sida.b > 0 && sida.h > 0 && Math.abs(plan.width / plan.height / (sida.b / sida.h) - 1) <= 0.01;
}

/** BLEKGRÍMA úr myndinni (RGBA): 255 þar sem díll er dekkri en `troskuldur` (summa R+G+B < 3·troskuldur), víkkuð um
 * `vikkun` díla í hvora átt. Skarpa PDF-lagið sést aðeins innan grímunnar — það sem notandinn strokaði út af
 * myndinni (hvítt) vaknar því aldrei aftur. */
export function blekgrima(rgba: Uint8ClampedArray, w: number, h: number, troskuldur = 235, vikkun = 1): Uint8Array {
  const blek = new Uint8Array(w * h);
  const t3 = troskuldur * 3;
  for (let i = 0; i < w * h; i++) if (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2] < t3) blek[i] = 1;
  if (!vikkun) return blek.map((v) => v * 255);
  // aðskiljanleg víkkun: lárétt, svo lóðrétt
  const lar = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let sidast = -Infinity;
    const r = y * w;
    for (let x = 0; x < w; x++) {
      if (blek[r + x]) sidast = x;
      if (x - sidast <= vikkun) lar[r + x] = 1;
    }
    sidast = Infinity;
    for (let x = w - 1; x >= 0; x--) {
      if (blek[r + x]) sidast = x;
      if (sidast - x <= vikkun) lar[r + x] = 1;
    }
  }
  const ut = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let sidast = -Infinity;
    for (let y = 0; y < h; y++) {
      if (lar[y * w + x]) sidast = y;
      if (y - sidast <= vikkun) ut[y * w + x] = 255;
    }
    sidast = Infinity;
    for (let y = h - 1; y >= 0; y--) {
      if (lar[y * w + x]) sidast = y;
      if (sidast - y <= vikkun) ut[y * w + x] = 255;
    }
  }
  return ut;
}
