/** Display/import contrast for faint Icelandic grunnmyndir (gray CAD on white). */

export const SHEET_CONTRAST_FILTER = "brightness(0.82) contrast(1.55)";

/** Copy `src` through a contrast filter onto itself. No-op if canvas has no 2d context. */
export function boostSheetCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 2 || h < 2) return canvas;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tx = tmp.getContext("2d");
  const cx = canvas.getContext("2d");
  if (!tx || !cx) return canvas;
  tx.filter = SHEET_CONTRAST_FILTER;
  tx.drawImage(canvas, 0, 0);
  cx.filter = "none";
  cx.drawImage(tmp, 0, 0);
  tmp.width = 0;
  tmp.height = 0;
  return canvas;
}

/* ── Teikning eða litmynd? (Agnar 17.11.2026) ───────────────────────────────────────────────────────────────────
 * „Veistu af hverju það verður allt svo dökkt" — litrík PNG (Fenrir Ragnarök UI-blað) varð dökk og útbrunnin á borðinu:
 * birtuskerpan hér að ofan var bökuð inn í HVERJA innflutta mynd. Hún er fyrir teikningar (dökkar línur á ljósum
 * pappír, líka gulnaðar/brúnleitar skannanir) — myndir, merki og grafík með gegnsæi, dökkum flötum eða sterkum litum
 * halda sínum litum. Sjálfgefið er skerpa: aðeins greinilegar litmyndir sleppa við hana. */

export type BlaðMat = {
  /** Hlutfall díla sem eru gegnsæir (alfa < 200) — til upplýsinga; teljast hvítur pappír. */
  gegnsae: number;
  /** Hlutfall díla sem eru dökkir (birta < 70). */
  dokkt: number;
  /** Hlutfall díla með sterkan lit (mettun > 0,45 og ekki dökkir). */
  litrikt: number;
  /** Er þetta teikning (pappír + línur) sem birtuskerpan bætir? */
  teikning: boolean;
};

/** Metur RGBA-díla (t.d. úr smækkuðu afriti): dökkir fletir og sterkir litir segja að þetta sé ekki teikning. Gegnsæir
 * dílar teljast hvítur pappír — þeir verða hvítir á borðinu, og teikning flutt út úr CAD með gegnsæjum grunni er teikning. */
export function metaBlad(data: Uint8ClampedArray | Uint8Array): BlaðMat {
  let alls = 0, gegnsae = 0, ogegnsae = 0, dokkt = 0, litrikt = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    alls++;
    ogegnsae++;
    if (data[i + 3] < 200) {
      gegnsae++;
      continue;
    }
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const birta = 0.299 * r + 0.587 * g + 0.114 * b;
    if (birta < 70) dokkt++;
    else if (mx > 80 && (mx - mn) / mx > 0.45) litrikt++;
  }
  const m = {
    gegnsae: alls ? gegnsae / alls : 0,
    dokkt: ogegnsae ? dokkt / ogegnsae : 0,
    litrikt: ogegnsae ? litrikt / ogegnsae : 0,
  };
  // Teikning = mest pappír: dökkt ≤ 30 %, sterkir litir ≤ 15 % og samanlagt ≤ 35 % (þétt skástrikuð teikning með rauðum
  // EI-línum nær ~30 %; litmynd með dökkum flötum og eldi — 27 % + 13 % — fór áður rétt undir báða þröskuldana).
  return { ...m, teikning: alls > 0 && m.dokkt <= 0.3 && m.litrikt <= 0.15 && m.dokkt + m.litrikt <= 0.35 };
}

/** Metur strigann á smækkuðu afriti (mest ~240 dílar á lengri kant). null = tókst ekki (þá er skerpt eins og áður). */
export function metaStriga(canvas: HTMLCanvasElement): BlaðMat | null {
  return metaMynd(canvas, canvas.width, canvas.height);
}

/** Sama mat á hvaða mynd sem er (t.d. PNG ÁÐUR en hún er lögð á hvítan grunn, svo raunverulegt gegnsæi telji). */
export function metaMynd(canvas: CanvasImageSource, w: number, h: number): BlaðMat | null {
  if (w < 2 || h < 2) return null;
  const k = Math.min(1, 240 / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
  const tmp = document.createElement("canvas");
  tmp.width = sw;
  tmp.height = sh;
  try {
    const tx = tmp.getContext("2d", { willReadFrequently: true });
    if (!tx) return null;
    tx.drawImage(canvas, 0, 0, sw, sh);
    return metaBlad(tx.getImageData(0, 0, sw, sh).data);
  } catch {
    return null;
  } finally {
    tmp.width = 0;
    tmp.height = 0;
  }
}

export const LITMYND_ATH = "Litmynd — upprunalegu litirnir haldast (engin birtuskerpa eins og á teikningum)";

/** Birtuskerpa eftir stillingunni (lib/board/birtuskerpa.ts): „sjalfvirkt" skerpir aðeins teikningar, „alltaf" allt,
 * „aldrei" ekkert. `ath` = skilaboð til notandans þegar litmynd slapp sjálfkrafa (ekki þegar slökkt er í stillingum). */
export function skerpaEftirStillingu(
  canvas: HTMLCanvasElement,
  ham: "sjalfvirkt" | "alltaf" | "aldrei" = "sjalfvirkt"
): { skerpt: boolean; ath: string | null } {
  if (ham === "aldrei") return { skerpt: false, ath: null };
  if (ham === "sjalfvirkt") {
    const mat = metaStriga(canvas);
    if (mat && !mat.teikning) return { skerpt: false, ath: LITMYND_ATH };
  }
  boostSheetCanvas(canvas);
  return { skerpt: true, ath: null };
}
