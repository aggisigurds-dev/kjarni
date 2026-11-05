/** Andlitslás fyrir framhald (vafri): andlitið úr viðmiðunarmyndinni sett á
 *  ramma með noahgsolomon/face-swap (/api/andlitslas). Skilar nýju myndinni,
 *  eða kastar ef líkanið finnur ekkert andlit / bilar. */
export async function lockFace(frameUrl: string, faceUrl: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/andlitslas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: frameUrl, face: faceUrl }),
    signal,
  });
  const text = await res.text();
  let data: { image?: string; error?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* ekki JSON */
  }
  if (!res.ok || !data.image) throw new Error(data.error || text || `Andlitslás mistókst (${res.status})`);
  const img = await fetch(data.image, { signal });
  if (!img.ok) throw new Error(`Gat ekki sótt myndina með andlitinu (${img.status})`);
  return img.blob();
}
