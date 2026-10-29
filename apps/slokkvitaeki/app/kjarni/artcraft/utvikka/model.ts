/** Útvíkka — black-forest-labs/flux-fill-dev á Replicate.
 *
 * Outpaint með Flux Fill. Vafrinn byggir sjálfur útvíkkaða mynd + mask
 * (svart = varðveita, hvítt = outpaint), server callar flux-fill-dev
 * með bæði input og mask. Styður disable_safety_checker. */

export const UTVIKKA_DIRECTIONS = [
  "all",
  "left",
  "right",
  "top",
  "bottom",
  "horizontal",
  "vertical",
] as const;
export type UtvikkaDirection = (typeof UTVIKKA_DIRECTIONS)[number];

export const UTVIKKA_DIRECTION_LABELS: Record<UtvikkaDirection, string> = {
  all: "Allar hliðar",
  left: "Vinstri",
  right: "Hægri",
  top: "Að ofan",
  bottom: "Að neðan",
  horizontal: "Vinstri + hægri",
  vertical: "Að ofan + neðan",
};

export const UTVIKKA_AMOUNTS = [25, 50, 75, 100] as const;
export type UtvikkaAmount = (typeof UTVIKKA_AMOUNTS)[number];

export type UtvikkaSettings = {
  prompt: string;
  direction: UtvikkaDirection;
  amount: UtvikkaAmount;
  steps: number;
  guidance: number;
  numOutputs: number;
  seed: number;
  disableSafetyChecker: boolean;
};

export const DEFAULT_UTVIKKA_SETTINGS: UtvikkaSettings = {
  prompt: "",
  direction: "all",
  amount: 50,
  steps: 30,
  guidance: 30,
  numOutputs: 1,
  seed: -1,
  disableSafetyChecker: false,
};

export const UTVIKKA_SETTINGS_KEY = "kjarni_private_utvikka_settings";

export function normalizeUtvikkaSettings(
  raw: Partial<UtvikkaSettings> | null | undefined,
): UtvikkaSettings {
  const src = raw ?? {};
  const clamp = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  };
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_UTVIKKA_SETTINGS.prompt,
    direction: UTVIKKA_DIRECTIONS.includes(src.direction as UtvikkaDirection)
      ? (src.direction as UtvikkaDirection)
      : DEFAULT_UTVIKKA_SETTINGS.direction,
    amount: UTVIKKA_AMOUNTS.includes(src.amount as UtvikkaAmount)
      ? (src.amount as UtvikkaAmount)
      : DEFAULT_UTVIKKA_SETTINGS.amount,
    steps: Math.round(clamp(src.steps, 30, 1, 50)),
    guidance: clamp(src.guidance, 30, 1, 100),
    numOutputs: Math.round(clamp(src.numOutputs, 1, 1, 4)),
    seed: Number.isFinite(src.seed) ? Math.trunc(src.seed as number) : -1,
    disableSafetyChecker:
      typeof src.disableSafetyChecker === "boolean" ? src.disableSafetyChecker : false,
  };
}

export function readStoredUtvikkaSettings(): UtvikkaSettings {
  if (typeof window === "undefined") return DEFAULT_UTVIKKA_SETTINGS;
  try {
    const raw = window.localStorage.getItem(UTVIKKA_SETTINGS_KEY);
    if (!raw) return DEFAULT_UTVIKKA_SETTINGS;
    return normalizeUtvikkaSettings(JSON.parse(raw) as Partial<UtvikkaSettings>);
  } catch {
    return DEFAULT_UTVIKKA_SETTINGS;
  }
}

