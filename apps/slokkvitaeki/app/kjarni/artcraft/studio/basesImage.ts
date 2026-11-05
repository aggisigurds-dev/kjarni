"use client";

/** Rasterize an SVG base so Forge img2img gets PNG, not a data-svg. */
export async function rasterizeBase(src: string, width = 768, height = 1024): Promise<string> {
  if (!src) throw new Error("Vantar grunnmynd");
  if (src.startsWith("data:image/png") || src.startsWith("data:image/jpeg")) return src;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Gat ekki lesið grunninn"));
    el.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað grunn");
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}
