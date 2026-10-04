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

/** „Hreinsa svæði" (Agnar 04.10.2026: „draga kassa yfir einhvern hluta og ýtt á hreinsa/eyða"): málar svæðið hvítt á
 * skjámynd teikningarinnar og skilar nýrri mynd + svæðinu í hlutföllum (0–1) svo veggjagreining úr PDF-frumskránni
 * hunsi það líka. Myndin heldur stærð og stöðu; ⌘Z skilar gömlu myndinni. */
export async function hvittaPlanAsset(
  plan: ImageObject,
  rect: { x: number; y: number; width: number; height: number }
) {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  const bmp = await createImageBitmap(blob);
  const fx = Math.max(0, (rect.x - plan.x) / plan.width), fy = Math.max(0, (rect.y - plan.y) / plan.height);
  const fx1 = Math.min(1, (rect.x + rect.width - plan.x) / plan.width), fy1 = Math.min(1, (rect.y + rect.height - plan.y) / plan.height);
  if (fx1 - fx <= 0 || fy1 - fy <= 0) {
    bmp.close();
    throw new Error("Svæðið nær ekki inn á teikninguna");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("Gat ekki opnað canvas");
  }
  ctx.drawImage(bmp, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(
    Math.floor(fx * bmp.width),
    Math.floor(fy * bmp.height),
    Math.ceil((fx1 - fx) * bmp.width),
    Math.ceil((fy1 - fy) * bmp.height)
  );
  bmp.close();
  // Skannanir eru JPEG (40 MP PNG yrði tugir MB); annað helst PNG.
  const out = /jpe?g/i.test(blob.type) ? await canvasToBlob(canvas, "image/jpeg", 0.92) : await canvasToBlob(canvas);
  const assetId = newId();
  await putAsset(assetId, out);
  canvas.width = 0;
  canvas.height = 0;
  return {
    assetId,
    hvittad: [...(plan.hvittad ?? []), { x: fx, y: fy, w: fx1 - fx, h: fy1 - fy }],
  };
}
