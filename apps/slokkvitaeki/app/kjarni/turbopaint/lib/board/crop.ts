import { canvasToBlob, getAssetBlob, putAsset } from "./assets";
import { newId } from "./ids";
import type { ImageObject } from "./types";

// Sker innflutta teikningu niður í valinn ramma — á NATIVUM pixlum myndarinnar
// svo engin gæði tapast, og skilar nýrri world-stöðu sem heldur skurðsvæðinu
// nákvæmlega þar sem það var (merkingar ofan á haldast því réttar).
export async function cropPlanAsset(
  plan: ImageObject,
  rect: { x: number; y: number; width: number; height: number }
) {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  const bmp = await createImageBitmap(blob);
  const scaleX = bmp.width / plan.width;
  const scaleY = bmp.height / plan.height;
  const sx = Math.max(0, Math.round((rect.x - plan.x) * scaleX));
  const sy = Math.max(0, Math.round((rect.y - plan.y) * scaleY));
  const sw = Math.min(bmp.width - sx, Math.round(rect.width * scaleX));
  const sh = Math.min(bmp.height - sy, Math.round(rect.height * scaleY));
  if (sw < 8 || sh < 8) {
    bmp.close();
    throw new Error("Croppsvæðið nær ekki inn á teikninguna");
  }
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("Gat ekki opnað canvas");
  }
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  bmp.close();
  const out = await canvasToBlob(canvas);
  const assetId = newId();
  await putAsset(assetId, out);
  canvas.width = 0;
  canvas.height = 0;
  return {
    assetId,
    x: plan.x + sx / scaleX,
    y: plan.y + sy / scaleY,
    width: sw / scaleX,
    height: sh / scaleY,
  };
}
