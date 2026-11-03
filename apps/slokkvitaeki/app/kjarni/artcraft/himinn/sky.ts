/** Himinn — settings/presets + client fetch for sky replacement
 * (bria/genfill on Replicate, masked inpaint). Mirrors svidsmynd/scene.ts
 * conventions; unlike Sviðsmynd this DOES need a mask (the user paints the
 * sky region) since genfill has no automatic "find the sky" step. */

export type SkySettings = {
  prompt: string;
  negativePrompt: string;
  seed: number;
};

export const DEFAULT_SKY_SETTINGS: SkySettings = {
  prompt: "",
  negativePrompt: "blurry, distorted, low quality, unrealistic colors",
  seed: -1,
};

export const SKY_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "Sólsetur", prompt: "dramatic golden sunset sky with warm orange and pink clouds" },
  { label: "Heiðskírt blátt", prompt: "clear bright blue sky with a few soft white clouds" },
  { label: "Dramatísk ský", prompt: "dramatic dark storm clouds, moody atmosphere" },
  { label: "Gullin stund", prompt: "soft golden hour sky, warm diffused light, light clouds" },
  { label: "Stjörnubjört nótt", prompt: "starry night sky with visible stars and a soft glow on the horizon" },
];

export function clampSkySeed(n: number): number {
  if (!Number.isFinite(n)) return -1;
  return Math.trunc(n);
}

export function normalizeSkySettings(raw: Partial<SkySettings> | null | undefined): SkySettings {
  const src = raw || {};
  return {
    prompt: typeof src.prompt === "string" ? src.prompt : DEFAULT_SKY_SETTINGS.prompt,
    negativePrompt:
      typeof src.negativePrompt === "string" ? src.negativePrompt : DEFAULT_SKY_SETTINGS.negativePrompt,
    seed: clampSkySeed(src.seed ?? DEFAULT_SKY_SETTINGS.seed),
  };
}

export const SKY_SETTINGS_KEY = "kjarni_private_himinn_settings";

export function readStoredSkySettings(): SkySettings {
  if (typeof window === "undefined") return DEFAULT_SKY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SKY_SETTINGS_KEY);
    return raw ? normalizeSkySettings(JSON.parse(raw) as Partial<SkySettings>) : DEFAULT_SKY_SETTINGS;
  } catch {
    return DEFAULT_SKY_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function generateSky(
  settings: SkySettings,
  photo: { imageDataUrl: string; maskDataUrl: string },
): Promise<Blob[]> {
  if (!settings.prompt.trim()) throw new Error("Lýstu himninum fyrst, eða veldu forstillingu.");
  const res = await fetch("/api/himinn/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: settings.prompt,
      negativePrompt: settings.negativePrompt,
      seed: settings.seed,
      imageDataUrl: photo.imageDataUrl,
      maskDataUrl: photo.maskDataUrl,
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
    throw new Error(message || `Himinn mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
