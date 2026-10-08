/** Föst auðkenni teikningar-eigna (lifandi prófun 07.10.2026 á 1404: hver opnun úttektarborðs hlóð teikningunni upp
 * AFTUR sem tvær nýjar skrár, ~17 MB, í fötuna `turbopaint` — 18 skrár / ~140 MB eftir eina prófun).
 *
 * Orsökin: innflutningur gaf hverri mynd nýtt slembi-auðkenni (newId) — líka þegar SAMA skráin kom aftur af sömu slóð.
 * „Opna í TurboPaint" endurbyggir úttektarborðið við hverja opnun (FloorPlan er sannleikurinn), svo skjámyndin og
 * frumskráin fengu ný auðkenni og pushAssets hlóð þeim upp sem nýjum skrám.
 *
 * Nú ræðst auðkennið af INNIHALDINU: SHA-256 frumskrárinnar (eða inntaks skörpu skönnunarinnar) + gæðastig + síða +
 * útgáfa innflutningsins. Sama teikning → sama auðkenni → sama skrá í fötunni (og í IndexedDB), og pushAssets sér að hún
 * er þegar þar. Gæði og skarpa TIF-leiðin eru óbreytt — aðeins nafnið á skránni er fast.
 *
 * ⚠ Breytist ÚTKOMA innflutningsins (rasterering PDF/TIF, boostSheetCanvas, JPEG-gæði, skörp skönnun) þarf að hækka
 * EIGNA_UTGAFA — annars fengi ný teikning auðkenni gömlu útgáfunnar og tæki gömlu myndina úr fötunni. */

/** Útgáfa innflutningsins í auðkenninu — hækka ef myndin sem innflutningurinn býr til breytist. */
export const EIGNA_UTGAFA = "1";

/** Föst auðkenni: `h` + 32 hex-stafir (skjámynd) eða `f` + 32 (frumskrá). Slembi-auðkenni (newId) byrja á `n`. */
const FAST_ID = /^[hf][0-9a-f]{32}$/;

export function erFastEignarId(id: string | null | undefined): boolean {
  return FAST_ID.test(String(id || ""));
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function subtle(): SubtleCrypto | null {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c && c.subtle ? c.subtle : null;
}

/** SHA-256 (hex) af bætum eða texta; null ef vafrinn býður ekki upp á crypto.subtle (t.d. http án localhost). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string | null> {
  const s = subtle();
  if (!s) return null;
  try {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
    return hex(await s.digest("SHA-256", bytes as BufferSource));
  } catch {
    return null;
  }
}

/** Hash skrár (Blob/File) — null ef ekki hægt (þá fær innflutningurinn slembi-auðkenni eins og áður). */
export async function hashSkrar(skra: Blob): Promise<string | null> {
  try {
    return await sha256Hex(await skra.arrayBuffer());
  } catch {
    return null;
  }
}

/** Auðkenni frumskrár (TIF/PDF óbreytt): ræðst aðeins af bætunum. */
export function frumEignarId(skraHash: string): string {
  return "f" + skraHash.slice(0, 32);
}

/** Lykill skjámyndar úr frumskrá: hash skrárinnar + gæðastig + síða + útgáfa. */
export function skjamyndarLykill(skraHash: string, gaedi: string, sida: number): string {
  return `skjamynd|v${EIGNA_UTGAFA}|${gaedi}|${sida}|${skraHash}`;
}

/** Lykill skarprar skönnunar (TIF-frumrit stillt við JPEG skjalasafnsins): myndin er reiknuð úr slóðinni, gæðastiginu,
 * hliðrunar-fókus (skurði hæðarinnar) og stærð JPEG-sins — sama inntak gefur sömu mynd. */
export function skonnunarLykill(
  slod: string,
  gaedi: string,
  fokus: { x: number; y: number; w: number; h: number } | null | undefined,
  frum: { b: number; h: number }
): string {
  const f = fokus ? [fokus.x, fokus.y, fokus.w, fokus.h].map((n) => Math.round(Number(n) || 0)).join(",") : "-";
  return `skonnun|v${EIGNA_UTGAFA}|${gaedi}|${f}|${frum.b}x${frum.h}|${slod.trim()}`;
}

/** Auðkenni skjámyndar úr lykli (skjamyndarLykill / skonnunarLykill); null ef hash næst ekki. */
export async function eignarIdUrLykli(lykill: string): Promise<string | null> {
  const h = await sha256Hex(lykill);
  return h ? "h" + h.slice(0, 32) : null;
}
