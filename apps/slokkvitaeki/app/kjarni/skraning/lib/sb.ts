import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "@/app/lib/supabase";

/* Supabase-tenging Skráningar: sama verkefni og allt vistkerfið, publishable-lykill
 * (RLS á skr_*-töflunum leyfir select/insert/update, ekkert delete). */
let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export const BUCKET = "skraning";
export const publicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

/** Minnkar ljósmynd úr síma í ≤ maxPx á lengri kant, JPEG. Skilar blob + stærð. */
export async function minnkaMynd(file: File, maxPx = 1600, gaedi = 0.85): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", gaedi));
  return { blob, w, h };
}

export async function hladaUpp(path: string, blob: Blob, contentType: string) {
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}
