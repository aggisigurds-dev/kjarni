import { jsPDF } from "jspdf";
import type Konva from "konva";
import { blobToDataUrl, getAssetBlob } from "./assets";
import { boardBounds } from "./geometry";
import type { BoardDocument, BoardObject } from "./types";

const MAX_EXPORT_EDGE = 14000;

export type ExportTarget = "viewport" | "board" | "selection";
export type ExportScale = 1 | 2 | 3 | 4;

function hideUi(stage: Konva.Stage) {
  const hidden: Konva.Node[] = [];
  stage.find(".ui-only").forEach((node) => {
    if (node.visible()) {
      hidden.push(node);
      node.visible(false);
    }
  });
  return () => hidden.forEach((node) => node.visible(true));
}

export async function exportPngBlob(
  stage: Konva.Stage,
  objects: BoardObject[],
  target: ExportTarget,
  scale: ExportScale
) {
  const restore = hideUi(stage);
  try {
    const pixelRatio = scale;
    if (target === "viewport") {
      const url = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
      const res = await fetch(url);
      return res.blob();
    }
    const bounds = boardBounds(objects);
    const width = bounds.width * stage.scaleX();
    const height = bounds.height * stage.scaleY();
    let ratio = pixelRatio;
    const longest = Math.max(width, height) * ratio;
    if (longest > MAX_EXPORT_EDGE) {
      ratio = MAX_EXPORT_EDGE / Math.max(width, height);
    }
    const url = stage.toDataURL({
      x: bounds.x * stage.scaleX() + stage.x(),
      y: bounds.y * stage.scaleY() + stage.y(),
      width,
      height,
      pixelRatio: ratio,
      mimeType: "image/png",
    });
    const res = await fetch(url);
    return res.blob();
  } finally {
    restore();
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportPdf(
  stage: Konva.Stage,
  objects: BoardObject[],
  target: ExportTarget,
  scale: ExportScale,
  name: string
) {
  const png = await exportPngBlob(stage, objects, target, scale);
  const url = URL.createObjectURL(png);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Gat ekki lesið útflutta mynd"));
    el.src = url;
  });
  const orientation = img.width >= img.height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: [img.width, img.height],
    compress: true,
  });
  pdf.addImage(img, "PNG", 0, 0, img.width, img.height, undefined, "FAST");
  pdf.save(`${slug(name)}.pdf`);
  URL.revokeObjectURL(url);
}

/* ── A4-flísar (Agnar 03.09.2026) ─────────────────────────────────────────────
 * Stórar teikningar prentast ólæsilega á eitt A4. Hér er myndinni skipt á
 * cols × rows A4-blöð (lárétt eða lóðrétt) sem eru prentuð hvert fyrir sig,
 * plöstuð og límd saman í stórt kort. Hvert blað ber skurðarmerki í hornum,
 * yfirlitsreit sem sýnir hvar það situr í heildinni, og nafn/númer.
 * Myndin er kvörðuð svo hún fylli sameiginlega flötinn (heldur hlutföllum,
 * miðjuð) — blöð sem engin mynd lendir á eru sleppt. */
export type TileOrientation = "landscape" | "portrait";
export interface TileLayout {
  cols: number;
  rows: number;
  orientation: TileOrientation;
}
const A4_MM = { short: 210, long: 297 };
/** Óprentanlegt jaðarsvæði flestra prentara er 4–6 mm — 7 mm er öruggt. */
export const TILE_MARGIN_MM = 7;

export function tilePageMm(o: TileOrientation) {
  return o === "landscape"
    ? { w: A4_MM.long, h: A4_MM.short }
    : { w: A4_MM.short, h: A4_MM.long };
}

/** Sameiginlegi prentflöturinn í mm (innan jaðra) — fyrir yfirlitstextann. */
export function tiledAreaMm(layout: TileLayout) {
  const page = tilePageMm(layout.orientation);
  const innerW = page.w - 2 * TILE_MARGIN_MM;
  const innerH = page.h - 2 * TILE_MARGIN_MM;
  return { w: layout.cols * innerW, h: layout.rows * innerH, innerW, innerH };
}

