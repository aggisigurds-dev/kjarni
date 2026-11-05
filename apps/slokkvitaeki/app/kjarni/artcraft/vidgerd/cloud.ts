/** Cloud (Replicate-backed) path for Ljósmyndaviðgerð — no local server to
 * run, but the photo leaves this machine and each call costs a small fee.
 * Uploads the ORIGINAL photo straight to Supabase Storage (see
 * ../uploadToStorage.ts) and sends Replicate's GFPGAN model that URL — no
 * client-side resizing. Previously this downscaled to ~1400px and inlined
 * the result as base64 in the request JSON, purely to fit under Vercel's
 * hard 4.5MB function body limit; that's what was capping every output's
 * resolution regardless of what GFPGAN itself could do (see
 * https://vercel.com/docs/errors/function_payload_too_large). */

import { uploadForReplicate } from "../uploadToStorage";

export async function enhancePhotoViaCloud(file: Blob): Promise<Blob> {
  const imageUrl = await uploadForReplicate(file, "reference-images");
  const res = await fetch("/api/vidgerd/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
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
