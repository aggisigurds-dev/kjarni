import { del, get, keys, set } from "idb-keyval";
import { erSkodun } from "./skodun";

const urls = new Map<string, string>();
const blobs = new Map<string, Blob>();

function assetKey(id: string) {
  return `kjarni-asset-${id}`;
}

export function getAssetUrl(id: string) {
  return urls.get(id);
}

export function getAssetBlob(id: string) {
  return blobs.get(id);
}

export async function putAsset(id: string, blob: Blob) {
  const prev = urls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  blobs.set(id, blob);
  urls.set(id, URL.createObjectURL(blob));
  // Skoðunarhamur (skodun.ts): myndin lifir aðeins í minni flipans — ekkert í IndexedDB fyrr en „Vista sem borð".
  if (erSkodun()) return;
  await set(assetKey(id), blob);
}

/** Vistar mynd í IndexedDB ÓHÁÐ skoðunarham (öfugt við putAsset, sem sleppir
 *  skrifum í skoðun). Fyrir „Sækja fyrir offline": þar viljum við alltaf skrifa
 *  niður, líka þótt skoðun sé opin í flipanum þegar hnappurinn er ýttur. */
export async function vistaAssetStadbundid(id: string, blob: Blob) {
  const prev = urls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  blobs.set(id, blob);
  urls.set(id, URL.createObjectURL(blob));
  await set(assetKey(id), blob);
}

/** „Vista sem borð": myndir skoðunarinnar (í minni) skrifaðar í IndexedDB eins og innflutningur hefði gert. */
export async function festaIGeymslu(ids: string[]) {
  for (const id of new Set(ids)) {
    const blob = blobs.get(id);
    if (blob) await set(assetKey(id), blob);
  }
}

export async function deleteAsset(id: string) {
  const prev = urls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  urls.delete(id);
  blobs.delete(id);
  // Föst auðkenni (eignalykill.ts) geta átt við mynd venjulegs borðs — skoðun snertir aldrei IndexedDB.
  if (erSkodun()) return;
  await del(assetKey(id));
}

/** Eru ÖLL uppgefin id til staðbundið (minni eða IndexedDB) — án þess að hlaða blobbana í minni (notar keys(),
 *  svo stór TIF-frumrit eru ekki lesin bara til að kanna tilvist). Fyrir ✓-stöðu „tilbúið án nets". */
export async function erAllarMyndirGeymdar(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  if (ids.every((id) => blobs.has(id))) return true;
  const allir = new Set((await keys()).map(String));
  return ids.every((id) => blobs.has(id) || allir.has(assetKey(id)));
}

export async function hydrateAssets(ids: string[]) {
  await Promise.all(
    ids.map(async (id) => {
      if (urls.has(id)) return;
      const blob = await get<Blob>(assetKey(id));
      if (!blob) return;
      blobs.set(id, blob);
      urls.set(id, URL.createObjectURL(blob));
    })
  );
}

export async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Gat ekki búið til mynd"));
      },
      type,
      quality
    );
  });
}

export function fitSize(width: number, height: number, maxPx: number) {
  const longest = Math.max(width, height, 1);
  const scale = longest > maxPx ? maxPx / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}
