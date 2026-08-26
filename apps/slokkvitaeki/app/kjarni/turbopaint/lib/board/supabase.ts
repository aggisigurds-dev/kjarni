import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Sama Supabase-verkefni og allt vistkerfið (osfdzskyvisifcwyjkuk).
// Publishable-lykillinn er opinber í hönnun (sami lykill liggur í js/config.js
// á slokkvitaeki.netlify.app); env-breytur yfirskrifa ef þær eru settar.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://osfdzskyvisifcwyjkuk.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function assetPublicUrl(assetId: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/turbopaint/${assetId}.png`;
}
