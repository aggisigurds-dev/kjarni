/** Cloud (Replicate-backed) path for Ljósmyndaviðgerð — no local server to
 * run, but the photo leaves this machine and each call costs a small fee.
 * Resizes/compresses client-side to a data URL so the server route never
 * needs to touch an uploads API — just forwards the data URL straight to
 * Replicate's GFPGAN model (see app/api/vidgerd/replicate/route.ts). */

const MAX_CLOUD_DIMENSION = 1400;
const CLOUD_JPEG_QUALITY = 0.85;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = src;
  });
}

async function toResizedDataUrl(file: Blob): Promise<string> {
  const img = await loadImage(URL.createObjectURL(file));
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_CLOUD_DIMENSION ? MAX_CLOUD_DIMENSION / longest : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað á striga");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", CLOUD_JPEG_QUALITY);
}

export async function enhancePhotoViaCloud(file: Blob): Promise<Blob> {
  const imageDataUrl = await toResizedDataUrl(file);
  const res = await fetch("/api/vidgerd/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Skýjaviðgerð féll (${res.status})`);
  }
  return res.blob();
}
