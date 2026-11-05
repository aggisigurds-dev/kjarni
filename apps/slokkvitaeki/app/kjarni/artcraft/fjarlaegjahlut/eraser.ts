/** Fjarlægja hlut — client fetch for the object-removal model (bria/eraser
 * on Replicate). No settings to speak of: image + painted mask in, cleaned
 * image out. Uploads both straight to Supabase Storage (see
 * ../uploadToStorage.ts) instead of downscaling/base64-encoding them — see
 * app/api/fjarlaegjahlut/replicate/route.ts for why. */

import { uploadForReplicate } from "../uploadToStorage";

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function eraseObject(image: Blob, mask: Blob): Promise<Blob> {
  const [imageUrl, maskUrl] = await Promise.all([
    uploadForReplicate(image, "reference-images"),
    uploadForReplicate(mask, "mask-images"),
  ]);
  const res = await fetch("/api/fjarlaegjahlut/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, maskUrl }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Fjarlægja hlut mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { image: string };
  // Server returns Replicate's own delivery URL directly — same reasoning
  // as every other Replicate-backed ArtCraft tool, see e.g. skyjastudio/sdxl.ts.
  return fetchImageBlob(data.image);
}
