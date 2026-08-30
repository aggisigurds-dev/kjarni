/** Supabase Storage duplicate responses. HTTP is often 400 while the body is 409. */
export function isDuplicateStorageError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as {
    message?: unknown;
    error?: unknown;
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
  };
  const status = Number(rec.statusCode ?? rec.status ?? 0);
  if (status === 409) return true;
  const blob = [rec.message, rec.error, rec.code]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return (
    blob.includes("exist") ||
    blob.includes("duplicate") ||
    blob.includes("already") ||
    blob.includes("keyalreadyexists")
  );
}
