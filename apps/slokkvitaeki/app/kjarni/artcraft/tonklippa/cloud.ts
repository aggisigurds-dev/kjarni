/** Skýjageymsla Tónklippu í Supabase Storage (bucket „tonklippa“).
 *
 *  Engin innskráning: appið býr til langan leynilykil og sendir hann í hausnum
 *  x-tk-key. Skrárnar liggja í möppu sem heitir sha256(lykill) og reglurnar í
 *  gagnagrunninum (apps/database/supabase/schemas/tonklippa.sql) hleypa aðeins
 *  þeim að sem senda lykilinn sem mappan er reiknuð úr. */

import { SUPABASE_KEY, SUPABASE_URL } from "../../../lib/supabase";

const BUCKET = "tonklippa";
const BASE = `${SUPABASE_URL}/storage/v1`;

export const KEY_PATTERN = /^[0-9a-f]{64}$/;

export function newLockerKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const folders = new Map<string, Promise<string>>();

/** Mappan sem lykillinn opnar: sha256(lykill) í hex. */
export function lockerFolder(key: string): Promise<string> {
  let f = folders.get(key);
  if (!f) {
    f = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(key))
      .then((buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(""));
    folders.set(key, f);
  }
  return f;
}

export const projectPath = (projectId: string) => `p/${projectId}.json`;
export const trackPath = (projectId: string, trackId: string) => `t/${projectId}/${trackId}`;

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "x-tk-key": key, ...extra };
}

async function fail(res: Response, what: string): Promise<never> {
  const detail = await res.text().catch(() => "");
  throw new Error(`${what} (${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""})`);
}

export type CloudEntry = { name: string; updatedAt: number; size: number };

/** Skrár beint undir `dir` í skúffunni (t.d. "p" eða "t/<rútína>"). */
export async function cloudList(key: string, dir: string): Promise<CloudEntry[]> {
  const folder = await lockerFolder(key);
  const out: CloudEntry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${BASE}/object/list/${BUCKET}`, {
      method: "POST",
      headers: headers(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: `${folder}/${dir}`, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      cache: "no-store",
    });
    if (!res.ok) await fail(res, "Gat ekki lesið skýið");
    const rows = (await res.json()) as Array<{ name: string; id: string | null; updated_at?: string; metadata?: { size?: number } | null }>;
    for (const r of rows) {
      if (!r.id) continue; // undirmappa
      out.push({ name: r.name, updatedAt: r.updated_at ? Date.parse(r.updated_at) : 0, size: r.metadata?.size ?? 0 });
    }
    if (rows.length < 1000) break;
  }
  return out;
}

async function put(key: string, path: string, body: BodyInit, contentType: string): Promise<void> {
  const folder = await lockerFolder(key);
  const res = await fetch(`${BASE}/object/${BUCKET}/${folder}/${path}`, {
    method: "POST",
    headers: headers(key, { "Content-Type": contentType, "x-upsert": "true", "cache-control": "max-age=0" }),
    body,
  });
  if (!res.ok) await fail(res, "Gat ekki vistað í skýið");
}

async function get(key: string, path: string): Promise<Response | null> {
  const folder = await lockerFolder(key);
  const res = await fetch(`${BASE}/object/authenticated/${BUCKET}/${folder}/${path}`, { headers: headers(key), cache: "no-store" });
  // Supabase svarar 400 (ekki 404) þegar skráin er ekki til eða ekki sýnileg.
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) await fail(res, "Gat ekki sótt úr skýinu");
  return res;
}

export function cloudPutJson(key: string, path: string, value: unknown): Promise<void> {
  return put(key, path, JSON.stringify(value), "application/json");
}

export async function cloudGetJson<T>(key: string, path: string): Promise<T | null> {
  const res = await get(key, path);
  return res ? ((await res.json()) as T) : null;
}

export function cloudPutBlob(key: string, path: string, blob: Blob): Promise<void> {
  // Bara leyfðar tegundir komast inn; allt annað fer sem hlutlaus bætastraumur.
  const type = /^(audio\/|video\/(mp4|quicktime)$)/.test(blob.type) ? blob.type : "application/octet-stream";
  return put(key, path, blob, type);
}

export async function cloudGetBlob(key: string, path: string): Promise<Blob | null> {
  const res = await get(key, path);
  return res ? res.blob() : null;
}

export async function cloudDelete(key: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const folder = await lockerFolder(key);
  const res = await fetch(`${BASE}/object/${BUCKET}`, {
    method: "DELETE",
    headers: headers(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: paths.map((p) => `${folder}/${p}`) }),
  });
  if (!res.ok) await fail(res, "Gat ekki eytt úr skýinu");
}