/** Reikna hversu mikið á að bæta við á hvorri hlið. */
export function computeExtension(
  width: number,
  height: number,
  direction: UtvikkaDirection,
  amountPercent: number,
): {
  newWidth: number;
  newHeight: number;
  offsetX: number;
  offsetY: number;
} {
  const padW = Math.round((width * amountPercent) / 100);
  const padH = Math.round((height * amountPercent) / 100);
  let padLeft = 0;
  let padRight = 0;
  let padTop = 0;
  let padBottom = 0;
  switch (direction) {
    case "all":
      padLeft = padW;
      padRight = padW;
      padTop = padH;
      padBottom = padH;
      break;
    case "left":
      padLeft = padW;
      break;
    case "right":
      padRight = padW;
      break;
    case "top":
      padTop = padH;
      break;
    case "bottom":
      padBottom = padH;
      break;
    case "horizontal":
      padLeft = padW;
      padRight = padW;
      break;
    case "vertical":
      padTop = padH;
      padBottom = padH;
      break;
  }
  return {
    newWidth: width + padLeft + padRight,
    newHeight: height + padTop + padBottom,
    offsetX: padLeft,
    offsetY: padTop,
  };
}

/** Round up to the nearest multiple of 16 — flux-fill krefst þess að dim séu
 *  deilanleg með 16. Við skölum líka niður ef heildarstærðin fer yfir 2048px
 *  á lengstu hlið (Vercel body-limit + VRAM á Replicate). */
function fluxDims(width: number, height: number): { w: number; h: number; scale: number } {
  const MAX = 2048;
  const longest = Math.max(width, height);
  const scale = longest > MAX ? MAX / longest : 1;
  const w = Math.round((width * scale) / 16) * 16;
  const h = Math.round((height * scale) / 16) * 16;
  return { w: Math.max(16, w), h: Math.max(16, h), scale };
}

/** Byggir útvíkkaða mynd + mask í vafranum. Image fær upprunalegu myndina
 *  á sínum stað og gráan bakgrunn utan um (það hunsað af mask). Mask er svart
 *  þar sem upprunaleg mynd var, hvítt alls staðar annars. */
export async function buildOutpaintCanvases(
  sourceImageUrl: string,
  direction: UtvikkaDirection,
  amount: number,
): Promise<{ imageDataUrl: string; maskDataUrl: string; width: number; height: number }> {
  const img = new Image();
  img.src = sourceImageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Gat ekki lesið mynd."));
  });
  const ext = computeExtension(img.naturalWidth, img.naturalHeight, direction, amount);
  const { w: targetW, h: targetH, scale } = fluxDims(ext.newWidth, ext.newHeight);

  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = targetW;
  imageCanvas.height = targetH;
  const ctx = imageCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas ekki tiltækt.");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, targetW, targetH);
  const dx = Math.round(ext.offsetX * scale);
  const dy = Math.round(ext.offsetY * scale);
  const dw = Math.round(img.naturalWidth * scale);
  const dh = Math.round(img.naturalHeight * scale);
  ctx.drawImage(img, dx, dy, dw, dh);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = targetW;
  maskCanvas.height = targetH;
  const mctx = maskCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas ekki tiltækt.");
  mctx.fillStyle = "#ffffff";
  mctx.fillRect(0, 0, targetW, targetH);
  mctx.fillStyle = "#000000";
  mctx.fillRect(dx, dy, dw, dh);

  return {
    imageDataUrl: imageCanvas.toDataURL("image/png"),
    maskDataUrl: maskCanvas.toDataURL("image/png"),
    width: targetW,
    height: targetH,
  };
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function outpaintImage(
  settings: UtvikkaSettings,
  sourceImageUrl: string,
): Promise<{ blobs: Blob[]; width: number; height: number }> {
  const built = await buildOutpaintCanvases(sourceImageUrl, settings.direction, settings.amount);
  const res = await fetch("/api/utvikka", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: built.imageDataUrl,
      mask: built.maskDataUrl,
      prompt: settings.prompt,
      steps: settings.steps,
      guidance: settings.guidance,
      numOutputs: settings.numOutputs,
      seed: settings.seed,
      disableSafetyChecker: settings.disableSafetyChecker,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      /* not JSON */
    }
    throw new Error(message || `Útvíkka mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  const blobs = await Promise.all(data.images.map(fetchImageBlob));
  return { blobs, width: built.width, height: built.height };
}
