/* Fastur skurður utan um grunnmyndina (Agnar 14.10: „permanent crop around the building floor").
 * Geymdur í skr_teikningar.skurdur sem {x,y,w,h} í pixlum renderingarinnar. Pinnar eru ALLTAF í
 * hnitum allrar myndarinnar — skurðurinn er bara sýn, svo innflutt Ajour-hnit og eldri pinnar standast. */
export type Skurdur = { x: number; y: number; w: number; h: number };

export function lesaSkurd(v: unknown, breidd: number, haed: number): Skurdur | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const x = Number(o.x), y = Number(o.y), w = Number(o.w), h = Number(o.h);
  if (![x, y, w, h].every(Number.isFinite) || w < 50 || h < 50) return null;
  const cx = Math.max(0, Math.min(breidd - 1, x)), cy = Math.max(0, Math.min(haed - 1, y));
  return { x: Math.round(cx), y: Math.round(cy), w: Math.round(Math.min(w, breidd - cx)), h: Math.round(Math.min(h, haed - cy)) };
}

/** CSS fyrir smámynd sem sýnir aðeins skurðinn (background-image) */
export function skurdarBakgrunnur(url: string, breidd: number, haed: number, s: Skurdur | null, boxW: number, boxH: number): React.CSSProperties {
  if (!s) return { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" };
  const k = Math.max(boxW / s.w, boxH / s.h); // cover
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${breidd * k}px ${haed * k}px`,
    backgroundPosition: `${-(s.x * k) + (boxW - s.w * k) / 2}px ${-(s.y * k) + (boxH - s.h * k) / 2}px`,
    backgroundRepeat: "no-repeat",
  };
}
