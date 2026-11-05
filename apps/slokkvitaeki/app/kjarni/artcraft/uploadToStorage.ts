/** Shared upload helper for every ArtCraft tool that sends a photo to a
 * Replicate model. Uploads directly from the browser to Supabase Storage
 * (bypassing our own Vercel API routes entirely — their request body is
 * capped at a hard, non-configurable 4.5MB, see
 * https://vercel.com/docs/errors/function_payload_too_large), then returns
 * a short-lived signed URL that Replicate can fetch the file from.
 *
 * This replaces the old pattern (still present in some tools until they're
 * migrated) of downscaling the photo to ~1000-1800px and base64-encoding it
 * inline in the request JSON just to fit under that limit — which is what
 * was silently capping every tool's output resolution regardless of what
 * the Replicate model itself could do.
 *
 * REST shapes verified directly against @supabase/storage-js's own source
 * (node_modules/@supabase/storage-js — StorageFileApi.ts `upload` and
 * `createSignedUrl`), not guessed: upload is a multipart POST with the
 * blob under field name "", sign is a JSON POST returning a path-relative
 * `signedURL` that must be prefixed with `${SUPABASE_URL}/storage/v1`.
 *
 * Needs an `insert` + `select` RLS policy on storage.objects scoped to
 * each bucket used here (anon role) — these are intentionally NOT public
 * buckets, per this repo's security-first convention (see CLAUDE.md). */

import { SUPABASE_URL, SUPABASE_KEY } from "../../lib/supabase";

export type ReplicateUploadBucket = "reference-images" | "mask-images";

/** Plenty for any Replicate prediction (typically done in under a minute),
 * short enough that the photo isn't reachable indefinitely afterwards. */
const SIGNED_URL_EXPIRY_SECONDS = 3600;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function extensionFor(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4")) return "mp4";
  return "jpg";
}

/** Uploads `blob` to the given bucket and returns a signed URL that any
 * Replicate model input (`image`, `mask`, …) can be pointed at directly. */
export async function uploadForReplicate(blob: Blob, bucket: ReplicateUploadBucket): Promise<string> {
  const path = `${new Date().toISOString().slice(0, 10)}/${randomId()}.${extensionFor(blob)}`;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", blob);
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { ...headers, "x-upsert": "false" },
    body: form,
  });
  if (!uploadRes.ok) {
    throw new Error(`Gat ekki hlaðið mynd upp í geymslu (${uploadRes.status}): ${(await uploadRes.text()).slice(0, 300)}`);
  }

  const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
  });
  if (!signRes.ok) {
    throw new Error(`Gat ekki búið til slóð fyrir myndina (${signRes.status}): ${(await signRes.text()).slice(0, 300)}`);
  }
  const data = (await signRes.json()) as { signedURL: string };
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}
