/** Every Replicate-backed route that takes a client-supplied image/mask URL
 * (instead of inline base64 — see ../../kjarni/artcraft/uploadToStorage.ts)
 * must restrict it to our own Supabase Storage project. Without this, a
 * client could point Replicate's `image`/`mask` input at an arbitrary
 * external URL and run paid predictions on our Replicate account for free
 * — no bytes to transmit, unlike the inline-base64 approach this replaces,
 * which was self-limiting by requiring the sender to actually upload the
 * bytes. */

const ALLOWED_HOST = "osfdzskyvisifcwyjkuk.supabase.co";
const ALLOWED_PATH_PREFIX = "/storage/v1/object/sign/";

export function isOwnStorageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === ALLOWED_HOST && parsed.pathname.startsWith(ALLOWED_PATH_PREFIX);
  } catch {
    return false;
  }
}
