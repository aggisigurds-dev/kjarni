/** Litun — piddnad/ddcolor á Replicate.
 *
 * Dual-decoder colorization — litar svart/hvítt myndir. Classical ML,
 * enginn safety filter, Apache-2.0. Tvær stærðir: large (nákvæmara) og
 * tiny (hraðara). */

export const LITUN_MODEL_SIZES = ["large", "tiny"] as const;
export type LitunModelSize = (typeof LITUN_MODEL_SIZES)[number];

export const LITUN_MODEL_SIZE_LABELS: Record<LitunModelSize, string> = {
  large: "Large (nákvæmara)",
  tiny: "Tiny (hraðara)",
};

export type LitunSettings = {
  modelSize: LitunModelSize;
};

export const DEFAULT_LITUN_SETTINGS: LitunSettings = {
  modelSize: "large",
};

export const LITUN_SETTINGS_KEY = "kjarni_private_litun_settings";

export function normalizeLitunSettings(
  raw: Partial<LitunSettings> | null | undefined,
): LitunSettings {
  const src = raw ?? {};
  return {
    modelSize: LITUN_MODEL_SIZES.includes(src.modelSize as LitunModelSize)
      ? (src.modelSize as LitunModelSize)
      : DEFAULT_LITUN_SETTINGS.modelSize,
  };
}

export function readStoredLitunSettings(): LitunSettings {
  if (typeof window === "undefined") return DEFAULT_LITUN_SETTINGS;
  try {
    const raw = window.localStorage.getItem(LITUN_SETTINGS_KEY);
    if (!raw) return DEFAULT_LITUN_SETTINGS;
    return normalizeLitunSettings(JSON.parse(raw) as Partial<LitunSettings>);
  } catch {
    return DEFAULT_LITUN_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function colorizeImage(
  settings: LitunSettings,
  imageDataUrl: string,
): Promise<Blob[]> {
  const res = await fetch("/api/litun", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, modelSize: settings.modelSize }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      /* not JSON */
    }
    throw new Error(message || `Litun mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
