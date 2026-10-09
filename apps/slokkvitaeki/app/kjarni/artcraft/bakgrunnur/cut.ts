/** Product cutouts — files stay in the tab. */

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export type CutProgress = {
  key: string;
  current: number;
  total: number;
};

export function isProductImageFile(file: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function isWhiteBackground(botn: string | null | undefined): boolean {
  return botn === "hvitt";
}

export function cutoutFilename(name: string, white = false): string {
  const base = name.replace(/\.[^.]+$/, "").trim() || "vara";
  return white ? `${base}-a-hvitu.png` : `${base}-an-bakgrunns.png`;
}

export async function placeOnWhite(cutout: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(cutout);
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Gat ekki teiknað á hvítt");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      return canvas.convertToBlob({ type: "image/png" });
    }

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað á hvítt");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Gat ekki vistað PNG"))),
        "image/png",
      );
    });
  } finally {
    bitmap.close();
  }
}

export async function cutProductBackground(
  source: Blob | string,
  onProgress?: (info: CutProgress) => void,
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(source, {
    model: "isnet_quint8",
    output: { format: "image/png", quality: 0.92 },
    progress: (key, current, total) => {
      onProgress?.({ key, current, total });
    },
  });
}

export async function processProductImage(
  source: Blob | string,
  options: { white?: boolean; onProgress?: (info: CutProgress) => void } = {},
): Promise<Blob> {
  const cutout = await cutProductBackground(source, options.onProgress);
  return options.white ? placeOnWhite(cutout) : cutout;
}
