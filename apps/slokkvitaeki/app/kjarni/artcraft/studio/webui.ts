/** Automatic1111 / Forge / SD.Next compatible local API. Runs on the user's machine. */

export const DEFAULT_WEBUI_URL = "http://127.0.0.1:7860";
export const WEBUI_URL_KEY = "kjarni_private_studio_webui";

export type Txt2ImgInput = {
  prompt: string;
  negativePrompt?: string;
  steps?: number;
  width?: number;
  height?: number;
  cfgScale?: number;
  seed?: number;
};

export type LocalModel = { title: string; model_name: string };

export function normalizeWebuiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_WEBUI_URL;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Aðeins http eða https");
    }
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch (err) {
    if (err instanceof Error && err.message === "Aðeins http eða https") throw err;
    throw new Error("Ógild slóð á staðbundna vefviðmótið");
  }
}

export function readStoredWebuiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_WEBUI_URL;
  return window.localStorage.getItem(WEBUI_URL_KEY) || DEFAULT_WEBUI_URL;
}

async function webuiFetch(base: string, path: string, init?: RequestInit): Promise<Response> {
  const url = `${normalizeWebuiUrl(base)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers || {}) },
  });
  return res;
}

export async function pingWebui(base: string): Promise<{ ok: true; models: LocalModel[] } | { ok: false; error: string }> {
  try {
    const res = await webuiFetch(base, "/sdapi/v1/sd-models");
    if (!res.ok) return { ok: false, error: `Staðbundið API svaraði ${res.status}` };
    const models = (await res.json()) as LocalModel[];
    return { ok: true, models: Array.isArray(models) ? models : [] };
  } catch {
    return {
      ok: false,
      error:
        "Náði ekki í staðbundna líkanið. Keyrðu Automatic1111 / Forge / SD.Next með --api og CORS, svo reyndu aftur.",
    };
  }
}

export async function txt2img(base: string, input: Txt2ImgInput): Promise<string[]> {
  const res = await webuiFetch(base, "/sdapi/v1/txt2img", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      negative_prompt: input.negativePrompt || "",
      steps: input.steps ?? 28,
      width: input.width ?? 768,
      height: input.height ?? 768,
      cfg_scale: input.cfgScale ?? 5,
      seed: input.seed ?? -1,
      sampler_name: "Euler a",
      send_images: true,
      save_images: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `txt2img féll (${res.status})`);
  }
  const data = (await res.json()) as { images?: string[] };
  const images = (data.images || []).filter((x) => typeof x === "string" && x.length > 0);
  if (images.length === 0) throw new Error("Líkanið skilaði engri mynd");
  return images.map((b64) => (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`));
}
