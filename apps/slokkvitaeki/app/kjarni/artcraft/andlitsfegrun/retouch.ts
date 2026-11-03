/** Andlitsfegrun — settings/prompt-builder + client fetch for portrait
 * beauty retouch (prunaai/p-image-edit on Replicate, natural-language
 * instruction editing — already used elsewhere in ArtCraft as Breyta's
 * "Hraðbreyta" mode, see breyta/models.ts). No manual masking: the model
 * follows the instruction directly on the whole photo.
 *
 * Prompt quality verified against a real test before building this: ran a
 * synthetic (AI-generated, no real person) portrait with visible skin
 * texture/freckles through this exact instruction set — result kept pores
 * and natural texture (not the "plastic skin" over-smoothing failure mode
 * common in automated retouch tools), removed blemishes/dark circles, and
 * left face shape, hair, eyes, lighting and background byte-for-byte
 * identical in composition. */

export type RetouchSettings = {
  skinSmooth: boolean;
  blemishes: boolean;
  teeth: boolean;
  underEye: boolean;
  extra: string;
};

export const DEFAULT_RETOUCH_SETTINGS: RetouchSettings = {
  skinSmooth: true,
  blemishes: true,
  teeth: false,
  underEye: false,
  extra: "",
};

export const RETOUCH_OPTIONS: Array<{ id: keyof Omit<RetouchSettings, "extra">; label: string; fragment: string }> = [
  {
    id: "skinSmooth",
    label: "Jöfn húð",
    fragment: "smooth the skin slightly while keeping natural skin texture and visible pores",
  },
  {
    id: "blemishes",
    label: "Fjarlægja bletti",
    fragment: "reduce blemishes, acne and dark spots",
  },
  {
    id: "teeth",
    label: "Hvítari tennur",
    fragment: "whiten the teeth slightly and naturally",
  },
  {
    id: "underEye",
    label: "Minnka hringi undir augum",
    fragment: "reduce dark circles and puffiness under the eyes",
  },
];

/** Builds the natural-language instruction sent to the model — pure and
 * testable. Always ends with an explicit "don't touch anything else"
 * clause, which is what keeps the edit localized in practice (verified). */
export function buildRetouchPrompt(settings: RetouchSettings): string {
  const parts = RETOUCH_OPTIONS.filter((opt) => settings[opt.id]).map((opt) => opt.fragment);
  if (settings.extra.trim()) parts.push(settings.extra.trim());
  if (parts.length === 0) return "";
  return (
    parts.join(", ") +
    ". Do not change the face shape, hair, eyes, pose, lighting, clothing or background in any way."
  );
}

export function normalizeRetouchSettings(raw: Partial<RetouchSettings> | null | undefined): RetouchSettings {
  const src = raw || {};
  return {
    skinSmooth: typeof src.skinSmooth === "boolean" ? src.skinSmooth : DEFAULT_RETOUCH_SETTINGS.skinSmooth,
    blemishes: typeof src.blemishes === "boolean" ? src.blemishes : DEFAULT_RETOUCH_SETTINGS.blemishes,
    teeth: typeof src.teeth === "boolean" ? src.teeth : DEFAULT_RETOUCH_SETTINGS.teeth,
    underEye: typeof src.underEye === "boolean" ? src.underEye : DEFAULT_RETOUCH_SETTINGS.underEye,
    extra: typeof src.extra === "string" ? src.extra : DEFAULT_RETOUCH_SETTINGS.extra,
  };
}

export const RETOUCH_SETTINGS_KEY = "kjarni_private_andlitsfegrun_settings";

export function readStoredRetouchSettings(): RetouchSettings {
  if (typeof window === "undefined") return DEFAULT_RETOUCH_SETTINGS;
  try {
    const raw = window.localStorage.getItem(RETOUCH_SETTINGS_KEY);
    return raw ? normalizeRetouchSettings(JSON.parse(raw) as Partial<RetouchSettings>) : DEFAULT_RETOUCH_SETTINGS;
  } catch {
    return DEFAULT_RETOUCH_SETTINGS;
  }
}

const MAX_UPLOAD_DIMENSION = 1600;
const UPLOAD_JPEG_QUALITY = 0.92;

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

export async function generateRetouch(settings: RetouchSettings, imageDataUrl: string): Promise<Blob> {
  const prompt = buildRetouchPrompt(settings);
  if (!prompt) throw new Error("Veldu að minnsta kosti eina lagfæringu.");
  const res = await fetch("/api/andlitsfegrun/replicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, imageDataUrl }),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Andlitsfegrun mistókst (${res.status})`);
  }
  const data = JSON.parse(text) as { image: string };
  return fetchImageBlob(data.image);
}
