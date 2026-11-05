/** Dýpt — cjwbw/depth-anything á Replicate (V1, Apache-2.0).
 *
 * Tekur mynd og skilar grátóna dýptarkorti — hvítt = nálægt, svart = fjarlægt.
 * Þrjár stærðir á encoder: vits (hraðast, Apache), vitb, vitl (nákvæmast). */

export const DYPT_ENCODERS = ["vits", "vitb", "vitl"] as const;
export type DyptEncoder = (typeof DYPT_ENCODERS)[number];

export const DYPT_ENCODER_LABELS: Record<DyptEncoder, string> = {
  vits: "Small (hraðast)",
  vitb: "Base (jafnvægi)",
  vitl: "Large (nákvæmast)",
};

export type DyptSettings = {
  encoder: DyptEncoder;
};

export const DEFAULT_DYPT_SETTINGS: DyptSettings = {
  encoder: "vitl",
};

export const DYPT_SETTINGS_KEY = "kjarni_private_dypt_settings";

export function normalizeDyptSettings(
  raw: Partial<DyptSettings> | null | undefined,
): DyptSettings {
  const src = raw ?? {};
  return {
    encoder: DYPT_ENCODERS.includes(src.encoder as DyptEncoder)
      ? (src.encoder as DyptEncoder)
      : DEFAULT_DYPT_SETTINGS.encoder,
  };
}

export function readStoredDyptSettings(): DyptSettings {
  if (typeof window === "undefined") return DEFAULT_DYPT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(DYPT_SETTINGS_KEY);
    if (!raw) return DEFAULT_DYPT_SETTINGS;
    return normalizeDyptSettings(JSON.parse(raw) as Partial<DyptSettings>);
  } catch {
    return DEFAULT_DYPT_SETTINGS;
  }
}

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt mynd af Replicate (${res.status})`);
  return res.blob();
}

export async function generateDepthMap(
  settings: DyptSettings,
  imageDataUrl: string,
): Promise<Blob[]> {
  const res = await fetch("/api/dypt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, encoder: settings.encoder }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      /* not JSON */
    }
    throw new Error(message || `Dýpt mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { images: string[] };
  return Promise.all(data.images.map(fetchImageBlob));
}
