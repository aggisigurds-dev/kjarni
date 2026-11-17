/** Greining fasteignar + teikningasafn fasteignarinnar úr TurboPaint (Agnar 17.11.2026: „Á nýju forsíðuna á TurboPaint,
 * geturðu líka bætt við Greining fasteigna takkanum svo það opnist sama viðbót og að maður geti séð upplýsingar um
 * fasteignina og sett í djúpgreiningu … og þá t.d. kannski vista á fasteign").
 *
 * - Greining fasteignar er viðbót Slökkvitæki-appsins (js/patches/451-greining-fasteignar.js, slóðin
 *   `#greining/<heimilisfang | landnúmer | kennitala>`): samantekt, byggingarupplýsingar, „Lesa skjölin" (OCR —
 *   djúpgreiningin) og teikningasafnið. Appið leyfir ekki ramma utan síns léns (frame-ancestors), svo hún opnast í nýjum
 *   flipa með lóðina valda.
 * - „Vista á fasteign" = sama tafla og „Vista í safn" í Greiningu fasteignar: `fasteign_teikningasafn` (lykluð á
 *   LANDNÚMER, frjálst svæðisheiti, aldrei eytt — „Fjarlægja" setur fjarlaegt_at). RLS leyfir insert með landnr > 0 og
 *   slóð; einkvæmt (landnr, svæði, slóð) meðan ekki fjarlægt. Ótengt Teikningu, 3D og úttekt — teikning_bord er ósnert. */

import { getSupabase } from "./supabase";
import { SLOKKVITAEKI_ROT } from "./teikn-thjonusta";

export const SAFN_TAFLA = "fasteign_teikningasafn";

/** Slóð Greiningar fasteignar í Slökkvitæki-appinu. Landnúmer er ótvírætt (sama götuheiti er til í fleiri bæjum). */
export function greiningSlod(arg?: string | number | null, rot = SLOKKVITAEKI_ROT): string {
  const a = arg == null ? "" : String(arg).trim();
  return `${rot}/#greining${a ? "/" + encodeURIComponent(a) : ""}`;
}

/** Tillögur að svæði: þau sem þegar eru í safni lóðarinnar fyrst, svo „Allt húsið" og algengar hæðir. */
export function svaediTillogur(iSafni: (string | null | undefined)[]): string[] {
  const ut: string[] = [];
  for (const s of iSafni) {
    const t = String(s || "").trim();
    if (t && !ut.includes(t)) ut.push(t);
  }
  for (const t of ["Allt húsið", "Kjallari", "1. hæð", "2. hæð", "3. hæð", "Ris"]) if (!ut.includes(t)) ut.push(t);
  return ut;
}

/** Svæðisheiti eins og Greining fasteignar geymir það: eitt bil, mest 120 stafir. */
export function hreinsaSvaedi(s: string): string {
  return String(s || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

export type SafnRod = { id: number; svaedi: string; slod: string; titill: string | null };

/** Blöð sem eru í safni lóðarinnar (ekki fjarlægð). */
export async function saekjaSafn(landnr: number): Promise<SafnRod[]> {
  const sb = getSupabase();
  if (!sb || !(landnr > 0)) return [];
  const r = await sb.from(SAFN_TAFLA).select("id,svaedi,slod,titill").eq("landnr", landnr).is("fjarlaegt_at", null).order("created_at", { ascending: true });
  if (r.error) throw new Error(r.error.message);
  return (r.data as SafnRod[] | null) ?? [];
}

/** Blað sem fer í safnið (sömu reitir og „Vista í safn" í Greiningu fasteignar). */
export type SafnBlad = {
  slod: string;
  titill: string | null;
  undir?: string | null;
  mynd?: string | null;
  stor?: string | null;
  tegund?: string | null;
  dags?: string | null;
};

/** Vistar blöðin á lóðina undir svæðinu. Blað sem er þegar á sama svæði telst „þegar inni" (einkvæmi töflunnar), ekki villa. */
export async function vistaISafn(
  landnr: number,
  heimilisfang: string | null,
  svaedi: string,
  athugasemd: string | null,
  blod: SafnBlad[]
): Promise<{ vistad: number; thegarInni: number; villur: string[] }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Engin tenging við gagnagrunn");
  if (!(landnr > 0)) throw new Error("Lóðin (landnúmer) er óþekkt — ekkert vistað.");
  const sv = hreinsaSvaedi(svaedi);
  let vistad = 0, thegarInni = 0;
  const villur: string[] = [];
  for (const b of blod) {
    if (!b.slod) continue;
    const r = await sb
      .from(SAFN_TAFLA)
      .insert({
        landnr,
        svaedi: sv,
        slod: b.slod,
        titill: b.titill || null,
        undir: b.undir || null,
        mynd: b.mynd || null,
        stor: b.stor || null,
        tegund: b.tegund || null,
        dags: b.dags || null,
        athugasemd: athugasemd?.trim() ? athugasemd.trim().slice(0, 300) : null,
        heimilisfang: heimilisfang || null,
        vistad_af: "TurboPaint",
      })
      .select("id");
    if (r.error) {
      if (r.error.code === "23505") thegarInni++;
      else villur.push(`${b.titill || "Blað"}: ${r.error.message}`);
      continue;
    }
    if (!r.data || !r.data.length) villur.push(`${b.titill || "Blað"}: ekkert var skrifað (aðgangi hafnað?)`);
    else vistad++;
  }
  return { vistad, thegarInni, villur };
}
