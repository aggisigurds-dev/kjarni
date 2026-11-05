/** Útsýnisstærðfræði Móta-ritilsins — hrein föll, prófuð í node.
 *
 * Myndin er teiknuð á striga í fullri upplausn og birt með CSS-umbreytingu
 * `translate(tx, ty) scale(scale)` (origin efst til vinstri). `scale` er því
 * skjápunktar á hvern myndpunkt. Allt zoom/hliðrun breytir aðeins þessum þremur
 * tölum — engin endurröðun síðu, engin endurteiknun myndar. */

export type View = { scale: number; tx: number; ty: number };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type ZoomLimits = { min: number; max: number };

/** Öll myndin sést, miðjuð, með `pad` punkta spássíu. */
export function fitView(viewport: Size, image: Size, pad = 8): View {
  const vw = Math.max(1, viewport.width - pad * 2);
  const vh = Math.max(1, viewport.height - pad * 2);
  const scale = Math.min(vw / Math.max(1, image.width), vh / Math.max(1, image.height));
  return {
    scale,
    tx: (viewport.width - image.width * scale) / 2,
    ty: (viewport.height - image.height * scale) / 2,
  };
}

/** Hálf „passa“-stærð niður í 6 skjápunkta á myndpunkt (eða 4× passa ef það er meira). */
export function zoomLimits(viewport: Size, image: Size): ZoomLimits {
  const fit = fitView(viewport, image).scale;
  return { min: fit * 0.5, max: Math.max(fit * 4, 6) };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Zoom um `factor` þannig að myndpunkturinn undir (px, py) haldist kyrr. */
export function zoomAt(view: View, factor: number, px: number, py: number, limits: ZoomLimits): View {
  const scale = clamp(view.scale * factor, limits.min, limits.max);
  const k = scale / view.scale;
  return { scale, tx: px - (px - view.tx) * k, ty: py - (py - view.ty) * k };
}

/** Tveggja fingra klíp: myndpunkturinn sem var undir upphafsmiðju fingranna
 *  fylgir núverandi miðju, og fjarlægðin milli fingra stýrir stærðinni. */
export function pinchView(
  start: View,
  startMid: Point,
  startDist: number,
  mid: Point,
  dist: number,
  limits: ZoomLimits,
): View {
  const scale = clamp(start.scale * (dist / Math.max(1, startDist)), limits.min, limits.max);
  const ix = (startMid.x - start.tx) / start.scale;
  const iy = (startMid.y - start.ty) / start.scale;
  return { scale, tx: mid.x - ix * scale, ty: mid.y - iy * scale };
}

/** Heldur myndinni á skjánum: minni en sviðið → miðjuð á þeim ás; stærri →
 *  má draga brún inn um `slack` hluta af sviðinu (svo hægt sé að vinna við
 *  brúnina með fingri) en ekki lengra. */
export function clampView(view: View, viewport: Size, image: Size, slack = 0.3): View {
  const axis = (t: number, viewLen: number, contentLen: number) => {
    if (contentLen <= viewLen) return (viewLen - contentLen) / 2;
    const extra = viewLen * slack;
    return clamp(t, viewLen - contentLen - extra, extra);
  };
  return {
    scale: view.scale,
    tx: axis(view.tx, viewport.width, image.width * view.scale),
    ty: axis(view.ty, viewport.height, image.height * view.scale),
  };
}

/** Skjápunktur (miðað við efra vinstra horn sviðsins) → myndpunktur. */
export function toImage(view: View, p: Point): Point {
  return { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale };
}

/** Myndpunktur → skjápunktur í sviðinu. */
export function toScreen(view: View, p: Point): Point {
  return { x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty };
}

/** Tvíklikk/tvípikk: úr „passa“ í 2.5× um punktinn, annars aftur í „passa“. */
export function toggleZoom(view: View, fit: View, p: Point, limits: ZoomLimits): View {
  if (view.scale > fit.scale * 1.15) return fit;
  return zoomAt(view, (fit.scale * 2.5) / view.scale, p.x, p.y, limits);
}
