export const SKINS = [
  { id: "ragnarok", label: "Ragnarök", hint: "Bráðið gull · svart stál" },
  /* 15.10.2026 (Agnar): þemun úr hönnunarkerfum fyrirtækjanna í stað Command/Atlas/Pulse/Helix/Vector/Don — skins.css */
  { id: "midakerfi", label: "Miðakerfi", hint: "Miðar á stálplötu · málmhaus" },
  { id: "brunastal", label: "Brunastál", hint: "Stálspjöld · rautt málmmerki" },
  { id: "boss", label: "Big Boss", hint: "Svart stál · rjómapappír · gull" },
  { id: "brunaholf", label: "Brunahólf", hint: "Navy og appelsínugult á mist" },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];
export const SKIN_IDS: SkinId[] = SKINS.map((skin) => skin.id);
/* v2 (24.09.2026): Ragnarök varð sjálfgefið útlit. Nýr lykill svo allir lendi
 * einu sinni á því — eldra val (kjarni_skin) er hunsað; hin útlitin eru enn í röðinni. */
export const SKIN_KEY = "kjarni_skin_v2";
export const DEFAULT_SKIN: SkinId = "ragnarok";

export const TOOLS = [
  { id: "kjarni", label: "Stjórnstöð", href: "/kjarni" },
  { id: "turbopaint", label: "TurboPaint", href: "/kjarni/turbopaint" },
  { id: "artcraft", label: "ArtCraft", href: "/kjarni/artcraft" },
  { id: "skraning", label: "Skráning", href: "/kjarni/skraning" },
  { id: "bord", label: "Borð", href: "/bord" },
  { id: "stjorn", label: "Stjórnborð", href: "/stjorn" },
  { id: "kerfi", label: "Kerfi", href: "/kerfi" },
  { id: "borgarferdir", label: "Borgarferðir", href: "/borgarferdir" },
  { id: "skjalarinn", label: "Skjalarinn", href: "/skjalarinn" },
  { id: "draft", label: "Prufusvæði", href: "/draft" },
  { id: "3dwork", label: "3dwork", href: "/3dwork", ext: true },
  { id: "marks", label: "Marks", href: "/marks", ext: true },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];

export function readSkin(): SkinId {
  if (typeof window === "undefined") return DEFAULT_SKIN;
  const stored = window.localStorage.getItem(SKIN_KEY);
  const fromHtml = document.documentElement.dataset.kjarniSkin;
  if (SKIN_IDS.includes(stored as SkinId)) return stored as SkinId;
  return SKIN_IDS.includes(fromHtml as SkinId) ? (fromHtml as SkinId) : DEFAULT_SKIN;
}
