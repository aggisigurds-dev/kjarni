// Skoðunarhamur (Agnar 09.10.2026: „opna teikninguna í hæstu gæðum í TurboPaint … teikningin bara eyðist ef hún er ekki
// vistuð sérstaklega … vill ekki að þetta éti upp pláss þegar einhver er bara að skoða").
//
// Slóðin sem „Greining fasteignar" (451 í Slökkvitæki-appinu) opnar:
//   https://kjarni.vercel.app/kjarni/turbopaint?skoda=<url-kóðuð slóð teikningar>&titill=<url-kóðað heiti>
// `skoda` má vera hrár permalink skjalasafns (…/<skrá>.pdf.info, …/<skrá>.tif.info), bein PDF-slóð kortasjár
// (teikningar.hafnarfjordur.is/data/…pdf, teikningar.gardabaer.is, gagnasja.kopavogur.is) eða sú sama vafin í
// netaföll appsins (/.netlify/functions/teikn-mynd|teikn-pdf|teikn-blad?url=…) — vafningurinn er tekinn utan af.
//
// Í skoðun er borðið AÐEINS í minni vafrans: engin röð í turbopaint_boards, engin upphleðsla í geymsluna, ekkert í
// IndexedDB (hvorki borðið, borðalistinn né myndin). persistence.ts og assets.ts lesa `erSkodun()` og gera ekkert.
// „Vista sem borð" (persistence.vistaSkodunSemBord) er EINA leiðin út úr skoðun sem skrifar — og hún fer sömu leið og
// nýtt borð + innflutningur.
//
// Þessi skrá er laufur: hún má ekki flytja inn store/persistence/assets (assets.ts les hana).

import { create } from "zustand";

export const SKODUN_BREYTA = "skoda";
export const TITILL_BREYTA = "titill";
export const TURBOPAINT_SLOD = "https://kjarni.vercel.app/kjarni/turbopaint";

/** Hýslar skjalasafnanna sem /api/turbopaint/fetch-plan sækir af (sama listi og ALLOWED_HOSTS þar). Aðrar https-slóðir
 * (t.d. upphlaðin mynd í Supabase-geymslunni) eru sóttar beint úr vafranum. */
export const SKJALASAFNS_HYSLAR = [
  "skjalasafn.reykjavik.is",
  "teikningar.hafnarfjordur.is",
  "teikningar.gardabaer.is",
  "gagnasja.kopavogur.is",
];

const NETAFOLL = /\/\.netlify\/functions\/teikn-(mynd|pdf|blad)$/;

/** Tekur netafalls-vafning Slökkvitæki-appsins utan af slóðinni (líka afstæðan) — annars slóðin óbreytt. */
export function afvefjaSlod(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s, "https://slokkvitaeki.netlify.app");
    const inn = u.searchParams.get("url");
    if (NETAFOLL.test(u.pathname) && inn) return afvefjaSlod(inn);
  } catch {
    return "";
  }
  return s;
}

export function erSkjalasafnsSlod(slod: string): boolean {
  try {
    return SKJALASAFNS_HYSLAR.includes(new URL(slod).hostname);
  } catch {
    return false;
  }
}

/** Heiti teikningar úr slóðinni ef `titill` vantar: skráarnafnið án .info / endingar. */
export function heitiUrSlod(slod: string): string {
  try {
    const u = new URL(slod);
    const skra = decodeURIComponent(u.pathname.split("/").pop() || "");
    const hreint = skra.replace(/\.info$/i, "").replace(/\.(pdf|tiff?|png|jpe?g|webp)$/i, "");
    return hreint || "Teikning";
  } catch {
    return "Teikning";
  }
}

export interface SkodunarBeidni {
  /** Hrá slóð teikningarinnar (https, án netafalls-vafnings). */
  slod: string;
  titill: string;
}

/** `?skoda=…&titill=…` → beiðni, eða null ef slóðin er ekki https-slóð á teikningu. */
export function lesaSkodunarBeidni(search: string): SkodunarBeidni | null {
  const q = new URLSearchParams(search);
  const hratt = q.get(SKODUN_BREYTA);
  if (!hratt) return null;
  const slod = afvefjaSlod(hratt);
  if (!/^https:\/\//i.test(slod)) return null;
  const titill = (q.get(TITILL_BREYTA) || "").trim().slice(0, 160) || heitiUrSlod(slod);
  return { slod, titill };
}

/** Slóðin sem takkinn í Slökkvitæki-appinu býr til (sniðmátið, prófað í skodun.test.ts). */
export function skodunarSlod(slod: string, titill?: string, rot = TURBOPAINT_SLOD): string {
  const q = new URLSearchParams();
  q.set(SKODUN_BREYTA, slod);
  if (titill) q.set(TITILL_BREYTA, titill);
  return `${rot}?${q.toString()}`;
}

interface SkodunState {
  virk: boolean;
  titill: string;
  slod: string;
  /** `objects`-fylkið eins og það var þegar teikningin var komin á borðið — til að vita hvort eitthvað hafi verið teiknað. */
  grunnur: unknown;
  /** „Vista sem borð" í gangi. */
  vistar: boolean;
}

export const useSkodun = create<SkodunState>(() => ({ virk: false, titill: "", slod: "", grunnur: null, vistar: false }));

export function erSkodun(): boolean {
  return useSkodun.getState().virk;
}

/** Hefur eitthvað verið teiknað/merkt/fært síðan teikningin kom inn? (Til að vara við áður en skoðun er hent.) */
export function skodunBreytt(objects: unknown): boolean {
  const s = useSkodun.getState();
  return s.virk && s.grunnur !== null && objects !== s.grunnur;
}
