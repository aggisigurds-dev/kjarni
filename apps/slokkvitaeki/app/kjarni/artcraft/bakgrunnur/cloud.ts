/** Cloud (Replicate-backed) path for Bakgrunnur — betri klipping en
 * staðbundna @imgly/background-removal WASM-líkanið býður upp á (sjá
 * cut.ts), en myndin fer út af vélinni og hvert kall kostar smá upphæð.
 * Uploads the ORIGINAL photo straight to Supabase Storage (see
 * ../uploadToStorage.ts) and sends Replicate's 851-labs/background-remover
 * that URL — no client-side resizing. Previously this downscaled to
 * ~1800px and inlined the result as base64 in the request JSON, purely to
 * fit under Vercel's hard 4.5MB function body limit; that's what was
 * capping every output's resolution regardless of what the model itself
 * could do (see https://vercel.com/docs/errors/function_payload_too_large,
 * see app/api/bakgrunnur/replicate/route.ts). */

import { uploadForReplicate } from "../uploadToStorage";

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function cutProductBackgroundViaCloud(source: Blob | string): Promise<Blob> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const imageUrl = await uploadForReplicate(blob, "reference-images");
  const res = await fetch("/api/bakgrunnur/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
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
