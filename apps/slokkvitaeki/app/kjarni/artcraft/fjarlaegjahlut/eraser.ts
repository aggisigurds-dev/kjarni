/** Fjarlægja hlut — client fetch for the object-removal model (bria/eraser
 * on Replicate). No settings to speak of: image + painted mask in, cleaned
 * image out. Mirrors the conventions used by svidsmynd/scene.ts. */

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function eraseObject(imageDataUrl: string, maskDataUrl: string): Promise<Blob> {
  const res = await fetch("/api/fjarlaegjahlut/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, maskDataUrl }),
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