export async function exportTiledPdf(
  stage: Konva.Stage,
  objects: BoardObject[],
  target: ExportTarget,
  scale: ExportScale,
  name: string,
  layout: TileLayout
): Promise<{ blob: Blob; pages: number }> {
  const cols = Math.max(1, Math.min(6, Math.round(layout.cols)));
  const rows = Math.max(1, Math.min(6, Math.round(layout.rows)));
  const png = await exportPngBlob(stage, objects, target, scale);
  const url = URL.createObjectURL(png);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Gat ekki lesið útflutta mynd"));
    el.src = url;
  });
  try {
    const page = tilePageMm(layout.orientation);
    const { innerW, innerH } = tiledAreaMm({ cols, rows, orientation: layout.orientation });
    const totalW = cols * innerW;
    const totalH = rows * innerH;
    // Fyllir flötinn, heldur hlutföllum, miðjar.
    const mmPerPx = Math.min(totalW / img.width, totalH / img.height);
    const pxPerMm = 1 / mmPerPx;
    const fitW = img.width * mmPerPx;
    const fitH = img.height * mmPerPx;
    const ox = (totalW - fitW) / 2;
    const oy = (totalH - fitH) / 2;

    const pdf = new jsPDF({ orientation: layout.orientation, unit: "mm", format: "a4", compress: true });
    const M = TILE_MARGIN_MM;
    let pages = 0;
    const tiles: { r: number; c: number }[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.push({ r, c });
    const total = tiles.filter(({ r, c }) => {
      const sx = (c * innerW - ox) * pxPerMm;
      const sy = (r * innerH - oy) * pxPerMm;
      return sx < img.width && sy < img.height && sx + innerW * pxPerMm > 0 && sy + innerH * pxPerMm > 0;
    }).length;

    for (const { r, c } of tiles) {
      // Flísin í mynd-pixlum
      const sx = (c * innerW - ox) * pxPerMm;
      const sy = (r * innerH - oy) * pxPerMm;
      const sw = innerW * pxPerMm;
      const sh = innerH * pxPerMm;
      const isx = Math.max(sx, 0);
      const isy = Math.max(sy, 0);
      const iex = Math.min(sx + sw, img.width);
      const iey = Math.min(sy + sh, img.height);
      if (iex - isx < 1 || iey - isy < 1) continue; // ekkert af myndinni á þessu blaði

      const cw = Math.max(1, Math.round(sw));
      const ch = Math.max(1, Math.round(sh));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Vafrinn gaf ekki teiknisamhengi");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      // drawImage með neikvæðu upphafi skekkir myndina í sumum vöfrum —
      // því er skurðpunkturinn reiknaður hér og aðeins það sem sést teiknað.
      ctx.drawImage(img, isx, isy, iex - isx, iey - isy, isx - sx, isy - sy, iex - isx, iey - isy);

      if (pages > 0) pdf.addPage("a4", layout.orientation);
      pages++;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", M, M, innerW, innerH, undefined, "FAST");

      // Skurðarmerki í hornum (utan myndar, í jaðrinum)
      pdf.setDrawColor(90, 90, 90);
      pdf.setLineWidth(0.2);
      const L = 4;
      const corners: [number, number, number, number][] = [
        [M, M, -1, -1], [M + innerW, M, 1, -1], [M, M + innerH, -1, 1], [M + innerW, M + innerH, 1, 1],
      ];
      for (const [x, y, dx, dy] of corners) {
        pdf.line(x, y + dy * 1, x, y + dy * (1 + L));
        pdf.line(x + dx * 1, y, x + dx * (1 + L), y);
      }

      // Nafn + númer neðst til vinstri, yfirlitsreitur neðst til hægri
      pdf.setFontSize(7);
      pdf.setTextColor(110, 110, 110);
      pdf.text(
        `${name} · blað ${pages} af ${total} · röð ${r + 1}/${rows}, dálkur ${c + 1}/${cols} · ${cols}×${rows} A4 ${layout.orientation === "landscape" ? "lárétt" : "lóðrétt"}`,
        M,
        page.h - 2.2
      );
      const cell = 3.2;
      const gx = page.w - M - cols * cell;
      const gy = page.h - M + 0.8;
      pdf.setLineWidth(0.15);
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          const x = gx + cc * cell;
          const y = gy + rr * ((M - 1.6) / rows);
          const h = (M - 1.6) / rows;
          if (rr === r && cc === c) {
            pdf.setFillColor(40, 40, 40);
            pdf.rect(x, y, cell, h, "FD");
          } else {
            pdf.rect(x, y, cell, h, "S");
          }
        }
      }
    }
    if (!pages) throw new Error("Ekkert lenti á blöðunum — er borðið tómt?");
    return { blob: pdf.output("blob"), pages };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportBoardJson(doc: BoardDocument, objects: BoardObject[]) {
  const images: Record<string, string> = {};
  const ids = objects
    .filter((o): o is BoardObject & { assetId: string } => o.type === "image")
    .map((o) => o.assetId);
  for (const id of [...new Set(ids)]) {
    const blob = getAssetBlob(id);
    if (!blob) continue;
    images[id] = await blobToDataUrl(blob);
  }
  const payload = {
    ...doc,
    objects,
    images,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  downloadBlob(blob, `${slug(doc.name)}.kjarni.json`);
}

export function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[áà]/g, "a")
      .replace(/[éè]/g, "e")
      .replace(/[íì]/g, "i")
      .replace(/[óò]/g, "o")
      .replace(/[úù]/g, "u")
      .replace(/ý/g, "y")
      .replace(/æ/g, "ae")
      .replace(/ö/g, "o")
      .replace(/þ/g, "th")
      .replace(/ð/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "kjarni-bord"
  );
}
