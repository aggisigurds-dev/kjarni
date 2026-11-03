/** Cloud (Replicate-backed) path for Bakgrunnur — betri klipping en
 * staðbundna @imgly/background-removal WASM-líkanið býður upp á (sjá
 * cut.ts), en myndin fer út af vélinni og hvert kall kostar smá upphæð.
 * Resizes/compresses client-side to a data URL so the server route never
 * needs to touch an uploads API — just forwards the data URL straight to
 * Replicate's 851-labs/background-remover (see
 * app/api/bakgrunnur/replicate/route.ts). */

const MAX_CLOUD_DIMENSION = 1800;
const CLOUD_JPEG_QUALITY = 0.9;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = src;
  });
}

async function toResizedDataUrl(source: Blob | string): Promise<string> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const img = await loadImage(url);
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

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function cutProductBackgroundViaCloud(source: Blob | string): Promise<Blob> {
  const imageDataUrl = await toResizedDataUrl(source);
  const res = await fetch("/api/bakgrunnur/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Skýjabakgrunnur mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { image: string };
  // The server returns Replicate's own delivery URL directly (publicly
  // fetchable, Access-Control-Allow-Origin: *) rather than base64-encoding
  // the image into its own JSON response — same reasoning as the other
  // Replicate-backed ArtCraft tools (see e.g. skyjastudio/sdxl.ts).
  return fetchImageBlob(data.image);
}
