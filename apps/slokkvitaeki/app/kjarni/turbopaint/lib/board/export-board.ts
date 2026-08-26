import { jsPDF } from "jspdf";
import type Konva from "konva";
import { blobToDataUrl, getAssetBlob } from "./assets";
import { boardBounds } from "./geometry";
import type { BoardDocument, BoardObject } from "./types";

const MAX_EXPORT_EDGE = 8192;

export type ExportTarget = "viewport" | "board";
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
