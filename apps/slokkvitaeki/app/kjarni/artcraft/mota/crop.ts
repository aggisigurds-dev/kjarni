/** Skurður í Móta — hrein rúmfræði, prófuð í node. Allt í pixlum myndarinnar. */

export type CropRect = { x: number; y: number; w: number; h: number };
export type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

export type CropAspectId = "free" | "orig" | "1:1" | "4:5" | "3:4" | "9:16" | "16:9" | "3:2";

export const CROP_ASPECTS: Array<{ id: CropAspectId; label: string; ratio: number | "orig" | null }> = [
  { id: "free", label: "Frjálst", ratio: null },
  { id: "orig", label: "Upprunalegt", ratio: "orig" },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
];

export function aspectRatio(id: CropAspectId, imageW: number, imageH: number): number | null {
  const a = CROP_ASPECTS.find((c) => c.id === id)?.ratio ?? null;
  return a === "orig" ? imageW / imageH : a;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Stærsti rammi með hlutfallið `ratio` sem passar innan `rect`, miðjaður á
 *  sama stað — og innan myndarinnar. */
export function fitAspect(rect: CropRect, ratio: number | null, W: number, H: number): CropRect {
  if (!ratio) return clampRect(rect, W, H);
  let w = rect.w;
  let h = w / ratio;
  if (h > rect.h) {
    h = rect.h;
    w = h * ratio;
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }, W, H);
}

/** Heldur rammanum innan myndarinnar (færir fyrst, minnkar ef hann er stærri). */
export function clampRect(r: CropRect, W: number, H: number): CropRect {
  const w = Math.min(r.w, W);
  const h = Math.min(r.h, H);
  return { x: clamp(r.x, 0, W - w), y: clamp(r.y, 0, H - h), w, h };
}

/** Rammi eftir að handfangi `handle` er dregið um (dx, dy) myndpixla frá
 *  `start`. Með hlutfalli helst það; hornið/hliðin á móti er kyrr. */
export function dragCrop(
  start: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  W: number,
  H: number,
  min = 32,
): CropRect {
  if (handle === "move") return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, W, H);
  const left = start.x;
  const top = start.y;
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (!ratio) {
    let l = left;
    let r = right;
    let t = top;
    let b = bottom;
    if (west) l = clamp(left + dx, 0, right - min);
    if (east) r = clamp(right + dx, left + min, W);
    if (north) t = clamp(top + dy, 0, bottom - min);
    if (south) b = clamp(bottom + dy, top + min, H);
    return { x: l, y: t, w: r - l, h: b - t };
  }

  // Með hlutfalli: breidd úr láréttri hreyfingu, eða hæð úr lóðréttri (hvort
  // sem breytir meira), svo hin hliðin fylgi.
  const horizontal = east || west;
  const vertical = north || south;
  let w = start.w;
  if (horizontal) w = start.w + (east ? dx : -dx);
  if (vertical) {
    const hFromDy = start.h + (south ? dy : -dy);
    const wFromDy = hFromDy * ratio;
    if (!horizontal || Math.abs(wFromDy - start.w) > Math.abs(w - start.w)) w = wFromDy;
  }
  // Mesta leyfilega breidd frá kyrra horninu/hliðinni.
  const cx = left + start.w / 2;
  const cy = top + start.h / 2;
  const maxW = horizontal ? (east ? W - left : right) : 2 * Math.min(cx, W - cx);
  const maxH = vertical ? (south ? H - top : bottom) : 2 * Math.min(cy, H - cy);
  const minW = Math.max(min, min * ratio);
  w = clamp(w, minW, Math.max(minW, Math.min(maxW, maxH * ratio)));
  const h = w / ratio;
  const x = horizontal ? (east ? left : right - w) : cx - w / 2;
  const y = vertical ? (south ? top : bottom - h) : cy - h / 2;
  return clampRect({ x, y, w, h }, W, H);
}

/** Heiltöluramminn sem er í raun klipptur út. */
export function roundRect(r: CropRect, W: number, H: number): CropRect {
  const x = clamp(Math.round(r.x), 0, W - 1);
  const y = clamp(Math.round(r.y), 0, H - 1);
  const w = clamp(Math.round(r.w), 1, W - x);
  const h = clamp(Math.round(r.h), 1, H - y);
  return { x, y, w, h };
}

/** Er ramminn öll myndin (ekkert að klippa)? */
export function isFullImage(r: CropRect, W: number, H: number): boolean {
  const q = roundRect(r, W, H);
  return q.x === 0 && q.y === 0 && q.w === W && q.h === H;
}

/** Pixlar innan rammans (RGBA, raðir afritaðar). */
export function cropPixels(
  src: { data: Uint8ClampedArray; width: number; height: number },
  rect: CropRect,
): { data: Uint8ClampedArray; width: number; height: number } {
  const r = roundRect(rect, src.width, src.height);
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * src.width + r.x) * 4;
    out.set(src.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return { data: out, width: r.w, height: r.h };
}
