/** Local photo-repair server (GFPGAN + Real-ESRGAN + red-eye fix) — same
 * pattern as studio/webui.ts: a server the user runs on their own machine,
 * Kjarni only talks to it over HTTP. */

export const DEFAULT_VIDGERD_URL = "http://127.0.0.1:8787";
export const VIDGERD_URL_KEY = "kjarni_vidgerd_server_url";

export type VidgerdOptions = {
  face: boolean;
  redeye: boolean;
  texture: boolean;
};

export function normalizeVidgerdUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_VIDGERD_URL;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Aðeins http eða https");
    }
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch (err) {
    if (err instanceof Error && err.message === "Aðeins http eða https") throw err;
    throw new Error("Ógild slóð á staðbundna netþjóninn");
  }
}

export function readStoredVidgerdUrl(): string {
  if (typeof window === "undefined") return DEFAULT_VIDGERD_URL;
  return window.localStorage.getItem(VIDGERD_URL_KEY) || DEFAULT_VIDGERD_URL;
}

export async function pingVidgerd(base: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${normalizeVidgerdUrl(base)}/health`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, error: `Netþjónninn svaraði ${res.status}` };
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Náði ekki í staðbundna netþjóninn. Keyrðu server.py (sjá tools/vidgerd-server), svo reyndu aftur.",
    };
  }
}

export async function enhancePhoto(base: string, file: Blob, options: VidgerdOptions): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("face", String(options.face));
  form.append("redeye", String(options.redeye));
  form.append("texture", String(options.texture));

  const res = await fetch(`${normalizeVidgerdUrl(base)}/enhance`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error || text;
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message || `Viðgerð féll (${res.status})`);
  }
  return res.blob();
}
