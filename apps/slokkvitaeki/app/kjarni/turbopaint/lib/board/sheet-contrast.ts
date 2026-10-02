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
