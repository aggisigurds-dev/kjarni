/** Merkjalestur á skrifstofutölvunni (luna-bridge merki-ocr, Agnar 11.10.2026 — DRA ehf).
 *
 * „HSL" (handslökkvitæki) stendur oft upp á rönd við veggina og í ramma; tesseract vafrans les það ekki, en RapidOCR
 * skrifstofutölvunnar les það (mælt á teikningu DRA: bæði merkin, 74 % / 71 %). „SLT / HSL / BRSL af teikningu" sendir
 * því PNG-mynd borðsins á brúna samhliða eigin lestri og bætir orðum hennar við. Orðin koma í dílum myndarinnar (sama
 * snið og OcrWord). Náist ekki í brúna (enginn svarar, myndin ekki í geymslu, villa) skilar fallið null og tesseract
 * stendur einn eins og áður. */
import type { OcrWord } from "./firewall-rating";
import { assetPublicUrl, getSupabase } from "./supabase";

const BID_MS = 3000;
const THAK_MS = 6 * 60 * 1000;

export async function merkiUrBru(
  assetId: string,
  onStada?: (texti: string) => void,
  stodva?: () => boolean
): Promise<{ ord: OcrWord[]; b: number; h: number } | null> {
  const sb = getSupabase();
  if (!sb || !assetId) return null;
  const ins = await sb
    .from("automation_triggers")
    .insert({ workflow: "merki-ocr", status: "bida", requested_by: "turbopaint", gogn: { mynd: assetPublicUrl(assetId) } })
    .select("id");
  const id = ins.data?.[0]?.id as number | undefined;
  if (ins.error || !id) return null;
  const t0 = Date.now();
  while (Date.now() - t0 < THAK_MS) {
    if (stodva?.()) return null;
    await new Promise((r) => setTimeout(r, BID_MS));
    const r = await sb.from("automation_triggers").select("status,result").eq("id", id).limit(1);
    const row = r.data?.[0] as { status?: string; result?: string | null } | undefined;
    if (!row) continue;
    if (row.status === "done") {
      try {
        const j = JSON.parse(String(row.result || "{}")) as { ord?: OcrWord[]; b?: number; h?: number };
        return { ord: Array.isArray(j.ord) ? j.ord : [], b: Number(j.b) || 0, h: Number(j.h) || 0 };
      } catch {
        return null;
      }
    }
    if (row.status === "error") return null;
    if (row.status === "running" && row.result) onStada?.(String(row.result));
    else if (row.status === "bida" || row.status === "pending") onStada?.("Bíð eftir skrifstofutölvunni…");
  }
  return null;
}

/** Orð brúarinnar í dílum TurboPaint-myndarinnar (srcW × srcH) — ef PNG-ið í geymslunni er í annarri stærð. */
export function iMyndardila(bru: { ord: OcrWord[]; b: number; h: number }, srcW: number, srcH: number): OcrWord[] {
  const sx = bru.b > 0 ? srcW / bru.b : 1, sy = bru.h > 0 ? srcH / bru.h : 1;
  if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3) return bru.ord;
  return bru.ord.map((w) => ({ ...w, x: w.x * sx, y: w.y * sy, width: w.width * sx, height: w.height * sy }));
}
