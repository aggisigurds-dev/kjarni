/** Sviðsmynd — settings/clamp/normalize + client fetch for the AI-backdrop
 * generator (bria/generate-background on Replicate). Mirrors the
 * conventions already used by skyjastudio/sdxl.ts and breyta/models.ts.
 * No manual masking needed — the model finds the subject on its own. */

export type SceneSettings = {
  prompt: string;
  negativePrompt: string;
  seed: number;
};

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  prompt: "",
  negativePrompt: "blurry, distorted, low quality, deformed, extra objects",
  seed: -1,
};

/** Quick-pick starting points for the prompt — common product-photography
 * backdrops, same idea as Photoroom's preset scene categories but just
 * canned prompt text here, nothing more. */
export const SCENE_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "Hvítt stúdíó", prompt: "clean white studio background, soft even lighting, subtle shadow" },
  { label: "Marmaraborð", prompt: "product on a white marble countertop, soft studio lighting" },
  { label: "Viður úti", prompt: "product on a wooden outdoor table, natural sunlight, soft shadows" },
  { label: "Steinflöt", prompt: "product on a textured grey stone surface, dramatic side lighting" },
  { label: "Vinnustofa", prompt: "product on a rustic wooden workshop table, warm ambient light, blurred background" },
];

export function clampSceneSeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function normalizeSceneSettings(raw: Partial<SceneSettings> | null | undefined): SceneSettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_SCENE_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_SCENE_SETTINGS.negativePrompt,
    seed: clampSceneSeed(src.seed ?? DEFAULT_SCENE_SETTINGS.seed),
  };
}

export const SCENE_SETTINGS_KEY = "kjarni_private_svidsmynd_settings";

export function readStoredSceneSettings(): SceneSettings {
  if (typeof window === "undefined") return DEFAULT_SCENE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SCENE_SETTINGS_KEY);
    return raw ? normalizeSceneSettings(JSON.parse(raw) as Partial<SceneSettings>) : DEFAULT_SCENE_SETTINGS;
  } catch {
    return DEFAULT_SCENE_SETTINGS;
  }
}

const MAX_UPLOAD_DIMENSION = 1800;
const UPLOAD_JPEG_QUALITY = 0.9;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = src;
  });
}

export async function toResizedDataUrl(source: Blob | string): Promise<string> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const img = await loadImage(url);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > MAX_UPLOAD_DIMENSION ? MAX_UPLOAD_DIMENSION / longest : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki teiknað á striga");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", UPLOAD_JPEG_QUALITY);
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function generateScene(settings: SceneSettings, imageDataUrl: string): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Lýstu umhverfinu fyrst.");
  const res = await fetch("/api/svidsmynd/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: settings.prompt,
      negativePrompt: settings.negativePrompt,
      seed: settings.seed,
      imageDataUrl,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Sviðsmynd mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  // Server returns Replicate's own delivery URLs directly — same reasoning
  // as every other Replicate-backed ArtCraft tool, see e.g. skyjastudio/sdxl.ts.
  return Promise.all(data.images.map(fetchImageBlob));
}
