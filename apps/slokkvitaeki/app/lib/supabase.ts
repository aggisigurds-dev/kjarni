// Thin PostgREST client for the current Supabase project.
// The publishable key is public by design (same key the app ships to the browser).
export const SUPABASE_URL = "https://osfdzskyvisifcwyjkuk.supabase.co";
export const SUPABASE_KEY = "sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

export async function sbInsert(table: string, row: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function sbSelect<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function sbRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
